// Table data for the idle game. Values transcribed from docs/IDLE-DESIGN.md
// and docs/CYCLES-DESIGN.md. No logic: exported constants only.

export const GENERATORS = [
  { id: 'pi', name: 'Raspberry Pi', baseCost: 15, tps: 1, cycleSeconds: 7 },
  { id: 'gamer', name: 'Gaming GPU', baseCost: 500, tps: 8, cycleSeconds: 3 },
  { id: 'workstation', name: 'Workstation', baseCost: 2400, tps: 47, cycleSeconds: 6 },
  { id: 'rack', name: 'Rack Server', baseCost: 26000, tps: 260, cycleSeconds: 12 },
  { id: 'cluster', name: 'GPU Cluster', baseCost: 140000, tps: 1400, cycleSeconds: 24 },
  { id: 'datacenter', name: 'Datacenter', baseCost: 2000000, tps: 7800, cycleSeconds: 48 },
  { id: 'campus', name: 'Fusion Campus', baseCost: 33000000, tps: 44000, cycleSeconds: 96 },
  { id: 'swarm', name: 'Dyson Inference Swarm', baseCost: 510000000, tps: 260000, cycleSeconds: 192 },
  { id: 'orbital', name: 'Orbital Compute Ring', baseCost: 8e9, tps: 1.5e6, cycleSeconds: 384 },
  { id: 'lunar', name: 'Lunar Datacenter', baseCost: 1.3e11, tps: 9e6, cycleSeconds: 768 },
  { id: 'matrioshka', name: 'Matrioshka Brain', baseCost: 2.2e12, tps: 5.4e7, cycleSeconds: 1536 },
  { id: 'singularity', name: 'Inference Singularity', baseCost: 4e13, tps: 3.3e8, cycleSeconds: 3072 },
];

export const COST_GROWTH = 1.15;
// Milestones: at these owned counts the cycle time halves (speed x2),
// replacing the old output doubling. The managed steady-state rate is
// unchanged: payout / shorter cycle time.
export const DOUBLING_THRESHOLDS = [25, 50, 100, 200, 400];
// A cycle shorter than this many seconds is treated as continuous: the bar
// shows full and the row pays every tick.
export const CONTINUOUS_CYCLE_MAX = 0.25;
// A generator is shown once lifetime reaches this fraction of its base cost.
export const GENERATOR_REVEAL_FRACTION = 0.5;

// One manager per generator. Bought with tokens on the Upgrades tab; resets
// on prestige like regular upgrades. A managed row restarts itself forever.
export const MANAGERS = [
  { id: 'pi', name: 'Cron Job', cost: 100 },
  { id: 'gamer', name: 'Driver Daemon', cost: 15000 },
  { id: 'workstation', name: 'Build Bot', cost: 100000 },
  { id: 'rack', name: 'Load Balancer', cost: 1000000 },
  { id: 'cluster', name: 'Scheduler', cost: 25000000 },
  { id: 'datacenter', name: 'Orchestrator', cost: 500000000 },
  { id: 'campus', name: 'Fleet Controller', cost: 10000000000 },
  { id: 'swarm', name: 'Swarm Mind', cost: 200000000000 },
  { id: 'orbital', name: 'Orbit Ops', cost: 4e12 },
  { id: 'lunar', name: 'Lunar Admin', cost: 8e13 },
  { id: 'matrioshka', name: 'Brain Warden', cost: 1.6e15 },
  { id: 'singularity', name: 'Event Horizon', cost: 3.2e16 },
];

// kind: 'production' multiplies every row's output; 'productionTier'
// multiplies one tier's output; 'cacheRate' adds to the rate multiplier.
export const UPGRADES = [
  { id: 'quant', name: 'Quantization', cost: 100, kind: 'production', value: 1.5 },
  { id: 'batch', name: 'Dynamic Batching', cost: 1000, kind: 'production', value: 2 },
  { id: 'pi3', name: 'x3 Raspberry Pi output', cost: 2000, kind: 'productionTier', tier: 'pi', value: 3 },
  { id: 'prefix1', name: 'Prefix Cache', cost: 5000, kind: 'cacheRate', value: 0.25 },
  { id: 'gamer3', name: 'x3 Gaming GPU output', cost: 10000, kind: 'productionTier', tier: 'gamer', value: 3 },
  { id: 'flash', name: 'Flash Attention', cost: 50000, kind: 'production', value: 2 },
  { id: 'workstation3', name: 'x3 Workstation output', cost: 100000, kind: 'productionTier', tier: 'workstation', value: 3 },
  { id: 'prefix2', name: 'Radix Cache', cost: 250000, kind: 'cacheRate', value: 0.5 },
  { id: 'rack3', name: 'x3 Rack Server output', cost: 1000000, kind: 'productionTier', tier: 'rack', value: 3 },
  { id: 'spec', name: 'Speculative Decoding', cost: 2000000, kind: 'production', value: 3 },
  { id: 'cluster3', name: 'x3 GPU Cluster output', cost: 10000000, kind: 'productionTier', tier: 'cluster', value: 3 },
  { id: 'mxfp', name: 'MXFP4 Weights', cost: 40000000, kind: 'production', value: 3 },
  { id: 'datacenter3', name: 'x3 Datacenter output', cost: 100000000, kind: 'productionTier', tier: 'datacenter', value: 3 },
  { id: 'prefix3', name: 'Disaggregated Cache', cost: 200000000, kind: 'cacheRate', value: 1 },
  { id: 'custom', name: 'Custom Silicon', cost: 5000000000, kind: 'production', value: 5 },
  { id: 'orbital3', name: 'x3 Orbital Compute Ring output', cost: 4e11, kind: 'productionTier', tier: 'orbital', value: 3 },
  { id: 'lunar3', name: 'x3 Lunar Datacenter output', cost: 6.5e12, kind: 'productionTier', tier: 'lunar', value: 3 },
  { id: 'matrioshka3', name: 'x3 Matrioshka Brain output', cost: 1.1e14, kind: 'productionTier', tier: 'matrioshka', value: 3 },
  { id: 'singularity3', name: 'x3 Inference Singularity output', cost: 2e15, kind: 'productionTier', tier: 'singularity', value: 3 },
];

// Removed in the v2 save (the click and cooling upgrades). A v1 save holding
// one is refunded at its cost by migrate() in core.js.
export const REMOVED_UPGRADES = [
  { id: 'macro', name: 'Keyboard Macro', cost: 500 },
  { id: 'api', name: 'Public API', cost: 20000 },
  { id: 'api2', name: 'Enterprise Contract', cost: 5000000 },
  { id: 'fans', name: 'Bigger Fans', cost: 8000 },
  { id: 'liquid', name: 'Liquid Cooling', cost: 400000 },
  { id: 'immersion', name: 'Immersion Cooling', cost: 500000000 },
];

export const WEIGHT_UPGRADES = [
  { id: 'seed', name: 'Seed Funding', cost: 1, kind: 'startTokens', value: 1000 },
  { id: 'night', name: 'Night Shift', cost: 3, kind: 'offlineRate', value: 0.75 },
  { id: 'warm', name: 'Warm Cache', cost: 1, kind: 'cacheRate', value: 0.25 },
  { id: 'procure', name: 'Procurement Bot', cost: 1, kind: 'buyAll', value: true },
  { id: 'long', name: 'Long Weekend', cost: 15, kind: 'offlineCap', value: 24 },
  // Standing Orders replaces the old Autoscaler: start each run with the
  // Cron Job manager hired.
  { id: 'auto', name: 'Standing Orders', cost: 20, kind: 'standingOrders', value: true },
  { id: 'distill', name: 'Knowledge Distillation', cost: 50, kind: 'weightBonus', value: 0.13 },
];

// weightsAvailable = floor(sqrt(totalLifetime / PRESTIGE_DIVISOR)) - weightsEarnedThisCycle
export const PRESTIGE_DIVISOR = 100000000000;

export const OFFLINE_CAP_HOURS = 8;
export const OFFLINE_RATE = 0.5;

export const RUSH_COOLDOWN_SECONDS = 600; // 10 minutes
export const RUSH_MAX_SECONDS = 600; // payout = tokensPerSecond * min(600, score / 50)
export const RUSH_SCORE_DIVISOR = 50;

// Achievements (docs/COMPLETION.md). 60 entries, generated:
// - every generator at 1, 25, 100 and 400 owned: 12 * 4 = 48
// - lifetime-in-run tokens of 1M, 1B, 1T and 1Qa: 4
// - prestiges 1, 5 and 25: 3
// - all 12 managers hired in one run: 1
// - taps 100 and 1,000: 2
// - rush games 1 and 10: 2
// Each test is a JSON-safe descriptor (no functions), evaluated by
// checkAchievements() in achievements.js.
const ACH_TIER_NAMES = { 1: 'First Boot', 25: '25 Online', 100: 'Server Farm', 400: 'Overkill' };
export const ACHIEVEMENTS = [
  ...GENERATORS.flatMap((g) =>
    [1, 25, 100, 400].map((n) => ({
      id: `gen-${g.id}-${n}`,
      name: `${g.name}: ${ACH_TIER_NAMES[n]}`,
      desc: `Own ${n} ${g.name}${n === 1 ? '' : 's'}`,
      test: { kind: 'owned', gen: g.id, n },
    }))
  ),
  { id: 'lifetime-1m', name: '1M This Run', desc: 'Earn 1M tokens this run', test: { kind: 'lifetime', n: 1e6 } },
  { id: 'lifetime-1b', name: '1B This Run', desc: 'Earn 1B tokens this run', test: { kind: 'lifetime', n: 1e9 } },
  { id: 'lifetime-1t', name: '1T This Run', desc: 'Earn 1T tokens this run', test: { kind: 'lifetime', n: 1e12 } },
  { id: 'lifetime-1qa', name: '1Qa This Run', desc: 'Earn 1Qa tokens this run', test: { kind: 'lifetime', n: 1e15 } },
  { id: 'prestige-1', name: 'First Prestige', desc: 'Prestige 1 time', test: { kind: 'prestiges', n: 1 } },
  { id: 'prestige-5', name: '5 Prestiges', desc: 'Prestige 5 times', test: { kind: 'prestiges', n: 5 } },
  { id: 'prestige-25', name: '25 Prestiges', desc: 'Prestige 25 times', test: { kind: 'prestiges', n: 25 } },
  { id: 'managers-all', name: 'Full Management', desc: 'Hire all 12 managers in one run', test: { kind: 'allManagers' } },
  { id: 'taps-100', name: '100 Taps', desc: 'Start 100 rows by hand', test: { kind: 'taps', n: 100 } },
  { id: 'taps-1000', name: '1,000 Taps', desc: 'Start 1,000 rows by hand', test: { kind: 'taps', n: 1000 } },
  { id: 'rush-1', name: 'First Rush', desc: 'Play 1 rush game', test: { kind: 'rushGames', n: 1 } },
  { id: 'rush-10', name: '10 Rushes', desc: 'Play 10 rush games', test: { kind: 'rushGames', n: 10 } },
];

export const WEIGHT_BONUS_PER_WEIGHT = 0.1;

export const SAVE_VERSION = 2;

// Every run starts with one of these, so a new or reset run can earn without clicking.
export const STARTER_GENERATOR = 'pi';
export const SAVE_KEY = 'overclock.idle.v1';
export const SAVE_CORRUPT_KEY = 'overclock.idle.corrupt';
export const RUSH_RESULT_KEY = 'overclock.rush';
export const AUTOSAVE_SECONDS = 15;
