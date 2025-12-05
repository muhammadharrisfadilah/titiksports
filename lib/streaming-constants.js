/**
 * Constants for video streaming configuration
 */

export const STREAMING_CONSTANTS = {
  // Timing constants
  TOKEN_VALIDITY_DURATION: 7200000, // 2 hours
  TOKEN_REFRESH_INTERVAL: 6300000,  // 1 hour 45 mins (refresh 15 mins before expiry)
  ERROR_COOLDOWN: 2000,
  LINK_SWITCH_DEBOUNCE: 3000,
  UI_HIDE_TIMEOUT: 5000,

  // Retry limits
  MAX_RETRIES: 8,
  MAX_STALL_RETRIES: 15,

  // HLS configuration
  HLS_CONFIG: {
    debug: false,
    enableWorker: true,
    lowLatencyMode: false,
    backBufferLength: 60,
    maxBufferLength: 60,
    maxMaxBufferLength: 120,
    maxBufferSize: 40 * 1000 * 1000,
    maxBufferHole: 0.5,
    manifestLoadingTimeOut: 20000,
    levelLoadingTimeOut: 15000,
    fragLoadingTimeOut: 15000,
    manifestLoadingMaxRetry: 6,
    levelLoadingMaxRetry: 6,
    fragLoadingMaxRetry: 6,
  },

  // Error types
  ERROR_TYPES: {
    FATAL: 'FATAL',
    TRANSIENT: 'TRANSIENT',
    TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  },

  // Streaming states
  STREAM_STATES: {
    INITIALIZING: 'INITIALIZING',
    READY: 'READY',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    BUFFERING: 'BUFFERING',
    ERROR: 'ERROR',
  }
};
