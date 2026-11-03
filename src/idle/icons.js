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
  // Spiral into a centre dot.
  singularity: 'M12 12a1.5 1.5 0 0 1 3 0a2.5 2.5 0 0 1 -5 0a3.5 3.5 0 0 1 7 0a4.5 4.5 0 0 1 -9 0a5.5 5.5 0 0 1 11 0'
    + 'M12 11a1 1 0 1 0 0 2a1 1 0 1 0 0-2z',
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
