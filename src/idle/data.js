// Table data for the idle game. Values transcribed from docs/IDLE-DESIGN.md.
// No logic: exported constants only.

export const GENERATORS = [
  { id: 'pi', name: 'Raspberry Pi', baseCost: 15, tps: 1 },
  { id: 'gamer', name: 'Gaming GPU', baseCost: 220, tps: 8 },
  { id: 'workstation', name: 'Workstation', baseCost: 2400, tps: 47 },
  { id: 'rack', name: 'Rack Server', baseCost: 26000, tps: 260 },
  { id: 'cluster', name: 'GPU Cluster', baseCost: 140000, tps: 1400 },
  { id: 'datacenter', name: 'Datacenter', baseCost: 2000000, tps: 7800 },
  { id: 'campus', name: 'Fusion Campus', baseCost: 33000000, tps: 44000 },
  { id: 'swarm', name: 'Dyson Inference Swarm', baseCost: 510000000, tps: 260000 },
];

export const COST_GROWTH = 1.15;
export const DOUBLING_THRESHOLDS = [25, 50, 100, 200, 400];
// A generator is shown once lifetime reaches this fraction of its base cost.
export const GENERATOR_REVEAL_FRACTION = 0.5;

export const UPGRADES = [
  { id: 'quant', name: 'Quantization', cost: 100, kind: 'production', value: 1.5 },
  { id: 'batch', name: 'Dynamic Batching', cost: 1000, kind: 'production', value: 2 },
  { id: 'prefix1', name: 'Prefix Cache', cost: 5000, kind: 'cacheRate', value: 0.25 },
  { id: 'fans', name: 'Bigger Fans', cost: 8000, kind: 'cooling', value: 0.5 },
  { id: 'macro', name: 'Keyboard Macro', cost: 500, kind: 'clickFlat', value: 4 },
  { id: 'api', name: 'Public API', cost: 20000, kind: 'clickShare', value: 0.02 },
  { id: 'flash', name: 'Flash Attention', cost: 50000, kind: 'production', value: 2 },
  { id: 'prefix2', name: 'Radix Cache', cost: 250000, kind: 'cacheRate', value: 0.5 },
  { id: 'liquid', name: 'Liquid Cooling', cost: 400000, kind: 'cooling', value: 0.75 },
  { id: 'spec', name: 'Speculative Decoding', cost: 2000000, kind: 'production', value: 3 },
  { id: 'api2', name: 'Enterprise Contract', cost: 5000000, kind: 'clickShare', value: 0.03 },
  { id: 'mxfp', name: 'MXFP4 Weights', cost: 40000000, kind: 'production', value: 3 },
  { id: 'prefix3', name: 'Disaggregated Cache', cost: 200000000, kind: 'cacheRate', value: 1 },
  { id: 'immersion', name: 'Immersion Cooling', cost: 500000000, kind: 'cooling', value: 1 },
  { id: 'custom', name: 'Custom Silicon', cost: 5000000000, kind: 'production', value: 5 },
];

export const WEIGHT_UPGRADES = [
  { id: 'seed', name: 'Seed Funding', cost: 1, kind: 'startTokens', value: 1000 },
  { id: 'night', name: 'Night Shift', cost: 3, kind: 'offlineRate', value: 0.75 },
  { id: 'warm', name: 'Warm Cache', cost: 1, kind: 'cacheRate', value: 0.25 },
  { id: 'procure', name: 'Procurement Bot', cost: 1, kind: 'buyAll', value: true },
  { id: 'long', name: 'Long Weekend', cost: 15, kind: 'offlineCap', value: 24 },
  { id: 'auto', name: 'Autoscaler', cost: 20, kind: 'auto', value: true },
  { id: 'distill', name: 'Knowledge Distillation', cost: 50, kind: 'weightBonus', value: 0.13 },
];

// weightsAvailable = floor(sqrt(totalLifetime / PRESTIGE_DIVISOR)) - weightsEarnedThisCycle
export const PRESTIGE_DIVISOR = 100000000000;

export const OFFLINE_CAP_HOURS = 8;
export const OFFLINE_RATE = 0.5;

export const RUSH_COOLDOWN_SECONDS = 600; // 10 minutes
export const RUSH_MAX_SECONDS = 600; // payout = tokensPerSecond * min(600, score / 50)
export const RUSH_SCORE_DIVISOR = 50;

export const HEAT_MAX = 100;
export const HEAT_THROTTLE_OFF = 40;
export const OVERCLOCK_HEAT_RATE = 2; // per second, minus cooling
export const COOL_RATE = 5; // per second while overclock is off
export const OVERCLOCK_FACTOR = 2;
export const THROTTLE_FACTOR = 0.5;
export const WEIGHT_BONUS_PER_WEIGHT = 0.1;

// Autoscaler: overclock turns itself off at 95 and back on at 40.
export const AUTO_HEAT_LIMIT = 95;
export const AUTO_REON_HEAT = 40;

export const SAVE_VERSION = 1;
export const SAVE_KEY = 'overclock.idle.v1';
export const SAVE_CORRUPT_KEY = 'overclock.idle.corrupt';
export const RUSH_RESULT_KEY = 'overclock.rush';
export const AUTOSAVE_SECONDS = 15;
