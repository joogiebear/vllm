// Main loop and wiring. The only file that reads the clock (Date.now()).
import { tick, applyOffline, applyRush, autoProcureDue, buyAllUpgrades } from './core.js?v=20261103154813';
import { AUTOSAVE_SECONDS, RUSH_RESULT_KEY, ACHIEVEMENTS, OFFLINE_CAP_HOURS, WEIGHT_UPGRADES } from './data.js?v=20261103154813';
import { load, save, exportSave, importSave, hardReset } from './save.js?v=20261103154813';
import { get } from './settings.js?v=20261103154813';
import { createUI } from './ui.js?v=20261103154813';
import { fmt } from './fmt.js?v=20261103154813';
import { showWelcome } from './welcome.js?v=20261103154813';
import { toast } from './toast.js?v=20261103154813';
import { initFeedback } from './feedback.js?v=20261103154813';

const { state, savedAt } = load();
initFeedback();

// The UI holds a reference to this state object, so import and reset
// replace its fields in place instead of swapping the object.
function replaceState(s) {
  for (const k of Object.keys(state)) delete state[k];
  for (const k of Object.keys(s)) state[k] = s[k];
}

const io = {
  exportSave: (s, now) => exportSave(s, now),
  importSave: (text) => importSave(text),
  hardReset: () => hardReset(),
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
}

// Autosave when the tab goes hidden.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveNow();
});

readRushResult();
applyOfflineEarnings();
ui.update(state, Date.now());
document.getElementById('boot')?.remove();
setInterval(step, 100);
