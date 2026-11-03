// Achievement checks (docs/COMPLETION.md). Pure: the only mutation is
// appending newly met ids to state.achievements.
import { ACHIEVEMENTS, MANAGERS, REGION_PERKS } from './data.js?v=20261103182600';

// Evaluate one JSON-safe test descriptor against the state.
function met(test, state) {
  const stats = state.stats || {};
  const managers = Array.isArray(state.managers) ? state.managers : [];
  const generators = state.generators || {};
  switch (test.kind) {
    case 'owned':
      return (generators[test.gen] || 0) >= test.n;
    case 'lifetime':
      return (state.lifetime || 0) >= test.n;
    case 'prestiges':
      return (stats.prestiges || 0) >= test.n;
    case 'taps':
      return (stats.taps || 0) >= test.n;
    case 'rushGames':
      return (stats.rushGames || 0) >= test.n;
    case 'events':
      return (stats.eventsClaimed || 0) >= test.n;
    case 'regions':
      return (state.regionsEarned || 0) >= test.n;
    case 'allPerks': {
      const perks = Array.isArray(state.regionPerks) ? state.regionPerks : [];
      return REGION_PERKS.every((p) => perks.includes(p.id));
    }
    case 'allManagers':
      return MANAGERS.every((m) => managers.includes(m.id));
    default:
      return false;
  }
}

// Check every achievement against the state. Appends newly met ids to
// state.achievements (kept across prestiges) and returns them; ids already
// unlocked are never returned twice.
export function checkAchievements(state) {
  const unlocked = [];
  if (state === null || typeof state !== 'object') return unlocked;
  if (!Array.isArray(state.achievements)) state.achievements = [];
  for (const a of ACHIEVEMENTS) {
    if (state.achievements.includes(a.id)) continue;
    if (met(a.test, state)) {
      state.achievements.push(a.id);
      unlocked.push(a.id);
    }
  }
  return unlocked;
}
