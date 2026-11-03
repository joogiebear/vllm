// Headless pacing check: simulates a bot playing the idle game and reports
// the pacing targets from docs/IDLE-DESIGN.md.
// Run: node tools/idle-balance.js
//
// Bot (per the design): buys whatever gives the best output per cost, buys
// every upgrade it can afford, does not click, never overclocks, and
// prestiges when weights available reach max(5, 0.5 * current weights).
import {
  createState, tick, click, buy, buyUpgrade, buyWeightUpgrade, prestige,
  cost, weightsAvailable,
} from '../src/idle/core.js';
import {
  GENERATORS, UPGRADES, WEIGHT_UPGRADES, DOUBLING_THRESHOLDS,
} from '../src/idle/data.js';

const DT = 1; // seconds per step
const START_CLICKS = 20; // the design gives 20 clicks at the start
const MAX_MINUTES = 150; // long enough for four resets

// Output per cost of the next unit of a generator.
function outputPerCost(state, g) {
  const c = cost(state, g.id, 1);
  if (c <= 0) return 0;
  const owned = state.generators[g.id];
  let mult = 1;
  for (const t of DOUBLING_THRESHOLDS) if (owned >= t) mult *= 2;
  return (g.tps * mult) / c;
}

function botStep(state) {
  // Buy the best output-per-cost generator, repeatedly, while affordable.
  let bought = true;
  while (bought) {
    bought = false;
    let best = null;
    let bestRatio = 0;
    for (const g of GENERATORS) {
      const c = cost(state, g.id, 1);
      if (c > 0 && c <= state.tokens) {
        const r = outputPerCost(state, g);
        if (r > bestRatio) {
          bestRatio = r;
          best = g;
        }
      }
    }
    if (best) {
      buy(state, best.id, 1);
      bought = true;
    }
  }
  // Buy every upgrade it can afford.
  for (const u of UPGRADES) {
    if (!state.upgrades.includes(u.id) && state.tokens >= u.cost) buyUpgrade(state, u.id);
  }
  for (const w of WEIGHT_UPGRADES) {
    if (!state.weightUpgrades.includes(w.id) && state.weights >= w.cost) buyWeightUpgrade(state, w.id);
  }
}

function fmtTime(seconds) {
  if (seconds === null) return 'never';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

const state = createState();
for (let i = 0; i < START_CLICKS; i++) click(state);

let tFirstGen = null;
let tSecondTier = null;
let tPrestige = null;
const resets = []; // the first 4 resets: { t, gained, duration }
let runStart = 0;
const steps = MAX_MINUTES * 60;
for (let s = 1; s <= steps; s++) {
  const t = s * DT;
  botStep(state);
  tick(state, DT);
  if (tFirstGen === null && Object.values(state.generators).some((n) => n > 0)) tFirstGen = t;
  if (tSecondTier === null && state.lifetime >= GENERATORS[1].baseCost * 0.5) tSecondTier = t;
  if (tPrestige === null && weightsAvailable(state) >= 1) tPrestige = t;
  // Keep playing through prestiges: reset when weights available reach
  // max(5, 0.5 * current weights).
  if (resets.length < 4 && weightsAvailable(state) >= Math.max(5, 0.5 * state.weights)) {
    const gained = prestige(state);
    resets.push({ t, gained, duration: t - runStart });
    runStart = t;
  }
  if (tFirstGen !== null && tSecondTier !== null && tPrestige !== null && resets.length >= 4) break;
}

const durations = resets.map((r) => r.duration);
const gettingFaster =
  resets.length === 4 && durations.every((d, i) => i === 0 || d < durations[i - 1]);
const results = [
  {
    name: 'first generator',
    got: tFirstGen,
    ok: tFirstGen !== null && tFirstGen < 30,
    target: 'under 30 s (20 clicks at start)',
  },
  {
    name: 'second generator tier unlocked',
    got: tSecondTier,
    ok: tSecondTier !== null && tSecondTier < 180,
    target: 'under 3 minutes',
  },
  {
    name: 'first prestige available',
    got: tPrestige,
    ok: tPrestige !== null && tPrestige >= 20 * 60 && tPrestige <= 40 * 60,
    target: '20 to 40 minutes',
  },
  {
    name: 'each later run reaches its reset faster than the one before',
    got: durations.map(fmtTime).join(' > ') || 'n/a',
    ok: gettingFaster,
    target: 'strictly decreasing run durations (4 resets)',
  },
];

console.log('Pacing check (bot: best output/cost, all affordable upgrades,');
console.log('no clicks, no overclock, prestige at max(5, 0.5 * weights))');
let allPass = true;
for (const r of results) {
  const pass = r.ok ? 'PASS' : 'FAIL';
  if (!r.ok) allPass = false;
  const got = typeof r.got === 'number' ? fmtTime(r.got) : r.got;
  console.log(`  ${r.name}: ${got} (target: ${r.target}) ${pass}`);
}
for (const [i, r] of resets.entries()) {
  console.log(`  reset ${i + 1}: at ${fmtTime(r.t)}, +${r.gained} weights, run took ${fmtTime(r.duration)}`);
}
console.log(
  `  final: totalLifetime=${state.totalLifetime.toExponential(3)} weights=${state.weights} ` +
    `upgrades=${state.upgrades.length} weightUpgrades=${state.weightUpgrades.length}`
);
process.exitCode = allPass ? 0 : 1;
