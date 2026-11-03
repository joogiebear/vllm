import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createState,
  tokensPerSecond,
  tick,
  runRow,
  buyManager,
  buy,
  buyUpgrade,
  buyAllUpgrades,
  buyWeightUpgrade,
  weightsAvailable,
  prestige,
  ensureStarter,
  cost,
  applyOffline,
  applyRush,
  migrate,
  click,
  setOverclock,
} from '../src/idle/core.js';

test('createState: fresh state has the right fields', () => {
  const s = createState();
  assert.equal(s.tokens, 0);
  assert.equal(s.lifetime, 0);
  assert.equal(s.totalLifetime, 0);
  assert.equal(s.weights, 0);
  assert.equal(s.weightsEarnedThisCycle, 0);
  assert.equal(s.managers.length, 0);
  assert.equal(s.upgrades.length, 0);
  assert.equal(s.weightUpgrades.length, 0);
  assert.equal(s.rushCooldownUntil, null);
  assert.equal(s.generators.pi, 0);
  assert.equal(s.generators.swarm, 0);
  assert.equal(s.cycles.pi, null);
  assert.equal(s.cycles.swarm, null);
});

test('cost: geometric series', () => {
  const s = createState();
  assert.equal(cost(s, 'pi'), 15);
  assert.equal(cost(s, 'pi', 2), 15 + 15 * 1.15);
  s.generators.pi = 5;
  assert.equal(cost(s, 'pi'), 15 * Math.pow(1.15, 5));
  assert.equal(cost(s, 'nope'), Infinity);
});

test('buy: buys as many as it can', () => {
  const s = createState();
  s.tokens = 100;
  assert.equal(buy(s, 'pi'), 4);
  assert.equal(s.generators.pi, 4);
  assert.ok(s.tokens < 26.24);
  assert.equal(buy(s, 'nope'), 0);
  assert.equal(buy(s, 'pi', 0), 0);
});

test('buy: "max" is treated as Infinity', () => {
  const s = createState();
  s.tokens = 100;
  assert.equal(buy(s, 'pi', 'max'), 4);
  assert.equal(s.generators.pi, 4);
  assert.ok(s.tokens < 26.24);
  assert.equal(buy(s, 'pi', 'max'), 0);
});

test('buyUpgrade: cost and idempotency', () => {
  const s = createState();
  s.tokens = 100;
  assert.equal(buyUpgrade(s, 'quant'), true);
  assert.equal(s.tokens, 0);
  assert.equal(buyUpgrade(s, 'quant'), false);
  assert.equal(buyUpgrade(s, 'nope'), false);
});

test('buyAllUpgrades: Procurement Bot buys everything affordable', () => {
  const s = createState();
  s.tokens = 1100;
  assert.equal(buyAllUpgrades(s), 2);
  assert.ok(s.upgrades.includes('quant'));
  assert.ok(s.upgrades.includes('batch'));
  assert.equal(buyAllUpgrades(s), 0);
});

test('buyWeightUpgrade: cost and idempotency', () => {
  const s = createState();
  s.weights = 1;
  assert.equal(buyWeightUpgrade(s, 'seed'), true);
  assert.equal(s.weights, 0);
  assert.equal(buyWeightUpgrade(s, 'seed'), false);
  assert.equal(buyWeightUpgrade(s, 'nope'), false);
});

test('weightsAvailable: formula', () => {
  const s = createState();
  s.totalLifetime = 10000000000000;
  assert.equal(weightsAvailable(s), 10);
  s.totalLifetime = 40000000000000;
  assert.equal(weightsAvailable(s), 20);
  s.weightsEarnedThisCycle = 15;
  assert.equal(weightsAvailable(s), 5);
});

test('tokensPerSecond: steady-state rate (unchanged from the old game)', () => {
  const s = createState();
  s.generators.pi = 10;
  assert.equal(tokensPerSecond(s), 10);
  s.generators.pi = 100;
  assert.equal(tokensPerSecond(s), 800);
  s.generators.gamer = 5;
  assert.equal(tokensPerSecond(s), 800 + 40);
  s.upgrades.push('quant');
  assert.equal(tokensPerSecond(s), (800 + 40) * 1.5);
  s.upgrades.push('pi3');
  assert.equal(tokensPerSecond(s), 100 * 3 * 8 * 1.5 + 40 * 1.5);
});

test('tick: a row without a manager does nothing until tapped', () => {
  const s = createState();
  s.generators.pi = 1;
  tick(s, 10);
  assert.equal(s.tokens, 0);
  assert.equal(s.cycles.pi, null);
});

test('tick: a tapped row pays one lump at the end of the cycle, then stops', () => {
  const s = createState();
  s.generators.pi = 1;
  assert.equal(runRow(s, 'pi'), true);
  tick(s, 3.5);
  assert.equal(s.tokens, 0);
  tick(s, 3.5);
  assert.equal(s.tokens, 7);
  assert.equal(s.cycles.pi, null);
  tick(s, 10);
  assert.equal(s.tokens, 7);
});

test('tick: a row with a manager restarts itself', () => {
  const s = createState();
  s.generators.pi = 1;
  s.managers.push('pi');
  tick(s, 21);
  assert.equal(s.tokens, 21);
  assert.equal(s.cycles.pi, 0);
});

test('tick: a cycle under 0.25s is continuous (bar full, pays every tick)', () => {
  const s = createState();
  s.generators.pi = 400;
  s.managers.push('pi');
  tick(s, 2);
  assert.equal(s.tokens, 25600);
  assert.equal(s.cycles.pi, 0.21875);
});

test('tick: a row with 0 owned cannot run', () => {
  const s = createState();
  s.managers.push('pi');
  tick(s, 10);
  assert.equal(s.tokens, 0);
  assert.equal(runRow(s, 'pi'), false);
});

test('milestones: cycle time halves, steady-state rate unchanged', () => {
  const s = createState();
  s.generators.pi = 24;
  s.managers.push('pi');
  tick(s, 7);
  assert.equal(s.tokens, 168);
  assert.equal(s.cycles.pi, 0);
  s.generators.pi = 25;
  s.cycles.pi = 0;
  tick(s, 3.5);
  assert.equal(s.tokens, 168 + 175);
  assert.equal(s.cycles.pi, 0);
  s.generators.pi = 50;
  s.cycles.pi = 0;
  tick(s, 1.75);
  assert.equal(s.tokens, 168 + 175 + 350);
  assert.equal(s.cycles.pi, 0);
  s.generators.pi = 100;
  s.cycles.pi = 0;
  tick(s, 0.875);
  assert.equal(s.tokens, 168 + 175 + 350 + 700);
  assert.equal(s.cycles.pi, 0);
});

test('runRow: invalid id and already-running row do nothing', () => {
  const s = createState();
  s.generators.pi = 1;
  assert.equal(runRow(s, 'nope'), false);
  assert.equal(runRow(s, 'pi'), true);
  assert.equal(runRow(s, 'pi'), false);
});

test('buyManager: cost, one per generator', () => {
  const s = createState();
  s.tokens = 100;
  assert.equal(buyManager(s, 'pi'), true);
  assert.equal(s.tokens, 0);
  assert.equal(buyManager(s, 'pi'), false);
  assert.equal(buyManager(s, 'nope'), false);
  s.tokens = 15000;
  assert.equal(buyManager(s, 'gamer'), true);
  assert.equal(s.tokens, 0);
});

test('buyManager: resets on prestige', () => {
  const s = createState();
  s.totalLifetime = 10000000000000;
  s.tokens = 1000;
  buyManager(s, 'pi');
  const gained = prestige(s);
  assert.equal(gained, 10);
  assert.equal(s.managers.length, 0);
  assert.equal(s.cycles.pi, null);
});

test('Standing Orders: a new run starts with the Cron Job hired', () => {
  const s = createState();
  s.totalLifetime = 10000000000000;
  s.weights = 20;
  assert.equal(buyWeightUpgrade(s, 'auto'), true);
  s.tokens = 1000;
  buyManager(s, 'pi');
  const gained = prestige(s);
  assert.equal(gained, 10);
  assert.deepEqual(s.managers, ['pi']);
});

test('prestige: resets generators, tokens, upgrades, keeps weights', () => {
  const s = createState();
  s.totalLifetime = 10000000000000;
  s.tokens = 500;
  s.lifetime = 500;
  s.generators.pi = 3;
  s.upgrades.push('quant');
  s.weights = 2;
  const gained = prestige(s);
  assert.equal(gained, 10);
  assert.equal(s.weights, 12);
  assert.equal(s.weightsEarnedThisCycle, 10);
  assert.equal(s.tokens, 0);
  assert.equal(s.lifetime, 0);
  assert.equal(s.generators.pi, 1); // every run starts with one Pi
  assert.equal(s.upgrades.length, 0);
  assert.equal(s.totalLifetime, 10000000000000);
});

test('prestige: Seed Funding starts with 1000 tokens', () => {
  const s = createState();
  s.totalLifetime = 100000000000;
  s.weights = 1;
  s.weightUpgrades.push('seed');
  prestige(s);
  assert.equal(s.tokens, 1000);
});

test('applyOffline: only managed rows count, 8h cap', () => {
  const s = createState();
  s.generators.pi = 1;
  assert.equal(applyOffline(s, 3600 * 8), 0);
  s.managers.push('pi');
  assert.equal(applyOffline(s, 3600 * 8), 14400);
  assert.equal(applyOffline(s, 3600 * 100), 14400);
});

test('applyOffline: Night Shift rate and Long Weekend cap', () => {
  const s = createState();
  s.generators.pi = 1;
  s.managers.push('pi');
  s.weightUpgrades.push('night');
  s.weightUpgrades.push('long');
  assert.equal(applyOffline(s, 100000), 64800);
});

test('applyRush: formula and cooldown', () => {
  const s = createState();
  s.generators.pi = 10;
  assert.equal(applyRush(s, 100, 1000), 20);
  assert.equal(s.rushCooldownUntil, 1000 + 600);
  assert.equal(applyRush(s, 100, 1000 + 10), 0);
  assert.equal(applyRush(s, 100, 1000 + 600), 20);
  assert.equal(applyRush(s, 20000, 1000 + 1200), 4000);
  assert.equal(applyRush(s, 0, 1000 + 1800), 0);
});

test('click and setOverclock are no-ops', () => {
  const s = createState();
  s.generators.pi = 10;
  assert.equal(click(s), 0);
  assert.equal(s.tokens, 0);
  setOverclock(s, true);
  assert.equal(s.overclock, undefined);
  tick(s, 1);
  assert.equal(s.tokens, 0);
});

test('migrate: v1 save -> v2 (refunds removed upgrades, drops heat, keeps the rest)', () => {
  const v1 = {
    version: 1,
    tokens: 100,
    lifetime: 100,
    totalLifetime: 100,
    weights: 0,
    weightsEarnedThisCycle: 0,
    generators: { pi: 3 },
    upgrades: ['quant', 'fans', 'macro'],
    weightUpgrades: ['seed'],
    heat: 42,
    overclock: true,
    throttled: false,
    autoPause: false,
    rushCooldownUntil: null,
  };
  const s = migrate(v1);
  assert.equal(s.version, 2);
  assert.equal(s.tokens, 100 + 8000 + 500);
  assert.equal(s.lifetime, 100);
  assert.equal(s.totalLifetime, 100);
  assert.deepEqual(s.upgrades, ['quant']);
  assert.deepEqual(s.weightUpgrades, ['seed']);
  assert.equal(s.generators.pi, 3);
  assert.equal(s.heat, undefined);
  assert.equal(s.overclock, undefined);
  assert.equal(s.throttled, undefined);
  assert.equal(s.autoPause, undefined);
  // the rate is unchanged: 3 pi * x1.5 (quant)
  assert.equal(tokensPerSecond(s), 4.5);
  // the input is not mutated
  assert.equal(v1.tokens, 100);
  assert.equal(v1.upgrades.length, 3);
});

test('migrate: a v2 save passes through unchanged', () => {
  const v2 = {
    version: 2,
    tokens: 50,
    lifetime: 50,
    totalLifetime: 50,
    weights: 1,
    weightsEarnedThisCycle: 1,
    generators: { gamer: 2 },
    upgrades: ['batch'],
    weightUpgrades: ['warm'],
    managers: ['pi'],
    cycles: { pi: 0.5, gamer: null },
    rushCooldownUntil: 123,
  };
  const s = migrate(v2);
  assert.equal(s.version, 2);
  assert.equal(s.tokens, 50);
  assert.deepEqual(s.upgrades, ['batch']);
  assert.deepEqual(s.managers, ['pi']);
  assert.equal(s.cycles.pi, 0.5);
  assert.equal(s.cycles.gamer, null);
  assert.equal(s.rushCooldownUntil, 123);
  assert.equal(s.generators.gamer, 2);
});

test('migrate: a fresh state (no version) is left alone', () => {
  const s = migrate(null);
  assert.equal(s.tokens, 0);
  assert.equal(s.version, 2);
  assert.equal(s.generators.pi, 0);
  const empty = migrate({});
  assert.equal(empty.tokens, 0);
  assert.equal(empty.upgrades.length, 0);
});

test('a new run and a prestige both start with one Raspberry Pi', () => {
  const s = ensureStarter(createState());
  assert.equal(s.generators.pi, 1);
  assert.ok(tokensPerSecond(s) > 0);
  s.totalLifetime = s.lifetime = 1e13;
  prestige(s);
  assert.equal(s.generators.pi, 1);
  assert.equal(s.generators.gamer, 0);
});

test('ensureStarter restores a pi only when nothing is owned', () => {
  const s = createState();
  s.generators.pi = 0;
  ensureStarter(s);
  assert.equal(s.generators.pi, 1);
  s.generators.pi = 0;
  s.generators.gamer = 3;
  ensureStarter(s);
  assert.equal(s.generators.pi, 0);
});
