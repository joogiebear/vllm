// Rule tests for src/idle/core.js. Run with: node --test test/idle.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createState,
  tick,
  click,
  buy,
  buyUpgrade,
  buyAllUpgrades,
  setOverclock,
  prestige,
  buyWeightUpgrade,
  applyOffline,
  applyRush,
  tokensPerSecond,
  cost,
  weightsAvailable,
} from '../src/idle/core.js';
import { GENERATORS, COST_GROWTH, UPGRADES, WEIGHT_UPGRADES } from '../src/idle/data.js';

// --- helpers -------------------------------------------------------------------

function clone(state) {
  return JSON.parse(JSON.stringify(state));
}

function gen(id) {
  return GENERATORS.find((g) => g.id === id);
}

function upgrade(id) {
  return UPGRADES.find((u) => u.id === id);
}

// Cost of the next n, computed straight from the table (independent of core.js).
function expectedCost(id, owned, n) {
  const g = gen(id);
  let total = 0;
  for (let i = 0; i < n; i++) {
    total += Math.ceil(g.baseCost * Math.pow(COST_GROWTH, owned + i));
  }
  return total;
}

// How many of the next generators fit in `tokens`, from the table.
function maxAffordable(id, tokens, owned) {
  let bought = 0;
  let total = 0;
  for (;;) {
    const next = Math.ceil(gen(id).baseCost * Math.pow(COST_GROWTH, owned + bought));
    if (total + next > tokens) break;
    total += next;
    bought++;
  }
  return { bought, total };
}

function near(actual, expected, eps = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= eps,
    `expected ${actual} to be within ${eps} of ${expected}`
  );
}

// --- costs and buy max -----------------------------------------------------------

test('cost: baseCost * 1.15^owned, rounded up, summed over the next n', () => {
  const s = createState();
  assert.equal(cost(s, 'pi', 1), 15); // base cost from the table
  assert.equal(cost(s, 'gamer', 1), 220);
  assert.equal(cost(s, 'swarm', 1), 510000000);
  s.generators.pi = 10;
  assert.equal(cost(s, 'pi', 1), Math.ceil(15 * Math.pow(COST_GROWTH, 10)));
  assert.equal(cost(s, 'pi', 10), expectedCost('pi', 10, 10));
  s.generators.gamer = 25;
  assert.equal(cost(s, 'gamer', 3), expectedCost('gamer', 25, 3));
});

test('buy: count buys at most n (as many as affordable), max buys everything affordable', () => {
  const s = createState();
  s.tokens = 100;
  assert.equal(buy(s, 'pi', 10), 4); // 15 + 18 + 20 + 23 = 76; the 5th (27) does not fit
  assert.equal(s.tokens, 100 - 76);
  assert.equal(s.generators.pi, 4);

  const s2 = createState();
  s2.tokens = 1000;
  const { bought, total } = maxAffordable('pi', 1000, 0);
  assert.equal(buy(s2, 'pi', 'max'), bought);
  assert.equal(s2.tokens, 1000 - total);
  assert.equal(s2.generators.pi, bought);
  assert.ok(s2.tokens < Math.ceil(15 * Math.pow(COST_GROWTH, bought))); // next one does not fit

  const s3 = createState();
  s3.tokens = 50;
  assert.equal(buy(s3, 'pi', 3), 2); // 15 + 18 = 33; the 3rd (20) does not fit
  assert.equal(s3.tokens, 17);

  const s4 = createState();
  s4.tokens = 14;
  assert.equal(buy(s4, 'pi', 5), 0);
  assert.equal(s4.tokens, 14);
  assert.equal(s4.generators.pi, 0);
});

// --- generator doubling thresholds -------------------------------------------------

test('generator output doubles at 25, 50, 100, 200 and 400 owned', () => {
  const s = createState();
  const cases = [
    [0, 1], [24, 1], [25, 2], [49, 2], [50, 4], [99, 4],
    [100, 8], [199, 8], [200, 16], [399, 16], [400, 32],
  ];
  for (const [owned, mult] of cases) {
    s.generators.pi = owned;
    assert.equal(tokensPerSecond(s), owned * 1 * mult);
  }
  s.generators.pi = 0;
  s.generators.gamer = 50;
  assert.equal(tokensPerSecond(s), 50 * 8 * 4);
});

// --- production formula ----------------------------------------------------------

test('tokensPerSecond = sum * (1 + cacheRate) * (1 + 0.1 * weightsEarnedThisCycle) * upgradeMultipliers * heatFactor', () => {
  const s = createState();
  s.generators.pi = 10; // 10 tps
  s.generators.gamer = 1; // 8 tps
  s.upgrades.push('quant'); // x1.5
  s.upgrades.push('prefix1'); // cacheRate +0.25
  s.weightsEarnedThisCycle = 10; // 1 + 0.1 * 10 = 2.0
  const base = 18 * 1.25 * 2.0 * 1.5;
  assert.equal(tokensPerSecond(s), base);
  s.overclock = true;
  assert.equal(tokensPerSecond(s), base * 2);
  s.overclock = false;
  s.throttled = true;
  assert.equal(tokensPerSecond(s), base * 0.5);
});

// --- click -------------------------------------------------------------------------

test('click earns (1 + clickFlat) + clickShare * tokensPerSecond and counts in lifetime', () => {
  const s = createState();
  assert.equal(click(s), 1);
  assert.equal(s.tokens, 1);
  assert.equal(s.lifetime, 1);
  s.upgrades.push('macro'); // clickFlat +4
  s.upgrades.push('api'); // clickShare +0.02
  s.generators.pi = 10; // 10 tps
  assert.equal(click(s), 1 + 4 + 0.02 * 10);
  assert.equal(s.tokens, 1 + 5.2);
  assert.equal(s.lifetime, 6.2);
});

// --- heat crossing 100 and 40 inside a single long tick ------------------------------

test('tick splits at heat 100 and 40 within one long step', () => {
  const s = createState();
  s.generators.pi = 10; // base 10 tps
  s.overclock = true;
  s.heat = 0;
  tick(s, 100);
  // 50s rising to 100 (x2), 12s falling 100 -> 40 (x0.5), 38s falling 40 -> 0 (x1)
  assert.equal(s.heat, 0);
  assert.equal(s.throttled, false);
  assert.equal(s.overclock, false); // turned off at 100
  assert.equal(s.tokens, 10 * (50 * 2 + 12 * 0.5 + 38 * 1));

  const s2 = createState();
  s2.generators.pi = 10;
  s2.overclock = true;
  s2.heat = 99;
  tick(s2, 100);
  // 0.5s rising to 100 (x2), 12s falling (x0.5), 87.5s at x1
  assert.equal(s2.heat, 0);
  assert.equal(s2.tokens, 10 * (0.5 * 2 + 12 * 0.5 + 87.5 * 1));
});

// --- tick step-size independence -----------------------------------------------------

test('tick: one long step matches many small steps within 0.1%', () => {
  for (const duration of [60, 100]) {
    const a = createState();
    a.generators.pi = 50;
    a.generators.gamer = 3;
    a.overclock = true; // crosses 100 at 50s and 40 at 62s
    const b = clone(a);
    tick(a, duration);
    const steps = duration * 10;
    for (let i = 0; i < steps; i++) tick(b, 0.1);
    assert.ok(
      Math.abs(a.tokens - b.tokens) / a.tokens < 0.001,
      `tokens differ by more than 0.1%: ${a.tokens} vs ${b.tokens}`
    );
    near(a.heat, b.heat, 1e-6);
    assert.equal(a.throttled, b.throttled);
  }
});

// --- overclock rules ------------------------------------------------------------------

test('overclock: heat rises 2/s minus cooling, falls 5/s when off, never overheats at rise <= 0', () => {
  const s = createState();
  s.overclock = true;
  tick(s, 10);
  assert.equal(s.heat, 20);
  s.upgrades.push('fans'); // cooling 0.5 -> net rise 1.5
  tick(s, 10);
  assert.equal(s.heat, 35);

  const s2 = createState();
  s2.upgrades.push('fans', 'liquid', 'immersion'); // cooling 2.25 -> net rise -0.25
  s2.overclock = true;
  tick(s2, 100);
  assert.equal(s2.heat, 0); // never overheats
  assert.equal(s2.throttled, false);

  const s3 = createState();
  s3.heat = 50;
  tick(s3, 10); // 5/s down to 0
  assert.equal(s3.heat, 0);
});

test('overclock: throttle at 100 turns it off, cannot re-enable while throttled, unthrottles at 40', () => {
  const s = createState();
  s.overclock = true;
  tick(s, 50);
  assert.equal(s.heat, 100);
  assert.equal(s.throttled, true);
  assert.equal(s.overclock, false);
  setOverclock(s, true);
  assert.equal(s.overclock, false); // ignored while throttled
  tick(s, 12); // 100 -> 40
  assert.equal(s.heat, 40);
  assert.equal(s.throttled, false);
  setOverclock(s, true);
  assert.equal(s.overclock, true);
  setOverclock(s, false);
  assert.equal(s.overclock, false);
});

// --- every upgrade kind ------------------------------------------------------------------

test('upgrade kinds: production multiplies, cacheRate adds, cooling slows heat, clickFlat/clickShare feed clicks', () => {
  // production
  const s = createState();
  s.generators.pi = 10;
  for (const id of ['quant', 'batch', 'flash', 'spec', 'mxfp', 'custom']) {
    const before = tokensPerSecond(s);
    s.tokens = 1e15;
    assert.equal(buyUpgrade(s, id), true);
    assert.equal(tokensPerSecond(s), before * upgrade(id).value);
  }
  s.tokens = 1e15;
  assert.equal(buyUpgrade(s, 'quant'), false); // already owned
  const sUnaffordable = createState();
  assert.equal(buyUpgrade(sUnaffordable, 'quant'), false);
  const sCost = createState();
  sCost.tokens = 100;
  assert.equal(buyUpgrade(sCost, 'quant'), true);
  assert.equal(sCost.tokens, 0); // cost deducted

  // cacheRate: tps ratio (1 + cr + v) / (1 + cr)
  const s2 = createState();
  s2.generators.pi = 10;
  let cr = 0;
  for (const id of ['prefix1', 'prefix2', 'prefix3']) {
    const v = upgrade(id).value;
    const before = tokensPerSecond(s2);
    s2.tokens = 1e15;
    assert.equal(buyUpgrade(s2, id), true);
    assert.equal(tokensPerSecond(s2), before * (1 + cr + v) / (1 + cr));
    cr += v;
  }

  // cooling: heat rise = 2 - cooling per second
  const s3 = createState();
  s3.upgrades.push('fans'); // 0.5
  s3.overclock = true;
  tick(s3, 10);
  assert.equal(s3.heat, 15);

  // clickFlat + clickShare
  const s4 = createState();
  s4.generators.pi = 10;
  s4.tokens = 1e15;
  assert.equal(buyUpgrade(s4, 'macro'), true);
  assert.equal(buyUpgrade(s4, 'api'), true);
  assert.equal(buyUpgrade(s4, 'api2'), true);
  assert.equal(click(s4), 1 + 4 + (0.02 + 0.03) * 10);
});

// --- prestige reset and what survives ------------------------------------------------------

test('prestige: resets the run, keeps weights, weight upgrades, totalLifetime and rush cooldown', () => {
  const s = createState();
  s.totalLifetime = 9e11; // sqrt(9e11 / 1e11) = 3
  s.lifetime = 9e11;
  s.weights = 2;
  s.tokens = 12345;
  s.generators.pi = 50;
  s.upgrades.push('quant');
  s.weightUpgrades.push('seed', 'night');
  s.heat = 80;
  s.overclock = true;
  s.throttled = true;
  s.rushCooldownUntil = 123456789;
  assert.equal(prestige(s), 3);
  assert.equal(s.weights, 5);
  assert.equal(s.tokens, 1000); // seed: start with 1000 tokens
  assert.equal(s.lifetime, 0);
  assert.equal(s.totalLifetime, 9e11);
  assert.equal(s.generators.pi, 0);
  assert.deepEqual(s.upgrades, []);
  assert.deepEqual(s.weightUpgrades, ['seed', 'night']);
  assert.equal(s.heat, 0);
  assert.equal(s.overclock, false);
  assert.equal(s.throttled, false);
  assert.equal(s.rushCooldownUntil, 123456789);
  assert.equal(weightsAvailable(s), 0); // nothing free yet

  const s2 = createState(); // no seed: starts at 0
  s2.totalLifetime = 1e11;
  assert.equal(prestige(s2), 1);
  assert.equal(s2.tokens, 0);

  const s3 = createState(); // not allowed: nothing changes
  const before = JSON.stringify(s3);
  assert.equal(prestige(s3), 0);
  assert.equal(JSON.stringify(s3), before);
});

// --- weights formula ------------------------------------------------------------------------

test('weightsAvailable = floor(sqrt(totalLifetime / 1e11)) - earnedThisCycle, never below 0', () => {
  const s = createState();
  s.totalLifetime = 1e11 - 1;
  assert.equal(weightsAvailable(s), 0);
  s.totalLifetime = 1e11;
  assert.equal(weightsAvailable(s), 1);
  s.totalLifetime = 4e11;
  assert.equal(weightsAvailable(s), 2);
  s.weightsEarnedThisCycle = 1;
  assert.equal(weightsAvailable(s), 1);
  s.weightsEarnedThisCycle = 10;
  assert.equal(weightsAvailable(s), 0); // clamped at 0

  const s2 = createState(); // based on totalLifetime, not the current run's lifetime
  s2.lifetime = 1e11;
  s2.totalLifetime = 0;
  assert.equal(weightsAvailable(s2), 0);
});

// --- each weight upgrade ----------------------------------------------------------------------

test('weight upgrade: seed starts the run with 1000 tokens', () => {
  const s = createState();
  s.weights = 5;
  assert.equal(buyWeightUpgrade(s, 'seed'), true);
  assert.equal(s.weights, 4);
  s.totalLifetime = 1e11;
  assert.equal(prestige(s), 1);
  assert.equal(s.tokens, 1000);
});

test('weight upgrade: night raises the offline rate to 75%', () => {
  const s = createState();
  s.generators.pi = 10; // 10 tps
  s.weights = 3;
  assert.equal(buyWeightUpgrade(s, 'night'), true);
  assert.equal(applyOffline(s, 100), 10 * 100 * 0.75);
});

test('weight upgrade: warm adds 0.25 to the cache rate', () => {
  const s = createState();
  s.generators.pi = 10;
  s.weights = 1; // enough to buy warm (cost 1)
  assert.equal(buyWeightUpgrade(s, 'warm'), true);
  assert.equal(tokensPerSecond(s), 10 * 1.25);
});

test('weight upgrade: long raises the offline cap to 24h', () => {
  const s = createState();
  s.generators.pi = 1; // 1 tps
  s.weights = 15; // enough to buy long (cost 15)
  assert.equal(buyWeightUpgrade(s, 'long'), true);
  assert.equal(applyOffline(s, 100 * 3600), 1 * 24 * 3600 * 0.5);
});

test('weight upgrade: auto cycles overclock 95/40 and never reaches 100', () => {
  const s = createState();
  s.generators.pi = 1; // 1 tps
  s.weights = 20;
  assert.equal(buyWeightUpgrade(s, 'auto'), true);
  s.overclock = true;
  tick(s, 300);
  assert.equal(s.throttled, false);
  assert.ok(s.heat <= 95 + 1e-9);
  // hand-computed cycle: 47.5s up (x2), then 6 full 38.5s cycles (up 27.5s x2,
  // down 11s x1), ending 10.5s into the next rise -> heat 61, factorTime 523.
  near(s.heat, 61, 1e-6);
  near(s.tokens, 523, 1e-6);

  // a manual toggle off stops the cycling
  const s2 = createState();
  s2.generators.pi = 1;
  s2.weights = 20;
  assert.equal(buyWeightUpgrade(s2, 'auto'), true);
  s2.overclock = true;
  tick(s2, 60); // 47.5s up to 95, 11s down to 40, 1.5s up again -> 43
  near(s2.heat, 43, 1e-6);
  setOverclock(s2, false);
  tick(s2, 100);
  assert.equal(s2.heat, 0);
  assert.equal(s2.overclock, false);
});

test('weight upgrade: distill raises the per-weight bonus to 13%', () => {
  const s = createState();
  s.generators.pi = 10;
  s.weightsEarnedThisCycle = 10;
  assert.equal(tokensPerSecond(s), 10 * 2.0); // 10% per weight
  s.weights = 60; // buy distill (cost 50), keep 10 weights
  assert.equal(buyWeightUpgrade(s, 'distill'), true);
  assert.equal(s.weights, 10);
  assert.equal(tokensPerSecond(s), 10 * 2.3);
});

test('buying a weight upgrade does not lower tokensPerSecond', () => {
  const s = createState();
  s.generators.pi = 10; // 10 tps
  s.weightsEarnedThisCycle = 10; // 1 + 0.1 * 10 = 2.0
  const before = tokensPerSecond(s);
  s.weights = 10; // spendable balance
  assert.equal(buyWeightUpgrade(s, 'seed'), true);
  assert.equal(s.weights, 9);
  assert.equal(tokensPerSecond(s), before);
});

test('weight upgrades: refused when unaffordable or already owned', () => {
  const s = createState();
  assert.equal(buyWeightUpgrade(s, 'distill'), false);
  s.weights = 50;
  assert.equal(buyWeightUpgrade(s, 'distill'), true);
  assert.equal(buyWeightUpgrade(s, 'distill'), false);
});

// --- offline cap and rate ---------------------------------------------------------------------

test('applyOffline: rate 50%, cap 8h, overclock ignored, sets overclock off, invalid args ignored', () => {
  const s = createState();
  s.generators.pi = 10; // 10 tps
  assert.equal(applyOffline(s, 1000), 10 * 1000 * 0.5);
  assert.equal(s.tokens, 5000);
  assert.equal(s.lifetime, 5000);
  assert.equal(s.totalLifetime, 5000);

  const s2 = createState();
  s2.generators.pi = 1;
  assert.equal(applyOffline(s2, 100 * 3600), 1 * 8 * 3600 * 0.5); // capped at 8h

  const s3 = createState();
  s3.generators.pi = 10;
  s3.overclock = true;
  s3.heat = 50;
  assert.equal(applyOffline(s3, 100), 10 * 100 * 0.5); // not doubled
  assert.equal(s3.overclock, false);

  const s4 = createState();
  s4.generators.pi = 10;
  assert.equal(applyOffline(s4, -5), 0);
  assert.equal(applyOffline(s4, NaN), 0);
  assert.equal(applyOffline(s4, Infinity), 0);
  assert.equal(applyOffline(s4, 0), 0);
  assert.equal(s4.tokens, 0);
});

// --- rush payout and cooldown -------------------------------------------------------------------

test('applyRush: pays tokensPerSecond * min(600, score/50) and sets a 10-minute cooldown', () => {
  const s = createState();
  s.generators.pi = 10; // 10 tps
  assert.equal(applyRush(s, 10000, 1000), 10 * 200); // min(600, 10000/50) = 200
  assert.equal(s.rushCooldownUntil, 1600);
  assert.equal(applyRush(s, 10000, 1500), 0); // still on cooldown
  assert.equal(s.rushCooldownUntil, 1600);
  assert.equal(applyRush(s, 1000000, 1600), 10 * 600); // min(600, 20000) = 600
  assert.equal(s.rushCooldownUntil, 2200);

  const s2 = createState();
  assert.equal(applyRush(s2, NaN, 0), 0);
  assert.equal(applyRush(s2, 100, NaN), 0);
  assert.equal(applyRush(s2, -100, 0), 0);
  assert.equal(s2.rushCooldownUntil, null);

  const s3 = createState();
  s3.generators.pi = 10;
  assert.equal(applyRush(s3, 10000, 0), 2000);
  assert.equal(s3.lifetime, 2000);
  assert.equal(s3.totalLifetime, 2000);
});

// --- invalid arguments ---------------------------------------------------------------------------

test('invalid arguments are ignored and never throw', () => {
  const s = createState();
  const snap = () => JSON.stringify(s);
  const before = snap();
  tick(s, -5);
  tick(s, NaN);
  tick(s, 'x');
  tick(s, Infinity);
  tick(null, 5);
  click(null);
  buy(null, 'pi', 1);
  buy(s, null, 1);
  buy(s, 'nope', 1);
  buy(s, 'pi', 0);
  buy(s, 'pi', -3);
  buy(s, 'pi', NaN);
  buy(s, 'pi', 'x');
  buyUpgrade(null, 'quant');
  buyUpgrade(s, 'nope');
  buyWeightUpgrade(s, 'nope');
  setOverclock(s, 'yes');
  setOverclock(s, 1);
  setOverclock(null, true);
  prestige(null);
  applyOffline(s, 'x');
  applyOffline(null, 100);
  applyRush(s, 'x', 0);
  applyRush(null, 100, 0);
  tokensPerSecond(null);
  cost(null, 'pi', 1);
  cost(s, 'nope', 1);
  cost(s, 'pi', 0);
  cost(s, 'pi', NaN);
  weightsAvailable(null);
  assert.equal(snap(), before);
});

// --- JSON round trip -------------------------------------------------------------------------------

test('state is JSON-serialisable and round-tripped states behave identically', () => {
  const s = createState();
  s.generators.pi = 30;
  s.upgrades.push('quant');
  s.weightUpgrades.push('seed');
  s.weights = 2;
  s.totalLifetime = 4e6;
  s.lifetime = 4e6;
  s.tokens = 123.456;
  s.heat = 55;
  s.overclock = true;
  s.rushCooldownUntil = 999;
  const copy = JSON.parse(JSON.stringify(s));
  assert.deepEqual(copy, s);
  tick(s, 30);
  tick(copy, 30);
  assert.deepEqual(copy, s);
  assert.equal(buy(copy, 'pi', 3), buy(s, 'pi', 3));
  assert.equal(prestige(copy), prestige(s));
  assert.deepEqual(copy, s);
});

// --- buyAllUpgrades ---------------------------------------------------------------------------

test('buyAllUpgrades: gated without the procure upgrade', () => {
  const s = createState();
  s.tokens = 1e9;
  assert.equal(buyAllUpgrades(s), 0);
  assert.deepEqual(s.upgrades, []);
  assert.equal(s.tokens, 1e9);
});

test('buyAllUpgrades: buys cheapest first and stops at the unaffordable one', () => {
  const s = createState();
  s.tokens = 5000;
  s.weightUpgrades.push('procure');
  assert.equal(buyAllUpgrades(s), 3); // quant 100, macro 500, batch 1000; prefix1 5000 not affordable
  assert.deepEqual(s.upgrades, ['quant', 'macro', 'batch']);
  assert.equal(s.tokens, 3400);
});

test('buyAllUpgrades: skips already-owned upgrades', () => {
  const s = createState();
  s.tokens = 1000;
  s.weightUpgrades.push('procure');
  s.upgrades.push('quant');
  assert.equal(buyAllUpgrades(s), 1); // macro 500; batch 1000 not affordable after
  assert.deepEqual(s.upgrades, ['quant', 'macro']);
  assert.equal(s.tokens, 500);
});

test('buyAllUpgrades: bad input never throws, returns 0', () => {
  assert.equal(buyAllUpgrades(null), 0);
  assert.equal(buyAllUpgrades({}), 0);
  assert.equal(buyAllUpgrades({ tokens: 'x', upgrades: [], weightUpgrades: ['procure'] }), 0);
  assert.equal(buyAllUpgrades(undefined), 0);
});

test('buyAllUpgrades: procure survives a prestige (weight upgrade)', () => {
  const s = createState();
  s.totalLifetime = 1e11; // 1 weight available
  s.weightUpgrades.push('procure');
  s.upgrades.push('quant');
  assert.equal(prestige(s), 1);
  assert.ok(s.weightUpgrades.includes('procure'));
  assert.deepEqual(s.upgrades, []);
});
