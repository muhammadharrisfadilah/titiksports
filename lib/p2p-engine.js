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
  }

  /**
   * Initialize P2P engine dengan signaling server
   */
  async init(signalingServerUrl) {
    try {
      this.signalingServer = new WebSocket(signalingServerUrl);

      this.signalingServer.onmessage = (event) => {
        this.handleSignalingMessage(JSON.parse(event.data));
      };

      this.signalingServer.onerror = (error) => {
        console.error('Signaling server error:', error);
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
   * Handle signaling messages
   */
  async handleSignalingMessage(message) {
    try {
      const { type, peerId, data } = message;

      let peerConnection = this.peers.get(peerId);
      if (!peerConnection) {
        peerConnection = await this.createPeerConnection(peerId);
      }

      switch (type) {
        case 'offer':
          await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);
          this.sendSignalingMessage({
            type: 'answer',
            peerId,
            data: { answer },
          });
          break;

        case 'answer':
          await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
          break;

        case 'ice-candidate':
          try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
          } catch (error) {
            console.warn('Add ICE candidate error:', error);
          }
          break;

        default:
          console.warn('Unknown signaling message type:', type);
      }
    } catch (error) {
      console.error('Handle signaling message error:', error);
    }
  }

  /**
   * Send signaling message ke server
   */
  sendSignalingMessage(message) {
    if (this.signalingServer && this.signalingServer.readyState === WebSocket.OPEN) {
      this.signalingServer.send(JSON.stringify(message));
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
