// OVERCLOCK game simulation.
//
// Pure and deterministic: no DOM, no canvas, no audio, no Date, no
// performance, no Math.random. All randomness comes from a mulberry32
// generator whose 32-bit state lives in state.rng. Identical seed and
// actions give an identical state.

export const TICK_SECONDS = 1 / 30;

// Every tunable number from the design lives here.
export const CONFIG = {
  tickSeconds: TICK_SECONDS,
  levelDuration: 45,
  baseArrivalInterval: 2.6,
  arrivalIntervalStep: 0.25,
  minArrivalInterval: 0.7,
  tokenMin: 40,
  tokenMax: 160,
  maxPatience: 14,
  vipPatience: 8,
  vipChance: 0.1,
  vipLevelStart: 2,
  queueCap: 8,
  dropReputationCost: 1,
  timeoutReputationCost: 1,
  vipTimeoutReputationCost: 2,
  gpuCount: 2,
  baseSlots: 4,
  maxSlots: 6,
  baseThroughput: 60,
  throughputPerSlot: 0.35,
  cacheSpeed: 1.5,
  cacheStall: 1.0,
  heatGainPerSlot: 5,
  heatLoss: 9,
  heatMax: 100,
  throttleEnter: 100,
  throttleRelease: 60,
  throttleSpeed: 0.25,
  boostDuration: 4,
  boostHeat: 25,
  boostCooldown: 12,
  boostCooldownMin: 4,
  startReputation: 10,
  maxReputation: 10,
  vipReputationGain: 1,
  startMultiplier: 1,
  multiplierStepTenths: 1,
  multiplierMaxTenths: 30,
  upgradeCount: 3,
  coolingHeatLoss: 3,
  throughputBonus: 15,
  patienceBonus: 3,
  queueBonus: 2,
  reputationRestore: 3,
  boostCooldownStep: 3,
};

const UPGRADE_IDS = ['slots', 'cooling', 'throughput', 'patience', 'queue', 'reputation', 'boost'];

const PREFIXES_BY_LEVEL = {
  1: ['A', 'B'],
  2: ['A', 'B', 'C'],
  3: ['A', 'B', 'C', 'D'],
};

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function isInt(v) {
  return Number.isInteger(v);
}

function arrivalInterval(level) {
  return Math.max(
    CONFIG.minArrivalInterval,
    CONFIG.baseArrivalInterval - CONFIG.arrivalIntervalStep * (level - 1)
  );
}

function prefixesFor(level) {
  return PREFIXES_BY_LEVEL[level] || PREFIXES_BY_LEVEL[3];
}

// mulberry32, with the 32-bit state stored in state.rng.
function nextRng(state) {
  const a = (state.rng + 0x6D2B79F5) | 0;
  state.rng = a;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function makeGpu() {
  return {
    slots: Array.from({ length: CONFIG.baseSlots }, () => null),
    active: null,
    heat: 0,
    throttled: false,
    boostActive: false,
    boostTimer: 0,
    boostCooldown: 0,
  };
}

export function createGame(seed) {
  const s = seed >>> 0;
  return {
    seed: s,
    rng: s,
    tick: 0,
    phase: 'playing',
    level: 1,
    levelTime: CONFIG.levelDuration,
    arrivalTimer: arrivalInterval(1),
    queue: [],
    queueCap: CONFIG.queueCap,
    gpus: [makeGpu(), makeGpu()],
    score: 0,
    multiplier: CONFIG.startMultiplier,
    served: 0,
    reputation: CONFIG.startReputation,
    upgrades: {
      slots: 0,
      cooling: 0,
      throughput: 0,
      patience: 0,
      queue: 0,
      reputation: 0,
      boost: 0,
    },
    offer: null,
    events: [],
    nextId: 1,
  };
}

export function step(state, actions) {
  state.events = [];
  if (Array.isArray(actions)) {
    for (const a of actions) applyAction(state, a);
  }
  state.tick += 1;
  if (state.phase === 'playing') simulateTick(state);
  return state;
}

function applyAction(state, a) {
  try {
    if (!a || typeof a !== 'object') return;
    switch (a.type) {
      case 'assign':
        assign(state, a);
        break;
      case 'evict':
        evict(state, a);
        break;
      case 'boost':
        boost(state, a);
        break;
      case 'upgrade':
        upgrade(state, a);
        break;
      default:
        break;
    }
  } catch (e) {
    // Invalid actions are ignored and never throw.
  }
}

function assign(state, a) {
  if (state.phase !== 'playing') return;
  if (!isInt(a.gpu) || !isInt(a.slot)) return;
  const gpu = state.gpus[a.gpu];
  if (!gpu) return;
  if (a.slot < 0 || a.slot >= gpu.slots.length) return;
  if (gpu.slots[a.slot] !== null) return;
  const idx = state.queue.findIndex((r) => r.id === a.requestId);
  if (idx === -1) return;
  const req = state.queue.splice(idx, 1)[0];
  if (gpu.active === req.prefix) {
    req.cacheHit = true;
    req.stall = 0;
  } else {
    req.cacheHit = false;
    req.stall = CONFIG.cacheStall;
    gpu.active = req.prefix;
  }
  gpu.slots[a.slot] = req;
}

function evict(state, a) {
  if (state.phase !== 'playing') return;
  if (!isInt(a.gpu) || !isInt(a.slot)) return;
  const gpu = state.gpus[a.gpu];
  if (!gpu) return;
  if (a.slot < 0 || a.slot >= gpu.slots.length) return;
  const req = gpu.slots[a.slot];
  if (!req) return;
  if (state.queue.length >= state.queueCap) return;
  gpu.slots[a.slot] = null;
  req.stall = 0;
  req.cacheHit = false;
  state.queue.push(req);
  state.events.push({ type: 'evict', requestId: req.id });
}

function boost(state, a) {
  if (state.phase !== 'playing') return;
  if (!isInt(a.gpu)) return;
  const gpu = state.gpus[a.gpu];
  if (!gpu) return;
  if (gpu.throttled || gpu.boostCooldown > 0) return;
  gpu.boostActive = true;
  gpu.boostTimer = CONFIG.boostDuration;
  gpu.boostCooldown = Math.max(
    CONFIG.boostCooldownMin,
    CONFIG.boostCooldown - CONFIG.boostCooldownStep * state.upgrades.boost
  );
  gpu.heat = clamp(gpu.heat + CONFIG.boostHeat, 0, CONFIG.heatMax);
  state.events.push({ type: 'boost', gpu: a.gpu });
}

function upgrade(state, a) {
  if (state.phase !== 'upgrade') return;
  if (!isInt(a.choice) || a.choice < 0 || a.choice >= CONFIG.upgradeCount) return;
  const id = state.offer && state.offer[a.choice];
  if (!id || UPGRADE_IDS.indexOf(id) === -1) return;
  applyUpgrade(state, id);
  state.level += 1;
  state.levelTime = CONFIG.levelDuration;
  state.phase = 'playing';
  state.offer = null;
  state.events.push({ type: 'upgrade', choice: a.choice });
}

function applyUpgrade(state, id) {
  const u = state.upgrades;
  switch (id) {
    case 'slots':
      if (state.gpus[0].slots.length < CONFIG.maxSlots) {
        for (const g of state.gpus) g.slots.push(null);
        u.slots += 1;
      }
      break;
    case 'cooling':
      u.cooling += 1;
      break;
    case 'throughput':
      u.throughput += 1;
      break;
    case 'patience':
      u.patience += 1;
      break;
    case 'queue':
      state.queueCap += CONFIG.queueBonus;
      u.queue += 1;
      break;
    case 'reputation':
      state.reputation = Math.min(
        CONFIG.maxReputation,
        state.reputation + CONFIG.reputationRestore
      );
      u.reputation += 1;
      break;
    case 'boost':
      u.boost += 1;
      break;
  }
}

function simulateTick(state) {
  const dt = CONFIG.tickSeconds;

  state.levelTime -= dt;
  if (state.levelTime <= 0) {
    state.levelTime = 0;
    state.phase = 'upgrade';
    state.offer = pickOffer(state);
    state.events.push({ type: 'levelEnd', level: state.level });
    return;
  }

  state.arrivalTimer -= dt;
  if (state.arrivalTimer <= 0) {
    arrive(state);
    state.arrivalTimer += arrivalInterval(state.level);
  }

  for (let i = state.queue.length - 1; i >= 0; i--) {
    const r = state.queue[i];
    r.patience -= dt;
    if (r.patience <= 0) {
      state.queue.splice(i, 1);
      state.reputation = Math.max(
        0,
        state.reputation - (r.vip ? CONFIG.vipTimeoutReputationCost : CONFIG.timeoutReputationCost)
      );
      state.multiplier = CONFIG.startMultiplier;
      state.events.push({ type: 'timeout', requestId: r.id });
      checkGameOver(state);
    }
  }

  // A timeout (or a dropped arrival) may have ended the game: freeze the GPUs
  // for this tick.
  if (state.phase !== 'playing') return;

  for (let gi = 0; gi < state.gpus.length; gi++) {
    stepGpu(state, state.gpus[gi], gi, dt);
  }
}

function stepGpu(state, gpu, gi, dt) {
  if (gpu.boostActive) {
    gpu.boostTimer -= dt;
    if (gpu.boostTimer <= 0) gpu.boostActive = false;
  }
  if (gpu.boostCooldown > 0) gpu.boostCooldown = Math.max(0, gpu.boostCooldown - dt);

  const occupied = gpu.slots.reduce((n, r) => n + (r ? 1 : 0), 0);

  const heatRate =
    CONFIG.heatGainPerSlot * occupied -
    (CONFIG.heatLoss + CONFIG.coolingHeatLoss * state.upgrades.cooling);
  gpu.heat = clamp(gpu.heat + heatRate * dt, 0, CONFIG.heatMax);

  if (!gpu.throttled && gpu.heat >= CONFIG.throttleEnter) {
    gpu.throttled = true;
    state.events.push({ type: 'throttle', gpu: gi });
  } else if (gpu.throttled && gpu.heat <= CONFIG.throttleRelease) {
    gpu.throttled = false;
  }

  let speed = 1;
  if (gpu.throttled) speed *= CONFIG.throttleSpeed;
  if (gpu.boostActive) speed *= 2;

  let perSlot = 0;
  if (occupied > 0) {
    const base = CONFIG.baseThroughput + CONFIG.throughputBonus * state.upgrades.throughput;
    perSlot = (base * (1 + CONFIG.throughputPerSlot * (occupied - 1)) * speed) / occupied;
  }

  for (let si = 0; si < gpu.slots.length; si++) {
    const req = gpu.slots[si];
    if (!req) continue;
    if (req.stall > 0) {
      req.stall = Math.max(0, req.stall - dt);
      continue;
    }
    req.done += perSlot * (req.cacheHit ? CONFIG.cacheSpeed : 1) * dt;
    if (req.done >= req.tokens) {
      finishRequest(state, req);
      gpu.slots[si] = null;
    }
  }
}

function finishRequest(state, req) {
  const tenths = Math.round(state.multiplier * 10);
  const points = (req.tokens * (req.vip ? 2 : 1) * tenths) / 10;
  state.score += points;
  state.served += 1;
  state.multiplier =
    Math.min(CONFIG.multiplierMaxTenths, tenths + CONFIG.multiplierStepTenths) / 10;
  if (req.vip) {
    state.reputation = Math.min(
      CONFIG.maxReputation,
      state.reputation + CONFIG.vipReputationGain
    );
  }
  state.events.push({ type: 'served', requestId: req.id, points });
}

function arrive(state) {
  if (state.queue.length >= state.queueCap) {
    state.reputation = Math.max(0, state.reputation - CONFIG.dropReputationCost);
    state.multiplier = CONFIG.startMultiplier;
    state.events.push({ type: 'dropped' });
    checkGameOver(state);
    return;
  }
  const level = state.level;
  const prefixes = prefixesFor(level);
  const prefix = prefixes[Math.floor(nextRng(state) * prefixes.length)];
  const tokens =
    CONFIG.tokenMin +
    Math.floor(nextRng(state) * (CONFIG.tokenMax - CONFIG.tokenMin + 1));
  const vip = level >= CONFIG.vipLevelStart && nextRng(state) < CONFIG.vipChance;
  const maxPatience =
    (vip ? CONFIG.vipPatience : CONFIG.maxPatience) +
    CONFIG.patienceBonus * state.upgrades.patience;
  state.queue.push({
    id: state.nextId++,
    prefix,
    tokens,
    done: 0,
    patience: maxPatience,
    maxPatience,
    vip,
  });
}

// 3 different upgrades, chosen by the RNG (Fisher-Yates shuffle of the id
// list, first three taken).
function pickOffer(state) {
  const idx = UPGRADE_IDS.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(nextRng(state) * (i + 1));
    const tmp = idx[i];
    idx[i] = idx[j];
    idx[j] = tmp;
  }
  return idx.slice(0, CONFIG.upgradeCount).map((i) => UPGRADE_IDS[i]);
}

function checkGameOver(state) {
  if (state.reputation <= 0 && state.phase !== 'over') {
    state.phase = 'over';
    state.events.push({ type: 'gameOver' });
  }
}
