"use client";

/**
 * 🎬 Video Player - SUPER OPTIMIZED FOR SMOOTH PLAYBACK
 * 
 * FIXES:
 * ✅ Token refresh hanya saat benar-benar perlu
 * ✅ Buffer stall handling yang SANGAT toleran
 * ✅ Link switch hanya sebagai last resort
 * ✅ Stats polling dengan requestAnimationFrame (tidak blocking)
 * ✅ Proper cleanup dan memory management
 */

import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";
import { getP2PEngine } from "@/lib/p2p-engine";
import P2PLoader from "@/lib/hls-p2p-loader";
import { createSecureStreamUrl, shouldRefreshToken, getTokenInfo } from "@/lib/token-manager";
import { getOptimizedHLSConfig, STREAMING_CONSTANTS } from "@/lib/streaming-constants";
import { cn } from "@/lib/utils";

const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL;
const ENABLE_P2P = process.env.NEXT_PUBLIC_ENABLE_P2P !== "false";

export default function VideoPlayerWithP2P({ match }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const p2pEngineRef = useRef(null);
  
  // ✅ FIX: Token refresh timer dengan interval yang benar
  const tokenRefreshIntervalRef = useRef(null);
  const statsAnimationFrameRef = useRef(null);
  
  // ✅ FIX: Error tracking per link
  const errorCountRef = useRef({});
  const lastErrorTimeRef = useRef(0);
  const consecutiveStallsRef = useRef(0);
  const isRecoveringRef = useRef(false);

  const [currentLink, setCurrentLink] = useState("link1");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showStats, setShowStats] = useState(false);
  const [failedLinks, setFailedLinks] = useState(new Set());
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
    tokenAge: "0min",
  });

  const availableLinks = [
    { id: "link1", url: match.stream_url1, ref: match.referer1, org: match.origin1, enabled: !!match.stream_url1 },
    { id: "link2", url: match.stream_url2, ref: match.referer2, org: match.origin2, enabled: !!match.stream_url2 },
    { id: "link3", url: match.stream_url3, ref: match.referer3, org: match.origin3, enabled: !!match.stream_url3 },
  ].filter((link) => link.enabled);

  // ========== ✅ FIX: TOKEN REFRESH (HANYA SAAT PERLU) ==========
  
  const setupTokenRefresh = useCallback(() => {
    if (tokenRefreshIntervalRef.current) {
      clearInterval(tokenRefreshIntervalRef.current);
    }

    // ✅ Check token setiap 1 menit, tapi hanya refresh jika perlu
    tokenRefreshIntervalRef.current = setInterval(async () => {
      const needRefresh = shouldRefreshToken(match.id, currentLink);
      
      if (needRefresh) {
        const tokenInfo = getTokenInfo(match.id, currentLink);
        console.log('🔄 Token refresh needed:', {
          isExpired: tokenInfo?.isExpired,
          remainingMin: tokenInfo?.remainingMinutes || 0,
        });
        
        // ✅ Refresh WITHOUT reloading player
        await refreshTokenSilently();
      }
    }, 60000); // Check setiap 1 menit

    console.log('⏰ Token refresh scheduler started');
  }, [match.id, currentLink]);

  const refreshTokenSilently = async () => {
    try {
      const newUrl = await createSecureStreamUrl(
        `${WORKER_URL}/api/stream/manifest`,
        match.id,
        currentLink
      );
      
      // ✅ Update HLS source TANPA reload player
      if (hlsRef.current && newUrl) {
        hlsRef.current.loadSource(newUrl);
        console.log('✅ Token refreshed silently (no player reload)');
      }
    } catch (err) {
      console.error('❌ Silent token refresh failed:', err);
    }
  };

  // ========== INITIALIZATION ==========

  const initP2PEngine = async () => {
    if (!ENABLE_P2P) return;

    try {
      if (!p2pEngineRef.current) {
        const p2pEngine = getP2PEngine();
        const initialized = await p2pEngine.init(`match_${match.id}`, {
          signalingUrl: "/api/p2p-signal",
        });

        if (initialized) {
          p2pEngineRef.current = p2pEngine;
          console.log("✅ P2P Engine ready");
        }
      }
    } catch (err) {
      console.warn('⚠️ P2P init failed:', err.message);
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
      const hlsConfig = {
        ...getOptimizedHLSConfig(),
        loader: P2PLoader,
      };

      const hls = new Hls(hlsConfig);
      hlsRef.current = hls;

      hls.loadSource(manifestUrl);
      hls.attachMedia(video);

      // ========== HLS EVENT HANDLERS ==========

      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        console.log("✅ Manifest loaded:", {
          levels: data.levels?.length || 0,
        });
        
        video.play().catch((e) => console.log("Autoplay prevented"));
        setLoading(false);
        setStreamState('PLAYING');
        
        // ✅ Reset error counters on success
        errorCountRef.current[currentLink] = 0;
        consecutiveStallsRef.current = 0;
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
        const level = hls.levels[data.level];
        if (level) {
          console.log(`📺 Quality: ${level.height}p`);
        }
      });

      // ========== ✅ FIX: ERROR HANDLING (SUPER TOLERAN) ==========
      
      hls.on(Hls.Events.ERROR, (event, data) => {
        handleHlsError(data);
      });

      // ========== ✅ FIX: BUFFER STALL HANDLING ==========
      
      video.addEventListener('waiting', () => {
        if (streamState === 'PLAYING') {
          consecutiveStallsRef.current++;
          console.log(`⏳ Buffer stall #${consecutiveStallsRef.current}`);
          setStreamState('BUFFERING');
        }
      });

      video.addEventListener('playing', () => {
        if (streamState === 'BUFFERING') {
          console.log('▶️ Playback resumed');
          consecutiveStallsRef.current = 0; // ✅ Reset on successful play
          setStreamState('PLAYING');
        }
      });

      // ✅ Canplay = ada data, siap play
      video.addEventListener('canplay', () => {
        if (streamState === 'BUFFERING' || streamState === 'INITIALIZING') {
          setStreamState('READY');
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

  // ========== ✅ FIX: ERROR HANDLER (SANGAT KONSERVATIF) ==========
  
  const handleHlsError = (data) => {
    const { type, details, fatal, response } = data;
    const now = Date.now();
    
    // ✅ Cooldown untuk prevent spam
    if (now - lastErrorTimeRef.current < STREAMING_CONSTANTS.ERROR_COOLDOWN) {
      return;
    }
    lastErrorTimeRef.current = now;
    
    console.error("🔴 HLS Error:", {
      type,
      details,
      fatal,
      status: response?.code,
    });

    // ✅ Track errors per link
    if (!errorCountRef.current[currentLink]) {
      errorCountRef.current[currentLink] = 0;
    }
    errorCountRef.current[currentLink]++;

    // ========== TOKEN EXPIRED (403) ==========
    if (response?.code === 403) {
      console.warn("🔑 403 Forbidden - refreshing token...");
      
      if (fatal) {
        refreshTokenSilently();
      }
      return;
    }

    // ========== BUFFER STALL ==========
    if (details === Hls.ErrorDetails.BUFFER_STALLED_ERROR || 
        details === Hls.ErrorDetails.BUFFER_NUDGE_ON_STALL) {
      
      if (isRecoveringRef.current) return;
      
      consecutiveStallsRef.current++;
      console.warn(`⏸️ Buffer stall #${consecutiveStallsRef.current}/${STREAMING_CONSTANTS.MAX_STALL_RETRIES}`);
      
      // ✅ SUPER toleran - hanya switch setelah 20 stalls
      if (consecutiveStallsRef.current >= STREAMING_CONSTANTS.MAX_STALL_RETRIES) {
        console.error('❌ Too many stalls, switching link');
        handleFatalError();
      } else {
        // ✅ Recovery: nudge playback
        isRecoveringRef.current = true;
        
        setTimeout(() => {
          const video = videoRef.current;
          if (video && hlsRef.current) {
            // Try to resume
            if (video.paused) {
              video.play().catch(() => {});
            }
            
            // Nudge forward slightly
            try {
              video.currentTime += 0.1;
            } catch (e) {}
          }
          
          setTimeout(() => {
            isRecoveringRef.current = false;
          }, 1000);
        }, 500);
      }
      return;
    }

    // ========== NON-FATAL ERRORS ==========
    if (!fatal) {
      console.warn("⚠️ Non-fatal error, auto-recovery...");
      return;
    }

    // ========== FATAL NETWORK ERROR ==========
    if (type === Hls.ErrorTypes.NETWORK_ERROR) {
      const errorCount = errorCountRef.current[currentLink] || 0;
      
      // ✅ Retry banyak kali sebelum switch
      if (errorCount < STREAMING_CONSTANTS.RECOVERY_CONFIG.ERRORS_BEFORE_SWITCH) {
        console.log(`🔄 Network error, retry ${errorCount}/${STREAMING_CONSTANTS.RECOVERY_CONFIG.ERRORS_BEFORE_SWITCH}`);
        
        setTimeout(() => {
          if (hlsRef.current) {
            hlsRef.current.startLoad();
          }
        }, 2000);
        return;
      }
      
      console.error('❌ Network error - max retries, switching link');
      handleFatalError();
      return;
    }

    // ========== FATAL MEDIA ERROR ==========
    if (type === Hls.ErrorTypes.MEDIA_ERROR) {
      console.warn('🎥 Media error, attempting recovery...');
      try {
        if (hlsRef.current) {
          hlsRef.current.recoverMediaError();
          errorCountRef.current[currentLink] = 0;
        }
        return;
      } catch (e) {
        console.error('Media recovery failed');
      }
    }

    // ========== OTHER FATAL ERRORS ==========
    handleFatalError();
  };

  const handleFatalError = () => {
    console.error("💥 Fatal error, switching link...");

    setStreamState('ERROR');
    setFailedLinks((prev) => new Set([...prev, currentLink]));

    const nextLink = findNextAvailableLink();

    if (!nextLink) {
      setError("All streams unavailable. Please try again later.");
      setLoading(false);
      return;
    }

    console.log(`🔄 Switching: ${currentLink} → ${nextLink.id}`);

    setTimeout(() => {
      errorCountRef.current = {}; // Reset all errors
      consecutiveStallsRef.current = 0;
      setCurrentLink(nextLink.id);
    }, 3000); // ✅ Delay sebelum switch
  };

  const findNextAvailableLink = () => {
    return availableLinks.find(
      (link) => !failedLinks.has(link.id) && link.id !== currentLink
    );
  };

  // ========== MAIN INIT ==========

  const initPlayer = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStreamState('INITIALIZING');

    try {
      await initP2PEngine();

      const manifestUrl = await createSecureStreamUrl(
        `${WORKER_URL}/api/stream/manifest`,
        match.id,
        currentLink
      );

      await initHls(manifestUrl);

      setupTokenRefresh();

      setStreamState('READY');

    } catch (err) {
      console.error(`❌ Init error:`, err);
      setError(err.message || "Failed to initialize player");
      setLoading(false);
      setStreamState('ERROR');
    }
  }, [currentLink, match.id, setupTokenRefresh]);

  // ========== ✅ FIX: STATS UPDATE (NON-BLOCKING) ==========

  useEffect(() => {
    if (!showStats) return;

    const video = videoRef.current;
    if (!video) return;

    let lastUpdate = 0;
    const updateInterval = 2000; // Update every 2s

    const updateStats = () => {
      const now = performance.now();
      
      // Throttle updates
      if (now - lastUpdate < updateInterval) {
        statsAnimationFrameRef.current = requestAnimationFrame(updateStats);
        return;
      }
      lastUpdate = now;

      // Video stats
      const buffered = video.buffered.length > 0
        ? `${(video.buffered.end(video.buffered.length - 1) - video.currentTime).toFixed(1)}s`
        : "0s";

      let quality = "Auto";
      if (hlsRef.current?.levels && hlsRef.current.currentLevel >= 0) {
        const level = hlsRef.current.levels[hlsRef.current.currentLevel];
        quality = level ? `${level.height}p` : "Auto";
      }

      const droppedFrames = video.getVideoPlaybackQuality?.()?.droppedVideoFrames || 0;

      // P2P stats (non-blocking)
      let p2pStats = {
        p2pEnabled: ENABLE_P2P,
        peers: 0,
        healthyPeers: 0,
        p2pHits: 0,
        offloadRatio: "0%",
        bytesFromPeers: "0 MB",
      };

      if (p2pEngineRef.current && ENABLE_P2P) {
        try {
          const engineStats = p2pEngineRef.current.getStats();
          p2pStats = {
            p2pEnabled: true,
            peers: engineStats.peers || 0,
            healthyPeers: engineStats.healthyPeers || 0,
            p2pHits: engineStats.p2pHits || 0,
            offloadRatio: engineStats.offloadRatio || "0%",
            bytesFromPeers: engineStats.bytesFromPeers || "0 MB",
          };
        } catch (e) {}
      }

      // Token info
      const tokenInfo = getTokenInfo(match.id, currentLink);
      const tokenAge = tokenInfo ? `${tokenInfo.remainingMinutes}min` : "0min";

      setStats({
        buffered,
        quality,
        droppedFrames,
        tokenAge,
        ...p2pStats,
      });

      statsAnimationFrameRef.current = requestAnimationFrame(updateStats);
    };

    statsAnimationFrameRef.current = requestAnimationFrame(updateStats);

    return () => {
      if (statsAnimationFrameRef.current) {
        cancelAnimationFrame(statsAnimationFrameRef.current);
      }
    };
  }, [showStats, match.id, currentLink]);

  // ========== CLEANUP ==========

  const cleanup = useCallback(() => {
    console.log("🧹 Cleanup initiated");

    if (tokenRefreshIntervalRef.current) {
      clearInterval(tokenRefreshIntervalRef.current);
      tokenRefreshIntervalRef.current = null;
    }

    if (statsAnimationFrameRef.current) {
      cancelAnimationFrame(statsAnimationFrameRef.current);
    }

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute("src");
      videoRef.current.load();
    }
  }, []);

  // ========== EFFECTS ==========

  useEffect(() => {
    initPlayer();

    return () => {
      cleanup();
    };
  }, [currentLink, match.id]);

  // ========== MANUAL LINK SWITCH ==========

  const handleLinkSwitch = (linkId) => {
    console.log(`🔄 Manual switch to ${linkId}`);
    
    errorCountRef.current = {};
    consecutiveStallsRef.current = 0;
    setFailedLinks(new Set());
    setError(null);
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
                errorCountRef.current = {};
                setFailedLinks(new Set());
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
              <div className="flex justify-between text-xs text-white">
                <span className="text-gray-400">Token:</span>
                <span className="font-mono">{stats.tokenAge}</span>
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
                disabled={loading}
                className={cn(
                  "px-4 py-2 rounded-lg font-semibold transition-all",
                  currentLink === link.id
                    ? "bg-red-600 text-white"
                    : failedLinks.has(link.id)
                    ? "bg-red-900/50 text-red-300 cursor-not-allowed"
                    : "bg-gray-700 hover:bg-gray-600 text-white",
                  loading && "opacity-50 cursor-not-allowed"
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
    </div>
  );
}