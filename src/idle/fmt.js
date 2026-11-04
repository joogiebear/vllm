// Number formatting (docs/COMPLETION.md). Extracted from ui.js so DOM-free
// modules (welcome.js) can use it without pulling in the whole UI.
import { get as getSetting } from './settings.js?v=20261104145532';

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
