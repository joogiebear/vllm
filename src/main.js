// OVERCLOCK main: canvas sizing, the fixed-step loop, and the wiring of
// sim, render and input.

import { createGame, step, TICK_SECONDS } from './sim.js';
import { render } from './render.js';
import { createInput } from './input.js';

const W = 960;
const H = 600;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// The game starts in `playing` immediately (no title screen until M3). A
// fixed seed keeps a run reproducible; the design leaves the seed open.
const state = createGame(1337);

// View-only data shared with render and input.
const ui = {
  selectedId: null,
  drag: null,
  hover: null,
  paused: false,
  muted: false,
};

// Actions collected since the last tick; they are consumed by the first step
// of the next tick (and only that one).
const queuedActions = [];
function queueAction(a) {
  queuedActions.push(a);
}

// Debug hook for browser testing: with ?debug in the URL, expose the live
// state and ui. Inert otherwise.
if (new URLSearchParams(location.search).has('debug')) {
  window.__overclock = { state, ui };
}

createInput(canvas, state, ui, queueAction);

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

function frame(now) {
  const dt = (now - last) / 1000;
  last = now;

  if (ui.paused) {
    acc = 0;
  } else {
    acc += dt;
    if (acc > 5 * TICK_SECONDS) acc = 5 * TICK_SECONDS; // at most 5 steps per frame
    let steps = 0;
    while (acc >= TICK_SECONDS && steps < 5) {
      step(state, steps === 0 ? queuedActions.splice(0) : []);
      acc -= TICK_SECONDS;
      steps += 1;
    }
  }

  const scale = canvas.width / W;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  render(ctx, state, ui);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
