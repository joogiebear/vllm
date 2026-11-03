// Idle game rules. Pure: no DOM, Date, performance, localStorage or Math.random.
// Table values come from ./data.js. Invalid arguments are ignored and never throw.
import {
  GENERATORS,
  COST_GROWTH,
  DOUBLING_THRESHOLDS,
  UPGRADES,
  WEIGHT_UPGRADES,
  PRESTIGE_DIVISOR,
  OFFLINE_CAP_HOURS,
  OFFLINE_RATE,
  RUSH_COOLDOWN_SECONDS,
  RUSH_MAX_SECONDS,
  RUSH_SCORE_DIVISOR,
  HEAT_MAX,
  HEAT_THROTTLE_OFF,
  OVERCLOCK_HEAT_RATE,
  COOL_RATE,
  OVERCLOCK_FACTOR,
  THROTTLE_FACTOR,
  WEIGHT_BONUS_PER_WEIGHT,
  AUTO_HEAT_LIMIT,
  AUTO_REON_HEAT,
  SAVE_VERSION,
} from './data.js';

// --- state -------------------------------------------------------------------

export function createState() {
  const generators = {};
  for (const g of GENERATORS) generators[g.id] = 0;
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
    heat: 0,
    overclock: false,
    throttled: false,
    autoPause: false,
    rushCooldownUntil: null,
  };
}

// --- internal helpers ----------------------------------------------------------

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function validState(state) {
  return state !== null && typeof state === 'object';
}

function hasWeightUpgrade(state, id) {
  return state.weightUpgrades.includes(id);
}

function upgradeSum(state, kind) {
  let total = 0;
  for (const u of UPGRADES) if (u.kind === kind && state.upgrades.includes(u.id)) total += u.value;
  return total;
}

function weightUpgradeSum(state, kind) {
  let total = 0;
  for (const u of WEIGHT_UPGRADES) if (u.kind === kind && state.weightUpgrades.includes(u.id)) total += u.value;
  return total;
}

function cacheRate(state) {
  return upgradeSum(state, 'cacheRate') + weightUpgradeSum(state, 'cacheRate');
}

function cooling(state) {
  return upgradeSum(state, 'cooling');
}

function clickFlat(state) {
  return upgradeSum(state, 'clickFlat');
}

function clickShare(state) {
  return upgradeSum(state, 'clickShare');
}

function productionMultiplier(state) {
  let m = 1;
  for (const u of UPGRADES) if (u.kind === 'production' && state.upgrades.includes(u.id)) m *= u.value;
  return m;
}

function weightBonusPer(state) {
  for (const u of WEIGHT_UPGRADES) {
    if (u.kind === 'weightBonus' && state.weightUpgrades.includes(u.id)) return u.value;
  }
  return WEIGHT_BONUS_PER_WEIGHT;
}

function generatorOutput(state, g) {
  const owned = state.generators[g.id] || 0;
  let mult = 1;
  for (const t of DOUBLING_THRESHOLDS) if (owned >= t) mult *= 2;
  return owned * g.tps * mult;
}

// Production with heatFactor forced to 1 (overclock and throttle ignored).
function baseRate(state) {
  let sum = 0;
  for (const g of GENERATORS) sum += generatorOutput(state, g);
  return (
    sum *
    (1 + cacheRate(state)) *
    (1 + weightBonusPer(state) * (state.weights || 0)) *
    productionMultiplier(state)
  );
}

function effectiveOverclock(state) {
  if (state.throttled) return false;
  if (!state.overclock) return false;
  if (hasWeightUpgrade(state, 'auto') && state.autoPause) return false;
  return true;
}

function heatFactor(state) {
  if (state.throttled) return THROTTLE_FACTOR;
  if (effectiveOverclock(state)) return OVERCLOCK_FACTOR;
  return 1;
}

function addTokens(state, earned) {
  if (earned > 0) {
    state.tokens += earned;
    state.lifetime += earned;
    state.totalLifetime += earned;
  }
}

// --- heat simulation -----------------------------------------------------------
// Heat is piecewise linear, so a tick is split exactly at the moments heat
// crosses 100 (throttle on, overclock off), 40 (throttle off / auto re-on) and
// 95 (auto off). The result is therefore independent of the step size.

function normalizeAuto(state) {
  if (!hasWeightUpgrade(state, 'auto') || !state.overclock || state.throttled) return;
  if (state.heat >= AUTO_HEAT_LIMIT) state.autoPause = true;
  else if (state.autoPause && state.heat <= AUTO_REON_HEAT) state.autoPause = false;
}

function applyHeatBoundary(state) {
  if (!state.throttled && state.heat >= HEAT_MAX) {
    state.throttled = true;
    state.overclock = false;
  }
  if (state.throttled && state.heat <= HEAT_THROTTLE_OFF) state.throttled = false;
  if (hasWeightUpgrade(state, 'auto') && state.overclock && !state.throttled) {
    if (state.heat >= AUTO_HEAT_LIMIT) state.autoPause = true;
    else if (state.autoPause && state.heat <= AUTO_REON_HEAT) state.autoPause = false;
  }
}

function heatSig(state) {
  return (state.throttled ? 1 : 0) + '|' + (state.overclock ? 1 : 0) + '|' + (state.autoPause ? 1 : 0);
}

// Returns the sum of heatFactor * dt over the whole step.
function simulateHeat(state, seconds) {
  normalizeAuto(state);
  let remaining = seconds;
  let factorTime = 0;
  let guard = 0;
  while (remaining > 1e-9 && guard++ < 100000) {
    const effOn = effectiveOverclock(state);
    const netRise = OVERCLOCK_HEAT_RATE - cooling(state);
    let rate;
    let target;
    if (state.throttled) {
      rate = -COOL_RATE;
      target = HEAT_THROTTLE_OFF;
    } else if (effOn && netRise > 0) {
      rate = netRise;
      target = hasWeightUpgrade(state, 'auto') ? AUTO_HEAT_LIMIT : HEAT_MAX;
    } else if (effOn) {
      // A rise of 0 or less means it never overheats: heat holds.
      rate = 0;
      target = Infinity;
    } else {
      rate = -COOL_RATE;
      target = hasWeightUpgrade(state, 'auto') && state.autoPause ? AUTO_REON_HEAT : 0;
    }
    const dtToBoundary =
      rate > 0
        ? Math.max(0, (target - state.heat) / rate)
        : rate < 0
          ? Math.max(0, (state.heat - target) / -rate)
          : Infinity;
    const dt = Math.min(dtToBoundary, remaining);
    if (dt <= 1e-12) {
      const before = heatSig(state);
      applyHeatBoundary(state);
      if (heatSig(state) === before) {
        // No transition left: heat is pinned (0, or holding with netRise <= 0),
        // so the factor stays constant for the rest of the step.
        const factor =
          state.throttled ? THROTTLE_FACTOR : effectiveOverclock(state) ? OVERCLOCK_FACTOR : 1;
        factorTime += factor * remaining;
        break;
      }
      continue;
    }
    const factor = state.throttled ? THROTTLE_FACTOR : effOn ? OVERCLOCK_FACTOR : 1;
    factorTime += factor * dt;
    state.heat = Math.min(HEAT_MAX, Math.max(0, state.heat + rate * dt));
    remaining -= dt;
    // Apply the transition at the exact moment, even if that is the end of the
    // tick, so heat 100/40/95 never lingers across a step boundary.
    if (dt === dtToBoundary && dtToBoundary < Infinity) {
      applyHeatBoundary(state);
    }
  }
  return factorTime;
}

// --- public API ----------------------------------------------------------------

export function tick(state, seconds) {
  if (!validState(state) || !isFiniteNumber(seconds) || seconds <= 0) return state;
  const factorTime = simulateHeat(state, seconds);
  const earned = baseRate(state) * factorTime;
  addTokens(state, earned);
  return state;
}

export function tokensPerSecond(state) {
  if (!validState(state)) return 0;
  return baseRate(state) * heatFactor(state);
}

export function click(state) {
  if (!validState(state)) return 0;
  const earned = (1 + clickFlat(state)) + clickShare(state) * tokensPerSecond(state);
  addTokens(state, earned);
  return earned;
}

export function cost(state, generatorId, n) {
  if (!validState(state) || !isFiniteNumber(n) || n < 1) return 0;
  const g = GENERATORS.find((x) => x.id === generatorId);
  if (!g) return 0;
  const owned = state.generators[g.id] || 0;
  const count = Math.floor(n);
  let total = 0;
  for (let i = 0; i < count; i++) {
    total += Math.ceil(g.baseCost * Math.pow(COST_GROWTH, owned + i));
  }
  return total;
}

// n is a count or 'max'. Buys as many as affordable, up to n. Returns the count.
export function buy(state, generatorId, n) {
  if (!validState(state)) return 0;
  const g = GENERATORS.find((x) => x.id === generatorId);
  if (!g) return 0;
  let count;
  if (n === 'max') count = Infinity;
  else if (!isFiniteNumber(n) || n < 1) return 0;
  else count = Math.floor(n);
  const owned = state.generators[g.id] || 0;
  let bought = 0;
  let total = 0;
  while (bought < count) {
    const next = Math.ceil(g.baseCost * Math.pow(COST_GROWTH, owned + bought));
    if (total + next > state.tokens) break;
    total += next;
    bought++;
  }
  if (bought > 0) {
    state.tokens -= total;
    state.generators[g.id] = owned + bought;
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

export function buyWeightUpgrade(state, id) {
  if (!validState(state)) return false;
  const u = WEIGHT_UPGRADES.find((x) => x.id === id);
  if (!u || state.weightUpgrades.includes(id)) return false;
  if ((state.weights || 0) < u.cost) return false;
  state.weights -= u.cost;
  state.weightUpgrades.push(id);
  return true;
}

export function setOverclock(state, on) {
  if (!validState(state) || typeof on !== 'boolean') return;
  if (on && state.throttled) return; // cannot turn on while throttled
  state.overclock = on;
  state.autoPause = false; // a manual toggle restarts the auto cycle
}

export function weightsAvailable(state) {
  if (!validState(state)) return 0;
  const reached = Math.floor(Math.sqrt(Math.max(0, state.totalLifetime || 0) / PRESTIGE_DIVISOR));
  return Math.max(0, reached - (state.weightsEarnedThisCycle || 0));
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
  for (const g of GENERATORS) state.generators[g.id] = 0;
  state.upgrades = [];
  state.heat = 0;
  state.overclock = false;
  state.throttled = false;
  state.autoPause = false;
  // Kept: weights, weightUpgrades, totalLifetime, rushCooldownUntil.
  return gained;
}

export function applyOffline(state, seconds) {
  if (!validState(state) || !isFiniteNumber(seconds) || seconds < 0) return 0;
  const long = WEIGHT_UPGRADES.find((u) => u.id === 'long');
  const capHours = hasWeightUpgrade(state, 'long') ? long.value : OFFLINE_CAP_HOURS;
  const capped = Math.min(seconds, capHours * 3600);
  if (capped <= 0) return 0;
  const night = WEIGHT_UPGRADES.find((u) => u.id === 'night');
  const rate = baseRate(state); // overclock and throttle ignored
  const offlineRate = hasWeightUpgrade(state, 'night') ? night.value : OFFLINE_RATE;
  const earned = rate * capped * offlineRate;
  state.overclock = false;
  addTokens(state, earned);
  return earned;
}

export function applyRush(state, score, now) {
  if (!validState(state) || !isFiniteNumber(score) || !isFiniteNumber(now) || score < 0) return 0;
  if (state.rushCooldownUntil !== null && now < state.rushCooldownUntil) return 0;
  const seconds = Math.min(RUSH_MAX_SECONDS, score / RUSH_SCORE_DIVISOR);
  const earned = tokensPerSecond(state) * seconds;
  state.rushCooldownUntil = now + RUSH_COOLDOWN_SECONDS;
  addTokens(state, earned);
  return earned;
}
