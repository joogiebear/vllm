// Advice: one pure function that tells the player what to buy next.
// No DOM, no mutation of the passed state, no side effects — the UI layer
// renders the result.

import { GENERATORS, UPGRADES, MANAGERS, PRESTIGE_DIVISOR } from './data.js?v=20261104164438';
import {
  tokensPerSecond, cost, isTierUnlocked, hasManager, weightsAvailable,
  regionsAvailable, regionName,
} from './core.js?v=20261104164438';
import { fmt } from './fmt.js?v=20261104164438';

// A clone of state with one candidate purchase applied.
function withPurchase(state, kind, id) {
  const s = JSON.parse(JSON.stringify(state));
  if (kind === 'generator') {
    s.generators[id] = (s.generators[id] || 0) + 1;
  } else {
    s.upgrades = [...(s.upgrades || []), id];
  }
  return s;
}

// Among one unit of each generator and each unowned upgrade, the best buy:
// the best gain per cost among those affordable, or — if none is affordable —
// the one nearest to affordable by time at the current rate (ties, or a zero
// rate, fall back to the smallest remaining cost). Returns
// {kind, id, gain, cost, affordable}, or null when there are no candidates.
// `gain` is the difference in tokensPerSecond between the state and a JSON
// clone with the candidate applied.
export function nextBestBuy(state) {
  const candidates = [];
  // Only machines the player can see and buy: the ones owned, plus the
  // first one not owned yet (the Servers list shows no others).
  let firstUnowned = true;
  for (const g of GENERATORS) {
    const owned = (state.generators && state.generators[g.id]) || 0;
    if (owned === 0) {
      if (!firstUnowned) continue;
      firstUnowned = false;
    }
    if (!isTierUnlocked(state, g.id)) continue;
    candidates.push({ kind: 'generator', id: g.id, cost: cost(state, g.id, 1) });
  }
  for (const u of UPGRADES) {
    if ((state.upgrades || []).includes(u.id)) continue;
    candidates.push({ kind: 'upgrade', id: u.id, cost: u.cost });
  }
  if (candidates.length === 0) return null;

  const base = tokensPerSecond(state);
  for (const c of candidates) {
    c.gain = tokensPerSecond(withPurchase(state, c.kind, c.id)) - base;
    c.affordable = c.cost <= state.tokens;
  }

  const affordable = candidates.filter((c) => c.affordable);
  if (affordable.length > 0) {
    return affordable.reduce((best, c) =>
      c.gain / c.cost > best.gain / best.cost ? c : best,
    );
  }

  const tps = base;
  const timeTo = (c) => (tps > 0 ? (c.cost - state.tokens) / tps : Infinity);
  return candidates.reduce((best, c) => {
    const t = timeTo(c);
    const bt = timeTo(best);
    if (t !== bt) return t < bt ? c : best;
    return c.cost - state.tokens < best.cost - state.tokens ? c : best;
  });
}

// The one goal shown in the strip under the header (docs/UX-PLAN.md,
// section 3.2). Pure. Returns { kind, text, have, need, tab, seg } or null
// (no strip) while an event offer is on screen, since the event banner is
// the goal then. `have`/`need` drive the progress bar; `tab` is the bottom
// tab a tap opens.
export function nextGoal(state) {
  if (!state || typeof state !== 'object') return null;
  if (state.eventOffer) return null;

  if (regionsAvailable(state) >= 1) {
    const next = regionName({ ...state, regionsEarned: (state.regionsEarned || 0) + 1 });
    return { kind: 'region', text: `Region ready: expand to ${next}`, have: 1, need: 1, tab: 'prestige', seg: 'regions' };
  }

  // Prestige is the goal once it is worth it: the reset raises Weights by
  // at least half (and the first time, by any amount). Otherwise it would
  // fill the strip for the whole run after the first Weight appears.
  const gained = weightsAvailable(state);
  const weights = state.weights || 0;
  if (gained >= Math.max(1, Math.ceil(weights / 2))) {
    return {
      kind: 'prestige',
      text: `Prestige ready: +${fmt(gained)} Weight${gained === 1 ? '' : 's'}`,
      have: 1, need: 1, tab: 'prestige', seg: 'weights',
    };
  }

  let manager = null;
  for (const m of MANAGERS) {
    if (!((state.generators && state.generators[m.id]) > 0)) continue;
    if (hasManager(state, m.id)) continue;
    if (manager === null || m.cost < manager.cost) manager = m;
  }
  const buy = nextBestBuy(state);
  if (manager !== null && (buy === null || manager.cost <= buy.cost)) {
    return { kind: 'manager', text: `Hire ${manager.name}`, have: state.tokens, need: manager.cost, tab: 'managers' };
  }
  if (buy !== null) {
    if (buy.kind === 'upgrade') {
      const u = UPGRADES.find((x) => x.id === buy.id);
      return { kind: 'upgrade', text: `Buy ${u.name}`, have: state.tokens, need: buy.cost, tab: 'upgrades' };
    }
    const g = GENERATORS.find((x) => x.id === buy.id);
    const owned = (state.generators && state.generators[g.id]) || 0;
    return {
      kind: 'generator',
      text: owned === 0 ? `Unlock ${g.name}` : `Buy a ${g.name}`,
      have: state.tokens, need: buy.cost, tab: 'game',
    };
  }

  const total = Math.max(0, state.totalLifetime || 0);
  const k = Math.floor(Math.sqrt(total / PRESTIGE_DIVISOR)) + 1;
  const need = PRESTIGE_DIVISOR * k * k;
  return { kind: 'weight', text: `Next Weight at ${fmt(need)} lifetime tokens`, have: total, need, tab: 'prestige', seg: 'weights' };
}
