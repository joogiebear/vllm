// Render the idle state to the DOM and turn clicks into core calls.
// This module never reads the clock: app.js passes `now` into update().
// Rows and cards are built once; update() only changes text, classes and
// visibility, so the DOM is not rebuilt on every frame.
import {
  click, buy, buyUpgrade, buyWeightUpgrade, setOverclock, prestige,
  tokensPerSecond, cost, weightsAvailable, createState,
} from './core.js';
import {
  GENERATORS, UPGRADES, WEIGHT_UPGRADES, DOUBLING_THRESHOLDS,
  GENERATOR_REVEAL_FRACTION, UPGRADE_REVEAL_FRACTION, PRESTIGE_DIVISOR,
} from './data.js';

// --- number formatting ----------------------------------------------------
// 1,234, then 1.23M, 1.23B, 1.23T, 1.23Qa, 1.23Qi, then 1.23e21.
const SUFFIXES = [
  [1e18, 'Qi'],
  [1e15, 'Qa'],
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
];
export function fmt(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '0';
  const abs = Math.abs(n);
  if (abs < 1e6) {
    if (abs > 0 && abs < 1) return n.toFixed(1);
    return Math.floor(n).toLocaleString('en-US');
  }
  for (const [v, s] of SUFFIXES) {
    if (abs >= v) return (n / v).toFixed(2) + s;
  }
  return n.toExponential(2).replace('e+', 'e');
}

function fmtTime(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

// Per-generator output for display: owned * tps, doubled at each threshold.
function genOutput(state, g) {
  const owned = state.generators[g.id];
  let mult = 1;
  for (const t of DOUBLING_THRESHOLDS) if (owned >= t) mult *= 2;
  return owned * g.tps * mult;
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

// Weight upgrades in words (phrasing from docs/IDLE-DESIGN.md).
const WU_WORDS = {
  seed: 'Start each run with 1,000 tokens',
  night: 'Offline rate 50% becomes 75%',
  warm: 'Cache rate +25%',
  long: 'Offline cap 8 hours becomes 24',
  auto: 'Overclock auto-cycles: off at 95 heat, on at 40',
  distill: 'Weight bonus 2% becomes 3% each',
};

export function createUI(state, io) {
  const view = {
    buyMode: '1', // '1' | '10' | 'max'
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
    weights: $('weights-value'),
    banner: $('banner'),
    serve: $('serve'),
    serveWrap: $('serve-wrap'),
    heatFill: $('heat-fill'),
    heatNum: $('heat-num'),
    ocState: $('oc-state'),
    overclock: $('overclock'),
    genRows: $('gen-rows'),
    upGrid: $('up-grid'),
    purchasedList: $('purchased-list'),
    wAvail: $('w-avail'),
    prestige: $('prestige'),
    prestigeHint: $('prestige-hint'),
    prestigeBtn: $('prestige-btn'),
    prestigeGrid: $('prestige-grid'),
    rush: $('rush'),
    settingsBtn: $('settings-btn'),
    settings: $('settings'),
    exportArea: $('export-area'),
    exportBtn: $('export-btn'),
    importArea: $('import-area'),
    importBtn: $('import-btn'),
    resetBtn: $('reset-btn'),
    settingsMsg: $('settings-msg'),
  };

  function setMsg(text) {
    els.settingsMsg.textContent = text;
  }

  // --- build generator rows (once) -----------------------------------------
  const genRefs = GENERATORS.map((g) => {
    const row = document.createElement('div');
    row.className = 'row';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = g.name;
    const owned = document.createElement('span');
    owned.className = 'owned';
    const out = document.createElement('span');
    out.className = 'out';
    const costEl = document.createElement('span');
    costEl.className = 'cost';
    const dbl = document.createElement('span');
    dbl.className = 'dbl';
    const buyBtn = document.createElement('button');
    buyBtn.type = 'button';
    buyBtn.className = 'buy';
    buyBtn.textContent = 'BUY';
    buyBtn.addEventListener('click', () => {
      buy(state, g.id, view.buyMode === 'max' ? 'max' : Number(view.buyMode));
    });
    row.append(name, owned, out, costEl, dbl, buyBtn);
    els.genRows.appendChild(row);
    return { g, row, owned, out, costEl, dbl, buyBtn };
  });

  // --- build upgrade cards (once) ------------------------------------------
  const upRefs = UPGRADES.map((u) => {
    const card = document.createElement('div');
    card.className = 'card';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = u.name;
    const effect = document.createElement('span');
    effect.className = 'effect';
    effect.textContent = upgradeWords(u);
    const costEl = document.createElement('span');
    costEl.className = 'cost';
    costEl.textContent = `${fmt(u.cost)} tokens`;
    const buyBtn = document.createElement('button');
    buyBtn.type = 'button';
    buyBtn.textContent = 'BUY';
    buyBtn.addEventListener('click', () => buyUpgrade(state, u.id));
    card.append(name, effect, costEl, buyBtn);
    els.upGrid.appendChild(card);
    return { u, card, buyBtn, moved: false };
  });

  // --- build weight upgrade rows (once) ------------------------------------
  const wuRefs = WEIGHT_UPGRADES.map((wu) => {
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

  // --- settings ------------------------------------------------------------
  els.settingsBtn.addEventListener('click', () => {
    els.settings.hidden = !els.settings.hidden;
  });
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

  // --- update (called at most 10 times per second by app.js) ----------------
  function update(state, now) {
    view.lastNow = now;
    els.tokens.textContent = fmt(state.tokens);
    els.tps.textContent = fmt(tokensPerSecond(state));
    els.weights.textContent = fmt(state.weights);

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

    // Generators.
    for (const r of genRefs) {
      const n = view.buyMode === 'max' ? 1 : Number(view.buyMode);
      const c = cost(state, r.g.id, n);
      r.row.hidden = state.lifetime < r.g.baseCost * GENERATOR_REVEAL_FRACTION;
      const owned = state.generators[r.g.id];
      r.owned.textContent = `owned ${owned}`;
      r.out.textContent = `${fmt(genOutput(state, r.g))}/s`;
      r.costEl.textContent = `cost ${fmt(c)}`;
      const next = DOUBLING_THRESHOLDS.find((t) => owned < t);
      r.dbl.textContent = next === undefined ? '' : `x2 at ${next}`;
      r.buyBtn.disabled = c > state.tokens;
    }

    // Upgrades: reveal at 25% of cost; purchased move to the collapsed list.
    for (const r of upRefs) {
      const owned = state.upgrades.includes(r.u.id);
      if (owned && !r.moved) {
        r.moved = true;
        r.buyBtn.disabled = true;
        r.buyBtn.textContent = 'OWNED';
        const li = document.createElement('li');
        li.textContent = `${r.u.name} - ${upgradeWords(r.u)}`;
        els.purchasedList.appendChild(li);
        r.card.remove();
      }
      if (!owned) {
        r.card.hidden = state.lifetime < r.u.cost * UPGRADE_REVEAL_FRACTION;
        r.buyBtn.disabled = state.tokens < r.u.cost;
      }
    }

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

    // Weight upgrades.
    for (const r of wuRefs) {
      const owned = state.weightUpgrades.includes(r.wu.id);
      r.buyBtn.disabled = owned || state.weights < r.wu.cost;
      r.buyBtn.textContent = owned ? 'OWNED' : 'BUY';
    }

    // Rush button: usable when the cooldown has passed.
    const remaining = state.rushCooldownUntil !== null ? state.rushCooldownUntil - now : 0;
    if (remaining > 0) {
      els.rush.classList.add('disabled');
      els.rush.setAttribute('aria-disabled', 'true');
      els.rush.innerHTML = `RUSH <span class="cd">${fmtTime(remaining)}</span>`;
    } else {
      els.rush.classList.remove('disabled');
      els.rush.removeAttribute('aria-disabled');
      els.rush.textContent = 'RUSH';
    }
  }

  return { update, showBanner };
}
