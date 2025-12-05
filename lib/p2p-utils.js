/**
 * Utilities for P2P engine: OfferBackoffManager and simple EventEmitter
 * These are pure JS and testable in Node.
 */

export class OfferBackoffManager {
  constructor({ maxAttempts = 5, cooldownMs = 5 * 60 * 1000 } = {}) {
    this.maxAttempts = maxAttempts;
    this.cooldownMs = cooldownMs;
    this._records = new Map(); // peerId -> { attempts, lastFailureAt }
  }

  canAttempt(peerId) {
    const r = this._records.get(peerId);
    if (!r) return true;
    if (r.attempts < this.maxAttempts) return true;
    // if cooldown passed, allow again and reset
    if (Date.now() - (r.lastFailureAt || 0) > this.cooldownMs) {
      this._records.delete(peerId);
      return true;
    }
    return false;
  }

  recordFailure(peerId) {
    const now = Date.now();
    const r = this._records.get(peerId) || { attempts: 0, lastFailureAt: 0 };
    r.attempts = (r.attempts || 0) + 1;
    r.lastFailureAt = now;
    this._records.set(peerId, r);
    return r.attempts;
  }

  reset(peerId) {
    this._records.delete(peerId);
  }

  getStats(peerId) {
    return this._records.get(peerId) || { attempts: 0, lastFailureAt: 0 };
  }
}

export class SimpleEmitter {
  constructor() {
    this._listeners = new Map();
  }

  on(event, cb) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(cb);
  }

  off(event, cb) {
    if (!this._listeners.has(event)) return;
    this._listeners.get(event).delete(cb);
  }

  emit(event, payload) {
    const set = this._listeners.get(event);
    if (!set) return;
    for (const cb of Array.from(set)) {
      try { cb(payload); } catch (e) { console.warn('emitter handler error', e); }
    }
  }
}

export default {
  OfferBackoffManager,
  SimpleEmitter,
};
