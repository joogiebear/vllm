// Main loop and wiring. The only file that reads the clock (Date.now()).
import { tick, applyOffline, applyRush, autoProcureDue, buyAllUpgrades } from './core.js?v=20261104013909';
import { AUTOSAVE_SECONDS, RUSH_RESULT_KEY, ACHIEVEMENTS, OFFLINE_CAP_HOURS, WEIGHT_UPGRADES } from './data.js?v=20261104013909';
import { load, save, exportSave, importSave, hardReset, backupNow, listBackups, restoreBackup, BACKUP_GAP_MS } from './save.js?v=20261104013909';
import { get } from './settings.js?v=20261104013909';
import { createUI } from './ui.js?v=20261104013909';
import { applyBackground } from './bg.js?v=20261104013909';
import { fmt } from './fmt.js?v=20261104013909';
import { showWelcome } from './welcome.js?v=20261104013909';
import { toast } from './toast.js?v=20261104013909';
import { initFeedback } from './feedback.js?v=20261104013909';

const { state, savedAt, restoredFrom } = load();
initFeedback();

// The main save was unreadable and load() fell back to a backup: tell
// the player, with the backup's time (HH:MM).
if (restoredFrom !== null) {
  const when =
    savedAt !== null
      ? String(new Date(savedAt).getHours()).padStart(2, '0') +
        ':' +
        String(new Date(savedAt).getMinutes()).padStart(2, '0')
      : 'the last backup';
  toast(`Your save couldn't be read, so we restored the backup from ${when}.`);
}

// The UI holds a reference to this state object, so import and reset
// replace its fields in place instead of swapping the object.
// Prestige/Region detection: stats.prestiges and regionsEarned only ever
// grow (expandRegion resets weights to 0, so weights is not a usable
// signal).
let prevPrestiges = state.stats && typeof state.stats.prestiges === 'number' ? state.stats.prestiges : 0;
let prevRegions = state.regionsEarned || 0;
function refreshMilestones() {
  prevPrestiges = state.stats && typeof state.stats.prestiges === 'number' ? state.stats.prestiges : 0;
  prevRegions = state.regionsEarned || 0;
}
function replaceState(s) {
  for (const k of Object.keys(state)) delete state[k];
  for (const k of Object.keys(s)) state[k] = s[k];
  refreshMilestones();
}

const io = {
  exportSave: (s, now) => exportSave(s, now),
  importSave: (text) => importSave(text),
  hardReset: () => hardReset(),
  listBackups: () => listBackups(),
  restoreBackup: (slot) => restoreBackup(slot),
  replaceState,
};

const ui = createUI(state, io);

// Rush result from the arcade (main.js stores it on game over): read once
// on load, then remove, then pay out. applyRush ignores a call while the
// cooldown is still running.
function readRushResult() {
  let raw = null;
  try {
    raw = localStorage.getItem(RUSH_RESULT_KEY);
  } catch (err) {
    raw = null;
  }
  if (raw === null) return;
  try {
    localStorage.removeItem(RUSH_RESULT_KEY);
  } catch (err) {
    // ignore
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    return;
  }
  if (
    data === null ||
    typeof data !== 'object' ||
    typeof data.score !== 'number' ||
    !Number.isFinite(data.score) ||
    data.score < 0
  ) {
    return;
  }
  const now = Date.now();
  const earned = applyRush(state, data.score, now);
  if (earned > 0) ui.showBanner(`Rush payout: +${fmt(earned)} tokens`);
}

// Offline earnings from the last save timestamp.
function offlineCapped(state, seconds) {
  // Mirrors applyOffline's cap: true when the gap exceeds the offline cap.
  const long = WEIGHT_UPGRADES.find((u) => u.id === 'long');
  const capHours = long && (state.weightUpgrades || []).includes('long') ? long.value : OFFLINE_CAP_HOURS;
  return seconds > capHours * 3600;
}
function applyOfflineEarnings() {
  if (savedAt === null) return;
  const now = Date.now();
  const seconds = (now - savedAt) / 1000;
  if (seconds < 5) return; // short gaps: nothing to report
  const earned = applyOffline(state, seconds);
  if (earned > 0) showWelcome({ awaySeconds: seconds, earned, capped: offlineCapped(state, seconds) });
}

function saveNow() {
  save(state, Date.now());
}

// Main loop: setInterval at 10 Hz, driven by the real clock. dt is the
// actual elapsed time; gaps over 60 s go through applyOffline (which caps
// them at the offline cap) instead of a tick.
let last = Date.now();
let lastRender = 0;
let lastSave = last;
let lastBackup = last;
function step() {
  const now = Date.now();
  const dt = Math.max(0, (now - last) / 1000);
  last = now;
  if (dt > 60) {
    const earned = applyOffline(state, dt);
    if (earned > 0) showWelcome({ awaySeconds: dt, earned, capped: offlineCapped(state, dt) });
  } else {
    // checkAchievements (inside tick) appends newly unlocked ids; compare the
    // length before and after and toast each new one.
    const before = (state.achievements || []).length;
    tick(state, dt);
    const after = state.achievements || [];
    for (let i = before; i < after.length; i++) {
      const a = ACHIEVEMENTS.find((x) => x.id === after[i]);
      toast('Achievement: ' + (a ? a.name : after[i]));
    }
    // Auto-Procure: every 10 s, when the perk is owned and the setting
    // is not off.
    if (autoProcureDue(state, dt) && get('autoProcure') !== false) buyAllUpgrades(state);
  }
  if (now - lastRender >= 100) {
    lastRender = now;
    ui.update(state, now);
  }
  if (now - lastSave >= AUTOSAVE_SECONDS * 1000) {
    lastSave = now;
    saveNow();
  }
  // Backups (docs/STABILITY-DESIGN.md section 3): a forced backup when a
  // prestige or Region expansion just happened, otherwise at most one
  // per 5 minutes of play (the gap itself is enforced inside backupNow).
  const prestiges = state.stats && typeof state.stats.prestiges === 'number' ? state.stats.prestiges : 0;
  const regions = state.regionsEarned || 0;
  if (prestiges > prevPrestiges || regions > prevRegions) {
    refreshMilestones();
    backupNow(state, now, true);
  }
  if (now - lastBackup >= BACKUP_GAP_MS) {
    lastBackup = now;
    backupNow(state, now, false);
  }
}

// Autosave when the tab goes hidden.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveNow();
});

readRushResult();
applyOfflineEarnings();
applyBackground(state);
ui.update(state, Date.now());
document.getElementById('boot')?.remove();
setInterval(step, 100);

// Service worker (docs/STABILITY-DESIGN.md, section 2): offline play and
// instant start. Only where service workers are allowed: https:, or the
// local hosts.
if (
  'serviceWorker' in navigator &&
  (location.protocol === 'https:' ||
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1')
) {
  navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {});
}
