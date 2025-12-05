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
  }

  /**
   * Initialize P2P engine dengan signaling server
   */
  async init(signalingServerUrl) {
    try {
      // If signalingServerUrl is HTTP(S) we use polling against a REST signaling endpoint
      const parsedUrl = new URL(signalingServerUrl, typeof window !== 'undefined' ? window.location.origin : undefined);
      const protocol = parsedUrl.protocol.replace(':','');

      if (protocol === 'http' || protocol === 'https') {
        // Expect query params: room and self
        this._signalingRoom = parsedUrl.searchParams.get('room') || 'default';
        this._selfId = parsedUrl.searchParams.get('self') || `peer_${Math.random().toString(36).slice(2,8)}`;
        const base = `${parsedUrl.origin}${parsedUrl.pathname}`;

        // start polling loop (wrapped with safeAsync and rate-limited logging)
        if (this._pollInterval) clearInterval(this._pollInterval);
        this._pollInterval = setInterval(() => {
          safeAsync(async () => {
            const res = await fetch(`${base}?room_id=${encodeURIComponent(this._signalingRoom)}&peer=${encodeURIComponent(this._selfId)}`);
            if (!res.ok) {
              rateLimitedLogger.warn('p2p-poll-http-error', 'Polling returned non-ok status', { status: res.status });
              return;
            }
            const json = await res.json();
            if (!json || !json.data) return;
            for (const sig of json.data) {
              try {
                const message = {
                  type: sig.type,
                  peerId: sig.from_peer,
                  data: sig.payload
                };
                this.handleSignalingMessage(message);
                // delete processed signal
                await fetch(`${base}?id=${encodeURIComponent(sig.id)}`, { method: 'DELETE' });
              } catch (e) {
                rateLimitedLogger.error('p2p-process-signal', 'Error processing signal', { error: e?.message || String(e), sigId: sig?.id });
                handleP2PError(e, { sig });
              }
            }
          }, 'p2p-poll')
          .catch(err => {
            rateLimitedLogger.error('p2p-poll-failed', 'P2P polling failed', { error: err?.message || String(err) });
          });
        }, 1000);

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
      const peerConnection = new RTCPeerConnection({
        iceServers: P2P_CONFIG.iceServers,
      });

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
        console.log(`Peer ${peerId} connection state:`, peerConnection.connectionState);

        if (peerConnection.connectionState === 'failed' || 
            peerConnection.connectionState === 'disconnected') {
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

      return peerConnection;
    } catch (error) {
      console.error('Create peer connection error:', error);
      return null;
    }
  }

  /**
   * Setup data channel untuk komunikasi
   */
  setupDataChannel(peerId, dataChannel) {
    dataChannel.onopen = () => {
      console.log(`Data channel opened with peer ${peerId}`);
    };

    dataChannel.onmessage = (event) => {
      console.log(`Message from ${peerId}:`, event.data);
    };

    dataChannel.onerror = (error) => {
      console.error(`Data channel error with ${peerId}:`, error);
    };

    dataChannel.onclose = () => {
      console.log(`Data channel closed with peer ${peerId}`);
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
    // If polling mode, POST to REST signaling endpoint
    if (this.signalingServer && this.signalingServer.mode === 'poll') {
      safeAsync(async () => {
        const body = {
          room_id: this._signalingRoom,
          from_peer: this._selfId || 'unknown',
          to_peer: message.peerId || null,
          type: message.type,
          payload: message.data || {}
        };
        const res = await fetch(this.signalingServer.baseUrl, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify(body) 
        });
        if (!res.ok) {
          rateLimitedLogger.warn('p2p-signal-post-failed', 'Signal POST returned error', { status: res.status });
        }
      }, 'p2p-signal-send')
      .catch(err => {
        rateLimitedLogger.error('p2p-signal-send-error', 'Error sending signal', { error: err?.message || String(err) });
      });
      return;
    }

    if (this.signalingServer && this.signalingServer.readyState === WebSocket.OPEN) {
      try {
        this.signalingServer.send(JSON.stringify(message));
      } catch (e) {
        rateLimitedLogger.error('p2p-ws-send-error', 'WebSocket send failed', { error: e?.message || String(e) });
      }
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
      this.signalingServer.close();
    }

    console.log('P2P Engine destroyed');
  }
}

// Export singleton instance
const p2pEngine = typeof window !== 'undefined' ? new P2PEngine() : null;

export default p2pEngine;
export { P2PEngine };
