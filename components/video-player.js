"use client";

/**
 * 🎬 Video Player with P2P Support - FIXED v2
 * 
 * FIXES:
 * ✅ Token auto-refresh before expiry
 * ✅ Proper 403 error handling
 * ✅ P2P engine room management
 * ✅ Better HLS config with P2P loader
 * ✅ Improved error recovery
 */

import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";
import { getP2PEngine, resetP2PEngine } from "@/lib/p2p-engine";
import P2PLoader from "@/lib/hls-p2p-loader";
import { createSecureStreamUrl, refreshToken, clearTokenCache } from "@/lib/token-manager";
import { getPerformanceMonitor } from "@/lib/performance-monitor";
import { getOptimizedHLSConfig, STREAMING_CONSTANTS } from "@/lib/streaming-constants";
import { cn } from "@/lib/utils";

const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL;
const ENABLE_P2P = process.env.NEXT_PUBLIC_ENABLE_P2P !== "false";

// Validate environment
if (typeof window !== "undefined" && !WORKER_URL) {
  console.error("❌ NEXT_PUBLIC_WORKER_URL not configured!");
}

export default function VideoPlayerWithP2P({ match }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const p2pEngineRef = useRef(null);
  const monitorRef = useRef(null);
  const tokenRefreshIntervalRef = useRef(null);
  const initAttemptRef = useRef(0);
  const currentTokenRef = useRef(null);

  const [currentLink, setCurrentLink] = useState("link1");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showStats, setShowStats] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [failedLinks, setFailedLinks] = useState(new Set());
  const [isRetrying, setIsRetrying] = useState(false);
  const [streamState, setStreamState] = useState('INITIALIZING');

  const [stats, setStats] = useState({
    buffered: "0s",
    quality: "Auto",
    droppedFrames: 0,
    p2pEnabled: ENABLE_P2P,
    peers: 0,
    healthyPeers: 0,
    p2pHits: 0,
    offloadRatio: "0%",
    bytesFromPeers: "0 MB",
    bytesShared: "0 MB",
    savings: "$0.00",
  });

  // Available links
  const availableLinks = [
    { id: "link1", url: match.stream_url1, ref: match.referer1, org: match.origin1, enabled: !!match.stream_url1 },
    { id: "link2", url: match.stream_url2, ref: match.referer2, org: match.origin2, enabled: !!match.stream_url2 },
    { id: "link3", url: match.stream_url3, ref: match.referer3, org: match.origin3, enabled: !!match.stream_url3 },
  ].filter((link) => link.enabled);

  // ========== TOKEN REFRESH ==========
  
  const setupTokenRefresh = useCallback(() => {
    // Clear existing interval
    if (tokenRefreshIntervalRef.current) {
      clearInterval(tokenRefreshIntervalRef.current);
    }

    // Refresh token periodically (25 minutes, 5 min before 30 min expiry)
    tokenRefreshIntervalRef.current = setInterval(async () => {
      console.log('🔄 Refreshing token...');
      
      try {
        const newToken = await refreshToken(match.id, currentLink);
        currentTokenRef.current = newToken;
        console.log('✅ Token refreshed');
      } catch (err) {
        console.error('❌ Token refresh failed:', err);
        // Token refresh failed - might need to reload
        handleTokenExpired();
      }
    }, STREAMING_CONSTANTS.TOKEN_REFRESH_INTERVAL);

    console.log('⏰ Token refresh scheduled every', 
      STREAMING_CONSTANTS.TOKEN_REFRESH_INTERVAL / 60000, 'minutes');
  }, [match.id, currentLink]);

  const handleTokenExpired = useCallback(() => {
    console.warn('🔑 Token expired, reinitializing...');
    
    // Clear token cache
    clearTokenCache(match.id, currentLink);
    
    // Reinitialize player with new token
    setRetryCount(prev => prev + 1);
    initAttemptRef.current = 0;
    
    // Small delay to ensure token is regenerated
    setTimeout(() => {
      initPlayer();
    }, 1000);
  }, [match.id, currentLink]);

  // ========== INITIALIZATION ==========

  const initPlayer = useCallback(async () => {
    // Check if link already failed
    if (failedLinks.has(currentLink)) {
      console.warn(`⚠️ Link ${currentLink} already failed, finding alternative`);
      const nextLink = findNextAvailableLink();
      if (nextLink) {
        setCurrentLink(nextLink.id);
      } else {
        setError("All streams unavailable");
        setLoading(false);
      }
      return;
    }

    // Prevent rapid retries
    if (isRetrying) {
      console.log("⏳ Init blocked - already retrying");
      return;
    }

    // Check global retry limit
    if (retryCount >= 5) {
      setError("Stream failed after multiple retries. Please refresh the page.");
      setLoading(false);
      return;
    }

    initAttemptRef.current += 1;
    const attemptId = initAttemptRef.current;
    console.log(`🔄 Init attempt #${attemptId} for ${currentLink}`);

    setIsRetrying(true);
    setLoading(true);
    setError(null);
    setStreamState('INITIALIZING');

    try {
      // Initialize performance monitor
      if (!monitorRef.current) {
        monitorRef.current = getPerformanceMonitor();
        monitorRef.current.markInitStart();
      }

      // Initialize P2P engine
      await initP2PEngine();

      // Get current link config
      const linkConfig = availableLinks.find(l => l.id === currentLink);
      if (!linkConfig) {
        throw new Error(`Link ${currentLink} not configured`);
      }

      // Create secure manifest URL with fresh token
      const manifestUrl = await createSecureStreamUrl(
        `${WORKER_URL}/api/stream/manifest`,
        match.id,
        currentLink
      );

      console.log('📡 Manifest URL:', manifestUrl);

      // Initialize HLS
      await initHls(manifestUrl);

      // Setup token refresh
      setupTokenRefresh();

      setStreamState('READY');

    } catch (err) {
      console.error(`❌ Init error (attempt #${attemptId}):`, err);
      
      // Check if it's a token error
      if (err.message?.includes('403') || err.message?.includes('Token')) {
        handleTokenExpired();
        return;
      }

      setError(err.message || "Failed to initialize player");
      setLoading(false);
      setStreamState('ERROR');

      // Mark this link as failed
      setFailedLinks((prev) => new Set([...prev, currentLink]));

      // Try next link
      const nextLink = findNextAvailableLink();
      if (nextLink) {
        console.log(`🔄 Will try ${nextLink.id} in 2s...`);
        setTimeout(() => {
          setCurrentLink(nextLink.id);
        }, 2000);
      }
    } finally {
      setIsRetrying(false);
    }
  }, [currentLink, match.id, retryCount, failedLinks, isRetrying, availableLinks, setupTokenRefresh, handleTokenExpired]);

  const initP2PEngine = async () => {
    if (!ENABLE_P2P) return;

    try {
      // Reset P2P engine if room changed
      const currentP2P = p2pEngineRef.current;
      if (currentP2P && currentP2P.roomId !== `match_${match.id}`) {
        console.log('🔄 P2P room changed, resetting...');
        await currentP2P.destroy();
        p2pEngineRef.current = null;
      }

      // Initialize new P2P engine
      if (!p2pEngineRef.current) {
        const p2pEngine = getP2PEngine();
        const initialized = await p2pEngine.init(`match_${match.id}`, {
          signalingUrl: "/api/p2p-signal",
        });

        if (initialized) {
          p2pEngineRef.current = p2pEngine;
          console.log("✅ P2P Engine ready");
        } else {
          console.warn("⚠️ P2P init failed, using CDN only");
        }
      }
    } catch (err) {
      console.error('P2P init error:', err);
      // Continue without P2P
    }
  };

  const initHls = async (manifestUrl) => {
    const video = videoRef.current;
    if (!video) throw new Error('Video element not ready');

    // Cleanup existing HLS
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (Hls.isSupported()) {
      // Get optimized config based on device/connection
      const baseConfig = getOptimizedHLSConfig();

      const hlsConfig = {
        ...baseConfig,
        
        // Use P2P Loader if available
        loader: P2PLoader,
        
        // XHR setup for custom headers (if needed)
        xhrSetup: (xhr, url) => {
          // Add any custom headers here if needed
        },
      };

      const hls = new Hls(hlsConfig);
      hlsRef.current = hls;

      // Load source
      hls.loadSource(manifestUrl);
      hls.attachMedia(video);

      // Event handlers
      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        console.log("✅ Manifest loaded:", {
          levels: data.levels?.length || 0,
          audioTracks: data.audioTracks?.length || 0,
        });
        
        video.play().catch((e) => console.log("Autoplay prevented:", e.message));
        setLoading(false);
        setStreamState('PLAYING');

        if (monitorRef.current) {
          monitorRef.current.markInitEnd();
        }
      });

      // First frame
      video.addEventListener("canplay", () => {
        if (monitorRef.current) {
          monitorRef.current.markFirstFrame();
        }
      }, { once: true });

      // Quality switch
      hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
        const level = hls.levels[data.level];
        if (level) {
          console.log(`📺 Quality: ${level.height}p`);
          if (monitorRef.current) {
            monitorRef.current.recordQualitySwitch(null, level, "auto");
          }
        }
      });

      // Fragment loaded
      hls.on(Hls.Events.FRAG_LOADED, (event, data) => {
        // Track fragment loads for debugging
        if (data.frag && data.stats) {
          const loadTime = data.stats.loading.end - data.stats.loading.start;
          if (loadTime > 3000) {
            console.warn(`⚠️ Slow fragment load: ${loadTime}ms`);
          }
        }
      });

      // Error handling
      hls.on(Hls.Events.ERROR, (event, data) => {
        handleHlsError(data);
      });

      // Buffer stall detection
      video.addEventListener('waiting', () => {
        if (streamState === 'PLAYING') {
          setStreamState('BUFFERING');
          console.log('⏳ Buffering...');
        }
      });

      video.addEventListener('playing', () => {
        if (streamState === 'BUFFERING') {
          setStreamState('PLAYING');
          console.log('▶️ Playing');
        }
      });

    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Native HLS (Safari)
      video.src = manifestUrl;
      video.addEventListener("loadedmetadata", () => {
        setLoading(false);
        setStreamState('READY');
      });
    } else {
      throw new Error("HLS not supported in this browser");
    }
  };

  const handleHlsError = (data) => {
    const { type, details, fatal, response } = data;
    
    console.error("🔴 HLS Error:", {
      type,
      details,
      fatal,
      status: response?.code || 'N/A',
    });

    // Handle 403 specifically
    if (response?.code === 403) {
      console.warn("🔑 403 Forbidden - likely token expired");
      
      if (!fatal) {
        // Non-fatal 403 - might recover automatically
        console.log("⏳ Waiting for auto-recovery...");
        return;
      }
      
      // Fatal 403 - need token refresh
      handleTokenExpired();
      return;
    }

    // Non-fatal errors
    if (!fatal) {
      console.warn("⚠️ Non-fatal HLS error, player will auto-recover");
      return;
    }

    // Fatal errors
    handleFatalError(data);
  };

  const handleFatalError = (data) => {
    console.error("💥 Fatal HLS error:", data.type, data.details);

    if (isRetrying) {
      console.warn("⏳ Already handling error, skipping");
      return;
    }

    setStreamState('ERROR');

    // Mark current link as failed
    setFailedLinks((prev) => new Set([...prev, currentLink]));

    // Find next available link
    const nextLink = findNextAvailableLink();

    if (!nextLink) {
      setError("All available streams have failed. Please try again later.");
      setLoading(false);
      return;
    }

    console.log(`🔄 Switching: ${currentLink} → ${nextLink.id}`);

    // Delay before switch
    setTimeout(() => {
      setRetryCount((prev) => prev + 1);
      setCurrentLink(nextLink.id);
    }, 2000);
  };

  const findNextAvailableLink = () => {
    return availableLinks.find(
      (link) => !failedLinks.has(link.id) && link.id !== currentLink
    );
  };

  // ========== CLEANUP ==========

  const cleanup = useCallback(() => {
    console.log("🧹 Cleanup initiated");

    // Stop token refresh
    if (tokenRefreshIntervalRef.current) {
      clearInterval(tokenRefreshIntervalRef.current);
      tokenRefreshIntervalRef.current = null;
    }

    // Destroy HLS
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
      console.log("✅ HLS destroyed");
    }

    // Cleanup video
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute("src");
      videoRef.current.load();
    }
  }, []);

  // ========== EFFECTS ==========

  useEffect(() => {
    if (isRetrying) return;

    initPlayer();

    const handleUnload = () => {
      if (p2pEngineRef.current) {
        console.log("🧹 Page unload - destroying P2P");
        p2pEngineRef.current.destroy();
      }
    };

    window.addEventListener("beforeunload", handleUnload);

    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      cleanup();
    };
  }, [currentLink, match.id]);

  // Reset when match changes
  useEffect(() => {
    console.log('📺 Match changed:', match.id);
    setRetryCount(0);
    setFailedLinks(new Set());
    setError(null);
    setCurrentLink('link1');
    
    // Reset P2P for new room
    if (p2pEngineRef.current) {
      resetP2PEngine();
      p2pEngineRef.current = null;
    }
  }, [match.id]);

  // ========== STATS UPDATE ==========

  useEffect(() => {
    if (!showStats) return;

    const video = videoRef.current;
    if (!video) return;

    const interval = setInterval(() => {
      if (video.paused && streamState !== 'BUFFERING') return;

      const hls = hlsRef.current;
      const p2p = p2pEngineRef.current;

      // Video stats
      const buffered = video.buffered.length > 0
        ? `${(video.buffered.end(video.buffered.length - 1) - video.currentTime).toFixed(1)}s`
        : "0s";

      let quality = "Auto";
      if (hls?.levels && hls.currentLevel >= 0) {
        const level = hls.levels[hls.currentLevel];
        quality = level ? `${level.height}p` : "Auto";
      }

      const droppedFrames = video.getVideoPlaybackQuality?.()?.droppedVideoFrames || 0;

      // P2P stats
      let p2pStats = {
        p2pEnabled: ENABLE_P2P,
        peers: 0,
        healthyPeers: 0,
        p2pHits: 0,
        offloadRatio: "0%",
        bytesFromPeers: "0 MB",
        bytesShared: "0 MB",
        savings: "$0.00",
      };

      if (p2p && ENABLE_P2P) {
        const engineStats = p2p.getStats();
        const bytesFromPeers = parseFloat(engineStats.bytesFromPeers) || 0;
        p2pStats = {
          p2pEnabled: true,
          peers: engineStats.peers || 0,
          healthyPeers: engineStats.healthyPeers || 0,
          p2pHits: engineStats.p2pHits || 0,
          offloadRatio: engineStats.offloadRatio || "0%",
          bytesFromPeers: engineStats.bytesFromPeers || "0 MB",
          bytesShared: engineStats.bytesShared || "0 MB",
          savings: `$${(bytesFromPeers * 0.1).toFixed(2)}`,
        };
      }

      setStats({
        buffered,
        quality,
        droppedFrames,
        ...p2pStats,
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [showStats, streamState]);

  // ========== MANUAL LINK SWITCH ==========

  const handleLinkSwitch = (linkId) => {
    console.log(`🔄 Manual switch to ${linkId}`);
    
    // Reset all states for manual switch
    setRetryCount(0);
    setFailedLinks(new Set());
    setError(null);
    clearTokenCache(match.id, linkId);
    setCurrentLink(linkId);
  };

  // ========== RENDER ==========

  return (
    <div className="space-y-4">
      {/* Video Container */}
      <div className="relative video-container bg-black aspect-video">
        <video
          ref={videoRef}
          controls
          autoPlay
          playsInline
          className="w-full h-full object-contain"
        />

        {/* Loading Overlay */}
        {loading && (
          <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-10">
            <div className="w-12 h-12 border-4 border-white/30 border-t-red-500 rounded-full animate-spin" />
            <p className="mt-4 text-white">Loading stream...</p>
            {ENABLE_P2P && (
              <p className="mt-2 text-sm text-gray-400">
                🔗 Connecting to peers...
              </p>
            )}
            {retryCount > 0 && (
              <p className="mt-1 text-xs text-yellow-400">
                Retry attempt {retryCount}
              </p>
            )}
          </div>
        )}

        {/* Error Overlay */}
        {error && (
          <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center z-10">
            <div className="text-red-500 text-6xl mb-4">⚠️</div>
            <h3 className="text-xl font-bold text-white mb-2">{error}</h3>
            <button
              onClick={() => {
                setError(null);
                setRetryCount(0);
                setFailedLinks(new Set());
                clearTokenCache(match.id, currentLink);
                initPlayer();
              }}
              className="mt-4 px-6 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white font-semibold transition"
            >
              🔄 Retry
            </button>
          </div>
        )}

        {/* Stream State Badge */}
        {!loading && !error && (
          <div className="absolute top-2 left-2 z-10">
            <span className={cn(
              "px-2 py-1 rounded text-xs font-medium",
              streamState === 'PLAYING' && "bg-green-500/80 text-white",
              streamState === 'BUFFERING' && "bg-yellow-500/80 text-black",
              streamState === 'READY' && "bg-blue-500/80 text-white",
            )}>
              {streamState === 'PLAYING' && '▶️ Live'}
              {streamState === 'BUFFERING' && '⏳ Buffering'}
              {streamState === 'READY' && '✅ Ready'}
            </span>
          </div>
        )}

        {/* Stats Overlay */}
        {showStats && !loading && (
          <div className="absolute top-4 right-4 bg-black/90 backdrop-blur rounded-lg p-4 text-sm max-w-xs z-20">
            <div className="flex justify-between items-center mb-3 pb-2 border-b border-white/20">
              <h4 className="font-bold text-white">📊 Stats</h4>
              <button
                onClick={() => setShowStats(false)}
                className="text-gray-400 hover:text-white text-lg"
              >
                ✕
              </button>
            </div>

            {/* Video Stats */}
            <div className="space-y-1 mb-3">
              <div className="text-xs text-gray-500 font-semibold">VIDEO</div>
              <div className="flex justify-between text-xs text-white">
                <span className="text-gray-400">Buffer:</span>
                <span className="font-mono">{stats.buffered}</span>
              </div>
              <div className="flex justify-between text-xs text-white">
                <span className="text-gray-400">Quality:</span>
                <span className="font-mono">{stats.quality}</span>
              </div>
              <div className="flex justify-between text-xs text-white">
                <span className="text-gray-400">Dropped:</span>
                <span className="font-mono">{stats.droppedFrames}</span>
              </div>
              <div className="flex justify-between text-xs text-white">
                <span className="text-gray-400">State:</span>
                <span className="font-mono">{streamState}</span>
              </div>
            </div>

            {/* P2P Stats */}
            {ENABLE_P2P && (
              <div className="space-y-1 pt-3 border-t border-white/20">
                <div className="text-xs text-gray-500 font-semibold">
                  P2P {stats.peers > 0 ? "🟢" : "🔴"}
                </div>
                <div className="flex justify-between text-xs text-white">
                  <span className="text-gray-400">Peers:</span>
                  <span className="font-mono">{stats.healthyPeers}/{stats.peers}</span>
                </div>
                <div className="flex justify-between text-xs text-white">
                  <span className="text-gray-400">Offload:</span>
                  <span className="font-mono text-green-400">{stats.offloadRatio}</span>
                </div>
                <div className="flex justify-between text-xs text-white">
                  <span className="text-gray-400">From Peers:</span>
                  <span className="font-mono">{stats.bytesFromPeers}</span>
                </div>
                <div className="flex justify-between text-xs text-white">
                  <span className="text-gray-400">Shared:</span>
                  <span className="font-mono">{stats.bytesShared}</span>
                </div>
                <div className="flex justify-between text-xs pt-2 border-t border-green-500/30">
                  <span className="text-gray-400">💰 Saved:</span>
                  <span className="font-mono text-green-400 font-bold">{stats.savings}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          {/* Link Buttons */}
          <div className="flex gap-2">
            {availableLinks.map((link) => (
              <button
                key={link.id}
                onClick={() => handleLinkSwitch(link.id)}
                disabled={loading || isRetrying}
                className={cn(
                  "px-4 py-2 rounded-lg font-semibold transition-all",
                  currentLink === link.id
                    ? "bg-red-600 text-white"
                    : failedLinks.has(link.id)
                    ? "bg-red-900/50 text-red-300 cursor-not-allowed"
                    : "bg-gray-700 hover:bg-gray-600 text-white",
                  (loading || isRetrying) && "opacity-50 cursor-not-allowed"
                )}
              >
                Link {link.id.slice(-1)}
                {failedLinks.has(link.id) && " ❌"}
              </button>
            ))}
          </div>

          {/* Right Controls */}
          <div className="flex gap-3 items-center">
            {ENABLE_P2P && (
              <div className="text-xs">
                <span className={cn(
                  "inline-flex items-center gap-1 px-2 py-1 rounded",
                  stats.peers > 0
                    ? "bg-green-500/20 text-green-400"
                    : "bg-gray-700 text-gray-400"
                )}>
                  🔗 {stats.peers} peer{stats.peers !== 1 ? 's' : ''}
                </span>
              </div>
            )}
            <button
              onClick={() => setShowStats(!showStats)}
              className="text-sm text-gray-400 hover:text-white transition"
            >
              {showStats ? "📊 Hide" : "📊 Stats"}
            </button>
          </div>
        </div>
      </div>

      {/* P2P Info Banner */}
      {ENABLE_P2P && !loading && stats.peers > 0 && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-2xl">💚</span>
            <div>
              <div className="font-semibold text-green-400">
                P2P Active - Reducing Server Load
              </div>
              <div className="text-xs text-gray-400">
                Connected to {stats.peers} peer{stats.peers !== 1 ? 's' : ''} • 
                Offload: {stats.offloadRatio} • 
                Saved: {stats.savings}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
