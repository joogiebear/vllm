// Rule tests for src/idle/advice.js. Run with: node --test test/advice.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, cost, tokensPerSecond } from '../src/idle/core.js';
import { nextBestBuy, nextGoal } from '../src/idle/advice.js';
import { UPGRADES } from '../src/idle/data.js';

// --- helpers -------------------------------------------------------------------

function stateWith(tokens, gens = {}, upgrades = []) {
  const s = createState();
  s.tokens = tokens;
  for (const [id, n] of Object.entries(gens)) s.generators[id] = n;
  s.upgrades = upgrades;
  return s;
}

function applyCandidate(state, r) {
  const s = JSON.parse(JSON.stringify(state));
  if (r.kind === 'generator') s.generators[r.id] = (s.generators[r.id] || 0) + 1;
  else s.upgrades.push(r.id);
  return s;
}

// --- tests ---------------------------------------------------------------------

test('fresh state: nothing affordable, nearest by cost is the Raspberry Pi', () => {
  const s = stateWith(0);
  const r = nextBestBuy(s);
  assert.equal(r.affordable, false);
  assert.equal(r.kind, 'generator');
  assert.equal(r.id, 'pi');
  assert.equal(r.cost, cost(s, 'pi', 1));
  assert.equal(r.gain, 1);
});

test('picks the best gain per cost among affordable', () => {
  // 10 pi (10/s base), 1000 tokens: pi costs 61 (gain 1, ratio ~0.0164),
  // quant costs 100 (gain 5, ratio 0.05) -> quant.
  const s = stateWith(1000, { pi: 10 });
  const r = nextBestBuy(s);
  assert.equal(r.kind, 'upgrade');
  assert.equal(r.id, 'quant');
  assert.equal(r.affordable, true);
  assert.equal(r.gain, 5);
  assert.equal(r.cost, 100);
});

test('gain scales with owned multipliers', () => {
  // Own quant (x1.5), 50 pi -> base 300/s (doubling at 25 and 50: x4).
  // batch (x2): gain 300, cost 1000 (ratio 0.3) beats the next pi
  // (cost ~16230, gain 6) and gamer (gain 48, cost 220).
  const s = stateWith(1000, { pi: 50 }, ['quant']);
  const r = nextBestBuy(s);
  assert.equal(r.kind, 'upgrade');
  assert.equal(r.id, 'batch');
  assert.equal(r.gain, 300);
});

test('owned upgrades are not candidates', () => {
  // quant + batch (x3), 10 pi -> base 30/s, 100 tokens. pi: gain 3, cost 61
  // (ratio ~0.049); macro (500) and gamer (220) are not affordable. -> pi.
  const s = stateWith(100, { pi: 10 }, ['quant', 'batch']);
  const r = nextBestBuy(s);
  assert.notEqual(r.id, 'quant');
  assert.notEqual(r.id, 'batch');
  assert.equal(r.id, 'pi');
  assert.equal(r.gain, 3);
});

test('none affordable: nearest by time at the current rate', () => {
  // 10 pi -> 10/s, 0 tokens. pi: 61/10 = 6.1s; quant: 100/10 = 10s;
  // macro: 500/10 = 50s. -> pi.
  const s = stateWith(0, { pi: 10 });
  const r = nextBestBuy(s);
  assert.equal(r.affordable, false);
  assert.equal(r.id, 'pi');
});

test('zero rate: nearest falls back to the smallest remaining cost', () => {
  const s = stateWith(0);
  const r = nextBestBuy(s);
  assert.equal(r.id, 'pi');
  assert.equal(r.affordable, false);
});

test('does not mutate the input state', () => {
  const s = stateWith(1000, { pi: 10 }, ['quant']);
  const before = JSON.stringify(s);
  nextBestBuy(s);
  assert.equal(JSON.stringify(s), before);
});

test('gain is the tokensPerSecond difference on a clone', () => {
  const s = stateWith(1000, { pi: 10 });
  const r = nextBestBuy(s);
  const expected = tokensPerSecond(applyCandidate(s, r)) - tokensPerSecond(s);
  assert.equal(r.gain, expected);
});

test('result has exactly the documented shape', () => {
  const r = nextBestBuy(stateWith(1000, { pi: 10 }));
  assert.deepEqual(Object.keys(r).sort(), ['affordable', 'cost', 'gain', 'id', 'kind']);
});

// --- nextGoal (docs/UX-PLAN.md, section 3.2) -------------------------------------

test('nextGoal: hidden while an event offer is on screen', () => {
  const s = stateWith(0, { pi: 1 });
  s.eventOffer = { kind: 'windfall', expiresIn: 20 };
  assert.equal(nextGoal(s), null);
});

test('nextGoal: a Region ready beats everything else', () => {
  const s = stateWith(0, { pi: 1 });
  s.weightsSinceExpand = 1e9;
  s.totalLifetime = 1e30;
  const g = nextGoal(s);
  assert.equal(g.kind, 'region');
  assert.equal(g.tab, 'prestige');
  assert.equal(g.seg, 'regions');
  assert.match(g.text, /^Region ready: expand to /);
});

test('nextGoal: prestige only once it would raise Weights by at least half', () => {
  const s = stateWith(0, { pi: 1 });
  s.totalLifetime = 1e15;
  assert.equal(nextGoal(s).kind, 'prestige');
  assert.match(nextGoal(s).text, /^Prestige ready: \+/);
  s.weights = 1e9; // a huge bank: a few more Weights are not worth a reset
  assert.notEqual(nextGoal(s).kind, 'prestige');
});

test('nextGoal: a fresh game points at buying a Raspberry Pi', () => {
  const s = stateWith(0, { pi: 1 });
  const g = nextGoal(s);
  assert.equal(g.kind, 'generator');
  assert.equal(g.text, 'Buy a Raspberry Pi');
  assert.equal(g.tab, 'game');
  assert.equal(g.have, 0);
  assert.ok(g.need > 0);
});

test('nextGoal: an unhired manager that is the cheapest thing is the goal', () => {
  const s = stateWith(0, { pi: 60 }, UPGRADES.map((u) => u.id));
  s.generators.gamer = 1; // the next machine is owned, so no cheap unlock
  const g = nextGoal(s);
  assert.equal(g.kind, 'manager');
  assert.equal(g.text, 'Hire Cron Job');
  assert.equal(g.tab, 'managers');
});

test('nextGoal: only machines on screen are suggested, never a far tier', () => {
  const s = stateWith(1e30, { pi: 1 });
  const g = nextGoal(s);
  if (g.kind === 'generator') assert.ok(['Buy a Raspberry Pi', 'Unlock Gaming GPU'].includes(g.text), g.text);
});
