// Save, load, export and import for the idle game.
// localStorage only, every access wrapped in try/catch. Timestamps are
// supplied by app.js (the only file that reads the clock); this module
// never reads the clock itself.
import { SAVE_VERSION, SAVE_KEY, SAVE_CORRUPT_KEY } from './data.js?v=20261103235137';
import { createState, migrate, ensureStarter } from './core.js?v=20261103235137';

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

// Backup slots (docs/STABILITY-DESIGN.md section 3): b1 is the newest,
// b3 the oldest. Each stores { savedAt, lifetime, data } where data is
// the main save payload.
export const BACKUP_KEYS = [SAVE_KEY + ':b1', SAVE_KEY + ':b2', SAVE_KEY + ':b3'];
export const BACKUP_GAP_MS = 5 * 60 * 1000; // at most one backup per 5 minutes of play

// Read one backup slot. Returns the slot object, or null when the slot
// is missing, unparseable or malformed.
function readBackup(key) {
  const raw = safeGet(key);
  if (raw === null) return null;
  let slot;
  try {
    slot = JSON.parse(raw);
  } catch (err) {
    return null;
  }
  if (
    slot === null ||
    typeof slot !== 'object' ||
    Array.isArray(slot) ||
    typeof slot.savedAt !== 'number' ||
    !Number.isFinite(slot.savedAt) ||
    !validSaveShape(slot.data)
  ) {
    return null;
  }
  return slot;
}

// Merge a saved state over fresh defaults: missing fields get defaults,
// wrong-typed fields get defaults, unknown fields are kept so that saves
// from a future version do not break this one.
// Tiers added after a save was written (absent from it) stay at 0 owned /
// null cycles, because the merge starts from createState().
function mergeState(saved) {
  if (saved === null || typeof saved !== 'object' || Array.isArray(saved)) return null;
  const s = createState();
  const num = (k) => {
    const v = saved[k];
    return typeof v === 'number' && Number.isFinite(v) ? v : s[k];
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
  if (Array.isArray(saved.managers)) {
    s.managers = saved.managers.filter((x) => typeof x === 'string');
  }
  if (saved.cycles !== null && typeof saved.cycles === 'object' && !Array.isArray(saved.cycles)) {
    for (const id of Object.keys(s.cycles)) {
      const v = saved.cycles[id];
      s.cycles[id] = typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
    }
  }
  s.rushCooldownUntil = timeOrNull('rushCooldownUntil');
  if (saved.stats && typeof saved.stats === 'object' && !Array.isArray(saved.stats)) {
    for (const k of Object.keys(s.stats)) {
      const v = saved.stats[k];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) s.stats[k] = v;
    }
  }
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

// Copy the current state into the backup slots, rotating b1 <- b2 <- b3
// (b1 is always the newest). `force` bypasses the 5-minute gap (used by
// prestige and Region expansion). Returns true when a backup was written.
export function backupNow(state, now, force) {
  const b1 = readBackup(BACKUP_KEYS[0]);
  if (!force && b1 !== null && now - b1.savedAt < BACKUP_GAP_MS) return false;
  const b2 = readBackup(BACKUP_KEYS[1]);
  // Old b2 becomes b3, old b1 becomes b2, the new backup is b1.
  if (b2 === null) safeRemove(BACKUP_KEYS[2]);
  else safeSet(BACKUP_KEYS[2], JSON.stringify(b2));
  if (b1 === null) safeRemove(BACKUP_KEYS[1]);
  else safeSet(BACKUP_KEYS[1], JSON.stringify(b1));
  safeSet(
    BACKUP_KEYS[0],
    JSON.stringify({
      savedAt: now,
      lifetime: typeof state.lifetime === 'number' && Number.isFinite(state.lifetime) ? state.lifetime : 0,
      data: { version: SAVE_VERSION, savedAt: now, state },
    })
  );
  return true;
}

// Turn a parsed save payload into a playable state, or null when it
// cannot be migrated (migrate() refuses invalid states).
function hydrate(data) {
  if (!validSaveShape(data)) return null;
  const state = ensureStarter(migrate(data.state));
  if (state === null) return null;
  const savedAt =
    typeof data.savedAt === 'number' && Number.isFinite(data.savedAt) ? data.savedAt : null;
  return { state, savedAt };
}

// Read the save. Returns { state, savedAt, restoredFrom }. A missing save
// gives a fresh state; a corrupt one is kept under the corrupt key, and
// the backups are tried in order b1, b2, b3 (restoredFrom is the slot
// name, or null when the main save was used or nothing was restored).
// A restored backup is written back to the main save so the next load
// reads it directly.
export function load() {
  const raw = safeGet(SAVE_KEY);
  if (raw === null) return { state: ensureStarter(createState()), savedAt: null, restoredFrom: null };
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    data = null;
  }
  const main = hydrate(data);
  if (main !== null) return { ...main, restoredFrom: null };
  // The main save fails to parse or migrate: keep it for diagnosis and
  // fall back to the newest backup that works.
  safeSet(SAVE_CORRUPT_KEY, raw);
  for (let i = 0; i < BACKUP_KEYS.length; i++) {
    const slot = readBackup(BACKUP_KEYS[i]);
    if (slot === null) continue;
    const restored = hydrate(slot.data);
    if (restored === null) continue;
    safeSet(SAVE_KEY, JSON.stringify(slot.data));
    return { ...restored, restoredFrom: 'b' + (i + 1) };
  }
  return { state: ensureStarter(createState()), savedAt: null, restoredFrom: null };
}

// For the Settings "Backups" section: the three slots, b1 (newest)
// first; null entries are empty slots.
export function listBackups() {
  return BACKUP_KEYS.map((key, i) => {
    const slot = readBackup(key);
    if (slot === null) return null;
    return {
      slot: 'b' + (i + 1),
      savedAt: slot.savedAt,
      lifetime:
        typeof slot.lifetime === 'number' && Number.isFinite(slot.lifetime) ? slot.lifetime : 0,
    };
  });
}

// Manual restore (Settings): load a slot over the main save and return
// the resulting state, or null when the slot is empty or unreadable.
export function restoreBackup(slot) {
  const i = slot === 'b1' ? 0 : slot === 'b2' ? 1 : slot === 'b3' ? 2 : -1;
  if (i < 0) return null;
  const backup = readBackup(BACKUP_KEYS[i]);
  if (backup === null) return null;
  const restored = hydrate(backup.data);
  if (restored === null) return null;
  safeSet(SAVE_KEY, JSON.stringify(backup.data));
  return restored.state;
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
  const version = typeof data.version === 'number' ? data.version : 1;
  return ensureStarter(migrate(data.state));
}

// Hard reset: remove the save and the backup slots (the corrupt copy is
// left for inspection).
export function hardReset() {
  safeRemove(SAVE_KEY);
  for (const key of BACKUP_KEYS) safeRemove(key);
}
