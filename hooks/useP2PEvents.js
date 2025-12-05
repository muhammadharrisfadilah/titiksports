"use client";

import { useEffect, useState } from 'react';
import p2pEngine from '@/lib/p2p-engine';

// Hook: subscribe to p2pEngine events and expose telemetry + peer counts
export default function useP2PEvents(pollIntervalMs = 2000) {
  const [connectedPeers, setConnectedPeers] = useState(0);
  const [lastMessage, setLastMessage] = useState(null);
  const [telemetry, setTelemetry] = useState(() => p2pEngine?.getTelemetry ? p2pEngine.getTelemetry() : {});

  useEffect(() => {
    let mounted = true;

    function updateTelemetry() {
      if (!mounted) return;
      try {
        const t = p2pEngine?.getTelemetry ? p2pEngine.getTelemetry() : {};
        setTelemetry(t);
      } catch (e) {
        // ignore
      }
    }

    // Event handlers
    const onPeerConnected = () => setConnectedPeers((c) => c + 1);
    const onPeerDisconnected = () => setConnectedPeers((c) => Math.max(0, c - 1));
    const onDataMessage = ({ peerId, message }) => setLastMessage({ peerId, message, ts: Date.now() });

    // attach to emitter if available
    try {
      if (p2pEngine && p2pEngine.emitter) {
        p2pEngine.emitter.on('peerconnected', onPeerConnected);
        p2pEngine.emitter.on('peerdisconnected', onPeerDisconnected);
        p2pEngine.emitter.on('datamessage', onDataMessage);
      }
    } catch (e) {
      // ignore if emitter not present
    }

    // poll telemetry periodically as a fallback
    const interval = setInterval(() => updateTelemetry(), pollIntervalMs);
    // initial snapshot
    updateTelemetry();

    return () => {
      mounted = false;
      clearInterval(interval);
      try {
        if (p2pEngine && p2pEngine.emitter) {
          p2pEngine.emitter.off('peerconnected', onPeerConnected);
          p2pEngine.emitter.off('peerdisconnected', onPeerDisconnected);
          p2pEngine.emitter.off('datamessage', onDataMessage);
        }
      } catch (e) {
        // ignore
      }
    };
  }, [pollIntervalMs]);

  return { connectedPeers, lastMessage, telemetry };
}
