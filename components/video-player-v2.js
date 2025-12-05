'use client';

import { useEffect, useRef, useState, useCallback, useMemo, Component } from 'react';
import Hls from 'hls.js';
import { useVideoEvents } from '@/hooks/useVideoEvents';
import { createSecureStreamUrl } from '@/lib/token-manager';
import { cn } from '@/lib/utils';
import {
  handleHlsError,
  logStreamEvent,
} from '@/lib/error-handler';
import { STREAMING_CONSTANTS } from '@/lib/streaming-constants';

const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL;
const {
  TOKEN_REFRESH_INTERVAL,
  MAX_RETRIES,
  MAX_STALL_RETRIES,
  ERROR_COOLDOWN,
  LINK_SWITCH_DEBOUNCE,
  UI_HIDE_TIMEOUT,
  HLS_CONFIG
} = STREAMING_CONSTANTS;

// Helper function to format time
const formatTime = (seconds) => {
  if (isNaN(seconds) || seconds < 0) {
    return '00:00';
  }
  const date = new Date(seconds * 1000);
  const hh = date.getUTCHours();
  const mm = date.getUTCMinutes();
  const ss = date.getUTCSeconds().toString().padStart(2, '0');
  if (hh) {
    return `${hh}:${mm.toString().padStart(2, '0')}:${ss}`;
  }
  return `${mm}:${ss}`;
};
class ErrorBoundary extends Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Player Error:', error, errorInfo);
    logStreamEvent('REACT_ERROR', {
      error: error.message,
      componentStack: errorInfo.componentStack
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="absolute inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center flex-col gap-4 p-6 text-center">
          <svg className="w-16 h-16 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4v.01" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-xl font-bold text-white">Player Error</h3>
          <p className="text-gray-300 text-sm">{this.state.error?.message || 'An unknown error occurred.'}</p>
          <button
            onClick={this.handleRetry}
            className="mt-4 px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
          >
            Retry Player
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function VideoPlayer({ match }) {
  // ======== REFS ========
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const playerContainerRef = useRef(null);
  const tokenRefreshTimerRef = useRef(null);
  const failedLinksRef = useRef(new Set());
  const retryCountRef = useRef(0);
  const stallRetryCountRef = useRef(0);
  const lastErrorTimeRef = useRef(0);
  const linkSwitchDebounceRef = useRef(null);

  // ======== STATE ========
  const [currentLink, setCurrentLink] = useState('link1');
  const [playerState, setPlayerState] = useState('loading'); // loading, playing, paused, buffering, error
  const [error, setError] = useState(null);
  const [streamInfo, setStreamInfo] = useState('');
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [showStats, setShowStats] = useState(false);
  const [showUI, setShowUI] = useState(true);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [stats, setStats] = useState({
    buffered: '0s',
    quality: 'Auto',
    connection: 'N/A',
    retries: '0/0',
  });

  // ======== MEMOS ========
  const availableLinks = useMemo(
    () => [
      { id: 'link1', url: match.stream_url1, enabled: !!match.stream_url1 },
      { id: 'link2', url: match.stream_url2, enabled: !!match.stream_url2 },
      { id: 'link3', url: match.stream_url3, enabled: !!match.stream_url3 },
    ].filter(link => link.enabled),
    [match]
  );
  const isPlaying = playerState === 'playing';

  // ======== CLEANUP ========
  const cleanup = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (tokenRefreshTimerRef.current) {
      clearInterval(tokenRefreshTimerRef.current);
    }
    if (linkSwitchDebounceRef.current) {
      clearTimeout(linkSwitchDebounceRef.current)
    }
    if (videoRef.current) {
      videoRef.current.src = '';
      videoRef.current.removeAttribute('src');
      videoRef.current.load();
    }
  }, []);

  // ======== LINK SWITCHING ========
  const tryAlternativeLink = useCallback(() => {
    const currentIndex = availableLinks.findIndex(l => l.id === currentLink);
    for (let i = 1; i <= availableLinks.length; i++) {
      const nextIndex = (currentIndex + i) % availableLinks.length;
      const nextLink = availableLinks[nextIndex];
      if (!failedLinksRef.current.has(nextLink.id)) {
        console.log(`[Player] Fallback: ${currentLink} -> ${nextLink.id}`);
        setCurrentLink(nextLink.id);
        return;
      }
    }
    console.warn('[Player] All links failed. Clearing failures and retrying the first link.');
    failedLinksRef.current.clear();
    if (availableLinks.length > 0) {
      setCurrentLink(availableLinks[0].id);
    } else {
      setError('All stream links are unavailable.');
      setPlayerState('error');
    }
  }, [availableLinks, currentLink]);

  const handleLinkSwitch = useCallback((linkId) => {
    if (linkSwitchDebounceRef.current) return;
    console.log(`[Player] User switch: ${currentLink} -> ${linkId}`);
    setCurrentLink(linkId);
    linkSwitchDebounceRef.current = setTimeout(() => {
      linkSwitchDebounceRef.current = null;
    }, LINK_SWITCH_DEBOUNCE);
  }, [currentLink]);


  // ======== HLS PLAYER INIT ========
  const initHlsPlayer = useCallback(async (manifestUrl, linkId) => {
    const video = videoRef.current;
    if (!video) return;

    if (Hls.isSupported()) {
      const hls = new Hls({ ...HLS_CONFIG });
      hlsRef.current = hls;

      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        console.log(`[HLS] Manifest loaded: ${data.levels.length} quality levels`);
        setPlayerState('playing');
        video.play().catch(e => console.warn('[Player] Autoplay prevented:', e.message));
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
        const level = hls.levels[data.level];
        if (level) {
          setStats(s => ({ ...s, quality: `${level.height}p` }));
        }
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        const now = Date.now();
        if (now - lastErrorTimeRef.current < ERROR_COOLDOWN) return;
        lastErrorTimeRef.current = now;

        const error = handleHlsError(data);
        logStreamEvent('HLS_ERROR', { linkId, error: error.message, fatal: data.fatal });

        if (data.response?.code === 403) {
          logStreamEvent('TOKEN_EXPIRED', { linkId });
          // Force token refresh
          initPlayer(linkId, true);
          return;
        }
        
        if (data.details === Hls.ErrorDetails.BUFFER_STALLED_ERROR) {
            stallRetryCountRef.current++;
            if(stallRetryCountRef.current > MAX_STALL_RETRIES) {
                console.error(`[HLS] Stalls exceeded max retries (${MAX_STALL_RETRIES}), switching link.`);
                failedLinksRef.current.add(linkId);
                tryAlternativeLink();
            } else {
                console.warn(`[HLS] Buffer stalled. Retry #${stallRetryCountRef.current}. Seeking forward slightly.`);
                video.currentTime += 0.1; // Nudge the player
            }
            return;
        }

        if (data.fatal) {
          retryCountRef.current++;
          if (retryCountRef.current >= MAX_RETRIES) {
            console.error(`[HLS] Max retries exceeded for ${linkId}. Switching link.`);
            failedLinksRef.current.add(linkId);
            tryAlternativeLink();
          }
        }
      });

      hls.loadSource(manifestUrl);
      hls.attachMedia(video);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = manifestUrl;
      video.addEventListener('loadedmetadata', () => {
        setPlayerState('playing');
        video.play();
      });
    }
  }, [tryAlternativeLink]);


  // ======== PLAYER INIT ========
  const initPlayer = useCallback(async (linkId, isTokenRefresh = false) => {
    setPlayerState('loading');
    setError(null);
    cleanup();

    retryCountRef.current = 0;
    stallRetryCountRef.current = 0;

    const link = availableLinks.find(l => l.id === linkId);
    if (!link) {
      setError('Selected link is not available.');
      setPlayerState('error');
      return;
    }

    try {
      const { token } = await createSecureStreamUrl(match.id, linkId);
      const manifestUrl = `${WORKER_URL}/api/stream/manifest?match=${match.id}&link=${linkId}&token=${token}`;
      setStreamInfo(`${linkId.toUpperCase()} | ${new Date().toLocaleTimeString()}`);
      initHlsPlayer(manifestUrl, linkId);

      // Start token refresh timer
      if (tokenRefreshTimerRef.current) clearInterval(tokenRefreshTimerRef.current);
      tokenRefreshTimerRef.current = setInterval(() => {
          console.log('[Player] Refreshing stream token...');
          initPlayer(linkId, true);
      }, TOKEN_REFRESH_INTERVAL);

    } catch (err) {
      console.error('[Player] Init error:', err);
      setError(err.message || 'Failed to initialize player.');
      setPlayerState('error');
      failedLinksRef.current.add(linkId);
      tryAlternativeLink();
    }
  }, [match.id, availableLinks, cleanup, initHlsPlayer, tryAlternativeLink]);

  // ======== EFFECTS ========
  useEffect(() => {
    if (availableLinks.length > 0) {
      initPlayer(currentLink);
    } else {
        setError('No stream links available for this match.');
        setPlayerState('error');
    }
    return () => cleanup();
  }, [currentLink, match.id]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.muted = isMuted;
  }, [volume, isMuted]);

  // UI Hide Timer
  useEffect(() => {
    let timer;
    const container = playerContainerRef.current;
    const handleMouseMove = () => {
      setShowUI(true);
      clearTimeout(timer);
      if (isPlaying) {
        timer = setTimeout(() => setShowUI(false), UI_HIDE_TIMEOUT);
      }
    };
    if (container) {
      container.addEventListener('mousemove', handleMouseMove);
    }
    return () => {
      clearTimeout(timer);
      if (container) {
        container.removeEventListener('mousemove', handleMouseMove);
      }
    };
  }, [isPlaying]);

  // Stats Update Timer
  useEffect(() => {
    if (!showStats) return;
    const timer = setInterval(() => {
      const video = videoRef.current;
      if (!video) return;
      const buffered = video.buffered;
      const bufferedTime = buffered.length > 0 ? (buffered.end(buffered.length - 1) - video.currentTime) : 0;
      setStats(s => ({
        ...s,
        buffered: `${Math.round(bufferedTime)}s`,
        connection: navigator.connection?.effectiveType || 'N/A',
        retries: `${retryCountRef.current}/${MAX_RETRIES}`,
      }));
    }, 1000);
    return () => clearInterval(timer);
  }, [showStats]);

  // ======== VIDEO EVENT HANDLERS from HOOK ========
  useVideoEvents(videoRef, {
    onPlay: () => setPlayerState('playing'),
    onPause: () => setPlayerState('paused'),
    onLoadedMetadata: () => setDuration(videoRef.current?.duration || 0),
    onTimeUpdate: () => setCurrentTime(videoRef.current?.currentTime || 0),
    onWaiting: () => setPlayerState('buffering'),
    onCanPlay: () => {
        if(playerState === 'buffering') setPlayerState('playing');
    },
  });

  // ======== UI HANDLERS ========
  const handlePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (video) {
      isPlaying ? video.pause() : video.play();
    }
  }, [isPlaying]);

  const handleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      playerContainerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);
  
  const handleMuteToggle = useCallback(() => setIsMuted(m => !m), []);
  const handleVolumeChange = (e) => setVolume(parseFloat(e.target.value));

  const handleProgressClick = (e) => {
    const video = videoRef.current;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    video.currentTime = pos * duration;
  };
  
  const getBufferedPercentage = () => {
    const video = videoRef.current;
    if (!video || !duration || !video.buffered.length) return 0;
    const bufferedEnd = video.buffered.end(video.buffered.length - 1);
    return (bufferedEnd / duration) * 100;
  };
  


  // ======== RENDER ========
  return (
    <div className="space-y-2">
      <div
        ref={playerContainerRef}
        className={cn(
          'relative w-full aspect-video bg-black rounded-lg overflow-hidden group',
          'focus:outline-none focus:ring-2 focus:ring-red-500',
          playerState === 'error' && 'ring-2 ring-red-500'
        )}
        tabIndex="0"
      >
        <video
          ref={videoRef}
          playsInline
          className="w-full h-full object-contain"
          onClick={handlePlayPause}
          onDoubleClick={handleFullscreen}
        />

        {/* Overlays */}
        <div className={cn(
            'absolute inset-0 transition-opacity duration-300 pointer-events-none',
            showUI || !isPlaying || playerState === 'paused' ? 'opacity-100' : 'opacity-0'
        )}>
            {/* Gradient */}
            <div className="absolute bottom-0 w-full h-1/2 bg-gradient-to-t from-black/70 to-transparent" />

            {/* Controls */}
            <div className="absolute bottom-0 w-full p-3 pointer-events-auto">
                {/* Progress Bar */}
                <div className="relative h-1.5 bg-white/20 cursor-pointer rounded-full mb-2" onClick={handleProgressClick}>
                  <div
                    className="absolute h-full bg-white/40 rounded-full"
                    style={{ width: `${getBufferedPercentage()}%` }}
                  />
                  <div
                    className="absolute h-full bg-red-600 rounded-full"
                    style={{ width: `${(currentTime / duration) * 100}%` }}
                  />
                </div>

                {/* Main Controls */}
                <div className="flex items-center justify-between text-white">
                  <div className="flex items-center gap-4">
                    <button onClick={handlePlayPause}>
                      {isPlaying ? <PauseIcon /> : <PlayIcon />}
                    </button>
                    <div className="flex items-center gap-2">
                      <button onClick={handleMuteToggle}>
                        {isMuted || volume === 0 ? <MuteIcon /> : <VolumeIcon />}
                      </button>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={isMuted ? 0 : volume}
                        onChange={handleVolumeChange}
                        className="w-20 h-1 accent-red-600"
                      />
                    </div>
                    <div className="text-sm font-mono">
                      {formatTime(currentTime)} / {formatTime(duration)}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <button onClick={() => setShowStats(s => !s)}><StatsIcon /></button>
                    <button onClick={handleFullscreen}><FullscreenIcon /></button>
                  </div>
                </div>
            </div>
        </div>

        {/* Center States */}
        {playerState === 'loading' && <StateOverlay message="Loading Stream..." spinner />}
        {playerState === 'buffering' && <StateOverlay message="Buffering..." spinner />}
        {playerState === 'error' && <StateOverlay message={error} isError onRetry={() => initPlayer(currentLink)} />}

        {/* Stats Overlay */}
        {showStats && (
          <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm rounded p-2 text-xs text-gray-200 font-mono space-y-1 z-10 pointer-events-auto">
              <p>Link: <span className="font-bold text-white">{currentLink.toUpperCase()}</span></p>
              <p>Quality: <span className="font-bold text-white">{stats.quality}</span></p>
              <p>Buffered: <span className="font-bold text-white">{stats.buffered}</span></p>
              <p>Retries: <span className="font-bold text-white">{stats.retries}</span></p>
              <p>Connection: <span className="font-bold text-white">{stats.connection}</span></p>
          </div>
        )}
      </div>

      {/* Bottom Controls */}
       <div className="bg-slate-900 rounded-lg p-3 text-sm">
            <div className="flex flex-wrap gap-2 items-center justify-between">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-gray-400 font-medium mr-2">Links:</span>
                {availableLinks.map((link) => (
                <button
                    key={link.id}
                    onClick={() => handleLinkSwitch(link.id)}
                    disabled={!!linkSwitchDebounceRef.current || failedLinksRef.current.has(link.id)}
                    className={cn(
                    'px-3 py-1 rounded font-medium transition-colors text-xs flex items-center gap-1.5',
                    currentLink === link.id
                        ? 'bg-red-600 text-white'
                        : failedLinksRef.current.has(link.id)
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        : 'bg-gray-700 hover:bg-gray-600 text-white'
                    )}
                >
                    <span className={cn(
                        'w-1.5 h-1.5 rounded-full',
                        currentLink === link.id ? 'bg-white animate-pulse' : 'bg-gray-400'
                    )}/>
                    {link.id.replace('link', ' ')}
                </button>
                ))}
            </div>
            <div className="text-gray-400 text-xs">{streamInfo}</div>
            </div>
      </div>
    </div>
  );
}

// ======== Child Components & Icons ========

const StateOverlay = ({ message, spinner, isError, onRetry }) => (
    <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-4 p-4 text-center">
        {spinner && <div className="w-10 h-10 border-4 border-white/20 border-t-red-500 rounded-full animate-spin" />}
        {isError && <ErrorIcon />}
        <p className="text-white font-medium text-lg">{message}</p>
        {isError && (
            <button
                onClick={onRetry}
                className="mt-2 px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
            >
                Retry
            </button>
        )}
    </div>
);

const Icon = ({ children }) => <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">{children}</svg>;
const PlayIcon = () => <Icon><path d="M8 5v14l11-7z"/></Icon>;
const PauseIcon = () => <Icon><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></Icon>;
const VolumeIcon = () => <Icon><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></Icon>;
const MuteIcon = () => <Icon><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></Icon>;
const FullscreenIcon = () => <Icon><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></Icon>;
const StatsIcon = () => <Icon><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></Icon>;
const ErrorIcon = () => <div className="w-12 h-12 text-red-500"><Icon><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4v.01m-6.938 4.016a9 9 0 1113.876 0M9 16.5a3 3 0 116 0 3 3 0 01-6 0z" /></Icon></div>;


export default function VideoPlayerWithBoundary({ match }) {
  return (
    <ErrorBoundary>
      <VideoPlayer match={match} />
    </ErrorBoundary>
  );
}
