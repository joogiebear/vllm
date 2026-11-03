import test from 'node:test';
import assert from 'node:assert/strict';
import { initFeedback, play, setClock } from '../src/idle/feedback.js';

// Swap in a fake navigator (to exercise navigator.vibrate), restoring the
// original afterwards. Returns false when the runtime does not allow it.
function withNavigator(fake, fn) {
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  let ok = false;
  try {
    Object.defineProperty(globalThis, 'navigator', {
      value: fake,
      configurable: true,
    });
    ok = true;
  } catch (err) {
    ok = false;
  }
  try {
    fn();
  } finally {
    if (ok && desc) Object.defineProperty(globalThis, 'navigator', desc);
  }
  return ok;
}

test('initFeedback: safe and idempotent without a window', () => {
  assert.doesNotThrow(() => initFeedback());
  assert.doesNotThrow(() => initFeedback());
});

test('play: safe without AudioContext or navigator', () => {
  initFeedback();
  for (const kind of ['payout', 'buy', 'hire', 'achievement', 'prestige', 'error']) {
    assert.doesNotThrow(() => play(kind));
  }
  assert.equal(play('nope'), false);
});

test('play: a throwing navigator.vibrate is swallowed', () => {
  const ok = withNavigator(
    { vibrate: () => { throw new Error('nope'); } },
    () => {
      assert.doesNotThrow(() => play('buy'));
      assert.doesNotThrow(() => play('achievement'));
      assert.doesNotThrow(() => play('prestige'));
    },
  );
  assert.ok(ok, 'navigator was replaceable, so the swallow was tested');
});

test('vibrate: short patterns per kind, none for payout', () => {
  const calls = [];
  const ok = withNavigator(
    { vibrate: (p) => calls.push(p) },
    () => {
      play('buy');
      play('hire');
      play('achievement');
      play('prestige');
      play('payout');
    },
  );
  assert.ok(ok, 'navigator was replaceable, so the patterns were tested');
  assert.deepEqual(calls, [10, 20, [15, 40, 15], [30, 60, 30]]);
});

test('payout: rate-limited to at most one every 120ms (injected clock)', () => {
  setClock(() => 1e13);
  assert.equal(play('payout'), true);
  setClock(() => 1e13 + 119);
  assert.equal(play('payout'), false);
  setClock(() => 1e13 + 120);
  assert.equal(play('payout'), true);
  setClock(() => 1e13 + 121);
  assert.equal(play('payout'), false);
});

test('payout: the rate limit does not apply to other kinds', () => {
  setClock(() => 2e13);
  assert.equal(play('buy'), true);
  setClock(() => 2e13 + 10);
  assert.equal(play('buy'), true);
  setClock(() => 2e13 + 10);
  assert.equal(play('hire'), true);
});
