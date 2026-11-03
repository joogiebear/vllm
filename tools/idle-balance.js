// Headless pacing check for the cycle rules. Runs two bots:
// - "active": every tick, runs every unmanaged row that is idle (a player
//   tapping), buys a manager as soon as it is affordable, then the best
//   generator per cost, then any affordable upgrade.
// - "idle": the same, but it runs unmanaged rows only once every 60 seconds
//   (a player who checks in now and then).
// Both prestige when weights available reach max(5, 0.5 * current weights) and
// buy every weight upgrade they can afford.
// Run: node tools/idle-balance.js
import {
  createState, tick, runRow, buyManager, buy, buyUpgrade,
  buyWeightUpgrade, prestige, cost, weightsAvailable,
} from '../src/idle/core.js';
import {
  GENERATORS, UPGRADES, WEIGHT_UPGRADES, MANAGERS, DOUBLING_THRESHOLDS,
} from '../src/idle/data.js';

const DT = 1; // seconds per step
const START_TOKENS = 20; // the old game's 20 clicks; clicks are now a no-op
const IDLE_CHECK_SECONDS = 60; // the idle bot checks in every 60 s
const MAX_MINUTES = 720; // long enough for four resets
const FOUR_LOWEST = ['pi', 'gamer', 'workstation', 'rack'];

// Steady-state speed factor: milestones halve the cycle time (x2 each).
function speedFactor(owned) {
  let f = 1;
  for (const t of DOUBLING_THRESHOLDS) if (owned >= t) f *= 2;
  return f;
}

// Output per cost of the next unit of a generator (steady-state rate / cost).
function outputPerCost(state, g) {
  const c = cost(state, g.id, 1);
  if (c <= 0) return 0;
  const owned = state.generators[g.id];
  return (g.tps * speedFactor(owned)) / c;
}

function botStep(state, isIdle, stepIndex) {
  // 1. Run idle unmanaged rows (active: every tick; idle: once per 60 s).
  const shouldTap = !isIdle || (stepIndex - 1) % IDLE_CHECK_SECONDS === 0;
  if (shouldTap) {
    for (const g of GENERATORS) {
      if ((state.generators[g.id] || 0) > 0 && !state.managers.includes(g.id)) {
        runRow(state, g.id);
      }
    }
  }
  // 2. Buy a manager as soon as one is affordable (cheapest unowned it can).
  const unowned = MANAGERS.filter((m) => !state.managers.includes(m.id))
    .sort((a, b) => a.cost - b.cost);
  for (const m of unowned) {
    if (state.tokens >= m.cost) { buyManager(state, m.id); break; }
  }
  // 3. Buy the best generator per cost, repeatedly, while affordable.
  let bought = true;
  while (bought) {
    bought = false;
    let best = null;
    let bestRatio = 0;
    for (const g of GENERATORS) {
      const c = cost(state, g.id, 1);
      if (c > 0 && c <= state.tokens) {
        const r = outputPerCost(state, g);
        if (r > bestRatio) { bestRatio = r; best = g; }
      }
    }
    if (best) { buy(state, best.id, 1); bought = true; }
  }
  // 4. Buy any affordable upgrade.
  for (const u of UPGRADES) {
    if (!state.upgrades.includes(u.id) && state.tokens >= u.cost) buyUpgrade(state, u.id);
  }
}

// Buy every weight upgrade the bot can afford. Simulates the documented seed
// fix (docs/DECISIONS.md): buying the seed grants its start tokens
// immediately, so the run that buys it can continue. (This copy of core.js
// only grants them at prestige time, which would deadlock the run.)
function buyWeightUpgrades(state) {
  for (const w of WEIGHT_UPGRADES) {
    if (!state.weightUpgrades.includes(w.id) && state.weights >= w.cost) {
      if (buyWeightUpgrade(state, w.id) && w.id === 'seed') state.tokens += w.value;
    }
  }
}

function simulate(isIdle) {
  const state = createState();
  state.tokens = START_TOKENS;
  let tFirstManager = null;
  let tFourManagers = null;
  let tPrestigeAvail = null;
  const resets = [];
  let runStart = 0;
  const steps = MAX_MINUTES * 60;
  for (let s = 1; s <= steps; s++) {
    const t = s * DT;
    botStep(state, isIdle, s);
    tick(state, DT);
    if (tFirstManager === null && state.managers.length >= 1) tFirstManager = t;
    if (tFourManagers === null && FOUR_LOWEST.every((id) => state.managers.includes(id))) tFourManagers = t;
    if (tPrestigeAvail === null && weightsAvailable(state) >= 1) tPrestigeAvail = t;
    if (resets.length < 4 && weightsAvailable(state) >= Math.max(5, 0.5 * state.weights)) {
      prestige(state);
      buyWeightUpgrades(state);
      resets.push({ t, duration: t - runStart });
      runStart = t;
    }
    if (tFirstManager !== null && tFourManagers !== null && tPrestigeAvail !== null && resets.length >= 4) break;
  }
  return { state, tFirstManager, tFourManagers, tPrestigeAvail, resets };
}

function fmtTime(seconds) {
  if (seconds === null) return 'never';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

const active = simulate(false);
const idle = simulate(true);

function report(name, r) {
  console.log(`\n${name} bot:`);
  console.log(`  first manager:             ${fmtTime(r.tFirstManager)}`);
  console.log(`  all 4 lowest managers:     ${fmtTime(r.tFourManagers)}`);
  console.log(`  first prestige available:  ${fmtTime(r.tPrestigeAvail)}`);
  for (let i = 0; i < r.resets.length; i++) {
    console.log(`  reset ${i + 1}: at ${fmtTime(r.resets[i].t)}, run took ${fmtTime(r.resets[i].duration)}`);
  }
}
report('active', active);
report('idle', idle);

// Targets.
const aDurations = active.resets.map((r) => r.duration);
const gettingFaster =
  active.resets.length === 4 && aDurations.every((d, i) => i === 0 || d < aDurations[i - 1]);
const idleRatio =
  idle.tPrestigeAvail !== null && active.tPrestigeAvail !== null
    ? idle.tPrestigeAvail / active.tPrestigeAvail : Infinity;
const targets = [
  { name: 'active: first manager under 2 min', ok: active.tFirstManager !== null && active.tFirstManager < 120 },
  { name: 'active: first prestige in 20-40 min', ok: active.tPrestigeAvail !== null && active.tPrestigeAvail >= 1200 && active.tPrestigeAvail <= 2400 },
  { name: 'active: each later run faster', ok: gettingFaster },
  { name: 'idle: first prestige <= ~2x active', ok: idleRatio <= 2.0 },
];
console.log('\nTargets:');
let allPass = true;
for (const tg of targets) {
  if (!tg.ok) allPass = false;
  console.log(`  ${tg.name}: ${tg.ok ? 'PASS' : 'FAIL'}`);
}
console.log(`  (idle/active first-prestige ratio: ${idleRatio === Infinity ? 'n/a' : idleRatio.toFixed(2) + 'x'})`);
console.log(
  `\nfinal active: totalLifetime=${active.state.totalLifetime.toExponential(3)} ` +
  `weights=${active.state.weights} managers=${active.state.managers.length} ` +
  `upgrades=${active.state.upgrades.length} weightUpgrades=${active.state.weightUpgrades.length}`
);
process.exitCode = allPass ? 0 : 1;
