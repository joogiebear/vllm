// Headless pacing check for the cycle rules. Runs two bots:
// - "active": every tick, runs every unmanaged row that is idle (a player
//   tapping), buys a manager as soon as it is affordable, then the best
//   generator per cost, then any affordable upgrade.
// - "idle": the same, but it runs unmanaged rows only once every 60 seconds
//   (a player who checks in now and then).
// Both prestige when weights available reach max(5, 0.5 * current weights) and
// buy every weight upgrade they can afford.
// The active bot keeps playing through Regions (docs/REGIONS-DESIGN.md): it
// buys Region perks cheapest first, expands when a Region is available, and
// stops after its second expansion or after 12 simulated hours.
// Run: node tools/idle-balance.js
import {
  createState, tick, runRow, buyManager, buy, buyUpgrade,
  buyWeightUpgrade, prestige, cost, weightsAvailable,
  regionsAvailable, expandRegion, buyRegionPerk, claimEvent,
  tokensPerSecond,
} from '../src/idle/core.js';
import {
  GENERATORS, UPGRADES, WEIGHT_UPGRADES, MANAGERS, DOUBLING_THRESHOLDS,
  REGION_PERKS, PRESTIGE_DIVISOR, REGION_DIVISOR,
} from '../src/idle/data.js';
import { writeFileSync } from 'node:fs';

const DT = 1; // seconds per step
const START_TOKENS = 20; // the old game's 20 clicks; clicks are now a no-op
const IDLE_CHECK_SECONDS = 60; // the idle bot checks in every 60 s
const MAX_MINUTES = 720; // long enough for four resets (idle bot)
const MAX_HOURS = 12; // the active bot plays this long, or until its 2nd Region
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

// Buy Region perks with the bot's Region balance, cheapest first
// (docs/REGIONS-DESIGN.md). Perks are kept forever; spending Regions never
// lowers the x2-per-Region multiplier.
function buyRegionPerks(state) {
  let bought = true;
  while (bought) {
    bought = false;
    const unowned = REGION_PERKS.filter((p) => !state.regionPerks.includes(p.id))
      .sort((a, b) => a.cost - b.cost);
    for (const p of unowned) {
      if (state.regions >= p.cost) { buyRegionPerk(state, p.id); bought = true; }
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
  const expansions = [];
  let runStart = 0;
  const horizon = isIdle ? MAX_MINUTES * 60 : MAX_HOURS * 3600;
  const steps = Math.floor(horizon / DT);
  for (let s = 1; s <= steps; s++) {
    const t = s * DT;
    botStep(state, isIdle, s);
    tick(state, DT);
    if (tFirstManager === null && state.managers.length >= 1) tFirstManager = t;
    if (tFourManagers === null && FOUR_LOWEST.every((id) => state.managers.includes(id))) tFourManagers = t;
    if (tPrestigeAvail === null && weightsAvailable(state) >= 1) tPrestigeAvail = t;
    if (weightsAvailable(state) >= Math.max(5, 0.5 * state.weights)) {
      prestige(state);
      buyWeightUpgrades(state);
      if (resets.length < 4) resets.push({ t, duration: t - runStart });
      runStart = t;
    }
    // The active bot keeps playing through Regions (docs/REGIONS-DESIGN.md):
    // buy perks cheapest first, then expand when a Region is available.
    if (!isIdle) {
      buyRegionPerks(state);
      if (regionsAvailable(state) >= 1) {
        expandRegion(state);
        buyWeightUpgrades(state);
        expansions.push({ t, prestiges: state.stats.prestiges });
        runStart = t;
      }
    }
    if (isIdle && tFirstManager !== null && tFourManagers !== null && tPrestigeAvail !== null && resets.length >= 4) break;
    if (!isIdle && expansions.length >= 2) break;
  }
  return { state, tFirstManager, tFourManagers, tPrestigeAvail, resets, expansions };
}

function fmtTime(seconds) {
  if (seconds === null) return 'never';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// --- --late mode -------------------------------------------------------------
// The same active bot, played to 10 Regions or 200 simulated hours, whichever
// comes first. Step size: 1 s while something is affordable, otherwise a jump
// to the next affordability (capped at 1 h; 60 s when there is no production),
// so the run finishes in well under 3 minutes of real time. The bot buys
// managers, Region perks and weight upgrades as before and claims events when
// they appear. Records per-Region milestones and stalls (more than 20 simulated
// minutes without any purchase), writes docs/BALANCE-REPORT.md and prints the
// same table to the console.
function runLate() {
  const LATE_HOURS = 200;
  const LATE_REGIONS = 10;
  const STALL_SECONDS = 20 * 60;
  const horizon = LATE_HOURS * 3600;

  const state = createState();
  state.tokens = START_TOKENS;

  const anyAffordable = (s) => {
    for (const m of MANAGERS) if (!s.managers.includes(m.id) && s.tokens >= m.cost) return true;
    for (const g of GENERATORS) if (cost(s, g.id, 1) <= s.tokens) return true;
    for (const u of UPGRADES) if (!s.upgrades.includes(u.id) && s.tokens >= u.cost) return true;
    for (const w of WEIGHT_UPGRADES) if (!s.weightUpgrades.includes(w.id) && s.weights >= w.cost) return true;
    for (const p of REGION_PERKS) if (!s.regionPerks.includes(p.id) && s.regions >= p.cost) return true;
    return weightsAvailable(s) >= Math.max(5, 0.5 * s.weights)
      || regionsAvailable(s) >= 1
      || s.eventOffer !== null;
  };

  // Jump to the next affordability: the cheapest unowned token item, the next
  // prestige, the next Region, or the next event offer. Weights and the Region
  // balance only grow at prestige / expansion, so the weight-upgrade and
  // Region-perk delays are covered by those two.
  const bigStep = (s) => {
    const tps = tokensPerSecond(s);
    let best = Infinity;
    const consider = (c) => {
      if (c > s.tokens && tps > 0) best = Math.min(best, (c - s.tokens) / tps);
    };
    for (const m of MANAGERS) if (!s.managers.includes(m.id)) consider(m.cost);
    for (const g of GENERATORS) { const c = cost(s, g.id, 1); if (c > 0) consider(c); }
    for (const u of UPGRADES) if (!s.upgrades.includes(u.id)) consider(u.cost);
    const earned = s.weightsEarnedThisCycle || 0;
    const need = Math.max(5, 0.5 * s.weights);
    const curW = Math.floor(Math.sqrt(Math.max(0, s.totalLifetime) / PRESTIGE_DIVISOR));
    if (curW - earned < need && tps > 0) {
      best = Math.min(best, (PRESTIGE_DIVISOR * Math.pow(earned + need, 2) - s.totalLifetime) / tps);
    }
    const curR = Math.floor(Math.sqrt(Math.max(0, s.weightsEverEarned) / REGION_DIVISOR));
    if (curR < s.regionsEarned + 1 && tps > 0) {
      best = Math.min(best, (REGION_DIVISOR * Math.pow(s.regionsEarned + 1, 2) - s.totalLifetime) / tps);
    }
    if (!s.eventOffer && Number.isFinite(s.nextEventIn)) best = Math.min(best, s.nextEventIn);
    if (!Number.isFinite(best)) return 60; // no production: taps still pay
    return Math.min(3600, Math.max(1, Math.ceil(best)));
  };

  const fmtMoney = (v) =>
    v >= 1e9 ? (v / 1e9).toFixed(1) + 'B' : v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : String(Math.round(v));

  const waitingFor = (s) => {
    let best = null;
    for (const m of MANAGERS) if (!s.managers.includes(m.id) && (best === null || m.cost < best.cost)) best = { name: m.name, cost: m.cost };
    for (const g of GENERATORS) { const c = cost(s, g.id, 1); if (c > 0 && (best === null || c < best.cost)) best = { name: g.name, cost: c }; }
    for (const u of UPGRADES) if (!s.upgrades.includes(u.id) && (best === null || u.cost < best.cost)) best = { name: u.name, cost: u.cost };
    if (best) {
      const tps = tokensPerSecond(s);
      const secs = tps > 0 ? (best.cost - s.tokens) / tps : Infinity;
      return `tokens for ${best.name} (cost ${fmtMoney(best.cost)}, had ${fmtMoney(s.tokens)}${Number.isFinite(secs) ? `, ~${fmtTime(secs)} at current rate` : ', no production'})`;
    }
    const wa = weightsAvailable(s);
    if (wa < Math.max(5, 0.5 * s.weights)) return `prestige weights (${wa} of ${Math.max(5, 0.5 * s.weights)} available)`;
    if (regionsAvailable(s) < 1) return `a Region (needs ${fmtMoney(REGION_DIVISOR * Math.pow(s.regionsEarned + 1, 2))} total weights, has ${fmtMoney(s.weightsEverEarned)})`;
    return 'unknown';
  };

  const snapshot = (s) => {
    const owned = {};
    let highest = null;
    for (const g of GENERATORS) {
      owned[g.id] = s.generators[g.id] || 0;
      if (owned[g.id] > 0) highest = g.name;
    }
    return { highest, owned };
  };

  const regions = [];
  const stalls = [];
  let lastPurchaseT = 0;
  let openStall = null;
  let stallReason = null;
  let periodStartT = 0;
  let periodStartPrestiges = 0;
  let lastUpgradeT = null;
  let lastManagerT = null;
  let endedOnExpansion = false;

  const closeStall = (endT) => {
    if (openStall === null) return;
    stalls.push({ startT: openStall, endT, reason: stallReason });
    openStall = null;
    stallReason = null;
  };

  let t = 0;
  let stepIndex = 0;
  while (t < horizon && state.regionsEarned < LATE_REGIONS) {
    stepIndex += 1;
    endedOnExpansion = false;
    const gB = state.stats.generatorsBought;
    const mB = state.stats.managersHired;
    const uB = state.stats.upgradesBought;
    const wuB = state.weightUpgrades.length;
    const rpB = state.regionPerks.length;
    botStep(state, false, stepIndex);
    const purchased =
      state.stats.generatorsBought > gB || state.stats.managersHired > mB ||
      state.stats.upgradesBought > uB || state.weightUpgrades.length > wuB ||
      state.regionPerks.length > rpB;
    const step = anyAffordable(state) ? 1 : bigStep(state);
    tick(state, step);
    t += step;
    if (state.eventOffer) claimEvent(state);
    buyRegionPerks(state);
    // The expansion (like in the active bot) happens right after the prestige
    // that grants it, so the end of a Region's period is the run's peak just
    // before that prestige.
    if (weightsAvailable(state) >= Math.max(5, 0.5 * state.weights)) {
      const peak = snapshot(state);
      prestige(state);
      buyWeightUpgrades(state);
      if (regionsAvailable(state) >= 1) {
        // One row per Region number: an expansion can grant several at once.
        const gained = regionsAvailable(state);
        for (let i = 0; i < gained; i++) {
          regions.push({
            n: regions.length + 1,
            t: t,
            duration: i === 0 ? t - periodStartT : 0,
            prestiges: i === 0 ? state.stats.prestiges - periodStartPrestiges : 0,
            highest: peak.highest,
            owned: peak.owned,
            lastUpgradeT: lastUpgradeT,
            lastManagerT: lastManagerT,
          });
        }
        expandRegion(state);
        buyWeightUpgrades(state);
        periodStartT = t;
        periodStartPrestiges = state.stats.prestiges;
        lastUpgradeT = null;
        lastManagerT = null;
        endedOnExpansion = true;
      }
    }
    if (state.stats.upgradesBought > uB) lastUpgradeT = t;
    if (state.stats.managersHired > mB) lastManagerT = t;
    if (purchased) lastPurchaseT = t;
    if (openStall === null && t - lastPurchaseT > STALL_SECONDS) {
      openStall = lastPurchaseT;
      stallReason = waitingFor(state);
    }
    if (openStall !== null && purchased) closeStall(t);
  }
  closeStall(t);
  if (!endedOnExpansion && regions.length > 0) {
    // The run ended at the time cap: the last Region's period ends there.
    const last = regions[regions.length - 1];
    const endSnap = snapshot(state);
    last.highest = endSnap.highest;
    last.owned = endSnap.owned;
    last.lastUpgradeT = lastUpgradeT;
    last.lastManagerT = lastManagerT;
  }

  // Report: a short table plus the stall list, written and printed.
  const lines = [];
  lines.push('# Late-game balance run');
  lines.push('');
  lines.push(`Active bot played to ${LATE_REGIONS} Regions or ${LATE_HOURS} simulated hours (whichever comes first).`);
  lines.push(`Finished at ${fmtTime(t)} with ${state.regionsEarned} Regions, ${state.stats.prestiges} prestiges, ${state.stats.eventsClaimed} events claimed.`);
  lines.push('');
  lines.push('| Region | Reached | Took | Prestiges | Highest tier (end) | Last upgrade | Last manager |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const r of regions) {
    lines.push(`| ${r.n} | ${fmtTime(r.t)} | ${fmtTime(r.duration)} | ${r.prestiges} | ${r.highest || 'none'} | ${r.lastUpgradeT === null ? 'none' : fmtTime(r.lastUpgradeT)} | ${r.lastManagerT === null ? 'none' : fmtTime(r.lastManagerT)} |`);
  }
  lines.push('');
  lines.push('Owned counts per tier at the end of each Region:');
  for (const r of regions) {
    const parts = GENERATORS.filter((g) => (r.owned[g.id] || 0) > 0)
      .map((g) => `${g.id} ${r.owned[g.id]}`);
    lines.push(`- Region ${r.n}: ${parts.length > 0 ? parts.join(', ') : 'none'}`);
  }
  lines.push('');
  lines.push(`Stalls (more than ${STALL_SECONDS / 60} simulated minutes without any purchase):`);
  if (stalls.length === 0) {
    lines.push('- none');
  } else {
    for (const st of stalls) {
      lines.push(`- ${fmtTime(st.startT)} -> ${fmtTime(st.endT)} (${fmtTime(st.endT - st.startT)}): waiting for ${st.reason}`);
    }
  }
  const report = lines.join('\n') + '\n';
  writeFileSync('docs/BALANCE-REPORT.md', report);
  console.log(report);
}

if (process.argv.includes('--late')) {
  runLate();
  process.exit(0);
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
  for (let i = 0; i < r.expansions.length; i++) {
    const e = r.expansions[i];
    const prevT = i === 0 ? 0 : r.expansions[i - 1].t;
    const prevP = i === 0 ? 0 : r.expansions[i - 1].prestiges;
    console.log(`  Region ${i + 1}: at ${fmtTime(e.t)}, ${fmtTime(e.t - prevT)} after the previous, ${e.prestiges - prevP} prestiges in between`);
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
  { name: 'active: first Region in 3-5 hours', ok: active.expansions.length >= 1 && active.expansions[0].t >= 3 * 3600 && active.expansions[0].t <= 5 * 3600 },
  { name: 'active: second Region noticeably faster than the first', ok: active.expansions.length === 2 && (active.expansions[1].t - active.expansions[0].t) < active.expansions[0].t },
];
console.log('\nTargets:');
let allPass = true;
for (const tg of targets) {
  if (!tg.ok) allPass = false;
  console.log(`  ${tg.name}: ${tg.ok ? 'PASS' : 'FAIL'}`);
}
const regionRatio =
  active.expansions.length === 2
    ? (active.expansions[1].t - active.expansions[0].t) / active.expansions[0].t
    : Infinity;
console.log(`  (idle/active first-prestige ratio: ${idleRatio === Infinity ? 'n/a' : idleRatio.toFixed(2) + 'x'})`);
console.log(`  (second/first Region duration ratio: ${regionRatio === Infinity ? 'n/a' : regionRatio.toFixed(2) + 'x'})`);
console.log(
  `\nfinal active: totalLifetime=${active.state.totalLifetime.toExponential(3)} ` +
  `weights=${active.state.weights} managers=${active.state.managers.length} ` +
  `upgrades=${active.state.upgrades.length} weightUpgrades=${active.state.weightUpgrades.length} ` +
  `regionsEarned=${active.state.regionsEarned} regionPerks=${active.state.regionPerks.length}`
);
process.exitCode = allPass ? 0 : 1;
