// Save, load, export and import for the idle game.
// localStorage only, every access wrapped in try/catch. Timestamps are
// supplied by app.js (the only file that reads the clock); this module
// never reads the clock itself.
import { SAVE_VERSION, SAVE_KEY, SAVE_CORRUPT_KEY } from './data.js';
import { createState } from './core.js';

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch (err) {
    return null;
  }
}
function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    // private mode or full storage: the save just does not persist
  }
}
function safeRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch (err) {
    // ignore
  }
}

// Merge a saved state over fresh defaults: missing fields get defaults,
// wrong-typed fields get defaults, unknown fields are kept so that saves
// from a future version do not break this one.
function mergeState(saved) {
  if (saved === null || typeof saved !== 'object' || Array.isArray(saved)) return null;
  const s = createState();
  const num = (k) => {
    const v = saved[k];
    return typeof v === 'number' && Number.isFinite(v) ? v : s[k];
  };
  const bool = (k) => {
    const v = saved[k];
    return typeof v === 'boolean' ? v : s[k];
  };
  const timeOrNull = (k) => {
    const v = saved[k];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };
  s.tokens = num('tokens');
  s.lifetime = num('lifetime');
  s.totalLifetime = num('totalLifetime');
  s.weights = num('weights');
  s.weightsEarnedThisCycle = num('weightsEarnedThisCycle');
  s.heat = Math.min(100, Math.max(0, num('heat')));
  s.overclock = bool('overclock');
  s.throttled = bool('throttled');
  s.autoPause = bool('autoPause');
  s.rushCooldownUntil = timeOrNull('rushCooldownUntil');
  if (Array.isArray(saved.upgrades)) {
    s.upgrades = saved.upgrades.filter((x) => typeof x === 'string');
  }
  if (Array.isArray(saved.weightUpgrades)) {
    s.weightUpgrades = saved.weightUpgrades.filter((x) => typeof x === 'string');
  }
  if (saved.generators !== null && typeof saved.generators === 'object' && !Array.isArray(saved.generators)) {
    for (const id of Object.keys(s.generators)) {
      const v = saved.generators[id];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) s.generators[id] = Math.floor(v);
    }
  }
  // Keep unknown fields (forward compatibility).
  for (const k of Object.keys(saved)) {
    if (!(k in s) && k !== 'generators') s[k] = saved[k];
  }
  return s;
}

function validSaveShape(data) {
  return (
    data !== null &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    data.state !== null &&
    typeof data.state === 'object' &&
    !Array.isArray(data.state)
  );
}

// Write the save. `now` is the caller's timestamp (milliseconds).
export function save(state, now) {
  safeSet(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, savedAt: now, state }));
}

// Read the save. Returns { state, savedAt }. A missing save gives a fresh
// state; a corrupt one is kept under the corrupt key and also starts a new
// game.
export function load() {
  const raw = safeGet(SAVE_KEY);
  if (raw === null) return { state: createState(), savedAt: null };
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    data = null;
  }
  if (!validSaveShape(data)) {
    safeSet(SAVE_CORRUPT_KEY, raw);
    return { state: createState(), savedAt: null };
  }
  const state = mergeState(data.state);
  if (state === null) {
    safeSet(SAVE_CORRUPT_KEY, raw);
    return { state: createState(), savedAt: null };
  }
  const savedAt =
    typeof data.savedAt === 'number' && Number.isFinite(data.savedAt) ? data.savedAt : null;
  return { state, savedAt };
}

// Export as base64 text. `now` is the caller's timestamp (milliseconds).
export function exportSave(state, now) {
  const payload = JSON.stringify({ version: SAVE_VERSION, savedAt: now, state });
  return btoa(unescape(encodeURIComponent(payload)));
}

// Import from base64 text. Returns the merged state, or null if the text is
// not a valid save.
export function importSave(text) {
  if (typeof text !== 'string' || text.trim() === '') return null;
  let data;
  try {
    data = JSON.parse(decodeURIComponent(escape(atob(text.trim()))));
  } catch (err) {
    return null;
  }
  if (!validSaveShape(data)) return null;
  return mergeState(data.state);
}

// Hard reset: remove the save (the corrupt copy is left for inspection).
export function hardReset() {
  safeRemove(SAVE_KEY);
}
