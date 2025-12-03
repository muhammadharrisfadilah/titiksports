'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
// 
import { createSecureStreamUrl, getTokenExpirySeconds } from '@/lib/token-manager';
import { cn, getLinkQuality } from '@/lib/utils';

const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL;
const TOKEN_VALIDITY_DURATION = 7200000; // 2 jam
const TOKEN_REFRESH_INTERVAL = 50 * 60 * 1000; // Refresh tiap 50 menit (lebih pendek dari expiry token)

export default function VideoPlayer({ match }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const dashRef = useRef(null);
  const tokenRefreshTimerRef = useRef(null);
  const failedLinksRef = useRef(new Set());
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 3;
  
  const [currentLink, setCurrentLink] = useState('link1');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [streamInfo, setStreamInfo] = useState('');
  const [currentToken, setCurrentToken] = useState(null);
  const [stats, setStats] = useState({
    buffered: '0s',
    quality: 'Loading...',
    droppedFrames: 0,
  });
  const [showStats, setShowStats] = useState(false);

  // Available links
  const availableLinks = [
    { id: 'link1', url: match.stream_url1, enabled: !!match.stream_url1 },
    { id: 'link2', url: match.stream_url2, enabled: !!match.stream_url2 },
    { id: 'link3', url: match.stream_url3, enabled: !!match.stream_url3 },
  ].filter(link => link.enabled);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (dashRef.current) {
      dashRef.current.reset();
      dashRef.current = null;
    }
    if (tokenRefreshTimerRef.current) {
      clearInterval(tokenRefreshTimerRef.current);
      tokenRefreshTimerRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.removeAttribute('src');
      videoRef.current.load();
    }
  }, []);

  // Token refresh timer
  const startTokenRefreshTimer = useCallback(() => {
    if (tokenRefreshTimerRef.current) {
      clearInterval(tokenRefreshTimerRef.current);
    }

    console.log(`⏱️ Token refresh timer started (${TOKEN_REFRESH_INTERVAL / 60000} min)`);
    
    tokenRefreshTimerRef.current = setInterval(() => {
      console.log('🔄 Auto token refresh triggered');
      initPlayer(currentLink, true)
        .catch(error => 
          console.error('Failed to refresh token:', error.message)
        );
    }, TOKEN_REFRESH_INTERVAL);
  }, [currentLink]);

  // Try alternative link on failure
  const tryAlternativeLink = useCallback(() => {
    // Prevent re-triggering if all links have already been tried
    if (failedLinksRef.current.size >= availableLinks.length) {
      console.error('❌ All links have been tried and failed.');
      setError('Semua link gagal. Silakan coba lagi nanti.');
      setLoading(false);
      return;
    }

    const currentIndex = availableLinks.findIndex(l => l.id === currentLink);
    
    for (let i = 1; i <= availableLinks.length; i++) {
      const nextIndex = (currentIndex + i) % availableLinks.length;
      const nextLink = availableLinks[nextIndex];
      
      if (!failedLinksRef.current.has(nextLink.id)) {
        console.log(`🔄 Switching to alternative: ${nextLink.id}`);
        setCurrentLink(nextLink.id);
        return;
      }
    }
    
    console.error('❌ All links failed');
    setError('Semua link gagal. Coba refresh halaman.');
    setLoading(false);
  }, [availableLinks, currentLink]);

  // HLS Player initialization
  const initHlsPlayer = async (manifestUrl, linkId) => {
    const video = videoRef.current;
    if (!video) return;

    if (Hls.isSupported()) {
      const hls = new Hls({
        debug: false,
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
        maxBufferLength: 90,
        maxBufferSize: 60 * 1000 * 1000,
        maxBufferHole: 0.3,
        manifestLoadingTimeOut: 15000,
        levelLoadingTimeOut: 12000,
        fragLoadingTimeOut: 10000,
        fragLoadingMaxRetry: 5,
        capLevelToPlayerSize: true,
        autoStartLoad: false, // Wait until media attached
        startLevel: -1,
        nudgeOffset: 0.1,
        nudgeMaxRetry: 5,
        highBufferWatchdogPeriod: 2,
      });

      hls.loadSource(manifestUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log('✅ HLS Manifest loaded');
        video.play().catch(e => console.log('Autoplay:', e.message));
        setLoading(false);
        retryCountRef.current = 0;
        failedLinksRef.current.delete(linkId);
        startTokenRefreshTimer();
      });

      hls.on(Hls.Events.ERROR, async (event, data) => {
        console.error('❌ HLS Error:', data.type, data.details);

        // Token expired - refresh
        if (data.response?.code === 403) {
          console.warn('🔒 Token 403, refreshing...');
          await initPlayer(currentLink, true);
          return;
        }

        // Server full
        if (data.response?.code === 503) {
          console.warn('🚫 Server full (503)');
          failedLinksRef.current.add(linkId);
          tryAlternativeLink();
          return;
        }

        // Buffer stall
        if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) {
          console.warn('⏸️ Buffer stall, recovering...');
          hls.recoverMediaError();
          return;
        }

        // Fatal errors
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            if (retryCountRef.current < MAX_RETRIES) {
              retryCountRef.current++;
              console.log(`🔄 Retry ${retryCountRef.current}/${MAX_RETRIES}`);
              setTimeout(() => hls.startLoad(), 1500);
            } else {
              failedLinksRef.current.add(linkId);
              tryAlternativeLink();
            }
          } else {
            failedLinksRef.current.add(linkId);
            tryAlternativeLink();
          }
        }
      });

      hlsRef.current = hls;

    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS (Safari)
      video.src = manifestUrl;
      video.addEventListener('loadedmetadata', () => {
        video.play().catch(e => console.log('Autoplay:', e.message));
        setLoading(false);
        startTokenRefreshTimer();
      });
      video.addEventListener('error', () => {
        failedLinksRef.current.add(linkId);
        tryAlternativeLink();
      });
    } else {
      setError('Browser tidak mendukung HLS');
      setLoading(false);
    }
  };

  // DASH Player initialization
  const initDashPlayer = async (dashUrl, linkId) => {
    const video = videoRef.current;
    if (!video) return;

    try {
      // Dynamic import for dashjs
      const dashjs = await import('dashjs');
      const player = dashjs.MediaPlayer().create();
      
      player.updateSettings({
        streaming: {
          abr: {
            useDefaultABRRules: true,
            ABRStrategy: 'abrDynamic',
          },
          buffer: {
            stableBufferTime: 40,
            bufferTimeAtTopQuality: 60,
          },
        },
      });

      player.initialize(video, dashUrl, true);

      player.on(dashjs.MediaPlayer.events.STREAM_INITIALIZED, () => {
        console.log('✅ DASH initialized');
        setLoading(false);
        retryCountRef.current = 0;
        failedLinksRef.current.delete(linkId);
        startTokenRefreshTimer();
      });

      player.on(dashjs.MediaPlayer.events.ERROR, (e) => {
        console.error('❌ DASH Error:', e);
        
        if (e.error?.code === 403) {
          initPlayer(currentLink, true);
          return;
        }
        
        failedLinksRef.current.add(linkId);
        tryAlternativeLink();
      });

      dashRef.current = player;
    } catch (err) {
      console.error('DASH init error:', err);
      failedLinksRef.current.add(linkId);
      tryAlternativeLink();
    }
  };

  // Main player initialization
  const initPlayer = async (linkId, isRefresh = false) => {
    setLoading(true);
    setError(null);
    
    if (!isRefresh) {
      cleanup();
    }

    try {
      const linkNum = linkId.slice(-1);
      const streamUrl = match[`stream_url${linkNum}`];

      if (!streamUrl) {
        throw new Error('Stream URL tidak tersedia');
      }

      console.log(`🎬 Loading: ${linkId}${isRefresh ? ' (refresh)' : ''}`);

      // Generate secure URL dengan mekanisme baru
      const manifestUrl = await createSecureStreamUrl(streamUrl, match.id, linkId);

      const isDash = streamUrl.includes('.mpd') || linkId === 'link3';

      if (isDash) {
        await initDashPlayer(manifestUrl, linkId);
      } else {
        await initHlsPlayer(manifestUrl, linkId);
      }

      setStreamInfo(`${linkId.toUpperCase().replace('LINK', 'Link ')} (${getLinkQuality(linkId)}) Aktif`);
      
    } catch (err) {
      console.error('Player init error:', err);
      setError(err.message || 'Gagal memuat stream');
      setLoading(false);
    }
  };

  // Handle link switch
  const handleLinkSwitch = (linkId) => {
    if (linkId !== currentLink && !failedLinksRef.current.has(linkId)) {
      retryCountRef.current = 0;
      setCurrentLink(linkId);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const video = videoRef.current;
      if (!video) return;

      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          video.paused ? video.play() : video.pause();
          break;
        case 'f':
          e.preventDefault();
          if (!document.fullscreenElement) {
            video.requestFullscreen();
          } else {
            document.exitFullscreen();
          }
          break;
        case 'm':
          e.preventDefault();
          video.muted = !video.muted;
          break;
        case 'ArrowLeft':
          e.preventDefault();
          video.currentTime -= 5;
          break;
        case 'ArrowRight':
          e.preventDefault();
          video.currentTime += 5;
          break;
        case 'ArrowUp':
          e.preventDefault();
          video.volume = Math.min(1, video.volume + 0.1);
          break;
        case 'ArrowDown':
          e.preventDefault();
          video.volume = Math.max(0, video.volume - 0.1);
          break;
        case '1':
        case '2':
        case '3':
          e.preventDefault();
          const link = availableLinks.find(l => l.id === `link${e.key}`);
          if (link) handleLinkSwitch(link.id);
          break;
        case 's':
          e.preventDefault();
          setShowStats(!showStats);
          break;
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [availableLinks, currentLink, showStats]);

  // Stats monitoring
  useEffect(() => {
    if (!showStats) return;

    const interval = setInterval(() => {
      const video = videoRef.current;
      if (!video) return;

      const buffered = video.buffered.length > 0
        ? `${(video.buffered.end(video.buffered.length - 1) - video.currentTime).toFixed(1)}s`
        : '0s';

      let quality = 'Auto';
      if (hlsRef.current && hlsRef.current.levels) {
        const level = hlsRef.current.levels[hlsRef.current.currentLevel];
        if (level) quality = `${level.height}p`;
      }

      setStats({
        buffered,
        quality,
        droppedFrames: video.getVideoPlaybackQuality?.().droppedVideoFrames || 0,
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [showStats]);

  // Initialize on mount
  useEffect(() => {
    if (availableLinks.length > 0) {
      initPlayer(currentLink).catch(error => {
        console.error('Initial player error:', error);
        setError(error.message || 'Failed to load stream');
      });
    }
    return () => cleanup();
  }, [currentLink, match.id]);

  return (
    <div className="space-y-6">
      {/* Video Container */}
      <div className="relative video-container">
        <video
          ref={videoRef}
          controls
          autoPlay
          playsInline
          className="w-full h-full object-contain bg-black"
        />

        {/* Loading Overlay */}
        {loading && (
          <div className="overlay">
            <div className="w-12 h-12 border-4 border-white/30 border-t-netflix-red rounded-full animate-spin" />
            <p className="mt-4 text-lg">Memuat streaming...</p>
          </div>
        )}

        {/* Error Overlay */}
        {error && (
          <div className="overlay">
            <svg className="w-16 h-16 text-yellow-500 mb-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <h3 className="text-xl font-bold mb-2">{error}</h3>
            <button onClick={() => initPlayer(currentLink)} className="btn btn-primary mt-4">
              🔄 Coba Lagi
            </button>
          </div>
        )}

        {/* Stats Overlay */}
        {showStats && (
          <div className="absolute top-4 right-4 bg-black/80 backdrop-blur-sm rounded-lg p-4 text-sm space-y-2 z-20">
            <div className="flex justify-between items-center mb-2 pb-2 border-b border-white/20">
              <h4 className="font-bold">📊 Stats</h4>
              <button onClick={() => setShowStats(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">Buffer:</span>
              <span className="font-mono">{stats.buffered}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">Quality:</span>
              <span className="font-mono">{stats.quality}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-gray-400">Dropped:</span>
              <span className="font-mono">{stats.droppedFrames}</span>
            </div>
          </div>
        )}
      </div>

      {/* Stream Controls */}
      {availableLinks.length > 0 && (
        <div className="bg-netflix-darkGray rounded-lg p-4">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="flex flex-wrap gap-2">
              {availableLinks.map((link) => (
                <button
                  key={link.id}
                  onClick={() => handleLinkSwitch(link.id)}
                  disabled={failedLinksRef.current.has(link.id)}
                  className={cn(
                    'px-4 py-2 rounded-lg font-semibold transition-all flex items-center gap-2',
                    currentLink === link.id
                      ? 'bg-netflix-red text-white shadow-lg'
                      : failedLinksRef.current.has(link.id)
                      ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  )}
                >
                  <span className={cn(
                    'w-2 h-2 rounded-full',
                    currentLink === link.id ? 'bg-white animate-pulse' : 'bg-gray-500'
                  )} />
                  Link {link.id.slice(-1)} ({getLinkQuality(link.id)})
                </button>
              ))}
            </div>
            <div className="flex gap-3 items-center">
              <button
                onClick={() => setShowStats(!showStats)}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                {showStats ? '📊 Hide Stats' : '📊 Show Stats'}
              </button>
              <div className="text-sm text-gray-400">{streamInfo}</div>
            </div>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Info */}
      <details className="bg-netflix-darkGray rounded-lg p-4">
        <summary className="font-semibold cursor-pointer flex items-center gap-2">
          ⌨️ Keyboard Shortcuts
        </summary>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-sm">
          <div><kbd className="kbd">Space</kbd> Play/Pause</div>
          <div><kbd className="kbd">F</kbd> Fullscreen</div>
          <div><kbd className="kbd">M</kbd> Mute</div>
          <div><kbd className="kbd">S</kbd> Stats</div>
          <div><kbd className="kbd">←</kbd> -5s</div>
          <div><kbd className="kbd">→</kbd> +5s</div>
          <div><kbd className="kbd">↑</kbd> Vol +</div>
          <div><kbd className="kbd">↓</kbd> Vol -</div>
          <div><kbd className="kbd">1/2/3</kbd> Switch Link</div>
        </div>
      </details>
    </div>
  );
}
