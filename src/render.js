// OVERCLOCK renderer.
//
// Draws a game state to the canvas. Never mutates the game state; the only
// other input is `ui`, which holds view-only data (selected card, drag
// position, hover, pause, mute).
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

const UPGRADE_TEXT = {
  slots: '+1 slot per GPU (max 6)',
  cooling: '+3 heat loss per second',
  throughput: '+15 base throughput',
  patience: '+3 s patience for new requests',
  queue: '+2 queue capacity',
  reputation: 'restore 3 reputation',
  boost: '-3 s boost cooldown (min 4 s)',
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
}

function drawScene(ctx, state, L, ui) {
  for (let i = 0; i < state.queue.length; i++) {
    drawQueueCard(ctx, L.cards[i], state.queue[i], i, ui);
  }
  for (let gi = 0; gi < state.gpus.length; gi++) {
    drawGpu(ctx, state, gi, L.gpus[gi], ui);
  }
}

// --- phase overlays (M2 scope) ----------------------------------------------

function drawUpgrade(ctx, state, L, ui) {
  ctx.fillStyle = 'rgba(4,5,10,0.7)';
  ctx.fillRect(0, 0, W, H);
  text(ctx, 'CHOOSE AN UPGRADE', W / 2, 180, 26, '#00e5ff', 'center', 12);
  for (let i = 0; i < 3; i++) {
    const id = state.offer ? state.offer[i] : '';
    const r = L.offer[i];
    const hovered = ui.hover && ui.hover.type === 'offer' && ui.hover.index === i;
    box(ctx, r, hovered ? '#101a2e' : '#0b1020', hovered ? '#00e5ff' : '#1d2740', hovered ? 2 : 1);
    text(ctx, id, r.x + r.w / 2, r.y + 52, 22, '#a8ff3e', 'center', 8);
    text(ctx, UPGRADE_TEXT[id] || '', r.x + r.w / 2, r.y + 96, 13, '#e8f4ff', 'center');
    text(ctx, String(i + 1), r.x + r.w / 2, r.y + r.h - 24, 14, '#5a6a80', 'center');
  }
}

function drawGameOver(ctx, state) {
  ctx.fillStyle = 'rgba(4,5,10,0.75)';
  ctx.fillRect(0, 0, W, H);
  text(ctx, 'GAME OVER', W / 2, H / 2 - 30, 48, '#ff5050', 'center', 20);
  text(ctx, `SCORE ${Math.floor(state.score)}`, W / 2, H / 2 + 30, 28, '#00e5ff', 'center', 10);
}

function drawPaused(ctx) {
  ctx.fillStyle = 'rgba(4,5,10,0.6)';
  ctx.fillRect(0, 0, W, H);
  text(ctx, 'PAUSED', W / 2, H / 2, 40, '#e8f4ff', 'center', 14);
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
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#06080d';
  ctx.fillRect(0, 0, W, H);
  drawScanlines(ctx);
  const L = layout(state);
  drawTopBar(ctx, state, L);
  drawScene(ctx, state, L, ui);
  if (state.phase === 'upgrade') drawUpgrade(ctx, state, L, ui);
  if (state.phase === 'over') drawGameOver(ctx, state);
  if (ui.paused) drawPaused(ctx);
  drawDrag(ctx, state, ui);
}
