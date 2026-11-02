// Rule tests for src/sim.js. Run with: node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, TICK_SECONDS, CONFIG } from '../src/sim.js';

const UPGRADE_IDS = ['slots', 'cooling', 'throughput', 'patience', 'queue', 'reputation', 'boost'];

// --- helpers -----------------------------------------------------------------

function stepN(state, n, makeActions) {
  for (let i = 0; i < n; i++) {
    const a = makeActions ? makeActions(state, i) : [];
    step(state, Array.isArray(a) ? a : [a]);
  }
}

function near(actual, expected, eps = 1e-6) {
  assert.ok(
    Math.abs(actual - expected) < eps,
    `expected ${actual} to be within ${eps} of ${expected}`
  );
}

// A request the tests can inject directly into the queue.
function makeReq(id, prefix, tokens, opts = {}) {
  return {
    id,
    prefix,
    tokens,
    done: opts.done ?? 0,
    patience: opts.patience ?? 14,
    maxPatience: opts.maxPatience ?? 14,
    vip: opts.vip ?? false,
  };
}

// Collect an event type across a run of ticks (events are cleared each step).
function sawEvent(state, n, type) {
  for (let i = 0; i < n; i++) {
    step(state, []);
    if (state.events.some((e) => e.type === type)) return true;
  }
  return false;
}

// --- tests -------------------------------------------------------------------

test('createGame returns a JSON-serializable initial state', () => {
  const s = createGame(1234);
  const copy = JSON.parse(JSON.stringify(s));
  assert.deepEqual(s, copy);
  assert.equal(s.phase, 'playing');
  assert.equal(s.level, 1);
  assert.equal(s.reputation, 10);
  assert.equal(s.queueCap, 8);
  assert.equal(s.score, 0);
  assert.equal(s.multiplier, 1);
  assert.equal(s.gpus.length, 2);
  assert.equal(s.gpus[0].slots.length, 4);
  assert.equal(s.gpus[0].active, null);
  assert.equal(s.gpus[0].heat, 0);
  assert.equal(s.offer, null);
  assert.deepEqual(s.events, []);
});

test('CONFIG carries the design numbers', () => {
  assert.equal(CONFIG.levelDuration, 45);
  assert.equal(CONFIG.queueCap, 8);
  assert.equal(CONFIG.baseSlots, 4);
  assert.equal(CONFIG.maxSlots, 6);
  assert.equal(CONFIG.baseThroughput, 60);
  assert.equal(CONFIG.throughputPerSlot, 0.35);
  assert.equal(CONFIG.cacheSpeed, 1.5);
  assert.equal(CONFIG.cacheStall, 1.0);
  assert.equal(CONFIG.heatGainPerSlot, 5);
  assert.equal(CONFIG.heatLoss, 9);
  assert.equal(CONFIG.throttleEnter, 100);
  assert.equal(CONFIG.throttleRelease, 60);
  assert.equal(CONFIG.throttleSpeed, 0.25);
  assert.equal(CONFIG.boostDuration, 4);
  assert.equal(CONFIG.boostHeat, 25);
  assert.equal(CONFIG.boostCooldown, 12);
  assert.equal(CONFIG.boostCooldownMin, 4);
  assert.equal(CONFIG.startReputation, 10);
  assert.equal(CONFIG.maxReputation, 10);
  assert.equal(CONFIG.maxPatience, 11);
  assert.equal(CONFIG.vipPatience, 6);
  assert.equal(CONFIG.vipChance, 0.1);
  assert.equal(CONFIG.tokenMin, 40);
  assert.equal(CONFIG.tokenMax, 160);
});

test('determinism: same seed and actions give identical state', () => {
  const run = (seed) => {
    const s = createGame(seed);
    for (let i = 0; i < 600; i++) {
      const acts = [];
      if (s.phase === 'playing') {
        if (s.queue.length > 0) {
          const free = s.gpus[0].slots.findIndex((x) => x === null);
          if (free >= 0) {
            acts.push({ type: 'assign', requestId: s.queue[0].id, gpu: 0, slot: free });
          }
        }
        if (i % 150 === 0) acts.push({ type: 'boost', gpu: 0 });
      } else if (s.phase === 'upgrade') {
        acts.push({ type: 'upgrade', choice: 0 });
      }
      step(s, acts);
    }
    return s;
  };
  const a = run(42);
  const b = run(42);
  assert.deepEqual(a, b);
  // A different seed must (with overwhelming probability) diverge.
  const c = run(43);
  assert.notDeepEqual(c, a);
});

test('determinism survives a JSON round-trip mid-game', () => {
  const a = createGame(77);
  stepN(a, 300, (s) => {
    const acts = [];
    if (s.phase === 'playing' && s.queue.length > 0) {
      const free = s.gpus[1].slots.findIndex((x) => x === null);
      if (free >= 0) acts.push({ type: 'assign', requestId: s.queue[0].id, gpu: 1, slot: free });
    }
    if (s.phase === 'upgrade') acts.push({ type: 'upgrade', choice: 1 });
    return acts;
  });
  const b = JSON.parse(JSON.stringify(a));
  stepN(a, 300, (s) => {
    const acts = [];
    if (s.phase === 'playing' && s.queue.length > 0) {
      const free = s.gpus[1].slots.findIndex((x) => x === null);
      if (free >= 0) acts.push({ type: 'assign', requestId: s.queue[0].id, gpu: 1, slot: free });
    }
    if (s.phase === 'upgrade') acts.push({ type: 'upgrade', choice: 1 });
    return acts;
  });
  stepN(b, 300, (s) => {
    const acts = [];
    if (s.phase === 'playing' && s.queue.length > 0) {
      const free = s.gpus[1].slots.findIndex((x) => x === null);
      if (free >= 0) acts.push({ type: 'assign', requestId: s.queue[0].id, gpu: 1, slot: free });
    }
    if (s.phase === 'upgrade') acts.push({ type: 'upgrade', choice: 1 });
    return acts;
  });
  assert.deepEqual(a, b);
});

test('cache miss: 1s stall, then base speed; active prefix is set', () => {
  const s = createGame(1);
  s.gpus[0].active = 'B';
  s.queue.push(makeReq(1, 'A', 1000));
  step(s, [{ type: 'assign', requestId: 1, gpu: 0, slot: 0 }]);
  assert.equal(s.gpus[0].active, 'A');
  assert.equal(s.queue.length, 0);
  assert.equal(s.gpus[0].slots[0].cacheHit, false);
  stepN(s, 29); // 30 ticks total
  const req = s.gpus[0].slots[0];
  assert.ok(req.stall >= 0 && req.stall <= TICK_SECONDS + 1e-9, `stall=${req.stall}`);
  assert.ok(req.done < 4, `done=${req.done}`); // at most one tick of progress
  stepN(s, 10); // 40 ticks total
  // ~10 ticks of progress at 60 t/s (one tick of slack for FP boundary)
  assert.ok(req.done >= 16 && req.done <= 24, `done=${req.done}`);
  // one occupied slot: heat 5 - 9 < 0, stays at 0
  assert.equal(s.gpus[0].heat, 0);
});

test('cache hit: 1.5x speed with no stall, active prefix unchanged', () => {
  const s = createGame(2);
  s.gpus[0].active = 'A';
  s.queue.push(makeReq(1, 'A', 1000));
  step(s, [{ type: 'assign', requestId: 1, gpu: 0, slot: 0 }]);
  const req = s.gpus[0].slots[0];
  assert.equal(req.cacheHit, true);
  assert.equal(req.stall, 0);
  stepN(s, 29); // 30 ticks total
  near(req.done, 90, 0.5); // 90 t/s -> 90 in 30 ticks
  assert.equal(s.gpus[0].active, 'A');
});

test('throughput is shared equally among occupied slots', () => {
  const s = createGame(3);
  s.queue.push(makeReq(1, 'A', 100000), makeReq(2, 'B', 100000));
  step(s, [
    { type: 'assign', requestId: 1, gpu: 0, slot: 0 },
    { type: 'assign', requestId: 2, gpu: 0, slot: 1 },
  ]);
  // clear the miss stalls so progress is deterministic
  s.gpus[0].slots[0].stall = 0;
  s.gpus[0].slots[1].stall = 0;
  stepN(s, 30); // 30 ticks (the assign tick was spent on the stall)
  // 60 * 1.35 / 2 = 40.5 t/s each
  const a = s.gpus[0].slots[0].done;
  const b = s.gpus[0].slots[1].done;
  assert.ok(Math.abs(a - b) < 1e-9, `shared equally: ${a} vs ${b}`);
  near(a, 40.5, 0.5);
});

test('heat and throttle hysteresis', () => {
  const s = createGame(4);
  s.gpus[0].active = 'A';
  s.queue.push(makeReq(1, 'A', 100000), makeReq(2, 'A', 100000), makeReq(3, 'A', 100000));
  step(s, [
    { type: 'assign', requestId: 1, gpu: 0, slot: 0 },
    { type: 'assign', requestId: 2, gpu: 0, slot: 1 },
    { type: 'assign', requestId: 3, gpu: 0, slot: 2 },
  ]);
  // 3 occupied: +6/s, 100/6 = 16.67s = 500 ticks (slack for FP)
  stepN(s, 504);
  assert.equal(s.gpus[0].throttled, true);
  assert.equal(s.gpus[0].heat, 100);
  // throttle event fired
  // evict everything: heat decays at 9/s with 0 occupied
  s.queue = []; // make room (arrivals during the heat-up filled it)
  step(s, [
    { type: 'evict', gpu: 0, slot: 0 },
    { type: 'evict', gpu: 0, slot: 1 },
    { type: 'evict', gpu: 0, slot: 2 },
  ]);
  assert.equal(s.gpus[0].slots[0], null);
  assert.equal(s.queue.length, 3);
  stepN(s, 99); // 100 ticks after evict: 100 - 30 = 70, still between 60 and 100
  assert.equal(s.gpus[0].throttled, true, 'hysteresis: stays throttled while 60 < heat < 100');
  near(s.gpus[0].heat, 70, 1.5);
  stepN(s, 40); // 140 ticks: 100 - 42 = 58 < 60
  assert.equal(s.gpus[0].throttled, false, 'unthrottles only at heat 60');
  assert.ok(s.gpus[0].heat < 60);
});

test('boost: doubles speed, adds heat, 4s duration, 12s cooldown', () => {
  const s = createGame(5);
  s.gpus[0].active = 'A';
  s.queue.push(makeReq(1, 'A', 100000));
  step(s, [{ type: 'assign', requestId: 1, gpu: 0, slot: 0 }]);
  stepN(s, 29); // 30 ticks: 90 t/s -> 90
  near(s.gpus[0].slots[0].done, 90, 0.5);

  step(s, [{ type: 'boost', gpu: 0 }]);
  const g = s.gpus[0];
  assert.equal(g.boostActive, true);
  near(g.boostTimer, 4 - TICK_SECONDS, 1e-9); // set to 4, then one tick of decay
  near(g.boostCooldown, 12 - TICK_SECONDS, 1e-9);
  assert.ok(g.heat > 24 && g.heat < 25); // 25 + one tick of net cooling
  assert.ok(s.events.some((e) => e.type === 'boost' && e.gpu === 0));

  // re-boost while on cooldown is ignored (timer not reset)
  step(s, [{ type: 'boost', gpu: 0 }]);
  assert.ok(g.boostTimer < 4 - 1.5 * TICK_SECONDS, `timer=${g.boostTimer}`);

  // all 120 ticks boosted (4 per tick); the timer hits 0 on tick 121
  stepN(s, 118);
  near(s.gpus[0].slots[0].done, 810, 2);
  assert.equal(s.gpus[0].boostActive, true, 'boost lasts 4s = 120 ticks');
  step(s, []);
  assert.equal(s.gpus[0].boostActive, false, 'boost expires after 4s');

  // cooldown: 364 ticks after the boost tick -> 0
  stepN(s, 242);
  assert.ok(s.gpus[0].boostCooldown <= 0);
  step(s, [{ type: 'boost', gpu: 0 }]);
  assert.equal(s.gpus[0].boostActive, true);
  near(s.gpus[0].boostTimer, 4 - TICK_SECONDS, 1e-9);

  // boost while throttled is ignored: heat up through the gain path
  // (3 occupied slots: +5*3 - 9 = +6/s)
  s.gpus[0].slots[1] = makeReq(2, 'A', 100000);
  s.gpus[0].slots[2] = makeReq(3, 'A', 100000);
  s.gpus[0].heat = 99.9;
  for (let i = 0; i < 5; i++) step(s, []);
  assert.equal(s.gpus[0].throttled, true);
  const t0 = s.gpus[0].boostTimer;
  step(s, [{ type: 'boost', gpu: 0 }]);
  near(s.gpus[0].boostTimer, t0 - TICK_SECONDS, 1e-9);
});

test('timeout: queued request leaves at 0 patience, costs 1 reputation, resets multiplier', () => {
  const s = createGame(6);
  s.multiplier = 2;
  s.queue.push(makeReq(1, 'A', 100, { patience: 0.5, maxPatience: 0.5 }));
  assert.ok(sawEvent(s, 16, 'timeout'));
  assert.equal(s.queue.length, 0);
  assert.equal(s.reputation, 9);
  assert.equal(s.multiplier, 1);
});

test('VIP timeout costs 2 reputation', () => {
  const s = createGame(7);
  s.queue.push(makeReq(2, 'B', 100, { patience: 0.5, maxPatience: 0.5, vip: true }));
  stepN(s, 16);
  assert.equal(s.queue.length, 0);
  assert.equal(s.reputation, 8);
});

test('full queue: arrival is dropped, costs 1 reputation, resets multiplier', () => {
  const s = createGame(8);
  for (let i = 0; i < 8; i++) s.queue.push(makeReq(10 + i, 'A', 100));
  s.multiplier = 2;
  s.arrivalTimer = 0;
  step(s, []);
  assert.equal(s.queue.length, 8);
  assert.equal(s.reputation, 9);
  assert.equal(s.multiplier, 1);
  assert.ok(s.events.some((e) => e.type === 'dropped'));
});

test('multiplier: +0.1 per finish, caps at 3.0', () => {
  const s = createGame(9);
  s.gpus[0].active = 'A';
  s.queue.push(makeReq(1, 'A', 40));
  step(s, [{ type: 'assign', requestId: 1, gpu: 0, slot: 0 }]);
  stepN(s, 24); // 25 ticks; 40 tokens at 90 t/s finishes in ~14
  assert.equal(s.served, 1);
  near(s.score, 40, 1e-9); // 40 * 1
  near(s.multiplier, 1.1, 1e-9);
  assert.equal(s.gpus[0].slots[0], null);

  s.queue.push(makeReq(2, 'A', 40));
  step(s, [{ type: 'assign', requestId: 2, gpu: 0, slot: 0 }]);
  stepN(s, 24);
  near(s.score, 40 + 44, 1e-9); // 40 * 1.1
  near(s.multiplier, 1.2, 1e-9);

  s.queue.push(makeReq(3, 'A', 40));
  step(s, [{ type: 'assign', requestId: 3, gpu: 0, slot: 0 }]);
  stepN(s, 24);
  near(s.score, 40 + 44 + 48, 1e-9); // 40 * 1.2
  near(s.multiplier, 1.3, 1e-9);

  s.multiplier = 3.0;
  s.queue.push(makeReq(4, 'A', 40));
  step(s, [{ type: 'assign', requestId: 4, gpu: 0, slot: 0 }]);
  stepN(s, 24);
  near(s.multiplier, 3.0, 1e-9); // capped
  near(s.score, 40 + 44 + 48 + 120, 1e-9); // 40 * 3.0
});

test('multiplier reset by timeout and by dropped arrival', () => {
  const s = createGame(27);
  s.multiplier = 2.5;
  s.queue.push(makeReq(1, 'A', 100, { patience: 0.4, maxPatience: 0.4 }));
  stepN(s, 14);
  assert.equal(s.multiplier, 1);

  const s2 = createGame(28);
  s2.multiplier = 2.5;
  for (let i = 0; i < 8; i++) s2.queue.push(makeReq(10 + i, 'A', 100));
  s2.arrivalTimer = 0;
  step(s2, []);
  assert.equal(s2.multiplier, 1);
});

test('VIP finish: double points and +1 reputation', () => {
  const s = createGame(10);
  s.gpus[0].active = 'A';
  s.reputation = 9;
  s.queue.push(makeReq(1, 'A', 50, { vip: true }));
  step(s, [{ type: 'assign', requestId: 1, gpu: 0, slot: 0 }]);
  let points = null;
  for (let i = 0; i < 25; i++) {
    step(s, []);
    const ev = s.events.find((e) => e.type === 'served');
    if (ev) points = ev.points;
  }
  assert.equal(s.served, 1);
  near(s.score, 100, 1e-9); // 50 * 2 * 1
  near(points, 100, 1e-9);
  assert.equal(s.reputation, 10); // 9 + 1, capped at 10
});

test('evict: returns request to back of queue with progress kept', () => {
  const s = createGame(22);
  s.gpus[0].active = 'A';
  s.queue.push(makeReq(1, 'A', 1000));
  step(s, [{ type: 'assign', requestId: 1, gpu: 0, slot: 0 }]);
  stepN(s, 29); // 30 ticks: 90 t/s -> 90
  s.queue.push(makeReq(2, 'A', 100));
  step(s, [{ type: 'evict', gpu: 0, slot: 0 }]);
  assert.equal(s.gpus[0].slots[0], null);
  assert.equal(s.queue.length, 2);
  const r = s.queue[1]; // back of the queue
  assert.equal(r.id, 1);
  near(r.done, 90, 0.5); // progress kept
  // re-assign: active prefix still matches, so cache hit again, no stall
  step(s, [{ type: 'assign', requestId: 1, gpu: 0, slot: 0 }]);
  assert.equal(s.gpus[0].slots[0].cacheHit, true);
  assert.equal(s.gpus[0].slots[0].stall, 0);
});

test('invalid actions are ignored and never throw', () => {
  const s = createGame(11);
  s.gpus[0].active = 'A';
  s.queue.push(makeReq(1, 'A', 100));
  step(s, [
    null,
    undefined,
    {},
    { type: 'nonsense' },
    { type: 'assign', requestId: 999, gpu: 0, slot: 0 },
    { type: 'assign', requestId: 1, gpu: 5, slot: 0 },
    { type: 'assign', requestId: 1, gpu: 'x', slot: 0 },
    { type: 'assign', requestId: 1, gpu: 0, slot: 99 },
    { type: 'assign', requestId: 1, gpu: 0, slot: -1 },
    { type: 'assign', requestId: '1', gpu: 0, slot: 0 },
    { type: 'evict', gpu: 0, slot: 0 },
    { type: 'evict', gpu: 2, slot: 0 },
    { type: 'evict', gpu: 0, slot: -1 },
    { type: 'boost', gpu: 3 },
    { type: 'boost', gpu: 'nope' },
    { type: 'upgrade', choice: 5 },
    { type: 'upgrade', choice: -1 },
    { type: 'upgrade', choice: '0' },
  ]);
  assert.equal(s.phase, 'playing');
  assert.equal(s.queue.length, 1);
  assert.equal(s.gpus[0].slots[0], null);
  assert.equal(s.gpus[0].boostActive, false);
  assert.equal(s.offer, null);
});

test('actions are validated against game state', () => {
  const s = createGame(30);
  s.gpus[0].active = 'A';
  s.queue.push(makeReq(1, 'A', 100), makeReq(2, 'A', 100));
  step(s, [{ type: 'assign', requestId: 1, gpu: 0, slot: 0 }]);
  const first = s.gpus[0].slots[0];
  // assign onto an occupied slot is ignored
  step(s, [{ type: 'assign', requestId: 2, gpu: 0, slot: 0 }]);
  assert.equal(s.gpus[0].slots[0], first);
  assert.ok(s.queue.some((r) => r.id === 2));
  // evict with a full queue is ignored
  for (let i = 0; i < 8; i++) s.queue.push(makeReq(20 + i, 'A', 100));
  step(s, [{ type: 'evict', gpu: 0, slot: 0 }]);
  assert.equal(s.gpus[0].slots[0], first);
  // boost while on cooldown is ignored
  step(s, [{ type: 'boost', gpu: 0 }]);
  assert.equal(s.gpus[0].boostActive, true);
  const t0 = s.gpus[0].boostTimer;
  step(s, [{ type: 'boost', gpu: 0 }]);
  near(s.gpus[0].boostTimer, t0 - TICK_SECONDS, 1e-9);
  // upgrade outside the upgrade phase is ignored
  step(s, [{ type: 'upgrade', choice: 0 }]);
  assert.equal(s.phase, 'playing');
  assert.equal(s.offer, null);
  assert.equal(s.level, 1);
});

test('level timer counts down and ends in upgrade phase with 3 distinct offers', () => {
  const s = createGame(12);
  s.arrivalTimer = 1e9; // keep the test deterministic: no arrivals
  stepN(s, 30);
  near(s.levelTime, 44, 0.01);
  s.levelTime = 0.001;
  step(s, []);
  assert.equal(s.phase, 'upgrade');
  assert.ok(Array.isArray(s.offer));
  assert.equal(s.offer.length, 3);
  assert.equal(new Set(s.offer).size, 3);
  for (const id of s.offer) assert.ok(UPGRADE_IDS.includes(id));
  assert.ok(s.events.some((e) => e.type === 'levelEnd'));

  // ticks in the upgrade phase change nothing
  const snap = JSON.parse(JSON.stringify(s));
  step(s, []);
  assert.equal(s.phase, 'upgrade');
  assert.equal(s.level, snap.level);
  assert.equal(s.levelTime, snap.levelTime);
  assert.deepEqual(s.queue, snap.queue);
  assert.deepEqual(s.gpus, snap.gpus);

  // non-upgrade actions are ignored in the upgrade phase
  s.queue.push(makeReq(1, 'A', 100));
  step(s, [{ type: 'assign', requestId: 1, gpu: 0, slot: 0 }, { type: 'boost', gpu: 0 }]);
  assert.equal(s.queue.length, 1);
  assert.equal(s.gpus[0].slots[0], null);
  assert.equal(s.gpus[0].boostActive, false);
});

test('upgrade: applies effect, advances level, resumes play', () => {
  const s = createGame(13);
  s.levelTime = 0.001;
  step(s, []);
  assert.equal(s.phase, 'upgrade');
  s.offer = ['queue', 'slots', 'reputation'];
  s.reputation = 5;
  step(s, [{ type: 'upgrade', choice: 2 }]);
  assert.equal(s.phase, 'playing');
  assert.equal(s.level, 2);
  near(s.levelTime, 45 - TICK_SECONDS, 1e-9);
  assert.equal(s.reputation, 8); // 5 + 3
  assert.equal(s.offer, null);
  assert.ok(s.events.some((e) => e.type === 'upgrade' && e.choice === 2));

  s.levelTime = 0.001;
  step(s, []);
  s.offer = ['queue', 'slots', 'reputation'];
  step(s, [{ type: 'upgrade', choice: 0 }]);
  assert.equal(s.level, 3);
  assert.equal(s.queueCap, 10);
});

test('slots upgrade: +1 slot per GPU, capped at 6', () => {
  const s = createGame(14);
  s.levelTime = 0.001;
  step(s, []);
  s.offer = ['slots', 'slots', 'slots'];
  step(s, [{ type: 'upgrade', choice: 0 }]);
  assert.equal(s.gpus[0].slots.length, 5);
  assert.equal(s.gpus[1].slots.length, 5);
  s.levelTime = 0.001;
  step(s, []);
  s.offer = ['slots', 'cooling', 'boost'];
  step(s, [{ type: 'upgrade', choice: 0 }]);
  assert.equal(s.gpus[0].slots.length, 6);
  s.levelTime = 0.001;
  step(s, []);
  s.offer = ['slots', 'cooling', 'boost'];
  step(s, [{ type: 'upgrade', choice: 0 }]);
  assert.equal(s.gpus[0].slots.length, 6, 'slot count capped at 6');
});

test('boost upgrade: cooldown -3s per level, minimum 4s', () => {
  const s = createGame(15);
  for (let i = 0; i < 3; i++) {
    s.levelTime = 0.001;
    step(s, []);
    s.offer = ['boost', 'boost', 'boost'];
    step(s, [{ type: 'upgrade', choice: 0 }]);
    s.gpus[0].boostCooldown = 0;
    step(s, [{ type: 'boost', gpu: 0 }]);
  }
  near(s.gpus[0].boostCooldown, 4 - TICK_SECONDS, 1e-9); // 12 - 9 = 3 -> min 4
});

test('cooling upgrade: +3 heat loss per second per level', () => {
  const s = createGame(16);
  s.gpus[0].active = 'A';
  s.queue.push(makeReq(1, 'A', 100000));
  step(s, [{ type: 'assign', requestId: 1, gpu: 0, slot: 0 }]);
  s.gpus[0].heat = 50;
  s.levelTime = 0.001;
  step(s, []);
  s.offer = ['cooling', 'cooling', 'cooling'];
  step(s, [{ type: 'upgrade', choice: 0 }]);
  stepN(s, 29); // 30 ticks
  // 1 occupied: 5 - (9 + 3) = -7/s -> 50 - 7 = 43
  near(s.gpus[0].heat, 43, 0.5);
});

test('throughput upgrade: base 60 becomes 15 higher per level', () => {
  const s = createGame(17);
  s.gpus[0].active = 'A';
  s.queue.push(makeReq(1, 'A', 100000));
  step(s, [{ type: 'assign', requestId: 1, gpu: 0, slot: 0 }]);
  s.levelTime = 0.001;
  step(s, []);
  s.offer = ['throughput', 'throughput', 'throughput'];
  step(s, [{ type: 'upgrade', choice: 0 }]);
  stepN(s, 29); // 30 ticks
  // pre-upgrade tick at 90 t/s (3.0) + 30 ticks at 112.5 t/s
  near(s.gpus[0].slots[0].done, 115.5, 1);
});

test('patience upgrade: new requests get +3s maxPatience', () => {
  const s = createGame(18);
  s.levelTime = 0.001;
  step(s, []);
  s.offer = ['patience', 'patience', 'patience'];
  step(s, [{ type: 'upgrade', choice: 0 }]);
  s.arrivalTimer = 0;
  step(s, []);
  assert.equal(s.queue.length, 1);
  const r = s.queue[0];
  assert.equal(r.maxPatience, (r.vip ? 6 : 11) + 3);
});

test('arrivals: first arrival after one interval, tokens 40-160', () => {
  const s = createGame(26);
  let arrived = null;
  let lastId = 0;
  for (let i = 1; i <= 200; i++) {
    step(s, []);
    for (const r of s.queue) {
      if (r.id > lastId) {
        if (arrived === null) arrived = i;
        lastId = r.id;
        // arrival happens before the patience decay in the same tick
        near(r.patience, r.maxPatience - TICK_SECONDS, 1e-9);
        assert.equal(r.done, 0);
      }
      assert.ok(r.tokens >= 40 && r.tokens <= 160, `tokens=${r.tokens}`);
    }
  }
  // 2.6s * 30 = 78 ticks (slack for FP)
  assert.ok(arrived >= 78 && arrived <= 80, `first arrival at tick ${arrived}`);
  assert.ok(lastId >= 1);
});

test('prefix pool grows with level', () => {
  const check = (level, seed) => {
    const s = createGame(seed);
    s.level = level;
    s.arrivalTimer = 0;
    const seen = new Set();
    for (let i = 0; i < 20; i++) {
      step(s, []);
      for (const r of s.queue) seen.add(r.prefix);
    }
    return seen;
  };
  for (const p of check(1, 23)) assert.ok(p === 'A' || p === 'B', `prefix=${p}`);
  for (const p of check(3, 24)) assert.ok(['A', 'B', 'C', 'D'].includes(p), `prefix=${p}`);
});

test('events are cleared at the start of each step', () => {
  const s = createGame(21);
  s.queue.push(makeReq(1, 'A', 100, { patience: 0.4, maxPatience: 0.4 }));
  stepN(s, 16); // timeout happens well before tick 16
  assert.ok(!s.events.some((e) => e.type === 'timeout'));
});

test('game over: reputation 0 ends the game and the sim stops', () => {
  const s = createGame(19);
  s.reputation = 1;
  s.queue.push(makeReq(1, 'A', 100, { patience: 0.5, maxPatience: 0.5, vip: true }));
  stepN(s, 16);
  assert.equal(s.reputation, 0);
  assert.equal(s.phase, 'over');
  const snap = JSON.parse(JSON.stringify(s));
  stepN(s, 100);
  assert.equal(s.phase, 'over');
  assert.equal(s.reputation, 0);
  assert.equal(s.score, snap.score);
  assert.equal(s.served, snap.served);
  assert.equal(s.nextId, snap.nextId);
  assert.deepEqual(s.queue, snap.queue);
  assert.deepEqual(s.gpus, snap.gpus);
  // actions are ignored after game over
  s.queue.push(makeReq(2, 'A', 100));
  step(s, [{ type: 'assign', requestId: 2, gpu: 0, slot: 0 }, { type: 'boost', gpu: 0 }]);
  assert.equal(s.gpus[0].slots[0], null);
  assert.equal(s.gpus[0].boostActive, false);
});

test('game over via dropped arrival', () => {
  const s = createGame(20);
  s.reputation = 1;
  for (let i = 0; i < 8; i++) s.queue.push(makeReq(10 + i, 'A', 100));
  s.arrivalTimer = 0;
  step(s, []);
  assert.equal(s.reputation, 0);
  assert.equal(s.phase, 'over');
});

test('game over during the patience loop: GPUs do not advance that tick', () => {
  const s = createGame(41);
  s.reputation = 1;
  s.gpus[0].active = 'A';
  s.queue.push(makeReq(1, 'A', 100000));
  step(s, [{ type: 'assign', requestId: 1, gpu: 0, slot: 0 }]);
  assert.equal(s.gpus[0].slots[0].cacheHit, true); // no stall: it will progress
  const doneBefore = s.gpus[0].slots[0].done;
  s.gpus[0].heat = 50;
  s.gpus[0].boostActive = true;
  s.gpus[0].boostTimer = 2;
  s.gpus[0].boostCooldown = 5;
  // VIP with exactly one tick of patience: it times out this tick, costs 2
  // reputation -> 0 -> game over, before the GPU loop would run.
  s.queue.push(makeReq(2, 'B', 100, { patience: TICK_SECONDS, maxPatience: TICK_SECONDS, vip: true }));
  step(s, []);
  assert.equal(s.phase, 'over');
  assert.equal(s.reputation, 0);
  assert.ok(s.events.some((e) => e.type === 'gameOver'));
  // GPU state must be frozen for the game-over tick
  assert.equal(s.gpus[0].slots[0].done, doneBefore, 'no progress on the game-over tick');
  assert.equal(s.gpus[0].heat, 50, 'heat untouched on the game-over tick');
  assert.equal(s.gpus[0].boostTimer, 2, 'boost timer untouched on the game-over tick');
  assert.equal(s.gpus[0].boostCooldown, 5, 'boost cooldown untouched on the game-over tick');
});
