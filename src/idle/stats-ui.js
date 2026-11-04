// Stats screen (docs/COMPLETION.md, "Stats"). mountStats(container, getState)
// is called once at start by ui.js. Rows are built once; a 1 Hz interval
// updates only the value cells, never rebuilding the DOM.
import { fmt } from './fmt.js?v=20261104145857';

const CSS = `
    /* Stats screen */
    #more-stats { display: flex; flex-direction: column; gap: 12px; }
    .stats-group {
      background: var(--card); border: 1px solid var(--border);
      border-radius: 12px; padding: 12px;
      display: flex; flex-direction: column; gap: 8px;
    }
    .stats-group h3 {
      margin: 0; font-size: 13px; font-weight: 800; letter-spacing: 0.06em;
      text-transform: uppercase; color: var(--dim);
    }
    .stats-row {
      display: flex; align-items: center; justify-content: space-between;
      gap: 8px; font-size: 14px;
    }
    .stats-row .stats-label { color: var(--dim); }
    .stats-row .stats-value { color: var(--text); font-weight: 700; }
`;

let styleInjected = false;
function injectStyle() {
  if (styleInjected) return;
  styleInjected = true;
  const el = document.createElement('style');
  el.textContent = CSS;
  document.head.appendChild(el);
}

// Durations like "3h 12m", "12m 30s", "45s".
function fmtDur(seconds) {
  const s = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function mountStats(container, getState) {
  if (!container) return;
  injectStyle();

  const values = {};
  function row(parent, label) {
    const row = document.createElement('div');
    row.className = 'stats-row';
    const lab = document.createElement('span');
    lab.className = 'stats-label';
    lab.textContent = label;
    const val = document.createElement('span');
    val.className = 'stats-value';
    row.append(lab, val);
    parent.appendChild(row);
    return val;
  }
  function group(title) {
    const g = document.createElement('div');
    g.className = 'stats-group';
    const h = document.createElement('h3');
    h.textContent = title;
    g.appendChild(h);
    container.appendChild(g);
    return g;
  }

  const run = group('This run');
  values.runTime = row(run, 'Run time');
  values.runTokens = row(run, 'Tokens earned');

  const all = group('All time');
  values.allTimeTokens = row(all, 'Tokens earned');
  values.bestRun = row(all, 'Best run');
  values.playTime = row(all, 'Play time');
  values.timeAway = row(all, 'Time away');
  values.offlineEarned = row(all, 'Offline earnings');
  values.prestiges = row(all, 'Prestiges');
  values.managersHired = row(all, 'Managers hired');
  values.taps = row(all, 'Taps');
  values.generatorsBought = row(all, 'Generators bought');
  values.upgradesBought = row(all, 'Upgrades bought');


  function update() {
    const state = getState();
    const st = (state && state.stats) || {};
    values.runTime.textContent = fmtDur((st.playSeconds || 0) - (st.runStartedAt || 0));
    values.runTokens.textContent = fmt(state ? state.lifetime || 0 : 0);
    values.allTimeTokens.textContent = fmt(st.allTimeTokens || 0);
    values.bestRun.textContent = fmt(st.bestRunTokens || 0);
    values.playTime.textContent = fmtDur(st.playSeconds || 0);
    values.timeAway.textContent = fmtDur(st.offlineSeconds || 0);
    values.offlineEarned.textContent = fmt(st.offlineTokens || 0);
    values.prestiges.textContent = fmt(st.prestiges || 0);
    values.managersHired.textContent = fmt(st.managersHired || 0);
    values.taps.textContent = fmt(st.taps || 0);
    values.generatorsBought.textContent = fmt(st.generatorsBought || 0);
    values.upgradesBought.textContent = fmt(st.upgradesBought || 0);
  }

  update();
  // At most once a second; the guard also covers a drifting interval.
  let last = 0;
  setInterval(() => {
    const now = Date.now();
    if (now - last < 1000) return;
    last = now;
    update();
  }, 1000);
}
