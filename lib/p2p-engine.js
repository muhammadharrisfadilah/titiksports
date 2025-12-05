/**
 * P2P Engine untuk streaming video peer-to-peer
 * Menggunakan WebRTC Data Channel untuk komunikasi P2P
 */

const P2P_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
};

class P2PEngine {
  constructor() {
    this.peers = new Map();
    this.dataChannels = new Map();
    this.localStream = null;
    this.signalingServer = null;
    this._pollInterval = null;
    this._signalingRoom = null;
    this._selfId = null;
    this._pollBackoffAttempts = 0;
    this._pollIntervalMs = 1000; // base interval
    this._pollTimerId = null;
    this._lastSignalSentAt = 0;
    // utilities to be optionally injected (kept lazy require to avoid server issues)
    this._offerBackoff = null;
    this.emitter = null;
    this._autoInitiate = false;
    // telemetry counters
    this._telemetry = {
      polls: 0,
      signalsSent: 0,
      offersSent: 0,
      offerFailures: 0,
    };
    // batching queue for signaling messages
    this._signalQueue = [];
    this._batchTimer = null;
    this._batchIntervalMs = 250; // flush every 250ms
  }

  /**
   * Initialize P2P engine dengan signaling server
   */
  async init(signalingServerUrl, opts = {}) {
    try {
      // If signalingServerUrl is HTTP(S) we use polling against a REST signaling endpoint
      const parsedUrl = new URL(signalingServerUrl, typeof window !== 'undefined' ? window.location.origin : undefined);
      const protocol = parsedUrl.protocol.replace(':','');

      if (protocol === 'http' || protocol === 'https') {
        // Expect query params: room and self
        this._signalingRoom = parsedUrl.searchParams.get('room') || 'default';
        this._selfId = parsedUrl.searchParams.get('self') || `peer_${Math.random().toString(36).slice(2,8)}`;
        const base = `${parsedUrl.origin}${parsedUrl.pathname}`;

        // start adaptive polling loop (wrapped with safeAsync and rate-limited logging)
        const startPolling = () => {
          if (this._pollTimerId) clearInterval(this._pollTimerId);
          this._pollTimerId = setInterval(() => {
            safeAsync(async () => {
              try {
                try { this._telemetry.polls = (this._telemetry.polls || 0) + 1; } catch(_){}
                const res = await fetch(`${base}?room_id=${encodeURIComponent(this._signalingRoom)}&peer=${encodeURIComponent(this._selfId)}`);
                if (!res.ok) {
                  // increase backoff on server errors
                  this._pollBackoffAttempts++;
                  rateLimitedLogger.warn('p2p-poll-http-error', 'Polling returned non-ok status', { status: res.status, attempt: this._pollBackoffAttempts });
                  adjustPollingBackoff.call(this);
                  return;
                }
                const json = await res.json();
                // if no data, increase backoff to reduce server load
                if (!json || !json.data || json.data.length === 0) {
                  this._pollBackoffAttempts++;
                  adjustPollingBackoff.call(this);
                  return;
                }

                // we got data -> reset backoff
                this._pollBackoffAttempts = 0;
                adjustPollingBackoff.call(this, true);

                for (const sig of json.data) {
                  try {
                    const message = {
                      type: sig.type,
                      peerId: sig.from_peer,
                      data: sig.payload
                    };
                    this.handleSignalingMessage(message);
                    // delete processed signal
                    try {
                      await fetch(`${base}?id=${encodeURIComponent(sig.id)}`, { method: 'DELETE' });
                    } catch (delErr) {
                      rateLimitedLogger.warn('p2p-delete-signal-failed', 'Failed deleting processed signal', { err: delErr?.message || String(delErr), sigId: sig?.id });
                    }
                  } catch (e) {
                    rateLimitedLogger.error('p2p-process-signal', 'Error processing signal', { error: e?.message || String(e), sigId: sig?.id });
                    handleP2PError(e, { sig });
                  }
                }
              } catch (err) {
                this._pollBackoffAttempts++;
                rateLimitedLogger.error('p2p-poll-failed', 'P2P polling failed', { error: err?.message || String(err), attempt: this._pollBackoffAttempts });
                adjustPollingBackoff.call(this);
              }
            }, 'p2p-poll');
          }, this._pollIntervalMs + Math.floor(Math.random() * 300));
        };

        // adjustPollingBackoff helper
        const adjustPollingBackoff = (reset = false) => {
          if (reset) {
            this._pollIntervalMs = 1000;
            if (this._pollTimerId) {
              clearInterval(this._pollTimerId);
              this._pollTimerId = null;
            }
            startPolling();
            return;
          }

          // exponential backoff with cap
          const maxMs = 30000;
        // if autoInitiate option provided, initialize utilities (dynamic import)
        if (opts && opts.autoInitiate) {
          import('./p2p-utils.js')
            .then(({ OfferBackoffManager, SimpleEmitter }) => {
              try {
                this._offerBackoff = new OfferBackoffManager();
                this.emitter = new SimpleEmitter();
                this._autoInitiate = true;
              } catch (e) {
                console.warn('Failed to initialize p2p-utils instance:', e?.message || e);
              }
            })
            .catch((e) => {
              console.warn('Failed to initialize p2p-utils (import):', e?.message || e);
            });
        }
          const base = 1000;
          const attempts = Math.min(this._pollBackoffAttempts, 8);
          const next = Math.min(maxMs, base * (2 ** attempts));
          // add small jitter to avoid thundering herd
          const jitter = Math.floor(Math.random() * 500);
          this._pollIntervalMs = next + jitter;
          if (this._pollTimerId) {
            clearInterval(this._pollTimerId);
            this._pollTimerId = null;
          }
          startPolling();
        };

        // start initial polling
        this._pollBackoffAttempts = 0;
        this._pollIntervalMs = 1000;
        startPolling();

        this.signalingServer = { mode: 'poll', baseUrl: parsedUrl.origin + parsedUrl.pathname };

        console.log('P2P Engine initialized (polling mode)', { room: this._signalingRoom, self: this._selfId });
        return;
      }

      this.signalingServer = new WebSocket(signalingServerUrl);

        this.signalingServer.onmessage = (event) => {
          safeAsync(async () => {
            const parsed = JSON.parse(event.data);
            this.handleSignalingMessage(parsed);
          }, 'p2p-ws-message')
          .catch(e => {
            rateLimitedLogger.warn('p2p-invalid-message', 'Invalid signaling message', { error: e?.message || String(e) });
          });
        };

      this.signalingServer.onerror = (error) => {
        rateLimitedLogger.error('p2p-ws-error', 'Signaling WebSocket error', { error: error?.message || String(error) });
        handleP2PError(error, { context: 'websocket' });
      };

      this.signalingServer.onclose = async (ev) => {
        console.warn('Signaling connection closed:', ev && ev.reason);
        // simple reconnect with exponential backoff
        let attempt = 0;
        while (attempt < 6 && (!this.signalingServer || this.signalingServer.readyState !== WebSocket.OPEN)) {
          const wait = Math.min(1000 * (2 ** attempt), 30000);
          await new Promise(r => setTimeout(r, wait));
          try {
            // re-init will set up new handlers
            await this.init(signalingServerUrl);
            break;
          } catch (err) {
            attempt++;
          }
        }
      };

      console.log('P2P Engine initialized');
    } catch (error) {
      console.error('P2P Engine init error:', error);
    }
  }

  /**
   * Create WebRTC peer connection
   */
  async createPeerConnection(peerId) {
    try {
      const peerConnection = new RTCPeerConnection(P2P_CONFIG);

      // Handle ICE candidates
      peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          this.sendSignalingMessage({
            type: 'ice-candidate',
            peerId,
            candidate: event.candidate,
          });
        }
      };

      // Handle connection state changes
      peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        console.log(`Peer ${peerId} connection state:`, state);

        if (state === 'connected' || state === 'completed') {
          if (this.emitter) this.emitter.emit('peerconnected', { peerId, state });
        }

        if (state === 'failed' || state === 'disconnected' || state === 'closed') {
          if (this.emitter) this.emitter.emit('peerdisconnected', { peerId, state });
          this.removePeer(peerId);
        }
      };

      // Handle data channel
      peerConnection.ondatachannel = (event) => {
        this.setupDataChannel(peerId, event.channel);
      };

      // Handle remote media tracks
      peerConnection.ontrack = (event) => {
        try {
          console.log(`Remote track received from ${peerId}`);
          const [stream] = event.streams || [];
          if (stream) {
            peerConnection._remoteStream = stream;
          }
        } catch (e) {
          console.warn('ontrack handler error:', e.message);
        }
      };

      this.peers.set(peerId, peerConnection);

      // If we have a local stream, add its tracks so remote peer can receive media
      try {
        if (this.localStream && this.localStream.getTracks) {
          this.localStream.getTracks().forEach((t) => {
            try { peerConnection.addTrack(t, this.localStream); } catch (e) { /* ignore */ }
          });
        }
      } catch (e) {
        console.warn('Error adding local stream tracks to peer connection:', e?.message || e);
      }

      return peerConnection;
    } catch (error) {
      console.error('Create peer connection error:', error);
      return null;
    }
  }

  /**
   * Initiate connection to a peer (create data channel + offer)
   */
  async initiateConnection(peerId) {
    try {
      // create or reuse peer connection
      let pc = this.peers.get(peerId);
      if (!pc) pc = await this.createPeerConnection(peerId);
      if (!pc) throw new Error('Failed to create peer connection');

      // create data channel as initiator (if not already present)
      let channel = this.dataChannels.get(peerId);
      if (!channel || channel.readyState === 'closed') {
        try {
          channel = pc.createDataChannel('p2p');
          this.setupDataChannel(peerId, channel);
        } catch (e) {
          // ignore if createDataChannel not allowed
        }
      }

      // create offer and send via signaling (respect offer backoff manager if present)
      if (this._offerBackoff && !this._offerBackoff.canAttempt(peerId)) {
        // emit event for blocked attempts
        if (this.emitter) this.emitter.emit('offer-blocked', { peerId });
        return;
      }

      const attemptResult = await safeAsync(async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        this.sendSignalingMessage({
          type: 'offer',
          peerId,
          data: { offer: pc.localDescription },
        });
        return { success: true };
      }, 'p2p-initiate-' + peerId);

      if (!attemptResult || attemptResult.success === false) {
        if (this._offerBackoff) this._offerBackoff.recordFailure(peerId);
        try { this._telemetry.offerFailures = (this._telemetry.offerFailures || 0) + 1; } catch(_){}
        if (this.emitter) this.emitter.emit('offer-failed', { peerId, info: attemptResult });
      } else {
        try { this._telemetry.offersSent = (this._telemetry.offersSent || 0) + 1; } catch(_){}
        if (this._offerBackoff) this._offerBackoff.reset(peerId);
        if (this.emitter) this.emitter.emit('offer-sent', { peerId });
      }
    } catch (error) {
      handleP2PError(error, { context: 'initiateConnection', peerId });
    }
  }

  /**
   * Set local media stream to be sent to peers
   */
  setLocalStream(stream) {
    this.localStream = stream;
    try {
      if (stream && stream.getTracks) {
        this.peers.forEach((pc) => {
          try {
            stream.getTracks().forEach((t) => pc.addTrack(t, stream));
          } catch (e) {
            // ignore per-peer addTrack errors
          }
        });
      }
    } catch (e) {
      console.warn('setLocalStream error:', e?.message || e);
    }
  }

  /**
   * Setup data channel untuk komunikasi
   */
  setupDataChannel(peerId, dataChannel) {
    dataChannel.onopen = () => {
      console.log(`Data channel opened with peer ${peerId}`);
      if (this.emitter) this.emitter.emit('datachannel-open', { peerId });
    };

    dataChannel.onmessage = (event) => {
      // Try to parse JSON payloads, otherwise pass raw data
      try {
        const parsed = JSON.parse(event.data);
        console.log(`Message from ${peerId}:`, parsed);
        if (this.emitter) this.emitter.emit('datamessage', { peerId, message: parsed });
      } catch (e) {
        console.log(`Message from ${peerId}:`, event.data);
        if (this.emitter) this.emitter.emit('datamessage', { peerId, message: event.data });
      }
    };

    dataChannel.onerror = (error) => {
      console.error(`Data channel error with ${peerId}:`, error);
    };

    dataChannel.onclose = () => {
      console.log(`Data channel closed with peer ${peerId}`);
      if (this.emitter) this.emitter.emit('datachannel-close', { peerId });
    };

    this.dataChannels.set(peerId, dataChannel);
  }

  /**
   * Send message via data channel
   */
  sendMessage(peerId, message) {
    const dataChannel = this.dataChannels.get(peerId);
    if (dataChannel && dataChannel.readyState === 'open') {
      dataChannel.send(JSON.stringify(message));
    } else {
      console.warn(`Cannot send message to ${peerId}: channel not open`);
    }
  }

  /**
   * Broadcast message ke semua peers
   */
  broadcast(message) {
    this.dataChannels.forEach((dataChannel) => {
      if (dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify(message));
      }
    });
  }

  /**
   * Handle signaling messages (with structured error handling)
   */
  async handleSignalingMessage(message) {
    try {
      const { type, peerId, data } = message;

      if (!type || !peerId) {
        rateLimitedLogger.warn('p2p-invalid-signal', 'Invalid signal message structure', { type, peerId });
        return;
      }

      // Auto-initiate: if configured, attempt connections when peers join or when peer-list provided
      if (this._autoInitiate) {
        try {
          if (type === 'peer-joined') {
            if (peerId && peerId !== this._selfId) {
              if (this.emitter) this.emitter.emit('peer-joined', { peerId });
              this.initiateConnection(peerId);
            }
            return;
          }

          if (type === 'peer-list' && data && Array.isArray(data.peers)) {
            for (const pid of data.peers) {
              if (pid && pid !== this._selfId) {
                this.initiateConnection(pid);
              }
            }
            return;
          }
        } catch (e) {
          // non-fatal
          console.warn('auto-initiate error:', e?.message || e);
        }
      }

      let peerConnection = this.peers.get(peerId);
      if (!peerConnection) {
        peerConnection = await this.createPeerConnection(peerId);
      }

      if (!peerConnection) {
        rateLimitedLogger.error('p2p-create-peer-failed', 'Failed to create peer connection', { peerId });
        return;
      }

      switch (type) {
        case 'offer':
          try {
            if (!data?.offer) throw new Error('Missing offer data');
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            this.sendSignalingMessage({
              type: 'answer',
              peerId,
              data: { answer },
            });
          } catch (e) {
            handleP2PError(e, { type: 'offer', peerId });
          }
          break;

        case 'answer':
          try {
            if (!data?.answer) throw new Error('Missing answer data');
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
          } catch (e) {
            handleP2PError(e, { type: 'answer', peerId });
          }
          break;

        case 'ice-candidate':
          try {
            if (!data?.candidate) throw new Error('Missing candidate data');
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
          } catch (error) {
            rateLimitedLogger.warn('p2p-ice-candidate-error', 'Failed to add ICE candidate', { error: error?.message || String(error), peerId });
          }
          break;

        default:
          rateLimitedLogger.warn('p2p-unknown-signal-type', 'Unknown signaling message type', { type, peerId });
      }
    } catch (error) {
      handleP2PError(error, { context: 'handleSignalingMessage' });
    }
  }

  /**
   * Send signaling message ke server (with safe error handling)
   */
  sendSignalingMessage(message) {
    if (!message) return;
    // Basic throttle: avoid sending too many POSTs in a short window
    const now = Date.now();
    const minSpacingMs = 150; // allow ~6 messages/sec
    if (now - this._lastSignalSentAt < minSpacingMs) {
      // schedule a short delay to avoid dropping
      setTimeout(() => this.sendSignalingMessage(message), minSpacingMs);
      return;
    }
    // If polling mode, queue the signal for batch sending to reduce POST bursts
    if (this.signalingServer && this.signalingServer.mode === 'poll') {
      try { this._telemetry.signalsSent = (this._telemetry.signalsSent || 0) + 1; } catch(_) {}
      this._enqueueSignal({
        room_id: this._signalingRoom,
        from_peer: this._selfId || 'unknown',
        to_peer: message.peerId || null,
        type: message.type,
        payload: message.data || {},
      });
      return;
    }

    if (this.signalingServer && this.signalingServer.readyState === WebSocket.OPEN) {
      try {
        this.signalingServer.send(JSON.stringify(message));
        this._lastSignalSentAt = Date.now();
        try { this._telemetry.signalsSent = (this._telemetry.signalsSent || 0) + 1; } catch(_){}
      } catch (e) {
        rateLimitedLogger.error('p2p-ws-send-error', 'WebSocket send failed', { error: e?.message || String(e) });
      }
    }
  }

  /**
   * Enqueue a signal for batched sending (poll mode). Flushes every _batchIntervalMs or when queue reaches threshold.
   */
  _enqueueSignal(body) {
    this._signalQueue.push(body);
    // If batch timer not set, start it
    if (!this._batchTimer) {
      this._batchTimer = setTimeout(() => this._flushSignalQueue(), this._batchIntervalMs);
    }
    // If queue grows too large, flush immediately
    if (this._signalQueue.length >= 12) {
      if (this._batchTimer) {
        clearTimeout(this._batchTimer);
        this._batchTimer = null;
      }
      this._flushSignalQueue();
    }
  }

  /**
   * Flush queued signals. First try batch POST to `${baseUrl}/batch`. If server doesn't support batching (404 or error), fall back to sequential sends.
   */
  async _flushSignalQueue() {
    if (!this._signalQueue.length) return;
    const queue = this._signalQueue.splice(0, this._signalQueue.length);
    if (this._batchTimer) { clearTimeout(this._batchTimer); this._batchTimer = null; }

    const base = this.signalingServer?.baseUrl;
    if (!base) return;

    // try batch endpoint
    try {
      const res = await fetch(`${base.replace(/\/$/, '')}/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: this._signalingRoom, signals: queue }),
      });

      if (res.ok) {
        // success; nothing else to do
        return;
      }

      // If batch not supported, fallback to per-signal sends
      if (res.status === 404 || res.status === 501) {
        // fallthrough to per-signal
      } else {
        // other server error - still attempt per-signal
      }
    } catch (e) {
      // network or batch endpoint error - fallback to per-signal
    }

    // Fallback: send signals sequentially with small spacing
    for (const body of queue) {
      try {
        await safeAsync(async () => {
          const r = await fetch(this.signalingServer.baseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!r.ok) {
            rateLimitedLogger.warn('p2p-signal-post-failed', 'Signal POST returned error (fallback)', { status: r.status });
          }
        }, 'p2p-signal-send-fallback');
      } catch (err) {
        rateLimitedLogger.error('p2p-signal-send-error', 'Error sending signal (fallback)', { error: err?.message || String(err) });
      }
      // small spacing to avoid bursts
      await new Promise((r) => setTimeout(r, 120));
    }
  }

  /**
   * Remove peer connection
   */
  removePeer(peerId) {
    const peerConnection = this.peers.get(peerId);
    if (peerConnection) {
      peerConnection.close();
      this.peers.delete(peerId);
    }

    const dataChannel = this.dataChannels.get(peerId);
    if (dataChannel) {
      dataChannel.close();
      this.dataChannels.delete(peerId);
    }

    console.log(`Peer ${peerId} removed`);
  }

  /**
   * Get peer statistics
   */
  async getPeerStats(peerId) {
    const peerConnection = this.peers.get(peerId);
    if (!peerConnection) return null;

    const stats = {
      connectionState: peerConnection.connectionState,
      iceConnectionState: peerConnection.iceConnectionState,
      iceGatheringState: peerConnection.iceGatheringState,
    };

    try {
      const report = await peerConnection.getStats();
      report.forEach((stat) => {
        if (stat.type === 'inbound-rtp' && stat.kind === 'video') {
          stats.bytesReceived = stat.bytesReceived;
          stats.packetsReceived = stat.packetsReceived;
          stats.jitter = stat.jitter;
          stats.fractionLost = stat.fractionLost;
        }
      });
    } catch (error) {
      console.warn('Get stats error:', error);
    }

    return stats;
  }

  /**
   * Cleanup - close all connections
   */
  destroy() {
    this.peers.forEach((peerConnection) => peerConnection.close());
    this.dataChannels.forEach((dataChannel) => dataChannel.close());
    this.peers.clear();
    this.dataChannels.clear();

    if (this.signalingServer) {
      try {
        if (this.signalingServer instanceof WebSocket) {
          this.signalingServer.close();
        } else if (this.signalingServer && this.signalingServer.mode === 'poll' && this._pollInterval) {
          clearInterval(this._pollInterval);
          this._pollInterval = null;
        }
      } catch (e) {
        /* ignore */
      }
    }

    console.log('P2P Engine destroyed');
  }

  /**
   * Telemetry snapshot - useful for UI/diagnostics
   */
  getTelemetry() {
    return { ...(this._telemetry || {}) };
  }
}

// Export singleton instance
const p2pEngine = typeof window !== 'undefined' ? new P2PEngine() : null;

export default p2pEngine;
export { P2PEngine };
