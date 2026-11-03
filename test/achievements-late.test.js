import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACHIEVEMENTS,
  GENERATORS,
  GLOBAL_MILESTONES,
  TIER_GATES,
} from '../src/idle/data.js';
import { checkAchievements } from '../src/idle/achievements.js';

// Late-game milestone achievements (docs/LATE-GAME-DESIGN.md, section 3):
// the first 500 and 1,000 of any tier, and each global milestone (every
// unlocked tier at 100, 250 and 500).

// A minimal state for checkAchievements: only the fields the new descriptor
// kinds read (generators, regionsEarned) plus the achievements list.
function state(regionsEarned, counts) {
  return { generators: { ...counts }, regionsEarned, achievements: [] };
}

// Set `n` of every tier in `ids` (the rest stay at 0 / unset).
function setCounts(counts, ids, n) {
  for (const id of ids) counts[id] = n;
  return counts;
}

const ALL_TIERS = GENERATORS.map((g) => g.id);
const BASE_8 = ALL_TIERS.slice(0, 8); // tiers 1-8 are always unlocked

test('ACHIEVEMENTS: the 5 late-game entries exist with the right kinds', () => {
  assert.equal(ACHIEVEMENTS.length, 71);
  const byId = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
  assert.equal(byId.size, 71, 'unique ids');
  assert.deepEqual(byId.get('any-500').test, { kind: 'anyOwned', n: 500 });
  assert.deepEqual(byId.get('any-1000').test, { kind: 'anyOwned', n: 1000 });
  for (const m of GLOBAL_MILESTONES) {
    const a = byId.get(`global-${m.owned}`);
    assert.ok(a, `global-${m.owned} present`);
    assert.deepEqual(a.test, { kind: 'allTiers', n: m.owned });
    assert.equal(a.name, `All tiers at ${m.owned}`);
  }
  for (const a of ACHIEVEMENTS) {
    assert.ok(a.test !== null && typeof a.test === 'object' && !Array.isArray(a.test));
  }
  JSON.stringify(ACHIEVEMENTS); // JSON-safe descriptors
});

test('anyOwned: first 500 of any tier unlocks at exactly 500', () => {
  for (const id of ['pi', 'swarm', 'singularity']) {
    const counts = {};
    setCounts(counts, [id], 499);
    assert.ok(!checkAchievements(state(0, counts)).includes('any-500'), `${id} 499 below`);
    setCounts(counts, [id], 500);
    assert.ok(checkAchievements(state(0, counts)).includes('any-500'), `${id} 500`);
  }
});

test('anyOwned: a locked tier still counts (any tier, gate irrelevant)', () => {
  const counts = setCounts({}, ['singularity'], 500); // gate: 8 Regions
  assert.ok(checkAchievements(state(0, counts)).includes('any-500'));
});

test('anyOwned: first 1,000 of any tier unlocks at exactly 1,000', () => {
  const counts = setCounts({}, ['lunar'], 999);
  assert.ok(!checkAchievements(state(0, counts)).includes('any-1000'));
  setCounts(counts, ['lunar'], 1000);
  assert.ok(checkAchievements(state(0, counts)).includes('any-1000'));
});

test('allTiers: with 0 Regions only tiers 1-8 are counted', () => {
  const counts = setCounts({}, BASE_8, 100); // tiers 9-12 stay at 0
  assert.ok(checkAchievements(state(0, counts)).includes('global-100'));
});

test('allTiers: one base tier below the count blocks it', () => {
  const counts = setCounts({}, BASE_8, 100);
  counts.pi = 99;
  assert.ok(!checkAchievements(state(0, counts)).includes('global-100'));
});

test('allTiers: a locked tier at 0 does not block', () => {
  const counts = setCounts({}, BASE_8, 100);
  assert.equal(counts.singularity, undefined);
  assert.ok(checkAchievements(state(0, counts)).includes('global-100'));
});

test('allTiers: with 8 Regions all 12 tiers are counted', () => {
  const counts = setCounts({}, BASE_8, 100);
  assert.ok(!checkAchievements(state(8, counts)).includes('global-100'), 'tiers 9-12 at 0');
  setCounts(counts, ALL_TIERS.slice(8), 100);
  assert.ok(checkAchievements(state(8, counts)).includes('global-100'));
});

test('allTiers: gates apply per tier (7 Regions: orbital/lunar/matrioshka counted, singularity not)', () => {
  const counts = setCounts({}, [...BASE_8, 'orbital', 'lunar', 'matrioshka'], 100);
  assert.ok(checkAchievements(state(7, counts)).includes('global-100'), 'unlocked tiers at 100, singularity locked');
  counts.matrioshka = 99;
  assert.ok(!checkAchievements(state(7, counts)).includes('global-100'), 'matrioshka below');
});

test('allTiers: 250 and 500 thresholds unlock at exactly the count', () => {
  for (const [n, id] of [[250, 'global-250'], [500, 'global-500']]) {
    const counts = setCounts({}, BASE_8, n - 1);
    assert.ok(!checkAchievements(state(0, counts)).includes(id), `${id} at ${n - 1}`);
    setCounts(counts, BASE_8, n);
    assert.ok(checkAchievements(state(0, counts)).includes(id), id);
  }
});

test('allTiers: 500 also unlocks the 100 and 250 milestones in the same check', () => {
  const counts = setCounts({}, BASE_8, 500);
  const unlocked = checkAchievements(state(0, counts));
  for (const id of ['global-100', 'global-250', 'global-500']) {
    assert.ok(unlocked.includes(id), id);
  }
});

test('new achievements unlock once, never returned twice', () => {
  const counts = setCounts({}, BASE_8, 500);
  const s = state(0, counts);
  const first = checkAchievements(s);
  assert.ok(first.includes('global-500'));
  const second = checkAchievements(s);
  assert.ok(!second.includes('global-500'), 'already unlocked');
  assert.ok(!second.includes('any-500'), 'already unlocked');
});
