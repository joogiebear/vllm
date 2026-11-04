// Region backgrounds (docs/ART-BACKGROUNDS.md, task 2): the body's
// background is the current Region's scene (icons/bg/<key>.webp), falling
// back to the last earlier Region that has a file, else Home Lab.
// Called once at start and after every Region expansion.
import { BACKGROUNDS, BG_V } from './data.js?v=20261104003036';

export function applyBackground(state) {
  const earned = state.regionsEarned || 0;
  const idx = Math.min(earned, BACKGROUNDS.length - 1);
  let key = 'homelab';
  for (let i = idx; i >= 0; i--) {
    if (BACKGROUNDS[i]) {
      key = BACKGROUNDS[i];
      break;
    }
  }
  document.body.style.backgroundImage = `url(icons/bg/${key}.webp?v=${BG_V})`;
}
