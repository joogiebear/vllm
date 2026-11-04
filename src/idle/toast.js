// Toasts (docs/COMPLETION.md).
// toast(text) is called for every achievement unlocked by a tick: a small
// pill slides up just above the bottom menu, and disappears after
// 3 seconds. Several toasts queue and never overlap. The host is
// pointer-events: none, so a toast never blocks a tap.
// prefers-reduced-motion: no slide, the pill just appears and vanishes.
import { isWelcomeOpen } from './welcome.js?v=20261104202611';
const STYLE_ID = 'overclock-toast-style';
const SHOW_MS = 3000;
const OUT_MS = 250;

let host = null;
let queue = [];
let busy = false;

// Inject the toast CSS once; a second call is a no-op.
function injectStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = `
    .toast-host {
      position: fixed;
      bottom: calc(72px + env(safe-area-inset-bottom));
      left: 0; right: 0;
      display: flex; flex-direction: column; align-items: center;
      gap: 8px;
      pointer-events: none;
      z-index: 100;
    }
    .toast-pill {
      pointer-events: none;
      max-width: calc(100vw - 24px);
      padding: 8px 16px;
      border-radius: 999px;
      border: 1px solid var(--affordable, #ffb547);
      background: var(--card, #131a27);
      color: var(--text, #eef3f9);
      font-size: 13px;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      opacity: 0;
      transform: translateY(12px);
      transition: opacity 250ms ease, transform 250ms ease;
    }
    .toast-pill.show { opacity: 1; transform: translateY(0); }
    .toast-pill.hide { opacity: 0; transform: translateY(12px); }
    @media (prefers-reduced-motion: reduce) {
      .toast-pill { transition: none; }
    }
  `;
  document.head.appendChild(el);
}

function reducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function ensureHost() {
  if (host) return host;
  injectStyle();
  host = document.createElement('div');
  host.className = 'toast-host';
  document.body.appendChild(host);
  return host;
}

// Show the next queued toast; only one pill exists at a time, so toasts
// queue rather than overlap.
function showNext() {
  if (queue.length === 0) {
    busy = false;
    return;
  }
  // Hold toasts until the welcome-back card closes.
  if (isWelcomeOpen()) {
    busy = true;
    setTimeout(showNext, 400);
    return;
  }
  busy = true;
  const el = document.createElement('div');
  el.className = 'toast-pill';
  el.textContent = queue.shift();
  ensureHost().appendChild(el);
  const animate = !reducedMotion();
  void el.offsetWidth; // flush so the slide-in starts from the initial state
  el.classList.add('show');
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    el.remove();
    showNext();
  };
  setTimeout(() => {
    if (animate) {
      el.classList.add('hide');
      el.addEventListener('transitionend', finish, { once: true });
      // fallback in case transitionend never fires (e.g. tab hidden)
      setTimeout(finish, OUT_MS + 250);
    } else {
      finish();
    }
  }, SHOW_MS);
}

export function toast(text) {
  if (text === null || text === undefined || text === '') return;
  queue.push(String(text));
  if (!busy) showNext();
}

// True while an achievement toast is on screen (or queued) (docs/ART-DESIGN.md
// §1: first-run hints never appear in the same second as achievement toasts,
// so the hint callout waits while a toast is visible).
export function isToastVisible() {
  return busy || queue.length > 0;
}
