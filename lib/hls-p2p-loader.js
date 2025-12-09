/**
 * 🎬 HLS.js P2P Loader - FIXED VERSION v3
 * 
 * FIXES:
 * ✅ Proper retry on 403/5xx errors
 * ✅ Better manifest/segment detection
 * ✅ Stats reset on retry
 * ✅ Graceful P2P fallback
 * ✅ Cache segment in P2P engine after CDN load
 */

import { getP2PEngine } from "./p2p-engine";

class P2PLoader {
  constructor(config) {
    this.config = config;
    this.p2pEngine = null; // Lazy init
    this.loader = null;
    this.retryCount = 0;
    this.maxRetries = 3;
    this.retryDelay = 1000;

    // HLS.js v1.x REQUIRES this exact structure
    this.stats = this._createStats();
  }

  _createStats() {
    const now = performance.now();
    return {
      aborted: false,
      loaded: 0,
      retry: 0,
      total: 0,
      chunkCount: 1,
      bwEstimate: 0,
      loading: { start: now, first: 0, end: 0 },
      parsing: { start: 0, end: 0 },
      buffering: { start: 0, first: 0, end: 0 },
    };
  }

  _resetStats() {
    this.stats = this._createStats();
    this.retryCount = 0;
  }

  destroy() {
    this.abortInternal();
  }

  abort() {
    this.abortInternal();
  }

  abortInternal() {
    this.stats.aborted = true;

    if (this.loader && this.loader.readyState !== 4) {
      try {
        this.loader.abort();
      } catch (e) {}
    }
    this.loader = null;
  }

  /**
   * Determine content type from context and URL
   */
  _getContentType(context, url) {
    const { type } = context;
    
    // Manifest types in HLS.js
    const manifestTypes = ['manifest', 'level', 'audioTrack', 'subtitleTrack'];
    
    if (manifestTypes.includes(type)) {
      return 'manifest';
    }
    
    // Check URL patterns
    if (url.includes('.m3u8') || url.includes('/manifest') || url.includes('/submanifest')) {
      return 'manifest';
    }
    
    // Segment patterns
    if (/\.(ts|m4s|mp4|m4a|aac|fmp4)(\?|$)/i.test(url)) {
      return 'segment';
    }
    
    // Key files
    if (/\.key(\?|$)/i.test(url) || type === 'key') {
      return 'key';
    }
    
    // Default to segment for unknown
    return 'segment';
  }

  /**
   * Main HLS.js loader interface
   */
  load(context, config, callbacks) {
    const { url } = context;
    
    // Reset stats for new load
    this._resetStats();
    
    const contentType = this._getContentType(context, url);
    
    console.log(`📡 Loading ${contentType.toUpperCase()}:`, url.substring(0, 80));

    // Only use P2P for segments
    if (contentType === 'segment') {
      // Lazy init P2P engine
      if (!this.p2pEngine) {
        try {
          this.p2pEngine = getP2PEngine();
        } catch (e) {
          console.warn('[P2P Loader] P2P engine not available:', e.message);
        }
      }
      
      if (this.p2pEngine?.enabled) {
        return this._loadWithP2P(url, context, config, callbacks);
      }
    }

    // Fallback to CDN for manifests, keys, or when P2P not available
    return this._loadFromCDN(url, context, config, callbacks, contentType);
  }

  /**
   * Load with P2P first, fallback to CDN
   */
  async _loadWithP2P(url, context, config, callbacks) {
    const startTime = performance.now();
    this.stats.loading.start = startTime;

    try {
      // Check if P2P engine has healthy peers
      const stats = this.p2pEngine.getStats();
      
      if (stats.healthyPeers < 2) {
        // Not enough peers, go direct to CDN
        console.log('[P2P Loader] Not enough peers, using CDN');
        return this._loadFromCDN(url, context, config, callbacks, 'segment');
      }

      const data = await this.p2pEngine.fetchChunk(url, {
        headers: config.headers,
      });

      if (this.stats.aborted) return;

      const now = performance.now();
      const loadTime = now - startTime;

      // Update stats
      this.stats.loading.first = startTime + Math.min(loadTime * 0.1, 50);
      this.stats.loading.end = now;
      this.stats.loaded = data.byteLength;
      this.stats.total = data.byteLength;
      this.stats.bwEstimate = (data.byteLength * 8) / (loadTime / 1000);

      console.log(`✅ P2P load (${loadTime.toFixed(0)}ms):`, {
        size: data.byteLength,
        url: url.substring(0, 60),
      });

      const response = {
        url: url,
        data: data,
        code: 200,
        text: 'OK',
      };

      callbacks.onSuccess(response, this.stats, context);

    } catch (error) {
      if (this.stats.aborted) return;
      
      console.warn('[P2P Loader] P2P failed, fallback to CDN:', error.message);
      
      // Reset stats for CDN attempt
      this._resetStats();
      
      this._loadFromCDN(url, context, config, callbacks, 'segment');
    }
  }

  /**
   * Load from CDN with retry logic
   */
  _loadFromCDN(url, context, config, callbacks, contentType = 'segment') {
    const xhr = new XMLHttpRequest();
    const startTime = performance.now();

    this.loader = xhr;
    this.stats.loading.start = startTime;

    xhr.open('GET', url, true);

    // Set response type based on content type
    const isText = contentType === 'manifest';
    xhr.responseType = isText ? 'text' : 'arraybuffer';

    // Set headers
    if (config.headers) {
      Object.keys(config.headers).forEach((key) => {
        xhr.setRequestHeader(key, config.headers[key]);
      });
    }

    // Progress handler
    xhr.onprogress = (event) => {
      if (this.stats.aborted) return;
      
      if (event.lengthComputable) {
        this.stats.total = event.total;
        this.stats.loaded = event.loaded;

        if (this.stats.loading.first === 0 && event.loaded > 0) {
          this.stats.loading.first = performance.now();
        }

        if (callbacks.onProgress) {
          callbacks.onProgress(this.stats, context, null, xhr);
        }
      }
    };

    // Success handler
    xhr.onload = () => {
      if (this.stats.aborted) return;

      const status = xhr.status;

      // ✅ FIX: Handle retryable errors (403, 429, 5xx)
      if (this._shouldRetry(status)) {
        this._retryLoad(url, context, config, callbacks, contentType);
        return;
      }

      if (status >= 200 && status < 300) {
        this._handleSuccess(xhr, url, context, callbacks, isText, startTime);
      } else {
        this._handleError(callbacks, context, {
          code: status,
          text: xhr.statusText,
        }, xhr);
      }
    };

    // Error handler
    xhr.onerror = () => {
      if (this.stats.aborted) return;
      
      // Network error - retry
      if (this.retryCount < this.maxRetries) {
        this._retryLoad(url, context, config, callbacks, contentType);
      } else {
        this._handleError(callbacks, context, {
          code: 0,
          text: 'Network error',
        }, xhr);
      }
    };

    // Timeout handler
    xhr.ontimeout = () => {
      if (this.stats.aborted) return;
      
      if (this.retryCount < this.maxRetries) {
        this._retryLoad(url, context, config, callbacks, contentType);
      } else {
        this._handleError(callbacks, context, {
          code: 0,
          text: 'Timeout',
        }, xhr);
      }
    };

    // Set timeout
    if (config.timeout) {
      xhr.timeout = config.timeout;
    }

    xhr.send();
  }

  /**
   * ✅ FIX: Determine if error should trigger retry
   */
  _shouldRetry(status) {
    // Retry on:
    // - 403 Forbidden (might be temporary rate limit from origin)
    // - 429 Too Many Requests
    // - 500-599 Server errors
    const retryableStatuses = [403, 429, 500, 502, 503, 504];
    return retryableStatuses.includes(status) && this.retryCount < this.maxRetries;
  }

  /**
   * ✅ FIX: Retry with exponential backoff
   */
  _retryLoad(url, context, config, callbacks, contentType) {
    this.retryCount++;
    this.stats.retry = this.retryCount;
    
    const delay = this.retryDelay * Math.pow(1.5, this.retryCount - 1);
    
    console.warn(`[P2P Loader] Retry ${this.retryCount}/${this.maxRetries} in ${delay}ms:`, url.substring(0, 60));

    setTimeout(() => {
      if (this.stats.aborted) return;
      
      // Reset loading stats for retry
      this.stats.loading.start = performance.now();
      this.stats.loading.first = 0;
      this.stats.loading.end = 0;
      this.stats.loaded = 0;
      
      this._loadFromCDN(url, context, config, callbacks, contentType);
    }, delay);
  }

  /**
   * Handle successful response
   */
  _handleSuccess(xhr, url, context, callbacks, isText, startTime) {
    const now = performance.now();
    const loadTime = now - startTime;

    const responseData = isText ? xhr.responseText : xhr.response;

    // Update stats
    this.stats.loading.end = now;

    if (isText) {
      this.stats.loaded = new TextEncoder().encode(responseData).length;
    } else {
      this.stats.loaded = responseData.byteLength;
    }
    
    this.stats.total = this.stats.loaded;
    this.stats.bwEstimate = (this.stats.loaded * 8) / (loadTime / 1000);

    if (this.stats.loading.first === 0) {
      this.stats.loading.first = startTime + Math.min(loadTime * 0.1, 50);
    }

    // ✅ FIX: Cache segment in P2P engine for sharing
    if (!isText && this.p2pEngine) {
      try {
        this.p2pEngine._cacheChunk(url, responseData);
      } catch (e) {
        // Ignore cache errors
      }
    }

    const response = {
      url: url,
      data: responseData,
      code: xhr.status,
      text: xhr.statusText,
    };

    console.log(`✅ ${isText ? 'Manifest' : 'Segment'} loaded:`, {
      size: this.stats.loaded,
      time: loadTime.toFixed(0) + 'ms',
      retries: this.retryCount,
    });

    callbacks.onSuccess(response, this.stats, context);
  }

  /**
   * Handle error response
   */
  _handleError(callbacks, context, response, xhr) {
    console.error('❌ Load Error:', {
      code: response.code,
      text: response.text,
      retries: this.retryCount,
    });

    callbacks.onError(response, context, xhr, this.stats);
  }

  /**
   * Get current stats
   */
  getStats() {
    return this.stats;
  }
}

export default P2PLoader;