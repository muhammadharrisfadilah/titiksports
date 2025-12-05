const assert = require('assert');
const { OfferBackoffManager, SimpleEmitter } = require('../lib/p2p-utils.js');

// OfferBackoffManager tests
(() => {
  const mgr = new OfferBackoffManager({ maxAttempts: 3, cooldownMs: 100 });
  const peer = 'peer-A';
  assert.strictEqual(mgr.canAttempt(peer), true, 'should allow first attempt');
  mgr.recordFailure(peer);
  assert.strictEqual(mgr.getStats(peer).attempts, 1);
  mgr.recordFailure(peer);
  mgr.recordFailure(peer);
  assert.strictEqual(mgr.getStats(peer).attempts, 3);
  // now max reached
  assert.strictEqual(mgr.canAttempt(peer), false, 'should block after max attempts');
  // wait for cooldown
  setTimeout(() => {
    assert.strictEqual(mgr.canAttempt(peer), true, 'should allow after cooldown');
    mgr.recordFailure(peer);
    assert.strictEqual(mgr.getStats(peer).attempts, 1);
    console.log('OfferBackoffManager tests passed');
  }, 150);
})();

// SimpleEmitter tests
(() => {
  const em = new SimpleEmitter();
  let called = false;
  function handler(payload) { called = payload === 'ok'; }
  em.on('test', handler);
  em.emit('test', 'ok');
  assert.strictEqual(called, true, 'emitter should call handler');
  em.off('test', handler);
  called = false;
  em.emit('test', 'ok');
  assert.strictEqual(called, false, 'handler should be removed');
  console.log('SimpleEmitter tests passed');
})();

// Finish
setTimeout(() => console.log('All p2p-utils tests completed'), 200);
