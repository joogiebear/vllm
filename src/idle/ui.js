// Render the idle state to the DOM and turn clicks into core calls.
// This module never reads the clock: app.js passes `now` into update().
// Rows and cards are built once; update() only changes text, classes and
// visibility, so the DOM is not rebuilt on every frame.
import {
  click, buy, buyUpgrade, buyWeightUpgrade, buyAllUpgrades, setOverclock, prestige,
  tokensPerSecond, cost, weightsAvailable, createState,
} from './core.js';
import {
  GENERATORS, UPGRADES, WEIGHT_UPGRADES, DOUBLING_THRESHOLDS,
  PRESTIGE_DIVISOR,
  WEIGHT_BONUS_PER_WEIGHT, COST_GROWTH,
} from './data.js';

// --- number formatting ----------------------------------------------------
// Principle 4: at most 3 significant figures, no commas, integers below 1000
// (502K, not 502,341). Exact values appear only in a generator's details
// (fmtExact).
const SUFFIXES = [
  [1e18, 'Qi'],
  [1e15, 'Qa'],
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
];
// 3 significant figures for a value in [1, 1000): "1.23", "12.3", "100",
// "502". Returns null only when the rounded value is 1000 (999.999K), so
// the caller can carry into the next bigger suffix.
function sig3(x) {
  if (x >= 100) {
    const r = Math.round(x);
    return r >= 1000 ? null : String(r);
  }
  if (x >= 10) {
    const r = Math.round(x * 10) / 10;
    return r === 100 ? '100' : r.toFixed(1); // 99.999Qa rounds to 100Qa
  }
  const r = Math.round(x * 100) / 100;
  return r >= 10 ? r.toFixed(1) : r.toFixed(2); // 9.9999B rounds to 10.0B
}

export function fmt(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '0';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs < 1000) return sign + String(Math.floor(abs));
  for (let i = 0; i < SUFFIXES.length; i++) {
    const [v, s] = SUFFIXES[i];
    if (abs >= v) {
      const str = sig3(abs / v);
      if (str !== null) return sign + str + s;
      // 999.999K rounds to 1000K, 99.999Qa to 100.0Qa — carry into the
      // next (bigger) suffix, where the value is < 1.
      if (i > 0) {
        const [pv, ps] = SUFFIXES[i - 1];
        return sign + sig3(abs / pv) + ps;
      }
      // 1.234e21 is 1234Qi — beyond Qi, fall back to exponential.
      return sign + abs.toExponential(2).replace('e+', 'e');
    }
  }
  return sign + abs.toExponential(2).replace('e+', 'e');
}

// Exact value, no suffix, no commas — only for a generator's details.
export function fmtExact(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '0';
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 1000) / 1000);
}

function fmtTime(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

function upgradeWords(u) {
  switch (u.kind) {
    case 'production': return `Production x${u.value}`;
    case 'cacheRate': return `Cache rate +${Math.round(u.value * 100)}%`;
    case 'cooling': return `Cooling +${u.value}/s`;
    case 'clickFlat': return `Click +${u.value}`;
    case 'clickShare': return `Click +${Math.round(u.value * 100)}% of rate`;
    default: return '';
  }
}

// Weight upgrades in words (phrasing from docs/IDLE-DESIGN.md). The distill
// line is generated from the data.js values so it can never drift from them.
const DISTILL_WU = WEIGHT_UPGRADES.find((w) => w.id === 'distill');
const WU_WORDS = {
  seed: 'Start each run with 1,000 tokens',
  night: 'Offline rate 50% becomes 75%',
  warm: 'Cache rate +25%',
  procure: 'Adds a Buy All button to the Upgrades tab',
  long: 'Offline cap 8 hours becomes 24',
  auto: 'Overclock auto-cycles: off at 95 heat, on at 40',
  distill: `Weight bonus ${Math.round(WEIGHT_BONUS_PER_WEIGHT * 100)}% becomes ${Math.round(DISTILL_WU.value * 100)}% each`,
};

export function createUI(state, io) {
  const view = {
    buyMode: '1', // '1' | '10' | 'max'
    openGen: null, // id of the one open generator row, or null
    prestigeArmed: false,
    resetArmed: false,
    lastNow: 0,
  };
  let prestigeTimer = null;
  let resetTimer = null;

  // --- element refs -------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const els = {
    tokens: $('tokens'),
    tps: $('tps'),
    weightsChip: $('weights-chip'),
    banner: $('banner'),
    serve: $('serve'),
    serveWrap: $('serve-wrap'),
    heatFill: $('heat-fill'),
    heatNum: $('heat-num'),
    ocState: $('oc-state'),
    overclock: $('overclock'),
    genRows: $('gen-rows'),
    upGrid: $('up-grid'),
    wAvail: $('w-avail'),
    prestige: $('prestige'),
    prestigeHint: $('prestige-hint'),
    prestigeBtn: $('prestige-btn'),
    prestigeGrid: $('prestige-grid'),
    rush: $('rush'),
    exportArea: $('export-area'),
    exportBtn: $('export-btn'),
    importArea: $('import-area'),
    importBtn: $('import-btn'),
    resetBtn: $('reset-btn'),
    settingsMsg: $('settings-msg'),
    upDot: document.querySelector('[data-tab="upgrades"] .tab-dot'),
    prestigeDot: document.querySelector('[data-tab="prestige"] .tab-dot'),
  };

  function setMsg(text) {
    els.settingsMsg.textContent = text;
  }

  // --- build generator rows (once) -----------------------------------------
  // Each row is one line, at most 56px tall: "Name  x12" on the left
  // (tappable to expand the details), a single "+60/s  20K" button on the
  // right, and a thin progress bar along the row's bottom edge. The
  // details (producing now, share of total, gain per unit, next doubling)
  // show when the row is open — one row open at a time.
  const genRefs = GENERATORS.map((g) => {
    const row = document.createElement('div');
    row.className = 'row';
    const nameBtn = document.createElement('button');
    nameBtn.type = 'button';
    nameBtn.className = 'name-btn';
    nameBtn.setAttribute('aria-expanded', 'false');
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = g.name;
    const owned = document.createElement('span');
    owned.className = 'owned';
    nameBtn.append(name, owned);
    const buyBtn = document.createElement('button');
    buyBtn.type = 'button';
    buyBtn.className = 'buy';
    const bEffect = document.createElement('span');
    bEffect.className = 'be';
    const bCost = document.createElement('span');
    bCost.className = 'bc';
    buyBtn.append(bEffect, bCost);
    buyBtn.addEventListener('click', () => {
      buy(state, g.id, view.buyMode === 'max' ? 'max' : Number(view.buyMode));
      updateGenRows(state, false); // immediate, without waiting for the next 10 Hz pass
    });
    const bar = document.createElement('div');
    bar.className = 'bar';
    const barFill = document.createElement('div');
    barFill.className = 'bar-fill';
    bar.append(barFill);
    const details = document.createElement('div');
    details.className = 'details';
    details.hidden = true;
    const dOut = document.createElement('span');
    const dShare = document.createElement('span');
    const dEach = document.createElement('span');
    dEach.className = 'each';
    const dDbl = document.createElement('span');
    details.append(dOut, dShare, dEach, dDbl);
    nameBtn.addEventListener('click', () => {
      view.openGen = view.openGen === g.id ? null : g.id;
      for (const r of genRefs) {
        const isOpen = view.openGen === r.g.id;
        r.details.hidden = !isOpen;
        r.nameBtn.setAttribute('aria-expanded', String(isOpen));
      }
    });
    row.append(nameBtn, buyBtn, details, bar);
    els.genRows.appendChild(row);
    return {
      g, row, nameBtn, owned, buyBtn, bEffect, bCost, barFill,
      details, dOut, dShare, dEach, dDbl,
      eff: { producing: 0, share: 0, each: 0, mode: 0 },
    };
  });

  // Max affordable count for a generator, mirroring core.js buy() without
  // mutating state (display only).
  function maxAffordable(state, g) {
    const owned = state.generators[g.id] || 0;
    let count = 0;
    let total = 0;
    while (count < 100000) {
      const next = Math.ceil(g.baseCost * Math.pow(COST_GROWTH, owned + count));
      if (total + next > state.tokens) break;
      total += next;
      count++;
    }
    return { count, total };
  }

  // tps delta when adding n units of generator g. The state is cloned with
  // JSON, so the real state is never mutated; doubling thresholds are picked
  // up automatically because the clone goes through tokensPerSecond.
  function tpsGain(state, g, n) {
    const before = tokensPerSecond(state);
    const clone = JSON.parse(JSON.stringify(state));
    clone.generators[g.id] = (clone.generators[g.id] || 0) + n;
    return tokensPerSecond(clone) - before;
  }

  // This generator's contribution to the total tps, all multipliers included:
  // the total minus what remains with its count set to zero.
  function genContribution(state, g) {
    const total = tokensPerSecond(state);
    const clone = JSON.parse(JSON.stringify(state));
    clone.generators[g.id] = 0;
    return total - tokensPerSecond(clone);
  }

  // tps delta when buying upgrade u (used for production upgrades), same
  // clone-and-compare approach, so the real state is never mutated.
  function upgradeGain(state, u) {
    const before = tokensPerSecond(state);
    const clone = JSON.parse(JSON.stringify(state));
    clone.upgrades = [...clone.upgrades, u.id];
    return tokensPerSecond(clone) - before;
  }

  // Generator rows: called with recompute=true on each 10 Hz update — the
  // only place the producing/share/per-unit tps figures are computed, and
  // only for visible rows — and with recompute=false on mode change /
  // purchase, which reuses those figures but recomputes the mode gain, so
  // the button never shows a stale figure. The cost shown is the true cost
  // of the mode: x1 -> 1, x10 -> 10, max -> the affordable count, or 1 when
  // nothing is affordable (and the button is disabled).
  // Visibility: all owned tiers plus the next unowned one; later tiers stay
  // hidden until reached.
  function updateGenRows(state, recompute) {
    let nextUnowned = null;
    for (const r of genRefs) {
      if ((state.generators[r.g.id] || 0) === 0 && nextUnowned === null) {
        nextUnowned = r.g.id;
      }
    }
    for (const r of genRefs) {
      // A missing key (e.g. an imported save predating this generator)
      // counts as 0.
      const owned = state.generators[r.g.id] || 0;
      const visible = owned > 0 || r.g.id === nextUnowned;
      r.row.hidden = !visible;
      if (!visible) continue;
      if (recompute) {
        const total = tokensPerSecond(state);
        r.eff.producing = genContribution(state, r.g);
        r.eff.share = total > 0 ? Math.round((r.eff.producing / total) * 100) : 0;
        r.eff.each = tpsGain(state, r.g, 1);
      }
      // The mode gain is recomputed on every pass (mode change and purchase
      // call updateGenRows with recompute=false): tokensPerSecond on a JSON
      // clone before and after adding that many owned, so a purchase that
      // crosses a doubling threshold shows the full gain.
      if (view.buyMode === 'max') {
        const m = maxAffordable(state, r.g);
        r.eff.mode = m.count > 0 ? tpsGain(state, r.g, m.count) : r.eff.each;
      } else {
        r.eff.mode = tpsGain(state, r.g, Number(view.buyMode));
      }
      // The line: "Name  x12" on the left.
      r.owned.textContent = `x${fmt(owned)}`;
      // The button carries the mode's cost and its gain: "+60/s  20K".
      let c;
      let disabled;
      if (view.buyMode === 'max') {
        const m = maxAffordable(state, r.g);
        c = m.count > 0 ? m.total : cost(state, r.g.id, 1);
        disabled = m.count === 0;
      } else {
        c = cost(state, r.g.id, Number(view.buyMode));
        disabled = c > state.tokens;
      }
      r.bEffect.textContent = `+${fmt(r.eff.mode)}/s`;
      r.bCost.textContent = fmt(c);
      r.buyBtn.disabled = disabled;
      r.buyBtn.classList.toggle('afford', !disabled);
      // Thin bar along the bottom edge: progress to affordable (full when
      // the mode is affordable).
      r.barFill.style.width = `${Math.min(100, (state.tokens / c) * 100)}%`;
      // Details: open for the one open row only.
      const open = view.openGen === r.g.id;
      r.details.hidden = !open;
      r.nameBtn.setAttribute('aria-expanded', String(open));
      if (open) {
        r.dOut.textContent = `Producing ${fmt(r.eff.producing)}/s`;
        r.dShare.textContent = `${r.eff.share}% of total`;
        r.dEach.textContent = `+${fmt(r.eff.each)}/s each`;
        const next = DOUBLING_THRESHOLDS.find((t) => owned < t);
        r.dDbl.textContent = next === undefined ? '' : `x2 at ${next}`;
      }
    }
  }

  // --- build upgrade cards (once) ------------------------------------------
  // Card layout: name, the effect in words, what it means now (production
  // and cache: "+1.2K/s" from the before/after comparison; cooling/click:
  // hidden, the effect line says it all), a slim progress bar, and a
  // "Buy · 1,000" button.
  const upRefs = [...UPGRADES]
    .sort((a, b) => a.cost - b.cost)
    .map((u) => {
    const card = document.createElement('div');
    card.className = 'card';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = u.name;
    const effect = document.createElement('span');
    effect.className = 'effect';
    effect.textContent = upgradeWords(u);
    const now = document.createElement('span');
    now.className = 'now';
    const bar = document.createElement('div');
    bar.className = 'bar';
    const barFill = document.createElement('div');
    barFill.className = 'bar-fill';
    bar.append(barFill);
    const buyBtn = document.createElement('button');
    buyBtn.type = 'button';
    buyBtn.className = 'buy';
    const bLabel = document.createElement('span');
    bLabel.textContent = 'Buy ·';
    const bCost = document.createElement('span');
    bCost.className = 'bc';
    buyBtn.append(bLabel, ' ', bCost);
    buyBtn.addEventListener('click', () => buyUpgrade(state, u.id));
    card.append(name, effect, now, bar, buyBtn);
    els.upGrid.appendChild(card);
    return { u, card, now, bar, barFill, buyBtn, bLabel, bCost, gain: 0 };
  });

  // Buy All: shown at the top of the list only while the 'procure' weight
  // upgrade is owned. N is how many it would buy now, computed on a copy of
  // the token count so the real state is never mutated.
  const buyAllBtn = document.createElement('button');
  buyAllBtn.type = 'button';
  buyAllBtn.id = 'buy-all';
  buyAllBtn.hidden = true;
  function buyAllCount() {
    let count = 0;
    let tokens = state.tokens;
    for (const u of [...UPGRADES].sort((a, b) => a.cost - b.cost)) {
      if (state.upgrades.includes(u.id)) continue;
      if (tokens < u.cost) break;
      tokens -= u.cost;
      count++;
    }
    return count;
  }
  buyAllBtn.addEventListener('click', () => {
    buyAllUpgrades(state);
    updateUpgrades(state); // immediate, without waiting for the next 10 Hz pass
  });
  els.upGrid.parentNode.insertBefore(buyAllBtn, els.upGrid);

  // --- build weight upgrade rows (once) ------------------------------------
  // Sorted by cost, cheapest first, like the token upgrades.
  const wuRefs = [...WEIGHT_UPGRADES]
    .sort((a, b) => a.cost - b.cost)
    .map((wu) => {
    const row = document.createElement('div');
    row.className = 'wu';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = wu.name;
    const effect = document.createElement('span');
    effect.className = 'effect';
    effect.textContent = WU_WORDS[wu.id] || '';
    const costEl = document.createElement('span');
    costEl.className = 'cost';
    costEl.textContent = wu.cost === 1 ? '1 weight' : `${wu.cost} weights`;
    const buyBtn = document.createElement('button');
    buyBtn.type = 'button';
    buyBtn.textContent = 'BUY';
    buyBtn.addEventListener('click', () => buyWeightUpgrade(state, wu.id));
    row.append(name, effect, costEl, buyBtn);
    els.prestigeGrid.appendChild(row);
    return { wu, buyBtn };
  });

  // --- serve button: click + floating +N -----------------------------------
  els.serve.addEventListener('click', () => {
    const earned = click(state);
    const f = document.createElement('span');
    f.className = 'float';
    f.textContent = `+${fmt(earned)}`;
    els.serveWrap.appendChild(f);
    setTimeout(() => f.remove(), 900);
  });

  // --- buy amount selector (applies to all generator rows) ------------------
  const selBtns = document.querySelectorAll('.buy-sel button');
  selBtns.forEach((b) => {
    b.addEventListener('click', () => {
      view.buyMode = b.dataset.mode;
      selBtns.forEach((x) => x.classList.toggle('active', x === b));
      updateGenRows(state, false); // highlight and rows update immediately
    });
  });

  // --- overclock toggle ----------------------------------------------------
  els.overclock.addEventListener('click', () => setOverclock(state, !state.overclock));

  // --- prestige: two-step confirm -------------------------------------------
  function disarmPrestige() {
    view.prestigeArmed = false;
    els.prestigeBtn.classList.remove('armed');
    els.prestigeBtn.textContent = 'PRESTIGE';
  }
  els.prestigeBtn.addEventListener('click', () => {
    if (weightsAvailable(state) < 1) return;
    if (!view.prestigeArmed) {
      view.prestigeArmed = true;
      els.prestigeBtn.classList.add('armed');
      els.prestigeBtn.textContent = 'CONFIRM PRESTIGE?';
      clearTimeout(prestigeTimer);
      prestigeTimer = setTimeout(disarmPrestige, 5000);
      return;
    }
    clearTimeout(prestigeTimer);
    prestige(state);
    disarmPrestige();
  });

  // --- tabs (one screen at a time; last tab remembered) ----------------------
  const TAB_KEY = 'overclock.idle.tab';
  const tabPanels = {
    game: document.getElementById('tab-game'),
    upgrades: document.getElementById('tab-upgrades'),
    prestige: document.getElementById('tab-prestige'),
    shop: document.getElementById('tab-shop'),
    settings: document.getElementById('tab-settings'),
  };
  const tabBtns = document.querySelectorAll('#tabs button');
  const tabScrollEl = document.getElementById('tab-scroll');
  const tabScrollPos = {}; // per-tab scroll position in the shared middle region
  let currentTab = null;
  function showTab(name) {
    if (!tabPanels[name]) name = 'game';
    if (currentTab !== null) tabScrollPos[currentTab] = tabScrollEl.scrollTop;
    currentTab = name;
    for (const [key, panel] of Object.entries(tabPanels)) panel.hidden = key !== name;
    tabBtns.forEach((b) => {
      if (b.dataset.tab === name) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    tabScrollEl.scrollTop = tabScrollPos[name] || 0;
    try {
      localStorage.setItem(TAB_KEY, name);
    } catch (err) {
      // ignore
    }
  }
  tabBtns.forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  let startTab = 'game';
  try {
    const saved = localStorage.getItem(TAB_KEY);
    if (saved && tabPanels[saved]) startTab = saved;
  } catch (err) {
    // ignore
  }
  showTab(startTab);

  // --- settings ------------------------------------------------------------
  els.exportBtn.addEventListener('click', () => {
    els.exportArea.value = io.exportSave(state, view.lastNow);
  });
  els.importBtn.addEventListener('click', () => {
    const s = io.importSave(els.importArea.value);
    if (s) {
      io.replaceState(s);
      setMsg('Save imported.');
    } else {
      setMsg('Invalid save text.');
    }
  });

  // --- hard reset: two-step confirm -----------------------------------------
  function disarmReset() {
    view.resetArmed = false;
    els.resetBtn.classList.remove('armed');
    els.resetBtn.textContent = 'HARD RESET';
  }
  els.resetBtn.addEventListener('click', () => {
    if (!view.resetArmed) {
      view.resetArmed = true;
      els.resetBtn.classList.add('armed');
      els.resetBtn.textContent = 'CONFIRM RESET?';
      clearTimeout(resetTimer);
      resetTimer = setTimeout(disarmReset, 5000);
      return;
    }
    clearTimeout(resetTimer);
    io.hardReset();
    io.replaceState(createState());
    disarmReset();
    setMsg('Reset.');
  });

  // --- banners (offline earnings, rush payout) ------------------------------
  // Each message is its own row with its own close button and auto-dismiss,
  // so several can be visible at once, one below the other.
  function showBanner(text) {
    const msg = document.createElement('div');
    msg.className = 'banner-msg';
    const span = document.createElement('span');
    span.textContent = text;
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'dismiss');
    closeBtn.textContent = 'x';
    let timer = null;
    const dismiss = () => {
      if (timer !== null) clearTimeout(timer);
      msg.remove();
      if (els.banner.children.length === 0) els.banner.hidden = true;
    };
    closeBtn.addEventListener('click', dismiss);
    timer = setTimeout(dismiss, 20000);
    msg.append(span, closeBtn);
    els.banner.appendChild(msg);
    els.banner.hidden = false;
  }

  // --- upgrades (the 10 Hz pass, and immediately after a Buy All tap) ------
  function updateUpgrades(state) {
    // Every card is always shown (sorted by cost, cheapest first), whether or
    // not it is affordable. An owned card stays in its place, dimmed, with a
    // disabled "Owned" button and no progress bar. Both directions follow
    // state on every pass, so a prestige, import or reset that clears (or
    // changes) state.upgrades brings the cards back in sync.
    for (const r of upRefs) {
      const owned = state.upgrades.includes(r.u.id);
      r.card.classList.toggle('owned', owned);
      if (owned) {
        r.now.hidden = true;
        r.bar.hidden = true;
        r.buyBtn.disabled = true;
        r.buyBtn.classList.remove('afford');
        r.bLabel.textContent = 'Owned';
        r.bCost.hidden = true;
        continue;
      }
      r.bLabel.textContent = 'Buy ·';
      r.bCost.hidden = false;
      r.bar.hidden = false;
      // The before/after figure is computed here, at the 10 Hz pass.
      if (r.u.kind === 'production' || r.u.kind === 'cacheRate') {
        r.gain = upgradeGain(state, r.u);
        r.now.hidden = false;
        r.now.textContent = `+${fmt(r.gain)}/s`;
      } else {
        // Cooling and click upgrades have no tps figure: the effect line
        // above says it all, so the second line is hidden.
        r.now.hidden = true;
      }
      const affordable = state.tokens >= r.u.cost;
      r.buyBtn.disabled = !affordable;
      r.buyBtn.classList.toggle('afford', affordable);
      r.bCost.classList.toggle('amber', !affordable);
      r.bCost.textContent = fmt(r.u.cost);
      r.barFill.style.width = `${Math.min(100, (state.tokens / r.u.cost) * 100)}%`;
    }
    // Buy All: visible only while 'procure' is owned; N is how many it would
    // buy now (computed without touching state), disabled at 0.
    const ownsProcure = state.weightUpgrades.includes('procure');
    buyAllBtn.hidden = !ownsProcure;
    if (ownsProcure) {
      const n = buyAllCount();
      buyAllBtn.textContent = `Buy All (${n})`;
      buyAllBtn.disabled = n === 0;
    }
  }

  // --- update (called at most 10 times per second by app.js) ----------------
  function update(state, now) {
    view.lastNow = now;
    els.tokens.textContent = fmt(state.tokens);
    els.tps.textContent = `+${fmt(tokensPerSecond(state))}/s`;
    // Weights appear only after the first is earned, as a small magenta chip.
    const hasWeights = state.weights > 0 || (state.weightsEarnedThisCycle || 0) > 0;
    els.weightsChip.hidden = !hasWeights;
    if (hasWeights) els.weightsChip.textContent = `weights ${fmt(state.weights)}`;

    // Heat panel.
    els.heatFill.style.width = `${Math.min(100, Math.max(0, state.heat))}%`;
    els.heatFill.classList.toggle('hot', state.heat >= 80);
    els.heatNum.textContent = String(Math.round(state.heat));
    if (state.throttled) {
      els.ocState.textContent = 'THROTTLED';
    } else if (state.overclock) {
      els.ocState.textContent = 'OVERCLOCKED';
    } else {
      els.ocState.textContent = 'COOLING';
    }
    els.overclock.textContent = state.overclock ? 'OVERCLOCK ON' : 'OVERCLOCK OFF';
    els.overclock.disabled = state.throttled;

    // Generators (immediate updates on mode change / purchase call this too).
    updateGenRows(state, true);

    // Upgrades (and the Buy All button), same pass.
    updateUpgrades(state);

    // Prestige: hidden until the first weight is in reach or already earned;
    // a hint line takes its place in the meantime.
    const w = weightsAvailable(state);
    const revealed = w >= 1 || state.weights > 0 || state.weightsEarnedThisCycle > 0;
    els.prestige.hidden = !revealed;
    els.prestigeHint.hidden = revealed;
    if (!revealed) {
      const target = PRESTIGE_DIVISOR * Math.pow(state.weightsEarnedThisCycle + 1, 2);
      els.prestigeHint.textContent =
        `New Model Generation unlocks at ${fmt(target)} lifetime tokens`;
    }
    els.wAvail.textContent = fmt(w);
    els.prestigeBtn.disabled = w < 1;

    // Tab dots: Upgrades lights up when an upgrade is affordable,
    // Prestige when a weight is available.
    let upAffordable = false;
    for (const r of upRefs) {
      if (!state.upgrades.includes(r.u.id) && state.tokens >= r.u.cost) {
        upAffordable = true;
        break;
      }
    }
    els.upDot.hidden = !upAffordable;
    els.prestigeDot.hidden = w < 1;

    // Weight upgrades.
    for (const r of wuRefs) {
      const owned = state.weightUpgrades.includes(r.wu.id);
      r.buyBtn.disabled = owned || state.weights < r.wu.cost;
      r.buyBtn.textContent = owned ? 'OWNED' : 'BUY';
    }

    // Rush card: the button is usable when the cooldown has passed.
    const remaining = state.rushCooldownUntil !== null ? state.rushCooldownUntil - now : 0;
    if (remaining > 0) {
      els.rush.classList.add('disabled');
      els.rush.setAttribute('aria-disabled', 'true');
      els.rush.textContent = `Ready in ${fmtTime(remaining)}`;
    } else {
      els.rush.classList.remove('disabled');
      els.rush.removeAttribute('aria-disabled');
      els.rush.textContent = 'Play Rush';
    }
  }

  return { update, showBanner };
}
