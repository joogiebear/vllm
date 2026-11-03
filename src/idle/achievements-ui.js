// Achievements screen (docs/COMPLETION.md).
// mountAchievements(container, getState) is called once at start by ui.js:
// a progress line ("12 of 44 · +12% production"), then one-line rows with
// a badge (28 px), name and a short condition, unlocked first, locked ones
// dim. Rows are
// built once; the refresh pass only updates text and classes and reorders
// the existing nodes, at most once a second.
import { ACHIEVEMENTS, GENERATORS } from './data.js?v=20261103163205';
import { badge } from './icons.js?v=20261103163205';

const STYLE_ID = 'overclock-achievements-style';

// Inject the screen's CSS once; a second mount is a no-op.
function injectStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = `
    .ach-progress {
      padding: 10px 12px;
      background: var(--card, #131a27);
      border: 1px solid var(--border, #1d2636);
      border-radius: 10px;
      font-size: 13px;
      color: var(--dim, #93a3b8);
    }
    .ach-list { display: flex; flex-direction: column; gap: 8px; }
    .ach-row {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 12px;
      background: var(--card, #131a27);
      border: 1px solid var(--border, #1d2636);
      border-radius: 10px;
      font-size: 13px;
      color: var(--text, #eef3f9);
    }
    .ach-row.dim { color: var(--dim, #93a3b8); }
    .ach-badge { width: 28px; flex-shrink: 0; display: flex; }
    .ach-name { font-weight: 600; white-space: nowrap; }
    .ach-cond {
      min-width: 0;
      color: var(--dim, #93a3b8);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
  `;
  document.head.appendChild(el);
}

// Short number for condition text (1e6 -> "1M").
function short(n) {
  if (n >= 1e15) return `${(n / 1e15).toFixed(1)}Q`;
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return `${n}`;
}

// Short condition built from the JSON-safe test descriptor
// (mirrors the desc strings generated in data.js).
function conditionText(test) {
  switch (test.kind) {
    case 'owned': {
      const g = GENERATORS.find((x) => x.id === test.gen);
      const name = g ? g.name : test.gen;
      return `Own ${test.n} ${name}${test.n === 1 ? '' : 's'}`;
    }
    case 'lifetime':
      return `Earn ${short(test.n)} tokens this run`;
    case 'prestiges':
      return `Prestige ${test.n} ${test.n === 1 ? 'time' : 'times'}`;
    case 'taps':
      return `Start ${test.n.toLocaleString('en-US')} rows by hand`;
    case 'rushGames':
      return `Play ${test.n} rush ${test.n === 1 ? 'game' : 'games'}`;
    case 'allManagers':
      return 'Hire all 8 managers in one run';
    default:
      return '';
  }
}

export function mountAchievements(container, getState) {
  if (!container) return;
  if (container.childElementCount > 0) return; // already mounted
  injectStyle();

  const progress = document.createElement('div');
  progress.className = 'ach-progress';
  const list = document.createElement('div');
  list.className = 'ach-list';

  // Build the rows once; refresh only swaps the badge when state flips.
  const refs = ACHIEVEMENTS.map((a) => {
    const row = document.createElement('div');
    row.className = 'ach-row';
    // Its badge at 28 px, locked or unlocked
    // (docs/ART-DESIGN.md "Achievement badges").
    const badgeEl = document.createElement('span');
    badgeEl.className = 'ach-badge';
    badgeEl.appendChild(badge(a, false, 28));
    const name = document.createElement('span');
    name.className = 'ach-name';
    name.textContent = a.name;
    const cond = document.createElement('span');
    cond.className = 'ach-cond';
    cond.textContent = conditionText(a.test);
    row.append(badgeEl, name, cond);
    list.appendChild(row);
    return { a, row, badgeEl, done: false };
  });
  container.append(progress, list);

  let lastRefresh = 0;
  function refresh() {
    const now = Date.now();
    if (now - lastRefresh < 1000) return; // at most once a second
    lastRefresh = now;
    const state = getState();
    const unlocked = Array.isArray(state.achievements) ? state.achievements : [];
    progress.textContent =
      `${unlocked.length} of ${ACHIEVEMENTS.length} · +${unlocked.length}% production`;
    for (const r of refs) {
      const done = unlocked.includes(r.a.id);
      r.row.classList.toggle('dim', !done);
      if (r.done !== done) {
        r.done = done;
        r.badgeEl.replaceChildren(badge(r.a, done, 28));
      }
    }
    // Unlocked first; stable order within each group.
    const ordered = refs.filter((r) => unlocked.includes(r.a.id))
      .concat(refs.filter((r) => !unlocked.includes(r.a.id)));
    for (const r of ordered) list.appendChild(r.row);
  }

  refresh();
  setInterval(refresh, 1000);
}
