/**
 * 📊 Performance Monitoring & Metrics Collection - v2
 * 
 * IMPROVEMENTS:
 * ✅ P2P metrics tracking
 * ✅ Better memory management
 * ✅ Fallback for /api/metrics 404
 * ✅ Real-time export for debugging
 * ✅ Cumulative Shift Layout (CLS) tracking
 */

class PerformanceMonitor {
  constructor() {
    this.metrics = {
      session: {
        id: this.generateSessionId(),
        startTime: Date.now(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        connection: this.getConnectionInfo(),
        matchId: null,
        linkId: null,
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
        currentState: 'idle', // idle, loading, playing, paused, buffering, error
      },
      quality: {
        levels: [],
        currentLevel: null,
        switchHistory: [],
        maxHistorySize: 20,
      },
      errors: {
        count: 0,
        history: [],
        maxHistorySize: 20,
      },
      network: {
        bytesDownloaded: 0,
        avgBandwidth: 0,
        bandwidthHistory: [],
        maxHistorySize: 30,
      },
      // ✅ NEW: P2P metrics
      p2p: {
        enabled: false,
        peers: 0,
        healthyPeers: 0,
        p2pHits: 0,
        cdnFallbacks: 0,
        bytesFromPeers: 0,
        bytesShared: 0,
        offloadRatio: 0,
        avgLatency: 0,
      },
      // ✅ NEW: Web Vitals
      webVitals: {
        lcp: null,
        fid: null,
        cls: null,
        ttfb: null,
      },
    };

    this.startTime = null;
    this.lastPlayTime = null;
    this.bufferStartTime = null;
    this.metricsEndpoint = '/api/metrics';
    this.metricsEnabled = true;
    
    // Start Web Vitals measurement
    this.measureWebVitals();
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

  // ========== SESSION ==========

  setMatchInfo(matchId, linkId) {
    this.metrics.session.matchId = matchId;
    this.metrics.session.linkId = linkId;
  }

  // ========== VIDEO LIFECYCLE ==========

  markInitStart() {
    this.metrics.video.initStartTime = performance.now();
    this.metrics.video.currentState = 'loading';
    console.log('📊 [Metrics] Video init started');
  }

  markInitEnd() {
    const now = performance.now();
    this.metrics.video.initEndTime = now;
    const duration = now - this.metrics.video.initStartTime;
    this.metrics.video.currentState = 'ready';
    console.log(`📊 [Metrics] Video init completed: ${duration.toFixed(2)}ms`);
  }

  markFirstFrame() {
    const now = performance.now();
    this.metrics.video.timeToFirstFrame = now - this.metrics.video.initStartTime;
    this.metrics.video.currentState = 'playing';
    console.log(`📊 [Metrics] Time to first frame: ${this.metrics.video.timeToFirstFrame.toFixed(2)}ms`);
    
    this.sendMetric('video_first_frame', {
      duration: this.metrics.video.timeToFirstFrame,
      connection: this.metrics.session.connection.effectiveType,
    });
  }

  markPlaybackStart() {
    this.startTime = Date.now();
    this.lastPlayTime = Date.now();
    this.metrics.video.currentState = 'playing';
    console.log('📊 [Metrics] Playback started');
  }

  markPlaybackPause() {
    if (this.lastPlayTime) {
      const duration = Date.now() - this.lastPlayTime;
      this.metrics.video.playbackDuration += duration;
      this.lastPlayTime = null;
    }
    this.metrics.video.currentState = 'paused';
  }

  markPlaybackResume() {
    this.lastPlayTime = Date.now();
    this.metrics.video.currentState = 'playing';
  }

  markPlaybackEnd() {
    this.markPlaybackPause();
    this.metrics.video.currentState = 'ended';
  }

  // ========== BUFFER TRACKING ==========

  markBufferStart() {
    this.bufferStartTime = Date.now();
    this.metrics.video.totalBufferStalls++;
    this.metrics.video.currentState = 'buffering';
    console.warn(`📊 [Metrics] Buffer stall #${this.metrics.video.totalBufferStalls}`);
  }

  markBufferEnd() {
    if (this.bufferStartTime) {
      const duration = Date.now() - this.bufferStartTime;
      this.metrics.video.bufferDuration += duration;
      this.bufferStartTime = null;
      this.metrics.video.currentState = 'playing';
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
    
    // Add to history with size limit
    this.metrics.quality.switchHistory.push({
      timestamp: Date.now(),
      from: fromLevel?.height || null,
      to: toLevel?.height || null,
      reason,
    });
    
    // Trim history
    if (this.metrics.quality.switchHistory.length > this.metrics.quality.maxHistorySize) {
      this.metrics.quality.switchHistory.shift();
    }
    
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
    this.metrics.session.linkId = toLink;
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
      fatal: error?.fatal || false,
      context,
    };
    
    this.metrics.errors.history.push(errorRecord);
    
    // Trim history
    if (this.metrics.errors.history.length > this.metrics.errors.maxHistorySize) {
      this.metrics.errors.history.shift();
    }
    
    console.error('📊 [Metrics] Error recorded:', errorRecord);
    
    this.sendMetric('player_error', {
      message: errorRecord.message,
      type: errorRecord.type,
      fatal: errorRecord.fatal,
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
    
    // Trim history
    if (this.metrics.network.bandwidthHistory.length > this.metrics.network.maxHistorySize) {
      this.metrics.network.bandwidthHistory.shift();
    }
    
    // Calculate average
    const sum = this.metrics.network.bandwidthHistory.reduce((acc, s) => acc + s.bandwidth, 0);
    this.metrics.network.avgBandwidth = sum / this.metrics.network.bandwidthHistory.length;
  }

  // ========== P2P TRACKING (NEW) ==========

  updateP2PStats(stats) {
    if (!stats) return;
    
    this.metrics.p2p = {
      enabled: stats.enabled || false,
      peers: stats.peers || 0,
      healthyPeers: stats.healthyPeers || 0,
      p2pHits: stats.p2pHits || 0,
      cdnFallbacks: stats.cdnFallbacks || 0,
      bytesFromPeers: parseFloat(stats.bytesFromPeers) || 0,
      bytesShared: parseFloat(stats.bytesShared) || 0,
      offloadRatio: parseFloat(stats.offloadRatio) || 0,
      avgLatency: parseFloat(stats.avgLatency) || 0,
    };
  }

  getP2PStats() {
    return this.metrics.p2p;
  }

  // ========== ANALYTICS INTEGRATION ==========

  async sendMetric(eventName, data = {}) {
    if (!this.metricsEnabled) return;
    
    const payload = {
      event: eventName,
      sessionId: this.metrics.session.id,
      matchId: this.metrics.session.matchId,
      timestamp: Date.now(),
      connection: this.metrics.session.connection.effectiveType,
      ...data,
    };
    
    // Try sendBeacon first
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      try {
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        const sent = navigator.sendBeacon(this.metricsEndpoint, blob);
        
        if (!sent) {
          // Fallback to fetch
          this.sendMetricFetch(payload);
        }
      } catch (e) {
        // sendBeacon failed, try fetch
        this.sendMetricFetch(payload);
      }
    }
    
    // Log in development
    if (process.env.NODE_ENV === 'development') {
      console.log('📊 [Analytics]', eventName, data);
    }
  }

  async sendMetricFetch(payload) {
    try {
      await fetch(this.metricsEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      });
    } catch (e) {
      // Silently fail - metrics are non-critical
      if (e.message?.includes('404')) {
        // Disable metrics if endpoint doesn't exist
        this.metricsEnabled = false;
        console.warn('📊 [Metrics] Endpoint not available, disabling');
      }
    }
  }

  // ========== SESSION SUMMARY ==========

  getSessionSummary() {
    const sessionDuration = Date.now() - this.metrics.session.startTime;
    const playbackRatio = sessionDuration > 0 
      ? this.metrics.video.playbackDuration / sessionDuration 
      : 0;
    const bufferRatio = sessionDuration > 0 
      ? this.metrics.video.bufferDuration / sessionDuration 
      : 0;
    
    // Calculate P2P savings
    const p2pSavings = this.metrics.p2p.bytesFromPeers * 0.1; // $0.10 per MB
    
    return {
      sessionId: this.metrics.session.id,
      matchId: this.metrics.session.matchId,
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
      // P2P stats
      p2pEnabled: this.metrics.p2p.enabled,
      p2pPeers: this.metrics.p2p.peers,
      p2pOffloadRatio: this.metrics.p2p.offloadRatio.toFixed(1) + '%',
      p2pBytesFromPeers: this.metrics.p2p.bytesFromPeers.toFixed(2) + ' MB',
      p2pSavings: '$' + p2pSavings.toFixed(2),
      // Web Vitals
      webVitals: this.metrics.webVitals,
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
      state: this.metrics.video.currentState,
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
      // P2P
      p2pPeers: this.metrics.p2p.peers,
      p2pOffload: this.metrics.p2p.offloadRatio.toFixed(1) + '%',
    };
  }

  // ========== WEB VITALS INTEGRATION ==========

  measureWebVitals() {
    if (typeof window === 'undefined' || typeof PerformanceObserver === 'undefined') return;

    try {
      // Largest Contentful Paint (LCP)
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        this.metrics.webVitals.lcp = lastEntry.renderTime || lastEntry.loadTime;
        console.log('📊 [Web Vitals] LCP:', this.metrics.webVitals.lcp);
      });
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

      // First Input Delay (FID)
      const fidObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length > 0) {
          const entry = entries[0];
          this.metrics.webVitals.fid = entry.processingStart - entry.startTime;
          console.log('📊 [Web Vitals] FID:', this.metrics.webVitals.fid);
        }
      });
      fidObserver.observe({ entryTypes: ['first-input'] });

      // Cumulative Layout Shift (CLS)
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
          }
        }
        this.metrics.webVitals.cls = clsValue;
      });
      clsObserver.observe({ entryTypes: ['layout-shift'] });

      // Time to First Byte (TTFB)
      if (performance.timing) {
        this.metrics.webVitals.ttfb = 
          performance.timing.responseStart - performance.timing.requestStart;
      }

    } catch (e) {
      console.warn('📊 [Web Vitals] Not fully supported:', e.message);
    }
  }

  // ========== EXPORT ==========

  exportMetrics() {
    return {
      ...this.metrics,
      summary: this.getSessionSummary(),
      exportedAt: new Date().toISOString(),
    };
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