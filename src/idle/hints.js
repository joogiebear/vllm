// First-run hints (docs/ART-DESIGN.md §1).
// A new player is shown one hint at a time, in order (run, buy, manager),
// each as a small callout bubble pointing at its target with a "Got it"
// button. The bubble never blocks input (its host is pointer-events: none)
// and never overlaps the header or the bottom menu. Hints are persisted in
// state.hints
// ({ seen: [] }); the migration marks all three seen for existing players
// (lifetime > 0), so they are only ever shown to new players.
//
// nextHint(state) is pure: it returns the id of the next hint to show
// ('run' | 'buy' | 'manager') or null. The DOM callout (mountHint) polls
// it and shows the bubble when the target is on screen, waiting while the
// welcome-back card or an achievement toast is up.
import { cost } from './core.js?v=20261103163205';
import { isWelcomeOpen } from './welcome.js?v=20261103163205';
import { isToastVisible } from './toast.js?v=20261103163205';

export const HINT_TEXTS = {
  run: 'Tap the Pi to run it. When the bar fills, you get tokens.',
  buy: 'Buy more Pis to earn more each run. Every 25 owned makes them faster.',
  manager: 'Hire a manager in Upgrades. It runs the row for you, even while you\'re away.',
};

// Pure: the next hint to show, or null. Order is run, buy, manager; a hint
// is skipped once its id is in state.hints.seen.
export function nextHint(state) {
  if (!state || typeof state !== 'object') return null;
  const seen =
    state.hints && Array.isArray(state.hints.seen) ? state.hints.seen : [];
  const has = (id) => seen.includes(id);
  const taps =
    state.stats && typeof state.stats.taps === 'number' ? state.stats.taps : 0;
  const managers = Array.isArray(state.managers) ? state.managers.length : 0;
  // 1: a new game (lifetime 0, no taps yet) — tap the Pi to run it.
  if (!has('run') && state.lifetime === 0 && taps === 0) return 'run';
  // 2: the player has run the Pi and can afford the next one — buy more.
  if (has('run') && !has('buy') && state.tokens >= cost(state, 'pi', 1)) {
    return 'buy';
  }
  // 3: the player can afford the Cron Job (cost 100) and has no manager yet.
  if (has('buy') && !has('manager') && state.tokens >= 100 && managers === 0) {
    return 'manager';
  }
  return null;
}

// --- DOM callout -----------------------------------------------------------

let styleInjected = false;
function injectStyle() {
  if (styleInjected || typeof document === 'undefined') return;
  styleInjected = true;
  const el = document.createElement('style');
  el.textContent = `
    .hint-host {
      position: fixed; inset: 0;
      pointer-events: none;
      z-index: 101;
    }
    .hint-bubble {
      position: absolute;
      max-width: 260px;
      background: var(--card, #131a27);
      border: 1px solid var(--border, #263143);
      border-radius: 10px;
      padding: 10px 12px;
      font-size: 14px;
      line-height: 1.35;
      color: var(--text, #eef3f9);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
      pointer-events: auto;
      opacity: 0;
      transition: opacity 150ms ease;
    }
    .hint-bubble.show { opacity: 1; }
    .hint-bubble::after {
      content: '';
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      border: 8px solid transparent;
    }
    .hint-bubble.hint-above::after {
      top: 100%;
      border-top-color: var(--card, #131a27);
    }
    .hint-bubble:not(.hint-above)::after {
      bottom: 100%;
      border-bottom-color: var(--card, #131a27);
    }
    .hint-gotit {
      margin-top: 8px;
      min-height: 32px;
      padding: 0 14px;
      border-radius: 8px;
      border: 1px solid var(--border, #263143);
      background: var(--bg, #0b0f17);
      color: var(--dim, #8b98ab);
      font-size: 13px;
      cursor: pointer;
    }
    @media (prefers-reduced-motion: reduce) {
      .hint-bubble { transition: none; }
    }
  `;
  document.head.appendChild(el);
}

let host = null;
let bubble = null;
let currentHintId = null;
let timer = null;
// The state the callout is bound to (set by mountHint).
let stateRef = null;

function markSeen(id, state) {
  if (!state.hints || !Array.isArray(state.hints.seen)) return;
  if (!state.hints.seen.includes(id)) state.hints.seen.push(id);
}

function ensureBubble() {
  if (bubble) return bubble;
  injectStyle();
  host = document.createElement('div');
  host.className = 'hint-host';
  bubble = document.createElement('div');
  bubble.className = 'hint-bubble';
  const text = document.createElement('div');
  text.className = 'hint-text';
  const gotIt = document.createElement('button');
  gotIt.type = 'button';
  gotIt.className = 'hint-gotit';
  gotIt.textContent = 'Got it';
  gotIt.addEventListener('click', () => dismissCurrent(stateRef));
  bubble.append(text, gotIt);
  host.appendChild(bubble);
  document.body.appendChild(host);
  return bubble;
}

// Position the bubble above (preferred) or below its target, clamped to the
// viewport and kept clear of the header and the bottom menu. A bubble may
// only go above the target when it fits entirely below the header; with no
// room for that it goes below the target.
function placeBubble(el, rect) {
  const gap = 10;
  const hud = document.getElementById('hud');
  const headerBottom = hud ? hud.getBoundingClientRect().bottom : 0;
  const tabs = document.getElementById('tabs');
  const bottomMenu =
    tabs && tabs.getBoundingClientRect().height > 0
      ? tabs.getBoundingClientRect().height + 16
      : 96;
  const bh = el.offsetHeight;
  const bw = el.offsetWidth;
  let left = rect.left + rect.width / 2 - bw / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - bw - 8));
  // Space above is measured from under the header, so a bubble above the
  // target can never cover the header (token count).
  const spaceAbove = Math.max(0, rect.top - headerBottom);
  const spaceBelow = window.innerHeight - rect.bottom - bottomMenu;
  const above = spaceAbove >= bh + gap;
  let top;
  if (above) {
    top = rect.top - bh - gap; // >= headerBottom + gap, fits under the header
    el.classList.add('hint-above');
  } else {
    top = Math.min(
      rect.bottom + gap,
      Math.max(headerBottom + 8, window.innerHeight - bh - bottomMenu - 8)
    );
    el.classList.remove('hint-above');
  }
  el.style.left = left + 'px';
  el.style.top = top + 'px';
}

function showBubble(id, target) {
  const el = ensureBubble();
  const text = el.querySelector('.hint-text');
  text.textContent = HINT_TEXTS[id];
  currentHintId = id;
  const rect = target.getBoundingClientRect();
  placeBubble(el, rect);
  void el.offsetWidth;
  el.classList.add('show');
}

function hideBubble() {
  if (!bubble) return;
  bubble.classList.remove('show');
  currentHintId = null;
}

// The target element for a hint id. The Pi is the first generator card.
function targetFor(id) {
  if (id === 'manager') {
    return document.querySelector('#tabs [data-tab="upgrades"]');
  }
  const card = document.querySelector('#gen-cards .gen-card');
  if (!card) return null;
  return id === 'run' ? card.querySelector('.gen-icon') : card.querySelector('.gen-buy');
}

function targetVisible(el) {
  return Boolean(el && el.getClientRects().length > 0);
}

function check() {
  if (!stateRef) return;
  // Wait while the welcome-back card or an achievement toast is up.
  if (isWelcomeOpen() || isToastVisible()) {
    hideBubble();
    return;
  }
  const id = nextHint(stateRef);
  if (!id) {
    hideBubble();
    return;
  }
  const target = targetFor(id);
  if (!targetVisible(target)) {
    hideBubble();
    return;
  }
  if (currentHintId !== id) showBubble(id, target);
}

// Mark the currently shown hint seen and hide it (the "Got it" button).
export function dismissCurrent(state) {
  if (!currentHintId) return;
  markSeen(currentHintId, state);
  hideBubble();
}

// Mark a hint seen and hide it, but only if it is the one currently shown.
// Called by the natural-dismiss hooks (first run / first buy / first
// manager / opening Upgrades).
export function naturalDismiss(id, state) {
  if (currentHintId !== id) return;
  markSeen(id, state);
  hideBubble();
}

// Settings: "Show tips again" clears the seen list so the hints show again.
export function showHintsAgain(state) {
  if (state.hints) state.hints.seen = [];
  currentHintId = null;
  hideBubble();
}

// Set up the callout. Idempotent; returns a cleanup function.
export function mountHint(state) {
  stateRef = state;
  if (timer) return () => {
    clearInterval(timer);
    timer = null;
    hideBubble();
  };
  timer = setInterval(check, 200);
  return () => {
    clearInterval(timer);
    timer = null;
    hideBubble();
  };
}
