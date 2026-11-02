// OVERCLOCK renderer.
//
// Draws a game state to the canvas. Never mutates the game state; the only
// other input is `ui`, which holds view-only data (screen, selected card,
// drag position, hover, pause, mute, best score).
//
// Effects (floating score numbers, finish particles, timeout shake and red
// flash, throttled panel flicker and red pulse, scanlines) live in this
// module: they are fed the sim's events via ingestEvents() and keep their own
// view state. They never touch the game state.
//
// All on-screen rectangles come from layout(), the single source of truth
// shared with the input hit-testing.

const W = 960;
const H = 600;

const PREFIX_COLORS = {
  chat: '#00e5ff',
  code: '#a8ff3e',
  rag: '#ff4fd8',
  vision: '#ffb02e',
};

const UPGRADE_NAMES = {
  slots: 'SLOTS',
  cooling: 'COOLING',
  throughput: 'THROUGHPUT',
  patience: 'PATIENCE',
  queue: 'QUEUE',
  reputation: 'REPUTATION',
  boost: 'BOOST',
};

const UPGRADE_TEXT = {
  slots: '+1 slot on every GPU',
  cooling: 'heat builds 25% slower',
  throughput: 'base throughput +15%',
  patience: '+3 s patience for new requests',
  queue: 'queue cap +2',
  reputation: 'restore 3 reputation',
  boost: '+1 boost charge per run',
};

const FONT = '"JetBrains Mono", monospace';

export function layout(state) {
  const out = {
    top: { x: 0, y: 0, w: W, h: 44 },
    queue: [],
    gpus: [],
    offer: [],
  };

  const q = { x: 20, y: 70, w: 150, h: 440 };
  out.queuePanel = q;
  const cap = state.queueCap;
  for (let i = 0; i < cap; i++) {
    const h = 52;
    const gap = 8;
    out.queue.push({ x: q.x + 10, y: q.y + 34 + i * (h + gap), w: q.w - 20, h });
  }

  const n = state.gpus.length;
  const areaX = 190;
  const areaW = W - areaX - 20;
  const gap = 12;
  const cw = (areaW - gap * (n - 1)) / n;
  const cy = 70;
  const ch = 440;
  for (let gi = 0; gi < n; gi++) {
    const x = areaX + gi * (cw + gap);
    const panel = { x, y: cy, w: cw, h: ch };
    const g = state.gpus[gi];
    const slots = [];
    const sw = cw - 20;
    const sh = 60;
    const sy = cy + 100;
    const sgap = 10;
    for (let si = 0; si < g.slots.length; si++) {
      slots.push({ x: x + 10, y: sy + si * (sh + sgap), w: sw, h: sh });
    }
    out.gpus.push({ panel, slots, boost: { x: x + 10, y: cy + ch - 46, w: sw, h: 34 } });
  }

  if (state.phase === 'upgrade') {
    const cw2 = 240;
    const gap2 = 20;
    const total = 3 * cw2 + 2 * gap2;
    const x0 = (W - total) / 2;
    for (let i = 0; i < 3; i++) {
      out.offer.push({ x: x0 + i * (cw2 + gap2), y: 220, w: cw2, h: 180 });
    }
  }
  return out;
}

export function hitRect(p, r) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

// --- drawing helpers ---------------------------------------------------------

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function bar(ctx, x, y, w, h, frac, color) {
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
}

function text(ctx, s, x, y, size, color, align = 'left', weight = 600) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

function box(ctx, r, fill, stroke, lw = 1) {
  roundRect(ctx, r.x, r.y, r.w, r.h, 6);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

// --- effects (view-only state, fed by ingestEvents) ---------------------------

const fx = {
  time: 0,
  lastNow: 0,
  floats: [], // { x, y, text, t, life, color, size }
  particles: [], // { x, y, vx, vy, t, life, color, size }
  shake: 0, // seconds of shake remaining
  flash: 0, // 0..1 red flash (timeout)
  pos: new Map(), // requestId -> last seen slot centre { x, y }
};

export function resetFx() {
  fx.floats.length = 0;
  fx.particles.length = 0;
  fx.shake = 0;
  fx.flash = 0;
  fx.pos.clear();
}

export function ingestEvents(events, reqInfo) {
  for (const e of events) {
    if (e.type === 'served') {
      const p = fx.pos.get(e.requestId) || { x: W / 2, y: 200 };
      const info = reqInfo ? reqInfo.get(e.requestId) : null;
      const color = info && info.vip
        ? '#ffd700'
        : info && PREFIX_COLORS[info.prefix]
          ? PREFIX_COLORS[info.prefix]
          : '#a8ff3e';
      fx.floats.push({ x: p.x, y: p.y - 12, text: `+${Math.round(e.points)}`, t: 0, life: 1.1, color, size: 18 });
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 40 + Math.random() * 140;
        fx.particles.push({
          x: p.x,
          y: p.y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 40,
          t: 0,
          life: 0.5 + Math.random() * 0.5,
          color,
          size: 2 + Math.random() * 3,
        });
      }
    } else if (e.type === 'timeout') {
      fx.shake = 0.45;
      fx.flash = 1;
    }
  }
}

function updateFx(dt, state, L) {
  // record slot centres so a `served` event can be placed where the request
  // was (the request is already gone from the state at that point)
  for (let gi = 0; gi < state.gpus.length; gi++) {
    const g = state.gpus[gi];
    for (let si = 0; si < g.slots.length; si++) {
      const r = g.slots[si];
      if (r) {
        const s = L.gpus[gi].slots[si];
        fx.pos.set(r.id, { x: s.x + s.w / 2, y: s.y + s.h / 2 });
      }
    }
  }
  for (let i = fx.floats.length - 1; i >= 0; i--) {
    const f = fx.floats[i];
    f.t += dt;
    f.y -= 28 * dt;
    if (f.t >= f.life) fx.floats.splice(i, 1);
  }
  for (let i = fx.particles.length - 1; i >= 0; i--) {
    const p = fx.particles[i];
    p.t += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 220 * dt; // gravity
    if (p.t >= p.life) fx.particles.splice(i, 1);
  }
  if (fx.shake > 0) fx.shake = Math.max(0, fx.shake - dt);
  if (fx.flash > 0) fx.flash = Math.max(0, fx.flash - dt * 2.5);
}

function drawFx(ctx) {
  for (const p of fx.particles) {
    ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  for (const f of fx.floats) {
    ctx.globalAlpha = Math.max(0, 1 - f.t / f.life);
    text(ctx, f.text, f.x, f.y, f.size, f.color, 'center', 8);
  }
  ctx.globalAlpha = 1;
}

// --- screens ------------------------------------------------------------------

function drawTitle(ctx, ui) {
  ctx.fillStyle = '#06080d';
  ctx.fillRect(0, 0, W, H);
  text(ctx, 'OVERCLOCK', W / 2, 140, 72, '#00e5ff', 'center', 24);
  text(ctx, 'you are the scheduler on an overloaded inference server', W / 2, 205, 16, '#5a6a80', 'center');

  const lines = [
    'slot requests onto the GPUs before their patience runs out',
    'matching prefixes reuse the cache (1.5x) - switching prefixes stalls 1 s',
    'keep the heat down: at 100 a GPU throttles to 25% speed',
  ];
  let y = 275;
  for (const l of lines) {
    text(ctx, l, W / 2, y, 14, '#e8f4ff', 'center');
    y += 26;
  }
  text(ctx, '1-8 select a card    Q W E R / A S D F pick a slot    Z X boost', W / 2, y + 12, 13, '#5a6a80', 'center');
  text(ctx, 'P pause    M mute', W / 2, y + 36, 13, '#5a6a80', 'center');

  text(ctx, `BEST ${ui.best}`, W / 2, 445, 28, '#ffd700', 'center', 12);
  const blink = 0.5 + 0.5 * Math.sin(fx.time * 3);
  ctx.globalAlpha = 0.4 + 0.6 * blink;
  text(ctx, 'TAP OR PRESS ANY KEY TO START', W / 2, 505, 20, '#a8ff3e', 'center', 10);
  ctx.globalAlpha = 1;
}

function drawGameOver(ctx, state, ui) {
  ctx.fillStyle = 'rgba(4,5,10,0.8)';
  ctx.fillRect(0, 0, W, H);
  text(ctx, 'GAME OVER', W / 2, 160, 48, '#ff5050', 'center', 20);
  text(ctx, `SCORE ${Math.floor(state.score)}`, W / 2, 250, 30, '#00e5ff', 'center', 10);
  text(ctx, `LEVEL ${state.level}`, W / 2, 300, 20, '#ff4fd8', 'center');
  text(ctx, `REQUESTS SERVED ${state.served}`, W / 2, 335, 20, '#a8ff3e', 'center');
  text(ctx, `BEST ${ui.best}`, W / 2, 385, 24, '#ffd700', 'center', 8);
  const blink = 0.5 + 0.5 * Math.sin(fx.time * 3);
  ctx.globalAlpha = 0.4 + 0.6 * blink;
  text(ctx, 'TAP OR PRESS ANY KEY TO RESTART', W / 2, 460, 18, '#e8f4ff', 'center', 8);
  ctx.globalAlpha = 1;
}

function drawUpgrade(ctx, state, L, ui) {
  ctx.fillStyle = 'rgba(4,5,10,0.7)';
  ctx.fillRect(0, 0, W, H);
  text(ctx, `LEVEL ${state.level} COMPLETE`, W / 2, 120, 20, '#ff4fd8', 'center', 8);
  text(ctx, 'CHOOSE AN UPGRADE', W / 2, 160, 26, '#00e5ff', 'center', 12);
  for (let i = 0; i < 3; i++) {
    const id = state.offer ? state.offer[i] : '';
    const r = L.offer[i];
    const hovered = ui.hover && ui.hover.type === 'offer' && ui.hover.index === i;
    box(ctx, r, hovered ? '#101a2e' : '#0b1020', hovered ? '#00e5ff' : '#1d2740', hovered ? 2 : 1);
    text(ctx, UPGRADE_NAMES[id] || id, r.x + r.w / 2, r.y + 55, 22, '#a8ff3e', 'center', 8);
    text(ctx, UPGRADE_TEXT[id] || '', r.x + r.w / 2, r.y + 100, 13, '#e8f4ff', 'center');
    text(ctx, String(i + 1), r.x + r.w / 2, r.y + r.h - 26, 14, '#5a6a80', 'center');
  }
}

function drawPaused(ctx) {
  ctx.fillStyle = 'rgba(4,5,10,0.6)';
  ctx.fillRect(0, 0, W, H);
  text(ctx, 'PAUSED', W / 2, H / 2 - 10, 40, '#e8f4ff', 'center', 14);
  text(ctx, 'press P to resume', W / 2, H / 2 + 40, 16, '#5a6a80', 'center');
}

// --- scene --------------------------------------------------------------------

function drawTopBar(ctx, state, L) {
  const t = L.top;
  ctx.fillStyle = '#0a0d18';
  ctx.fillRect(t.x, t.y, t.w, t.h);
  text(ctx, `SCORE ${Math.floor(state.score)}`, 20, 22, 18, '#00e5ff', 'left', 8);
  text(ctx, `LEVEL ${state.level}`, 240, 22, 18, '#ff4fd8', 'left', 8);
  text(ctx, `SERVED ${state.served}`, 400, 22, 16, '#a8ff3e', 'left');
  text(ctx, `QUEUE ${state.queue.length}/${state.queueCap}`, 560, 22, 16, '#e8f4ff', 'left');
  // reputation: 5 pips
  const rx = 740;
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < state.reputation ? '#ffd700' : '#1d2740';
    ctx.fillRect(rx + i * 18, 14, 12, 12);
  }
  text(ctx, 'REP', rx + 5 * 18 + 8, 22, 14, '#5a6a80', 'left');
}

function drawQueueCard(ctx, state, L, i, ui) {
  const r = L.queue[i];
  const req = state.queue[i];
  if (!req) return;
  const sel = ui.selectedId === req.id;
  const col = req.vip ? '#ffd700' : PREFIX_COLORS[req.prefix];
  box(ctx, r, sel ? '#101a2e' : '#0b1020', sel ? '#00e5ff' : '#1d2740', sel ? 2 : 1);
  text(ctx, req.vip ? 'VIP' : req.prefix.toUpperCase(), r.x + 8, r.y + 16, 12, col, 'left', 8);
  text(ctx, `${req.tokens} tok`, r.x + 8, r.y + 38, 13, '#e8f4ff', 'left');
  // patience bar
  const frac = req.patience / req.patienceMax;
  const pcol = frac > 0.5 ? '#a8ff3e' : frac > 0.25 ? '#ffb02e' : '#ff5050';
  bar(ctx, r.x + 8, r.y + 50, r.w - 16, 4, frac, pcol);
}

function drawGpu(ctx, state, L, gi) {
  const g = state.gpus[gi];
  const slot = L.gpus[gi];
  box(ctx, slot.panel, '#0a0d18', '#1d2740');
  text(ctx, `GPU ${gi}`, slot.panel.x + 10, slot.panel.y + 18, 14, '#5a6a80', 'left', 8);
  // heat
  const hcol = g.heat > 80 ? '#ff5050' : g.heat > 55 ? '#ffb02e' : '#a8ff3e';
  bar(ctx, slot.panel.x + 10, slot.panel.y + 34, slot.panel.w - 20, 8, g.heat / 100, hcol);
  text(ctx, `${Math.round(g.heat)}C`, slot.panel.x + 10, slot.panel.y + 54, 11, '#5a6a80', 'left');
  if (g.throttled) {
    text(ctx, 'THROTTLED', slot.panel.x + slot.panel.w - 10, slot.panel.y + 54, 11, '#ff5050', 'right', 8);
  }
  // slots
  for (let si = 0; si < g.slots.length; si++) {
    const s = slot.slots[si];
    const req = g.slots[si];
    box(ctx, s, '#0b1020', req ? '#2a3a5c' : '#141c30');
    if (req) {
      const col = req.vip ? '#ffd700' : PREFIX_COLORS[req.prefix];
      text(ctx, req.vip ? 'VIP' : req.prefix.toUpperCase(), s.x + 8, s.y + 14, 11, col, 'left', 8);
      const frac = req.done / req.tokens;
      bar(ctx, s.x + 8, s.y + s.h - 16, s.w - 16, 6, frac, col);
      text(ctx, `${Math.round(frac * 100)}%`, s.x + s.w - 8, s.y + 14, 11, '#5a6a80', 'right');
    }
  }
  // boost button
  const b = slot.boost;
  const usable = g.boosts > 0 && !g.boosting;
  box(ctx, b, usable ? '#101a2e' : '#0b1020', usable ? '#ff4fd8' : '#141c30');
  text(ctx, g.boosting ? 'BOOSTING' : `BOOST x${g.boosts}`, b.x + b.w / 2, b.y + b.h / 2, 12, usable ? '#ff4fd8' : '#5a6a80', 'center', 8);
  if (g.boosting) {
    bar(ctx, b.x + 8, b.y + b.h - 8, b.w - 16, 3, g.boostTimer / 3, '#ff4fd8');
  }

  // throttled: red pulse over the panel + flicker (view-only)
  if (g.throttled) {
    const pulse = 0.1 + 0.1 * (0.5 + 0.5 * Math.sin(fx.time * 6));
    ctx.fillStyle = `rgba(255,60,60,${pulse.toFixed(3)})`;
    ctx.fillRect(slot.panel.x, slot.panel.y, slot.panel.w, slot.panel.h);
    if (Math.random() < 0.15) {
      ctx.fillStyle = 'rgba(4,5,10,0.35)';
      ctx.fillRect(slot.panel.x, slot.panel.y, slot.panel.w, slot.panel.h);
    }
  }
}

function drawDrag(ctx, state, ui) {
  if (!ui.drag) return;
  const req = state.queue.find((r) => r.id === ui.drag.reqId);
  if (!req) return;
  const col = req.vip ? '#ffd700' : PREFIX_COLORS[req.prefix];
  ctx.globalAlpha = 0.85;
  box(ctx, { x: ui.drag.x - 45, y: ui.drag.y - 26, w: 90, h: 52 }, '#101a2e', col, 2);
  text(ctx, req.vip ? 'VIP' : req.prefix.toUpperCase(), ui.drag.x, ui.drag.y - 8, 12, col, 'center', 8);
  text(ctx, `${req.tokens} tok`, ui.drag.x, ui.drag.y + 12, 13, '#e8f4ff', 'center');
  ctx.globalAlpha = 1;
}

function drawScanlines(ctx) {
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
}

// --- main render ---------------------------------------------------------------

export function render(ctx, state, ui) {
  const now = typeof performance !== 'undefined' && performance.now ? performance.now() : 0;
  const dt = fx.lastNow === 0 ? 1 / 60 : Math.min(0.1, (now - fx.lastNow) / 1000);
  fx.lastNow = now;
  fx.time += dt;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#06080d';
  ctx.fillRect(0, 0, W, H);

  if (ui.screen === 'title') {
    drawTitle(ctx, ui);
    drawScanlines(ctx);
    return;
  }

  const L = layout(state);
  updateFx(dt, state, L);

  ctx.save();
  if (fx.shake > 0) {
    const k = fx.shake / 0.45;
    ctx.translate((Math.random() * 2 - 1) * 7 * k, (Math.random() * 2 - 1) * 7 * k);
  }
  drawTopBar(ctx, state, L);
  // queue panel
  box(ctx, L.queuePanel, '#0a0d18', '#1d2740');
  text(ctx, 'QUEUE', L.queuePanel.x + 10, L.queuePanel.y + 18, 14, '#5a6a80', 'left', 8);
  for (let i = 0; i < state.queue.length; i++) drawQueueCard(ctx, state, L, i, ui);
  for (let gi = 0; gi < state.gpus.length; gi++) drawGpu(ctx, state, L, gi);
  drawFx(ctx);
  ctx.restore();

  if (fx.flash > 0) {
    ctx.fillStyle = `rgba(255,40,40,${(0.18 * fx.flash).toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
  }

  if (state.phase === 'upgrade') drawUpgrade(ctx, state, L, ui);
  if (ui.screen === 'over' || state.phase === 'over') drawGameOver(ctx, state, ui);
  if (ui.paused && ui.screen === 'playing') drawPaused(ctx);
  drawDrag(ctx, state, ui);
  drawScanlines(ctx);
}
