// Event UI (docs/TIERS-EVENTS.md, "Event UI"). mountEvents(listContainer,
// headerContainer, getState, onClaim) is called once at start by ui.js.
// The banner card (Game tab, above the generator cards) and the header chip
// are built once; a 250 ms interval updates only text and classes, never
// rebuilding the DOM.
import { get as getSetting } from './settings.js?v=20261103140732';
import {
  EVENT_KINDS,
  EVENT_CLAIM_WINDOW,
  EVENT_SPIKE_MULTIPLIER,
} from './data.js?v=20261103140732';

const CSS = `
    /* Event banner (Game tab, above the generator cards) */
    .event-banner {
      background: var(--card); border: 1px solid var(--border);
      border-radius: 12px; padding: 12px;
      display: flex; flex-direction: column; gap: 8px;
      margin-bottom: 10px; min-width: 0;
    }
    .event-banner .ev-title {
      font-size: 15px; font-weight: 800; color: var(--text);
      overflow-wrap: anywhere;
    }
    .event-banner .ev-effect {
      font-size: 12px; color: var(--dim); overflow-wrap: anywhere;
    }
    .event-banner .ev-bar {
      position: relative; height: 10px; border-radius: 5px;
      background: var(--bg); border: 1px solid var(--border); overflow: hidden;
    }
    .event-banner .ev-bar-fill {
      position: absolute; inset: 0;
      transform-origin: left center; transform: scaleX(0);
      background: var(--affordable);
    }
    .event-banner .ev-claim {
      min-height: 44px; border-radius: 8px;
      border: 1px solid var(--affordable); background: var(--affordable);
      color: #0b0f17; font-size: 14px; font-weight: 800;
      letter-spacing: 0.06em; cursor: pointer;
    }
    .event-banner .ev-claim:disabled { opacity: 0.5; cursor: default; }
    .event-banner.pulse { animation: ev-pulse 1.2s ease-in-out infinite; }
    @keyframes ev-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(255, 181, 71, 0); }
      50% { box-shadow: 0 0 0 6px rgba(255, 181, 71, 0.25); }
    }
    /* Header chip for a running timed event */
    .event-chip {
      display: inline-flex; align-items: center; justify-content: center;
      min-height: 44px; padding: 4px 14px; border-radius: 999px;
      border: 1px solid var(--affordable); background: var(--bg);
      color: var(--affordable); font-size: 13px; white-space: nowrap;
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

// "0:24" — ceil so the countdown shows 1 until it hits 0.
function fmtClock(seconds) {
  const s = Math.max(0, Math.ceil(Number.isFinite(seconds) ? seconds : 0));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

// 'auto' falls back to the OS preference.
function reduceMotionOn() {
  const v = getSetting('reduceMotion');
  if (v === 'on') return true;
  if (v === 'off') return false;
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (err) {
    return false;
  }
}

export function mountEvents(listContainer, headerContainer, getState, onClaim) {
  if (!listContainer && !headerContainer) return;
  injectStyle();

  // Banner card: title, one effect line, the 20 s drain bar, Claim.
  const banner = document.createElement('div');
  banner.className = 'event-banner';
  banner.hidden = true;
  const title = document.createElement('div');
  title.className = 'ev-title';
  const effect = document.createElement('div');
  effect.className = 'ev-effect';
  const bar = document.createElement('div');
  bar.className = 'ev-bar';
  const barFill = document.createElement('div');
  barFill.className = 'ev-bar-fill';
  bar.appendChild(barFill);
  const claim = document.createElement('button');
  claim.type = 'button';
  claim.className = 'ev-claim';
  claim.textContent = 'Claim';
  claim.addEventListener('click', () => {
    if (typeof onClaim === 'function') onClaim();
  });
  banner.append(title, effect, bar, claim);
  if (listContainer) listContainer.appendChild(banner);

  // Header chip for a running timed event ("x3 · 0:24", "Turbo · 0:24").
  const chip = document.createElement('div');
  chip.className = 'event-chip';
  chip.hidden = true;
  if (headerContainer) headerContainer.appendChild(chip);

  function kindById(id) {
    return EVENT_KINDS.find((k) => k.id === id) || null;
  }

  function update() {
    const state = typeof getState === 'function' ? getState() : null;
    const offer = (state && state.eventOffer) || null;
    const active = (state && state.eventActive) || null;

    // Banner: only while an offer exists.
    banner.hidden = !offer;
    if (offer) {
      const k = kindById(offer.kind);
      title.textContent = k ? k.name : 'Event';
      effect.textContent = k ? k.effect : '';
      const left = Math.max(0, Number.isFinite(offer.claimBy) ? offer.claimBy : 0);
      barFill.style.transform = `scaleX(${Math.min(1, left / EVENT_CLAIM_WINDOW)})`;
    }
    // The pulse is the only motion; drop it when reduce motion is on.
    banner.classList.toggle('pulse', !!offer && !reduceMotionOn());

    // Chip: only while a timed event runs (windfall is instant).
    const timed = active && (active.kind === 'spike' || active.kind === 'turbo');
    chip.hidden = !timed;
    if (timed) {
      const label = active.kind === 'spike' ? `x${EVENT_SPIKE_MULTIPLIER}` : 'Turbo';
      chip.textContent = `${label} · ${fmtClock(active.remaining)}`;
    }
  }

  update();
  setInterval(update, 250);
}
