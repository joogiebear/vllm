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
import { cost, cyclePayout } from './core.js?v=20261104201139';
import { GENERATORS } from './data.js?v=20261104201139';
import { fmt } from './fmt.js?v=20261104201139';
import { isWelcomeOpen } from './welcome.js?v=20261104201139';
import { isToastVisible } from './toast.js?v=20261104201139';

export const HINT_TEXTS = {
  run: 'Tap the Pi to boot it. When the bar fills, you get tokens.',
  buy: 'Buy more Pis to earn more each run. At 25 owned they run twice as fast.',
  manager: 'Hire a manager on the Managers tab. It runs the row for you, even while you\'re away.',
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
    /* An inline card under the Pi row (docs/UX-OVERHAUL-PLAN.md, batch C):
       it never covers the thing it talks about. */
    .hint-bubble {
      position: relative; margin: 2px 0 4px;
      background: var(--affordable, #ffb547); color: #1a1204;
      border-radius: 12px; padding: 10px 12px;
      font-size: 14px; font-weight: 600; line-height: 1.35;
    }
    .hint-bubble::before {
      content: ''; position: absolute; left: 34px; top: -8px;
      border: 8px solid transparent; border-top: 0;
      border-bottom-color: var(--affordable, #ffb547);
    }
    .hint-gotit {
      margin-top: 8px;
      min-height: 36px;
      padding: 0 14px;
      border-radius: 8px;
      border: 1px solid rgba(26, 18, 4, 0.35);
      background: transparent;
      color: #1a1204;
      font-size: 13px; font-weight: 700;
      cursor: pointer;
    }
  `;
  document.head.appendChild(el);
}

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
  bubble = document.createElement('div');
  bubble.className = 'hint-bubble';
  bubble.setAttribute('role', 'status');
  const text = document.createElement('div');
  text.className = 'hint-text';
  const gotIt = document.createElement('button');
  gotIt.type = 'button';
  gotIt.className = 'hint-gotit';
  gotIt.textContent = 'Got it';
  gotIt.addEventListener('click', () => dismissCurrent(stateRef));
  bubble.append(text, gotIt);
  return bubble;
}

// The hint text, with the real numbers for the boot hint.
function hintText(id) {
  if (id === 'run' && stateRef) {
    const pi = GENERATORS.find((g) => g.id === 'pi');
    const pays = fmt(cyclePayout(stateRef, pi));
    const price = fmt(Math.ceil(cost(stateRef, 'pi', 1)));
    return `Tap the Pi to boot it. When the bar fills you get ${pays} tokens. A second Pi costs ${price}.`;
  }
  return HINT_TEXTS[id];
}

// Show the hint as an inline card right under the Pi row.
function showBubble(id) {
  const el = ensureBubble();
  el.querySelector('.hint-text').textContent = hintText(id);
  currentHintId = id;
  const card = document.querySelector('#gen-cards .gen-card');
  if (card && el.previousElementSibling !== card) card.after(el);
}

function hideBubble() {
  if (!bubble) return;
  bubble.remove();
  currentHintId = null;
}

// The target element for a hint id. The Pi is the first generator card.
function targetFor(id) {
  if (id === 'manager') {
    return document.querySelector('#tabs [data-tab="managers"]');
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
  if (currentHintId !== id) showBubble(id);
}

// Mark the currently shown hint seen and hide it (the "Got it" button).
export function dismissCurrent(state) {
  if (!currentHintId) return;
  markSeen(currentHintId, state);
  hideBubble();
}

// Mark a hint seen and hide it, but only if it is the one currently shown.
// Called by the natural-dismiss hooks (first run / first buy / first
// manager / opening Managers).
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
