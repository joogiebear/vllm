import {
  buy, buyUpgrade, buyWeightUpgrade, buyAllUpgrades, prestige,
  tokensPerSecond, cost, weightsAvailable, createState, ensureStarter,
  runRow, rowRate, cyclePayout, cycleTime, hasManager, buyManager,
} from './core.js?v=20261103041805';
import {
  GENERATORS, UPGRADES, WEIGHT_UPGRADES, DOUBLING_THRESHOLDS,
  PRESTIGE_DIVISOR, WEIGHT_BONUS_PER_WEIGHT, COST_GROWTH,
  CONTINUOUS_CYCLE_MAX, MANAGERS,
} from './data.js?v=20261103041805';
import { get as getSetting, set as setSetting } from './settings.js?v=20261103041805';
import { mountAchievements } from './achievements-ui.js?v=20261103041805';
import { mountStats } from './stats-ui.js?v=20261103041805';

// Tier colours (data.js is owned by the balance pass, so colours live here).
const TIER_COLORS = {
  pi: '#4fd1c5',
  gamer: '#63b3ed',
  workstation: '#b794f4',
  rack: '#f6ad55',
  cluster: '#f687b3',
  datacenter: '#68d391',
  campus: '#f6e05e',
  swarm: '#fc8181',
};

export function fmt(n) {
  if (!Number.isFinite(n)) return '∞';
  if (getSetting('numberFormat') === 'sci' && n >= 1000) {
    return n.toExponential(2).replace('e+', 'e'); // e.g. 1.23e6
  }
  if (n >= 1e15) return `${(n / 1e15).toFixed(1)}Q`;
  if (n >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  if (n >= 100) return `${Math.floor(n)}`;
  if (n >= 10) return n % 1 ? n.toFixed(1) : `${Math.floor(n)}`;
  return n % 1 ? n.toFixed(1) : `${Math.floor(n)}`;
}

function fmtExact(n) {
  if (!Number.isFinite(n)) return '∞';
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function fmtTime(ms) {
  const s = Math.max(0, ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

// Max affordable units for a generator, given current tokens.
function maxAffordable(state, g) {
  let count = 0;
  let total = 0;
  let c = cost(state, g.id, 1);
  while (c <= state.tokens && count < 1e7) {
    total += c;
    count += 1;
    c = cost(state, g.id, 1, count);
  }
  return { count, total };
}

function upgradeWords(u) {
  switch (u.kind) {
    case 'production': return `×${u.value} production`;
    case 'productionTier': return `×${u.value} ${u.tier} output`;
    case 'cacheRate': return `+${Math.round(u.value * 100)}% cache rate`;
    default: return `+${Math.round(u.value * 100)}%`;
  }
}

const WU_WORDS = {
  auto: 'Managers auto-run their rows',
  distill: '+% bonus per weight',
  offline: 'Offline progress',
};

export function createUI(state, io) {
  const view = {
    buyMode: '1',
    upSegment: 'upgrades',
    prestigeArmed: false,
    resetArmed: false,
    lastNow: Date.now(),
  };

  const els = {
    tokens: document.getElementById('tokens'),
    tps: document.getElementById('tps'),
    weightsChip: document.getElementById('weights-chip'),
    rush: document.getElementById('rush'),
    banner: document.getElementById('banner'),
    genCards: document.getElementById('gen-cards'),
    upGrid: document.getElementById('up-grid'),
    manGrid: document.getElementById('man-grid'),
    wAvail: document.getElementById('w-avail'),
    prestigeHintFill: document.getElementById('prestige-hint-fill'),
    prestigeHintText: document.getElementById('prestige-hint-text'),
    prestigeHintBonus: document.getElementById('prestige-hint-bonus'),
    prestigeBtn: document.getElementById('prestige-btn'),
    prestigeGrid: document.getElementById('prestige-grid'),
    exportArea: document.getElementById('export-area'),
    importArea: document.getElementById('import-area'),
    resetBtn: document.getElementById('reset-btn'),
    settingsMsg: document.getElementById('settings-msg'),
    upDot: document.querySelector('#tabs [data-tab="upgrades"] .tab-dot'),
    prestigeDot: document.querySelector('#tabs [data-tab="prestige"] .tab-dot'),
  };

  // Buy-mode switch (header): x1 / x10 / x100 / Max.
  const buyModeBtns = Array.from(
    document.querySelectorAll('#buy-sel button'),
  );
  buyModeBtns.forEach((b) => {
    b.addEventListener('click', () => {
      view.buyMode = b.dataset.mode;
      buyModeBtns.forEach((x) => x.classList.toggle('active', x === b));
      updateGenCards(state);
    });
  });

  // Build one card per generator once (DOM stays stable); visibility is toggled.
  const genRefs = GENERATORS.map((g) => {
    const card = document.createElement('div');
    card.className = 'gen-card';

    const top = document.createElement('div');
    top.className = 'gen-top';

    const icon = document.createElement('button');
    icon.type = 'button';
    icon.className = 'gen-icon';
    icon.style.setProperty('--tier-color', TIER_COLORS[g.id]);
    const iconCount = document.createElement('span');
    iconCount.className = 'gen-icon-count';
    icon.append(iconCount);
    icon.addEventListener('click', () => {
      if (runRow(state, g.id)) updateGenCards(state);
    });

    const id = document.createElement('div');
    id.className = 'gen-id';
    const name = document.createElement('div');
    name.className = 'gen-name';
    name.textContent = g.name;
    const milestone = document.createElement('div');
    milestone.className = 'gen-milestone';
    id.append(name, milestone);
    top.append(icon, id);

    const bar = document.createElement('div');
    bar.className = 'gen-bar';
    const barFill = document.createElement('div');
    barFill.className = 'gen-bar-fill';
    const barPayout = document.createElement('span');
    barPayout.className = 'gen-bar-payout';
    bar.append(barFill, barPayout);

    const bottom = document.createElement('div');
    bottom.className = 'gen-bottom';
    const buyBtn = document.createElement('button');
    buyBtn.type = 'button';
    buyBtn.className = 'gen-buy';
    buyBtn.addEventListener('click', () => {
      const mode = view.buyMode === 'max' ? 'max' : Number(view.buyMode);
      const bought = buy(state, g.id, mode);
      if (bought > 0) flash(card);
      updateGenCards(state);
    });
    const status = document.createElement('div');
    status.className = 'gen-status';
    bottom.append(buyBtn, status);

    card.append(top, bar, bottom);
    els.genCards.appendChild(card);
    return { g, card, icon, iconCount, name, milestone, bar, barFill, barPayout, buyBtn, status };
  });

  // Upgrades tab (Upgrades segment).
  const upRefs = UPGRADES.map((u) => {
    const row = document.createElement('div');
    row.className = 'up-row';
    const left = document.createElement('div');
    left.className = 'up-left';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = u.name;
    const effect = document.createElement('span');
    effect.className = 'effect';
    effect.textContent = upgradeWords(u);
    left.append(name, effect);
    const buyBtn = document.createElement('button');
    buyBtn.type = 'button';
    buyBtn.className = 'buy';
    buyBtn.addEventListener('click', () => {
      if (buyUpgrade(state, u.id)) flash(row);
      updateUpgrades(state);
    });
    row.append(left, buyBtn);
    els.upGrid.appendChild(row);
    return { u, row, buyBtn };
  });
  const buyAllBtn = document.createElement('button');
  buyAllBtn.type = 'button';
  buyAllBtn.id = 'buy-all';
  buyAllBtn.textContent = 'Buy all';
  buyAllBtn.addEventListener('click', () => {
    const n = buyAllUpgrades(state);
    if (n > 0) flash(els.upGrid);
    updateUpgrades(state);
  });
  els.upGrid.prepend(buyAllBtn);

  // Managers (Upgrades tab, Managers segment): one row per manager, tier order.
  const manRefs = MANAGERS.map((m) => {
    const g = GENERATORS.find((x) => x.id === m.id);
    const row = document.createElement('div');
    row.className = 'up-row';
    const left = document.createElement('div');
    left.className = 'up-left';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = m.name;
    const effect = document.createElement('span');
    effect.className = 'effect';
    effect.textContent = `Runs ${g.name} automatically`;
    left.append(name, effect);
    const buyBtn = document.createElement('button');
    buyBtn.type = 'button';
    buyBtn.className = 'buy';
    buyBtn.addEventListener('click', () => {
      if (buyManager(state, m.id)) {
        flash(row);
        updateGenCards();
      }
      updateManagers();
    });
    row.append(left, buyBtn);
    els.manGrid.appendChild(row);
    return { m, g, row, buyBtn };
  });

  // Segmented control: Managers | Upgrades, remembered across visits.
  const SEG_KEY = 'overclock.idle.upSegment';
  const segBtns = Array.from(document.querySelectorAll('#up-seg button'));
  function setSegment(seg, persist) {
    view.upSegment = seg;
    segBtns.forEach((b) => b.classList.toggle('active', b.dataset.seg === seg));
    els.manGrid.hidden = seg !== 'managers';
    els.upGrid.hidden = seg !== 'upgrades';
    if (persist) {
      try {
        localStorage.setItem(SEG_KEY, seg);
      } catch (err) {
        // private mode: the segment just does not persist
      }
    }
  }
  segBtns.forEach((b) => b.addEventListener('click', () => setSegment(b.dataset.seg, true)));
  let savedSeg = null;
  try {
    const s = localStorage.getItem(SEG_KEY);
    if (s === 'managers' || s === 'upgrades') savedSeg = s;
  } catch (err) {
    // private mode: default segment
  }
  setSegment(savedSeg || 'upgrades', false);

  // More tab: Achievements | Stats | Settings, remembered across visits.
  const MORE_SEG_KEY = 'overclock.idle.moreSegment';
  const moreSegBtns = Array.from(document.querySelectorAll('#more-seg button'));
  const morePanels = {
    achievements: document.getElementById('more-achievements'),
    stats: document.getElementById('more-stats'),
    settings: document.getElementById('more-settings'),
  };
  function setMoreSegment(seg, persist) {
    moreSegBtns.forEach((b) => b.classList.toggle('active', b.dataset.seg === seg));
    for (const k of Object.keys(morePanels)) morePanels[k].hidden = k !== seg;
    if (persist) {
      try {
        localStorage.setItem(MORE_SEG_KEY, seg);
      } catch (err) {
        // private mode: the segment just does not persist
      }
    }
  }
  moreSegBtns.forEach((b) => b.addEventListener('click', () => setMoreSegment(b.dataset.seg, true)));
  let savedMoreSeg = null;
  try {
    const s = localStorage.getItem(MORE_SEG_KEY);
    if (s === 'achievements' || s === 'stats' || s === 'settings') savedMoreSeg = s;
  } catch (err) {
    // private mode: default segment
  }
  setMoreSegment(savedMoreSeg || 'achievements', false);

  // Weight upgrades (prestige tab).
  const wuRefs = WEIGHT_UPGRADES.map((u) => {
    const row = document.createElement('div');
    row.className = 'wu';
    const left = document.createElement('div');
    left.className = 'wu-left';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = u.name;
    const effect = document.createElement('span');
    effect.className = 'effect';
    effect.textContent = WU_WORDS[u.id] || `×${u.value}`;
    left.append(name, effect);
    const buyBtn = document.createElement('button');
    buyBtn.type = 'button';
    buyBtn.className = 'buy';
    buyBtn.addEventListener('click', () => {
      if (buyWeightUpgrade(state, u.id)) flash(row);
      updateWeightUpgrades(state);
    });
    row.append(left, buyBtn);
    els.prestigeGrid.appendChild(row);
    return { u, row, buyBtn };
  });

  // Prestige. The second confirm is skipped when confirmPrestige is off.
  els.prestigeBtn.addEventListener('click', () => {
    if (getSetting('confirmPrestige') !== false && !view.prestigeArmed) {
      view.prestigeArmed = true;
      els.prestigeBtn.classList.add('armed');
      els.prestigeBtn.textContent = 'CONFIRM PRESTIGE';
      return;
    }
    view.prestigeArmed = false;
    els.prestigeBtn.classList.remove('armed');
    els.prestigeBtn.textContent = 'PRESTIGE';
    const gained = prestige(state);
    showBanner(
      `Prestige! +${gained} weights. New run begins — buy a Raspberry Pi.`,
      'New run',
    );
  });

  // Tabs.
  const tabs = Array.from(document.querySelectorAll('#tabs button'));
  const sections = {
    game: document.getElementById('tab-game'),
    upgrades: document.getElementById('tab-upgrades'),
    prestige: document.getElementById('tab-prestige'),
    shop: document.getElementById('tab-shop'),
    more: document.getElementById('tab-more'),
  };
  tabs.forEach((t) => {
    t.addEventListener('click', () => {
      const tab = t.dataset.tab;
      Object.entries(sections).forEach(([k, s]) => {
        s.hidden = k !== tab;
      });
      tabs.forEach((x) => {
        if (x === t) x.setAttribute('aria-current', 'page');
        else x.removeAttribute('aria-current');
      });
    });
  });

  // Settings.
  document.getElementById('export-btn').addEventListener('click', () => {
    els.exportArea.value = io.exportSave(state, Date.now());
  });
  document.getElementById('import-btn').addEventListener('click', () => {
    const imported = io.importSave(els.importArea.value.trim());
    if (imported === null) {
      showBanner('Import failed: bad save string.', 'Import error');
      return;
    }
    io.replaceState(imported);
    showBanner('Save imported.', 'Imported');
  });
  els.resetBtn.addEventListener('click', () => {
    if (!view.resetArmed) {
      view.resetArmed = true;
      els.resetBtn.classList.add('armed');
      els.resetBtn.textContent = 'CONFIRM RESET';
      return;
    }
    view.resetArmed = false;
    els.resetBtn.classList.remove('armed');
    els.resetBtn.textContent = 'HARD RESET';
    io.hardReset();
    io.replaceState(ensureStarter(createState()));
    showBanner('Hard reset. Fresh run.', 'Reset');
  });

  // --- More > Settings: preferences wired to settings.js (docs/COMPLETION.md)
  const SETTINGS_CSS = `
    /* Settings rows (More tab) */
    .set-prefs { display: flex; flex-direction: column; gap: 12px; }
    .set-row {
      display: flex; align-items: center; justify-content: space-between;
      gap: 8px; flex-wrap: wrap;
      background: var(--card); border: 1px solid var(--border);
      border-radius: 12px; padding: 10px 12px;
    }
    .set-row .set-label { font-size: 14px; font-weight: 700; color: var(--text); }
    .set-choice { display: flex; gap: 4px; flex-wrap: wrap; }
    .set-choice button {
      min-height: 44px; padding: 0 10px;
      border-radius: 8px; border: 1px solid var(--border);
      background: var(--bg); color: var(--dim);
      font-size: 13px; cursor: pointer;
    }
    .set-choice button.active {
      background: var(--affordable); border-color: var(--affordable);
      color: #0b0f17; font-weight: 700;
    }
    .set-note { font-size: 12px; color: var(--dim); }
    .about {
      background: var(--card); border: 1px solid var(--border);
      border-radius: 12px; padding: 12px;
      display: flex; flex-direction: column; gap: 6px;
      font-size: 13px; color: var(--dim);
    }
    .about .about-ver { color: var(--text); font-weight: 700; }
    .about a { color: var(--affordable); text-decoration: none; }
  `;
  let settingsStyleInjected = false;
  function injectSettingsStyle() {
    if (settingsStyleInjected) return;
    settingsStyleInjected = true;
    const el = document.createElement('style');
    el.textContent = SETTINGS_CSS;
    document.head.appendChild(el);
  }

  // Version stamp: the ?v= value in the page's own module URL.
  function versionStamp() {
    try {
      const v = new URL(import.meta.url).searchParams.get('v');
      return v || 'dev';
    } catch (err) {
      return 'dev';
    }
  }

  function makeChoiceRow(label, key, options) {
    const row = document.createElement('div');
    row.className = 'set-row';
    const lab = document.createElement('span');
    lab.className = 'set-label';
    lab.textContent = label;
    const group = document.createElement('div');
    group.className = 'set-choice';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', label);
    const sync = () => {
      const current = String(getSetting(key));
      for (const b of group.children) {
        const on = b.dataset.value === current;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
      }
    };
    for (const opt of options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.value = opt.value;
      b.textContent = opt.label;
      b.addEventListener('click', () => {
        setSetting(key, opt.value);
        sync();
      });
      group.appendChild(b);
    }
    row.append(lab, group);
    sync();
    return row;
  }

  function makeToggleRow(label, key, note) {
    const row = document.createElement('div');
    row.className = 'set-row';
    const lab = document.createElement('span');
    lab.className = 'set-label';
    lab.textContent = label;
    const btn = document.createElement('button');
    btn.type = 'button';
    const sync = () => {
      const on = getSetting(key) !== false;
      btn.textContent = on ? 'On' : 'Off';
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
    };
    btn.addEventListener('click', () => {
      setSetting(key, getSetting(key) === false);
      sync();
    });
    sync();
    row.append(lab, btn);
    if (note) {
      const n = document.createElement('div');
      n.className = 'set-note';
      n.textContent = note;
      row.appendChild(n);
    }
    return row;
  }

  function buildSettings() {
    injectSettingsStyle();

    const prefs = document.createElement('div');
    prefs.className = 'set-prefs';
    prefs.appendChild(makeChoiceRow('Number format', 'numberFormat', [
      { value: 'short', label: 'Short' },
      { value: 'sci', label: 'Scientific' },
    ]));
    prefs.appendChild(makeToggleRow('Confirm before prestige', 'confirmPrestige'));
    prefs.appendChild(makeChoiceRow('Reduce motion', 'reduceMotion', [
      { value: 'auto', label: 'Auto' },
      { value: 'on', label: 'On' },
      { value: 'off', label: 'Off' },
    ]));
    prefs.appendChild(makeToggleRow('Sound', 'sound'));
    prefs.appendChild(makeToggleRow('Haptics', 'haptics', 'Haptics need the app version on iPhone'));
    els.moreSettings.prepend(prefs);

    const about = document.createElement('div');
    about.className = 'about';
    const ver = document.createElement('div');
    ver.className = 'about-ver';
    ver.textContent = `Version ${versionStamp()}`;
    const lic = document.createElement('div');
    lic.textContent = 'Free and open source under GPL-3.0';
    const link = document.createElement('a');
    link.href = 'https://github.com/joogiebear/vllm';
    link.textContent = 'github.com/joogiebear/vllm';
    const credit = document.createElement('div');
    credit.textContent = 'Designed with Claude, built by Qwen3.8 on Hermes';
    about.append(ver, lic, link, credit);
    els.moreSettings.appendChild(about);
  }

  // Mount the More tab sub-screens once at start.
  buildSettings();
  mountAchievements(document.getElementById('more-achievements'), () => state);
  mountStats(document.getElementById('more-stats'), () => state);

  // Banner.
  let bannerTimer = null;
  function showBanner(msg, actionLabel) {
    els.banner.hidden = false;
    els.banner.textContent = '';
    const line = document.createElement('div');
    line.className = 'banner-msg';
    const text = document.createElement('span');
    text.textContent = msg;
    line.append(text);
    if (actionLabel) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = actionLabel;
      btn.addEventListener('click', () => {
        els.banner.hidden = true;
      });
      line.append(btn);
    }
    els.banner.appendChild(line);
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => {
      els.banner.hidden = true;
    }, 6000);
  }

  function flash(el) {
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  function updateGenCards() {
    let nextUnowned = null;
    for (const r of genRefs) {
      if ((state.generators[r.g.id] || 0) === 0 && nextUnowned === null) {
        nextUnowned = r.g.id;
      }
    }
    for (const r of genRefs) {
      const g = r.g;
      const owned = state.generators[g.id] || 0;
      const visible = owned > 0 || g.id === nextUnowned;
      r.card.hidden = !visible;
      if (!visible) continue;

      const managed = hasManager(state, g.id);
      const progress = state.cycles[g.id];
      const ct = cycleTime(state, g);
      const continuous = ct < CONTINUOUS_CYCLE_MAX;
      const running = progress !== null && progress !== undefined;

      r.iconCount.textContent = fmt(owned);

      const next = DOUBLING_THRESHOLDS.find((t) => owned < t);
      r.milestone.textContent = next === undefined ? '' : `x2 speed at ${next}`;

      let fill;
      if (continuous) fill = 1;
      else if (running) fill = Math.min(1, progress / ct);
      else fill = 0;
      r.barFill.style.transform = `scaleX(${fill})`;

      if (continuous) {
        r.barPayout.textContent = `${fmt(rowRate(state, g))}/s`;
      } else {
        r.barPayout.textContent = `+${fmt(cyclePayout(state, g))}`;
      }

      const isLocked = owned === 0;
      r.card.classList.toggle('locked', isLocked);
      r.bar.hidden = isLocked;
      r.milestone.hidden = isLocked;
      r.status.hidden = isLocked;
      let c;
      let disabled;
      if (isLocked) {
        c = cost(state, g.id, 1);
        disabled = c > state.tokens;
      } else if (view.buyMode === 'max') {
        const m = maxAffordable(state, g);
        c = m.count > 0 ? m.total : cost(state, g.id, 1);
        disabled = m.count === 0;
      } else {
        c = cost(state, g.id, Number(view.buyMode));
        disabled = c > state.tokens;
      }
      r.buyBtn.textContent = isLocked
        ? `Unlock · ${fmt(c)}`
        : `Buy x${view.buyMode === 'max' ? 'Max' : view.buyMode} · ${fmt(c)}`;
      r.buyBtn.disabled = disabled;
      r.buyBtn.classList.toggle('afford', !disabled);

      if (continuous) {
        r.status.textContent = `${fmt(rowRate(state, g))}/s`;
      } else if (managed) {
        r.status.textContent = 'Auto';
      } else if (!running) {
        r.status.textContent = 'Tap to run';
      } else {
        const remaining = Math.max(0, ct - progress);
        r.status.textContent = fmtTime(remaining * 1000);
      }
    }
  }

  function updateManagers() {
    for (const r of manRefs) {
      const hired = hasManager(state, r.m.id);
      const owned = state.generators[r.m.id] || 0;
      r.row.classList.toggle('dim', hired);
      if (hired) {
        r.buyBtn.textContent = 'Hired';
        r.buyBtn.disabled = true;
        r.buyBtn.classList.remove('afford');
      } else if (owned === 0) {
        r.buyBtn.textContent = `Need ${r.g.name}`;
        r.buyBtn.disabled = true;
        r.buyBtn.classList.remove('afford');
      } else {
        const afford = r.m.cost <= state.tokens;
        r.buyBtn.textContent = `Hire · ${fmt(r.m.cost)}`;
        r.buyBtn.disabled = !afford;
        r.buyBtn.classList.toggle('afford', afford);
      }
    }
  }

  function updateUpgrades() {
    for (const r of upRefs) {
      const owned = state.upgrades.includes(r.u.id);
      r.row.classList.toggle('owned', owned);
      r.row.classList.toggle('dim', !owned);
      if (owned) {
        r.buyBtn.textContent = '✓';
        r.buyBtn.disabled = true;
        r.buyBtn.classList.remove('afford');
      } else {
        const c = r.u.cost;
        const afford = c <= state.tokens;
        r.buyBtn.textContent = fmt(c);
        r.buyBtn.disabled = !afford;
        r.buyBtn.classList.toggle('afford', afford);
      }
    }
    const affordable = upRefs.some((r) => !state.upgrades.includes(r.u.id) && r.u.cost <= state.tokens);
    buyAllBtn.disabled = !affordable;
  }

  function updateWeightUpgrades() {
    for (const r of wuRefs) {
      const owned = state.weightUpgrades.includes(r.u.id);
      if (owned) {
        r.buyBtn.textContent = '✓';
        r.buyBtn.disabled = true;
      } else {
        r.buyBtn.textContent = `${r.u.cost}w`;
        r.buyBtn.disabled = state.weights < r.u.cost;
      }
    }
  }

  function updatePrestige() {
    const avail = weightsAvailable(state);
    els.wAvail.textContent = fmt(avail);
    const next = Math.floor(state.lifetime / PRESTIGE_DIVISOR) + 1;
    const frac = Math.min(1, state.lifetime / (PRESTIGE_DIVISOR * next));
    els.prestigeHintFill.style.width = `${Math.round(frac * 100)}%`;
    els.prestigeHintText.textContent = `Next weight at ${fmt(PRESTIGE_DIVISOR * next)} lifetime`;
    const wu = WEIGHT_UPGRADES.find((u) => u.kind === 'weightBonus' && state.weightUpgrades.includes(u.id));
    const perWeight = wu ? wu.value : WEIGHT_BONUS_PER_WEIGHT;
    const bonus = Math.round(perWeight * (state.weights || 0) * 100);
    els.prestigeHintBonus.textContent = `Current bonus +${bonus}%`;
    els.prestigeBtn.disabled = avail < 1;
  }

  function updateTabDots() {
    const upAffordable = upRefs.some((r) => !state.upgrades.includes(r.u.id) && r.u.cost <= state.tokens);
    const manAffordable = manRefs.some(
      (r) => !hasManager(state, r.m.id)
        && (state.generators[r.m.id] || 0) > 0
        && r.m.cost <= state.tokens,
    );
    els.upDot.hidden = !(upAffordable || manAffordable);
    els.prestigeDot.hidden = weightsAvailable(state) < 1;
  }

  function updateRushChip() {
    const ready =
      state.rushCooldownUntil === null || state.rushCooldownUntil <= view.lastNow;
    els.rush.textContent = ready
      ? 'Rush ready'
      : `Rush in ${fmtTime(state.rushCooldownUntil - view.lastNow)}`;
  }

  function update() {
    view.lastNow = Date.now();
    els.tokens.textContent = fmt(state.tokens);
    els.tps.textContent = fmt(tokensPerSecond(state));

    const hasWeights = state.weights > 0 || (state.weightsEarnedThisCycle || 0) > 0;
    els.weightsChip.hidden = !hasWeights;
    if (hasWeights) {
      const wu = WEIGHT_UPGRADES.find((u) => u.kind === 'weightBonus' && state.weightUpgrades.includes(u.id));
      const perWeight = wu ? wu.value : WEIGHT_BONUS_PER_WEIGHT;
      const bonus = Math.round(perWeight * (state.weights || 0) * 100);
      els.weightsChip.textContent = `Weights +${bonus}%`;
    }

    updateGenCards();
    updateUpgrades();
    updateManagers();
    updatePrestige();
    updateTabDots();
    updateWeightUpgrades();
    updateRushChip();
  }

  return { update, showBanner };
}
