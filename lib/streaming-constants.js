/**
 * 🎯 Streaming Constants - OPTIMIZED v2
 * 
 * FIXES:
 * ✅ Token duration synced with Worker
 * ✅ Error retry configuration for 403/5xx
 * ✅ Better retry timing
 * ✅ P2P config improvements
 */

// Detect connection type
const getConnectionType = () => {
  if (typeof navigator === 'undefined' || !navigator.connection) {
    return '4g';
  }
  return navigator.connection.effectiveType || '4g';
};

const isMobile = () => {
  if (typeof navigator === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
};

const isSlowConnection = () => {
  if (typeof navigator === 'undefined' || !navigator.connection) {
    return false;
  }
  const conn = navigator.connection;
  return conn.effectiveType === '2g' || 
         conn.effectiveType === 'slow-2g' ||
         conn.saveData === true;
};

// Adaptive timeouts based on connection
const getTimeouts = () => {
  const connType = getConnectionType();
  const mobile = isMobile();
  
  if (connType === '4g' && !mobile) {
    return {
      manifestLoadingTimeOut: 8000,
      levelLoadingTimeOut: 6000,
      fragLoadingTimeOut: 8000,    // ✅ Increased for 403 retries
    };
  }
  
  if (connType === '3g' || mobile) {
    return {
      manifestLoadingTimeOut: 12000,
      levelLoadingTimeOut: 10000,
      fragLoadingTimeOut: 12000,   // ✅ Increased
    };
  }
  
  return {
    manifestLoadingTimeOut: 15000,
    levelLoadingTimeOut: 12000,
    fragLoadingTimeOut: 15000,     // ✅ Increased
  };
};

const timeouts = getTimeouts();

export const STREAMING_CONSTANTS = {
  // ========== TIMING (SYNCED WITH WORKER) ==========
  TOKEN_VALIDITY_DURATION: 1800000,   // ✅ 30 minutes (synced with Worker v13)
  TOKEN_REFRESH_INTERVAL: 1500000,    // ✅ 25 minutes (refresh 5min before expiry)
  ERROR_COOLDOWN: 2000,
  LINK_SWITCH_DEBOUNCE: 3000,
  UI_HIDE_TIMEOUT: 5000,

  // ========== RETRY LIMITS ==========
  MAX_RETRIES: 6,
  MAX_STALL_RETRIES: 10,
  MAX_FRAGMENT_RETRIES: 6,            // ✅ Increased from 4
  
  RETRY_BACKOFF_BASE: 800,            // ✅ Faster initial retry
  RETRY_BACKOFF_MAX: 6000,            // ✅ Lower max (faster recovery)
  
  // ✅ NEW: Retryable HTTP status codes
  RETRYABLE_STATUS_CODES: [403, 408, 429, 500, 502, 503, 504],
  
  // ========== HLS CONFIGURATION ==========
  HLS_CONFIG: {
    debug: false,
    enableWorker: true,
    lowLatencyMode: false,
    
    // Buffer management
    backBufferLength: 30,
    maxBufferLength: 30,
    maxMaxBufferLength: 60,
    maxBufferSize: 30 * 1000 * 1000,
    maxBufferHole: 0.5,
    
    // Timeouts (ADAPTIVE)
    ...timeouts,
    
    // ✅ FIXED: Retry configuration
    manifestLoadingMaxRetry: 5,
    levelLoadingMaxRetry: 5,
    fragLoadingMaxRetry: 6,            // ✅ Increased for 403 handling
    fragLoadingMaxRetryTimeout: 12000, // ✅ Increased
    
    // ✅ NEW: Retry delays
    manifestLoadingRetryDelay: 1000,
    levelLoadingRetryDelay: 1000,
    fragLoadingRetryDelay: 800,        // Faster fragment retry
    
    // ABR
    capLevelToPlayerSize: true,
    autoStartLoad: true,
    startLevel: -1,
    
    // ABR tuning
    abrEwmaDefaultEstimate: 500000,
    abrBandWidthFactor: 0.85,          // ✅ More conservative
    abrBandWidthUpFactor: 0.65,        // ✅ Even more careful upgrading
    abrMaxWithRealBitrate: true,
    
    // ✅ NEW: ABR smoothing
    abrEwmaFastLive: 3.0,
    abrEwmaSlowLive: 9.0,
    
    // Fragment management
    highBufferWatchdogPeriod: 2,
    nudgeMaxRetry: 5,                  // ✅ Increased from 3
    nudgeOffset: 0.1,
    
    // Progressive loading
    progressive: true,
    
    // ✅ NEW: Better error recovery
    appendErrorMaxRetry: 5,
    
    // ✅ NEW: Live stream optimization
    liveSyncDurationCount: 3,          // Sync to 3 segments behind
    liveMaxLatencyDurationCount: 10,   // Max 10 segments behind
    liveDurationInfinity: true,        // For live streams
    
    xhrSetup: undefined,
  },

  // ========== ERROR TYPES ==========
  ERROR_TYPES: {
    FATAL: 'FATAL',
    TRANSIENT: 'TRANSIENT',
    TOKEN_EXPIRED: 'TOKEN_EXPIRED',
    NETWORK: 'NETWORK',
    MEDIA: 'MEDIA',
    FORBIDDEN: 'FORBIDDEN',            // ✅ NEW
  },

  // ========== ERROR CODES ==========
  ERROR_CODES: {
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    408: 'TIMEOUT',
    429: 'RATE_LIMITED',
    500: 'SERVER_ERROR',
    502: 'BAD_GATEWAY',
    503: 'SERVICE_UNAVAILABLE',
    504: 'GATEWAY_TIMEOUT',
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
    RECOVERING: 'RECOVERING',          // ✅ NEW
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
    MIN_FOR_720P: 2500000,
    MIN_FOR_1080P: 5000000,
    LOW_BANDWIDTH: 500000,
    CRITICAL_LOW: 200000,              // ✅ NEW: Very slow
  },

  // ========== MOBILE OPTIMIZATION ==========
  MOBILE_CONFIG: {
    maxBufferLength: 20,
    maxMaxBufferLength: 40,
    maxBufferSize: 20 * 1000 * 1000,
    startLevel: 1,
    capLevelToPlayerSize: true,
    
    // ✅ NEW: Mobile-specific ABR
    abrBandWidthFactor: 0.75,
    abrBandWidthUpFactor: 0.5,
    
    // ✅ NEW: Mobile retry timing
    fragLoadingMaxRetry: 5,
    fragLoadingMaxRetryTimeout: 15000,
  },

  // ========== P2P CONFIGURATION ==========
  P2P_CONFIG: {
    ENABLED: process.env.NEXT_PUBLIC_ENABLE_P2P !== 'false',
    MIN_PEERS_FOR_P2P: 2,
    MAX_PEERS: isMobile() ? 3 : 6,
    CHUNK_TIMEOUT: 4000,
    MAX_CACHE_SIZE: isMobile() ? 30 * 1024 * 1024 : 50 * 1024 * 1024,
    
    // ✅ NEW: P2P reliability settings
    PEER_HEALTH_THRESHOLD: 50,
    PEER_FAILURE_PENALTY: 30,
    PEER_RECOVERY_RATE: 10,
    
    // ✅ NEW: P2P signaling
    SIGNAL_POLL_INTERVAL: 2000,
    SIGNAL_TTL: 60,
  },

  // ========== RECOVERY SETTINGS ==========
  RECOVERY_CONFIG: {
    // When to switch links
    ERRORS_BEFORE_SWITCH: 3,           // Switch after 3 consecutive errors
    
    // Buffer stall handling
    STALL_BEFORE_RECOVER: 2,           // Recover after 2s stall
    
    // Quality downgrade
    ERRORS_BEFORE_DOWNGRADE: 2,        // Downgrade quality after 2 errors
    
    // Full reset
    FATAL_ERROR_RESET_DELAY: 2000,     // Wait 2s before full reset
  },
};

// ========== HELPER FUNCTIONS ==========

/**
 * Get optimized HLS config based on device & connection
 */
export function getOptimizedHLSConfig() {
  const base = { ...STREAMING_CONSTANTS.HLS_CONFIG };
  
  // Mobile-specific optimizations
  if (isMobile()) {
    return {
      ...base,
      ...STREAMING_CONSTANTS.MOBILE_CONFIG,
    };
  }
  
  // Slow connection optimizations
  if (isSlowConnection()) {
    return {
      ...base,
      startLevel: 0,                    // Lowest quality
      abrBandWidthFactor: 0.7,
      maxBufferLength: 15,
      maxMaxBufferLength: 30,
    };
  }
  
  return base;
}

/**
 * Calculate retry delay with exponential backoff + jitter
 */
export function getRetryDelay(attemptNumber) {
  const { RETRY_BACKOFF_BASE, RETRY_BACKOFF_MAX } = STREAMING_CONSTANTS;
  
  // Exponential backoff
  const delay = RETRY_BACKOFF_BASE * Math.pow(1.5, attemptNumber - 1);
  
  // Add jitter (±20%)
  const jitter = delay * 0.2 * (Math.random() - 0.5);
  
  return Math.min(delay + jitter, RETRY_BACKOFF_MAX);
}

/**
 * Check if HTTP status should trigger retry
 */
export function isRetryableStatus(status) {
  return STREAMING_CONSTANTS.RETRYABLE_STATUS_CODES.includes(status);
}

/**
 * Check if should use P2P based on connection
 */
export function shouldUseP2P() {
  if (!STREAMING_CONSTANTS.P2P_CONFIG.ENABLED) {
    return false;
  }
  
  if (isSlowConnection()) {
    return false;
  }
  
  return true;
}

/**
 * Get recommended quality based on bandwidth
 */
export function getRecommendedQuality(bandwidth) {
  const { BANDWIDTH_THRESHOLDS } = STREAMING_CONSTANTS;
  
  if (bandwidth < BANDWIDTH_THRESHOLDS.CRITICAL_LOW) {
    return 'lowest'; // Force lowest available
  }
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
 * Get error type from HTTP status
 */
export function getErrorType(status) {
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status >= 500) return 'SERVER_ERROR';
  if (status === 429) return 'RATE_LIMITED';
  return 'UNKNOWN';
}

/**
 * Check if error is recoverable
 */
export function isRecoverableError(error) {
  // Network errors are usually recoverable
  if (!error.response && error.message?.includes('network')) {
    return true;
  }
  
  // 5xx errors are recoverable
  if (error.response?.status >= 500) {
    return true;
  }
  
  // 403 might be temporary (rate limit)
  if (error.response?.status === 403) {
    return true;
  }
  
  // 429 is recoverable after waiting
  if (error.response?.status === 429) {
    return true;
  }
  
  return false;
}

/**
 * Get delay before retry based on error type
 */
export function getErrorRetryDelay(error, attemptNumber) {
  const status = error.response?.status;
  
  // Rate limited - respect Retry-After or wait longer
  if (status === 429) {
    const retryAfter = parseInt(error.response?.headers?.['retry-after'] || '5');
    return retryAfter * 1000;
  }
  
  // 403 - might be origin rate limit, wait a bit
  if (status === 403) {
    return Math.min(2000 * attemptNumber, 8000);
  }
  
  // Server errors - exponential backoff
  if (status >= 500) {
    return getRetryDelay(attemptNumber);
  }
  
  // Default backoff
  return getRetryDelay(attemptNumber);
}

/**
 * Log configuration on startup (dev only)
 */
export function logStreamingConfig() {
  if (process.env.NODE_ENV === 'development') {
    const config = getOptimizedHLSConfig();
    console.log('🎬 Streaming Configuration:', {
      connection: getConnectionType(),
      mobile: isMobile(),
      slowConnection: isSlowConnection(),
      timeouts: {
        manifest: config.manifestLoadingTimeOut,
        level: config.levelLoadingTimeOut,
        fragment: config.fragLoadingTimeOut,
      },
      buffer: {
        max: config.maxBufferLength,
        size: config.maxBufferSize / 1024 / 1024 + 'MB',
      },
      retries: {
        fragment: config.fragLoadingMaxRetry,
        timeout: config.fragLoadingMaxRetryTimeout,
      },
      p2p: {
        enabled: STREAMING_CONSTANTS.P2P_CONFIG.ENABLED,
        maxPeers: STREAMING_CONSTANTS.P2P_CONFIG.MAX_PEERS,
      },
      tokenValidity: STREAMING_CONSTANTS.TOKEN_VALIDITY_DURATION / 60000 + ' minutes',
    });
  }
}

export default STREAMING_CONSTANTS;