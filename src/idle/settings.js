// Settings (docs/COMPLETION.md, "Settings"): user preferences stored in
// localStorage under one JSON object. Every access is wrapped in try/catch,
// so private mode or a missing localStorage (tests, Node) just falls back
// to the defaults and set() silently does not persist.
const KEY = 'overclock.settings';

const DEFAULTS = {
  numberFormat: 'short',
  confirmPrestige: true,
  reduceMotion: 'auto',
  sound: true,
  haptics: true,
};

function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return {};
    const parsed = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (err) {
    return {};
  }
}

// Read one setting; unknown or missing keys fall back to the default.
export function get(key) {
  const v = readAll()[key];
  return v === undefined ? DEFAULTS[key] : v;
}

// Write one setting; unknown keys are ignored. Never throws.
export function set(key, value) {
  if (!(key in DEFAULTS)) return;
  try {
    const all = readAll();
    all[key] = value;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch (err) {
    // private mode: the setting just does not persist
  }
}
