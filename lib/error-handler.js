/**
 * Comprehensive Error Handling & Logging Utility
 * Untuk streaming dan P2P operations
 */

export class StreamError extends Error {
  constructor(message, code = 'STREAM_ERROR', severity = 'warning') {
    super(message);
    this.name = 'StreamError';
    this.code = code;
    this.severity = severity; // 'info' | 'warning' | 'error' | 'critical'
    this.timestamp = new Date().toISOString();
  }
}

/**
 * HLS Error Handler
 */
export function handleHlsError(event) {
  const { type, details, fatal } = event.data;
  const error = {
    timestamp: new Date().toISOString(),
    type,
    details,
    fatal,
    recoverable: !fatal,
    message: getHlsErrorMessage(type, details),
    suggestedAction: getHlsRecoveryAction(type, details, fatal),
  };
  
  if (fatal) {
    console.error('❌ Fatal HLS Error:', error.message);
  } else {
    console.warn('⚠️ HLS Error:', error.message);
  }
  
  return error;
}

/**
 * Get user-friendly HLS error message
 */
function getHlsErrorMessage(type, details) {
  const messages = {
    'NETWORK_ERROR': 'Koneksi network error',
    'MANIFEST_LOAD_ERROR': 'Gagal load manifest',
    'MANIFEST_PARSING_ERROR': 'Format manifest tidak valid',
    'MANIFEST_INCOMPATIBLE_CODECS_ERROR': 'Codec tidak support',
    'LEVEL_LOAD_ERROR': 'Gagal load quality level',
    'LEVEL_PARSING_ERROR': 'Format level tidak valid',
    'FRAG_LOAD_ERROR': 'Gagal load video segment',
    'FRAG_PARSING_ERROR': 'Format segment tidak valid',
    'FRAG_DECRYPT_ERROR': 'Decryption error',
    'BUFFER_APPEND_ERROR': 'Gagal append ke buffer',
    'BUFFER_APPENDING_ERROR': 'Buffer append in progress',
    'BUFFER_STALLED_ERROR': 'Buffer stalled, retrying...',
    'BUFFER_FLUSHING_ERROR': 'Buffer flush error',
    'BUFFER_FULL_ERROR': 'Buffer penuh',
    'BUFFER_SEEK_OVER_DURATION': 'Seek beyond duration',
    'OTHER_ERROR': 'Unknown streaming error',
  };
  
  return messages[details] || messages[type] || 'Streaming error occurred';
}

/**
 * Get suggested recovery action
 */
function getHlsRecoveryAction(type, details, fatal) {
  if (fatal) {
    return {
      action: 'SWITCH_LINK',
      description: 'Ubah ke link streaming lain',
    };
  }
  
  // Non-fatal errors
  if (details?.includes('BUFFER_STALLED')) {
    return {
      action: 'RESUME_PLAYBACK',
      description: 'Coba resume playback',
      delayMs: 1500,
    };
  }
  
  if (details?.includes('FRAG_LOAD_ERROR') || details?.includes('MANIFEST_LOAD_ERROR')) {
    return {
      action: 'RETRY',
      description: 'Retry loading...',
      delayMs: 2000,
    };
  }
  
  return {
    action: 'CONTINUE',
    description: 'Lanjutkan playback',
  };
}

/**
 * P2P Error Handler
 */
export function handleP2PError(error, context = {}) {
  const errorLog = {
    timestamp: new Date().toISOString(),
    message: error?.message || 'P2P Error',
    code: error?.code || 'P2P_ERROR',
    context,
    stack: error?.stack,
    recoverable: true,
  };
  
  console.warn('⚠️ P2P Error:', errorLog);
  return errorLog;
}

/**
 * Network Error Handler
 */
export function handleNetworkError(error, context = {}) {
  // Detect error type
  let errorType = 'UNKNOWN_ERROR';
  let recoverable = true;
  let suggestion = 'Periksa koneksi internet Anda';
  
  if (error?.message?.includes('timeout') || error?.code === 'ETIMEDOUT') {
    errorType = 'TIMEOUT_ERROR';
    suggestion = 'Request timeout, coba ulangi';
    recoverable = true;
  } else if (error?.message?.includes('CORS') || error?.code === 'CORS_ERROR') {
    errorType = 'CORS_ERROR';
    suggestion = 'CORS policy error, hubungi support';
    recoverable = false;
  } else if (error?.status === 403) {
    errorType = 'AUTH_ERROR';
    suggestion = 'Token expired, refresh halaman';
    recoverable = true;
  } else if (error?.status === 404) {
    errorType = 'NOT_FOUND_ERROR';
    suggestion = 'Stream tidak ditemukan';
    recoverable = false;
  } else if (error?.status === 503) {
    errorType = 'SERVICE_UNAVAILABLE';
    suggestion = 'Server sedang maintenance';
    recoverable = true;
  } else if (error?.status >= 500) {
    errorType = 'SERVER_ERROR';
    suggestion = 'Server error, coba beberapa saat lagi';
    recoverable = true;
  } else if (!navigator.onLine) {
    errorType = 'OFFLINE_ERROR';
    suggestion = 'Anda sedang offline';
    recoverable = false;
  }
  
  const errorLog = {
    timestamp: new Date().toISOString(),
    errorType,
    message: error?.message || 'Network error',
    status: error?.status,
    context,
    suggestion,
    recoverable,
  };
  
  console.error(`❌ Network Error [${errorType}]:`, errorLog);
  return errorLog;
}

/**
 * Validation Error
 */
export function createValidationError(field, value, rule) {
  return new StreamError(
    `Validation failed: ${field} ${rule}`,
    'VALIDATION_ERROR',
    'warning'
  );
}

/**
 * Log streaming event
 */
export function logStreamEvent(event, data = {}) {
  const events = {
    'INIT_START': '🎬 Initializing player',
    'INIT_SUCCESS': '✅ Player initialized',
    'INIT_ERROR': '❌ Player init error',
    'STREAM_START': '▶️ Stream started',
    'STREAM_PAUSE': '⏸️ Stream paused',
    'STREAM_RESUME': '▶️ Stream resumed',
    'QUALITY_CHANGE': '📺 Quality changed',
    'LINK_SWITCH': '🔄 Switched link',
    'BUFFER_STALL': '🔄 Buffer stalled',
    'RECOVERY_ATTEMPT': '🔧 Recovery attempt',
    'ERROR_OCCURRED': '❌ Error occurred',
    'TOKEN_REFRESH': '🔐 Token refreshed',
    'P2P_CONNECTED': '🔗 P2P connected',
    'P2P_DISCONNECTED': '🔗 P2P disconnected',
  };
  
  const message = events[event] || event;
  console.log(message, {
    event,
    timestamp: new Date().toISOString(),
    ...data,
  });
}

/**
 * Safe async operation with error handling
 */
export async function safeAsync(fn, context = 'async operation') {
  try {
    return await fn();
  } catch (error) {
    console.error(`❌ Error in ${context}:`, error);
    return {
      success: false,
      error: error?.message || 'Unknown error',
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Rate-limited error logger
 */
export class RateLimitedLogger {
  constructor(cooldownMs = 3000) {
    this.lastLog = {};
    this.cooldownMs = cooldownMs;
  }
  
  shouldLog(key) {
    const now = Date.now();
    const lastTime = this.lastLog[key] || 0;
    const timeSinceLastLog = now - lastTime;
    
    if (timeSinceLastLog >= this.cooldownMs) {
      this.lastLog[key] = now;
      return true;
    }
    return false;
  }
  
  log(key, message, data = {}) {
    if (this.shouldLog(key)) {
      console.log(message, data);
      return true;
    }
    return false;
  }
  
  warn(key, message, data = {}) {
    if (this.shouldLog(key)) {
      console.warn(message, data);
      return true;
    }
    return false;
  }
  
  error(key, message, data = {}) {
    if (this.shouldLog(key)) {
      console.error(message, data);
      return true;
    }
    return false;
  }
}

/**
 * Error Metrics Collector
 */
export class ErrorMetrics {
  constructor() {
    this.errors = [];
    this.maxErrors = 100;
  }
  
  record(errorData) {
    this.errors.push({
      ...errorData,
      id: `error_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    });
    
    // Keep only last 100 errors
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }
  }
  
  getStats() {
    const stats = {
      totalErrors: this.errors.length,
      byType: {},
      byCode: {},
      byHour: {},
      recentErrors: this.errors.slice(-10),
    };
    
    this.errors.forEach(error => {
      // By type
      const type = error.errorType || error.type || 'unknown';
      stats.byType[type] = (stats.byType[type] || 0) + 1;
      
      // By code
      const code = error.code || 'unknown';
      stats.byCode[code] = (stats.byCode[code] || 0) + 1;
      
      // By hour
      const hour = new Date(error.timestamp).toISOString().slice(0, 13);
      stats.byHour[hour] = (stats.byHour[hour] || 0) + 1;
    });
    
    return stats;
  }
  
  clear() {
    this.errors = [];
  }
}

export const errorMetrics = new ErrorMetrics();
export const rateLimitedLogger = new RateLimitedLogger(2000);
