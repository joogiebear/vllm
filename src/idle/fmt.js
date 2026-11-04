// Number formatting (docs/COMPLETION.md). Extracted from ui.js so DOM-free
// modules (welcome.js) can use it without pulling in the whole UI.
import { get as getSetting } from './settings.js?v=20261104210051';

// Short-scale suffixes, smallest first. Past the last one the number
// switches to scientific notation, so a row never grows past its width.
const SUFFIXES = [
  [1e3, 'K'], [1e6, 'M'], [1e9, 'B'], [1e12, 'T'], [1e15, 'Q'],
  [1e18, 'Qi'], [1e21, 'Sx'], [1e24, 'Sp'], [1e27, 'Oc'], [1e30, 'No'], [1e33, 'Dc'],
];

export function fmt(input) {
  const n = typeof input === 'number' ? input : Number(input);
  // Not a number (undefined, null, NaN, junk): 0, never a misleading "∞".
  if (Number.isNaN(n) || input === null || input === undefined) return '0';
  if (!Number.isFinite(n)) return n > 0 ? '∞' : '-∞';
  if (n < 0) return `-${fmt(-n)}`;
  if (getSetting('numberFormat') === 'sci' && n >= 1000) {
    return n.toExponential(2).replace('e+', 'e'); // e.g. 1.23e6
  }
  if (n >= 1e36) return n.toExponential(2).replace('e+', 'e');
  for (let i = SUFFIXES.length - 1; i >= 0; i--) {
    const [base, suffix] = SUFFIXES[i];
    if (n >= base) {
      const v = n / base;
      // 999.96K would round to "1000.0K": step up to the next suffix instead.
      if (v.toFixed(1) === '1000.0' && i + 1 < SUFFIXES.length) return `1.0${SUFFIXES[i + 1][1]}`;
      return `${v.toFixed(1)}${suffix}`;
    }
  }
  if (n >= 100) return `${Math.floor(n)}`;
  return n % 1 ? n.toFixed(1) : `${Math.floor(n)}`;
}
