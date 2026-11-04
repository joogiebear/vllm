// Idle game rules. Pure: no DOM, Date, performance, localStorage or Math.random.
// Table values come from ./data.js. Invalid arguments are ignored and never throw.
import {
  GENERATORS,
  STARTER_GENERATOR,
  COST_GROWTH,
  DOUBLING_THRESHOLDS,
  PAYOUT_MILESTONES,
  GLOBAL_MILESTONES,
  UPGRADES,
  X5_UPGRADES,
  WEIGHT_UPGRADES,
  MANAGERS,
  REMOVED_UPGRADES,
  PRESTIGE_DIVISOR,
  REGION_BASE,
  REGION_GROWTH,
  REGION_NAMES,
  REGION_PERKS,
  REGION_UNLOCK_WEIGHTS,
  TIER_GATES,
  OFFLINE_CAP_HOURS,
  OFFLINE_RATE,
  RUSH_COOLDOWN_SECONDS,
  RUSH_MAX_SECONDS,
  RUSH_SCORE_DIVISOR,
  WEIGHT_BONUS_PER_WEIGHT,
  CONTINUOUS_CYCLE_MAX,
  SAVE_VERSION,
  EVENT_KINDS,
  EVENT_RNG_SEED,
  EVENT_FIRST_DELAY,
  EVENT_GAP_MIN,
  EVENT_GAP_MAX,
  EVENT_CLAIM_WINDOW,
  EVENT_DURATION,
  EVENT_SPIKE_MULTIPLIER,
  EVENT_TURBO_SPEED,
  EVENT_WINDFALL_SECONDS,
} from './data.js?v=20261104145532';
import { ACHIEVEMENTS } from './data.js?v=20261104145532';
import { checkAchievements } from './achievements.js?v=20261104145532';

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
    regions: 0,
    regionsEarned: 0,
    weightsEverEarned: 0,
    weightsSinceExpand: 0,
    regionPerks: [],
    autoProcureTimer: 0,
    generators,
    upgrades: [],
    x5Upgrades: [],
    weightUpgrades: [],
    managers: [],
    cycles,
    achievements: [],
    rushCooldownUntil: null,
    rng: EVENT_RNG_SEED,
    nextEventIn: EVENT_FIRST_DELAY,
    eventOffer: null,
    eventActive: null,
    stats: {
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
      eventsClaimed: 0,
    },
    // First-run hints (docs/ART-DESIGN.md §1): ids run, buy, manager.
    // Kept across prestige and Regions; the migration marks all three seen
    // for existing players (lifetime > 0).
    hints: { seen: [] },
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

function hasX5Upgrade(state, id) {
  return Array.isArray(state.x5Upgrades) && state.x5Upgrades.includes(id);
}

function hasRegionPerk(state, id) {
  return Array.isArray(state.regionPerks) && state.regionPerks.includes(id);
}

// Head Start (docs/REGIONS-DESIGN.md): re-applied at the start of every
// run (prestige) and every new region (expandRegion): adds Seed Funding,
// Procurement Bot and Standing Orders to the owned weight upgrades and
// hires the first 3 managers (granted, not bought, so the stats are not
// incremented).
function applyHeadStart(state) {
  if (!hasRegionPerk(state, 'headStart')) return;
  for (const id of ['seed', 'procure', 'auto']) {
    if (!hasWeightUpgrade(state, id)) state.weightUpgrades.push(id);
  }
  for (const m of MANAGERS.slice(0, 3)) {
    if (!hasManager(state, m.id)) state.managers.push(m.id);
  }
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

// mulberry32: the generator's state is state.rng, so core stays pure.
// Returns a number in [0, 1).
function rngNext(state) {
  state.rng = (state.rng + 0x6d2b79f5) | 0;
  let t = Math.imul(state.rng ^ (state.rng >>> 15), 1 | state.rng);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Global production multiplier (kind 'production'). Per-tier multipliers
// (kind 'productionTier') are applied per row in tierMultiplier().
function productionMultiplier(state) {
  let m = 1;
  for (const u of UPGRADES) {
    if (u.kind === 'production' && state.upgrades.includes(u.id)) m *= u.value;
  }
  // Global milestones multiply all production (docs/LATE-GAME-DESIGN.md,
  // section 3).
  return m * globalMilestoneMultiplier(state);
}

function tierMultiplier(state, g) {
  let m = 1;
  for (const u of UPGRADES) {
    if (u.kind === 'productionTier' && u.tier === g.id && state.upgrades.includes(u.id)) m *= u.value;
  }
  // Second-round x5 output upgrades (docs/LATE-GAME-DESIGN.md, section 4).
  for (const u of X5_UPGRADES) {
    if (u.tier === g.id && hasX5Upgrade(state, u.id)) m *= u.value;
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

// The tiers that count for the global milestones (docs/LATE-GAME-DESIGN.md,
// section 1 and 3): tiers 1-8 always, gated tiers once their gate is met
// or the player already owns them.
function unlockedTiers(state) {
  return GENERATORS.filter((g) => isTierUnlocked(state, g.id));
}

// Payout milestones per tier (docs/LATE-GAME-DESIGN.md, section 3): once
// a tier reaches `owned`, its output is multiplied by `value`.
function payoutMilestoneMultiplier(state, g) {
  const owned = state.generators[g.id] || 0;
  let m = 1;
  for (const t of PAYOUT_MILESTONES) {
    if (owned >= t.owned) m *= t.value;
  }
  return m;
}

// Global milestones (docs/LATE-GAME-DESIGN.md, section 3): when every
// unlocked tier reaches `owned`, all production is multiplied by `value`.
function globalMilestoneMultiplier(state) {
  const tiers = unlockedTiers(state);
  let m = 1;
  for (const t of GLOBAL_MILESTONES) {
    if (tiers.every((g) => (state.generators[g.id] || 0) >= t.owned)) m *= t.value;
  }
  return m;
}

// Multipliers shared by every row: cache rate, weight bonus (based on
// weightsEarnedThisCycle, not total weights, so prestige resets the bonus
// to 0.1 * weightsEarnedThisCycle) and global production.
function rateMultiplier(state) {
  let m =
    (1 + cacheRate(state)) *
    (1 + weightBonusPer(state) * (state.weightsEarnedThisCycle || 0)) *
    productionMultiplier(state);
  // Spike multiplies tokensPerSecond, and so the cycle payout.
  if (state.eventActive && state.eventActive.kind === 'spike') m *= EVENT_SPIKE_MULTIPLIER;
  return m;
}

// The steady-state rate of a row: what a managed row pays per second.
// Equals the old continuous rate, so existing balance holds.
export function rowRate(state, g) {
  const owned = state.generators[g.id] || 0;
  return owned * g.tps * speedFactor(owned) * tierMultiplier(state, g) * payoutMilestoneMultiplier(state, g) * rateMultiplier(state);
}

// The lump a cycle pays: owned * tps * cycleSeconds * multipliers.
export function cyclePayout(state, g) {
  const owned = state.generators[g.id] || 0;
  return owned * g.tps * g.cycleSeconds * tierMultiplier(state, g) * payoutMilestoneMultiplier(state, g) * rateMultiplier(state);
}

// Cycle time in seconds; milestones halve it (speed x2). Overclocked
// Fabric (region perk) makes every cycle 20% shorter.
export function cycleTime(state, g) {
  const owned = state.generators[g.id] || 0;
  const t = g.cycleSeconds / speedFactor(owned);
  return hasRegionPerk(state, 'overclock') ? t * 0.8 : t;
}

export function hasManager(state, id) {
  return Array.isArray(state.managers) && state.managers.includes(id);
}

function addTokens(state, amount) {
  if (!isFiniteNumber(amount) || amount <= 0) return;
  state.tokens += amount;
  state.lifetime += amount;
  state.totalLifetime += amount;
  if (state.stats) {
    state.stats.allTimeTokens += amount;
    if (state.lifetime > state.stats.bestRunTokens) state.stats.bestRunTokens = state.lifetime;
  }
}

// --- public API ----------------------------------------------------------------

export function tokensPerSecond(state) {
  if (!validState(state)) return 0;
  let sum = 0;
  for (const g of GENERATORS) sum += rowRate(state, g);
  const n = Array.isArray(state.achievements) ? state.achievements.length : 0;
  // Each Region earned gives x2 to all production (multiplicative:
  // 3 Regions = x8). Based on regionsEarned, so spending Regions on
  // perks does not lower it.
  return sum * (1 + 0.01 * n) * Math.pow(2, state.regionsEarned || 0);
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
  state.stats.playSeconds += seconds;
  // Timed events: one at a time. An offer on screen drains its claim window;
  // the countdown only runs when no offer is on screen (and resumes in the
  // same tick once the offer expires).
  let eventTime = seconds;
  if (state.eventOffer) {
    const drain = Math.min(state.eventOffer.claimBy, eventTime);
    eventTime -= drain;
    state.eventOffer.claimBy -= drain;
    if (state.eventOffer.claimBy <= 0) state.eventOffer = null;
  }
  if (state.eventOffer === null && eventTime > 0 && isFiniteNumber(state.nextEventIn)) {
    const left = state.nextEventIn - eventTime;
    if (left > 0) {
      state.nextEventIn = left;
    } else {
      // The offer is alive for -left seconds of this tick, so its window
      // may already be partly spent (or gone).
      const kind = EVENT_KINDS[Math.floor(rngNext(state) * EVENT_KINDS.length)];
      const claimBy = EVENT_CLAIM_WINDOW + left;
      state.nextEventIn = EVENT_GAP_MIN + rngNext(state) * (EVENT_GAP_MAX - EVENT_GAP_MIN);
      // Event Desk (region perk): events come twice as often.
      if (hasRegionPerk(state, 'eventDesk')) state.nextEventIn /= 2;
      state.eventOffer = claimBy > 0 ? { kind: kind.id, claimBy } : null;
    }
  }
  if (state.eventActive) {
    state.eventActive.remaining -= seconds;
    if (state.eventActive.remaining <= 0) state.eventActive = null;
  }
  for (const g of GENERATORS) {
    const owned = state.generators[g.id] || 0;
    if (owned <= 0) continue;
    let ct = cycleTime(state, g);
    // Turbo halves the effective cycle time.
    if (state.eventActive && state.eventActive.kind === 'turbo') ct /= EVENT_TURBO_SPEED;
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
  checkAchievements(state);
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
  state.stats.taps += 1;
  return true;
}

// Buy a manager with tokens. One per generator; resets on prestige.
export function buyManager(state, id) {
  if (!validState(state)) return false;
  const m = MANAGERS.find((x) => x.id === id);
  if (!m || hasManager(state, id)) return false;
  if (!isTierUnlocked(state, id)) return false;
  if (state.tokens < m.cost) return false;
  state.tokens -= m.cost;
  state.managers.push(id);
  state.stats.managersHired += 1;
  return true;
}

// Migrate a saved state (the raw parsed object) to the current save version.
// v1 -> v2: keeps tokens, lifetime, generators, weights and weight upgrades;
// refunds removed upgrades at their cost; drops heat/overclock; ignores
// unknown fields. Never mutates the input; never throws.
// Tiers added after a save was written (absent from it) stay at 0 owned /
// null cycles, because the merge starts from createState().
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
  s.regions = num('regions');
  s.regionsEarned = num('regionsEarned');
  s.weightsEverEarned = num('weightsEverEarned');
  // Migration (docs/LATE-GAME-DESIGN.md, section 2): a save that predates
  // weightsSinceExpand starts it at the save's current Weights.
  s.weightsSinceExpand = isFiniteNumber(saveState.weightsSinceExpand)
    ? saveState.weightsSinceExpand
    : s.weights;
  // Older saves started weightsEverEarned at 0, so it undercounts: bump it to
  // at least the current Weights / weightsSinceExpand. Never lowers it.
  s.weightsEverEarned = Math.max(
    s.weightsEverEarned, s.weights, s.weightsSinceExpand
  );
  if (Array.isArray(saveState.regionPerks)) {
    s.regionPerks = saveState.regionPerks.filter((x) => typeof x === 'string');
  }
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
  if (Array.isArray(saveState.x5Upgrades)) {
    s.x5Upgrades = saveState.x5Upgrades.filter(
      (x) => typeof x === 'string' && X5_UPGRADES.some((u) => u.id === x)
    );
  }
  if (Array.isArray(saveState.managers)) {
    s.managers = saveState.managers.filter(
      (x) => typeof x === 'string' && MANAGERS.some((m) => m.id === x)
    );
  }
  if (Array.isArray(saveState.achievements)) {
    s.achievements = saveState.achievements.filter(
      (x) => typeof x === 'string' && ACHIEVEMENTS.some((a) => a.id === x)
    );
  }
  if (saveState.cycles !== null && typeof saveState.cycles === 'object' && !Array.isArray(saveState.cycles)) {
    for (const id of Object.keys(s.cycles)) {
      const v = saveState.cycles[id];
      s.cycles[id] = isFiniteNumber(v) && v >= 0 ? v : null;
    }
  }
  s.rushCooldownUntil =
    isFiniteNumber(saveState.rushCooldownUntil) ? saveState.rushCooldownUntil : null;
  s.rng = isFiniteNumber(saveState.rng) ? saveState.rng : EVENT_RNG_SEED;
  s.nextEventIn =
    isFiniteNumber(saveState.nextEventIn) && saveState.nextEventIn >= 0
      ? saveState.nextEventIn
      : EVENT_FIRST_DELAY;
  // eventOffer and eventActive are not persisted: they are cleared on load,
  // like by applyOffline.
  if (saveState.stats !== null && typeof saveState.stats === 'object' && !Array.isArray(saveState.stats)) {
    for (const k of Object.keys(s.stats)) {
      const v = saveState.stats[k];
      if (isFiniteNumber(v) && v >= 0) s.stats[k] = v;
    }
  }
  // First-run hints (docs/ART-DESIGN.md §1): a save that already carries a
  // hints field keeps its seen list; an old save (no hints field) whose
  // player has already played (lifetime > 0) has seen everything, so existing
  // players never see the hints; a fresh save keeps the empty seen list from
  // createState().
  const HINT_IDS = ['run', 'buy', 'manager'];
  if (
    saveState.hints !== null && typeof saveState.hints === 'object' &&
    !Array.isArray(saveState.hints) && Array.isArray(saveState.hints.seen)
  ) {
    s.hints.seen = saveState.hints.seen.filter(
      (x) => typeof x === 'string' && HINT_IDS.includes(x)
    );
  } else if (s.lifetime > 0) {
    s.hints.seen = HINT_IDS.slice();
  }
  return s;
}

// The Prestige tab shows its Regions segment once any Region is earned, or
// the Weights counter is in sight of the first Region.
export function regionsUnlocked(state) {
  return (state.regionsEarned || 0) > 0
    || (state.regions || 0) > 0
    || Math.max(state.weightsEverEarned || 0, state.weights || 0) >= REGION_UNLOCK_WEIGHTS;
}

// The Weights that count toward the first Region: the higher of the
// lifetime total and the current holding (matches regionsUnlocked).
function weightsTowardUnlock(state) {
  return Math.max(state.weightsEverEarned || 0, state.weights || 0);
}

// Whole-number display with thousands separators (2000 -> "2,000").
function fmtNum(n) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

// The locked-state text of the Regions view: the unlock threshold and
// the player's progress toward it (nothing important is hidden: show it
// and say how to unlock it).
export function regionsLockedText(state) {
  return `Regions unlock at ${fmtNum(REGION_UNLOCK_WEIGHTS)} Weights earned (you have ${fmtNum(weightsTowardUnlock(state))})`;
}

// Progress (0..1) toward the first Region unlock.
export function regionsUnlockProgress(state) {
  return Math.min(1, weightsTowardUnlock(state) / REGION_UNLOCK_WEIGHTS);
}

// The always-visible one-line Regions hint on the Weights view: the
// locked text, or the next-Region progress.
export function regionsHintLine(state) {
  if (!regionsUnlocked(state)) {
    return `Regions: locked — unlocks at ${fmtNum(REGION_UNLOCK_WEIGHTS)} Weights earned (you have ${fmtNum(weightsTowardUnlock(state))}). Open the Regions tab above.`;
  }
  if (regionsAvailable(state) >= 1) {
    return 'Regions: ready to expand to your next Region. Open the Regions tab above.';
  }
  return `Regions: next Region at ${fmtNum(regionTarget(state))} Weights earned by prestiging (${fmtNum(state.weightsSinceExpand || 0)} so far). Open the Regions tab above.`;
}

// SERVE / click left the game; kept as a no-op so the UI does not break
// before the UI pass.
export function click(state) {
  return 0;
}

// Heat and overclock left the game; kept as a no-op for the UI.
export function setOverclock(state, on) {}

// The cost of the next n units of a generator: a geometric series in
// closed form (no per-unit loop): next * (r^n - 1) / (r - 1), where
// next = baseCost * r^owned and r = COST_GROWTH.
export function cost(state, id, n = 1) {
  if (!validState(state) || !isFiniteNumber(n) || n < 1) return Infinity;
  const g = GENERATORS.find((x) => x.id === id);
  if (!g) return Infinity;
  const r = COST_GROWTH;
  const owned = state.generators[id] || 0;
  const next = g.baseCost * Math.pow(r, owned);
  return next * (Math.pow(r, n) - 1) / (r - 1);
}

// The most units of a generator affordable with state.tokens, in closed
// form (no per-unit loop):
//   count = floor(log(1 + tokens * (r - 1) / next) / log(r))
//   total = next * (r^count - 1) / (r - 1)
// A floating-point guard decrements count once when the total overshoots
// the tokens. Returns { count: 0, total: 0 } for bad input.
export function maxBuyable(state, id) {
  if (!validState(state) || !isFiniteNumber(state.tokens) || state.tokens <= 0) {
    return { count: 0, total: 0 };
  }
  const g = GENERATORS.find((x) => x.id === id);
  if (!g) return { count: 0, total: 0 };
  const r = COST_GROWTH;
  const owned = state.generators[id] || 0;
  const next = g.baseCost * Math.pow(r, owned);
  if (!Number.isFinite(next)) return { count: 0, total: 0 };
  const count = Math.floor(
    Math.log(1 + (state.tokens * (r - 1)) / next) / Math.log(r),
  );
  if (count <= 0) return { count: 0, total: 0 };
  let total = next * (Math.pow(r, count) - 1) / (r - 1);
  if (total > state.tokens) {
    // floating-point error: one unit too many
    return {
      count: count - 1,
      total: next * (Math.pow(r, count - 1) - 1) / (r - 1),
    };
  }
  return { count, total };
}

// Tiers 9-12 unlock through Regions (docs/LATE-GAME-DESIGN.md, section 1):
// a gated tier is usable once regionsEarned reaches its requirement, and a
// tier the player already owns stays usable even before that.
export function isTierUnlocked(state, id) {
  if (!validState(state)) return false;
  const gate = TIER_GATES.find((g) => g.id === id);
  if (!gate) return true;
  if ((state.regionsEarned || 0) >= gate.regions) return true;
  return (state.generators[id] || 0) > 0;
}

// The locked next-tier row ("Unlocks at <region> (<n> Regions)",
// docs/LATE-GAME-DESIGN.md, section 1) is shown only once the player
// owns at least one of the tier just before it (for Orbital that is
// the Dyson Inference Swarm), so a fresh game does not show the
// endgame. Unlocked or already owned tiers are not locked rows.
export function showLockedTier(state, id) {
  if (!validState(state)) return false;
  const gate = TIER_GATES.find((g) => g.id === id);
  if (!gate) return false;
  if (isTierUnlocked(state, id)) return false;
  const idx = GENERATORS.findIndex((g) => g.id === id);
  if (idx <= 0) return false;
  return (state.generators[GENERATORS[idx - 1].id] || 0) > 0;
}

// The next speed or payout milestone for a row (docs/LATE-GAME-DESIGN.md,
// section 3): the smallest threshold above the owned count, from the
// doubling (speed x2) and payout tables. Returns { kind, value, owned },
// or null when the row has reached every milestone.
export function nextMilestone(state, id) {
  if (!validState(state)) return null;
  const g = GENERATORS.find((x) => x.id === id);
  if (!g) return null;
  const owned = state.generators[id] || 0;
  let best = null;
  for (const t of DOUBLING_THRESHOLDS) {
    if (t > owned && (best === null || t < best.owned)) best = { kind: 'speed', value: 2, owned: t };
  }
  for (const p of PAYOUT_MILESTONES) {
    if (p.owned > owned && (best === null || p.owned < best.owned)) best = { kind: 'payout', value: p.value, owned: p.owned };
  }
  return best;
}

// The next global milestone (docs/LATE-GAME-DESIGN.md, section 3): the
// first threshold not yet met by every unlocked tier, plus the unlocked
// tier with the fewest owned ("Lowest now: Lunar 212"). Returns
// { next, lowestTier, lowestCount }; next is null once every threshold
// is met.
export function globalMilestone(state) {
  if (!validState(state)) return { next: null, lowestTier: null, lowestCount: null };
  const tiers = unlockedTiers(state);
  let next = null;
  for (const t of GLOBAL_MILESTONES) {
    if (!tiers.every((g) => (state.generators[g.id] || 0) >= t.owned)) {
      next = { owned: t.owned, value: t.value };
      break;
    }
  }
  let lowestTier = null;
  let lowestCount = null;
  for (const g of tiers) {
    const n = state.generators[g.id] || 0;
    if (lowestCount === null || n < lowestCount) {
      lowestCount = n;
      lowestTier = g.id;
    }
  }
  return { next, lowestTier, lowestCount };
}

// Buy up to `max` units of a generator (Infinity or 'max' = as many as
// affordable). One step: the count is capped by maxBuyable, the total is
// subtracted once, the count added once, and stats updated once.
export function buy(state, id, max = Infinity) {
  if (max === 'max') max = Infinity;
  if (!validState(state) || typeof max !== 'number' || Number.isNaN(max) || max < 1) return 0;
  const g = GENERATORS.find((x) => x.id === id);
  if (!g) return 0;
  if (!isTierUnlocked(state, id)) return 0;
  const { count: affordable } = maxBuyable(state, id);
  const count = max === Infinity ? affordable : Math.min(Math.floor(max), affordable);
  if (count <= 0) return 0;
  const total = cost(state, id, count);
  state.tokens -= total;
  state.generators[id] += count;
  state.stats.generatorsBought += count;
  return count;
}

export function buyUpgrade(state, id) {
  if (!validState(state)) return false;
  const u = UPGRADES.find((x) => x.id === id);
  if (!u || state.upgrades.includes(id)) return false;
  if (u.tier && !isTierUnlocked(state, u.tier)) return false;
  if (state.tokens < u.cost) return false;
  state.tokens -= u.cost;
  state.upgrades.push(id);
  state.stats.upgradesBought += 1;
  return true;
}

// Procurement Bot: buy every affordable upgrade, cheapest first, until one
// is unaffordable. Includes the second-round x5 upgrades under the same
// rules as buyX5Upgrade (minRegions reached, tier unlocked, not owned) —
// docs/LATE-GAME-DESIGN.md, section 4. Returns how many were bought.
export function buyAllUpgrades(state) {
  if (!validState(state)) return 0;
  let bought = 0;
  let again = true;
  while (again) {
    again = false;
    const normal = UPGRADES.filter(
      (u) => !state.upgrades.includes(u.id) && (!u.tier || isTierUnlocked(state, u.tier)),
    ).map((u) => ({ u, list: state.upgrades }));
    const second = X5_UPGRADES.filter(
      (u) => !hasX5Upgrade(state, u.id)
        && (state.regionsEarned || 0) >= u.minRegions
        && isTierUnlocked(state, u.tier),
    ).map((u) => ({ u, list: state.x5Upgrades }));
    const sorted = [...normal, ...second].sort((a, b) => a.u.cost - b.u.cost);
    for (const c of sorted) {
      if (state.tokens >= c.u.cost) {
        state.tokens -= c.u.cost;
        c.list.push(c.u.id);
        bought++;
        again = true;
      }
    }
  }
  state.stats.upgradesBought += bought;
  return bought;
}

// Second-round x5 output upgrade (docs/LATE-GAME-DESIGN.md, section 4):
// appears once minRegions Regions are earned, and for tiers 9-12 only
// when the tier itself is unlocked. Resets on prestige like other
// upgrades.
export function buyX5Upgrade(state, id) {
  if (!validState(state)) return false;
  const u = X5_UPGRADES.find((x) => x.id === id);
  if (!u || hasX5Upgrade(state, id)) return false;
  if ((state.regionsEarned || 0) < u.minRegions) return false;
  if (!isTierUnlocked(state, u.tier)) return false;
  if (state.tokens < u.cost) return false;
  state.tokens -= u.cost;
  state.x5Upgrades.push(id);
  state.stats.upgradesBought += 1;
  return true;
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

// Buy a region perk with Regions. Kept forever; the x2-per-Region
// multiplier is based on regionsEarned, so spending Regions never lowers
// it.
export function buyRegionPerk(state, id) {
  if (!validState(state)) return false;
  const p = REGION_PERKS.find((x) => x.id === id);
  if (!p || hasRegionPerk(state, id)) return false;
  if ((state.regions || 0) < p.cost) return false;
  state.regions -= p.cost;
  state.regionPerks.push(id);
  return true;
}

// Auto-Procure (region perk): bookkeeping only. Tracks the 10-second
// timer on state.autoProcureTimer and returns true when a Buy All is
// due. The caller (app.js) also checks the 'autoProcure' setting and
// runs buyAllUpgrades() itself.
export function autoProcureDue(state, seconds) {
  if (!validState(state) || !isFiniteNumber(seconds) || seconds <= 0) return false;
  if (!hasRegionPerk(state, 'autoProcure')) {
    state.autoProcureTimer = 0;
    return false;
  }
  state.autoProcureTimer = (state.autoProcureTimer || 0) + seconds;
  if (state.autoProcureTimer >= 10) {
    state.autoProcureTimer = 0;
    return true;
  }
  return false;
}

export function weightsAvailable(state) {
  if (!validState(state)) return 0;
  return Math.floor(Math.sqrt(Math.max(0, state.totalLifetime || 0) / PRESTIGE_DIVISOR)) - (state.weightsEarnedThisCycle || 0);
}

export function prestige(state) {
  if (!validState(state)) return 0;
  const gained = weightsAvailable(state);
  if (gained < 1) return 0;
  state.stats.prestiges += 1;
  state.stats.runStartedAt = state.stats.playSeconds;
  // Head Start re-applies at the start of every run, so the granted
  // Seed Funding counts for the starting tokens.
  applyHeadStart(state);
  const seed = WEIGHT_UPGRADES.find((u) => u.id === 'seed');
  const startTokens = hasWeightUpgrade(state, 'seed') ? seed.value : 0;
  state.weights += gained;
  state.weightsEverEarned += gained;
  state.weightsSinceExpand += gained;
  state.weightsEarnedThisCycle = Math.floor(
    Math.sqrt(Math.max(0, state.totalLifetime || 0) / PRESTIGE_DIVISOR)
  );
  state.tokens = startTokens;
  state.lifetime = 0;
  for (const g of GENERATORS) {
    state.generators[g.id] = g.id === STARTER_GENERATOR ? 1 : 0;
    state.cycles[g.id] = null;
  }
  state.upgrades = [];
  state.x5Upgrades = [];
  // Managers reset like regular upgrades; Standing Orders re-hires the
  // Cron Job at the start of each run, and Head Start then hires the
  // first 3 managers.
  state.managers = hasWeightUpgrade(state, 'auto') ? ['pi'] : [];
  applyHeadStart(state);
  // Kept: weights, weightUpgrades, totalLifetime, rushCooldownUntil, achievements.
  return gained;
}

// The Weights target for the next Region (docs/LATE-GAME-DESIGN.md,
// section 2): REGION_BASE * REGION_GROWTH ^ regionsEarned.
export function regionTarget(state) {
  const n = isFiniteNumber(state && state.regionsEarned) ? state.regionsEarned : 0;
  return REGION_BASE * Math.pow(REGION_GROWTH, n);
}

// One Region at a time (docs/LATE-GAME-DESIGN.md, section 2): available
// when the Weights earned since the last expansion reach the target,
// never more than 1.
export function regionsAvailable(state) {
  if (!validState(state)) return 0;
  return (state.weightsSinceExpand || 0) >= regionTarget(state) ? 1 : 0;
}

// Second prestige layer (docs/REGIONS-DESIGN.md). Resets everything a
// normal prestige resets, plus weights, weightUpgrades,
// weightsEarnedThisCycle, weightsSinceExpand and totalLifetime (so Weights
// start from zero again). Then the region perks re-apply: Head Start adds
// Seed Funding, Procurement Bot and Standing Orders and hires the first 3
// managers, and Fresh Weights starts the run with 5 Weights, counted as
// earned. Returns the Regions gained (0 or 1), or 0 when none are
// available.
export function expandRegion(state) {
  if (!validState(state)) return 0;
  const gained = regionsAvailable(state);
  if (gained < 1) return 0;
  state.stats.runStartedAt = state.stats.playSeconds;
  state.regions += gained;
  state.regionsEarned += gained;
  state.weightsSinceExpand = 0;
  state.weights = 0;
  state.weightUpgrades = [];
  state.weightsEarnedThisCycle = 0;
  state.totalLifetime = 0;
  state.tokens = 0;
  state.lifetime = 0;
  for (const g of GENERATORS) {
    state.generators[g.id] = g.id === STARTER_GENERATOR ? 1 : 0;
    state.cycles[g.id] = null;
  }
  state.upgrades = [];
  state.x5Upgrades = [];
  state.managers = [];
  applyHeadStart(state);
  // Fresh Weights: each new region starts with 5 Weights, counted as
  // earned (weightsEarnedThisCycle).
  if (hasRegionPerk(state, 'fresh')) {
    const fresh = REGION_PERKS.find((p) => p.id === 'fresh');
    state.weights += fresh.value;
    state.weightsEarnedThisCycle += fresh.value;
  }
  // Kept: regions, regionPerks, weightsEverEarned, achievements, stats,
  // rushCooldownUntil.
  return gained;
}

// The server room for the current region number (regionsEarned): the
// named list, then "Region N" after it ends.
export function regionName(state) {
  const n = isFiniteNumber(state && state.regionsEarned) ? state.regionsEarned : 0;
  return REGION_NAMES[n] !== undefined ? REGION_NAMES[n] : `Region ${n}`;
}

// Claim the offer on screen. Returns the kind, or null when there is no
// offer (or it expired). Windfall pays instantly; timed kinds set
// state.eventActive, replacing a running event.
export function claimEvent(state) {
  if (!validState(state) || !state.eventOffer) return null;
  if (state.eventOffer.claimBy <= 0) {
    state.eventOffer = null;
    return null;
  }
  const kind = state.eventOffer.kind;
  state.eventOffer = null;
  if (kind === 'windfall') {
    addTokens(state, tokensPerSecond(state) * EVENT_WINDFALL_SECONDS);
  } else {
    // Event Desk (region perk): timed events last 50% longer.
    let remaining = EVENT_DURATION;
    if (hasRegionPerk(state, 'eventDesk')) remaining *= 1.5;
    state.eventActive = { kind, remaining };
  }
  state.stats.eventsClaimed += 1;
  checkAchievements(state);
  return kind;
}

// Offline earnings: rate * min(seconds, cap hours) * offline rate.
// Counts only managed rows. Events never spawn offline: the offer and the
// active event are cleared and nextEventIn does not count down.
export function applyOffline(state, seconds) {
  if (!validState(state) || !isFiniteNumber(seconds) || seconds < 0) return 0;
  state.eventOffer = null;
  state.eventActive = null;
  const long = WEIGHT_UPGRADES.find((u) => u.id === 'long');
  // Long Haul (region perk): offline cap 24 h and offline rate 100%.
  const capHours = hasRegionPerk(state, 'longHaul')
    ? 24
    : hasWeightUpgrade(state, 'long')
      ? long.value
      : OFFLINE_CAP_HOURS;
  const capped = Math.min(seconds, capHours * 3600);
  if (capped <= 0) return 0;
  const night = WEIGHT_UPGRADES.find((u) => u.id === 'night');
  let rate = 0;
  for (const g of GENERATORS) {
    if (hasManager(state, g.id)) rate += rowRate(state, g);
  }
  const offlineRate = hasRegionPerk(state, 'longHaul')
    ? 1
    : hasWeightUpgrade(state, 'night')
      ? night.value
      : OFFLINE_RATE;
  const earned = rate * capped * offlineRate;
  state.stats.offlineSeconds += capped;
  state.stats.offlineTokens += earned;
  addTokens(state, earned);
  return earned;
}

export function applyRush(state, score, now) {
  if (!validState(state)) return 0;
  const scoreN = isFiniteNumber(score) && score > 0 ? score : 0;
  const nowN = isFiniteNumber(now) ? now : null;
  if (state.rushCooldownUntil !== null && nowN !== null && nowN < state.rushCooldownUntil) return 0;
  if (scoreN <= 0) return 0;
  state.stats.rushGames += 1;
  if (scoreN > state.stats.bestRushScore) state.stats.bestRushScore = scoreN;
  const seconds = Math.min(RUSH_MAX_SECONDS, scoreN / RUSH_SCORE_DIVISOR);
  const earned = tokensPerSecond(state) * seconds;
  addTokens(state, earned);
  if (nowN !== null) state.rushCooldownUntil = nowN + RUSH_COOLDOWN_SECONDS;
  return earned;
}

// A run with no generators at all could never earn again, since there is no
// click. Saves made while that was possible get their starter back.
export function ensureStarter(state) {
  if (!validState(state)) return state;
  if (GENERATORS.every((g) => !(state.generators[g.id] > 0))) state.generators[STARTER_GENERATOR] = 1;
  return state;
}
