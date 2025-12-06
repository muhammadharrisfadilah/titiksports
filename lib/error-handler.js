/**
 * 🔧 Error Handler - OPTIMIZED
 * Fixed memory leaks, added better error recovery
 */

export class StreamError extends Error {
  constructor(message, code = 'STREAM_ERROR', severity = 'warning', context = {}) {
    super(message);
    this.name = 'StreamError';
    this.code = code;
    this.severity = severity;
    this.context = context;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * HLS Error Handler with smart recovery
 */
export function handleHlsError(data) {
  const { type, details, fatal, response } = data;
  
  const error = {
    timestamp: new Date().toISOString(),
    type,
    details,
    fatal,
    recoverable: !fatal,
    httpCode: response?.code || null,
    message: getHlsErrorMessage(type, details),
    recovery: getHlsRecoveryAction(type, details, fatal, response),
  };
  
  if (fatal) {
    console.error('❌ Fatal HLS Error:', error.message, error);
  } else {
    console.warn('⚠️ HLS Error:', error.message);
  }
  
  return error;
}

/**
 * User-friendly error messages
 */
function getHlsErrorMessage(type, details) {
  const messages = {
    // Network errors
    'MANIFEST_LOAD_ERROR': 'Failed to load stream manifest',
    'MANIFEST_LOAD_TIMEOUT': 'Stream manifest loading timeout',
    'LEVEL_LOAD_ERROR': 'Failed to load quality level',
    'LEVEL_LOAD_TIMEOUT': 'Quality level loading timeout',
    'FRAG_LOAD_ERROR': 'Failed to load video segment',
    'FRAG_LOAD_TIMEOUT': 'Video segment loading timeout',
    
    // Parsing errors
    'MANIFEST_PARSING_ERROR': 'Invalid stream format',
    'LEVEL_PARSING_ERROR': 'Invalid quality level format',
    'FRAG_PARSING_ERROR': 'Invalid video segment',
    
    // Buffer errors
    'BUFFER_APPEND_ERROR': 'Failed to append video buffer',
    'BUFFER_APPENDING_ERROR': 'Buffer append in progress',
    'BUFFER_STALLED_ERROR': 'Buffering... retrying',
    'BUFFER_FULL_ERROR': 'Buffer full',
    'BUFFER_NUDGE_ON_STALL': 'Recovering from stall',
    
    // Codec errors
    'MANIFEST_INCOMPATIBLE_CODECS_ERROR': 'Video codec not supported',
    
    // Decryption errors
    'FRAG_DECRYPT_ERROR': 'Decryption failed',
    'KEY_LOAD_ERROR': 'Failed to load decryption key',
    
    // Other
    'INTERNAL_EXCEPTION': 'Internal player error',
  };
  
  return messages[details] || messages[type] || `Stream error: ${details || type}`;
}

/**
 * Recovery strategies
 */
function getHlsRecoveryAction(type, details, fatal, response) {
  // Token expired
  if (response?.code === 403) {
    return {
      action: 'REFRESH_TOKEN',
      description: 'Token expired, refreshing',
      automatic: true,
    };
  }
  
  // Server error
  if (response?.code >= 500) {
    return {
      action: 'RETRY_WITH_BACKOFF',
      description: 'Server error, retrying',
      delayMs: 2000,
      maxRetries: 3,
    };
  }
  
  // Fatal network error
  if (fatal && type === 'NETWORK_ERROR') {
    return {
      action: 'SWITCH_LINK',
      description: 'Network error, switching stream',
      automatic: true,
    };
  }
  
  // Media error
  if (fatal && type === 'MEDIA_ERROR') {
    return {
      action: 'RECOVER_MEDIA',
      description: 'Media error, attempting recovery',
      automatic: true,
    };
  }
  
  // Buffer stall
  if (details === 'BUFFER_STALLED_ERROR') {
    return {
      action: 'NUDGE_PLAYBACK',
      description: 'Buffer stalled, nudging forward',
      delayMs: 1000,
      automatic: true,
    };
  }
  
  // Fragment load error
  if (details?.includes('FRAG_LOAD')) {
    return {
      action: 'RETRY_FRAGMENT',
      description: 'Retrying video segment',
      delayMs: 1000,
      maxRetries: 4,
    };
  }
  
  // Default
  return {
    action: 'CONTINUE',
    description: 'Continue playback',
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
  let errorType = 'UNKNOWN_ERROR';
  let recoverable = true;
  let suggestion = 'Check internet connection';
  
  // Detect error type
  if (error?.message?.includes('timeout') || error?.code === 'ETIMEDOUT') {
    errorType = 'TIMEOUT_ERROR';
    suggestion = 'Request timeout, retrying';
    recoverable = true;
  } else if (error?.message?.includes('CORS') || error?.code === 'CORS_ERROR') {
    errorType = 'CORS_ERROR';
    suggestion = 'CORS policy error';
    recoverable = false;
  } else if (error?.status === 403) {
    errorType = 'AUTH_ERROR';
    suggestion = 'Authentication failed';
    recoverable = true;
  } else if (error?.status === 404) {
    errorType = 'NOT_FOUND_ERROR';
    suggestion = 'Stream not found';
    recoverable = false;
  } else if (error?.status === 503) {
    errorType = 'SERVICE_UNAVAILABLE';
    suggestion = 'Server maintenance';
    recoverable = true;
  } else if (error?.status >= 500) {
    errorType = 'SERVER_ERROR';
    suggestion = 'Server error';
    recoverable = true;
  } else if (!navigator.onLine) {
    errorType = 'OFFLINE_ERROR';
    suggestion = 'You are offline';
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
 * Log streaming events
 */
export function logStreamEvent(event, data = {}) {
  const events = {
    'INIT_START': '🎬 Initializing',
    'INIT_SUCCESS': '✅ Initialized',
    'INIT_ERROR': '❌ Init error',
    'STREAM_START': '▶️ Started',
    'STREAM_PAUSE': '⏸️ Paused',
    'STREAM_RESUME': '▶️ Resumed',
    'QUALITY_CHANGE': '📺 Quality changed',
    'LINK_SWITCH': '🔄 Link switched',
    'BUFFER_STALL': '⏳ Buffer stalled',
    'RECOVERY_ATTEMPT': '🔧 Recovering',
    'ERROR_OCCURRED': '❌ Error',
    'TOKEN_REFRESH': '🔐 Token refreshed',
    'P2P_CONNECTED': '🔗 P2P connected',
    'P2P_DISCONNECTED': '🔗 P2P disconnected',
  };
  
  const message = events[event] || event;
  
  if (process.env.NODE_ENV === 'development') {
    console.log(message, {
      event,
      timestamp: new Date().toISOString(),
      ...data,
    });
  }
}

/**
 * Safe async wrapper
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
 * Rate-Limited Logger - FIXED memory leak
 */
export class RateLimitedLogger {
  constructor(cooldownMs = 3000, maxKeys = 100) {
    this.cooldownMs = cooldownMs;
    this.maxKeys = maxKeys;
    this.lastLog = new Map(); // Use Map instead of object
  }
  
  shouldLog(key) {
    const now = Date.now();
    const lastTime = this.lastLog.get(key) || 0;
    const timeSinceLastLog = now - lastTime;
    
    if (timeSinceLastLog >= this.cooldownMs) {
      this.lastLog.set(key, now);
      
      // LRU eviction if too many keys
      if (this.lastLog.size > this.maxKeys) {
        const oldestKey = this.lastLog.keys().next().value;
        this.lastLog.delete(oldestKey);
      }
      
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
  
  clear() {
    this.lastLog.clear();
  }
  
  size() {
    return this.lastLog.size;
  }
}

/**
 * Error Metrics Collector
 */
export class ErrorMetrics {
  constructor(maxErrors = 100) {
    this.errors = [];
    this.maxErrors = maxErrors;
  }
  
  record(errorData) {
    this.errors.push({
      ...errorData,
      id: `error_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    });
    
    // Keep only recent errors
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }
  }
  
  getStats() {
    const stats = {
      totalErrors: this.errors.length,
      byType: {},
      byCode: {},
      recentErrors: this.errors.slice(-10),
      errorRate: this.calculateErrorRate(),
    };
    
    this.errors.forEach(error => {
      const type = error.errorType || error.type || 'unknown';
      stats.byType[type] = (stats.byType[type] || 0) + 1;
      
      const code = error.code || 'unknown';
      stats.byCode[code] = (stats.byCode[code] || 0) + 1;
    });
    
    return stats;
  }
  
  calculateErrorRate() {
    if (this.errors.length === 0) return 0;
    
    const now = Date.now();
    const recentErrors = this.errors.filter(e => {
      const errorTime = new Date(e.timestamp).getTime();
      return (now - errorTime) < 60000; // Last minute
    });
    
    return recentErrors.length;
  }
  
  clear() {
    this.errors = [];
  }
}

// Singleton instances
export const errorMetrics = new ErrorMetrics();
export const rateLimitedLogger = new RateLimitedLogger(2000, 50);

export default {
  StreamError,
  handleHlsError,
  handleP2PError,
  handleNetworkError,
  logStreamEvent,
  safeAsync,
  RateLimitedLogger,
  ErrorMetrics,
  errorMetrics,
  rateLimitedLogger,
};