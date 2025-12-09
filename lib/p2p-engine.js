/**
 * 🚀 P2P Engine - Production Ready (FIXED)
 * 
 * FIXES:
 * ✅ ICE Candidate Queueing
 * ✅ Glare/Collision Handling
 * ✅ Race Condition Prevention
 * ✅ Proper State Machine
 */

const P2P_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
  
  chunkSize: 256 * 1024,
  maxCacheSize: 50 * 1024 * 1024,
  chunkTimeout: 5000,
  
  maxPeers: 6,
  minPeersForP2P: 2,
  
  bandwidthThreshold: 500000,
  healthCheckInterval: 10000,
  
  mobileMaxPeers: 3,
  mobileBandwidthThreshold: 300000,
};

class P2PEngine {
  constructor() {
    this.enabled = false;
    this.peers = new Map();
    this.chunkCache = new Map();
    this.pendingRequests = new Map();
    this.peerHealth = new Map();
    
    // ✅ FIX: ICE Candidate Queue
    this.pendingCandidates = new Map();
    
    // ✅ FIX: Lock untuk prevent race conditions
    this.peerLocks = new Map();
    
    this.roomId = null;
    this.peerId = null;
    this.signalingUrl = null;
    this.pollInterval = null;
    this.destroyed = false;
    
    this.stats = {
      p2pHits: 0,
      p2pMisses: 0,
      cdnFallbacks: 0,
      bytesFromPeers: 0,
      bytesShared: 0,
      avgLatency: 0,
    };
    
    this.isMobile = this._detectMobile();
    
    this.config = this.isMobile ? {
      ...P2P_CONFIG,
      maxPeers: P2P_CONFIG.mobileMaxPeers,
      bandwidthThreshold: P2P_CONFIG.mobileBandwidthThreshold,
    } : P2P_CONFIG;
    
    console.log('📡 P2P Engine initialized', {
      mobile: this.isMobile,
      maxPeers: this.config.maxPeers,
    });
  }

  // ========== LOCK MECHANISM ==========
  
  // ✅ FIX: Prevent race conditions with per-peer locks
  async _withPeerLock(peerId, operation) {
    // Wait for existing lock
    while (this.peerLocks.get(peerId)) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // Acquire lock
    this.peerLocks.set(peerId, true);
    
    try {
      return await operation();
    } finally {
      // Release lock
      this.peerLocks.delete(peerId);
    }
  }

  // ========== INITIALIZATION ==========

  async init(roomId, options = {}) {
    try {
      this.roomId = roomId;
      this.peerId = this._generatePeerId();
      this.signalingUrl = options.signalingUrl || '/api/p2p-signal';
      this.destroyed = false;
      
      console.log('📡 Initializing P2P:', {
        roomId,
        peerId: this.peerId,
        signalingUrl: this.signalingUrl,
      });

      await this._startSignaling();
      this._startHealthMonitoring();
      
      this.enabled = true;
      
      await this._sendSignal({
        type: 'announce',
        payload: { peerId: this.peerId },
      });
      
      console.log('✅ P2P Engine ready');
      
      return true;
    } catch (error) {
      console.error('❌ P2P init failed:', error);
      this.enabled = false;
      return false;
    }
  }

  // ========== SIGNALING (FIXED) ==========

  async _startSignaling() {
    this.pollInterval = setInterval(async () => {
      if (this.destroyed) return;
      
      try {
        const response = await fetch(
          `${this.signalingUrl}?room_id=${this.roomId}&peer=${this.peerId}`
        );
        
        if (!response.ok) return;
        
        const data = await response.json();
        if (data.success && data.data) {
          for (const signal of data.data) {
            await this._handleSignal(signal);
            // Delete processed signal
            fetch(`${this.signalingUrl}?id=${signal.id}`, { method: 'DELETE' }).catch(() => {});
          }
        }
      } catch (error) {
        if (!this.destroyed) {
          console.warn('Signaling poll error:', error.message);
        }
      }
    }, 2000);
  }

  async _sendSignal(data) {
    if (this.destroyed) return;
    
    try {
      await fetch(this.signalingUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: this.roomId,
          from_peer: this.peerId,
          to_peer: data.to || null,
          type: data.type,
          payload: data.payload || data,
        }),
      });
    } catch (error) {
      console.error('Send signal error:', error);
    }
  }

  async _handleSignal(signal) {
    const { from_peer, type, payload } = signal;
    
    if (from_peer === this.peerId) return;

    console.log(`[P2P] Received: ${type} from ${from_peer}`);

    try {
      switch (type) {
        case 'announce':
          await this._handleAnnounce(from_peer);
          break;
        case 'offer':
          await this._handleOffer(from_peer, payload.offer || payload);
          break;
        case 'answer':
          await this._handleAnswer(from_peer, payload.answer || payload);
          break;
        case 'ice-candidate':
          await this._handleIceCandidate(from_peer, payload.candidate || payload);
          break;
        case 'bye':
          this._removePeer(from_peer);
          break;
      }
    } catch (error) {
      console.error('Handle signal error:', error.message);
    }
  }

  // ========== PEER CONNECTION (FIXED) ==========

  async _handleAnnounce(fromPeer) {
    // Only the peer with lower ID initiates connection (prevents duplicate connections)
    if (this.peerId < fromPeer && this.peers.size < this.config.maxPeers) {
      console.log(`[P2P] Creating offer for ${fromPeer}`);
      await this.createPeerConnection(fromPeer);
    }
  }

  async createPeerConnection(remotePeerId) {
    // ✅ FIX: Use lock to prevent race conditions
    return this._withPeerLock(remotePeerId, async () => {
      // Check if already connecting/connected
      const existingPeer = this.peers.get(remotePeerId);
      if (existingPeer) {
        const state = existingPeer.connection?.connectionState;
        if (['connecting', 'connected'].includes(state)) {
          console.log(`[P2P] Already ${state} to ${remotePeerId}`);
          return existingPeer.connection;
        }
        // Close stale connection
        this._cleanupPeerConnection(remotePeerId);
      }

      const pc = new RTCPeerConnection({
        iceServers: this.config.iceServers,
      });

      // ✅ FIX: Initialize candidate queue
      this.pendingCandidates.set(remotePeerId, []);

      const dc = pc.createDataChannel('chunks', {
        ordered: true,
        maxRetransmits: 3,
      });

      this._setupDataChannel(remotePeerId, dc);

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          this._sendSignal({
            type: 'ice-candidate',
            to: remotePeerId,
            payload: { candidate: event.candidate.toJSON() },
          });
        }
      };

      pc.onconnectionstatechange = () => {
        console.log(`[P2P] Peer ${remotePeerId} state:`, pc.connectionState);
        
        if (pc.connectionState === 'connected') {
          this.peerHealth.set(remotePeerId, 100);
        }
        
        if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
          this._removePeer(remotePeerId);
        }
      };

      this.peers.set(remotePeerId, {
        id: remotePeerId,
        connection: pc,
        dataChannel: dc,
        connected: false,
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      await this._sendSignal({
        type: 'offer',
        to: remotePeerId,
        payload: { offer: pc.localDescription.toJSON() },
      });

      return pc;
    });
  }

  // ✅ FIX: Handle Offer with Glare Detection
  async _handleOffer(peerId, offer) {
    await this._withPeerLock(peerId, async () => {
      let peer = this.peers.get(peerId);
      let pc = peer?.connection;
      
      // Create new connection if needed
      if (!pc || pc.signalingState === 'closed') {
        pc = new RTCPeerConnection({
          iceServers: this.config.iceServers,
        });

        // Initialize candidate queue
        this.pendingCandidates.set(peerId, []);

        pc.ondatachannel = (event) => {
          this._setupDataChannel(peerId, event.channel);
          const p = this.peers.get(peerId);
          if (p) p.dataChannel = event.channel;
        };

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            this._sendSignal({
              type: 'ice-candidate',
              to: peerId,
              payload: { candidate: event.candidate.toJSON() },
            });
          }
        };

        pc.onconnectionstatechange = () => {
          console.log(`[P2P] Peer ${peerId} state:`, pc.connectionState);
          if (pc.connectionState === 'connected') {
            this.peerHealth.set(peerId, 100);
          }
          if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
            this._removePeer(peerId);
          }
        };

        this.peers.set(peerId, {
          id: peerId,
          connection: pc,
          dataChannel: null,
          connected: false,
        });
        
        peer = this.peers.get(peerId);
      }

      // ✅ FIX: Handle Glare (both peers send offer simultaneously)
      if (pc.signalingState === 'have-local-offer') {
        // Resolve glare: peer with lower ID wins
        if (this.peerId < peerId) {
          console.log(`[P2P] Glare detected, ignoring offer from ${peerId} (we are initiator)`);
          return;
        } else {
          console.log(`[P2P] Glare detected, rolling back our offer for ${peerId}`);
          await pc.setLocalDescription({ type: 'rollback' });
        }
      }

      // ✅ FIX: Check signaling state
      if (pc.signalingState !== 'stable') {
        console.warn(`[P2P] Cannot set offer in state: ${pc.signalingState}`);
        return;
      }

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      
      // ✅ FIX: Process queued ICE candidates
      await this._processQueuedCandidates(peerId);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      await this._sendSignal({
        type: 'answer',
        to: peerId,
        payload: { answer: pc.localDescription.toJSON() },
      });
    });
  }

  // ✅ FIX: Handle Answer with State Check
  async _handleAnswer(peerId, answer) {
    await this._withPeerLock(peerId, async () => {
      const peer = this.peers.get(peerId);
      if (!peer?.connection) {
        console.warn(`[P2P] No connection for answer from ${peerId}`);
        return;
      }

      const pc = peer.connection;

      // ✅ FIX: Check signaling state before setting remote description
      if (pc.signalingState !== 'have-local-offer') {
        console.warn(`[P2P] Cannot set answer in state: ${pc.signalingState}`);
        return;
      }

      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      
      // ✅ FIX: Process queued ICE candidates
      await this._processQueuedCandidates(peerId);
    });
  }

  // ✅ FIX: Queue ICE Candidates
  async _handleIceCandidate(peerId, candidate) {
    const peer = this.peers.get(peerId);
    const pc = peer?.connection;
    
    // ✅ FIX: Queue if remote description not set yet
    if (!pc || !pc.remoteDescription || !pc.remoteDescription.type) {
      console.log(`[P2P] Queueing ICE candidate for ${peerId}`);
      
      if (!this.pendingCandidates.has(peerId)) {
        this.pendingCandidates.set(peerId, []);
      }
      this.pendingCandidates.get(peerId).push(candidate);
      return;
    }

    // Add immediately
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
      console.log(`[P2P] Added ICE candidate for ${peerId}`);
    } catch (error) {
      console.error(`[P2P] Failed to add ICE candidate:`, error.message);
    }
  }

  // ✅ FIX: Process Queued Candidates
  async _processQueuedCandidates(peerId) {
    const queued = this.pendingCandidates.get(peerId) || [];
    const peer = this.peers.get(peerId);
    const pc = peer?.connection;
    
    if (!pc || !pc.remoteDescription) return;
    
    if (queued.length > 0) {
      console.log(`[P2P] Processing ${queued.length} queued candidates for ${peerId}`);
    }
    
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error(`[P2P] Failed to add queued candidate:`, error.message);
      }
    }
    
    // Clear queue
    this.pendingCandidates.set(peerId, []);
  }

  // ========== DATA CHANNEL ==========

  _setupDataChannel(peerId, dc) {
    dc.binaryType = 'arraybuffer';

    dc.onopen = () => {
      console.log(`✅ Data channel opened: ${peerId}`);
      const peer = this.peers.get(peerId);
      if (peer) peer.connected = true;
      this.peerHealth.set(peerId, 100);
    };

    dc.onclose = () => {
      console.log(`❌ Data channel closed: ${peerId}`);
      const peer = this.peers.get(peerId);
      if (peer) peer.connected = false;
    };

    dc.onerror = (error) => {
      console.error(`Data channel error: ${peerId}`, error);
      this._recordPeerFailure(peerId);
    };

    dc.onmessage = (event) => {
      this._handleDataChannelMessage(peerId, event);
    };
  }

  _handleDataChannelMessage(peerId, event) {
    try {
      if (event.data instanceof ArrayBuffer) {
        // Binary chunk data - handled by request flow
        return;
      }

      const msg = JSON.parse(event.data);
      
      if (msg.type === 'has-chunk') {
        const available = this.chunkCache.has(msg.url);
        const peer = this.peers.get(peerId);
        if (peer?.dataChannel?.readyState === 'open') {
          peer.dataChannel.send(JSON.stringify({
            type: 'chunk-available',
            requestId: msg.requestId,
            available,
          }));
        }
      }
      
      if (msg.type === 'get-chunk') {
        const chunk = this.chunkCache.get(msg.url);
        const peer = this.peers.get(peerId);
        
        if (chunk && peer?.dataChannel?.readyState === 'open') {
          peer.dataChannel.send(JSON.stringify({
            type: 'chunk-start',
            requestId: msg.requestId,
          }));
          
          peer.dataChannel.send(chunk);
          
          peer.dataChannel.send(JSON.stringify({
            type: 'chunk-end',
            requestId: msg.requestId,
          }));
          
          this.stats.bytesShared += chunk.byteLength;
        } else if (peer?.dataChannel?.readyState === 'open') {
          peer.dataChannel.send(JSON.stringify({
            type: 'chunk-error',
            requestId: msg.requestId,
            error: 'Chunk not found',
          }));
        }
      }
    } catch (e) {
      // Ignore parse errors
    }
  }

  // ========== CHUNK FETCHING ==========

  async fetchChunk(url, options = {}) {
    const startTime = performance.now();
    
    if (this.chunkCache.has(url)) {
      return this.chunkCache.get(url);
    }

    const healthyPeers = this._getHealthyPeers();
    const shouldUseP2P = this.enabled 
      && healthyPeers.length >= this.config.minPeersForP2P
      && !this._isLowBandwidth();

    if (!shouldUseP2P) {
      return this._fetchFromCDN(url, options);
    }

    try {
      const chunk = await Promise.race([
        this._fetchFromPeers(url, healthyPeers),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('P2P timeout')), this.config.chunkTimeout)
        ),
      ]);

      const latency = performance.now() - startTime;
      this.stats.p2pHits++;
      this.stats.bytesFromPeers += chunk.byteLength;
      this.stats.avgLatency = (this.stats.avgLatency + latency) / 2;
      
      this._cacheChunk(url, chunk);
      
      return chunk;
      
    } catch (error) {
      this.stats.p2pMisses++;
      this.stats.cdnFallbacks++;
      
      return this._fetchFromCDN(url, options);
    }
  }

  async _fetchFromPeers(url, peers) {
    if (peers.length === 0) {
      throw new Error('No healthy peers available');
    }

    const requests = peers.map(async (peer) => {
      try {
        const hasChunk = await this._askPeerForChunk(peer.id, url);
        if (hasChunk) {
          return this._requestChunkFromPeer(peer.id, url);
        }
      } catch (e) {
        this._recordPeerFailure(peer.id);
        return null;
      }
    });

    const results = await Promise.race(requests.filter(r => r !== null));
    
    if (!results) {
      throw new Error('No peer has chunk');
    }

    return results;
  }

  async _askPeerForChunk(peerId, url) {
    return new Promise((resolve) => {
      const peer = this.peers.get(peerId);
      if (!peer?.dataChannel || peer.dataChannel.readyState !== 'open') {
        resolve(false);
        return;
      }

      const requestId = Math.random().toString(36).slice(2);
      
      const handler = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'chunk-available' && msg.requestId === requestId) {
            peer.dataChannel.removeEventListener('message', handler);
            resolve(msg.available);
          }
        } catch (e) {}
      };

      peer.dataChannel.addEventListener('message', handler);
      
      peer.dataChannel.send(JSON.stringify({
        type: 'has-chunk',
        url,
        requestId,
      }));

      setTimeout(() => {
        peer.dataChannel.removeEventListener('message', handler);
        resolve(false);
      }, 1000);
    });
  }

  async _requestChunkFromPeer(peerId, url) {
    return new Promise((resolve, reject) => {
      const peer = this.peers.get(peerId);
      if (!peer?.dataChannel || peer.dataChannel.readyState !== 'open') {
        reject(new Error('Peer not available'));
        return;
      }

      const requestId = Math.random().toString(36).slice(2);
      let chunks = [];
      
      const handler = (event) => {
        try {
          if (event.data instanceof ArrayBuffer) {
            chunks.push(event.data);
            return;
          }

          const msg = JSON.parse(event.data);
          
          if (msg.type === 'chunk-start' && msg.requestId === requestId) {
            chunks = [];
          }
          
          if (msg.type === 'chunk-end' && msg.requestId === requestId) {
            peer.dataChannel.removeEventListener('message', handler);
            
            const totalLength = chunks.reduce((sum, arr) => sum + arr.byteLength, 0);
            const result = new Uint8Array(totalLength);
            let offset = 0;
            chunks.forEach(arr => {
              result.set(new Uint8Array(arr), offset);
              offset += arr.byteLength;
            });
            
            resolve(result.buffer);
          }
          
          if (msg.type === 'chunk-error' && msg.requestId === requestId) {
            peer.dataChannel.removeEventListener('message', handler);
            reject(new Error(msg.error || 'Chunk transfer failed'));
          }
        } catch (e) {
          reject(e);
        }
      };

      peer.dataChannel.addEventListener('message', handler);
      
      peer.dataChannel.send(JSON.stringify({
        type: 'get-chunk',
        url,
        requestId,
      }));

      setTimeout(() => {
        peer.dataChannel.removeEventListener('message', handler);
        reject(new Error('Chunk request timeout'));
      }, this.config.chunkTimeout);
    });
  }

  async _fetchFromCDN(url, options = {}) {
    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        throw new Error(`CDN fetch failed: ${response.status}`);
      }

      const chunk = await response.arrayBuffer();
      this._cacheChunk(url, chunk);
      
      return chunk;
    } catch (error) {
      console.error('❌ CDN fetch failed:', error);
      throw error;
    }
  }

  // ========== CACHE ==========

  _cacheChunk(url, chunk) {
    if (this.chunkCache.size >= 100) {
      const firstKey = this.chunkCache.keys().next().value;
      this.chunkCache.delete(firstKey);
    }

    let totalSize = 0;
    for (const [_, data] of this.chunkCache) {
      totalSize += data.byteLength;
    }

    if (totalSize > this.config.maxCacheSize) {
      const toDelete = Math.floor(this.chunkCache.size / 2);
      let deleted = 0;
      for (const key of this.chunkCache.keys()) {
        if (deleted >= toDelete) break;
        this.chunkCache.delete(key);
        deleted++;
      }
    }

    this.chunkCache.set(url, chunk);
  }

  // ========== HEALTH ==========

  _startHealthMonitoring() {
    setInterval(() => {
      if (this.destroyed) return;
      
      for (const [peerId, health] of this.peerHealth) {
        this.peerHealth.set(peerId, Math.max(0, health - 10));
        
        if (health <= 0) {
          this._removePeer(peerId);
        }
      }
    }, this.config.healthCheckInterval);
  }

  _getHealthyPeers() {
    return Array.from(this.peers.values())
      .filter(peer => {
        const health = this.peerHealth.get(peer.id) || 0;
        return peer.connected && peer.dataChannel?.readyState === 'open' && health > 50;
      })
      .sort((a, b) => {
        const healthA = this.peerHealth.get(a.id) || 0;
        const healthB = this.peerHealth.get(b.id) || 0;
        return healthB - healthA;
      });
  }

  _recordPeerFailure(peerId) {
    const currentHealth = this.peerHealth.get(peerId) || 100;
    this.peerHealth.set(peerId, Math.max(0, currentHealth - 30));
  }

  // ========== CLEANUP ==========

  _cleanupPeerConnection(peerId) {
    const peer = this.peers.get(peerId);
    if (peer) {
      if (peer.dataChannel) {
        try { peer.dataChannel.close(); } catch (e) {}
      }
      if (peer.connection) {
        try { peer.connection.close(); } catch (e) {}
      }
    }
    this.peers.delete(peerId);
    this.pendingCandidates.delete(peerId);
    this.peerLocks.delete(peerId);
  }

  _removePeer(peerId) {
    this._cleanupPeerConnection(peerId);
    this.peerHealth.delete(peerId);
    console.log(`❌ Removed peer: ${peerId}`);
  }

  // ========== UTILITIES ==========

  _detectMobile() {
    if (typeof navigator === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
  }

  _isLowBandwidth() {
    if (typeof navigator === 'undefined' || !navigator.connection) {
      return false;
    }
    const conn = navigator.connection;
    return (conn.downlink || 10) < (this.config.bandwidthThreshold / 1000000);
  }

  _generatePeerId() {
    return `peer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  // ========== STATS ==========

  getStats() {
    const offloadRatio = this.stats.p2pHits / 
      (this.stats.p2pHits + this.stats.cdnFallbacks) || 0;
    
    return {
      enabled: this.enabled,
      peerId: this.peerId,
      peers: this.peers.size,
      healthyPeers: this._getHealthyPeers().length,
      cacheSize: this.chunkCache.size,
      p2pHits: this.stats.p2pHits,
      p2pMisses: this.stats.p2pMisses,
      cdnFallbacks: this.stats.cdnFallbacks,
      offloadRatio: (offloadRatio * 100).toFixed(1) + '%',
      bytesFromPeers: (this.stats.bytesFromPeers / 1048576).toFixed(2) + ' MB',
      bytesShared: (this.stats.bytesShared / 1048576).toFixed(2) + ' MB',
      avgLatency: this.stats.avgLatency.toFixed(0) + 'ms',
    };
  }

  // ========== DESTROY ==========

  async destroy() {
    this.destroyed = true;
    this.enabled = false;
    
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    // Send bye signal
    await this._sendSignal({
      type: 'bye',
      payload: { peerId: this.peerId },
    }).catch(() => {});

    // Cleanup signals on server
    try {
      await fetch(`${this.signalingUrl}?room_id=${this.roomId}&peer=${this.peerId}`, {
        method: 'DELETE',
      });
    } catch (e) {}

    // Close all connections
    for (const peerId of this.peers.keys()) {
      this._cleanupPeerConnection(peerId);
    }

    this.peers.clear();
    this.chunkCache.clear();
    this.peerHealth.clear();
    this.pendingCandidates.clear();
    this.peerLocks.clear();
    
    console.log('📡 P2P Engine destroyed');
  }
}

// Singleton
let p2pEngineInstance = null;

export function getP2PEngine() {
  if (!p2pEngineInstance) {
    p2pEngineInstance = new P2PEngine();
  }
  return p2pEngineInstance;
}

export function resetP2PEngine() {
  if (p2pEngineInstance) {
    p2pEngineInstance.destroy();
    p2pEngineInstance = null;
  }
}

export default P2PEngine;