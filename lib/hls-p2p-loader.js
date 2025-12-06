/**
 * 🎬 HLS.js P2P Loader - FIXED VERSION v2
 * Compatible dengan HLS.js v1.x dengan proper stats structure
 */

import { getP2PEngine } from "./p2p-engine";

class P2PLoader {
  constructor(config) {
    this.config = config;
    this.p2pEngine = getP2PEngine();

    // HLS.js v1.x REQUIRES this exact structure
    this.stats = {
      aborted: false,
      loaded: 0,
      retry: 0,
      total: 0,
      chunkCount: 1,
      bwEstimate: 0,
      loading: { start: 0, first: 0, end: 0 },
      parsing: { start: 0, end: 0 },
      buffering: { start: 0, first: 0, end: 0 },
    };
  }

  destroy() {
    this.abortInternal();
  }

  abort() {
    this.abortInternal();
  }

  abortInternal() {
    // Mark as aborted
    this.stats.aborted = true;

    // Cancel any pending XHR
    if (this.loader && this.loader.readyState !== 4) {
      this.loader.abort();
    }
  }

  /**
   * Main HLS.js loader interface
   * CRITICAL: Must match HLS.js v1.x signature exactly
   */
  load(context, config, callbacks) {
    const { url, type } = context;

    // Reset stats for new load
    this.resetStats();

    // Only use P2P for video segments
    const isSegment = type === "video" || /\.(ts|m4s)$/i.test(url);

    if (!isSegment || !this.p2pEngine.enabled) {
      return this._loadFromCDN(url, context, config, callbacks);
    }

    // Try P2P
    this._loadWithP2P(url, context, config, callbacks);
  }

  resetStats() {
    const now = performance.now();
    this.stats = {
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

  /**
   * Load with P2P (simplified)
   */
  async _loadWithP2P(url, context, config, callbacks) {
    const startTime = performance.now();
    this.stats.loading.start = startTime;

    try {
      const data = await this.p2pEngine.fetchChunk(url, {
        headers: config.headers,
      });

      const now = performance.now();
      const loadTime = now - startTime;

      console.log(`✅ P2P load (${loadTime.toFixed(0)}ms):`, url);

      // Update stats properly
      this.stats.loading.first = startTime + loadTime * 0.1;
      this.stats.loading.end = now;
      this.stats.loaded = data.byteLength;
      this.stats.total = data.byteLength;
      this.stats.bwEstimate = (data.byteLength * 8) / (loadTime / 1000); // bits per second

      // CRITICAL: Response must have this exact structure for HLS.js v1.x
      const response = {
        url: url,
        data: data,
        code: 200,
        text: "",
      };

      // Call success callback
      callbacks.onSuccess(response, this.stats, context);
    } catch (error) {
      console.error("❌ P2P failed, fallback to CDN:", error.message);
      this._loadFromCDN(url, context, config, callbacks);
    }
  }

  /**
   * Load from CDN (fallback)
   * FIXED: Proper stats structure for HLS.js v1.x
   */
  /**
   * Load from CDN (fallback)
   * FIXED: Proper response type detection for manifest vs segments
   */
  _loadFromCDN(url, context, config, callbacks) {
    const xhr = new XMLHttpRequest();
    const startTime = performance.now();

    this.loader = xhr;
    this.stats.loading.start = startTime;

    xhr.open("GET", url, true);

    // ✅ CRITICAL FIX: Set correct responseType based on content type
    // Manifest = text, Segments = arraybuffer
    const isManifest =
      context.type === "manifest" ||
      url.includes(".m3u8") ||
      url.includes("/manifest");

    xhr.responseType = isManifest ? "text" : "arraybuffer";

    console.log(`📡 Loading ${isManifest ? "MANIFEST" : "SEGMENT"}:`, url);

    // Set headers
    if (config.headers) {
      Object.keys(config.headers).forEach((key) => {
        xhr.setRequestHeader(key, config.headers[key]);
      });
    }

    // Progress handler
    xhr.onprogress = (event) => {
      if (event.lengthComputable) {
        this.stats.total = event.total;
        this.stats.loaded = event.loaded;

        // Update first byte time
        if (this.stats.loading.first === 0 && event.loaded > 0) {
          this.stats.loading.first = performance.now();
        }

        // Call progress callback if exists
        if (callbacks.onProgress) {
          callbacks.onProgress(this.stats, context, null, xhr);
        }
      }
    };

    // Success handler
    xhr.onload = () => {
      if (this.stats.aborted) return;

      if (xhr.status >= 200 && xhr.status < 300) {
        const now = performance.now();
        const loadTime = now - startTime;

        // Get response data based on type
        const responseData = isManifest ? xhr.responseText : xhr.response;

        // Update stats properly
        this.stats.loading.end = now;

        // Calculate loaded size
        if (isManifest) {
          // For text manifest, get byte length
          this.stats.loaded = new Blob([responseData]).size;
          this.stats.total = this.stats.loaded;
        } else {
          // For binary segments
          this.stats.loaded = xhr.response.byteLength;
          this.stats.total = xhr.response.byteLength;
        }

        this.stats.bwEstimate = (this.stats.loaded * 8) / (loadTime / 1000);

        // Set first byte time if not set
        if (this.stats.loading.first === 0) {
          this.stats.loading.first = startTime + 50; // estimate
        }

        // ✅ CRITICAL: Response structure for HLS.js v1.x
        const response = {
          url: url,
          data: responseData, // String for manifest, ArrayBuffer for segments
          code: xhr.status,
          text: xhr.statusText,
        };

        console.log(`✅ ${isManifest ? "Manifest" : "Segment"} loaded:`, {
          size: this.stats.loaded,
          time: loadTime.toFixed(0) + "ms",
          type: typeof responseData,
        });

        // Call success callback with CORRECT argument order
        callbacks.onSuccess(response, this.stats, context);
      } else {
        this._handleError(
          callbacks,
          context,
          {
            code: xhr.status,
            text: xhr.statusText,
          },
          xhr
        );
      }
    };

    // Error handler
    xhr.onerror = () => {
      if (this.stats.aborted) return;
      this._handleError(
        callbacks,
        context,
        {
          code: 0,
          text: "Network error",
        },
        xhr
      );
    };

    // Timeout handler
    xhr.ontimeout = () => {
      if (this.stats.aborted) return;
      this._handleError(
        callbacks,
        context,
        {
          code: 0,
          text: "Timeout",
        },
        xhr
      );
    };

    // Set timeout
    if (config.timeout) {
      xhr.timeout = config.timeout;
    }

    // Send request
    xhr.send();
  }

  _handleError(callbacks, context, response, xhr) {
    const errorData = {
      code: response.code,
      text: response.text,
    };

    console.error("❌ XHR Error:", errorData);

    callbacks.onError(errorData, context, xhr, this.stats);
  }

  getStats() {
    return this.stats;
  }
}

export default P2PLoader;
