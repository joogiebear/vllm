// OVERCLOCK input.
//
// Turns pointer and key events into sim actions (queued for the first step of
// the next tick) and ui changes (selected card, drag position, hover).
// Pointer Events are used so mouse and touch share one code path. Client
// coordinates are converted to the 960x600 logical space from the canvas
// bounding box (the canvas is letterboxed, so the box is the game area).

import { layout, hitRect } from './render.js?v=20261103235739';

const W = 960;
const H = 600;

// key -> [gpu, slot]
const SLOT_KEYS = {
  q: [0, 0],
  w: [0, 1],
  e: [0, 2],
  r: [0, 3],
  a: [1, 0],
  s: [1, 1],
  d: [1, 2],
  f: [1, 3],
};

export function createInput(canvas, state, ui, queueAction, callbacks) {
  function toLogical(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * W,
      y: ((e.clientY - r.top) / r.height) * H,
    };
  }

  function findCard(p) {
    const L = layout(state);
    for (let i = 0; i < L.cards.length; i++) {
      if (hitRect(p, L.cards[i])) return i;
    }
    return -1;
  }

  function findSlot(p) {
    const L = layout(state);
    for (let gi = 0; gi < L.gpus.length; gi++) {
      for (let si = 0; si < L.gpus[gi].slots.length; si++) {
        if (hitRect(p, L.gpus[gi].slots[si])) return { gpu: gi, slot: si };
      }
    }
    return null;
  }

  function findBoost(p) {
    const L = layout(state);
    for (let gi = 0; gi < L.gpus.length; gi++) {
      if (hitRect(p, L.gpus[gi].boost)) return gi;
    }
    return -1;
  }

  function findOffer(p) {
    const L = layout(state);
    for (let i = 0; i < L.offer.length; i++) {
      if (hitRect(p, L.offer[i])) return i;
    }
    return -1;
  }

  function selectedInQueue() {
    return ui.selectedId != null && state.queue.some((r) => r.id === ui.selectedId);
  }

  function assignSelected(gpu, slot) {
    if (!selectedInQueue()) return false;
    const g = state.gpus[gpu];
    if (!g || g.slots[slot] !== null) return false;
    queueAction({ type: 'assign', requestId: ui.selectedId, gpu, slot });
    ui.selectedId = null;
    return true;
  }

  function startIfIdle() {
    if (ui.screen === 'title' || ui.screen === 'over') {
      if (callbacks && callbacks.startGame) callbacks.startGame();
      return true;
    }
    return false;
  }

  function onPointerDown(e) {
    e.preventDefault();
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {
      // capture is best-effort
    }
    if (startIfIdle()) return;
    const p = toLogical(e);

    if (ui.paused) {
      ui.hover = null;
      return;
    }

    if (state.phase === 'upgrade') {
      const i = findOffer(p);
      if (i >= 0) queueAction({ type: 'upgrade', choice: i });
      return;
    }
    if (state.phase !== 'playing') return;

    const boost = findBoost(p);
    if (boost >= 0) {
      queueAction({ type: 'boost', gpu: boost });
      return;
    }

    const ci = findCard(p);
    if (ci >= 0) {
      ui.selectedId = state.queue[ci].id;
      ui.drag = { id: ui.selectedId, x: p.x, y: p.y };
      return;
    }

    const s = findSlot(p);
    if (s) {
      if (state.gpus[s.gpu].slots[s.slot] !== null) {
        // tap a filled slot to evict
        queueAction({ type: 'evict', gpu: s.gpu, slot: s.slot });
      } else if (selectedInQueue()) {
        // tap a card, then tap an empty slot
        assignSelected(s.gpu, s.slot);
      }
    }
  }

  function onPointerMove(e) {
    const p = toLogical(e);
    if (ui.drag) {
      ui.drag.x = p.x;
      ui.drag.y = p.y;
    }
    if (ui.paused || state.phase === 'over') {
      ui.hover = null;
      return;
    }
    if (state.phase === 'upgrade') {
      const i = findOffer(p);
      ui.hover = i >= 0 ? { type: 'offer', index: i } : null;
      return;
    }
    const boost = findBoost(p);
    if (boost >= 0) {
      ui.hover = { type: 'boost', gpu: boost };
      return;
    }
    const s = findSlot(p);
    if (s) {
      ui.hover = { type: 'slot', gpu: s.gpu, slot: s.slot };
      return;
    }
    const ci = findCard(p);
    if (ci >= 0) {
      ui.hover = { type: 'card', index: ci };
      return;
    }
    ui.hover = null;
  }

  function onPointerUp(e) {
    const p = toLogical(e);
    if (ui.drag) {
      const s = findSlot(p);
      if (s && state.gpus[s.gpu].slots[s.slot] === null && selectedInQueue()) {
        assignSelected(s.gpu, s.slot);
      }
      ui.drag = null;
    }
  }

  function onPointerLeave() {
    ui.hover = null;
  }

  function onKeyDown(e) {
    if (e.repeat) return;
    const k = e.key.toLowerCase();

    if (startIfIdle()) return;

    if (k === 'p') {
      ui.paused = !ui.paused;
      return;
    }
    if (k === 'm') {
      ui.muted = !ui.muted; // audio itself is M3
      return;
    }
    if (ui.paused || state.phase === 'over') return;

    if (state.phase === 'upgrade') {
      if (k >= '1' && k <= '3') queueAction({ type: 'upgrade', choice: Number(k) - 1 });
      return;
    }

    // phase: playing
    if (k >= '1' && k <= '9') {
      const idx = Number(k) - 1;
      if (idx < state.queue.length) ui.selectedId = state.queue[idx].id;
      return;
    }
    if (k === '0') {
      if (9 < state.queue.length) ui.selectedId = state.queue[9].id;
      return;
    }
    if (k === 'z' || k === 'x') {
      queueAction({ type: 'boost', gpu: k === 'z' ? 0 : 1 });
      return;
    }
    const sk = SLOT_KEYS[k];
    if (sk) {
      const [gpu, slot] = sk;
      const g = state.gpus[gpu];
      if (!g || slot >= g.slots.length) return;
      if (g.slots[slot] !== null) {
        queueAction({ type: 'evict', gpu, slot });
      } else if (selectedInQueue()) {
        assignSelected(gpu, slot);
      }
    }
  }

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerLeave);
  window.addEventListener('keydown', onKeyDown);

  return {
    dispose() {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('keydown', onKeyDown);
    },
  };
}
