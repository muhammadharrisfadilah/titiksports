/**
 * 🎯 Streaming Constants - OPTIMIZED FOR SMOOTH PLAYBACK
 * 
 * FIXES:
 * ✅ Token refresh sinkron dengan validity
 * ✅ Buffer lebih besar untuk stability
 * ✅ Timeout lebih toleran
 * ✅ Retry strategy lebih konservatif
 */

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

// ✅ FIX: Timeout yang lebih toleran
const getTimeouts = () => {
  const connType = getConnectionType();
  const mobile = isMobile();
  
  if (connType === '4g' && !mobile) {
    return {
      manifestLoadingTimeOut: 15000,  // ✅ 8s → 15s
      levelLoadingTimeOut: 12000,     // ✅ 6s → 12s
      fragLoadingTimeOut: 20000,      // ✅ 8s → 20s (CRITICAL)
    };
  }
  
  if (connType === '3g' || mobile) {
    return {
      manifestLoadingTimeOut: 20000,  // ✅ 12s → 20s
      levelLoadingTimeOut: 18000,     // ✅ 10s → 18s
      fragLoadingTimeOut: 30000,      // ✅ 12s → 30s (CRITICAL)
    };
  }
  
  return {
    manifestLoadingTimeOut: 25000,   // ✅ 15s → 25s
    levelLoadingTimeOut: 20000,      // ✅ 12s → 20s
    fragLoadingTimeOut: 40000,       // ✅ 15s → 40s (CRITICAL)
  };
};

const timeouts = getTimeouts();

export const STREAMING_CONSTANTS = {
  // ========== ✅ FIX: TOKEN TIMING (SINKRON!) ==========
  TOKEN_VALIDITY_DURATION: 1800000,   // 30 menit
  TOKEN_REFRESH_INTERVAL: 1620000,    // ✅ 27 menit (3 min sebelum expired)
  TOKEN_EXPIRING_THRESHOLD: 180000,   // ✅ 3 menit sebelum expired
  
  ERROR_COOLDOWN: 3000,               // ✅ 2s → 3s (lebih toleran)
  LINK_SWITCH_DEBOUNCE: 5000,         // ✅ 3s → 5s (prevent rapid switch)
  UI_HIDE_TIMEOUT: 5000,

  // ========== ✅ FIX: RETRY LIMITS (LEBIH KONSERVATIF) ==========
  MAX_RETRIES: 10,                    // ✅ 6 → 10 (lebih banyak retry)
  MAX_STALL_RETRIES: 20,              // ✅ 10 → 20 (SUPER toleran untuk stall)
  MAX_FRAGMENT_RETRIES: 10,           // ✅ 6 → 10
  
  RETRY_BACKOFF_BASE: 1500,           // ✅ 800ms → 1500ms (lebih lambat)
  RETRY_BACKOFF_MAX: 10000,           // ✅ 6s → 10s
  
  RETRYABLE_STATUS_CODES: [403, 408, 429, 500, 502, 503, 504],
  
  // ========== ✅ FIX: HLS CONFIG (BUFFER LEBIH BESAR) ==========
  HLS_CONFIG: {
    debug: false,
    enableWorker: true,
    lowLatencyMode: false,
    
    // ✅ FIX: Buffer management (LEBIH BESAR!)
    backBufferLength: 60,             // ✅ 30s → 60s
    maxBufferLength: 90,              // ✅ 30s → 90s (CRITICAL!)
    maxMaxBufferLength: 180,          // ✅ 60s → 180s (CRITICAL!)
    maxBufferSize: 60 * 1000 * 1000,  // ✅ 30MB → 60MB
    maxBufferHole: 1.0,               // ✅ 0.5s → 1.0s (lebih toleran)
    
    // ✅ Timeouts (ADAPTIVE & TOLERAN)
    ...timeouts,
    
    // ✅ FIX: Retry configuration (LEBIH BANYAK)
    manifestLoadingMaxRetry: 8,       // ✅ 5 → 8
    levelLoadingMaxRetry: 8,          // ✅ 5 → 8
    fragLoadingMaxRetry: 12,          // ✅ 6 → 12 (CRITICAL!)
    fragLoadingMaxRetryTimeout: 20000,// ✅ 12s → 20s
    
    // ✅ Retry delays (LEBIH LAMBAT)
    manifestLoadingRetryDelay: 2000,  // ✅ 1s → 2s
    levelLoadingRetryDelay: 2000,     // ✅ 1s → 2s
    fragLoadingRetryDelay: 1500,      // ✅ 800ms → 1500ms
    
    // ABR (adaptive bitrate)
    capLevelToPlayerSize: true,
    autoStartLoad: true,
    startLevel: -1,                   // Auto select
    
    // ✅ FIX: ABR tuning (LEBIH KONSERVATIF)
    abrEwmaDefaultEstimate: 400000,   // ✅ 500k → 400k (start lower)
    abrBandWidthFactor: 0.75,         // ✅ 0.85 → 0.75 (lebih konservatif)
    abrBandWidthUpFactor: 0.55,       // ✅ 0.65 → 0.55 (lambat upgrade)
    abrMaxWithRealBitrate: true,
    
    // ABR smoothing
    abrEwmaFastLive: 4.0,             // ✅ 3.0 → 4.0 (lebih smooth)
    abrEwmaSlowLive: 12.0,            // ✅ 9.0 → 12.0 (lebih smooth)
    
    // Fragment management
    highBufferWatchdogPeriod: 3,      // ✅ 2s → 3s
    nudgeMaxRetry: 10,                // ✅ 5 → 10
    nudgeOffset: 0.1,
    
    progressive: true,
    appendErrorMaxRetry: 8,           // ✅ 5 → 8
    
    // ✅ FIX: Live stream optimization (LEBIH JAUH DARI LIVE EDGE)
    liveSyncDurationCount: 5,         // ✅ 3 → 5 (lebih jauh dari live)
    liveMaxLatencyDurationCount: 15,  // ✅ 10 → 15
    liveDurationInfinity: true,
    
    xhrSetup: undefined,
  },

  // ========== ERROR TYPES ==========
  ERROR_TYPES: {
    FATAL: 'FATAL',
    TRANSIENT: 'TRANSIENT',
    TOKEN_EXPIRED: 'TOKEN_EXPIRED',
    NETWORK: 'NETWORK',
    MEDIA: 'MEDIA',
    FORBIDDEN: 'FORBIDDEN',
  },

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

  STREAM_STATES: {
    INITIALIZING: 'INITIALIZING',
    READY: 'READY',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    BUFFERING: 'BUFFERING',
    ERROR: 'ERROR',
    SWITCHING: 'SWITCHING',
    RECOVERING: 'RECOVERING',
  },

  QUALITY_LABELS: {
    AUTO: 'Auto',
    360: '360p',
    480: '480p',
    720: '720p (HD)',
    1080: '1080p (Full HD)',
  },

  BANDWIDTH_THRESHOLDS: {
    MIN_FOR_720P: 2500000,
    MIN_FOR_1080P: 5000000,
    LOW_BANDWIDTH: 500000,
    CRITICAL_LOW: 200000,
  },

  // ========== ✅ FIX: MOBILE CONFIG (BUFFER LEBIH BESAR) ==========
  MOBILE_CONFIG: {
    maxBufferLength: 60,              // ✅ 20s → 60s
    maxMaxBufferLength: 120,          // ✅ 40s → 120s
    maxBufferSize: 40 * 1000 * 1000,  // ✅ 20MB → 40MB
    startLevel: 1,
    capLevelToPlayerSize: true,
    
    abrBandWidthFactor: 0.70,         // ✅ 0.75 → 0.70
    abrBandWidthUpFactor: 0.45,       // ✅ 0.50 → 0.45
    
    fragLoadingMaxRetry: 10,          // ✅ 5 → 10
    fragLoadingMaxRetryTimeout: 30000,// ✅ 15s → 30s
  },

  // ========== P2P CONFIGURATION ==========
  P2P_CONFIG: {
    ENABLED: process.env.NEXT_PUBLIC_ENABLE_P2P !== 'false',
    MIN_PEERS_FOR_P2P: 3,             // ✅ 2 → 3 (lebih strict)
    MAX_PEERS: isMobile() ? 4 : 8,    // ✅ 3/6 → 4/8
    CHUNK_TIMEOUT: 6000,              // ✅ 4s → 6s (lebih toleran)
    MAX_CACHE_SIZE: isMobile() ? 40 * 1024 * 1024 : 80 * 1024 * 1024,
    
    PEER_HEALTH_THRESHOLD: 40,        // ✅ 50 → 40 (lebih toleran)
    PEER_FAILURE_PENALTY: 20,         // ✅ 30 → 20 (lebih ringan)
    PEER_RECOVERY_RATE: 15,           // ✅ 10 → 15 (lebih cepat recovery)
    
    SIGNAL_POLL_INTERVAL: 3000,       // ✅ 2s → 3s (kurangi overhead)
    SIGNAL_TTL: 90,                   // ✅ 60s → 90s
  },

  // ========== ✅ FIX: RECOVERY SETTINGS (LEBIH KONSERVATIF) ==========
  RECOVERY_CONFIG: {
    ERRORS_BEFORE_SWITCH: 8,          // ✅ 3 → 8 (lebih banyak retry sebelum switch)
    STALL_BEFORE_RECOVER: 3,          // ✅ 2s → 3s
    ERRORS_BEFORE_DOWNGRADE: 4,       // ✅ 2 → 4
    FATAL_ERROR_RESET_DELAY: 3000,    // ✅ 2s → 3s
  },
};

// ========== HELPER FUNCTIONS ==========

export function getOptimizedHLSConfig() {
  const base = { ...STREAMING_CONSTANTS.HLS_CONFIG };
  
  if (isMobile()) {
    return {
      ...base,
      ...STREAMING_CONSTANTS.MOBILE_CONFIG,
    };
  }
  
  if (isSlowConnection()) {
    return {
      ...base,
      startLevel: 0,
      abrBandWidthFactor: 0.65,
      maxBufferLength: 45,            // ✅ Tetap cukup besar
      maxMaxBufferLength: 90,
    };
  }
  
  return base;
}

export function getRetryDelay(attemptNumber) {
  const { RETRY_BACKOFF_BASE, RETRY_BACKOFF_MAX } = STREAMING_CONSTANTS;
  const delay = RETRY_BACKOFF_BASE * Math.pow(1.3, attemptNumber - 1); // ✅ 1.5 → 1.3 (lebih lambat growth)
  const jitter = delay * 0.2 * (Math.random() - 0.5);
  return Math.min(delay + jitter, RETRY_BACKOFF_MAX);
}

export function isRetryableStatus(status) {
  return STREAMING_CONSTANTS.RETRYABLE_STATUS_CODES.includes(status);
}

export function shouldUseP2P() {
  if (!STREAMING_CONSTANTS.P2P_CONFIG.ENABLED) return false;
  if (isSlowConnection()) return false;
  return true;
}

export function getRecommendedQuality(bandwidth) {
  const { BANDWIDTH_THRESHOLDS } = STREAMING_CONSTANTS;
  
  if (bandwidth < BANDWIDTH_THRESHOLDS.CRITICAL_LOW) return 'lowest';
  if (bandwidth >= BANDWIDTH_THRESHOLDS.MIN_FOR_1080P) return 1080;
  if (bandwidth >= BANDWIDTH_THRESHOLDS.MIN_FOR_720P) return 720;
  if (bandwidth >= 1000000) return 480;
  return 360;
}

export function getErrorType(status) {
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status >= 500) return 'SERVER_ERROR';
  if (status === 429) return 'RATE_LIMITED';
  return 'UNKNOWN';
}

export function isRecoverableError(error) {
  if (!error.response && error.message?.includes('network')) return true;
  if (error.response?.status >= 500) return true;
  if (error.response?.status === 403) return true;
  if (error.response?.status === 429) return true;
  return false;
}

export function getErrorRetryDelay(error, attemptNumber) {
  const status = error.response?.status;
  
  if (status === 429) {
    const retryAfter = parseInt(error.response?.headers?.['retry-after'] || '5');
    return retryAfter * 1000;
  }
  
  if (status === 403) {
    return Math.min(3000 * attemptNumber, 12000); // ✅ 2s → 3s, 8s → 12s
  }
  
  if (status >= 500) {
    return getRetryDelay(attemptNumber);
  }
  
  return getRetryDelay(attemptNumber);
}

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
        max: config.maxBufferLength + 's',
        maxMax: config.maxMaxBufferLength + 's',
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
      tokenRefresh: STREAMING_CONSTANTS.TOKEN_REFRESH_INTERVAL / 60000 + ' minutes',
    });
  }
}

export default STREAMING_CONSTANTS;