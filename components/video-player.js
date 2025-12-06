"use client";

/**
 * 🎬 Video Player with P2P Support
 * Optimized for cost savings + user experience
 */

import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { getP2PEngine } from "@/lib/p2p-engine";
import P2PLoader from "@/lib/hls-p2p-loader";
import { createSecureStreamUrl } from "@/lib/token-manager";
import { getPerformanceMonitor } from "@/lib/performance-monitor";
import { cn } from "@/lib/utils";

const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL;
const ENABLE_P2P = process.env.NEXT_PUBLIC_ENABLE_P2P !== "false"; // Default ON

// ⬇️ TAMBAHKAN INI
// Validate environment
if (!WORKER_URL) {
  console.error("❌ NEXT_PUBLIC_WORKER_URL not configured!");
}

if (typeof window !== "undefined") {
  console.log("🔧 Video Player Config:", {
    workerUrl: WORKER_URL || "NOT SET",
    p2pEnabled: ENABLE_P2P,
    env: process.env.NODE_ENV,
  });
}
// ⬆️ SAMPAI SINI

export default function VideoPlayerWithP2P({ match }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const p2pEngineRef = useRef(null);
  const monitorRef = useRef(null);

  const [currentLink, setCurrentLink] = useState("link1");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showStats, setShowStats] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [failedLinks, setFailedLinks] = useState(new Set());
  const [isRetrying, setIsRetrying] = useState(false);
  const initAttemptRef = useRef(0);

  const [stats, setStats] = useState({
    // Video stats
    buffered: "0s",
    quality: "Auto",
    droppedFrames: 0,

    // P2P stats
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
    { id: "link1", url: match.stream_url1, enabled: !!match.stream_url1 },
    { id: "link2", url: match.stream_url2, enabled: !!match.stream_url2 },
    { id: "link3", url: match.stream_url3, enabled: !!match.stream_url3 },
  ].filter((link) => link.enabled);

  // ========== INITIALIZATION ==========

  useEffect(() => {
    // Prevent concurrent initialization
    if (isRetrying) {
      console.log("⏳ Init blocked - already retrying");
      return;
    }

    initPlayer();

    // ⬇️ TAMBAHKAN INI
    // Cleanup P2P on page unload
    const handleUnload = () => {
      if (p2pEngineRef.current) {
        console.log("🧹 Page unload - destroying P2P");
        p2pEngineRef.current.destroy();
      }
    };

    window.addEventListener("beforeunload", handleUnload);
    // ⬆️ SAMPAI SINI

    return () => {
      window.removeEventListener("beforeunload", handleUnload); // ← TAMBAHKAN INI

      cleanup();
    };
  }, [currentLink, match.id]);

  async function initPlayer() {
    // ⬇️ TAMBAHKAN INI SEMUA
    // Check if link already failed
    if (failedLinks.has(currentLink)) {
      console.warn(`⚠️ Link ${currentLink} already failed, skipping`);
      return;
    }

    // Increment attempt counter
    initAttemptRef.current += 1;
    const attemptId = initAttemptRef.current;
    console.log(`🔄 Init attempt #${attemptId} for ${currentLink}`);

    // Check global retry limit
    if (retryCount >= 3) {
      setError(
        "All streams failed after multiple retries. Please refresh the page."
      );
      setLoading(false);
      return;
    }

    setIsRetrying(true);
    // ⬆️ SAMPAI SINI

    setLoading(true);
    setError(null);

    try {
      // Initialize performance monitor
      if (!monitorRef.current) {
        monitorRef.current = getPerformanceMonitor();
        monitorRef.current.markInitStart();
      }

      // Initialize P2P engine if enabled
      if (ENABLE_P2P && !p2pEngineRef.current) {
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

      // Get stream URL
      const linkNum = currentLink.slice(-1);
      const streamUrl = match[`stream_url${linkNum}`];

      if (!streamUrl) {
        throw new Error("Stream URL not available");
      }

      // Create secure manifest URL
      const manifestUrl = await createSecureStreamUrl(
        `${WORKER_URL}/api/stream/manifest`,
        match.id,
        currentLink
      );

      // Initialize HLS with P2P loader
      await initHls(manifestUrl);
    } catch (err) {
      console.error(`Init error (attempt #${attemptId}):`, err);
      setError(err.message || "Failed to initialize player");
      setLoading(false);

      // Mark this link as failed
      setFailedLinks((prev) => new Set([...prev, currentLink]));
    } finally {
      setIsRetrying(false); // ← PENTING! Reset flag
    }
  }

  async function initHls(manifestUrl) {
    const video = videoRef.current;
    if (!video) return;

    if (Hls.isSupported()) {
      // Create HLS instance with P2P loader
      const hlsConfig = {
        debug: false,
        enableWorker: true,
        maxBufferLength: 300,
        maxMaxBufferLength: 600,

        // Use P2P Loader
        loader:
          ENABLE_P2P && p2pEngineRef.current
            ? P2PLoader
            : Hls.DefaultConfig.loader,
      };

      const hls = new Hls(hlsConfig);
      hlsRef.current = hls;

      hls.loadSource(manifestUrl);
      hls.attachMedia(video);

      // Manifest parsed
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log("✅ Manifest loaded");
        video.play().catch((e) => console.log("Autoplay prevented"));
        setLoading(false);

        if (monitorRef.current) {
          monitorRef.current.markInitEnd();
        }
      });

      // First frame rendered
      video.addEventListener(
        "canplay",
        () => {
          if (monitorRef.current) {
            monitorRef.current.markFirstFrame();
          }
        },
        { once: true }
      );

      // Quality level switched
      hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
        const level = hls.levels[data.level];
        if (level && monitorRef.current) {
          monitorRef.current.recordQualitySwitch(null, level, "auto");
        }
      });

      // Error handling
      // Error handling
      hls.on(Hls.Events.ERROR, (event, data) => {
        // Log dengan detail lebih lengkap
        console.error("🔴 HLS Error:", {
          type: data.type,
          details: data.details,
          fatal: data.fatal,
          url: data.frag?.url ? redactUrl(data.frag.url) : "N/A",
          response: data.response,
        });

        // Only handle fatal errors
        if (data.fatal) {
          handleFatalError(data);
        } else {
          // Non-fatal errors (e.g., buffer stalls) - just log
          console.warn("⚠️ Non-fatal HLS error, player will auto-recover");
        }
      });

      // Helper function untuk redact URL (privacy)
      function redactUrl(url) {
        try {
          const u = new URL(url);
          return `${u.origin}${u.pathname}`;
        } catch {
          return "invalid-url";
        }
      }
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Native HLS (Safari) - no P2P support on native
      video.src = manifestUrl;
      video.addEventListener("loadedmetadata", () => {
        setLoading(false);
      });
    } else {
      throw new Error("HLS not supported");
    }
  }

  function handleFatalError(data) {
    console.error("💥 Fatal HLS error:", data.type, data.details);

    // Prevent rapid retries
    if (isRetrying) {
      console.warn("⏳ Already handling error, skipping");
      return;
    }

    // Mark current link as failed
    setFailedLinks((prev) => new Set([...prev, currentLink]));

    // Token expired - special case (bukan link error)
    if (data.response?.code === 403) {
      console.warn("🔑 Token expired, will retry with new token");

      // Wait 2 seconds before retry (let token regenerate)
      setTimeout(() => {
        setRetryCount((prev) => prev + 1);
        initPlayer();
      }, 2000);
      return;
    }

    // Find next available link (yang belum failed)
    const availableUnfailedLinks = availableLinks.filter(
      (link) => !failedLinks.has(link.id) && link.id !== currentLink
    );

    if (availableUnfailedLinks.length === 0) {
      // All links failed
      setError("All available streams have failed. Please try again later.");
      setLoading(false);
      return;
    }

    // Switch to next unfailed link
    const nextLink = availableUnfailedLinks[0];
    console.log(`🔄 Switching: ${currentLink} → ${nextLink.id}`);

    // Add delay before switch (prevent rapid switching)
    setTimeout(() => {
      setRetryCount((prev) => prev + 1);
      setCurrentLink(nextLink.id);
    }, 1500);
  }

  function cleanup() {
    console.log("🧹 Cleanup initiated");

    // Destroy HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
      console.log("✅ HLS destroyed");
    }

    // Cleanup video element
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute("src");
      videoRef.current.load();
    }

    // Note: P2P engine is singleton, don't destroy here
    // It will auto-cleanup on page unload via beforeunload event
  }

  // ========== STATS UPDATE ==========

  useEffect(() => {
    if (!showStats) return;

    // ⬇️ TAMBAHKAN INI
    // Only update if video is playing (optimize CPU)
    const video = videoRef.current;
    if (!video || video.paused) {
      console.log("📊 Stats paused (video not playing)");
      return;
    }
    // ⬆️ SAMPAI SINI

    const interval = setInterval(() => {
      const video = videoRef.current;
      const hls = hlsRef.current;
      const p2p = p2pEngineRef.current;

      if (!video) return;

      // Video stats
      const buffered =
        video.buffered.length > 0
          ? `${(
              video.buffered.end(video.buffered.length - 1) - video.currentTime
            ).toFixed(1)}s`
          : "0s";

      let quality = "Auto";
      if (hls && hls.levels && hls.currentLevel >= 0) {
        const level = hls.levels[hls.currentLevel];
        quality = level ? `${level.height}p` : "Auto";
      }

      const droppedFrames =
        video.getVideoPlaybackQuality?.()?.droppedVideoFrames || 0;

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
        p2pStats = {
          p2pEnabled: true,
          peers: engineStats.peers || 0,
          healthyPeers: engineStats.healthyPeers || 0,
          p2pHits: engineStats.p2pHits || 0,
          offloadRatio: engineStats.offloadRatio || "0%",
          bytesFromPeers: engineStats.bytesFromPeers || "0 MB",
          bytesShared: engineStats.bytesShared || "0 MB",
          savings: `$${(
            (parseFloat(engineStats.bytesFromPeers) || 0) * 0.1
          ).toFixed(2)}`,
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
  }, [showStats]);

  // ========== RENDER ==========

  return (
    <div className="space-y-4">
      {/* Video Container */}
      <div className="relative video-container">
        <video
          ref={videoRef}
          controls
          autoPlay
          playsInline
          className="w-full h-full object-contain bg-black"
        />

        {/* Loading */}
        {loading && (
          <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center">
            <div className="w-12 h-12 border-4 border-white/30 border-t-netflix-red rounded-full animate-spin" />
            <p className="mt-4">Loading stream...</p>
            {ENABLE_P2P && (
              <p className="mt-2 text-sm text-gray-400">
                🔗 Connecting to peers...
              </p>
            )}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center">
            <svg
              className="w-16 h-16 text-red-500 mb-4"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            <h3 className="text-xl font-bold mb-2">{error}</h3>
            <button onClick={initPlayer} className="btn btn-primary mt-4">
              🔄 Retry
            </button>
          </div>
        )}

        {/* Stats Overlay */}
        {showStats && !loading && (
          <div className="absolute top-4 right-4 bg-black/90 backdrop-blur rounded-lg p-4 text-sm max-w-sm z-20">
            <div className="flex justify-between items-center mb-3 pb-2 border-b border-white/20">
              <h4 className="font-bold text-lg">📊 Stats</h4>
              <button
                onClick={() => setShowStats(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Video Stats */}
            <div className="space-y-2 mb-4">
              <div className="text-xs text-gray-400 font-semibold mb-1">
                VIDEO
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Buffer:</span>
                <span className="font-mono">{stats.buffered}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Quality:</span>
                <span className="font-mono">{stats.quality}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-400">Dropped:</span>
                <span className="font-mono">{stats.droppedFrames}</span>
              </div>
            </div>

            {/* P2P Stats */}
            {stats.p2pEnabled && (
              <div className="space-y-2 pt-3 border-t border-white/20">
                <div className="text-xs text-gray-400 font-semibold mb-1">
                  P2P {stats.peers > 0 ? "🟢" : "🔴"}
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Peers:</span>
                  <span className="font-mono">
                    {stats.healthyPeers}/{stats.peers}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Offload:</span>
                  <span className="font-mono text-green-400">
                    {stats.offloadRatio}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">From Peers:</span>
                  <span className="font-mono">{stats.bytesFromPeers}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">Shared:</span>
                  <span className="font-mono">{stats.bytesShared}</span>
                </div>
                <div className="flex justify-between text-xs pt-2 border-t border-green-500/30">
                  <span className="text-gray-400">💰 Saved:</span>
                  <span className="font-mono text-green-400 font-bold">
                    {stats.savings}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-netflix-darkGray rounded-lg p-4">
        <div className="flex flex-wrap gap-3 items-center justify-between">
          {/* Links */}
          <div className="flex gap-2">
            {availableLinks.map((link) => (
              <button
                key={link.id}
                onClick={() => {
                  // Reset states saat user manual switch
                  setRetryCount(0);
                  setFailedLinks(new Set());
                  setError(null);
                  setCurrentLink(link.id);
                }}
                className={cn(
                  "px-4 py-2 rounded-lg font-semibold transition-all",
                  currentLink === link.id
                    ? "bg-netflix-red text-white"
                    : "bg-gray-700 hover:bg-gray-600"
                )}
              >
                Link {link.id.slice(-1)}
              </button>
            ))}
          </div>

          {/* Right controls */}
          <div className="flex gap-3 items-center">
            {ENABLE_P2P && (
              <div className="text-xs">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-1 rounded",
                    stats.peers > 0
                      ? "bg-green-500/20 text-green-400"
                      : "bg-gray-700"
                  )}
                >
                  🔗 {stats.peers} peers
                </span>
              </div>
            )}
            <button
              onClick={() => setShowStats(!showStats)}
              className="text-sm hover:text-white transition"
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
                Connected to {stats.peers} peer{stats.peers !== 1 ? "s" : ""} •
                Offload: {stats.offloadRatio} • Saved: {stats.savings}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
