/**
 * 🎯 Streaming Constants - OPTIMIZED
 * Tuned for fast recovery and better UX
 */

// Detect connection type
const getConnectionType = () => {
  if (typeof navigator === 'undefined' || !navigator.connection) {
    return '4g'; // Default assumption
  }
  return navigator.connection.effectiveType || '4g';
};

const isMobile = () => {
  if (typeof navigator === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
};

// Adaptive timeouts based on connection
const getTimeouts = () => {
  const connType = getConnectionType();
  const mobile = isMobile();
  
  // Aggressive timeouts for fast connections
  if (connType === '4g' && !mobile) {
    return {
      manifestLoadingTimeOut: 8000,   // 8s (reduced from 20s)
      levelLoadingTimeOut: 6000,      // 6s
      fragLoadingTimeOut: 6000,       // 6s
    };
  }
  
  // Moderate for 3G or mobile 4G
  if (connType === '3g' || mobile) {
    return {
      manifestLoadingTimeOut: 12000,  // 12s
      levelLoadingTimeOut: 8000,      // 8s
      fragLoadingTimeOut: 8000,       // 8s
    };
  }
  
  // Conservative for slow connections
  return {
    manifestLoadingTimeOut: 15000,    // 15s
    levelLoadingTimeOut: 10000,       // 10s
    fragLoadingTimeOut: 10000,        // 10s
  };
};

const timeouts = getTimeouts();

export const STREAMING_CONSTANTS = {
  // ========== TIMING ==========
  TOKEN_VALIDITY_DURATION: 7200000,  // 2 hours
  TOKEN_REFRESH_INTERVAL: 6300000,   // 1h 45min (refresh 15min before expiry)
  ERROR_COOLDOWN: 2000,              // 2s between error handling
  LINK_SWITCH_DEBOUNCE: 3000,        // 3s debounce for link switches
  UI_HIDE_TIMEOUT: 5000,             // 5s before hiding UI

  // ========== RETRY LIMITS ==========
  MAX_RETRIES: 6,                    // Max retries before switching link
  MAX_STALL_RETRIES: 10,             // Max buffer stalls before action
  MAX_FRAGMENT_RETRIES: 4,           // Max retries for single fragment
  
  // Backoff strategy (exponential)
  RETRY_BACKOFF_BASE: 1000,          // Base delay: 1s
  RETRY_BACKOFF_MAX: 8000,           // Max delay: 8s
  
  // ========== HLS CONFIGURATION ==========
  HLS_CONFIG: {
    // Debug
    debug: false,
    enableWorker: true,
    
    // Latency mode
    lowLatencyMode: false,
    
    // Buffer management (OPTIMIZED)
    backBufferLength: 30,              // Keep 30s of back buffer (reduced from 60s)
    maxBufferLength: 30,               // Target 30s forward buffer (reduced from 60s)
    maxMaxBufferLength: 60,            // Max 60s total (reduced from 120s)
    maxBufferSize: 30 * 1000 * 1000,   // 30MB max (reduced from 40MB)
    maxBufferHole: 0.5,                // 0.5s max hole in buffer
    
    // Timeouts (ADAPTIVE)
    ...timeouts,
    
    // Retry configuration (AGGRESSIVE)
    manifestLoadingMaxRetry: 4,        // Retry manifest 4 times
    levelLoadingMaxRetry: 4,           // Retry level 4 times
    fragLoadingMaxRetry: 4,            // Retry fragment 4 times
    fragLoadingMaxRetryTimeout: 8000,  // 8s max timeout per retry
    
    // ABR (Adaptive Bitrate)
    capLevelToPlayerSize: true,        // Match quality to player size
    autoStartLoad: true,
    startLevel: -1,                    // Auto-select initial quality
    
    // ABR tuning
    abrEwmaDefaultEstimate: 500000,    // 500 kbps default estimate
    abrBandWidthFactor: 0.9,           // Conservative estimate (down from 0.95)
    abrBandWidthUpFactor: 0.7,         // Careful when upgrading quality
    abrMaxWithRealBitrate: true,       // Use real bitrate measurements
    
    // Fragment management
    highBufferWatchdogPeriod: 2,       // Check buffer every 2s
    nudgeMaxRetry: 3,                  // Max nudge retries
    
    // Progressive loading
    progressive: true,
    
    // XHR setup (for custom headers if needed)
    xhrSetup: undefined, // Can be overridden for custom auth
  },

  // ========== ERROR TYPES ==========
  ERROR_TYPES: {
    FATAL: 'FATAL',
    TRANSIENT: 'TRANSIENT',
    TOKEN_EXPIRED: 'TOKEN_EXPIRED',
    NETWORK: 'NETWORK',
    MEDIA: 'MEDIA',
  },

  // ========== STREAMING STATES ==========
  STREAM_STATES: {
    INITIALIZING: 'INITIALIZING',
    READY: 'READY',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    BUFFERING: 'BUFFERING',
    ERROR: 'ERROR',
    SWITCHING: 'SWITCHING',
  },

  // ========== QUALITY LEVELS ==========
  QUALITY_LABELS: {
    AUTO: 'Auto',
    360: '360p',
    480: '480p',
    720: '720p (HD)',
    1080: '1080p (Full HD)',
  },

  // ========== BANDWIDTH THRESHOLDS ==========
  BANDWIDTH_THRESHOLDS: {
    MIN_FOR_720P: 2500000,    // 2.5 Mbps
    MIN_FOR_1080P: 5000000,   // 5 Mbps
    LOW_BANDWIDTH: 500000,    // 500 kbps (consider CDN only)
  },

  // ========== MOBILE OPTIMIZATION ==========
  MOBILE_CONFIG: {
    maxBufferLength: 20,              // Smaller buffer on mobile
    maxMaxBufferLength: 40,
    maxBufferSize: 20 * 1000 * 1000,  // 20MB max
    startLevel: 1,                    // Start with lower quality
    capLevelToPlayerSize: true,
  },

  // ========== P2P CONFIGURATION ==========
  P2P_CONFIG: {
    ENABLED: process.env.NEXT_PUBLIC_ENABLE_P2P !== 'false',
    MIN_PEERS_FOR_P2P: 2,
    MAX_PEERS: isMobile() ? 3 : 6,
    CHUNK_TIMEOUT: 4000,
    MAX_CACHE_SIZE: isMobile() ? 30 * 1024 * 1024 : 50 * 1024 * 1024,
  },
};

// ========== HELPER FUNCTIONS ==========

/**
 * Get optimized HLS config based on device & connection
 */
export function getOptimizedHLSConfig() {
  const base = STREAMING_CONSTANTS.HLS_CONFIG;
  
  // Mobile-specific optimizations
  if (isMobile()) {
    return {
      ...base,
      ...STREAMING_CONSTANTS.MOBILE_CONFIG,
    };
  }
  
  return base;
}

/**
 * Calculate retry delay with exponential backoff
 */
export function getRetryDelay(attemptNumber) {
  const { RETRY_BACKOFF_BASE, RETRY_BACKOFF_MAX } = STREAMING_CONSTANTS;
  const delay = RETRY_BACKOFF_BASE * Math.pow(2, attemptNumber - 1);
  return Math.min(delay, RETRY_BACKOFF_MAX);
}

/**
 * Check if should use P2P based on connection
 */
export function shouldUseP2P() {
  if (!STREAMING_CONSTANTS.P2P_CONFIG.ENABLED) {
    return false;
  }
  
  // Don't use P2P on very slow connections
  if (typeof navigator !== 'undefined' && navigator.connection) {
    const conn = navigator.connection;
    if (conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g') {
      return false;
    }
    
    // Don't use P2P on save-data mode
    if (conn.saveData) {
      return false;
    }
  }
  
  return true;
}

/**
 * Get recommended quality based on bandwidth
 */
export function getRecommendedQuality(bandwidth) {
  const { BANDWIDTH_THRESHOLDS } = STREAMING_CONSTANTS;
  
  if (bandwidth >= BANDWIDTH_THRESHOLDS.MIN_FOR_1080P) {
    return 1080;
  }
  if (bandwidth >= BANDWIDTH_THRESHOLDS.MIN_FOR_720P) {
    return 720;
  }
  if (bandwidth >= 1000000) {
    return 480;
  }
  return 360;
}

/**
 * Log configuration on startup
 */
export function logStreamingConfig() {
  if (process.env.NODE_ENV === 'development') {
    console.log('🎬 Streaming Configuration:', {
      connection: getConnectionType(),
      mobile: isMobile(),
      timeouts: timeouts,
      p2pEnabled: STREAMING_CONSTANTS.P2P_CONFIG.ENABLED,
    });
  }
}

export default STREAMING_CONSTANTS;