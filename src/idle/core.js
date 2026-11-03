// Idle game rules. Pure: no DOM, Date, performance, localStorage or Math.random.
// Table values come from ./data.js. Invalid arguments are ignored and never throw.
import {
  GENERATORS,
  COST_GROWTH,
  DOUBLING_THRESHOLDS,
  UPGRADES,
  WEIGHT_UPGRADES,
  MANAGERS,
  REMOVED_UPGRADES,
  PRESTIGE_DIVISOR,
  OFFLINE_CAP_HOURS,
  OFFLINE_RATE,
  RUSH_COOLDOWN_SECONDS,
  RUSH_MAX_SECONDS,
  RUSH_SCORE_DIVISOR,
  WEIGHT_BONUS_PER_WEIGHT,
  CONTINUOUS_CYCLE_MAX,
  SAVE_VERSION,
} from './data.js';

// --- state -------------------------------------------------------------------

export function createState() {
  const generators = {};
  const cycles = {};
  for (const g of GENERATORS) {
    generators[g.id] = 0;
    cycles[g.id] = null;
  }
  return {
    version: SAVE_VERSION,
    tokens: 0,
    lifetime: 0,
    totalLifetime: 0,
    weights: 0,
    weightsEarnedThisCycle: 0,
    generators,
    upgrades: [],
    weightUpgrades: [],
    managers: [],
    cycles,
    rushCooldownUntil: null,
  };
}

// --- helpers -------------------------------------------------------------------

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function validState(state) {
  return (
    state !== null &&
    typeof state === 'object' &&
    typeof state.tokens === 'number' &&
    state.generators !== null &&
    typeof state.generators === 'object'
  );
}

function hasWeightUpgrade(state, id) {
  return Array.isArray(state.weightUpgrades) && state.weightUpgrades.includes(id);
}

function upgradeSum(state, kind) {
  let total = 0;
  for (const u of UPGRADES) {
    if (u.kind === kind && state.upgrades.includes(u.id)) total += u.value;
  }
  return total;
}

function weightUpgradeSum(state, kind) {
  let total = 0;
  for (const wu of WEIGHT_UPGRADES) {
    if (wu.kind === kind && hasWeightUpgrade(state, wu.id)) total += wu.value;
  }
  return total;
}

function cacheRate(state) {
  return upgradeSum(state, 'cacheRate') + weightUpgradeSum(state, 'cacheRate');
}

// Global production multiplier (kind 'production'). Per-tier multipliers
// (kind 'productionTier') are applied per row in tierMultiplier().
function productionMultiplier(state) {
  let m = 1;
  for (const u of UPGRADES) {
    if (u.kind === 'production' && state.upgrades.includes(u.id)) m *= u.value;
  }
  return m;
}

function tierMultiplier(state, g) {
  let m = 1;
  for (const u of UPGRADES) {
    if (u.kind === 'productionTier' && u.tier === g.id && state.upgrades.includes(u.id)) m *= u.value;
  }
  return m;
}

function weightBonusPer(state) {
  return WEIGHT_BONUS_PER_WEIGHT + weightUpgradeSum(state, 'weightBonus');
}

// Speed factor: milestones halve the cycle time (x2 each).
function speedFactor(owned) {
  let f = 1;
  for (const t of DOUBLING_THRESHOLDS) {
    if (owned >= t) f *= 2;
  }
  return f;
}

// Multipliers shared by every row: cache rate, weight bonus (based on
// weightsEarnedThisCycle, not total weights, so prestige resets the bonus
// to 0.1 * weightsEarnedThisCycle) and global production.
function rateMultiplier(state) {
  return (
    (1 + cacheRate(state)) *
    (1 + weightBonusPer(state) * (state.weightsEarnedThisCycle || 0)) *
    productionMultiplier(state)
  );
}

// The steady-state rate of a row: what a managed row pays per second.
// Equals the old continuous rate, so existing balance holds.
function rowRate(state, g) {
  const owned = state.generators[g.id] || 0;
  return owned * g.tps * speedFactor(owned) * tierMultiplier(state, g) * rateMultiplier(state);
}

// The lump a cycle pays: owned * tps * cycleSeconds * multipliers.
function cyclePayout(state, g) {
  const owned = state.generators[g.id] || 0;
  return owned * g.tps * g.cycleSeconds * tierMultiplier(state, g) * rateMultiplier(state);
}

// Cycle time in seconds; milestones halve it (speed x2).
function cycleTime(state, g) {
  const owned = state.generators[g.id] || 0;
  return g.cycleSeconds / speedFactor(owned);
}

function hasManager(state, id) {
  return Array.isArray(state.managers) && state.managers.includes(id);
}

function addTokens(state, amount) {
  if (!isFiniteNumber(amount) || amount <= 0) return;
  state.tokens += amount;
  state.lifetime += amount;
  state.totalLifetime += amount;
}

// --- public API ----------------------------------------------------------------

export function tokensPerSecond(state) {
  if (!validState(state)) return 0;
  let sum = 0;
  for (const g of GENERATORS) sum += rowRate(state, g);
  return sum;
}

// Advance the game by `seconds`.
//
// Each row with owned > 0 runs cycles: a cycle takes cycleSeconds (halved by
// milestones) and pays owned * tps * cycleSeconds * multipliers in one lump at
// the end.
// - Without a manager: the row runs one cycle per tap (runRow) and then stops.
// - With a manager: the row restarts itself forever (it starts on its own).
// - A cycle under CONTINUOUS_CYCLE_MAX seconds is continuous: the bar shows
//   full and the row pays every tick.
// - A row with 0 owned cannot run.
export function tick(state, seconds) {
  if (!validState(state) || !isFiniteNumber(seconds) || seconds <= 0) return state;
  for (const g of GENERATORS) {
    const owned = state.generators[g.id] || 0;
    if (owned <= 0) continue;
    const ct = cycleTime(state, g);
    if (ct < CONTINUOUS_CYCLE_MAX) {
      addTokens(state, rowRate(state, g) * seconds);
      state.cycles[g.id] = ct; // bar shows full
      continue;
    }
    let progress = state.cycles[g.id];
    if (progress === null || progress === undefined) {
      if (!hasManager(state, g.id)) continue; // unmanaged: wait for a tap
      progress = 0; // a managed row restarts itself forever
    }
    if (!isFiniteNumber(progress) || progress < 0) progress = 0; // tolerate bad saves
    progress += seconds;
    const payout = cyclePayout(state, g);
    const managed = hasManager(state, g.id);
    let guard = 0;
    while (progress >= ct && guard++ < 100000) {
      addTokens(state, payout);
      progress -= ct;
      if (!managed) {
        progress = null; // an unmanaged row stops after one cycle
        break;
      }
    }
    state.cycles[g.id] = progress;
  }
  return state;
}

// Tap a row's icon: start one cycle. A row with 0 owned cannot run; tapping
// a running row does nothing. Returns true when a cycle was started.
export function runRow(state, id) {
  if (!validState(state)) return false;
  const g = GENERATORS.find((x) => x.id === id);
  if (!g) return false;
  if ((state.generators[g.id] || 0) <= 0) return false;
  if (state.cycles[g.id] !== null && state.cycles[g.id] !== undefined) return false;
  state.cycles[g.id] = 0;
  return true;
}

// Buy a manager with tokens. One per generator; resets on prestige.
export function buyManager(state, id) {
  if (!validState(state)) return false;
  const m = MANAGERS.find((x) => x.id === id);
  if (!m || hasManager(state, id)) return false;
  if (state.tokens < m.cost) return false;
  state.tokens -= m.cost;
  state.managers.push(id);
  return true;
}

// Migrate a saved state (the raw parsed object) to the current save version.
// v1 -> v2: keeps tokens, lifetime, generators, weights and weight upgrades;
// refunds removed upgrades at their cost; drops heat/overclock; ignores
// unknown fields. Never mutates the input; never throws.
export function migrate(saveState) {
  const s = createState();
  if (saveState === null || typeof saveState !== 'object' || Array.isArray(saveState)) return s;
  const refund = (typeof saveState.version === 'number' ? saveState.version : 1) < SAVE_VERSION;
  const num = (k) => {
    const v = saveState[k];
    return isFiniteNumber(v) ? v : s[k];
  };
  s.tokens = num('tokens');
  s.lifetime = num('lifetime');
  s.totalLifetime = num('totalLifetime');
  s.weights = num('weights');
  s.weightsEarnedThisCycle = num('weightsEarnedThisCycle');
  if (saveState.generators !== null && typeof saveState.generators === 'object' && !Array.isArray(saveState.generators)) {
    for (const id of Object.keys(s.generators)) {
      const v = saveState.generators[id];
      if (isFiniteNumber(v) && v >= 0) s.generators[id] = Math.floor(v);
    }
  }
  if (Array.isArray(saveState.upgrades)) {
    for (const id of saveState.upgrades) {
      if (typeof id !== 'string' || s.upgrades.includes(id)) continue;
      const removed = REMOVED_UPGRADES.find((u) => u.id === id);
      if (removed && refund) {
        s.tokens += removed.cost;
      } else if (UPGRADES.some((u) => u.id === id)) {
        s.upgrades.push(id);
      }
    }
  }
  if (Array.isArray(saveState.weightUpgrades)) {
    s.weightUpgrades = saveState.weightUpgrades.filter(
      (x) => typeof x === 'string' && WEIGHT_UPGRADES.some((u) => u.id === x)
    );
  }
  if (Array.isArray(saveState.managers)) {
    s.managers = saveState.managers.filter(
      (x) => typeof x === 'string' && MANAGERS.some((m) => m.id === x)
    );
  }
  s.rushCooldownUntil =
    isFiniteNumber(saveState.rushCooldownUntil) ? saveState.rushCooldownUntil : null;
  return s;
}

// SERVE / click left the game; kept as a no-op so the UI does not break
// before the UI pass.
export function click(state) {
  return 0;
}

// Heat and overclock left the game; kept as a no-op for the UI.
export function setOverclock(state, on) {}

export function cost(state, id, max = 1) {
  if (!validState(state) || !isFiniteNumber(max) || max < 1) return Infinity;
  const g = GENERATORS.find((x) => x.id === id);
  if (!g) return Infinity;
  const owned = state.generators[id] || 0;
  let total = 0;
  for (let i = 0; i < max; i++) {
    total += g.baseCost * Math.pow(COST_GROWTH, owned + i);
  }
  return total;
}

export function buy(state, id, max = 1) {
  if (!validState(state) || !isFiniteNumber(max) || max < 1) return 0;
  const g = GENERATORS.find((x) => x.id === id);
  if (!g) return 0;
  let bought = 0;
  while (bought < max) {
    const c = cost(state, id, 1);
    if (!Number.isFinite(c) || state.tokens < c) break;
    state.tokens -= c;
    state.generators[id] += 1;
    bought++;
  }
  return bought;
}

export function buyUpgrade(state, id) {
  if (!validState(state)) return false;
  const u = UPGRADES.find((x) => x.id === id);
  if (!u || state.upgrades.includes(id)) return false;
  if (state.tokens < u.cost) return false;
  state.tokens -= u.cost;
  state.upgrades.push(id);
  return true;
}

// Procurement Bot: buy every affordable upgrade, cheapest first, until one
// is unaffordable. Returns how many were bought.
export function buyAllUpgrades(state) {
  if (!validState(state)) return 0;
  let bought = 0;
  let again = true;
  while (again) {
    again = false;
    const sorted = UPGRADES.filter((u) => !state.upgrades.includes(u.id)).sort((a, b) => a.cost - b.cost);
    for (const u of sorted) {
      if (state.tokens >= u.cost) {
        state.tokens -= u.cost;
        state.upgrades.push(u.id);
        bought++;
        again = true;
      }
    }
  }
  return bought;
}

export function buyWeightUpgrade(state, id) {
  if (!validState(state)) return false;
  const wu = WEIGHT_UPGRADES.find((x) => x.id === id);
  if (!wu || hasWeightUpgrade(state, id)) return false;
  if (state.weights < wu.cost) return false;
  state.weights -= wu.cost;
  state.weightUpgrades.push(id);
  return true;
}

export function weightsAvailable(state) {
  if (!validState(state)) return 0;
  return Math.floor(Math.sqrt(Math.max(0, state.totalLifetime || 0) / PRESTIGE_DIVISOR)) - (state.weightsEarnedThisCycle || 0);
}

export function prestige(state) {
  if (!validState(state)) return 0;
  const gained = weightsAvailable(state);
  if (gained < 1) return 0;
  const seed = WEIGHT_UPGRADES.find((u) => u.id === 'seed');
  const startTokens = hasWeightUpgrade(state, 'seed') ? seed.value : 0;
  state.weights += gained;
  state.weightsEarnedThisCycle = Math.floor(
    Math.sqrt(Math.max(0, state.totalLifetime || 0) / PRESTIGE_DIVISOR)
  );
  state.tokens = startTokens;
  state.lifetime = 0;
  for (const g of GENERATORS) {
    state.generators[g.id] = 0;
    state.cycles[g.id] = null;
  }
  state.upgrades = [];
  // Managers reset like regular upgrades; Standing Orders re-hires the
  // Cron Job at the start of each run.
  state.managers = hasWeightUpgrade(state, 'auto') ? ['pi'] : [];
  // Kept: weights, weightUpgrades, totalLifetime, rushCooldownUntil.
  return gained;
}

// Offline earnings: rate * min(seconds, cap hours) * offline rate.
// Counts only managed rows.
export function applyOffline(state, seconds) {
  if (!validState(state) || !isFiniteNumber(seconds) || seconds < 0) return 0;
  const long = WEIGHT_UPGRADES.find((u) => u.id === 'long');
  const capHours = hasWeightUpgrade(state, 'long') ? long.value : OFFLINE_CAP_HOURS;
  const capped = Math.min(seconds, capHours * 3600);
  if (capped <= 0) return 0;
  const night = WEIGHT_UPGRADES.find((u) => u.id === 'night');
  let rate = 0;
  for (const g of GENERATORS) {
    if (hasManager(state, g.id)) rate += rowRate(state, g);
  }
  const offlineRate = hasWeightUpgrade(state, 'night') ? night.value : OFFLINE_RATE;
  const earned = rate * capped * offlineRate;
  addTokens(state, earned);
  return earned;
}

export function applyRush(state, score, now) {
  if (!validState(state)) return 0;
  const scoreN = isFiniteNumber(score) && score > 0 ? score : 0;
  const nowN = isFiniteNumber(now) ? now : null;
  if (state.rushCooldownUntil !== null && nowN !== null && nowN < state.rushCooldownUntil) return 0;
  if (scoreN <= 0) return 0;
  const seconds = Math.min(RUSH_MAX_SECONDS, scoreN / RUSH_SCORE_DIVISOR);
  const earned = tokensPerSecond(state) * seconds;
  addTokens(state, earned);
  if (nowN !== null) state.rushCooldownUntil = nowN + RUSH_COOLDOWN_SECONDS;
  return earned;
}
