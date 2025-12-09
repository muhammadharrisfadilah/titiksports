"use client";

/**
 * 🔗 P2P Status Component - Enhanced
 * Shows real-time P2P stats from the P2P Engine
 */

import { useState, useEffect } from 'react';
import { getP2PEngine } from '@/lib/p2p-engine';
import { cn } from '@/lib/utils';

export default function P2PStatus({ className, compact = false }) {
  const [stats, setStats] = useState({
    enabled: false,
    peerId: null,
    peers: 0,
    healthyPeers: 0,
    p2pHits: 0,
    p2pMisses: 0,
    cdnFallbacks: 0,
    offloadRatio: '0%',
    bytesFromPeers: '0 MB',
    bytesShared: '0 MB',
    avgLatency: '0ms',
  });
  
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  useEffect(() => {
    const updateStats = () => {
      try {
        const p2pEngine = getP2PEngine();
        
        if (!p2pEngine || !p2pEngine.enabled) {
          setStats(prev => ({ ...prev, enabled: false }));
          return;
        }

        const engineStats = p2pEngine.getStats();
        
        setStats({
          enabled: engineStats.enabled || false,
          peerId: engineStats.peerId || null,
          peers: engineStats.peers || 0,
          healthyPeers: engineStats.healthyPeers || 0,
          p2pHits: engineStats.p2pHits || 0,
          p2pMisses: engineStats.p2pMisses || 0,
          cdnFallbacks: engineStats.cdnFallbacks || 0,
          offloadRatio: engineStats.offloadRatio || '0%',
          bytesFromPeers: engineStats.bytesFromPeers || '0 MB',
          bytesShared: engineStats.bytesShared || '0 MB',
          avgLatency: engineStats.avgLatency || '0ms',
        });
        
        setLastUpdate(Date.now());
        setError(null);
      } catch (err) {
        console.error('[P2P Status] Error:', err);
        setError(err.message);
      }
    };

    // Initial update
    updateStats();

    // Poll every 2 seconds
    const interval = setInterval(updateStats, 2000);

    return () => clearInterval(interval);
  }, []);

  // Calculate savings (rough estimate: $0.10 per GB)
  const calculateSavings = () => {
    const bytes = parseFloat(stats.bytesFromPeers) || 0;
    return `$${(bytes * 0.1).toFixed(2)}`;
  };

  // Connection status
  const connectionStatus = stats.enabled 
    ? stats.healthyPeers > 0 
      ? 'connected' 
      : 'waiting'
    : 'disabled';

  // Compact view
  if (compact) {
    return (
      <div className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium",
        connectionStatus === 'connected' && "bg-green-500/20 text-green-400",
        connectionStatus === 'waiting' && "bg-yellow-500/20 text-yellow-400",
        connectionStatus === 'disabled' && "bg-gray-500/20 text-gray-400",
        className
      )}>
        <span className={cn(
          "w-2 h-2 rounded-full",
          connectionStatus === 'connected' && "bg-green-500 animate-pulse",
          connectionStatus === 'waiting' && "bg-yellow-500",
          connectionStatus === 'disabled' && "bg-gray-500",
        )} />
        <span>
          {connectionStatus === 'connected' && `${stats.healthyPeers} peers`}
          {connectionStatus === 'waiting' && 'Connecting...'}
          {connectionStatus === 'disabled' && 'P2P Off'}
        </span>
        {stats.offloadRatio !== '0%' && (
          <span className="text-green-400 font-bold">
            ↓{stats.offloadRatio}
          </span>
        )}
      </div>
    );
  }

  // Full view
  return (
    <div className={cn(
      "p-4 rounded-lg bg-gray-800/50 backdrop-blur border",
      connectionStatus === 'connected' && "border-green-500/30",
      connectionStatus === 'waiting' && "border-yellow-500/30",
      connectionStatus === 'disabled' && "border-gray-500/30",
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={cn(
            "w-3 h-3 rounded-full",
            connectionStatus === 'connected' && "bg-green-500 animate-pulse",
            connectionStatus === 'waiting' && "bg-yellow-500 animate-pulse",
            connectionStatus === 'disabled' && "bg-gray-500",
          )} />
          <strong className="text-white">P2P Status</strong>
        </div>
        <span className="text-xs text-gray-400">
          {connectionStatus === 'connected' && '🟢 Active'}
          {connectionStatus === 'waiting' && '🟡 Waiting'}
          {connectionStatus === 'disabled' && '⚫ Disabled'}
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-3 p-2 bg-red-500/20 rounded text-xs text-red-400">
          ⚠️ {error}
        </div>
      )}

      {/* Stats Grid */}
      {stats.enabled ? (
        <div className="space-y-3">
          {/* Peer Info */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">Total Peers:</span>
              <span className="font-mono text-white">{stats.peers}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Healthy:</span>
              <span className={cn(
                "font-mono",
                stats.healthyPeers > 0 ? "text-green-400" : "text-yellow-400"
              )}>
                {stats.healthyPeers}
              </span>
            </div>
          </div>

          {/* Transfer Stats */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">P2P Hits:</span>
              <span className="font-mono text-green-400">{stats.p2pHits}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">CDN Fallback:</span>
              <span className="font-mono text-gray-300">{stats.cdnFallbacks}</span>
            </div>
          </div>

          {/* Bandwidth */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-400">From Peers:</span>
              <span className="font-mono text-blue-400">{stats.bytesFromPeers}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Shared:</span>
              <span className="font-mono text-purple-400">{stats.bytesShared}</span>
            </div>
          </div>

          {/* Offload & Savings */}
          <div className="pt-2 border-t border-white/10">
            <div className="flex justify-between items-center">
              <div className="text-xs">
                <span className="text-gray-400">Offload Ratio: </span>
                <span className={cn(
                  "font-mono font-bold",
                  parseFloat(stats.offloadRatio) > 20 ? "text-green-400" : "text-gray-300"
                )}>
                  {stats.offloadRatio}
                </span>
              </div>
              <div className="text-xs">
                <span className="text-gray-400">💰 Saved: </span>
                <span className="font-mono font-bold text-green-400">
                  {calculateSavings()}
                </span>
              </div>
            </div>
          </div>

          {/* Latency */}
          {stats.avgLatency !== '0ms' && (
            <div className="text-xs text-gray-400">
              Avg Latency: <span className="font-mono">{stats.avgLatency}</span>
            </div>
          )}

          {/* Peer ID (debug) */}
          {process.env.NODE_ENV === 'development' && stats.peerId && (
            <div className="text-xs text-gray-500 truncate">
              ID: {stats.peerId}
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-4 text-gray-400 text-sm">
          <p>P2P is disabled or not initialized</p>
          <p className="text-xs mt-1">
            Set NEXT_PUBLIC_ENABLE_P2P=true to enable
          </p>
        </div>
      )}

      {/* Last Update */}
      {lastUpdate && (
        <div className="mt-3 pt-2 border-t border-white/5 text-xs text-gray-500 text-right">
          Updated: {new Date(lastUpdate).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

// ========== MINI VERSION ==========

export function P2PStatusMini() {
  return <P2PStatus compact />;
}

// ========== FLOATING WIDGET ==========

export function P2PStatusWidget() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {expanded ? (
        <div className="relative">
          <button
            onClick={() => setExpanded(false)}
            className="absolute -top-2 -right-2 w-6 h-6 bg-gray-700 rounded-full text-xs text-white hover:bg-gray-600 z-10"
          >
            ✕
          </button>
          <P2PStatus className="w-72 shadow-xl" />
        </div>
      ) : (
        <button
          onClick={() => setExpanded(true)}
          className="bg-gray-800 hover:bg-gray-700 rounded-full p-2 shadow-lg transition"
        >
          <P2PStatus compact />
        </button>
      )}
    </div>
  );
}