import {
  buy, buyUpgrade, buyWeightUpgrade, buyAllUpgrades, prestige,
  tokensPerSecond, cost, weightsAvailable, createState, ensureStarter,
  runRow, rowRate, cyclePayout, cycleTime, hasManager, buyManager,
  claimEvent,
  expandRegion, regionsAvailable, regionName, buyRegionPerk,
  maxBuyable,
} from './core.js?v=20261103182600';
import {
  GENERATORS, UPGRADES, WEIGHT_UPGRADES, DOUBLING_THRESHOLDS,
  PRESTIGE_DIVISOR, WEIGHT_BONUS_PER_WEIGHT, COST_GROWTH,
  CONTINUOUS_CYCLE_MAX, MANAGERS,
  REGION_PERKS, REGION_DIVISOR, REGION_UNLOCK_WEIGHTS,
} from './data.js?v=20261103182600';
import { get as getSetting, set as setSetting } from './settings.js?v=20261103182600';
import { play } from './feedback.js?v=20261103182600';
import { mountAchievements } from './achievements-ui.js?v=20261103182600';
import { mountStats } from './stats-ui.js?v=20261103182600';
import { mountEvents } from './events-ui.js?v=20261103182600';
import { mountHint, naturalDismiss, showHintsAgain } from './hints.js?v=20261103182600';

// Tier colours live in icons.js (one source); imported back here.
import { TIER_COLORS, icon as tierIcon, managerIcon } from './icons.js?v=20261103182600';
import { fmt } from './fmt.js?v=20261103182600';

function fmtExact(n) {
  if (!Number.isFinite(n)) return '∞';
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

// Cost display: under 1,000, round up to a whole number before fmt (so
// "17.3 tokens" shows as "18 tokens"); 1,000+ goes through fmt's K/M/B.
function fmtCost(n) {
  return fmt(n < 1000 ? Math.ceil(n) : n);
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

// Backup slot times (Settings "Backups"): "10:42" and "Today 10:42".
function fmtClock(savedAt) {
  const d = new Date(savedAt);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function fmtBackupTime(savedAt) {
  const d = new Date(savedAt);
  const now = new Date();
  const hm = fmtClock(savedAt);
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return `Today ${hm}`;
  const y = new Date(now.getTime() - 86400000);
  const isYesterday =
    d.getFullYear() === y.getFullYear() &&
    d.getMonth() === y.getMonth() &&
    d.getDate() === y.getDate();
  if (isYesterday) return `Yesterday ${hm}`;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${hm}`;
}

// Two-line buy button: the two spans are created once and only their
// text is updated afterwards, so the DOM stays stable.
function makeLines(buyBtn) {
  const l1 = document.createElement('span');
  l1.className = 'btn-l1';
  const l2 = document.createElement('span');
  l2.className = 'btn-l2';
  buyBtn.append(l1, l2);
  return { l1, l2 };
}

function setLines(r, line1, line2) {
  r.l1.textContent = line1;
  r.l2.textContent = line2 ? line2 : '';
  r.l2.hidden = !line2;
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
    prestigeSeg: 'weights',
    prestigeArmed: false,
    expandArmed: false,
    regionDotSeen: false,
    resetArmed: false,
    lastNow: Date.now(),
  };

  // Previous update's cycle progress per row, to detect completed cycles
  // (a payout) without touching core.js.
  const prevCycles = {};

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
    prestigeWeights: document.getElementById('prestige-weights'),
    prestigeRegions: document.getElementById('prestige-regions'),
    regionHintFill: document.getElementById('region-hint-fill'),
    regionHintText: document.getElementById('region-hint-text'),
    regionMult: document.getElementById('region-mult'),
    expandBtn: document.getElementById('expand-btn'),
    expandNote: document.getElementById('expand-note'),
    regionPerksGrid: document.getElementById('region-perks'),
    regionsSegBtn: document.querySelector('#prestige-seg [data-seg="regions"]'),
    regionDot: document.querySelector('#prestige-seg [data-seg="regions"] .seg-dot'),
    regionName: document.getElementById('region-name'),
  };

  // Buy-mode switch (header row 2): x1 / x10 / x100 / Max. The row is
  // Game-tab only; the tab handler below toggles its visibility.
  const buySel = document.getElementById('buy-sel');
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
    // Shared by the icon ring, the manager badge ring and the bar fill.
    card.style.setProperty('--tier-color', TIER_COLORS[g.id]);

    const top = document.createElement('div');
    top.className = 'gen-top';

    const icon = document.createElement('button');
    icon.type = 'button';
    icon.className = 'gen-icon';
    icon.style.setProperty('--tier-color', TIER_COLORS[g.id]);
    const tier = tierIcon(g.id, 24);
    tier.style.color = TIER_COLORS[g.id];
    tier.style.position = 'absolute';
    tier.style.inset = '0';
    tier.style.margin = 'auto';
    const iconCount = document.createElement('span');
    iconCount.className = 'gen-icon-count';
    // The count is a small pill (~18 px tall) centred on the bottom edge
    // of the circle, so the tier icon stays fully visible above it.
    // left/bottom/transform override the stylesheet's inset: 0.
    Object.assign(iconCount.style, {
      top: 'auto',
      right: 'auto',
      left: '50%',
      bottom: '-9px',
      transform: 'translateX(-50%)',
      width: 'auto',
      height: '18px',
      minWidth: '18px',
      padding: '0 3px',
      borderRadius: '9px',
      background: 'var(--tier-color, #93a3b8)',
      color: '#0b0f17',
      fontSize: '10px',
      fontWeight: '800',
    });
    icon.append(tier);
    icon.append(iconCount);
    // A small solid badge at the icon's top-right corner while a manager
    // is hired (docs/ART-DESIGN.md "Manager icons"): an 18 px dark disc
    // with a 1.5 px tier-colour ring holding a tiny person glyph, clear
    // of the count pill at the bottom. Hidden by default;
    // updateGenCards toggles it.
    const manMark = document.createElement('span');
    manMark.className = 'gen-man-mark';
    manMark.style.display = 'none';
    const manGlyph = tierIcon('person', 11);
    manGlyph.style.color = TIER_COLORS[g.id];
    manMark.append(manGlyph);
    icon.append(manMark);
    icon.addEventListener('click', () => {
      if (runRow(state, g.id)) {
        naturalDismiss('run', state);
        updateGenCards(state);
      }
    });

    const bar = document.createElement('div');
    bar.className = 'gen-bar';
    const barFill = document.createElement('div');
    barFill.className = 'gen-bar-fill';
    const barPayout = document.createElement('span');
    barPayout.className = 'gen-bar-payout';
    bar.append(barFill, barPayout);
    // The payout bar is tappable: tapping it runs the row, the same handler
    // as the round icon (docs/ART-DESIGN.md §1 owner request).
    bar.addEventListener('click', () => {
      if (runRow(state, g.id)) {
        naturalDismiss('run', state);
        updateGenCards(state);
      }
    });

    // Row 1 right column: the name with the "x2 speed at N" note on the
    // same line (small, dim), then the 28 px payout bar under it, so the
    // row stays 56 px tall (the icon's height).
    const id = document.createElement('div');
    id.className = 'gen-id';
    const nameLine = document.createElement('div');
    nameLine.className = 'gen-name-line';
    const name = document.createElement('div');
    name.className = 'gen-name';
    name.textContent = g.name;
    const milestone = document.createElement('div');
    milestone.className = 'gen-milestone';
    nameLine.append(name, milestone);
    id.append(nameLine, bar);
    top.append(icon, id);

    const bottom = document.createElement('div');
    bottom.className = 'gen-bottom';
    const buyBtn = document.createElement('button');
    buyBtn.type = 'button';
    buyBtn.className = 'gen-buy';
    const { l1, l2 } = makeLines(buyBtn);
    buyBtn.addEventListener('click', () => {
      const mode = view.buyMode === 'max' ? 'max' : Number(view.buyMode);
      const bought = buy(state, g.id, mode);
      if (bought > 0) {
        naturalDismiss('buy', state);
        flash(card);
        play('buy');
      }
      updateGenCards(state);
    });
    const status = document.createElement('div');
    status.className = 'gen-status';
    bottom.append(buyBtn, status);

    card.append(top, bottom);
    els.genCards.appendChild(card);
    return { g, card, icon, iconCount, manMark, name, milestone, bar, barFill, barPayout, buyBtn, l1, l2, status };
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
      if (buyUpgrade(state, u.id)) {
        flash(row);
        play('buy');
      }
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
    if (n > 0) {
      flash(els.upGrid);
      play('buy');
    }
    updateUpgrades(state);
  });
  els.upGrid.prepend(buyAllBtn);

  // Managers (Upgrades tab, Managers segment): one row per manager, tier order.
  const manRefs = MANAGERS.map((m) => {
    const g = GENERATORS.find((x) => x.id === m.id);
    const row = document.createElement('div');
    row.className = 'up-row';
    // managerIcon at 32 px on the left (docs/ART-DESIGN.md "Manager icons").
    const manIcon = managerIcon(m.id, 32);
    manIcon.style.flexShrink = '0';
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
    const { l1, l2 } = makeLines(buyBtn);
    buyBtn.addEventListener('click', () => {
      if (buyManager(state, m.id)) {
        naturalDismiss('manager', state);
        flash(row);
        play('hire');
        updateGenCards();
      }
      updateManagers();
    });
    row.append(manIcon, left, buyBtn);
    els.manGrid.appendChild(row);
    return { m, g, row, buyBtn, l1, l2 };
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
    const { l1, l2 } = makeLines(buyBtn);
    buyBtn.addEventListener('click', () => {
      if (buyWeightUpgrade(state, u.id)) {
        flash(row);
        play('buy');
      }
      updateWeightUpgrades(state);
    });
    row.append(left, buyBtn);
    els.prestigeGrid.appendChild(row);
    return { u, row, buyBtn, l1, l2 };
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
    if (gained > 0) play('prestige');
    showBanner(
      `Prestige! +${gained} weights. New run begins — buy a Raspberry Pi.`,
      'New run',
    );
  });

  // Region perks (Prestige tab, Regions segment): one row per perk, bought
  // with Regions, kept forever (docs/REGIONS-DESIGN.md).
  const PERK_WORDS = {
    headStart: 'Every run starts with Seed Funding, Procurement Bot, Standing Orders and the first 3 managers',
    fresh: 'Each new region starts with 5 Weights',
    overclock: 'All cycles 20% faster',
    autoProcure: 'Buy All runs by itself every 10 s (toggle in Settings)',
    eventDesk: 'Timed events come twice as often and last 50% longer',
    longHaul: 'Offline cap 24 h and offline rate 100%',
  };
  const perkRefs = REGION_PERKS.map((p) => {
    const row = document.createElement('div');
    row.className = 'wu';
    const left = document.createElement('div');
    left.className = 'wu-left';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = p.name;
    const effect = document.createElement('span');
    effect.className = 'effect';
    effect.textContent = PERK_WORDS[p.id] || '';
    left.append(name, effect);
    const buyBtn = document.createElement('button');
    buyBtn.type = 'button';
    buyBtn.className = 'buy';
    const { l1, l2 } = makeLines(buyBtn);
    buyBtn.addEventListener('click', () => {
      if (buyRegionPerk(state, p.id)) {
        flash(row);
        play('buy');
      }
      updateRegions();
    });
    row.append(left, buyBtn);
    els.regionPerksGrid.appendChild(row);
    return { p, row, buyBtn, l1, l2 };
  });

  // Expand (the second prestige layer). The second confirm is skipped when
  // confirmPrestige is off, like prestige.
  els.expandBtn.addEventListener('click', () => {
    if (getSetting('confirmPrestige') !== false && !view.expandArmed) {
      view.expandArmed = true;
      els.expandBtn.classList.add('armed');
      els.expandBtn.textContent = 'CONFIRM EXPAND';
      els.expandNote.hidden = false;
      return;
    }
    view.expandArmed = false;
    els.expandBtn.classList.remove('armed');
    els.expandBtn.textContent = 'EXPAND';
    els.expandNote.hidden = true;
    const gained = expandRegion(state);
    if (gained > 0) play('prestige');
    showBanner(
      `New region: ${regionName(state)}. +${gained} Region${gained === 1 ? '' : 's'}.`,
      'New region',
    );
  });

  // Prestige tab (Weights | Regions segments), remembered across visits.
  // The Regions segment stays hidden until the unlock threshold, then a dot
  // marks it (docs/REGIONS-DESIGN.md).
  const PSEG_KEY = 'overclock.idle.prestigeSegment';
  const psegBtns = Array.from(document.querySelectorAll('#prestige-seg button'));
  function setPrestigeSeg(seg, persist) {
    view.prestigeSeg = seg;
    psegBtns.forEach((b) => b.classList.toggle('active', b.dataset.seg === seg));
    els.prestigeWeights.hidden = seg !== 'weights';
    els.prestigeRegions.hidden = seg !== 'regions';
    if (persist) {
      try {
        localStorage.setItem(PSEG_KEY, seg);
      } catch (err) {
        // private mode: the segment just does not persist
      }
    }
  }
  psegBtns.forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.seg === 'regions') view.regionDotSeen = true;
    setPrestigeSeg(b.dataset.seg, true);
  }));
  let savedPseg = null;
  try {
    const s = localStorage.getItem(PSEG_KEY);
    if (s === 'weights' || s === 'regions') savedPseg = s;
  } catch (err) {
    // private mode: default segment
  }
  if (savedPseg === 'regions') view.regionDotSeen = true;
  setPrestigeSeg(savedPseg || 'weights', false);

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
      // The buy-amount row (header row 2) is Game-tab only.
      buySel.hidden = tab !== 'game';
      tabs.forEach((x) => {
        if (x === t) x.setAttribute('aria-current', 'page');
        else x.removeAttribute('aria-current');
      });
      // Opening Upgrades dismisses the manager hint (docs/ART-DESIGN.md §1).
      if (tab === 'upgrades') naturalDismiss('manager', state);
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
    .set-choice button, .set-row > button {
      min-height: 44px; min-width: 64px; padding: 0 10px;
      border-radius: 8px; border: 1px solid var(--border);
      background: var(--bg); color: var(--dim);
      font-size: 13px; cursor: pointer;
    }
    .set-choice button.active, .set-row > button.active {
      background: var(--affordable); border-color: var(--affordable);
      color: #0b0f17; font-weight: 700;
    }
    .set-note { font-size: 12px; color: var(--dim); }
    .set-tips-btn {
      min-height: 44px; padding: 0 16px;
      border-radius: 10px; border: 1px solid var(--border);
      background: var(--bg); color: var(--dim);
      font-size: 13px; cursor: pointer;
    }
    .about {
      background: var(--card); border: 1px solid var(--border);
      border-radius: 12px; padding: 12px;
      display: flex; flex-direction: column; gap: 6px;
      font-size: 13px; color: var(--dim);
    }
    .about .about-ver { color: var(--text); font-weight: 700; }
    .about a { color: var(--affordable); text-decoration: none; }
    /* Restore-backup confirm card (in-game, no window.confirm). */
    .bk-backdrop {
      position: fixed; inset: 0; z-index: 100;
      background: rgba(0, 0, 0, 0.6);
      display: flex; align-items: center; justify-content: center;
      padding: 16px;
    }
    .bk-card {
      width: 100%; max-width: 340px;
      background: var(--card); border: 1px solid var(--border);
      border-radius: 14px; padding: 20px;
      display: flex; flex-direction: column; gap: 8px; text-align: center;
    }
    .bk-text { font-size: 15px; font-weight: 700; color: var(--text); }
    .bk-btns { display: flex; gap: 8px; margin-top: 8px; }
    .bk-btns button {
      flex: 1; min-height: 44px;
      border-radius: 10px; border: 1px solid var(--border);
      background: var(--bg); color: var(--dim);
      font-size: 14px; font-weight: 700; cursor: pointer;
    }
    .bk-yes { border-color: var(--affordable); background: var(--affordable); color: #0b0f17; }
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

  // The Auto-Procure toggle is only shown when the perk is owned.
  let autoProcureRow = null;

  function buildSettings() {
    injectSettingsStyle();

    const prefs = document.createElement('div');
    prefs.className = 'set-prefs';
    prefs.appendChild(makeChoiceRow('Number format', 'numberFormat', [
      { value: 'short', label: 'Short' },
      { value: 'sci', label: 'Scientific' },
    ]));
    prefs.appendChild(makeToggleRow('Confirm before prestige', 'confirmPrestige'));
    autoProcureRow = makeToggleRow('Auto-Procure', 'autoProcure', 'Buy All runs by itself every 10 s');
    autoProcureRow.hidden = true;
    prefs.appendChild(autoProcureRow);
    prefs.appendChild(makeChoiceRow('Reduce motion', 'reduceMotion', [
      { value: 'auto', label: 'Auto' },
      { value: 'on', label: 'On' },
      { value: 'off', label: 'Off' },
    ]));
    prefs.appendChild(makeToggleRow('Sound', 'sound'));
    prefs.appendChild(makeToggleRow('Haptics', 'haptics', 'Haptics need the app version on iPhone'));
    morePanels.settings.prepend(prefs);

    // "Show tips again" (docs/ART-DESIGN.md §1): clears hints.seen so the
    // first-run hints show again.
    const tipsBtn = document.createElement('button');
    tipsBtn.type = 'button';
    tipsBtn.className = 'set-tips-btn';
    tipsBtn.textContent = 'Show tips again';
    tipsBtn.addEventListener('click', () => {
      showHintsAgain(state);
      showBanner('Tips will show again.', 'Tips');
    });
    morePanels.settings.appendChild(tipsBtn);

    // Backups (docs/STABILITY-DESIGN.md section 3): the three slots, b1
    // (newest) first, with the time saved and lifetime tokens; an empty
    // slot shows "Empty". Restore asks for confirmation in an in-game
    // card, then replaces the state the same way import does.
    let confirmEl = null;
    function closeConfirm() {
      if (confirmEl && confirmEl.parentNode) confirmEl.parentNode.removeChild(confirmEl);
      confirmEl = null;
    }
    function confirmRestore(when, onYes) {
      closeConfirm();
      const el = document.createElement('div');
      el.className = 'bk-backdrop';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-label', 'Restore backup');
      const card = document.createElement('div');
      card.className = 'bk-card';
      const text = document.createElement('div');
      text.className = 'bk-text';
      text.textContent = `Restore the backup from ${when}? Your current progress will be replaced.`;
      const btns = document.createElement('div');
      btns.className = 'bk-btns';
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.textContent = 'Cancel';
      cancel.addEventListener('click', closeConfirm);
      const yes = document.createElement('button');
      yes.type = 'button';
      yes.className = 'bk-yes';
      yes.textContent = 'Restore';
      yes.addEventListener('click', () => {
        closeConfirm();
        onYes();
      });
      btns.append(cancel, yes);
      card.append(text, btns);
      el.appendChild(card);
      document.body.appendChild(el);
      confirmEl = el;
      yes.focus();
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeConfirm();
      });
    }
    function doRestore(slot) {
      const restored = io.restoreBackup(slot);
      if (restored === null) {
        showBanner('Restore failed: that backup is empty or unreadable.', 'Restore error');
        return;
      }
      io.replaceState(restored);
      showBanner('Backup restored.', 'Restored');
    }
    const backups = document.createElement('div');
    backups.className = 'set-prefs';
    const bkTitle = document.createElement('div');
    bkTitle.className = 'set-label';
    bkTitle.textContent = 'Backups';
    backups.appendChild(bkTitle);
    for (const b of io.listBackups()) {
      const row = document.createElement('div');
      row.className = 'set-row';
      const lab = document.createElement('span');
      lab.className = 'set-label';
      if (b === null) {
        lab.textContent = 'Empty';
      } else {
        lab.textContent = `${fmtBackupTime(b.savedAt)} · ${fmt(b.lifetime)} tokens`;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = 'Restore';
        btn.addEventListener('click', () => confirmRestore(fmtClock(b.savedAt), () => doRestore(b.slot)));
        row.append(lab, btn);
      }
      backups.appendChild(row);
    }
    morePanels.settings.appendChild(backups);

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
    morePanels.settings.appendChild(about);
  }

  // Mount the More tab sub-screens once at start.
  buildSettings();
  mountAchievements(document.getElementById('more-achievements'), () => state);
  mountStats(document.getElementById('more-stats'), () => state);

  // Timed events (docs/TIERS-EVENTS.md): banner above the generator cards,
  // chip in the header (appended last; while it is visible it takes the
  // Rush chip's place, so the column holds at most two chips).
  const eventsList = document.createElement('div');
  const eventsChip = document.createElement('div');
  document.getElementById('tab-game').prepend(eventsList);
  document.getElementById('hud-right').append(eventsChip);
  mountEvents(eventsList, eventsChip, () => state, () => {
    if (claimEvent(state)) play('achievement');
  });

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
      // manMark is a <span>: toggle display (the stylesheet's flex
      // applies when it is shown).
      r.manMark.style.display = managed ? '' : 'none';
      const progress = state.cycles[g.id];
      const prev = prevCycles[g.id];
      // A cycle completed since the previous update when progress wrapped
      // (managed row) or reset to null (unmanaged row stopped after paying).
      if (
        prev !== null && prev !== undefined &&
        (progress === null ? !managed : typeof progress === 'number' && progress < prev)
      ) {
        play('payout');
      }
      prevCycles[g.id] = progress;
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
      let c;
      let disabled;
      if (isLocked) {
        c = cost(state, g.id, 1);
        disabled = c > state.tokens;
        setLines(r, `Unlock · ${fmtCost(c)} tokens`, null);
      } else if (view.buyMode === 'max') {
        const m = maxBuyable(state, g.id);
        c = m.count > 0 ? m.total : cost(state, g.id, 1);
        disabled = m.count === 0;
        setLines(
          r,
          m.count > 0
            ? `Buy ${fmt(m.count)} level${m.count === 1 ? '' : 's'}`
            : 'Buy 1 level',
          `${fmtCost(c)} tokens`,
        );
      } else {
        const n = Number(view.buyMode);
        c = cost(state, g.id, n);
        disabled = c > state.tokens;
        setLines(r, `Buy ${n} level${n === 1 ? '' : 's'}`, `${fmtCost(c)} tokens`);
      }
      r.buyBtn.disabled = disabled;
      r.buyBtn.classList.toggle('afford', !disabled);

      // The status line next to the Buy button is gone: the manager badge
      // on the icon shows a hired manager, the bar shows the rate, and
      // the Buy button is full width. The element stays in the DOM
      // (stable), always hidden.
      r.status.hidden = true;
    }
  }

  function updateManagers() {
    for (const r of manRefs) {
      const hired = hasManager(state, r.m.id);
      const owned = state.generators[r.m.id] || 0;
      r.row.classList.toggle('dim', hired);
      if (hired) {
        setLines(r, 'Hired', null);
        r.buyBtn.disabled = true;
        r.buyBtn.classList.remove('afford');
      } else if (owned === 0) {
        setLines(r, `Need ${r.g.name}`, null);
        r.buyBtn.disabled = true;
        r.buyBtn.classList.remove('afford');
      } else {
        const afford = r.m.cost <= state.tokens;
        setLines(r, 'Hire', `${fmtCost(r.m.cost)} tokens`);
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
        r.buyBtn.textContent = fmtCost(c);
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
        setLines(r, '✓', null);
        r.buyBtn.disabled = true;
      } else {
        setLines(r, 'Buy', `${r.u.cost} Weight${r.u.cost === 1 ? '' : 's'}`);
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

  function updateRegions() {
    const total = state.weightsEverEarned || 0;
    const earned = state.regionsEarned || 0;
    const target = (earned + 1) * (earned + 1) * REGION_DIVISOR;
    const prev = earned * earned * REGION_DIVISOR;
    const avail = regionsAvailable(state);
    let pct;
    let text;
    if (avail >= 1) {
      pct = 100;
      text = `Ready: ${avail} Region${avail === 1 ? '' : 's'} available`;
    } else if (total >= target) {
      pct = 100;
      text = `100% of the way to your ${earned === 0 ? 'first' : 'next'} Region (${fmt(total)} / ${fmt(target)} Weights)`;
    } else {
      pct = Math.round(((total - prev) / (target - prev)) * 100);
      text = `You're ${pct}% of the way to your ${earned === 0 ? 'first' : 'next'} Region (${fmt(total)} / ${fmt(target)} Weights)`;
    }
    els.regionHintFill.style.width = `${pct}%`;
    els.regionHintText.textContent = text;
    els.regionMult.textContent = `Current multiplier x${fmt(Math.pow(2, earned))} — each Region doubles all production`;
    els.expandBtn.disabled = avail < 1;
    for (const r of perkRefs) {
      const owned = (state.regionPerks || []).includes(r.p.id);
      if (owned) {
        setLines(r, 'Owned', null);
        r.buyBtn.disabled = true;
      } else {
        setLines(r, 'Buy', `${r.p.cost} Region${r.p.cost === 1 ? '' : 's'}`);
        r.buyBtn.disabled = (state.regions || 0) < r.p.cost;
      }
    }
  }

  function updatePrestigeSeg() {
    const unlocked =
      (state.weightsEverEarned || 0) >= REGION_UNLOCK_WEIGHTS;
    els.regionsSegBtn.hidden = !unlocked;
    // The dot marks the Regions segment once, until it has been viewed.
    els.regionDot.hidden = !unlocked || view.regionDotSeen;
    if (!unlocked && view.prestigeSeg === 'regions') setPrestigeSeg('weights', false);
    updateRegions();
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
    const tokenText = fmt(state.tokens);
    els.tokens.textContent = tokenText;
    // Step the font down once the text is 8+ chars so long values
    // ("1.23e15", "999.9T") stay on one line at 360 px.
    els.tokens.classList.toggle('long', tokenText.length >= 8);
    els.tps.textContent = fmt(tokensPerSecond(state));

    const earnedRegions = state.regionsEarned || 0;
    const hasWeights = state.weights > 0 || (state.weightsEarnedThisCycle || 0) > 0;
    els.weightsChip.hidden = !hasWeights;
    if (hasWeights) {
      const wu = WEIGHT_UPGRADES.find((u) => u.kind === 'weightBonus' && state.weightUpgrades.includes(u.id));
      const perWeight = wu ? wu.value : WEIGHT_BONUS_PER_WEIGHT;
      const bonus = Math.round(perWeight * (state.weights || 0) * 100);
      els.weightsChip.textContent = earnedRegions >= 1
        ? `Weights +${bonus}% · x${fmt(Math.pow(2, earnedRegions))}`
        : `Weights +${bonus}%`;
    }

    // Region name on the rate line ("1.6K per sec · Oregon"), once any
    // Region is earned.
    els.regionName.hidden = earnedRegions < 1;
    if (earnedRegions >= 1) els.regionName.textContent = `· ${regionName(state)}`;

    // While a timed event runs (spike/turbo), its chip takes Rush's place
    // in the header's 2-chip column; Rush comes back when the event ends.
    els.rush.hidden = !!(
      state.eventActive &&
      (state.eventActive.kind === 'spike' || state.eventActive.kind === 'turbo')
    );

    // Cosmetic tint per region: 12° hue-rotate per region on the card ring
    // colours only (the generator icon borders), capped at 120°.
    const tint = Math.min(12 * earnedRegions, 120);
    const tintFilter = tint > 0 ? `hue-rotate(${tint}deg)` : '';
    for (const r of genRefs) r.icon.style.filter = tintFilter;

    // The Auto-Procure toggle is only shown when the perk is owned.
    if (autoProcureRow) {
      autoProcureRow.hidden = !(state.regionPerks || []).includes('autoProcure');
    }

    updateGenCards();
    updateUpgrades();
    updateManagers();
    updatePrestige();
    updatePrestigeSeg();
    updateTabDots();
    updateWeightUpgrades();
    updateRushChip();
  }

  // First-run hints (docs/ART-DESIGN.md §1): mount the callout.
  mountHint(state);

  return { update, showBanner };
}
