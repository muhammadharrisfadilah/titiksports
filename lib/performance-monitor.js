/**
 * Performance Monitoring & Metrics Collection
 * Tracks: Video loading, buffering, quality switches, errors
 */

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      session: {
        id: this.generateSessionId(),
        startTime: Date.now(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        connection: this.getConnectionInfo(),
      },
      video: {
        initStartTime: null,
        initEndTime: null,
        timeToFirstFrame: null,
        totalBufferStalls: 0,
        totalQualitySwitches: 0,
        totalLinkSwitches: 0,
        playbackDuration: 0,
        bufferDuration: 0,
      },
      quality: {
        levels: [],
        currentLevel: null,
        switchHistory: [],
      },
      errors: {
        count: 0,
        history: [],
      },
      network: {
        bytesDownloaded: 0,
        avgBandwidth: 0,
        bandwidthHistory: [],
      },
    };

    this.startTime = null;
    this.lastPlayTime = null;
    this.bufferStartTime = null;
  }

  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  getConnectionInfo() {
    if (typeof navigator === 'undefined' || !navigator.connection) {
      return { type: 'unknown', effectiveType: 'unknown' };
    }
    const conn = navigator.connection;
    return {
      type: conn.type || 'unknown',
      effectiveType: conn.effectiveType || 'unknown',
      downlink: conn.downlink || null,
      rtt: conn.rtt || null,
      saveData: conn.saveData || false,
    };
  }

  // ========== VIDEO LIFECYCLE ==========

  markInitStart() {
    this.metrics.video.initStartTime = performance.now();
    console.log('📊 [Metrics] Video init started');
  }

  markInitEnd() {
    const now = performance.now();
    this.metrics.video.initEndTime = now;
    const duration = now - this.metrics.video.initStartTime;
    console.log(`📊 [Metrics] Video init completed: ${duration.toFixed(2)}ms`);
  }

  markFirstFrame() {
    const now = performance.now();
    this.metrics.video.timeToFirstFrame = now - this.metrics.video.initStartTime;
    console.log(`📊 [Metrics] Time to first frame: ${this.metrics.video.timeToFirstFrame.toFixed(2)}ms`);
    
    // Send to analytics if available
    this.sendMetric('video_first_frame', {
      duration: this.metrics.video.timeToFirstFrame,
      connection: this.metrics.session.connection.effectiveType,
    });
  }

  markPlaybackStart() {
    this.startTime = Date.now();
    this.lastPlayTime = Date.now();
    console.log('📊 [Metrics] Playback started');
  }

  markPlaybackPause() {
    if (this.lastPlayTime) {
      const duration = Date.now() - this.lastPlayTime;
      this.metrics.video.playbackDuration += duration;
      this.lastPlayTime = null;
    }
  }

  markPlaybackResume() {
    this.lastPlayTime = Date.now();
  }

  // ========== BUFFER TRACKING ==========

  markBufferStart() {
    this.bufferStartTime = Date.now();
    this.metrics.video.totalBufferStalls++;
    console.warn(`📊 [Metrics] Buffer stall #${this.metrics.video.totalBufferStalls}`);
  }

  markBufferEnd() {
    if (this.bufferStartTime) {
      const duration = Date.now() - this.bufferStartTime;
      this.metrics.video.bufferDuration += duration;
      this.bufferStartTime = null;
      console.log(`📊 [Metrics] Buffer recovered: ${duration}ms`);
      
      this.sendMetric('buffer_stall', {
        duration,
        totalStalls: this.metrics.video.totalBufferStalls,
      });
    }
  }

  // ========== QUALITY TRACKING ==========

  recordQualitySwitch(fromLevel, toLevel, reason = 'auto') {
    this.metrics.video.totalQualitySwitches++;
    this.metrics.quality.currentLevel = toLevel;
    this.metrics.quality.switchHistory.push({
      timestamp: Date.now(),
      from: fromLevel,
      to: toLevel,
      reason,
    });
    
    console.log(`📊 [Metrics] Quality switch: ${fromLevel?.height || 'unknown'}p → ${toLevel?.height || 'unknown'}p (${reason})`);
    
    this.sendMetric('quality_switch', {
      fromHeight: fromLevel?.height,
      toHeight: toLevel?.height,
      reason,
    });
  }

  updateAvailableLevels(levels) {
    this.metrics.quality.levels = levels.map(l => ({
      width: l.width,
      height: l.height,
      bitrate: l.bitrate,
    }));
  }

  // ========== LINK SWITCHING ==========

  recordLinkSwitch(fromLink, toLink, reason = 'manual') {
    this.metrics.video.totalLinkSwitches++;
    console.log(`📊 [Metrics] Link switch: ${fromLink} → ${toLink} (${reason})`);
    
    this.sendMetric('link_switch', {
      from: fromLink,
      to: toLink,
      reason,
      switchCount: this.metrics.video.totalLinkSwitches,
    });
  }

  // ========== ERROR TRACKING ==========

  recordError(error, context = {}) {
    this.metrics.errors.count++;
    const errorRecord = {
      timestamp: Date.now(),
      message: error?.message || 'Unknown error',
      type: error?.type || 'unknown',
      code: error?.code || null,
      context,
    };
    
    this.metrics.errors.history.push(errorRecord);
    
    // Keep only last 20 errors
    if (this.metrics.errors.history.length > 20) {
      this.metrics.errors.history.shift();
    }
    
    console.error('📊 [Metrics] Error recorded:', errorRecord);
    
    this.sendMetric('player_error', {
      message: errorRecord.message,
      type: errorRecord.type,
      totalErrors: this.metrics.errors.count,
    });
  }

  // ========== NETWORK TRACKING ==========

  updateBandwidth(bandwidth, bytesLoaded = 0) {
    this.metrics.network.bytesDownloaded += bytesLoaded;
    this.metrics.network.bandwidthHistory.push({
      timestamp: Date.now(),
      bandwidth,
      bytesLoaded,
    });
    
    // Keep only last 50 samples
    if (this.metrics.network.bandwidthHistory.length > 50) {
      this.metrics.network.bandwidthHistory.shift();
    }
    
    // Calculate average
    const sum = this.metrics.network.bandwidthHistory.reduce((acc, s) => acc + s.bandwidth, 0);
    this.metrics.network.avgBandwidth = sum / this.metrics.network.bandwidthHistory.length;
  }

  // ========== ANALYTICS INTEGRATION ==========

  sendMetric(eventName, data = {}) {
    // Send to your analytics endpoint
    const payload = {
      event: eventName,
      sessionId: this.metrics.session.id,
      timestamp: Date.now(),
      connection: this.metrics.session.connection.effectiveType,
      ...data,
    };
    
    // Example: Send to custom endpoint
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon('/api/metrics', blob);
    }
    
    // Or log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log('📊 [Analytics]', eventName, data);
    }
  }

  // ========== SESSION SUMMARY ==========

  getSessionSummary() {
    const sessionDuration = Date.now() - this.metrics.session.startTime;
    const playbackRatio = this.metrics.video.playbackDuration / sessionDuration;
    const bufferRatio = this.metrics.video.bufferDuration / sessionDuration;
    
    return {
      sessionId: this.metrics.session.id,
      duration: sessionDuration,
      playbackDuration: this.metrics.video.playbackDuration,
      bufferDuration: this.metrics.video.bufferDuration,
      playbackRatio: (playbackRatio * 100).toFixed(2) + '%',
      bufferRatio: (bufferRatio * 100).toFixed(2) + '%',
      timeToFirstFrame: this.metrics.video.timeToFirstFrame,
      bufferStalls: this.metrics.video.totalBufferStalls,
      qualitySwitches: this.metrics.video.totalQualitySwitches,
      linkSwitches: this.metrics.video.totalLinkSwitches,
      errors: this.metrics.errors.count,
      avgBandwidth: (this.metrics.network.avgBandwidth / 1000000).toFixed(2) + ' Mbps',
      bytesDownloaded: (this.metrics.network.bytesDownloaded / 1048576).toFixed(2) + ' MB',
      connection: this.metrics.session.connection,
    };
  }

  logSummary() {
    const summary = this.getSessionSummary();
    console.log('📊 ========== SESSION SUMMARY ==========');
    console.table(summary);
    return summary;
  }

  // ========== REAL-TIME STATS ==========

  getCurrentStats() {
    return {
      playbackDuration: Math.floor(this.metrics.video.playbackDuration / 1000) + 's',
      bufferStalls: this.metrics.video.totalBufferStalls,
      bufferDuration: Math.floor(this.metrics.video.bufferDuration / 1000) + 's',
      qualitySwitches: this.metrics.video.totalQualitySwitches,
      linkSwitches: this.metrics.video.totalLinkSwitches,
      errors: this.metrics.errors.count,
      currentQuality: this.metrics.quality.currentLevel?.height 
        ? `${this.metrics.quality.currentLevel.height}p` 
        : 'unknown',
      avgBandwidth: (this.metrics.network.avgBandwidth / 1000000).toFixed(2) + ' Mbps',
      connection: this.metrics.session.connection.effectiveType,
    };
  }

  // ========== WEB VITALS INTEGRATION ==========

  measureWebVitals() {
    if (typeof window === 'undefined') return;

    // Largest Contentful Paint (LCP)
    if ('PerformanceObserver' in window) {
      try {
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          console.log('📊 [Web Vitals] LCP:', lastEntry.renderTime || lastEntry.loadTime);
          this.sendMetric('web_vitals_lcp', { 
            value: lastEntry.renderTime || lastEntry.loadTime 
          });
        });
        lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

        // First Input Delay (FID)
        const fidObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach(entry => {
            console.log('📊 [Web Vitals] FID:', entry.processingStart - entry.startTime);
            this.sendMetric('web_vitals_fid', { 
              value: entry.processingStart - entry.startTime 
            });
          });
        });
        fidObserver.observe({ entryTypes: ['first-input'] });

      } catch (e) {
        console.warn('PerformanceObserver not fully supported:', e.message);
      }
    }
  }

  // ========== CLEANUP ==========

  destroy() {
    this.logSummary();
    
    // Send final metrics
    this.sendMetric('session_end', this.getSessionSummary());
    
    // Cleanup
    this.metrics = null;
  }
}

// Singleton instance
let monitorInstance = null;

export function getPerformanceMonitor() {
  if (!monitorInstance) {
    monitorInstance = new PerformanceMonitor();
  }
  return monitorInstance;
}

export function resetPerformanceMonitor() {
  if (monitorInstance) {
    monitorInstance.destroy();
  }
  monitorInstance = new PerformanceMonitor();
  return monitorInstance;
}

export default PerformanceMonitor;