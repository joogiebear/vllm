import { PORTRAITS, PORTRAIT_V, TIER_ART, TIER_ART_V } from './data.js?v=20261104202611';

// Tier colours and generator icons.
// Style rules (docs/ART-DESIGN.md): 24x24 viewBox, stroke only at width 1.8,
// round caps and joins, fill none, currentColor, at most ~6 path segments,
// no detail under 2 units, readable at 20 px.
export const TIER_COLORS = {
  pi: '#4fd1c5',
  gamer: '#63b3ed',
  workstation: '#b794f4',
  rack: '#f6ad55',
  cluster: '#f687b3',
  datacenter: '#68d391',
  campus: '#f6e05e',
  swarm: '#fc8181',
  orbital: '#9b5cf6',
  lunar: '#38bdf8',
  matrioshka: '#f43f5e',
  singularity: '#eab308',
};

// SVG path strings keyed by generator id. Each value is the d attribute of a
// single <path>; subpaths are joined in one string. Every icon draws what the
// table in docs/ART-DESIGN.md describes.
export const ICONS = {
  // Small board: rectangle with 4 pin dots along the top edge.
  pi: 'M4.5 7h15a1.5 1.5 0 0 1 1.5 1.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5v-11A1.5 1.5 0 0 1 4.5 7z'
    + 'M6 6a1 1 0 1 0 0 2a1 1 0 1 0 0-2z'
    + 'M10 6a1 1 0 1 0 0 2a1 1 0 1 0 0-2z'
    + 'M14 6a1 1 0 1 0 0 2a1 1 0 1 0 0-2z'
    + 'M18 6a1 1 0 1 0 0 2a1 1 0 1 0 0-2z',
  // Card outline with one fan circle and a bracket on the left.
  gamer: 'M8.5 6h11a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 7 16.5v-9A1.5 1.5 0 0 1 8.5 6z'
    + 'M14.5 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z'
    + 'M2.5 9h2.5v6H2.5',
  // Tower case with a front slot and a power dot.
  workstation: 'M8.5 4h7a1.5 1.5 0 0 1 1.5 1.5v13a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 18.5v-13A1.5 1.5 0 0 1 8.5 4z'
    + 'M9.5 8h5'
    + 'M12 14a1 1 0 1 0 0 2a1 1 0 1 0 0-2z',
  // Three stacked rounded slabs, each with an LED dot.
  rack: 'M5 5h14a1 1 0 0 1 1 1v2.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z'
    + 'M5 11h14a1 1 0 0 1 1 1v2.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V12a1 1 0 0 1 1-1z'
    + 'M5 16.5h14a1 1 0 0 1 1 1v2.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V17.5a1 1 0 0 1 1-1z'
    + 'M17.5 6.25a1 1 0 1 0 0 2a1 1 0 1 0 0-2z'
    + 'M17.5 12.25a1 1 0 1 0 0 2a1 1 0 1 0 0-2z'
    + 'M17.5 18.25a1 1 0 1 0 0 2a1 1 0 1 0 0-2z',
  // 2x2 grid of small squares joined by short lines.
  cluster: 'M5 4h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z'
    + 'M15 4h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z'
    + 'M5 14h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z'
    + 'M15 14h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z'
    + 'M10 7h4M7 10v4',
  // Building with three rows of windows.
  datacenter: 'M5.5 4h13a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 19.5v-14A1.5 1.5 0 0 1 5.5 4z'
    + 'M7 8h10M7 12h10M7 16h10',
  // Atom: one dot with two crossing ellipses.
  campus: 'M12 11a1 1 0 1 0 0 2a1 1 0 1 0 0-2z'
    + 'M4.64 7.75a8.5 3.5 30 1 0 14.72 8.5a8.5 3.5 30 1 0 -14.72 -8.5z'
    + 'M4.64 16.25a8.5 3.5 -30 1 0 14.72 -8.5a8.5 3.5 -30 1 0 -14.72 8.5z',
  // Sun circle ringed by 6 small dots.
  swarm: 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8z'
    + 'M20 11a1 1 0 1 0 0 2a1 1 0 1 0 0-2z'
    + 'M16 4.07a1 1 0 1 0 0 2a1 1 0 1 0 0-2z'
    + 'M8 4.07a1 1 0 1 0 0 2a1 1 0 1 0 0-2z'
    + 'M4 11a1 1 0 1 0 0 2a1 1 0 1 0 0-2z'
    + 'M8 17.93a1 1 0 1 0 0 2a1 1 0 1 0 0-2z'
    + 'M16 17.93a1 1 0 1 0 0 2a1 1 0 1 0 0-2z',
  // Planet circle with a tilted ring across it.
  orbital: 'M12 7.5a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9z'
    + 'M3.07 15.25a9.5 3.2 -20 1 0 17.86 -6.5a9.5 3.2 -20 1 0 -17.86 6.5z',
  // Crescent moon with a small building on its curve.
  lunar: 'M12 4a8 8 0 0 0 0 16a8.9 8.9 0 0 0 0 -16z'
    + 'M4.5 10.5h2v3h-2z'
    + 'M5.5 13.5v-2',
  // Three nested circles, the inner one solid.
  matrioshka: 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17z'
    + 'M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10z'
    + 'M12 10.5a1.5 1.5 0 1 0 0 3a1.5 1.5 0 1 0 0-3z',
  // Spiral into a centre dot (3 turns, 3.5 units apart so it reads at 20 px).
  singularity: 'M12 12a1.5 1.5 0 0 1 3 0a5 5 0 0 1 -10 0a8.5 8.5 0 0 1 17 0'
    + 'M12 11a1 1 0 1 0 0 2a1 1 0 1 0 0-2z',
  // Person silhouette: head circle plus shoulders arc.
  person: 'M12 3.5a4 4 0 1 0 0 8a4 4 0 1 0 0-8z'
    + 'M4.5 20.5a7.5 7.5 0 0 1 15 0',
  // Stacked coins (lifetime).
  coins: 'M5 6.5h14a1.5 1.5 0 0 1 0 3H5a1.5 1.5 0 0 1 0-3z'
    + 'M5 10.5h14a1.5 1.5 0 0 1 0 3H5a1.5 1.5 0 0 1 0-3z'
    + 'M5 14.5h14a1.5 1.5 0 0 1 0 3H5a1.5 1.5 0 0 1 0-3z',
  // The Weights diamond (prestiges): gem outline with a horizontal facet.
  diamond: 'M12 3.5 19 8.5 12 20.5 5 8.5z'
    + 'M5 8.5h14'
    + 'M9 8.5l3-5 3 5',
  // Pointer finger (taps).
  finger: 'M9.5 12V5.5a1.5 1.5 0 0 1 3 0V12'
    + 'M9.5 12H8a2 2 0 0 0-2 2v3a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4v-3a2 2 0 0 0-2-2h-1.5',
  // Lightning bolt.
  bolt: 'M13 2.5 5.5 13.5h5L9 21.5 17.5 10.5h-5L13 2.5z',
  // Clock with an exclamation mark (events).
  clock: 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17z'
    + 'M12 8v5'
    + 'M12 16.5h.01',
  // Globe with one meridian and the equator (regions).
  globe: 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 1 0 0-17z'
    + 'M12 3.5a4.5 8.5 0 0 0 0 17a4.5 8.5 0 0 0 0-17z'
    + 'M3.5 12h17',
  // Star (all perks).
  star: 'M12 3.5l2.47 5.02 5.53.8-4 3.9.94 5.5L12 15.9l-4.94 2.6.94-5.5-4-3.9 5.53-.8z',
  // Two person silhouettes (all managers).
  twoPeople: 'M9 4.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5z'
    + 'M3.5 16.5a5.5 5.5 0 0 1 11 0'
    + 'M17.5 8a2 2 0 1 0 0 4a2 2 0 1 0 0-4z'
    + 'M14 17a4.5 4.5 0 0 1 9 0',
  // Hexagon frame for achievement badges.
  hexagon: 'M12 2.5 20.2 7.25v9.5L12 21.5l-8.2-4.75v-9.5z',
};

// Build an <svg> element for a tier icon: 24x24 viewBox, stroke only at
// width 1.8, round caps and joins, fill none, currentColor.
export function icon(id, size = 24) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', ICONS[id] || '');
  svg.appendChild(path);
  return svg;
}

// A manager icon (docs/ART-DESIGN.md "Manager icons"): the shared person
// silhouette in the row's tier colour, with the tier icon as a small badge
// (10 px) on a dark disc at the lower right. A manager with a portrait
// (docs/ART-PORTRAITS.md) gets a `span.portrait` instead: a `size` px
// sticker — no ring, no background, nothing clipped (objectFit contain) —
// holding the WebP portrait (relative path: the game is served under /vllm/).
export function managerIcon(genId, size = 32) {
  if (PORTRAITS.includes(genId)) {
    const span = document.createElement('span');
    span.className = 'portrait';
    Object.assign(span.style, {
      width: size + 'px',
      height: size + 'px',
      boxSizing: 'border-box',
      flexShrink: '0',
    });
    const img = document.createElement('img');
    img.src = `icons/managers/${genId}.webp?v=${PORTRAIT_V}`;
    img.alt = '';
    img.decoding = 'async';
    Object.assign(img.style, {
      display: 'block',
      width: '100%',
      height: '100%',
      objectFit: 'contain',
    });
    span.appendChild(img);
    return span;
  }
  const ns = 'http://www.w3.org/2000/svg';
  const color = TIER_COLORS[genId] || '#93a3b8';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const person = document.createElementNS(ns, 'path');
  person.setAttribute('d', ICONS.person);
  person.setAttribute('stroke', color);
  person.setAttribute('stroke-width', '1.8');
  svg.appendChild(person);
  const disc = document.createElementNS(ns, 'circle');
  disc.setAttribute('cx', '17');
  disc.setAttribute('cy', '17');
  disc.setAttribute('r', '5.2');
  disc.setAttribute('fill', '#0b0f17');
  disc.setAttribute('stroke', 'none');
  svg.appendChild(disc);
  const g = document.createElementNS(ns, 'g');
  g.setAttribute('transform', 'translate(17 17) scale(0.4167) translate(-12 -12)');
  const tier = document.createElementNS(ns, 'path');
  tier.setAttribute('d', ICONS[genId] || '');
  tier.setAttribute('stroke', color);
  tier.setAttribute('stroke-width', '1.8');
  g.appendChild(tier);
  svg.appendChild(g);
  return svg;
}

// A machine icon for the main rows (docs/ART-TIERS.md): the 192 px WebP
// machine art for tiers in TIER_ART, scaled to `size` px (objectFit
// contain, nothing clipped), with pointer-events off so the round run
// button keeps the tap. Relative path only: the game is served under
// /vllm/. Tiers without art keep the SVG `icon(id, size)`.
export function tierArt(id, size = 44) {
  if (TIER_ART.includes(id)) {
    const img = document.createElement('img');
    img.src = `icons/tiers/${id}.webp?v=${TIER_ART_V}`;
    img.alt = '';
    img.decoding = 'async';
    img.width = size;
    img.height = size;
    Object.assign(img.style, {
      objectFit: 'contain',
      pointerEvents: 'none',
    });
    return img;
  }
  return icon(id, size);
}

// Glyph id per non-tier achievement kind (the 'owned' kind uses the tier icon).
const BADGE_GLYPHS = {
  lifetime: 'coins',
  prestiges: 'diamond',
  taps: 'finger',
  events: 'clock',
  regions: 'globe',
  allPerks: 'star',
  allManagers: 'twoPeople',
};

// An achievement badge (docs/ART-DESIGN.md "Achievement badges"): one glyph
// inside the shared hexagon frame. Locked: frame and glyph in #2a3446.
// Unlocked: frame in the achievement's colour (gold for non-tier kinds, the
// tier colour for 'owned'), glyph in #eef3f9 (tier colour for 'owned').
export function badge(achievement, unlocked, size = 28) {
  const ns = 'http://www.w3.org/2000/svg';
  const test = achievement.test || {};
  const isOwned = test.kind === 'owned';
  const glyphId = isOwned ? test.gen : BADGE_GLYPHS[test.kind] || 'star';
  const tierColor = TIER_COLORS[glyphId];
  const frame = unlocked
    ? (isOwned ? tierColor || '#ffb547' : '#ffb547')
    : '#2a3446';
  const glyphColor = unlocked
    ? (isOwned ? tierColor || '#eef3f9' : '#eef3f9')
    : '#2a3446';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const hex = document.createElementNS(ns, 'path');
  hex.setAttribute('d', ICONS.hexagon);
  hex.setAttribute('stroke', frame);
  hex.setAttribute('stroke-width', '1.8');
  svg.appendChild(hex);
  const g = document.createElementNS(ns, 'g');
  // Scale the glyph to 0.85 so it stays inside the hexagon frame.
  g.setAttribute('transform', 'translate(12 12) scale(0.85) translate(-12 -12)');
  const glyph = document.createElementNS(ns, 'path');
  glyph.setAttribute('d', ICONS[glyphId] || '');
  glyph.setAttribute('stroke', glyphColor);
  glyph.setAttribute('stroke-width', '1.8');
  g.appendChild(glyph);
  svg.appendChild(g);
  return svg;
}
