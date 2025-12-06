/**
 * 🚀 P2P Engine - Production Ready
 * Optimized for cost savings and user experience
 * 
 * Features:
 * - WebRTC chunk sharing
 * - Adaptive peer selection
 * - Bandwidth monitoring
 * - Auto fallback to CDN
 * - Mobile optimized
 */

import { getPerformanceMonitor } from './performance-monitor';

const P2P_CONFIG = {
  // WebRTC Configuration
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // TURN server (uncomment when deployed)
    // { 
    //   urls: 'turn:your-turn-server.com:3478',
    //   username: 'user',
    //   credential: 'pass'
    // }
  ],
  
  // Chunk Management
  chunkSize: 256 * 1024, // 256KB chunks
  maxCacheSize: 50 * 1024 * 1024, // 50MB cache
  chunkTimeout: 5000, // 5s timeout for P2P fetch
  
  // Peer Management
  maxPeers: 6, // Max simultaneous connections
  minPeersForP2P: 2, // Minimum peers before using P2P
  
  // Performance
  bandwidthThreshold: 500000, // 500 kbps minimum
  healthCheckInterval: 10000, // 10s
  
  // Mobile optimization
  mobileMaxPeers: 3,
  mobileBandwidthThreshold: 300000, // 300 kbps
};

class P2PEngine {
  constructor() {
    this.enabled = false;
    this.peers = new Map();
    this.chunkCache = new Map(); // URL -> ArrayBuffer
    this.pendingRequests = new Map(); // URL -> Promise
    this.peerHealth = new Map(); // peerId -> health score
    
    this.roomId = null;
    this.peerId = null;
    this.signalingUrl = null;
    this.pollInterval = null;
    
    // Stats
    this.stats = {
      p2pHits: 0,
      p2pMisses: 0,
      cdnFallbacks: 0,
      bytesFromPeers: 0,
      bytesShared: 0,
      avgLatency: 0,
    };
    
    // Mobile detection
    this.isMobile = this._detectMobile();
    
    // Config based on device
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

  // ========== INITIALIZATION ==========

  async init(roomId, options = {}) {
    try {
      this.roomId = roomId;
      this.peerId = this._generatePeerId();
      this.signalingUrl = options.signalingUrl || '/api/p2p-signal';
      
      console.log('📡 Initializing P2P:', {
        roomId,
        peerId: this.peerId,
        signalingUrl: this.signalingUrl,
      });

      // Start signaling
      await this._startSignaling();
      
      // Start health checks
      this._startHealthMonitoring();
      
      this.enabled = true;
      
      // Announce presence
      await this._sendSignal({
        type: 'peer-join',
        peerId: this.peerId,
      });
      
      console.log('✅ P2P Engine ready');
      
      return true;
    } catch (error) {
      console.error('❌ P2P init failed:', error);
      this.enabled = false;
      return false;
    }
  }

  // ========== CHUNK FETCHING (MAIN API) ==========

  /**
   * Fetch video chunk - try P2P first, fallback to CDN
   */
  async fetchChunk(url, options = {}) {
    const startTime = performance.now();
    
    // Check cache first
    if (this.chunkCache.has(url)) {
      console.log('💾 Cache hit:', url);
      return this.chunkCache.get(url);
    }

    // Check if we have enough peers
    const healthyPeers = this._getHealthyPeers();
    const shouldUseP2P = this.enabled 
      && healthyPeers.length >= this.config.minPeersForP2P
      && !this._isLowBandwidth();

    if (!shouldUseP2P) {
      // Fallback to CDN immediately
      console.log('📡 CDN fetch (no P2P):', url);
      return this._fetchFromCDN(url, options);
    }

    // Try P2P with timeout
    try {
      const chunk = await Promise.race([
        this._fetchFromPeers(url, healthyPeers),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('P2P timeout')), this.config.chunkTimeout)
        ),
      ]);

      // Success!
      const latency = performance.now() - startTime;
      this.stats.p2pHits++;
      this.stats.bytesFromPeers += chunk.byteLength;
      this.stats.avgLatency = (this.stats.avgLatency + latency) / 2;
      
      console.log(`✅ P2P hit (${latency.toFixed(0)}ms):`, url);
      
      // Cache it
      this._cacheChunk(url, chunk);
      
      return chunk;
      
    } catch (error) {
      // P2P failed, fallback to CDN
      console.warn('⚠️ P2P failed, using CDN:', error.message);
      this.stats.p2pMisses++;
      this.stats.cdnFallbacks++;
      
      return this._fetchFromCDN(url, options);
    }
  }

  // ========== PEER-TO-PEER FETCH ==========

  async _fetchFromPeers(url, peers) {
    if (peers.length === 0) {
      throw new Error('No healthy peers available');
    }

    // Check if any peer has this chunk
    const requests = peers.map(async (peer) => {
      try {
        const hasChunk = await this._askPeerForChunk(peer.id, url);
        if (hasChunk) {
          return this._requestChunkFromPeer(peer.id, url);
        }
      } catch (e) {
        // Peer failed, try next
        this._recordPeerFailure(peer.id);
        return null;
      }
    });

    // Race: first peer to respond wins
    const results = await Promise.race(requests.filter(r => r !== null));
    
    if (!results) {
      throw new Error('No peer has chunk');
    }

    return results;
  }

  async _askPeerForChunk(peerId, url) {
    return new Promise((resolve) => {
      const peer = this.peers.get(peerId);
      if (!peer || !peer.dataChannel || peer.dataChannel.readyState !== 'open') {
        resolve(false);
        return;
      }

      const requestId = Math.random().toString(36).slice(2);
      
      // Set up response handler
      const handler = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'chunk-available' && msg.requestId === requestId) {
            peer.dataChannel.removeEventListener('message', handler);
            resolve(msg.available);
          }
        } catch (e) {
          // Ignore parse errors
        }
      };

      peer.dataChannel.addEventListener('message', handler);
      
      // Send request
      peer.dataChannel.send(JSON.stringify({
        type: 'has-chunk',
        url,
        requestId,
      }));

      // Timeout
      setTimeout(() => {
        peer.dataChannel.removeEventListener('message', handler);
        resolve(false);
      }, 1000);
    });
  }

  async _requestChunkFromPeer(peerId, url) {
    return new Promise((resolve, reject) => {
      const peer = this.peers.get(peerId);
      if (!peer || !peer.dataChannel || peer.dataChannel.readyState !== 'open') {
        reject(new Error('Peer not available'));
        return;
      }

      const requestId = Math.random().toString(36).slice(2);
      let chunks = [];
      
      const handler = (event) => {
        try {
          // Handle binary data (chunk)
          if (event.data instanceof ArrayBuffer) {
            chunks.push(event.data);
            return;
          }

          // Handle control messages
          const msg = JSON.parse(event.data);
          
          if (msg.type === 'chunk-start' && msg.requestId === requestId) {
            chunks = [];
          }
          
          if (msg.type === 'chunk-end' && msg.requestId === requestId) {
            peer.dataChannel.removeEventListener('message', handler);
            
            // Combine chunks
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
      
      // Request chunk
      peer.dataChannel.send(JSON.stringify({
        type: 'get-chunk',
        url,
        requestId,
      }));

      // Timeout
      setTimeout(() => {
        peer.dataChannel.removeEventListener('message', handler);
        reject(new Error('Chunk request timeout'));
      }, this.config.chunkTimeout);
    });
  }

  // ========== CDN FALLBACK ==========

  async _fetchFromCDN(url, options = {}) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
        },
      });

      if (!response.ok) {
        throw new Error(`CDN fetch failed: ${response.status}`);
      }

      const chunk = await response.arrayBuffer();
      
      // Cache it for sharing with peers
      this._cacheChunk(url, chunk);
      
      return chunk;
    } catch (error) {
      console.error('❌ CDN fetch failed:', error);
      throw error;
    }
  }

  // ========== CACHE MANAGEMENT ==========

  _cacheChunk(url, chunk) {
    // LRU cache with size limit
    if (this.chunkCache.size >= 100) {
      // Remove oldest entry
      const firstKey = this.chunkCache.keys().next().value;
      this.chunkCache.delete(firstKey);
    }

    // Check total cache size
    let totalSize = 0;
    for (const [_, data] of this.chunkCache) {
      totalSize += data.byteLength;
    }

    if (totalSize > this.config.maxCacheSize) {
      // Clear 50% of cache
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

  // ========== PEER CONNECTION ==========

  async createPeerConnection(remotePeerId) {
    try {
      const pc = new RTCPeerConnection({
        iceServers: this.config.iceServers,
      });

      // Create data channel
      const dc = pc.createDataChannel('chunks', {
        ordered: true,
        maxRetransmits: 3,
      });

      this._setupDataChannel(remotePeerId, dc);

      // ICE candidate handling
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          this._sendSignal({
            type: 'ice-candidate',
            to: remotePeerId,
            candidate: event.candidate,
          });
        }
      };

      // Connection state
      pc.onconnectionstatechange = () => {
        console.log(`Peer ${remotePeerId} state:`, pc.connectionState);
        
        if (pc.connectionState === 'connected') {
          this.peerHealth.set(remotePeerId, 100);
        }
        
        if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
          this._removePeer(remotePeerId);
        }
      };

      // Store peer
      this.peers.set(remotePeerId, {
        id: remotePeerId,
        connection: pc,
        dataChannel: dc,
        connected: false,
      });

      // Create offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      await this._sendSignal({
        type: 'offer',
        to: remotePeerId,
        offer: pc.localDescription,
      });

      return pc;
    } catch (error) {
      console.error('Create peer connection error:', error);
      throw error;
    }
  }

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
      this._removePeer(peerId);
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
      // Handle chunk requests from peers
      const msg = JSON.parse(event.data);
      
      if (msg.type === 'has-chunk') {
        const available = this.chunkCache.has(msg.url);
        const peer = this.peers.get(peerId);
        if (peer && peer.dataChannel) {
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
        
        if (chunk && peer && peer.dataChannel) {
          // Send chunk start
          peer.dataChannel.send(JSON.stringify({
            type: 'chunk-start',
            requestId: msg.requestId,
          }));
          
          // Send chunk data
          peer.dataChannel.send(chunk);
          
          // Send chunk end
          peer.dataChannel.send(JSON.stringify({
            type: 'chunk-end',
            requestId: msg.requestId,
          }));
          
          this.stats.bytesShared += chunk.byteLength;
          
        } else {
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

  // ========== SIGNALING ==========

  async _startSignaling() {
    // Poll for signals
    this.pollInterval = setInterval(async () => {
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
            await fetch(`${this.signalingUrl}?id=${signal.id}`, {
              method: 'DELETE',
            });
          }
        }
      } catch (error) {
        console.warn('Signaling poll error:', error.message);
      }
    }, 2000); // Poll every 2s
  }

  async _sendSignal(data) {
    try {
      await fetch(this.signalingUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: this.roomId,
          from_peer: this.peerId,
          to_peer: data.to || null,
          type: data.type,
          payload: data,
        }),
      });
    } catch (error) {
      console.error('Send signal error:', error);
    }
  }

  async _handleSignal(signal) {
    const { from_peer, type, payload } = signal;
    
    // Ignore own signals
    if (from_peer === this.peerId) return;

    try {
      switch (type) {
        case 'peer-join':
          // New peer joined, maybe connect
          if (this.peers.size < this.config.maxPeers) {
            await this.createPeerConnection(from_peer);
          }
          break;

        case 'offer':
          await this._handleOffer(from_peer, payload.offer);
          break;

        case 'answer':
          await this._handleAnswer(from_peer, payload.answer);
          break;

        case 'ice-candidate':
          await this._handleIceCandidate(from_peer, payload.candidate);
          break;
      }
    } catch (error) {
      console.error('Handle signal error:', error);
    }
  }

  async _handleOffer(peerId, offer) {
    try {
      let peer = this.peers.get(peerId);
      
      if (!peer) {
        // Create new peer connection
        const pc = new RTCPeerConnection({
          iceServers: this.config.iceServers,
        });

        pc.ondatachannel = (event) => {
          this._setupDataChannel(peerId, event.channel);
          peer.dataChannel = event.channel;
        };

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            this._sendSignal({
              type: 'ice-candidate',
              to: peerId,
              candidate: event.candidate,
            });
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

      await peer.connection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peer.connection.createAnswer();
      await peer.connection.setLocalDescription(answer);
      
      await this._sendSignal({
        type: 'answer',
        to: peerId,
        answer: peer.connection.localDescription,
      });
    } catch (error) {
      console.error('Handle offer error:', error);
    }
  }

  async _handleAnswer(peerId, answer) {
    const peer = this.peers.get(peerId);
    if (peer && peer.connection) {
      await peer.connection.setRemoteDescription(new RTCSessionDescription(answer));
    }
  }

  async _handleIceCandidate(peerId, candidate) {
    const peer = this.peers.get(peerId);
    if (peer && peer.connection) {
      await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  // ========== PEER HEALTH ==========

  _startHealthMonitoring() {
    setInterval(() => {
      for (const [peerId, health] of this.peerHealth) {
        // Degrade health over time
        this.peerHealth.set(peerId, Math.max(0, health - 10));
        
        // Remove dead peers
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
        return peer.connected && health > 50;
      })
      .sort((a, b) => {
        // Sort by health score
        const healthA = this.peerHealth.get(a.id) || 0;
        const healthB = this.peerHealth.get(b.id) || 0;
        return healthB - healthA;
      });
  }

  _recordPeerFailure(peerId) {
    const currentHealth = this.peerHealth.get(peerId) || 100;
    this.peerHealth.set(peerId, Math.max(0, currentHealth - 30));
  }

  _removePeer(peerId) {
    const peer = this.peers.get(peerId);
    if (peer) {
      if (peer.dataChannel) peer.dataChannel.close();
      if (peer.connection) peer.connection.close();
      this.peers.delete(peerId);
      this.peerHealth.delete(peerId);
      console.log(`❌ Removed peer: ${peerId}`);
    }
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

  // ========== STATS & MONITORING ==========

  getStats() {
    const offloadRatio = this.stats.p2pHits / 
      (this.stats.p2pHits + this.stats.cdnFallbacks) || 0;
    
    return {
      enabled: this.enabled,
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

  // ========== CLEANUP ==========

  destroy() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }

    for (const peer of this.peers.values()) {
      if (peer.dataChannel) peer.dataChannel.close();
      if (peer.connection) peer.connection.close();
    }

    this.peers.clear();
    this.chunkCache.clear();
    this.peerHealth.clear();
    
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

export default P2PEngine;