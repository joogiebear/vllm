// OVERCLOCK input: pointer (click / drag) and keyboard, mapped onto the
// sim's actions.
//
// The sim is a pure function of (state, actions); input only translates
// gestures into those actions and into the view-only `ui` state (selected
// card, drag position, hover, pause, mute). It never mutates the game state
// directly.

import { layout, hitRect } from './render.js';

const KEY_SLOTS = { q: [0, 0], w: [0, 1], e: [0, 2], r: [0, 3], a: [1, 0], s: [1, 1], d: [1, 2], f: [1, 3] };
const KEY_BOOST = { z: 0, x: 1 };

export function createInput(canvas, state, ui, queueAction, callbacks) {
  function toLogical(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 960,
      y: ((e.clientY - rect.top) / rect.height) * 600,
    };
  }

  function onPointerDown(e) {
    const p = toLogical(e);
    const L = layout(state);
    canvas.setPointerCapture(e.pointerId);
    if (ui.screen === 'title' || ui.screen === 'over') {
      callbacks.startGame();
      return;
    }
    if (ui.paused) {
      ui.hover = null;
      return;
    }
    if (state.phase === 'upgrade') {
      for (let i = 0; i < 3; i++) {
        if (hitRect(p, L.offer[i])) {
          queueAction({ type: 'upgrade', choice: i });
          return;
        }
      }
      return;
    }
    if (state.phase !== 'playing') return;

    // queue card?
    for (let i = 0; i < state.queue.length; i++) {
      if (hitRect(p, L.queue[i])) {
        ui.selectedId = state.queue[i].id;
        ui.drag = { reqId: state.queue[i].id, x: p.x, y: p.y };
        return;
      }
    }
    // boost buttons?
    for (let gi = 0; gi < state.gpus.length; gi++) {
      if (hitRect(p, L.gpus[gi].boost)) {
        queueAction({ type: 'boost', gpu: gi });
        return;
      }
    }
    // a slot: assign the selected card there
    if (ui.selectedId !== null) {
      for (let gi = 0; gi < state.gpus.length; gi++) {
        for (let si = 0; si < state.gpus[gi].slots.length; si++) {
          if (hitRect(p, L.gpus[gi].slots[si])) {
            queueAction({ type: 'assign', requestId: ui.selectedId, gpu: gi, slot: si });
            ui.selectedId = null;
            return;
          }
        }
      }
    }
  }

  function onPointerMove(e) {
    const p = toLogical(e);
    if (ui.drag) {
      ui.drag.x = p.x;
      ui.drag.y = p.y;
      return;
    }
    if (ui.paused || state.phase === 'over') {
      ui.hover = null;
      return;
    }
    const L = layout(state);
    ui.hover = null;
    if (state.phase === 'upgrade') {
      for (let i = 0; i < 3; i++) {
        if (hitRect(p, L.offer[i])) ui.hover = { type: 'offer', index: i };
      }
      return;
    }
    for (let i = 0; i < state.queue.length; i++) {
      if (hitRect(p, L.queue[i])) ui.hover = { type: 'queue', index: i };
    }
    for (let gi = 0; gi < state.gpus.length; gi++) {
      if (hitRect(p, L.gpus[gi].boost)) ui.hover = { type: 'boost', index: gi };
    }
  }

  function onPointerUp(e) {
    if (!ui.drag) return;
    const p = toLogical(e);
    const L = layout(state);
    const reqId = ui.drag.reqId;
    ui.drag = null;
    if (state.phase !== 'playing') return;
    // drop on a slot?
    for (let gi = 0; gi < state.gpus.length; gi++) {
      for (let si = 0; si < state.gpus[gi].slots.length; si++) {
        if (hitRect(p, L.gpus[gi].slots[si])) {
          queueAction({ type: 'assign', requestId: reqId, gpu: gi, slot: si });
          ui.selectedId = null;
          return;
        }
      }
    }
    // dropped outside: keep the card selected
    ui.selectedId = reqId;
  }

  function onKeyDown(e) {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === 'm') {
      ui.muted = !ui.muted;
      return;
    }
    if (ui.screen === 'title' || ui.screen === 'over') {
      callbacks.startGame();
      return;
    }
    if (k === 'p') {
      ui.paused = !ui.paused;
      return;
    }
    if (ui.paused) return;
    if (state.phase === 'upgrade') {
      if (k >= '1' && k <= '3') {
        queueAction({ type: 'upgrade', choice: Number(k) - 1 });
      }
      return;
    }
    if (state.phase !== 'playing') return;
    // select a queue card
    if (k >= '1' && k <= '8') {
      const i = Number(k) - 1;
      if (i < state.queue.length) ui.selectedId = state.queue[i].id;
      return;
    }
    // boost
    if (KEY_BOOST[k] !== undefined) {
      queueAction({ type: 'boost', gpu: KEY_BOOST[k] });
      return;
    }
    // slot: assign the selected card
    if (ui.selectedId !== null && KEY_SLOTS[k]) {
      const [gpu, slot] = KEY_SLOTS[k];
      if (gpu < state.gpus.length && slot < state.gpus[gpu].slots.length) {
        queueAction({ type: 'assign', requestId: ui.selectedId, gpu, slot });
        ui.selectedId = null;
      }
    }
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  window.addEventListener('keydown', onKeyDown);
  return {
    destroy() {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
    },
  };
}
