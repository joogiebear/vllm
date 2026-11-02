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
  A: '#00e5ff',
  B: '#ff4fd8',
  C: '#a8ff3e',
  D: '#ffb300',
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

// The effect text must match the Upgrades table in docs/DESIGN.md.
const UPGRADE_TEXT = {
  slots: 'Each GPU gains 1 slot, maximum 6',
  cooling: 'Heat loss +3 per second',
  throughput: 'Base 60 becomes 15 higher',
  patience: 'maxPatience of new requests +3 seconds',
  queue: 'Queue capacity +2',
  reputation: 'Restore 3 reputation',
  boost: 'Boost cooldown -3 seconds, minimum 4',
};

const FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

// The single source of truth for every rectangle on screen. Sized for up to
// 6 slots per GPU and more than 8 queue cards (card height shrinks to fit).
export function layout(state) {
  const topBar = { x: 16, y: 12, w: W - 32, h: 44 };

  const queue = { x: 16, y: 72, w: 232, h: H - 72 - 16 };
  const n = state.queue.length;
  const gap = 6;
  const cardH = n > 0 ? Math.min(46, Math.floor((queue.h - gap * (n - 1)) / n)) : 46;
  const cards = [];
  for (let i = 0; i < n; i++) {
    cards.push({ x: queue.x, y: queue.y + i * (cardH + gap), w: queue.w, h: cardH });
  }

  const gpus = [];
  for (let gi = 0; gi < state.gpus.length; gi++) {
    const gpu = state.gpus[gi];
    const panel = { x: 264 + gi * 350, y: 72, w: 330, h: 470 };
    const sw = 150;
    const sh = 78;
    const gapx = 12;
    const gapy = 12;
    const rows = Math.ceil(gpu.slots.length / 2);
    const sy0 = panel.y + 48;
    const slots = [];
    for (let si = 0; si < gpu.slots.length; si++) {
      const c = si % 2;
      const r = Math.floor(si / 2);
      slots.push({ x: panel.x + 10 + c * (sw + gapx), y: sy0 + r * (sh + gapy), w: sw, h: sh });
    }
    const heat = { x: panel.x + 10, y: sy0 + rows * (sh + gapy) + 18, w: 310, h: 14 };
    const boost = { x: panel.x + 10, y: heat.y + heat.h + 14, w: 310, h: 48 };
    gpus.push({ panel, slots, heat, boost });
  }

  const offer = [];
  const ow = 240;
  const ogap = 24;
  const ox = (W - (ow * 3 + ogap * 2)) / 2;
  for (let i = 0; i < 3; i++) {
    offer.push({ x: ox + i * (ow + ogap), y: 220, w: ow, h: 160 });
  }

  return { W, H, topBar, queue, cards, gpus, offer };
}

// Shared hit test so render and input use the same numbers.
export function hitRect(p, r) {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

// --- small drawing helpers (view-only) ---------------------------------------

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function text(ctx, str, x, y, size, color, align = 'left', glow = 0) {
  ctx.font = `${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (glow > 0) {
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
  ctx.shadowBlur = 0;
}

function box(ctx, r, fill, stroke, lineWidth = 1) {
  ctx.fillStyle = fill;
  roundRect(ctx, r.x, r.y, r.w, r.h, 6);
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  roundRect(ctx, r.x, r.y, r.w, r.h, 6);
  ctx.stroke();
}

// The heat bar shifts from cyan (0) to red (1).
function heatColor(t) {
  const r = Math.round(0 + 255 * t);
  const g = Math.round(229 - 169 * t);
  const b = Math.round(255 - 195 * t);
  return `rgb(${r},${g},${b})`;
}

function keyHint(idx) {
  if (idx < 8) return String(idx + 1);
  if (idx === 8) return '9';
  if (idx === 9) return '0';
  return '';
}

function drawScanlines(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
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

// --- scene parts ------------------------------------------------------------

function drawTopBar(ctx, state, L) {
  const b = L.topBar;
  box(ctx, b, '#0a0d15', '#1d2740');
  const cy = b.y + b.h / 2;
  text(ctx, `SCORE ${Math.floor(state.score)}`, b.x + 16, cy, 18, '#00e5ff', 'left', 8);
  text(ctx, `x${state.multiplier.toFixed(1)}`, b.x + 210, cy, 16, '#a8ff3e', 'left');
  text(ctx, `LEVEL ${state.level}`, b.x + 330, cy, 16, '#ff4fd8', 'left');
  text(ctx, `${Math.ceil(state.levelTime)}s`, b.x + 470, cy, 16, '#e8f4ff', 'left');
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = i < state.reputation ? '#ffd700' : '#1a2338';
    ctx.beginPath();
    ctx.arc(b.x + b.w - 16 - i * 22, cy, 7, 0, Math.PI * 2);
    ctx.fill();
  }
  text(ctx, 'REP', b.x + b.w - 16 - 10 * 22 - 10, cy, 12, '#5a6a80', 'right');
}

function drawQueueCard(ctx, r, req, idx, ui) {
  const color = PREFIX_COLORS[req.prefix] || '#8899aa';
  const selected = ui.selectedId === req.id;
  const hovered = ui.hover && ui.hover.type === 'card' && ui.hover.index === idx;
  box(ctx, r, '#0b0e16', req.vip ? '#ffd700' : color, req.vip ? 2 : 1);
  if (selected || hovered) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    roundRect(ctx, r.x + 1, r.y + 1, r.w - 2, r.h - 2, 5);
    ctx.stroke();
  }
  text(ctx, req.prefix, r.x + 14, r.y + r.h / 2 - 4, 20, color, 'left', 8);
  text(ctx, String(req.tokens), r.x + r.w / 2 + 14, r.y + r.h / 2 - 4, 16, '#e8f4ff', 'center');
  const hint = keyHint(idx);
  if (hint) text(ctx, hint, r.x + r.w - 12, r.y + r.h / 2 - 4, 12, '#5a6a80', 'right');
  const frac = req.maxPatience > 0 ? Math.max(0, req.patience / req.maxPatience) : 0;
  ctx.fillStyle = '#111827';
  ctx.fillRect(r.x + 10, r.y + r.h - 8, r.w - 20, 4);
  ctx.fillStyle = frac > 0.35 ? color : '#ff5050';
  ctx.fillRect(r.x + 10, r.y + r.h - 8, (r.w - 20) * frac, 4);
}

const SLOT_KEYS = [
  ['Q', 'W', 'E', 'R', '', ''],
  ['A', 'S', 'D', 'F', '', ''],
];

function drawGpu(ctx, state, gi, g, ui) {
  const gpu = state.gpus[gi];
  box(ctx, g.panel, '#0a0d15', gpu.throttled ? '#ff5050' : '#1d2740');
  const hy = g.panel.y + 24;
  text(ctx, `GPU ${gi + 1}`, g.panel.x + 12, hy, 18, '#e8f4ff', 'left', 6);
  if (gpu.active) {
    text(ctx, gpu.active, g.panel.x + g.panel.w - 20, hy, 18, PREFIX_COLORS[gpu.active], 'center', 8);
  } else {
    text(ctx, '-', g.panel.x + g.panel.w - 20, hy, 18, '#3a4a60', 'center');
  }

  for (let si = 0; si < gpu.slots.length; si++) {
    const r = g.slots[si];
    const req = gpu.slots[si];
    const hovered = ui.hover && ui.hover.type === 'slot' && ui.hover.gpu === gi && ui.hover.slot === si;
    if (req) {
      const color = PREFIX_COLORS[req.prefix] || '#8899aa';
      box(ctx, r, '#0e1220', req.vip ? '#ffd700' : color, req.vip ? 2 : 1);
      text(ctx, req.prefix, r.x + 12, r.y + 18, 16, color, 'left', 6);
      text(ctx, `${Math.floor(req.done)}/${req.tokens}`, r.x + r.w - 12, r.y + 18, 13, '#e8f4ff', 'right');
      const frac = Math.min(1, req.done / req.tokens);
      ctx.fillStyle = '#111827';
      ctx.fillRect(r.x + 10, r.y + r.h - 16, r.w - 20, 8);
      ctx.fillStyle = color;
      ctx.fillRect(r.x + 10, r.y + r.h - 16, (r.w - 20) * frac, 8);
      if (req.stall > 0) {
        text(ctx, 'STALL', r.x + r.w / 2, r.y + r.h / 2 + 6, 12, '#ff5050', 'center', 6);
      }
    } else {
      box(ctx, r, '#080b12', hovered ? '#00e5ff' : '#1a2338', hovered ? 2 : 1);
      const hint = SLOT_KEYS[gi][si];
      if (hint) text(ctx, hint, r.x + r.w / 2, r.y + r.h / 2, 14, '#3a4a60', 'center');
    }
  }

  text(ctx, 'HEAT', g.heat.x, g.heat.y - 8, 11, '#5a6a80', 'left');
  ctx.fillStyle = '#111827';
  ctx.fillRect(g.heat.x, g.heat.y, g.heat.w, g.heat.h);
  ctx.fillStyle = heatColor(gpu.heat / 100);
  ctx.fillRect(g.heat.x, g.heat.y, g.heat.w * (gpu.heat / 100), g.heat.h);
  if (gpu.throttled) {
    text(ctx, 'THROTTLED', g.heat.x + g.heat.w, g.heat.y + g.heat.h / 2 + 8, 12, '#ff5050', 'right', 8);
  }

  const onCd = gpu.boostCooldown > 0;
  const hovered = ui.hover && ui.hover.type === 'boost' && ui.hover.gpu === gi;
  box(
    ctx,
    g.boost,
    gpu.boostActive ? '#123a2a' : onCd ? '#0c0f18' : '#0d1a2a',
    hovered && !onCd ? '#00e5ff' : onCd ? '#26304a' : '#1d4a5a',
    hovered && !onCd ? 2 : 1
  );
  const label = gpu.boostActive
    ? 'BOOSTING'
    : onCd
      ? `COOLDOWN ${Math.ceil(gpu.boostCooldown)}`
      : 'BOOST';
  text(
    ctx,
    label,
    g.boost.x + g.boost.w / 2,
    g.boost.y + g.boost.h / 2,
    15,
    onCd ? '#5a6a80' : '#00e5ff',
    'center',
    onCd ? 0 : 8
  );
  text(ctx, gi === 0 ? 'Z' : 'X', g.boost.x + g.boost.w - 14, g.boost.y + g.boost.h / 2, 12, '#5a6a80', 'center');

  // throttled: red pulse over the panel + flicker (view-only)
  if (gpu.throttled) {
    const pulse = 0.1 + 0.1 * (0.5 + 0.5 * Math.sin(fx.time * 6));
    ctx.fillStyle = `rgba(255,60,60,${pulse.toFixed(3)})`;
    ctx.fillRect(g.panel.x, g.panel.y, g.panel.w, g.panel.h);
    if (Math.random() < 0.15) {
      ctx.fillStyle = 'rgba(4,5,10,0.35)';
      ctx.fillRect(g.panel.x, g.panel.y, g.panel.w, g.panel.h);
    }
  }
}

function drawScene(ctx, state, L, ui) {
  for (let i = 0; i < state.queue.length; i++) {
    drawQueueCard(ctx, L.cards[i], state.queue[i], i, ui);
  }
  for (let gi = 0; gi < state.gpus.length; gi++) {
    drawGpu(ctx, state, gi, L.gpus[gi], ui);
  }
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
    text(ctx, UPGRADE_NAMES[id] || id, r.x + r.w / 2, r.y + 52, 22, '#a8ff3e', 'center', 8);
    text(ctx, UPGRADE_TEXT[id] || '', r.x + r.w / 2, r.y + 96, 13, '#e8f4ff', 'center');
    text(ctx, String(i + 1), r.x + r.w / 2, r.y + r.h - 24, 14, '#5a6a80', 'center');
  }
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

function drawPaused(ctx) {
  ctx.fillStyle = 'rgba(4,5,10,0.6)';
  ctx.fillRect(0, 0, W, H);
  text(ctx, 'PAUSED', W / 2, H / 2 - 10, 40, '#e8f4ff', 'center', 14);
  text(ctx, 'press P to resume', W / 2, H / 2 + 40, 16, '#5a6a80', 'center');
}

function drawDrag(ctx, state, ui) {
  if (!ui.drag) return;
  const idx = state.queue.findIndex((r) => r.id === ui.drag.id);
  if (idx === -1) return;
  const req = state.queue[idx];
  const color = PREFIX_COLORS[req.prefix] || '#8899aa';
  const w = 90;
  const h = 36;
  const r = { x: ui.drag.x - w / 2, y: ui.drag.y - h / 2, w, h };
  box(ctx, r, '#0b0e16', req.vip ? '#ffd700' : color, 2);
  text(ctx, req.prefix, r.x + 14, r.y + h / 2, 16, color, 'left', 6);
  text(ctx, String(req.tokens), r.x + r.w - 14, r.y + h / 2, 14, '#e8f4ff', 'right');
}

// --- entry point ------------------------------------------------------------

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
  drawScene(ctx, state, L, ui);
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
