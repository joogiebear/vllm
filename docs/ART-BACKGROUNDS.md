# Region backgrounds

Status: APPROVED by the owner ("Cool ship it", 2026-11-04 01:21 UTC) for
the first scene, Home Lab. Design owner: thread Claude. Builder: desktop
RC, with Qwen writing all code in small tasks.

## Idea

Each Region has its own scene behind the game (Home Lab, Iowa, Oregon,
Frankfurt, Tokyo, São Paulo, Arctic, Low Orbit, Lunar Base, Mars Relay;
`REGION_NAMES`), so expanding visibly takes you somewhere new. Only Home
Lab exists so far; a Region without a scene shows Home Lab.

Mock-up checked on 2026-11-04 (project files `overclock-art/bg-homelab-mock.png`):
the scene starts just below the header and shows through slightly
see-through cards. Header and tab bar stay solid so the numbers stay crisp.

## Files

- `icons/bg/<key>.webp`, portrait, about 940 px wide, WebP quality 75
  (Home Lab is in the repo now: `icons/bg/homelab.webp`, ~45 KB or less).
- Keys in `REGION_NAMES` order: homelab, iowa, oregon, frankfurt, tokyo,
  saopaulo, arctic, orbit, lunar, mars.

## Code (in this order, one task each)

1. `data.js`: `BACKGROUNDS`, an array of keys parallel to `REGION_NAMES`
   (`null` where no file exists yet; today only index 0 = 'homelab'), and
   `BG_V = 1`. Test: length matches `REGION_NAMES`, every non-null key has a
   file.
2. `ui.js` (or a tiny `bg.js`): `applyBackground(state)` sets
   `document.body.style.backgroundImage` to
   `url(icons/bg/<key>.webp?v=<BG_V>)` for the current Region index
   (`state.regionsEarned`, clamped), falling back to the last earlier
   Region that has a file, else Home Lab. Called once at start and after
   every Region expansion. Relative path only.
3. `index.html` CSS: `body` keeps `background-color: var(--bg)` and adds
   `background-repeat: no-repeat; background-size: 100% auto;
   background-attachment: fixed; background-position: center 100px;`
   (100 px = the header height). `.gen-card` background becomes
   `rgba(17, 24, 39, 0.80)`. Nothing else changes; header and tab bar stay
   solid.
4. `sw.js`: precache every non-null background with its `?v=`, kept in
   sync by a test like the portrait one.
5. `tools/smoke.js`: on a fresh game, `getComputedStyle(document.body)
   .backgroundImage` contains `homelab.webp`, and the image request
   returned 200.

## Acceptance

- Home Lab shows behind the main rows on a fresh game and a late save;
  text and buttons read as clearly as before.
- Works offline after one online load.
- `tools/release.sh` passes.
- Adding a scene later: drop `icons/bg/<key>.webp`, put the key in
  `BACKGROUNDS`, bump `BG_V`, release.

## Fix 1 (2026-11-04): faded rows let the scene show through

Owner's screenshot (Upgrades, Managers): hired managers look washed out
with the Home Lab picture showing through them, while locked managers
("Need Orbital Compute Ring") look brighter than the ones you own.
Cause: `.up-row.dim { opacity: 0.55 }` fades the whole card, including its
background, so the scene shows through; and locked rows aren't dimmed at all.

One small task, `index.html` CSS plus two lines in `ui.js`:

- Fade the row's contents, not its card: replace `.up-row.dim { opacity:
  0.55 }` with `.up-row.dim > * { opacity: 0.55 }`, so every row keeps a
  solid card background. This applies to every list that uses `dim`
  (upgrades and managers).
- Managers: a row is `dim` when hired **or** when its tier isn't owned yet
  (the "Need …" rows). Only rows you can act on (hire now, or save up
  for) stay bright.
- Hired rows show a small green check and "Hired" in place of the
  disabled button (like owned upgrades), so they read as done, not broken.
- Smoke: on the late save, Managers shows at least one hired row whose
  computed card background alpha is 1.
