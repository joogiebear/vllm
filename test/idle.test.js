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
import { ACHIEVEMENTS } from '../src/idle/data.js';
import { checkAchievements } from '../src/idle/achievements.js';

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
  assert.deepEqual(s.achievements, []);
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

test('createState: stats start at zero', () => {
  const s = createState();
  assert.deepEqual(s.stats, {
    allTimeTokens: 0,
    bestRunTokens: 0,
    playSeconds: 0,
    offlineSeconds: 0,
    offlineTokens: 0,
    prestiges: 0,
    managersHired: 0,
    taps: 0,
    generatorsBought: 0,
    upgradesBought: 0,
    rushGames: 0,
    bestRushScore: 0,
    runStartedAt: 0,
  });
});

test('stats: playSeconds accumulates with tick', () => {
  const s = createState();
  tick(s, 10);
  assert.equal(s.stats.playSeconds, 10);
  tick(s, 2.5);
  assert.equal(s.stats.playSeconds, 12.5);
  tick(s, 0);
  assert.equal(s.stats.playSeconds, 12.5);
});

test('stats: allTimeTokens and bestRunTokens follow earnings', () => {
  const s = createState();
  s.generators.pi = 1;
  s.managers.push('pi');
  tick(s, 7);
  assert.equal(s.stats.allTimeTokens, 7);
  assert.equal(s.stats.bestRunTokens, 7);
  tick(s, 7);
  assert.equal(s.stats.allTimeTokens, 14);
  assert.equal(s.stats.bestRunTokens, 14);
});

test('stats: taps count manual row starts only', () => {
  const s = createState();
  s.generators.pi = 1;
  assert.equal(runRow(s, 'pi'), true);
  assert.equal(s.stats.taps, 1);
  assert.equal(runRow(s, 'pi'), false);
  assert.equal(runRow(s, 'nope'), false);
  assert.equal(s.stats.taps, 1);
});

test('stats: generatorsBought counts purchases', () => {
  const s = createState();
  s.tokens = 100;
  assert.equal(buy(s, 'pi'), 4);
  assert.equal(s.stats.generatorsBought, 4);
  assert.equal(buy(s, 'pi', 'max'), 0);
  assert.equal(s.stats.generatorsBought, 4);
});

test('stats: upgradesBought counts purchases', () => {
  const s = createState();
  s.tokens = 1100;
  assert.equal(buyUpgrade(s, 'quant'), true);
  assert.equal(s.stats.upgradesBought, 1);
  assert.equal(buyUpgrade(s, 'quant'), false);
  assert.equal(buyAllUpgrades(s), 1);
  assert.equal(s.stats.upgradesBought, 2);
});

test('stats: managersHired counts successful hires', () => {
  const s = createState();
  s.tokens = 100;
  assert.equal(buyManager(s, 'pi'), true);
  assert.equal(s.stats.managersHired, 1);
  assert.equal(buyManager(s, 'pi'), false);
  assert.equal(buyManager(s, 'nope'), false);
  s.tokens = 15000;
  assert.equal(buyManager(s, 'gamer'), true);
  assert.equal(s.stats.managersHired, 2);
});

test('stats: offlineSeconds and offlineTokens track time away', () => {
  const s = createState();
  s.generators.pi = 1;
  s.managers.push('pi');
  assert.equal(applyOffline(s, 3600 * 8), 14400);
  assert.equal(s.stats.offlineSeconds, 3600 * 8);
  assert.equal(s.stats.offlineTokens, 14400);
  assert.equal(applyOffline(s, 3600 * 100), 14400);
  assert.equal(s.stats.offlineSeconds, 3600 * 16);
  assert.equal(s.stats.offlineTokens, 28800);
});

test('stats: prestiges increments only on success', () => {
  const s = createState();
  assert.equal(prestige(s), 0);
  assert.equal(s.stats.prestiges, 0);
  s.totalLifetime = 10000000000000;
  assert.equal(prestige(s), 10);
  assert.equal(s.stats.prestiges, 1);
});

test('stats: rushGames and bestRushScore track rush payouts', () => {
  const s = createState();
  s.generators.pi = 10;
  assert.equal(applyRush(s, 100, 1000), 20);
  assert.equal(s.stats.rushGames, 1);
  assert.equal(s.stats.bestRushScore, 100);
  assert.equal(applyRush(s, 500, 1000 + 10), 0);
  assert.equal(s.stats.rushGames, 1);
  assert.equal(applyRush(s, 500, 1000 + 600), 100);
  assert.equal(s.stats.bestRushScore, 500);
  assert.equal(applyRush(s, 0, 1000 + 1200), 0);
  assert.equal(s.stats.rushGames, 2);
});

test('stats: runStartedAt is the game time when the run began', () => {
  const s = createState();
  assert.equal(s.stats.runStartedAt, 0);
  tick(s, 30);
  s.totalLifetime = 10000000000000;
  prestige(s);
  assert.equal(s.stats.runStartedAt, 30);
});

test('stats: prestige keeps every counter except runStartedAt', () => {
  const s = createState();
  s.totalLifetime = 10000000000000;
  s.stats.allTimeTokens = 5000;
  s.stats.bestRunTokens = 4000;
  s.stats.playSeconds = 123;
  s.stats.offlineSeconds = 45;
  s.stats.offlineTokens = 90;
  s.stats.managersHired = 2;
  s.stats.taps = 100;
  s.stats.generatorsBought = 25;
  s.stats.upgradesBought = 3;
  s.stats.rushGames = 4;
  s.stats.bestRushScore = 2000;
  assert.equal(prestige(s), 10);
  assert.equal(s.stats.allTimeTokens, 5000);
  assert.equal(s.stats.bestRunTokens, 4000);
  assert.equal(s.stats.playSeconds, 123);
  assert.equal(s.stats.offlineSeconds, 45);
  assert.equal(s.stats.offlineTokens, 90);
  assert.equal(s.stats.prestiges, 1);
  assert.equal(s.stats.managersHired, 2);
  assert.equal(s.stats.taps, 100);
  assert.equal(s.stats.generatorsBought, 25);
  assert.equal(s.stats.upgradesBought, 3);
  assert.equal(s.stats.rushGames, 4);
  assert.equal(s.stats.bestRushScore, 2000);
  assert.equal(s.stats.runStartedAt, 123);
  // the new run earns below the old best, which is kept:
  // 1 * 1 * 7 * (1 + 0.1 * 10 weights) = 14
  s.generators.pi = 1;
  s.managers.push('pi');
  tick(s, 7);
  assert.equal(s.lifetime, 14);
  assert.equal(s.stats.bestRunTokens, 4000);
});

test('migrate: old saves get zero stats', () => {
  const s = migrate({ version: 1, tokens: 100, generators: { pi: 3 } });
  assert.deepEqual(s.stats, {
    allTimeTokens: 0,
    bestRunTokens: 0,
    playSeconds: 0,
    offlineSeconds: 0,
    offlineTokens: 0,
    prestiges: 0,
    managersHired: 0,
    taps: 0,
    generatorsBought: 0,
    upgradesBought: 0,
    rushGames: 0,
    bestRushScore: 0,
    runStartedAt: 0,
  });
});

test('ACHIEVEMENTS: 60 entries (48 owned + 12 others), unique ids, JSON-safe tests', () => {
  assert.equal(ACHIEVEMENTS.length, 60);
  const ids = new Set(ACHIEVEMENTS.map((a) => a.id));
  assert.equal(ids.size, 60);
  const owned = ACHIEVEMENTS.filter((a) => a.test.kind === 'owned');
  assert.equal(owned.length, 48);
  assert.equal(ACHIEVEMENTS.length - owned.length, 12);
  for (const a of ACHIEVEMENTS) {
    assert.equal(typeof a.name, 'string');
    assert.equal(typeof a.desc, 'string');
    assert.ok(a.test !== null && typeof a.test === 'object' && !Array.isArray(a.test));
  }
  JSON.stringify(ACHIEVEMENTS);
});

test('achievements: owned unlocks at the exact thresholds 1, 25, 100, 400', () => {
  for (const n of [1, 25, 100, 400]) {
    const s = createState();
    s.generators.pi = n - 1;
    assert.ok(!checkAchievements(s).includes(`gen-pi-${n}`), `pi ${n - 1} below ${n}`);
    s.generators.pi = n;
    assert.ok(checkAchievements(s).includes(`gen-pi-${n}`), `pi ${n}`);
  }
});

test('achievements: lifetime-in-run unlocks at 1M, 1B, 1T, 1Qa', () => {
  for (const [n, id] of [[1e6, 'lifetime-1m'], [1e9, 'lifetime-1b'], [1e12, 'lifetime-1t'], [1e15, 'lifetime-1qa']]) {
    const s = createState();
    s.lifetime = n - 1;
    assert.ok(!checkAchievements(s).includes(id), `${id} below`);
    s.lifetime = n;
    assert.ok(checkAchievements(s).includes(id), id);
  }
});

test('achievements: prestiges unlocks at 1, 5, 25', () => {
  for (const n of [1, 5, 25]) {
    const s = createState();
    s.stats.prestiges = n - 1;
    assert.ok(!checkAchievements(s).includes(`prestige-${n}`), `prestige ${n - 1} below ${n}`);
    s.stats.prestiges = n;
    assert.ok(checkAchievements(s).includes(`prestige-${n}`), `prestige ${n}`);
  }
});

test('achievements: allManagers needs all 12 hired in one run', () => {
  const s = createState();
  s.managers.push('pi', 'gamer', 'workstation', 'rack', 'cluster', 'datacenter', 'campus', 'swarm', 'orbital', 'lunar', 'matrioshka');
  assert.ok(!checkAchievements(s).includes('managers-all'));
  s.managers.push('singularity');
  assert.ok(checkAchievements(s).includes('managers-all'));
});

test('achievements: taps unlock at 100 and 1,000', () => {
  for (const [n, id] of [[100, 'taps-100'], [1000, 'taps-1000']]) {
    const s = createState();
    s.stats.taps = n - 1;
    assert.ok(!checkAchievements(s).includes(id), `${id} below`);
    s.stats.taps = n;
    assert.ok(checkAchievements(s).includes(id), id);
  }
});

test('achievements: rush games unlock at 1 and 10', () => {
  const s = createState();
  assert.deepEqual(checkAchievements(s), []);
  s.stats.rushGames = 1;
  assert.ok(checkAchievements(s).includes('rush-1'));
  s.stats.rushGames = 9;
  assert.ok(!checkAchievements(s).includes('rush-10'));
  s.stats.rushGames = 10;
  assert.ok(checkAchievements(s).includes('rush-10'));
});

test('achievements: an achievement unlocks only once', () => {
  const s = createState();
  s.generators.pi = 25;
  const first = checkAchievements(s);
  assert.ok(first.includes('gen-pi-1'));
  assert.ok(first.includes('gen-pi-25'));
  assert.deepEqual(checkAchievements(s), []);
  assert.deepEqual(checkAchievements(s), []);
});

test('achievements: each one adds +1% to tokensPerSecond', () => {
  const s = createState();
  s.generators.pi = 10;
  assert.equal(tokensPerSecond(s), 10);
  s.achievements.push('gen-pi-1');
  assert.equal(tokensPerSecond(s), 10 * (1 + 0.01));
  s.achievements.push('gen-pi-25');
  assert.equal(tokensPerSecond(s), 10 * (1 + 0.02));
});

test('achievements: survive prestige', () => {
  const s = createState();
  s.totalLifetime = 1e13;
  s.generators.pi = 25;
  checkAchievements(s);
  assert.ok(s.achievements.includes('gen-pi-25'));
  assert.equal(prestige(s), 10);
  assert.ok(s.achievements.includes('gen-pi-25'));
  assert.ok(s.achievements.includes('gen-pi-1'));
});

test('tick: checks achievements at the end of the tick', () => {
  const s = createState();
  s.generators.pi = 25;
  assert.deepEqual(s.achievements, []);
  tick(s, 1);
  assert.ok(s.achievements.includes('gen-pi-1'));
  assert.ok(s.achievements.includes('gen-pi-25'));
});

test('migrate: achievements pass through a v2 save, old saves get empty', () => {
  const v2 = { version: 2, achievements: ['gen-pi-1', 'bogus', 42] };
  assert.deepEqual(migrate(v2).achievements, ['gen-pi-1']);
  assert.deepEqual(migrate({ version: 1 }).achievements, []);
});

test('tiers 9-12: base costs, outputs and cycle times', () => {
  const s = createState();
  assert.equal(cost(s, 'orbital'), 8e9);
  assert.equal(cost(s, 'lunar'), 1.3e11);
  assert.equal(cost(s, 'matrioshka'), 2.2e12);
  assert.equal(cost(s, 'singularity'), 4e13);
  s.generators.orbital = 1;
  assert.equal(tokensPerSecond(s), 1.5e6);
  s.generators.lunar = 1;
  assert.equal(tokensPerSecond(s), 1.5e6 + 9e6);
  s.generators.matrioshka = 1;
  assert.equal(tokensPerSecond(s), 1.5e6 + 9e6 + 5.4e7);
  s.generators.singularity = 1;
  assert.equal(tokensPerSecond(s), 1.5e6 + 9e6 + 5.4e7 + 3.3e8);
});

test('tiers 9-12: per-tier production upgrades multiply one tier only', () => {
  const s = createState();
  s.generators.orbital = 1;
  assert.equal(tokensPerSecond(s), 1.5e6);
  s.upgrades.push('orbital3');
  assert.equal(tokensPerSecond(s), 1.5e6 * 3);
  s.generators.lunar = 1;
  assert.equal(tokensPerSecond(s), 1.5e6 * 3 + 9e6);
});

test('tiers 9-12: managers cost and hire', () => {
  const s = createState();
  s.tokens = 4e12;
  assert.equal(buyManager(s, 'orbital'), true);
  assert.equal(s.tokens, 0);
  s.tokens = 8e13;
  assert.equal(buyManager(s, 'lunar'), true);
  s.tokens = 1.6e15;
  assert.equal(buyManager(s, 'matrioshka'), true);
  s.tokens = 3.2e16;
  assert.equal(buyManager(s, 'singularity'), true);
  assert.equal(buyManager(s, 'orbital'), false); // one per generator
});

test('migrate: an old 8-tier save gets the new tiers at 0 owned / null cycles', () => {
  const old = {
    version: 2,
    tokens: 123,
    lifetime: 456,
    totalLifetime: 789,
    generators: { pi: 3, gamer: 2, workstation: 1, rack: 0, cluster: 0, datacenter: 0, campus: 0, swarm: 0 },
    cycles: { pi: 3.5, gamer: 2.25, workstation: 1, rack: null, cluster: null, datacenter: null, campus: null, swarm: null },
    upgrades: ['quant'],
    weightUpgrades: ['seed'],
    managers: ['pi'],
  };
  const s = migrate(old);
  assert.equal(s.generators.orbital, 0);
  assert.equal(s.generators.lunar, 0);
  assert.equal(s.generators.matrioshka, 0);
  assert.equal(s.generators.singularity, 0);
  assert.equal(s.cycles.orbital, null);
  assert.equal(s.cycles.lunar, null);
  assert.equal(s.cycles.matrioshka, null);
  assert.equal(s.cycles.singularity, null);
  // old tiers preserved
  assert.equal(s.generators.pi, 3);
  assert.equal(s.cycles.pi, 3.5);
});
