/**
 * 🔧 Error Handler - ENHANCED v2
 * 
 * IMPROVEMENTS:
 * ✅ 429 Rate limit handling
 * ✅ Better error code matching
 * ✅ localStorage backup for debugging
 * ✅ Error aggregation for reporting
 * ✅ Retry delay calculator
 */

export class StreamError extends Error {
  constructor(message, code = 'STREAM_ERROR', severity = 'warning', context = {}) {
    super(message);
    this.name = 'StreamError';
    this.code = code;
    this.severity = severity;
    this.context = context;
    this.timestamp = new Date().toISOString();
    this.recoverable = severity !== 'fatal';
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      severity: this.severity,
      context: this.context,
      timestamp: this.timestamp,
      recoverable: this.recoverable,
    };
  }
}

// ========== HLS ERROR CODES ==========

const HLS_ERROR_DETAILS = {
  // Network errors
  MANIFEST_LOAD_ERROR: { message: 'Failed to load stream manifest', recoverable: true },
  MANIFEST_LOAD_TIMEOUT: { message: 'Stream manifest loading timeout', recoverable: true },
  LEVEL_LOAD_ERROR: { message: 'Failed to load quality level', recoverable: true },
  LEVEL_LOAD_TIMEOUT: { message: 'Quality level loading timeout', recoverable: true },
  FRAG_LOAD_ERROR: { message: 'Failed to load video segment', recoverable: true },
  FRAG_LOAD_TIMEOUT: { message: 'Video segment loading timeout', recoverable: true },
  
  // Parsing errors
  MANIFEST_PARSING_ERROR: { message: 'Invalid stream format', recoverable: false },
  LEVEL_PARSING_ERROR: { message: 'Invalid quality level format', recoverable: false },
  FRAG_PARSING_ERROR: { message: 'Invalid video segment', recoverable: true },
  
  // Buffer errors
  BUFFER_APPEND_ERROR: { message: 'Failed to append video buffer', recoverable: true },
  BUFFER_APPENDING_ERROR: { message: 'Buffer append in progress', recoverable: true },
  BUFFER_STALLED_ERROR: { message: 'Buffering... retrying', recoverable: true },
  BUFFER_FULL_ERROR: { message: 'Buffer full', recoverable: true },
  BUFFER_NUDGE_ON_STALL: { message: 'Recovering from stall', recoverable: true },
  
  // Codec errors
  MANIFEST_INCOMPATIBLE_CODECS_ERROR: { message: 'Video codec not supported', recoverable: false },
  
  // Decryption errors
  FRAG_DECRYPT_ERROR: { message: 'Decryption failed', recoverable: false },
  KEY_LOAD_ERROR: { message: 'Failed to load decryption key', recoverable: true },
  KEY_LOAD_TIMEOUT: { message: 'Decryption key timeout', recoverable: true },
  
  // Other
  INTERNAL_EXCEPTION: { message: 'Internal player error', recoverable: false },
  REMUX_ALLOC_ERROR: { message: 'Memory allocation error', recoverable: false },
};

// ========== HTTP ERROR CODES ==========

const HTTP_ERRORS = {
  400: { type: 'BAD_REQUEST', message: 'Bad request', recoverable: false },
  401: { type: 'UNAUTHORIZED', message: 'Unauthorized', recoverable: true },
  403: { type: 'FORBIDDEN', message: 'Access denied', recoverable: true },
  404: { type: 'NOT_FOUND', message: 'Stream not found', recoverable: false },
  408: { type: 'TIMEOUT', message: 'Request timeout', recoverable: true },
  429: { type: 'RATE_LIMITED', message: 'Too many requests', recoverable: true },
  500: { type: 'SERVER_ERROR', message: 'Server error', recoverable: true },
  502: { type: 'BAD_GATEWAY', message: 'Bad gateway', recoverable: true },
  503: { type: 'SERVICE_UNAVAILABLE', message: 'Service unavailable', recoverable: true },
  504: { type: 'GATEWAY_TIMEOUT', message: 'Gateway timeout', recoverable: true },
};

/**
 * HLS Error Handler with smart recovery
 */
export function handleHlsError(data) {
  const { type, details, fatal, response, frag, url } = data;
  
  const errorInfo = HLS_ERROR_DETAILS[details] || { 
    message: `Stream error: ${details || type}`, 
    recoverable: !fatal 
  };
  
  const httpError = response?.code ? HTTP_ERRORS[response.code] : null;
  
  const error = {
    id: `hls_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    type,
    details,
    fatal,
    recoverable: !fatal && errorInfo.recoverable,
    httpCode: response?.code || null,
    httpError: httpError?.type || null,
    message: httpError?.message || errorInfo.message,
    url: url ? redactUrl(url) : (frag?.url ? redactUrl(frag.url) : null),
    recovery: getHlsRecoveryAction(type, details, fatal, response),
  };
  
  // Log based on severity
  if (fatal) {
    console.error('❌ Fatal HLS Error:', error.message, error);
  } else {
    rateLimitedLogger.warn(`hls_${details}`, '⚠️ HLS Error:', error);
  }
  
  // Record metrics
  errorMetrics.record(error);
  
  return error;
}

/**
 * Recovery strategies - ENHANCED
 */
function getHlsRecoveryAction(type, details, fatal, response) {
  const code = response?.code;
  
  // Rate limited (429)
  if (code === 429) {
    const retryAfter = parseInt(response?.headers?.['retry-after'] || '5');
    return {
      action: 'WAIT_AND_RETRY',
      description: 'Rate limited, waiting before retry',
      delayMs: retryAfter * 1000,
      maxRetries: 5,
      automatic: true,
    };
  }
  
  // Token expired (403)
  if (code === 403) {
    return {
      action: 'REFRESH_TOKEN',
      description: 'Token expired or invalid, refreshing',
      delayMs: 1000,
      automatic: true,
    };
  }
  
  // Server error (5xx)
  if (code >= 500) {
    return {
      action: 'RETRY_WITH_BACKOFF',
      description: 'Server error, retrying with backoff',
      delayMs: calculateBackoffDelay(1),
      maxRetries: 3,
      automatic: true,
    };
  }
  
  // Not found (404)
  if (code === 404) {
    return {
      action: 'SWITCH_LINK',
      description: 'Stream not found, trying alternative',
      delayMs: 0,
      automatic: true,
    };
  }
  
  // Fatal network error
  if (fatal && type === 'networkError') {
    return {
      action: 'SWITCH_LINK',
      description: 'Network error, switching stream',
      delayMs: 1500,
      automatic: true,
    };
  }
  
  // Fatal media error
  if (fatal && type === 'mediaError') {
    return {
      action: 'RECOVER_MEDIA',
      description: 'Media error, attempting recovery',
      delayMs: 500,
      automatic: true,
    };
  }
  
  // Buffer stall
  if (details === 'BUFFER_STALLED_ERROR' || details === 'BUFFER_NUDGE_ON_STALL') {
    return {
      action: 'NUDGE_PLAYBACK',
      description: 'Buffer stalled, nudging forward',
      delayMs: 500,
      automatic: true,
    };
  }
  
  // Fragment errors - exact match
  if (details === 'FRAG_LOAD_ERROR' || details === 'FRAG_LOAD_TIMEOUT') {
    return {
      action: 'RETRY_FRAGMENT',
      description: 'Retrying video segment',
      delayMs: 800,
      maxRetries: 4,
      automatic: true,
    };
  }
  
  // Level errors
  if (details === 'LEVEL_LOAD_ERROR' || details === 'LEVEL_LOAD_TIMEOUT') {
    return {
      action: 'SWITCH_LEVEL',
      description: 'Switching quality level',
      delayMs: 1000,
      automatic: true,
    };
  }
  
  // Manifest errors
  if (details === 'MANIFEST_LOAD_ERROR' || details === 'MANIFEST_LOAD_TIMEOUT') {
    return {
      action: 'RELOAD_MANIFEST',
      description: 'Reloading stream',
      delayMs: 2000,
      maxRetries: 3,
      automatic: true,
    };
  }
  
  // Default - non-fatal continue, fatal switch
  return {
    action: fatal ? 'SWITCH_LINK' : 'CONTINUE',
    description: fatal ? 'Fatal error, switching stream' : 'Continue playback',
    delayMs: fatal ? 1500 : 0,
    automatic: !fatal,
  };
}

/**
 * Calculate exponential backoff delay with jitter
 */
export function calculateBackoffDelay(attempt, baseMs = 1000, maxMs = 8000) {
  const exponentialDelay = baseMs * Math.pow(1.5, attempt - 1);
  const jitter = exponentialDelay * 0.2 * (Math.random() - 0.5);
  return Math.min(exponentialDelay + jitter, maxMs);
}

/**
 * Redact sensitive URL parts
 */
function redactUrl(url) {
  try {
    const u = new URL(url);
    // Remove query params for privacy
    return `${u.origin}${u.pathname}`;
  } catch {
    return '[invalid-url]';
  }
}

/**
 * P2P Error Handler
 */
export function handleP2PError(error, context = {}) {
  const errorLog = {
    id: `p2p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    type: 'P2P_ERROR',
    message: error?.message || 'P2P Error',
    code: error?.code || 'P2P_ERROR',
    context,
    recoverable: true,
  };
  
  rateLimitedLogger.warn(`p2p_${error?.code}`, '⚠️ P2P Error:', errorLog);
  errorMetrics.record(errorLog);
  
  return errorLog;
}

/**
 * Network Error Handler - ENHANCED
 */
export function handleNetworkError(error, context = {}) {
  const status = error?.status || error?.response?.status;
  const httpError = status ? HTTP_ERRORS[status] : null;
  
  let errorType = httpError?.type || 'UNKNOWN_ERROR';
  let recoverable = httpError?.recoverable ?? true;
  let suggestion = httpError?.message || 'Check internet connection';
  let retryDelay = null;
  
  // Detect specific error types
  if (error?.message?.includes('timeout') || error?.code === 'ETIMEDOUT') {
    errorType = 'TIMEOUT_ERROR';
    suggestion = 'Request timeout, retrying';
    retryDelay = 2000;
  } else if (error?.message?.includes('CORS')) {
    errorType = 'CORS_ERROR';
    suggestion = 'CORS policy error';
    recoverable = false;
  } else if (error?.message?.includes('abort')) {
    errorType = 'ABORTED';
    suggestion = 'Request was cancelled';
    recoverable = false;
  } else if (!navigator?.onLine) {
    errorType = 'OFFLINE_ERROR';
    suggestion = 'You are offline';
    recoverable = false;
  } else if (status === 429) {
    retryDelay = parseInt(error?.response?.headers?.['retry-after'] || '5') * 1000;
  }
  
  const errorLog = {
    id: `net_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    errorType,
    message: error?.message || 'Network error',
    status,
    context,
    suggestion,
    recoverable,
    retryDelay,
  };
  
  console.error(`❌ Network Error [${errorType}]:`, errorLog);
  errorMetrics.record(errorLog);
  
  return errorLog;
}

/**
 * Log streaming events
 */
const EVENT_ICONS = {
  'INIT_START': '🎬',
  'INIT_SUCCESS': '✅',
  'INIT_ERROR': '❌',
  'STREAM_START': '▶️',
  'STREAM_PAUSE': '⏸️',
  'STREAM_RESUME': '▶️',
  'QUALITY_CHANGE': '📺',
  'LINK_SWITCH': '🔄',
  'BUFFER_STALL': '⏳',
  'BUFFER_RECOVERED': '✅',
  'RECOVERY_ATTEMPT': '🔧',
  'RECOVERY_SUCCESS': '✅',
  'RECOVERY_FAILED': '❌',
  'ERROR_OCCURRED': '❌',
  'TOKEN_REFRESH': '🔐',
  'TOKEN_EXPIRED': '⏰',
  'P2P_CONNECTED': '🔗',
  'P2P_DISCONNECTED': '🔗',
  'P2P_PEER_JOINED': '👋',
  'P2P_PEER_LEFT': '👋',
};

export function logStreamEvent(event, data = {}) {
  const icon = EVENT_ICONS[event] || '📝';
  const message = `${icon} ${event}`;
  
  if (process.env.NODE_ENV === 'development') {
    console.log(message, {
      event,
      timestamp: new Date().toISOString(),
      ...data,
    });
  }
  
  // Also record important events as metrics
  if (['INIT_ERROR', 'ERROR_OCCURRED', 'RECOVERY_FAILED', 'LINK_SWITCH'].includes(event)) {
    errorMetrics.record({
      type: 'STREAM_EVENT',
      event,
      timestamp: new Date().toISOString(),
      ...data,
    });
  }
}

/**
 * Safe async wrapper with timeout
 */
export async function safeAsync(fn, context = 'async operation', timeoutMs = 30000) {
  try {
    const result = await Promise.race([
      fn(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Operation timeout')), timeoutMs)
      ),
    ]);
    return { success: true, data: result };
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
    this.lastLog = new Map();
  }
  
  shouldLog(key) {
    const now = Date.now();
    const lastTime = this.lastLog.get(key) || 0;
    
    if (now - lastTime >= this.cooldownMs) {
      this.lastLog.set(key, now);
      
      // LRU eviction
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
 * Error Metrics Collector - ENHANCED
 */
export class ErrorMetrics {
  constructor(maxErrors = 100) {
    this.errors = [];
    this.maxErrors = maxErrors;
    this.sessionId = `session_${Date.now()}`;
    
    // Try to restore from localStorage (for debugging)
    this._restore();
  }
  
  record(errorData) {
    const error = {
      ...errorData,
      id: errorData.id || `error_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      sessionId: this.sessionId,
    };
    
    this.errors.push(error);
    
    // Keep only recent errors
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }
    
    // Persist to localStorage (for debugging)
    this._persist();
  }
  
  getStats() {
    const now = Date.now();
    const lastMinute = this.errors.filter(e => 
      (now - new Date(e.timestamp).getTime()) < 60000
    );
    
    const stats = {
      totalErrors: this.errors.length,
      errorsLastMinute: lastMinute.length,
      byType: {},
      byCode: {},
      recentErrors: this.errors.slice(-10),
      errorRate: lastMinute.length, // errors per minute
    };
    
    this.errors.forEach(error => {
      const type = error.errorType || error.type || 'unknown';
      stats.byType[type] = (stats.byType[type] || 0) + 1;
      
      if (error.httpCode) {
        stats.byCode[error.httpCode] = (stats.byCode[error.httpCode] || 0) + 1;
      }
    });
    
    return stats;
  }
  
  getRecentByType(type, limit = 5) {
    return this.errors
      .filter(e => e.type === type || e.errorType === type)
      .slice(-limit);
  }
  
  _persist() {
    if (typeof localStorage === 'undefined') return;
    
    try {
      // Only persist last 20 errors for debugging
      const toStore = this.errors.slice(-20);
      localStorage.setItem('stream_errors', JSON.stringify(toStore));
    } catch (e) {
      // Ignore storage errors
    }
  }
  
  _restore() {
    if (typeof localStorage === 'undefined') return;
    
    try {
      const stored = localStorage.getItem('stream_errors');
      if (stored) {
        const parsed = JSON.parse(stored);
        // Only restore if from same session (prevent stale data)
        // Actually, for debugging, let's keep it
        this.errors = parsed.filter(e => 
          // Only errors from last hour
          (Date.now() - new Date(e.timestamp).getTime()) < 3600000
        );
      }
    } catch (e) {
      // Ignore
    }
  }
  
  clear() {
    this.errors = [];
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('stream_errors');
    }
  }
  
  // Export for error reporting
  export() {
    return {
      sessionId: this.sessionId,
      stats: this.getStats(),
      errors: this.errors,
      exportedAt: new Date().toISOString(),
    };
  }
}

// ========== SINGLETON INSTANCES ==========

export const errorMetrics = new ErrorMetrics();
export const rateLimitedLogger = new RateLimitedLogger(2000, 50);

// ========== DEFAULT EXPORT ==========

export default {
  StreamError,
  handleHlsError,
  handleP2PError,
  handleNetworkError,
  logStreamEvent,
  safeAsync,
  calculateBackoffDelay,
  RateLimitedLogger,
  ErrorMetrics,
  errorMetrics,
  rateLimitedLogger,
};