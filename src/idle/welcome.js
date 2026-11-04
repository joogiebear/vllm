// "Welcome back" modal (docs/COMPLETION.md, "Welcome back").
// showWelcome({ awaySeconds, earned, capped, affordable? }) is called from
// app.js on load when offline earnings were credited. Skipped when earned
// is 0. Focus is trapped on the Collect button; Escape closes.
import { OFFLINE_CAP_HOURS } from './data.js?v=20261104203928';
import { fmt } from './fmt.js?v=20261104203928';

const CSS = `
    /* Welcome back modal */
    .wb-backdrop {
      position: fixed; inset: 0; z-index: 100;
      background: rgba(0, 0, 0, 0.6);
      display: flex; align-items: center; justify-content: center;
      padding: 16px;
    }
    .wb-card {
      width: 100%; max-width: 340px;
      background: var(--card); border: 1px solid var(--border);
      border-radius: 14px; padding: 20px;
      display: flex; flex-direction: column; align-items: center;
      gap: 8px; text-align: center;
    }
    .wb-title { font-size: 18px; font-weight: 800; color: var(--text); }
    .wb-line { font-size: 13px; color: var(--dim); }
    .wb-earned { font-size: 40px; font-weight: 800; color: var(--affordable); line-height: 1.1; }
    .wb-cap { font-size: 12px; color: var(--dim); }
    .wb-btn {
      min-height: 44px; width: 100%; margin-top: 8px;
      border-radius: 10px; border: 1px solid var(--affordable);
      background: var(--affordable); color: #0b0f17;
      font-size: 15px; font-weight: 800; cursor: pointer;
    }
`;

let styleInjected = false;
function injectStyle() {
  if (styleInjected) return;
  styleInjected = true;
  const el = document.createElement('style');
  el.textContent = CSS;
  document.head.appendChild(el);
}

let openEl = null;

function fmtDur(seconds) {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function closeWelcome() {
  if (openEl && openEl.parentNode) openEl.parentNode.removeChild(openEl);
  openEl = null;
}

// True while the welcome-back card is covering the screen (docs/ART-DESIGN.md
// §1: first-run hints never appear in the same second as the welcome-back
// card, so the hint callout waits while it is open).
export function isWelcomeOpen() {
  return openEl !== null;
}

export function showWelcome(info) {
  if (!info || !(info.earned > 0)) return; // skip when earned is 0
  closeWelcome();
  injectStyle();

  const el = document.createElement('div');
  el.className = 'wb-backdrop';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Welcome back');

  const card = document.createElement('div');
  card.className = 'wb-card';

  const title = document.createElement('div');
  title.className = 'wb-title';
  title.textContent = 'Welcome back';
  card.appendChild(title);

  const earned = document.createElement('div');
  earned.className = 'wb-earned';
  earned.textContent = `+${fmt(info.earned)} tokens`;
  card.appendChild(earned);

  const away = document.createElement('div');
  away.className = 'wb-line';
  away.textContent = `Your managers kept the machines running while you were away ${fmtDur(info.awaySeconds || 0)}.`;
  card.appendChild(away);

  // "You can now afford" only when non-zero (info.affordable = { upgrades, managers }).
  const aff = info.affordable || {};
  if ((aff.upgrades || 0) > 0 || (aff.managers || 0) > 0) {
    const parts = [];
    if ((aff.upgrades || 0) > 0) parts.push(plural(aff.upgrades, 'upgrade'));
    if ((aff.managers || 0) > 0) parts.push(plural(aff.managers, 'manager'));
    const line = document.createElement('div');
    line.className = 'wb-line';
    line.textContent = `You can now afford: ${parts.join(', ')}`;
    card.appendChild(line);
  }

  if (info.capped) {
    const cap = document.createElement('div');
    cap.className = 'wb-cap';
    cap.textContent = `Offline earnings stop after ${info.capHours || OFFLINE_CAP_HOURS} h. Long Weekend (a Weight upgrade) raises it to 24 h.`;
    card.appendChild(cap);
  }

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'wb-btn';
  btn.textContent = 'Collect';
  btn.addEventListener('click', closeWelcome);
  card.appendChild(btn);

  el.appendChild(card);
  document.body.appendChild(el);
  openEl = el;
  btn.focus();

  // Focus trap: the only focusable is the button, so keep focus there.
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeWelcome();
    else if (e.key === 'Tab') {
      e.preventDefault();
      btn.focus();
    }
  });
}
