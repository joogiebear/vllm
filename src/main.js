// OVERCLOCK main: canvas sizing, the fixed-step loop, and the wiring of
// sim, render, input and audio.

import { createGame, step, TICK_SECONDS } from './sim.js?v=20261103235137';
import { render, ingestEvents, resetFx } from './render.js?v=20261103235137';
import { createInput } from './input.js?v=20261103235137';
import { createAudio } from './audio.js?v=20261103235137';

const W = 960;
const H = 600;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// --- seed -------------------------------------------------------------------
// A fresh random seed per run, generated here (not in sim.js). `?seed=N`
// forces a specific seed for reproducible runs.
function pickSeed() {
  const p = new URLSearchParams(location.search);
  const forced = p.get('seed');
  if (forced !== null && /^\d+$/.test(forced)) return Number(forced) >>> 0;
  return (Math.random() * 0x100000000) >>> 0;
}

// --- best score (the only localStorage use) ----------------------------------
const BEST_KEY = 'overclock-best';
function loadBest() {
  try {
    const v = Number(localStorage.getItem(BEST_KEY));
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  } catch (err) {
    return 0;
  }
}
function saveBest(v) {
  try {
    localStorage.setItem(BEST_KEY, String(v));
  } catch (err) {
    // private mode etc.: the best score just does not persist
  }
}

// Rush result for the idle game: on game over, store { score, at } under this
// key; the idle page reads and removes it on load.
const RUSH_KEY = 'overclock.rush';
function saveRushResult(score) {
  try {
    localStorage.setItem(RUSH_KEY, JSON.stringify({ score, at: Date.now() }));
  } catch (err) {
    // private mode etc.: the rush result just does not persist
  }
}

// The "Back to the server" link on the game-over screen.
let backLink = null;
function showBackLink(show) {
  if (!backLink) backLink = document.getElementById('back-to-server');
  if (backLink) backLink.style.display = show ? 'block' : 'none';
}

// --- game + view state --------------------------------------------------------
// The state object keeps one identity for the page's lifetime; starting a new
// run reassigns its fields in place, so closures (input, debug hook) stay
// valid across restarts.
let currentSeed = pickSeed();
const state = createGame(currentSeed);

const ui = {
  screen: 'title', // 'title' | 'playing' | 'over'
  selectedId: null,
  drag: null,
  hover: null,
  paused: false,
  muted: false,
  best: loadBest(),
};

// requestId -> { vip, prefix } for the current run; rebuilt from the queue and
// the slots before each step, so a request that finishes in a tick is still
// known to the audio and effect handlers.
const reqInfo = new Map();
function trackRequests() {
  reqInfo.clear();
  for (const r of state.queue) reqInfo.set(r.id, { vip: r.vip, prefix: r.prefix });
  for (const g of state.gpus) {
    for (const r of g.slots) if (r) reqInfo.set(r.id, { vip: r.vip, prefix: r.prefix });
  }
}

// Actions collected since the last tick; they are consumed by the first step
// of the next tick (and only that one).
const queuedActions = [];
function queueAction(a) {
  queuedActions.push(a);
}

const audio = createAudio(ui);

function startGame() {
  currentSeed = pickSeed();
  Object.assign(state, createGame(currentSeed));
  ui.screen = 'playing';
  ui.paused = false;
  ui.selectedId = null;
  ui.drag = null;
  ui.hover = null;
  queuedActions.length = 0;
  trackRequests();
  resetFx();
  resetClock();
  showBackLink(false);
}

// Debug hook for browser testing: with ?debug in the URL, expose the live
// state, ui, best score and the current run's seed. Inert otherwise.
if (new URLSearchParams(location.search).has('debug')) {
  window.__overclock = {
    state,
    ui,
    audio,
    get best() { return ui.best; },
    get seed() { return currentSeed; },
  };
}

createInput(canvas, state, ui, queueAction, { startGame });

// Audio starts only after the first user gesture.
window.addEventListener('pointerdown', () => audio.unlock());
window.addEventListener('keydown', () => audio.unlock());

// Auto-pause while the page is hidden, so a backgrounded run does not lose
// time; on resume the frame clock is reset.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (ui.screen === 'playing' && !ui.paused) ui.paused = true;
  } else {
    resetClock();
  }
});

// Size the canvas to the largest 960x600 rectangle that fits the window
// (letterboxed by the page background), corrected for device pixel ratio.
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
  const cssW = Math.max(1, Math.floor(W * scale));
  const cssH = Math.max(1, Math.floor(H * scale));
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = Math.max(1, Math.round(cssW * dpr));
  canvas.height = Math.max(1, Math.round(cssH * dpr));
}
window.addEventListener('resize', resize);
resize();

let last = performance.now();
let acc = 0;
function resetClock() {
  last = performance.now();
  acc = 0;
}

function handleEvents(events) {
  for (const e of events) {
    if (e.type === 'gameOver' && ui.screen === 'playing') {
      ui.screen = 'over';
      const s = Math.floor(state.score);
      if (s > ui.best) {
        ui.best = s;
        saveBest(s);
      }
      saveRushResult(s);
      showBackLink(true);
    }
  }
  audio.playEvents(events, reqInfo);
  ingestEvents(events, reqInfo);
}

function frame(now) {
  const dt = (now - last) / 1000;
  last = now;

  if (ui.screen === 'playing' && !ui.paused) {
    trackRequests();
    acc += dt;
    if (acc > 5 * TICK_SECONDS) acc = 5 * TICK_SECONDS; // at most 5 steps per frame
    let steps = 0;
    while (acc >= TICK_SECONDS && steps < 5) {
      step(state, steps === 0 ? queuedActions.splice(0) : []);
      handleEvents(state.events);
      acc -= TICK_SECONDS;
      steps += 1;
    }
  } else {
    acc = 0;
  }

  const scale = canvas.width / W;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  render(ctx, state, ui);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
