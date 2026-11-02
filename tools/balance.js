// Headless balance check for OVERCLOCK.
//
//   node tools/balance.js
//
// Plays the sim with two bots over 200 seeds each and prints, per bot,
// the median and 90th percentile of level reached and score.
//
//   idle   - never acts (freezes in the upgrade phase after level 1).
//   greedy - each tick, assigns the queue's most urgent request (lowest
//            remaining patience) to a free slot, preferring a GPU whose
//            active prefix matches, otherwise the coolest GPU; avoids
//            GPUs that are throttled or above 85 heat when another
//            option exists; picks the first upgrade offered.
//
// Each run ends at game over or level 30 (or the tick cap, which only
// matters for the idle bot's frozen upgrade phase).

import { createGame, step } from '../src/sim.js';

const SEEDS = 200;
const MAX_LEVEL = 30;
const TICK_CAP = 60000;
const HEAT_AVOID = 85;

// Greedy policy: one assign per tick (plus the upgrade pick).
function greedyActions(s) {
  const acts = [];
  if (s.phase === 'upgrade') {
    acts.push({ type: 'upgrade', choice: 0 });
  } else if (s.phase === 'playing' && s.queue.length > 0) {
    let req = s.queue[0];
    for (const r of s.queue) if (r.patience < req.patience) req = r;

    const candidates = [];
    for (let g = 0; g < s.gpus.length; g++) {
      const gpu = s.gpus[g];
      const slot = gpu.slots.findIndex((x) => x === null);
      if (slot !== -1) candidates.push({ g, slot, gpu });
    }
    if (candidates.length === 0) return acts;

    const safe = candidates.filter(
      (c) => !c.gpu.throttled && c.gpu.heat <= HEAT_AVOID
    );
    const pool = safe.length > 0 ? safe : candidates;

    let pick = null;
    for (const c of pool) {
      if (c.gpu.active === req.prefix) {
        pick = c;
        break;
      }
    }
    if (!pick) {
      for (const c of pool) {
        if (!pick || c.gpu.heat < pick.gpu.heat) pick = c;
      }
    }
    acts.push({ type: 'assign', requestId: req.id, gpu: pick.g, slot: pick.slot });
  }
  return acts;
}

function runGame(seed, bot) {
  const s = createGame(seed);
  let ticks = 0;
  while (s.phase !== 'over' && s.level < MAX_LEVEL && ticks < TICK_CAP) {
    // The idle bot never leaves the upgrade phase, where the world is
    // frozen; break early instead of stepping to the tick cap.
    if (bot === 'idle' && s.phase === 'upgrade') break;
    step(s, bot === 'greedy' ? greedyActions(s) : []);
    ticks += 1;
  }
  return { level: s.level, score: s.score };
}

function percentile(values, p) {
  const v = [...values].sort((a, b) => a - b);
  const idx = p * (v.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return v[lo];
  return v[lo] + (idx - lo) * (v[hi] - v[lo]);
}

function summarize(bot) {
  const levels = [];
  const scores = [];
  for (let seed = 0; seed < SEEDS; seed++) {
    const r = runGame(seed, bot);
    levels.push(r.level);
    scores.push(r.score);
  }
  return {
    bot,
    n: SEEDS,
    level: { median: percentile(levels, 0.5), p90: percentile(levels, 0.9) },
    score: { median: percentile(scores, 0.5), p90: percentile(scores, 0.9) },
  };
}

function fmt(x) {
  return Number.isInteger(x) ? String(x) : x.toFixed(1);
}

const t0 = Date.now();
for (const bot of ['idle', 'greedy']) {
  const r = summarize(bot);
  console.log(`${r.bot.padEnd(7)} n=${r.n}`);
  console.log(
    `        level: median ${fmt(r.level.median)}  p90 ${fmt(r.level.p90)}`
  );
  console.log(
    `        score: median ${fmt(r.score.median)}  p90 ${fmt(r.score.p90)}`
  );
}
console.log(`(${((Date.now() - t0) / 1000).toFixed(1)}s)`);
