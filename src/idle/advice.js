// Advice: one pure function that tells the player what to buy next.
// No DOM, no mutation of the passed state, no side effects — the UI layer
// renders the result.

import { GENERATORS, UPGRADES } from './data.js?v=20261104142708';
import { tokensPerSecond, cost } from './core.js?v=20261104142708';

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
  for (const g of GENERATORS) {
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
