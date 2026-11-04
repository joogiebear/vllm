import {
  buy, buyUpgrade, buyX5Upgrade, buyWeightUpgrade, buyAllUpgrades, prestige,
  tokensPerSecond, cost, weightsAvailable, createState, ensureStarter,
  runRow, rowRate, cyclePayout, cycleTime, hasManager, buyManager,
  claimEvent,
  expandRegion, regionsAvailable, regionName, buyRegionPerk, regionsUnlocked,
  regionsLockedText, regionsUnlockProgress, regionsHintLine,
  maxBuyable, isTierUnlocked, showLockedTier, nextMilestone, nextBuyCount, regionTarget, globalMilestone,
} from './core.js?v=20261104205653';
import {
  GENERATORS, UPGRADES, X5_UPGRADES, WEIGHT_UPGRADES,
  PRESTIGE_DIVISOR, WEIGHT_BONUS_PER_WEIGHT, COST_GROWTH,
  CONTINUOUS_CYCLE_MAX, MANAGERS,
  REGION_PERKS, ACHIEVEMENTS,
  TIER_GATES, GLOBAL_MILESTONES,
  upgradeEffect, weightUpgradeEffect,
} from './data.js?v=20261104205653';
import { get as getSetting, set as setSetting } from './settings.js?v=20261104205653';
import { play } from './feedback.js?v=20261104205653';
import { applyBackground } from './bg.js?v=20261104205653';
import { mountAchievements } from './achievements-ui.js?v=20261104205653';
import { mountStats } from './stats-ui.js?v=20261104205653';
import { mountEvents } from './events-ui.js?v=20261104205653';
import { mountHint, naturalDismiss, showHintsAgain } from './hints.js?v=20261104205653';
import { nextGoal } from './advice.js?v=20261104205653';

// Tier colours live in icons.js (one source); imported back here.
import { TIER_COLORS, icon as tierIcon, managerIcon, tierArt } from './icons.js?v=20261104205653';
import { fmt } from './fmt.js?v=20261104205653';

function fmtExact(n) {
  if (!Number.isFinite(n)) return '∞';
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

// Cost display: under 1,000, round up to a whole number before fmt (so
// "17.3 tokens" shows as "18 tokens"); 1,000+ goes through fmt's K/M/B.
function fmtCost(n) {
  return fmt(n < 1000 ? Math.ceil(n) : n);
}

// Row countdown: "0:04", "2:15", "1:02:03".
function fmtCountdown(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
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

// Next buy mode (docs/UX-PLAN.md, section 3.3): heads for the row's next
// milestone, buying as many of those as the player can afford now (at
// least 1, so a new player can always buy one Pi). The row's milestone
// line shows how far the milestone still is.
function nextAffordable(state, id) {
  const toMilestone = nextBuyCount(state, id);
  const { count } = maxBuyable(state, id);
  return Math.max(1, Math.min(toMilestone, count));
}

export function createUI(state, io) {
  const view = {
    buyMode: 'next',
    tab: 'game',
    onServers: true,
    goalAt: 0,
    goal: null,
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
    manDot: document.querySelector('#tabs [data-tab="managers"] .tab-dot'),
    moreDot: document.querySelector('#tabs [data-tab="more"] .tab-dot'),
    prestigeDot: document.querySelector('#tabs [data-tab="prestige"] .tab-dot'),
    prestigeWeights: document.getElementById('prestige-weights'),
    prestigeRegions: document.getElementById('prestige-regions'),
    regionHintFill: document.getElementById('region-hint-fill'),
    regionHintText: document.getElementById('region-hint-text'),
    regionHintNote: document.getElementById('region-hint-note'),
    regionMult: document.getElementById('region-mult'),
    expandBtn: document.getElementById('expand-btn'),
    expandNote: document.getElementById('expand-note'),
    regionPerksGrid: document.getElementById('region-perks'),
    regionHead: document.getElementById('region-head'),
    regionExpand: document.getElementById('region-expand'),
    regionLocked: document.getElementById('region-locked'),
    regionLockedFill: document.getElementById('region-locked-fill'),
    regionLockedText: document.getElementById('region-locked-text'),
    regionsSegLock: document.getElementById('regions-seg-lock'),
    regionsHintLine: document.getElementById('regions-hint-line'),
    layerPNow: document.getElementById('layer-p-now'),
    layerRegions: document.getElementById('layer-regions'),
    layerRState: document.getElementById('layer-r-state'),
    layerPerks: document.getElementById('layer-perks'),
    perkCredits: document.getElementById('perk-credits'),
    regionsSegBtn: document.querySelector('#prestige-seg [data-seg="regions"]'),
    regionDot: document.querySelector('#prestige-seg [data-seg="regions"] .seg-dot'),
    regionName: document.getElementById('region-name'),
    goalStrip: document.getElementById('goal-strip'),
    goalLabel: document.getElementById('goal-label'),
    goalHelp: document.getElementById('goal-help'),
    buyRow: document.getElementById('buy-row'),
    goalNum: document.getElementById('goal-num'),
    goalFill: document.getElementById('goal-fill'),
    tierFooter: document.getElementById('tier-footer'),
    rateUnit: document.getElementById('rate-unit'),
  };

  // Buy-mode switch (header row 2): x1 / x10 / x100 / Max. The row is
  // Game-tab only; the tab handler below toggles its visibility.
  const buySel = document.getElementById('buy-sel');
  const buyModeBtns = Array.from(
    document.querySelectorAll('#buy-sel button'),
  );
  // Next (docs/UX-PLAN.md, section 3.3) is the default: it buys exactly
  // up to the row's next milestone. The choice is remembered.
  const BUY_MODE_KEY = 'overclock.idle.buyMode';
  try {
    const saved = localStorage.getItem(BUY_MODE_KEY);
    if (buyModeBtns.some((b) => b.dataset.mode === saved)) view.buyMode = saved;
  } catch (err) {
    // private mode: the default mode
  }
  buyModeBtns.forEach((x) => x.classList.toggle('active', x.dataset.mode === view.buyMode));
  buyModeBtns.forEach((b) => {
    b.addEventListener('click', () => {
      view.buyMode = b.dataset.mode;
      buyModeBtns.forEach((x) => x.classList.toggle('active', x === b));
      try {
        localStorage.setItem(BUY_MODE_KEY, view.buyMode);
      } catch (err) {
        // private mode: the mode just does not persist
      }
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
    const tier = tierArt(g.id, 44);
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
      let mode;
      if (view.buyMode === 'max') mode = 'max';
      else if (view.buyMode === 'next') mode = nextAffordable(state, g.id);
      else mode = Number(view.buyMode);
      const bought = buy(state, g.id, mode);
      if (bought > 0) {
        naturalDismiss('buy', state);
        flash(card);
        play('buy');
      }
      updateGenCards(state);
    });
    // Row status (docs/UX-PLAN.md, section 3.4): Auto, a countdown, or
    // Tap to run, on the right of the name line.
    const status = document.createElement('span');
    status.className = 'gen-status';
    nameLine.append(status);
    bottom.append(buyBtn);

    card.append(top, bottom);
    els.genCards.appendChild(card);
    return { g, card, icon, iconCount, manMark, name, milestone, bar, barFill, barPayout, buyBtn, l1, l2, status };
  });

  // Upgrades tab (Upgrades segment). Rows are created once, interleaved
  // in cost order (both data tables are cost-sorted), so the DOM stays
  // stable; only row state and x5 visibility change afterwards. The
  // second-round x5 rows (docs/LATE-GAME-DESIGN.md, section 4) are
  // hidden until available (minRegions reached and tier unlocked).
  const rowDefs = [
    ...UPGRADES.map((u) => ({ u, x5: false })),
    ...X5_UPGRADES.map((u) => ({ u, x5: true })),
  ].sort((a, b) => a.u.cost - b.u.cost);
  // Three groups (batch E): what each upgrade boosts.
  const upGroups = {};
  for (const [key, title] of [['all', 'Boost everything'], ['one', 'One machine'], ['cache', 'Prompt cache']]) {
    const grp = document.createElement('div');
    grp.className = 'up-group';
    const h = document.createElement('div');
    h.className = 'up-sec';
    h.textContent = title;
    grp.append(h);
    els.upGrid.append(grp);
    upGroups[key] = grp;
  }
  const groupOf = (u) => (u.kind === 'productionTier' ? 'one' : u.kind === 'cacheRate' ? 'cache' : 'all');
  const upRefs = rowDefs.map(({ u, x5 }) => {
    const row = document.createElement('div');
    row.className = 'up-row';
    if (u.kind === 'productionTier' && u.tier) {
      const ic = tierArt(u.tier, 40);
      ic.classList.add('up-ic');
      row.append(ic);
    }
    const left = document.createElement('div');
    left.className = 'up-left';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = u.name;
    const effect = document.createElement('span');
    effect.className = 'effect';
    effect.textContent = upgradeEffect(u);
    left.append(name, effect);
    const buyBtn = document.createElement('button');
    buyBtn.type = 'button';
    buyBtn.className = 'buy';
    const { l1, l2 } = makeLines(buyBtn);
    buyBtn.addEventListener('click', () => {
      const ok = x5 ? buyX5Upgrade(state, u.id) : buyUpgrade(state, u.id);
      if (ok) {
        flash(row);
        play('buy');
      }
      updateUpgrades(state);
    });
    row.append(left, buyBtn);
    if (x5) row.hidden = true;
    upGroups[groupOf(u)].appendChild(row);
    return { u, row, buyBtn, l1, l2, x5 };
  });
  // Far-off upgrades collapse into one line (batch E).
  const upMore = document.createElement('div');
  upMore.className = 'up-row summary';
  const upMoreLeft = document.createElement('div');
  upMoreLeft.className = 'up-left';
  const upMoreName = document.createElement('span');
  upMoreName.className = 'name';
  const upMoreText = document.createElement('span');
  upMoreText.className = 'effect';
  upMoreLeft.append(upMoreName, upMoreText);
  upMore.append(upMoreLeft);
  els.upGrid.append(upMore);
  // Global milestone line at the top of the Upgrades list (docs/
  // LATE-GAME-DESIGN.md, section 3): "All tiers at 250: x3 production.
  // Lowest now: Lunar Datacenter 212". Created once; only its text is
  // updated afterwards (stable DOM).
  const mileLine = document.createElement('div');
  mileLine.id = 'global-milestone';
  Object.assign(mileLine.style, {
    background: 'rgba(17, 24, 39, 0.80)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
    padding: '12px',
    marginBottom: '12px',
    fontSize: '12px',
    color: 'var(--dim)',
  });
  document.getElementById('tab-prestige').prepend(mileLine);

  const buyAllBtn = document.createElement('button');
  buyAllBtn.type = 'button';
  buyAllBtn.id = 'buy-all';
  buyAllBtn.textContent = 'Buy all';
  buyAllBtn.hidden = true;
  buyAllBtn.addEventListener('click', () => {
    const n = buyAllUpgrades(state);
    if (n > 0) {
      flash(els.upGrid);
      play('buy');
    }
    updateUpgrades(state);
  });
  document.getElementById('tab-upgrades').append(buyAllBtn);

  // Managers (Upgrades tab, Managers segment): one row per manager, tier order.
  const manRefs = MANAGERS.map((m) => {
    const g = GENERATORS.find((x) => x.id === m.id);
    const row = document.createElement('div');
    row.className = 'up-row';
    // managerIcon at 60 px on the left (docs/ART-PORTRAITS.md): the
    // portrait span has fixed width and height, so the row keeps a
    // steady height (no jump when the image loads) and the text stays
    // vertically centred against it.
    const manIcon = managerIcon(m.id, 60);
    manIcon.style.flexShrink = '0';
    const left = document.createElement('div');
    left.className = 'up-left';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = m.name;
    const effect = document.createElement('span');
    effect.className = 'effect';
    effect.textContent = `Runs ${g.name} by itself`;
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
  // Later and Region-gated managers collapse into one line each (batch E).
  function summaryRow(gated) {
    const row = document.createElement('div');
    row.className = `up-row summary${gated ? ' gated' : ''}`;
    const left = document.createElement('div');
    left.className = 'up-left';
    const name = document.createElement('span');
    name.className = 'name';
    const text = document.createElement('span');
    text.className = 'effect';
    left.append(name, text);
    row.append(left);
    els.manGrid.append(row);
    return { row, name, text };
  }
  const manLater = summaryRow(false);
  const manGated = summaryRow(true);
  const manNote = document.createElement('div');
  manNote.className = 'man-note';
  manNote.textContent = 'Managers reset when you Prestige. Standing Orders (a Weight upgrade) keeps Cron Job hired.';
  els.manGrid.append(manNote);

  // More tab (batch F): a grouped list. Achievements, Stats, Settings,
  // About and Support open as sub-screens with a back arrow; opening the
  // tab always lands on the list.
  const NATIVE = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function'
    && window.Capacitor.isNativePlatform());
  const moreMenu = document.getElementById('more-menu');
  const morePanels = {
    achievements: document.getElementById('more-achievements'),
    stats: document.getElementById('more-stats'),
    settings: document.getElementById('more-settings'),
  };
  const moreSubs = {
    achievements: document.getElementById('sub-achievements'),
    stats: document.getElementById('sub-stats'),
    settings: document.getElementById('sub-settings'),
    about: document.getElementById('sub-about'),
    support: document.getElementById('sub-support'),
  };
  // The Support row is the only place money is mentioned, and only in the
  // App Store build (docs/SUPPORT-DESIGN.md).
  document.getElementById('support-row').hidden = !NATIVE;
  // "N new" on Achievements: earned since the list was last opened.
  const ACH_SEEN_KEY = 'overclock.idle.achSeen';
  let achSeen = null;
  try {
    const v = Number(localStorage.getItem(ACH_SEEN_KEY));
    if (localStorage.getItem(ACH_SEEN_KEY) !== null && Number.isFinite(v)) achSeen = v;
  } catch (err) {
    // private mode: counted from now
  }
  if (achSeen === null) achSeen = (state.achievements || []).length;
  function markAchievementsSeen() {
    achSeen = (state.achievements || []).length;
    try {
      localStorage.setItem(ACH_SEEN_KEY, String(achSeen));
    } catch (err) {
      // private mode: the count just does not persist
    }
  }
  function setMoreSegment(seg) {
    moreMenu.hidden = seg !== 'menu';
    for (const [k, el] of Object.entries(moreSubs)) el.hidden = k !== seg;
    if (seg === 'achievements') markAchievementsSeen();
    const scroller = document.getElementById('tab-scroll');
    if (scroller) scroller.scrollTop = 0;
  }
  document.querySelectorAll('#more-menu .more-li[data-open]').forEach((b) => {
    b.addEventListener('click', () => setMoreSegment(b.dataset.open));
  });
  document.querySelectorAll('#tab-more .sub-back').forEach((b) => {
    b.addEventListener('click', () => setMoreSegment('menu'));
  });
  setMoreSegment('menu');

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
    effect.textContent = weightUpgradeEffect(u);
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

  // Reset confirm (docs/UX-OVERHAUL-PLAN.md, batch D): a bottom sheet that
  // says what you gain, lose and keep, with one primary button and "Not
  // yet". It replaces the old double-tap arming. Skipped when the
  // "Confirm before resets" setting is off.
  const sheetOv = document.createElement('div');
  sheetOv.className = 'reset-ov';
  sheetOv.hidden = true;
  const sheet = document.createElement('div');
  sheet.className = 'reset-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  const sheetGrab = document.createElement('div');
  sheetGrab.className = 'reset-grab';
  const sheetTitle = document.createElement('h3');
  const sheetList = document.createElement('ul');
  const sheetNote = document.createElement('div');
  sheetNote.className = 'reset-note';
  const sheetGo = document.createElement('button');
  sheetGo.type = 'button';
  sheetGo.className = 'reset-go';
  const sheetNo = document.createElement('button');
  sheetNo.type = 'button';
  sheetNo.className = 'reset-no';
  sheetNo.textContent = 'Not yet';
  sheet.append(sheetGrab, sheetTitle, sheetList, sheetNote, sheetGo, sheetNo);
  sheetOv.append(sheet);
  document.body.append(sheetOv);
  let sheetAction = null;
  function closeSheet() {
    sheetOv.hidden = true;
    sheetAction = null;
  }
  sheetNo.addEventListener('click', closeSheet);
  sheetOv.addEventListener('click', (e) => {
    if (e.target === sheetOv) closeSheet();
  });
  sheetGo.addEventListener('click', () => {
    const act = sheetAction;
    closeSheet();
    if (act) act();
  });
  function confirmReset(o, action) {
    if (!o.always && getSetting('confirmPrestige') === false) {
      action();
      return;
    }
    sheetTitle.textContent = o.title;
    sheetList.replaceChildren();
    for (const [cls, label, text] of [['gain', 'You gain', o.gain], ['lose', 'You lose', o.lose], ['keep', 'You keep', o.keep]]) {
      const li = document.createElement('li');
      li.className = cls;
      const b = document.createElement('b');
      b.textContent = label;
      const span = document.createElement('span');
      span.textContent = text;
      li.append(b, span);
      sheetList.append(li);
    }
    sheetNote.textContent = o.note;
    sheetGo.textContent = o.go;
    sheetGo.classList.toggle('danger', !!o.danger);
    sheetAction = action;
    sheetOv.hidden = false;
    sheetGo.focus();
  }

  // The new-run moment: a full-screen card after a reset, so the biggest
  // decision in the game ends on a reward, not a banner.
  const momentOv = document.createElement('div');
  momentOv.className = 'moment-ov';
  momentOv.hidden = true;
  const momentCard = document.createElement('div');
  momentCard.className = 'moment-card';
  momentCard.setAttribute('role', 'dialog');
  momentCard.setAttribute('aria-modal', 'true');
  const momentKicker = document.createElement('p');
  momentKicker.className = 'moment-kicker';
  const momentBig = document.createElement('div');
  momentBig.className = 'moment-big';
  const momentLabel = document.createElement('p');
  momentLabel.className = 'moment-label';
  const momentText = document.createElement('p');
  momentText.className = 'moment-text';
  const momentGo = document.createElement('button');
  momentGo.type = 'button';
  momentGo.className = 'moment-go';
  momentGo.textContent = 'Boot it';
  momentCard.append(momentKicker, momentBig, momentLabel, momentText, momentGo);
  momentOv.append(momentCard);
  document.body.append(momentOv);
  momentGo.addEventListener('click', () => {
    momentOv.hidden = true;
    const t = document.querySelector('#tabs [data-tab="game"]');
    if (t) t.click();
  });
  function showMoment(kicker, big, label, text) {
    momentKicker.textContent = kicker;
    momentBig.textContent = big;
    momentLabel.textContent = label;
    momentText.textContent = text;
    momentOv.hidden = false;
    momentGo.focus();
  }

  function perWeightNow() {
    const wu = WEIGHT_UPGRADES.find((u) => u.kind === 'weightBonus' && state.weightUpgrades.includes(u.id));
    return wu ? wu.value : WEIGHT_BONUS_PER_WEIGHT;
  }

  els.prestigeBtn.addEventListener('click', () => {
    const avail = weightsAvailable(state);
    if (avail < 1) return;
    let machines = 0;
    for (const g of GENERATORS) machines += state.generators[g.id] || 0;
    const ups = state.upgrades.length + (state.x5Upgrades || []).length;
    const s = avail === 1 ? '' : 's';
    confirmReset({
      title: 'Prestige now?',
      gain: `+${fmt(avail)} Weight${s}: all production +${Math.round(avail * perWeightNow() * 100)}%, forever`,
      lose: `${fmt(state.tokens)} tokens, ${fmt(machines)} machines, ${state.managers.length} managers, ${ups} upgrades`,
      keep: 'Weights, Weight upgrades, Regions, achievements',
      note: 'Your new run starts with one Raspberry Pi and the bonus above.',
      go: `Prestige for +${fmt(avail)} Weight${s}`,
    }, () => {
      const gained = prestige(state);
      if (gained <= 0) return;
      play('prestige');
      const bonus = Math.round(perWeightNow() * (state.weights || 0) * 100);
      showMoment(
        `GENERATION ${fmt((state.stats.prestiges || 0) + 1)}`,
        `+${fmt(gained)}`,
        `Weight${gained === 1 ? '' : 's'} earned`,
        `All production is now +${bonus}%. Your first Pi is already plugged in.`,
      );
    });
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

  // Expand (the second reset layer), through the same confirm sheet. The
  // sheet says in red that Weights reset.
  els.expandBtn.addEventListener('click', () => {
    if (regionsAvailable(state) < 1) return;
    const next = nextRegionName();
    const gate = TIER_GATES.find((t) => t.regions === (state.regionsEarned || 0) + 1);
    const opens = gate ? GENERATORS.find((x) => x.id === gate.id) : null;
    confirmReset({
      title: `Expand to ${next}?`,
      gain: `All production x2 for good, 1 Region credit${opens ? `, and ${opens.name}` : ''}`,
      lose: `All ${fmt(state.weights || 0)} Weights, your Weight upgrades and this run`,
      keep: 'Regions, Region credits and perks, achievements',
      note: 'Weights reset to zero. With the x2 they come back faster.',
      go: `Expand to ${next}`,
    }, () => {
      const gained = expandRegion(state);
      if (gained <= 0) return;
      play('prestige');
      // The Region changed: show the new scene (docs/ART-BACKGROUNDS.md).
      applyBackground(state);
      const g2 = TIER_GATES.find((t) => t.regions === (state.regionsEarned || 0));
      const opened = g2 ? GENERATORS.find((x) => x.id === g2.id) : null;
      showMoment(
        'NEW REGION',
        regionName(state),
        'All production x2',
        opened ? `${opened.name} is now available.` : 'Your server room has moved somewhere new.',
      );
    });
  });

  // Prestige tab (Weights | Regions segments), remembered across visits.
  // The Regions segment is always visible (a "Locked" tag while locked);
  // a dot marks it once, until it has been viewed (docs/REGIONS-DESIGN.md).
  const PSEG_KEY = 'overclock.idle.prestigeSegment';
  const psegBtns = Array.from(document.querySelectorAll('#prestige-seg button'));
  function setPrestigeSeg(seg, persist) {
    view.prestigeSeg = seg;
    psegBtns.forEach((b) => b.classList.toggle('active', b.dataset.seg === seg));
    // One ladder now (batch D): both layers always show; asking for the
    // Regions part scrolls to it.
    if (persist && seg === 'regions') {
      els.prestigeRegions.scrollIntoView({ block: 'start' });
    }
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
    managers: document.getElementById('tab-managers'),
    upgrades: document.getElementById('tab-upgrades'),
    prestige: document.getElementById('tab-prestige'),
    more: document.getElementById('tab-more'),
  };
  tabs.forEach((t) => {
    t.addEventListener('click', () => {
      const tab = t.dataset.tab;
      Object.entries(sections).forEach(([k, s]) => {
        s.hidden = k !== tab;
      });
      // The buy-amount row (header row 2) is Game-tab only.
      view.tab = tab;
      view.onServers = tab === 'game';
      view.goalAt = 0;
    view.goalTab = null;
      tabs.forEach((x) => {
        if (x === t) x.setAttribute('aria-current', 'page');
        else x.removeAttribute('aria-current');
      });
      if (tab === 'more') setMoreSegment('menu');
      // Opening Managers dismisses the manager hint (docs/ART-DESIGN.md §1).
      if (tab === 'managers') naturalDismiss('manager', state);
    });
  });

  // The pill opens Progress.
  els.weightsChip.addEventListener('click', () => {
    const t = document.querySelector('#tabs [data-tab="prestige"]');
    if (t) t.click();
  });

  // Goal strip tap: open the tab that holds the goal.
  els.goalStrip.addEventListener('click', () => {
    const g = view.goal;
    if (!g || g.tab === 'game') return;
    const t = document.querySelector(`#tabs [data-tab="${g.tab}"]`);
    if (t) t.click();
    if (g.seg) {
      const sb = document.querySelector(`#prestige-seg [data-seg="${g.seg}"]`);
      if (sb) sb.click();
    }
  });

  // Help cards (docs/UX-PLAN.md, principle 2): every panel head has a "?"
  // that opens one short card. One overlay, built once.
  const HELP = {
    servers: ['Servers', 'Each machine runs a cycle and pays tokens when the bar fills.\nTap a machine to run it yourself, or hire its manager so it runs by itself.\nBuy more of a machine to earn more per cycle. At 25, 50, 100, 200 and 400 owned it runs twice as fast; at 300, 500, 750 and 1,000 it pays more.\nThe Next button buys exactly enough to reach the next boost.'],
    managers: ['Managers', 'One manager per machine. A hired manager runs that machine forever, even while the game is closed.\nYou need to own the machine first.\nManagers reset when you prestige.'],
    upgrades: ['Upgrades', 'One-time boosts paid with tokens. Some boost one machine, some boost everything.\nThey reset when you prestige, so you buy them again each run.\nBuy all buys every one you can afford, cheapest first.'],
    prestige: ['Progress', 'Two resets, top to bottom.\nPrestige: when your lifetime tokens are high enough, start a new generation and earn Weights. Each Weight adds +10% to all production, forever. Spend Weights on Weight upgrades.\nRegions: once you have earned 2,000 Weights in total, expand. Weights reset, but all production doubles for good and bigger machines open. Each Region also gives a credit for a Region perk.'],
    regions: ['Regions', 'Regions are the bigger reset above Prestige.\nThey unlock once you have earned 2,000 Weights in total.\nExpanding resets Weights too, but doubles all production for good, moves your server room somewhere new and unlocks bigger machines.'],
    more: ['More', 'Achievements each add +1% production.\nStats show your totals for this run and all time.\nSettings has sound, haptics, backups and "Show tips again".'],
  };
  const helpOverlay = document.createElement('div');
  helpOverlay.className = 'help-overlay';
  helpOverlay.hidden = true;
  const helpCard = document.createElement('div');
  helpCard.className = 'help-card';
  helpCard.setAttribute('role', 'dialog');
  helpCard.setAttribute('aria-modal', 'true');
  const helpTitle = document.createElement('h3');
  const helpText = document.createElement('p');
  const helpClose = document.createElement('button');
  helpClose.type = 'button';
  helpClose.textContent = 'Got it';
  helpCard.append(helpTitle, helpText, helpClose);
  helpOverlay.append(helpCard);
  document.body.append(helpOverlay);
  let helpQueue = [];
  function showHelp(key) {
    const h = HELP[key];
    if (!h) return;
    helpTitle.textContent = h[0];
    helpText.textContent = h[1];
    helpClose.textContent = helpQueue.length > 0 ? 'Next' : 'Got it';
    helpOverlay.hidden = false;
    helpClose.focus();
  }
  function closeHelp() {
    if (helpQueue.length > 0) {
      showHelp(helpQueue.shift());
      return;
    }
    helpOverlay.hidden = true;
  }
  document.getElementById('howto-btn').addEventListener('click', () => {
    helpQueue = ['managers', 'upgrades', 'prestige', 'regions', 'more'];
    showHelp('servers');
  });
  helpClose.addEventListener('click', closeHelp);
  helpOverlay.addEventListener('click', (e) => {
    if (e.target === helpOverlay) {
      helpQueue = [];
      closeHelp();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !helpOverlay.hidden) {
      helpQueue = [];
      closeHelp();
    }
  });
  document.querySelectorAll('.help-btn').forEach((b) => {
    b.addEventListener('click', () => {
      helpQueue = [];
      showHelp(b.dataset.help);
    });
  });

  // Settings > Save (batch F): save codes sit behind rows, not in
  // always-visible text boxes.
  document.getElementById('export-btn').addEventListener('click', () => {
    const code = io.exportSave(state, Date.now());
    els.exportArea.value = code;
    els.exportArea.hidden = false;
    els.exportArea.select();
    let copied = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(() => showBanner('Save code copied.', 'Copied'), () => {});
        copied = true;
      }
    } catch (err) {
      copied = false;
    }
    if (!copied) showBanner('Save code shown below. Copy it somewhere safe.', 'Save code');
  });
  document.getElementById('import-open').addEventListener('click', () => {
    const box = document.getElementById('import-box');
    box.hidden = !box.hidden;
    if (!box.hidden) els.importArea.focus();
  });
  document.getElementById('import-btn').addEventListener('click', () => {
    const imported = io.importSave(els.importArea.value.trim());
    if (imported === null) {
      showBanner('That save code did not work. Check it was copied whole.', 'Import error');
      return;
    }
    io.replaceState(imported);
    showBanner('Save imported.', 'Imported');
  });
  els.resetBtn.addEventListener('click', () => {
    confirmReset({
      always: true,
      danger: true,
      title: 'Delete all progress?',
      gain: 'A fresh start from one Raspberry Pi',
      lose: 'Everything: tokens, machines, Weights, Regions, perks and achievements',
      keep: 'Your settings',
      note: 'This cannot be undone. Copy a save code first if you might want it back.',
      go: 'Continue',
    }, () => {
      confirmReset({
        always: true,
        danger: true,
        title: 'Are you sure?',
        gain: 'Nothing',
        lose: 'All progress on this device, for good',
        keep: 'Your settings',
        note: 'Last step. There is no undo.',
        go: 'Delete everything',
      }, () => {
        io.hardReset();
        io.replaceState(ensureStarter(createState()));
        showBanner('All progress deleted. Fresh start.', 'Reset');
      });
    });
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

    const feel = document.getElementById('set-feel');
    const play = document.getElementById('set-play');
    const saveGroup = document.getElementById('set-save');
    feel.appendChild(makeToggleRow('Sound', 'sound'));
    // Haptics only exist in the App Store build.
    if (NATIVE) feel.appendChild(makeToggleRow('Haptics', 'haptics'));
    feel.appendChild(makeChoiceRow('Reduce motion', 'reduceMotion', [
      { value: 'auto', label: 'Auto' },
      { value: 'on', label: 'On' },
      { value: 'off', label: 'Off' },
    ]));
    feel.appendChild(makeChoiceRow('Numbers', 'numberFormat', [
      { value: 'short', label: 'Short' },
      { value: 'sci', label: 'Sci' },
    ]));
    play.appendChild(makeToggleRow('Confirm before resets', 'confirmPrestige'));
    autoProcureRow = makeToggleRow('Auto-Procure', 'autoProcure', 'Buy All runs by itself every 10 s');
    autoProcureRow.hidden = true;
    play.appendChild(autoProcureRow);

    // "Show tips again" (docs/ART-DESIGN.md §1): clears hints.seen so the
    // first-run hints show again.
    const tipsRow = document.createElement('div');
    tipsRow.className = 'set-row';
    const tipsLab = document.createElement('span');
    tipsLab.className = 'set-label';
    tipsLab.textContent = 'Show tips again';
    const tipsBtn = document.createElement('button');
    tipsBtn.type = 'button';
    tipsBtn.textContent = 'Show';
    tipsBtn.addEventListener('click', () => {
      showHintsAgain(state);
      showBanner('Tips will show again.', 'Tips');
    });
    tipsRow.append(tipsLab, tipsBtn);
    play.appendChild(tipsRow);

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
    // Backups: the first rows of the Save group.
    const bkFirst = saveGroup.firstChild;
    for (const b of io.listBackups()) {
      const row = document.createElement('div');
      row.className = 'set-row';
      const lab = document.createElement('span');
      lab.className = 'set-label';
      if (b === null) {
        lab.textContent = 'Backup: empty';
        row.append(lab);
      } else {
        lab.textContent = `Backup: ${fmtBackupTime(b.savedAt)} · ${fmt(b.lifetime)} tokens`;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = 'Restore';
        btn.addEventListener('click', () => confirmRestore(fmtClock(b.savedAt), () => doRestore(b.slot)));
        row.append(lab, btn);
      }
      saveGroup.insertBefore(row, bkFirst);
    }

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
    document.getElementById('more-about').appendChild(about);
    document.getElementById('more-about-sub').textContent = `Version ${versionStamp()} · free and open source`;
  }

  // Mount the More tab sub-screens once at start.
  buildSettings();
  mountAchievements(document.getElementById('more-achievements'), () => state);
  mountStats(document.getElementById('more-stats'), () => state);

  // Timed events (docs/TIERS-EVENTS.md): banner above the generator cards,
  // chip in the header (appended last, under the Weights chip).
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

  // "+N" floats up from the bar when a cycle pays (batch E). Skipped for
  // fast rows (many payouts a second) and with reduced motion.
  const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function floatPayout(r, g) {
    if (reduceMotion || cycleTime(state, g) < 0.5) return;
    const f = document.createElement('span');
    f.className = 'payout-float';
    f.textContent = `+${fmt(cyclePayout(state, g))}`;
    r.bar.parentElement.append(f);
    setTimeout(() => f.remove(), 950);
  }

  function updateGenCards() {
    let nextUnowned = null;
    // Only the next locked tier is shown (docs/LATE-GAME-DESIGN.md,
    // section 1), so the list doesn't fill with locked rows.
    let nextLocked = null;
    for (const r of genRefs) {
      if ((state.generators[r.g.id] || 0) === 0 && nextUnowned === null) {
        nextUnowned = r.g.id;
      }
      if (!isTierUnlocked(state, r.g.id) && showLockedTier(state, r.g.id) && nextLocked === null) {
        nextLocked = r.g.id;
      }
    }
    for (const r of genRefs) {
      const g = r.g;
      const owned = state.generators[g.id] || 0;
      const visible = owned > 0 || g.id === nextUnowned || g.id === nextLocked;
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
        floatPayout(r, g);
      }
      prevCycles[g.id] = progress;
      const ct = cycleTime(state, g);
      const continuous = ct < CONTINUOUS_CYCLE_MAX;
      const running = progress !== null && progress !== undefined;

      r.iconCount.textContent = fmt(owned);

      // The row's milestone text shows whichever reward is next
      // (docs/LATE-GAME-DESIGN.md, section 3): "x2 speed at 25",
      // "x2 payout at 300", ...
      const m = nextMilestone(state, g.id);
      r.milestone.textContent = m === null
        ? 'All milestones reached'
        : `${fmt(owned)} / ${fmt(m.owned)} · next: x${m.value} ${m.kind}`;

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
      let disabled;
      // Locked tier (docs/LATE-GAME-DESIGN.md, section 1): the dimmed
      // icon and the gate text instead of a Buy button. The button
      // stays in the DOM (stable) and is disabled.
      const gateLocked = isLocked && !isTierUnlocked(state, g.id);
      if (gateLocked) {
        const gate = TIER_GATES.find((t) => t.id === g.id);
        const n = gate.regions;
        setLines(
          r,
          `Unlocks at ${regionName({ ...state, regionsEarned: n })} (${n} Region${n === 1 ? '' : 's'})`,
          null,
        );
        disabled = true;
      } else if (isLocked) {
        const c = cost(state, g.id, 1);
        disabled = c > state.tokens;
        setLines(r, 'Unlock', fmtCost(c));
      } else if (view.buyMode === 'max') {
        const m = maxBuyable(state, g.id);
        const c = m.count > 0 ? m.total : cost(state, g.id, 1);
        disabled = m.count === 0;
        setLines(r, `Buy ${fmt(m.count > 0 ? m.count : 1)}`, fmtCost(c));
      } else if (view.buyMode === 'next') {
        const n = nextAffordable(state, g.id);
        const c = cost(state, g.id, n);
        disabled = c > state.tokens;
        const nm = nextMilestone(state, g.id);
        const reward = nm !== null && owned + n === nm.owned ? ` · x${nm.value} ${nm.kind}` : '';
        setLines(r, `Buy ${fmt(n)} → ${fmt(owned + n)}${reward}`, fmtCost(c));
      } else {
        const n = Number(view.buyMode);
        const c = cost(state, g.id, n);
        disabled = c > state.tokens;
        setLines(r, `Buy ${n}`, fmtCost(c));
      }
      r.buyBtn.disabled = disabled;
      r.buyBtn.classList.toggle('afford', !disabled);
      r.buyBtn.classList.toggle('lock', gateLocked);

      // Status word (batch C): TAP TO BOOT on a brand-new Pi, TAP TO RUN on
      // an idle row, a countdown while running, Auto with a manager. The
      // never-tapped Pi pulses until the first tap.
      const firstBoot = g.id === 'pi' && (state.stats.taps || 0) === 0 && !managed;
      let statusText = '';
      let idle = false;
      const mgr = managed ? MANAGERS.find((x) => x.id === g.id) : null;
      if (isLocked) statusText = '';
      else if (managed) statusText = mgr ? `Auto · ${mgr.name}` : 'Auto';
      else if (running && !continuous) statusText = fmtCountdown(ct - progress);
      else {
        statusText = firstBoot ? 'TAP TO BOOT' : 'TAP TO RUN';
        idle = true;
      }
      r.status.textContent = statusText;
      r.status.hidden = statusText === '';
      r.status.classList.toggle('idle', idle);
      r.status.classList.toggle('auto', managed && !isLocked);
      r.icon.classList.toggle('pulse', firstBoot && !running);
    }
  }

  // Under the last row (docs/UX-PLAN.md, section 3.5): how many tiers are
  // still to come, without naming them.
  function updateTierFooter() {
    let shown = 0;
    let gated = false;
    for (const r of genRefs) {
      if (r.card.hidden) continue;
      shown++;
      if (!isTierUnlocked(state, r.g.id)) gated = true;
    }
    const allOwned = genRefs.every((r) => (state.generators[r.g.id] || 0) > 0);
    const more = GENERATORS.length - shown;
    let text = '';
    if (allOwned) text = `All ${GENERATORS.length} tiers online`;
    else if (more > 0 && gated) text = `${more} more tier${more === 1 ? '' : 's'} · unlocked by Regions`;
    else if (more > 0) text = `${more} more tier${more === 1 ? '' : 's'} to discover`;
    els.tierFooter.textContent = text;
    els.tierFooter.hidden = text === '';
  }

  // The goal line (docs/UX-OVERHAUL-PLAN.md, batch B). On Servers it
  // names the next goal (recomputed at most twice a second, since
  // nextGoal tries every candidate buy); on the other tabs it says what
  // the tab is for. The "?" beside it opens that screen's help card.
  const TAB_PURPOSE = {
    managers: ['Managers', ' run a machine for you, even offline'],
    upgrades: ['Upgrades', ': one-time boosts. They reset on Prestige.'],
    prestige: ['Progress', ': the two resets and what each keeps'],
    more: ['More', ': achievements, stats and settings'],
  };
  function setGoalLabel(before, bold, after) {
    const b = document.createElement('b');
    b.textContent = bold;
    els.goalLabel.replaceChildren(before, b, after);
  }
  function updateGoal() {
    const tab = view.tab || 'game';
    const help = tab === 'game' ? 'servers' : tab;
    els.goalHelp.dataset.help = help;
    if (tab !== 'game') {
      if (view.goalTab === tab) return;
      view.goalTab = tab;
      view.goal = null;
      const [bold, rest] = TAB_PURPOSE[tab] || [tab, ''];
      setGoalLabel('', bold, rest);
      els.goalNum.textContent = '';
      els.goalNum.classList.remove('ready');
      els.goalFill.style.width = '0%';
      return;
    }
    if (view.goalTab === 'game' && view.lastNow - view.goalAt < 500) return;
    view.goalTab = 'game';
    view.goalAt = view.lastNow;
    const g = nextGoal(state);
    view.goal = g;
    if (g === null) {
      setGoalLabel('Next: ', 'claim the event below', '');
      els.goalNum.textContent = '';
      els.goalNum.classList.remove('ready');
      els.goalFill.style.width = '0%';
      return;
    }
    setGoalLabel('Next: ', g.text, '');
    const frac = g.need > 0 ? Math.min(1, Math.max(0, g.have / g.need)) : 1;
    const ready = frac >= 1 && !g.note;
    if (g.note) els.goalNum.textContent = g.note;
    else els.goalNum.textContent = ready ? 'Ready ›' : `${fmt(Math.floor(g.have))} / ${fmtCost(g.need)}`;
    els.goalNum.classList.toggle('ready', ready);
    els.goalFill.style.width = `${Math.round(frac * 100)}%`;
  }

  function updateManagers() {
    // Full rows for hired, hireable and the next two machines to come;
    // the rest collapse into one line, the Region-gated ones into another.
    let upcoming = 0;
    const later = [];
    const gated = [];
    for (const r of manRefs) {
      const ownedTier = (state.generators[r.m.id] || 0) > 0;
      let show = true;
      if (!hasManager(state, r.m.id) && !ownedTier) {
        if (!isTierUnlocked(state, r.m.id)) {
          gated.push(r);
          show = false;
        } else if (upcoming < 2) {
          upcoming++;
        } else {
          later.push(r);
          show = false;
        }
      }
      r.row.hidden = !show;
    }
    manLater.row.hidden = later.length === 0;
    if (later.length > 0) {
      manLater.name.textContent = later.map((r) => r.m.name).join(', ');
      const lo = later[0].m.cost;
      const hi = later[later.length - 1].m.cost;
      manLater.text.textContent = `Hire once you own their machine · ${fmtCost(lo)}${hi !== lo ? ` to ${fmtCost(hi)}` : ''}`;
    }
    manGated.row.hidden = gated.length === 0;
    if (gated.length > 0) {
      manGated.name.textContent = gated.map((r) => r.m.name).join(', ');
      const ns = gated.map((r) => TIER_GATES.find((t) => t.id === r.m.id).regions);
      const list = ns.length > 1 ? `${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}` : String(ns[0]);
      manGated.text.textContent = `Unlock with Region${ns.length === 1 ? '' : 's'} ${list}`;
    }
    for (const r of manRefs) {
      const hired = hasManager(state, r.m.id);
      const owned = state.generators[r.m.id] || 0;
      if (hired) {
        // Hired rows stay full-strength (name, description, portrait); the
        // button area shows a solid green "Hired" pill, not a dimmed
        // button (docs/ART-BACKGROUNDS.md).
        setLines(r, '✓ Hired', null);
        r.buyBtn.disabled = true;
        r.buyBtn.classList.remove('afford');
        r.buyBtn.classList.add('done');
      } else {
        r.buyBtn.classList.remove('done');
        if (owned === 0) {
          // Two words (batch E): "Needs 1" over the machine's name.
          setLines(r, 'Needs 1', r.g.name);
          r.buyBtn.disabled = true;
          r.buyBtn.classList.remove('afford');
        } else {
          const afford = r.m.cost <= state.tokens;
          setLines(r, 'Hire', fmtCost(r.m.cost));
          r.buyBtn.disabled = !afford;
          r.buyBtn.classList.toggle('afford', afford);
        }
      }
    }
  }

  // A second-round x5 upgrade is available once minRegions Regions are
  // earned and its tier is unlocked (docs/LATE-GAME-DESIGN.md, section 4).
  function x5Available(u) {
    return (state.regionsEarned || 0) >= u.minRegions && isTierUnlocked(state, u.tier);
  }
  // The row's upgrade is a buy candidate: not owned, available (for x5
  // rows) and affordable.
  function upgradeCandidate(r) {
    const owned = r.x5 ? state.x5Upgrades.includes(r.u.id) : state.upgrades.includes(r.u.id);
    if (owned) return false;
    if (r.x5 && !x5Available(r.u)) return false;
    return r.u.cost <= state.tokens;
  }
  // Upgrades list footer (docs/UX-PLAN.md, 3.1): the x5 rows not yet
  // available are one dim line instead of hidden, and a card says when
  // everything on the list is owned.
  const upLocked = document.createElement('div');
  upLocked.className = 'up-note up-locked';
  const upDone = document.createElement('div');
  upDone.className = 'up-note';
  upDone.textContent = 'Everything bought for this run. More unlock after your next prestige.';
  els.upGrid.append(upLocked, upDone);

  function updateUpgrades() {
    // Which rows show: owned ones, affordable ones and the next two you
    // cannot afford yet; the rest collapse into one line.
    const open = upRefs
      .filter((r) => (!r.x5 || x5Available(r.u)) && !(r.x5 ? state.x5Upgrades : state.upgrades).includes(r.u.id))
      .sort((a, b) => a.u.cost - b.u.cost);
    const shown = new Set();
    let ahead = 0;
    for (const r of open) {
      if (r.u.cost <= state.tokens) shown.add(r);
      else if (ahead < 2) {
        shown.add(r);
        ahead++;
      }
    }
    const far = open.filter((r) => !shown.has(r));
    for (const r of upRefs) {
      const avail = !r.x5 || x5Available(r.u);
      const owned = (r.x5 ? state.x5Upgrades : state.upgrades).includes(r.u.id);
      r.row.hidden = !avail || (!owned && !shown.has(r));
      r.row.classList.toggle('owned', owned);
      r.row.classList.toggle('dim', !owned);
      if (owned) {
        // Owned rows stay solid with a green "Owned" pill (docs/
        // ART-BACKGROUNDS.md); only not-owned rows dim their text.
        setLines(r, '✓ Owned', null);
        r.buyBtn.disabled = true;
        r.buyBtn.classList.remove('afford');
        r.buyBtn.classList.add('done');
      } else {
        r.buyBtn.classList.remove('done');
        const c = r.u.cost;
        const afford = c <= state.tokens;
        setLines(r, 'Buy', fmtCost(c));
        r.buyBtn.disabled = !afford;
        r.buyBtn.classList.toggle('afford', afford);
      }
    }
    for (const g of Object.values(upGroups)) {
      g.hidden = ![...g.querySelectorAll('.up-row')].some((x) => !x.hidden);
    }
    upMore.hidden = far.length === 0;
    if (far.length > 0) {
      upMoreName.textContent = `${far.length} more upgrade${far.length === 1 ? '' : 's'}`;
      const first = far[0].u;
      const last = far[far.length - 1].u;
      upMoreText.textContent = far.length === 1
        ? `${first.name} at ${fmtCost(first.cost)}`
        : `${first.name} at ${fmtCost(first.cost)}, up to ${last.name} at ${fmtCost(last.cost)}`;
    }
    // Buy all: how many are ready and what they cost together, cheapest
    // first (the order buyAllUpgrades buys in).
    let ready = 0;
    let total = 0;
    for (const r of open) {
      if (total + r.u.cost > state.tokens) break;
      total += r.u.cost;
      ready++;
    }
    const affordable = upRefs.some(upgradeCandidate);
    buyAllBtn.disabled = !affordable;
    buyAllBtn.hidden = ready === 0;
    buyAllBtn.textContent = `Buy all ${ready} ready · ${fmtCost(total)}`;
    const lockedX5 = upRefs.filter((r) => r.x5 && !x5Available(r.u));
    const byRegion = lockedX5.filter((r) => (state.regionsEarned || 0) < r.u.minRegions);
    if (byRegion.length > 0) {
      const n = byRegion[0].u.minRegions;
      upLocked.textContent = `${lockedX5.length} more upgrades unlock at ${n} Region${n === 1 ? '' : 's'}`;
    } else if (lockedX5.length > 0) {
      upLocked.textContent = `${lockedX5.length} more upgrade${lockedX5.length === 1 ? '' : 's'} unlock with their tiers`;
    }
    upLocked.hidden = lockedX5.length === 0;
    const visible = upRefs.filter((r) => !r.x5 || x5Available(r.u));
    upDone.hidden = !visible.every((r) => (r.x5 ? state.x5Upgrades : state.upgrades).includes(r.u.id));
  }

  // The global milestone line (docs/LATE-GAME-DESIGN.md, section 3): the
  // next threshold not yet met by every unlocked tier, plus the unlocked
  // tier with the fewest owned.
  function updateGlobalMilestone() {
    mileLine.hidden = !GENERATORS.some((g) => (state.generators[g.id] || 0) >= 100);
    if (mileLine.hidden) return;
    const m = globalMilestone(state);
    const tier = m.lowestTier ? GENERATORS.find((g) => g.id === m.lowestTier) : null;
    const lowest = tier ? `${tier.name} ${fmtExact(m.lowestCount)}` : '';
    if (m.next === null) {
      const last = GLOBAL_MILESTONES[GLOBAL_MILESTONES.length - 1];
      mileLine.textContent = `All tiers at ${last.owned}: x${last.value} production reached. Lowest now: ${lowest}`;
    } else {
      mileLine.textContent = `All tiers at ${m.next.owned}: x${m.next.value} production. Lowest now: ${lowest}`;
    }
  }

  function updateWeightUpgrades() {
    for (const r of wuRefs) {
      const owned = state.weightUpgrades.includes(r.u.id);
      if (owned) {
        setLines(r, '✓ Owned', null);
        r.buyBtn.disabled = true;
        r.buyBtn.classList.add('done');
      } else {
        r.buyBtn.classList.remove('done');
        setLines(r, 'Buy', `${r.u.cost} Weight${r.u.cost === 1 ? '' : 's'}`);
        r.buyBtn.disabled = state.weights < r.u.cost;
      }
    }
  }

  function updatePrestige() {
    const avail = weightsAvailable(state);
    els.wAvail.textContent = fmt(avail);
    // Weights follow sqrt(total lifetime / PRESTIGE_DIVISOR) (core.js
    // weightsAvailable), so the next one lands at DIVISOR * k^2.
    const total = Math.max(0, state.totalLifetime || 0);
    const k = Math.floor(Math.sqrt(total / PRESTIGE_DIVISOR)) + 1;
    const need = PRESTIGE_DIVISOR * k * k;
    const frac = Math.min(1, total / need);
    els.prestigeHintFill.style.width = `${Math.round(frac * 100)}%`;
    els.prestigeHintText.textContent = `Next Weight at ${fmt(need)} lifetime tokens (${fmt(total)} so far, ${Math.round(frac * 100)}%)`;
    const weights = state.weights || 0;
    const bonus = Math.round(perWeightNow() * weights * 100);
    els.prestigeHintBonus.textContent = `Current bonus +${bonus}% from ${fmt(weights)} Weight${weights === 1 ? '' : 's'}`;
    els.layerPNow.textContent = `+${bonus}% now`;
    els.prestigeBtn.disabled = avail < 1;
    els.prestigeBtn.textContent = avail >= 1
      ? `Prestige for +${fmt(avail)} Weight${avail === 1 ? '' : 's'}`
      : 'Prestige · earn your first Weight';
  }

  // The Region an Expand would open next ("Iowa", "Oregon", ...).
  function nextRegionName() {
    return regionName({ ...state, regionsEarned: (state.regionsEarned || 0) + 1 });
  }

  function updateRegions() {
    const earned = state.regionsEarned || 0;
    els.expandBtn.textContent = `EXPAND TO ${nextRegionName().toUpperCase()}`;
    // One Region at a time (docs/LATE-GAME-DESIGN.md, section 2): the bar
    // fills as the Weights earned since the last expansion approach
    // regionTarget.
    const target = regionTarget(state);
    const progress = state.weightsSinceExpand || 0;
    const avail = regionsAvailable(state);
    let pct;
    let text;
    if (avail >= 1) {
      pct = 100;
      text = 'Ready: expand to your next Region below';
    } else {
      pct = Math.min(100, Math.round((progress / target) * 100));
      text = `Next Region: earn ${fmtExact(target)} Weights by prestiging (${fmtExact(progress)} so far, ${pct}%)`;
    }
    els.regionHintFill.style.width = `${pct}%`;
    els.regionHintText.textContent = text;
    els.regionHintNote.hidden = avail >= 1;
    els.regionMult.textContent = `Current multiplier x${fmt(Math.pow(2, earned))} (${earned} Region${earned === 1 ? '' : 's'}, each doubles production)`;
    els.expandBtn.disabled = avail < 1;
    for (const r of perkRefs) {
      const owned = (state.regionPerks || []).includes(r.p.id);
      if (owned) {
        setLines(r, '✓ Owned', null);
        r.buyBtn.disabled = true;
        r.buyBtn.classList.add('done');
      } else {
        r.buyBtn.classList.remove('done');
        const c = `${r.p.cost} credit${r.p.cost === 1 ? '' : 's'}`;
        if (!regionsUnlocked(state)) {
          setLines(r, 'Locked', c);
          r.buyBtn.disabled = true;
        } else {
          setLines(r, 'Buy', c);
          r.buyBtn.disabled = (state.regions || 0) < r.p.cost;
        }
      }
    }
  }

  function updatePrestigeSeg() {
    const unlocked = regionsUnlocked(state);
    // The Regions segment is always visible: while locked it carries a
    // "Locked" tag and the view renders a locked panel with the unlock
    // threshold and progress (nothing important is hidden: show it and
    // say how to unlock it).
    els.regionsSegLock.hidden = unlocked;
    // The dot marks the Regions segment once, until it has been viewed.
    els.regionDot.hidden = !unlocked || view.regionDotSeen;
    els.regionLocked.hidden = unlocked;
    els.regionHead.hidden = !unlocked;
    els.regionExpand.hidden = !unlocked;
    els.regionPerksGrid.hidden = false;
    els.layerRegions.classList.toggle('locked', !unlocked);
    els.layerRState.textContent = !unlocked
      ? 'Locked'
      : regionsAvailable(state) >= 1 ? 'Ready' : `x${fmt(Math.pow(2, state.regionsEarned || 0))} now`;
    const credits = state.regions || 0;
    els.layerPerks.classList.toggle('locked', (state.regionsEarned || 0) === 0 && credits === 0);
    els.perkCredits.textContent = `${fmt(credits)} credit${credits === 1 ? '' : 's'}`;
    if (!unlocked) {
      els.regionLockedText.textContent = regionsLockedText(state);
      els.regionLockedFill.style.width = `${Math.round(regionsUnlockProgress(state) * 100)}%`;
    }
    // Always-visible pointer on the Weights view, so the feature is
    // discoverable from where players already are.
    els.regionsHintLine.textContent = regionsHintLine(state);
    els.regionsHintLine.hidden = true;
    updateRegions();
  }

  function updateTabDots() {
    const upAffordable = upRefs.some(upgradeCandidate);
    const manAffordable = manRefs.some(
      (r) => !hasManager(state, r.m.id)
        && (state.generators[r.m.id] || 0) > 0
        && r.m.cost <= state.tokens,
    );
    els.upDot.hidden = !upAffordable;
    els.manDot.hidden = !manAffordable;
    els.prestigeDot.hidden = weightsAvailable(state) < 1;
    // More: a dot and "N new" while achievements wait unseen.
    const earned = (state.achievements || []).length;
    const fresh = Math.max(0, earned - achSeen);
    els.moreDot.hidden = fresh === 0;
    document.getElementById('more-ach-sub').textContent = `${earned} of ${ACHIEVEMENTS.length} · +${earned}% production`;
    document.getElementById('more-ach-new').textContent = fresh > 0 ? `${fresh} new` : '';
  }

  // A segmented control must never show a single segment: with fewer
  // than two visible segments it would read as one giant button, so
  // hide the whole control.
  function syncSegVisibility(container, btns) {
    let visible = 0;
    for (const b of btns) if (!b.hidden) visible++;
    container.hidden = visible < 2;
  }
  function updateSegmentedControls() {
  }



  function update() {
    view.lastNow = Date.now();
    // Whole tokens under 1,000 ("94 tokens", not "94.8"); fmt's K/M/B above.
    const tokenText = fmt(state.tokens < 1000 ? Math.floor(state.tokens) : state.tokens);
    els.tokens.textContent = tokenText;
    // Step the font down once the text is 8+ chars so long values
    // ("1.23e15", "999.9T") stay on one line at 360 px.
    els.tokens.classList.toggle('long', tokenText.length >= 8);
    // The rate line says what is really happening (docs/UX-OVERHAUL-PLAN.md,
    // batch C): nothing running, or how many machines run before the first
    // manager, then the rate.
    let running = 0;
    for (const g of GENERATORS) {
      if ((state.generators[g.id] || 0) === 0) continue;
      if (hasManager(state, g.id) || (state.cycles[g.id] !== null && state.cycles[g.id] !== undefined)) running++;
    }
    if (running === 0) {
      els.tps.textContent = '0';
      els.rateUnit.textContent = (state.stats.taps || 0) === 0 ? ' per sec · nothing running yet' : ' per sec · tap a machine to run it';
    } else if ((state.managers || []).length === 0) {
      els.tps.textContent = `${running} machine${running === 1 ? '' : 's'}`;
      els.rateUnit.textContent = ' running';
    } else {
      els.tps.textContent = fmt(tokensPerSecond(state));
      els.rateUnit.textContent = ' per sec';
    }

    const earnedRegions = state.regionsEarned || 0;
    const hasWeights = state.weights > 0 || (state.weightsEarnedThisCycle || 0) > 0;
    const pillOn = hasWeights || earnedRegions >= 1;
    els.weightsChip.hidden = !pillOn || !!state.eventActive;
    if (pillOn) {
      const wu = WEIGHT_UPGRADES.find((u) => u.kind === 'weightBonus' && state.weightUpgrades.includes(u.id));
      const perWeight = wu ? wu.value : WEIGHT_BONUS_PER_WEIGHT;
      const bonus = Math.round(perWeight * (state.weights || 0) * 100);
      els.weightsChip.textContent = earnedRegions >= 1
        ? `◆ +${bonus}% · x${fmt(Math.pow(2, earnedRegions))} ${regionName(state)}`
        : `◆ Weights +${bonus}%`;
    }

    // Region name on the rate line ("1.6K per sec · Oregon"), once any
    // Region is earned.
    // The Region name now lives in the pill, not on the rate line.
    els.regionName.hidden = true;

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
    // The buy-amount row shows once there is a choice to make: 2 machines.
    let ownedTotal = 0;
    for (const g of GENERATORS) ownedTotal += state.generators[g.id] || 0;
    els.buyRow.hidden = ownedTotal < 2;
    updateTierFooter();
    updateGoal();
    updateUpgrades();
    updateGlobalMilestone();
    updateManagers();
    updatePrestige();
    updatePrestigeSeg();
    updateTabDots();
    updateSegmentedControls();
    updateWeightUpgrades();
  }

  // First-run hints (docs/ART-DESIGN.md §1): mount the callout.
  mountHint(state);

  // An achievement earned during a new save's quiet first minutes: a dot
  // on More instead of a toast.
  function noteNewAchievement() {
    els.moreDot.hidden = false;
  }

  return { update, showBanner, noteNewAchievement };
}
