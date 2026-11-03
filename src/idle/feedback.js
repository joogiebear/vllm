// Sound and haptic feedback. Everything is defensive: play() never throws,
// even without an AudioContext (Node tests), without navigator.vibrate
// (iOS Safari) or without localStorage (settings fall back to defaults).
// Sounds are synthesized with WebAudio oscillators and gain envelopes; no
// audio files. All are under 250 ms, except prestige (~600 ms).
import { get as getSetting } from './settings.js?v=20261103050553';

const MASTER_VOLUME = 0.25;
const PAYOUT_MIN_GAP_MS = 120; // fast generators must not buzz

let ctx = null;
let master = null;
let initDone = false;
let lastPayoutAt = -Infinity;
let now = () => Date.now();

// Tests inject a clock to exercise the payout rate limit.
export function setClock(fn) {
  if (typeof fn === 'function') now = fn;
}

// Settings: a missing key (or a missing localStorage) means "on".
function soundOn() {
  try {
    return getSetting('sound') !== false;
  } catch (err) {
    return true;
  }
}

// Haptics are off when disabled or when reduceMotion is 'on'.
function hapticsOn() {
  try {
    if (getSetting('haptics') === false) return false;
    if (getSetting('reduceMotion') === 'on') return false;
    return true;
  } catch (err) {
    return true;
  }
}

// navigator.vibrate when present; iOS Safari has no vibrate, so this is a
// no-op there. Best-effort: never throws.
function vibrate(pattern) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch (err) {
    // vibration is best-effort
  }
}

// Lazily create the AudioContext (iOS requires a user gesture to start
// audio, so this is also called from the one-time gesture listeners).
function ensureCtx() {
  if (ctx) return ctx;
  const AC =
    typeof window !== 'undefined'
      ? window.AudioContext || window.webkitAudioContext
      : null;
  if (!AC) return null;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = MASTER_VOLUME;
    master.connect(ctx.destination);
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch (err) {
    ctx = null;
  }
  return ctx;
}

// Set up lazily: register one-time gesture listeners that unlock audio.
export function initFeedback() {
  if (initDone) return;
  initDone = true;
  try {
    if (typeof window !== 'undefined') {
      const unlock = () => {
        const c = ensureCtx();
        if (c && c.state === 'suspended') c.resume().catch(() => {});
      };
      window.addEventListener('pointerdown', unlock, { once: true, capture: true });
      window.addEventListener('keydown', unlock, { once: true, capture: true });
    }
  } catch (err) {
    // no window (Node): sound just stays off
  }
}

// One synthesized note: quick attack, linear release to silence.
function tone(freq, start, dur, vol, type = 'sine') {
  const c = ensureCtx();
  if (!c) return;
  try {
    const t0 = c.currentTime + start;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch (err) {
    // audio is best-effort
  }
}

// Haptic patterns per kind (payout and error: none).
function vibrateFor(kind) {
  if (!hapticsOn()) return;
  switch (kind) {
    case 'buy': vibrate(10); break;
    case 'hire': vibrate(20); break;
    case 'achievement': vibrate([15, 40, 15]); break;
    case 'prestige': vibrate([30, 60, 30]); break;
    default: break;
  }
}

// Play feedback for a game event. Never throws. Returns true when the
// event was not suppressed (settings off or payout rate limit), false
// when it was.
export function play(kind) {
  try {
    if (!soundOn() && !hapticsOn()) return false;
    const t = now();
    switch (kind) {
      case 'payout':
        // Rate-limited so fast generators do not buzz.
        if (t - lastPayoutAt < PAYOUT_MIN_GAP_MS) return false;
        lastPayoutAt = t;
        if (soundOn()) tone(1800, 0, 0.06, 0.35); // quiet high blip
        return true;
      case 'buy':
        if (soundOn()) tone(660, 0, 0.09, 0.8);
        vibrateFor('buy');
        return true;
      case 'hire':
        if (soundOn()) {
          tone(520, 0, 0.08, 0.8);
          tone(780, 0.07, 0.08, 0.8);
        }
        vibrateFor('hire');
        return true;
      case 'achievement':
        // Short rising arpeggio (C5, E5, G5).
        if (soundOn()) {
          tone(523, 0, 0.09, 0.9);
          tone(659, 0.07, 0.09, 0.9);
          tone(784, 0.14, 0.1, 0.9);
        }
        vibrateFor('achievement');
        return true;
      case 'prestige':
        // ~600 ms rising arpeggio (G4, C5, E5, G5, C6).
        if (soundOn()) {
          tone(392, 0, 0.2, 0.9);
          tone(523, 0.11, 0.2, 0.9);
          tone(659, 0.22, 0.2, 0.9);
          tone(784, 0.33, 0.2, 0.9);
          tone(1047, 0.44, 0.16, 0.9);
        }
        vibrateFor('prestige');
        return true;
      case 'error':
        if (soundOn()) tone(180, 0, 0.12, 0.7, 'square');
        return true;
      default:
        return false;
    }
  } catch (err) {
    return false;
  }
}
