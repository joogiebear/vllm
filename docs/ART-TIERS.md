# Machine icons on the main rows

Status: DRAFT, waiting on the owner's "go". Design owner: thread Claude.
Builder: desktop RC, with Qwen writing all code in small tasks. Same pattern
as docs/ART-PORTRAITS.md, so reuse that code shape.

## Art (done)

- 12 machine icons drawn by the owner on 2026-11-04, masters in the project
  files under `overclock-art/tiers/`.
- Game files already in the repo: `icons/tiers/<id>.webp`, 192 x 192,
  trimmed with the same 4% margin, WebP quality 80.

## Where they show

Only inside the round run button on each main game row (`.gen-icon`, 56 px).
The button keeps its tier-colour ring: it is the thing you tap, and the ring
is how a player finds it. The art replaces the 24 px SVG inside it and
sits at 44 px, centred, with the count pill and manager badge unchanged on
top. Everywhere else that uses `icon(id)` (upgrades, achievements, stats)
keeps the SVG for now.

## Code (in this order, one task each)

1. `data.js`: `TIER_ART`, the list of tier ids with a file, and
   `TIER_ART_V = 1`. Test: every id is a tier id and every file exists.
2. `icons.js`: `tierArt(id, size)` returns an `img` (`src =
   icons/tiers/<id>.webp?v=<TIER_ART_V>`, `alt=""`, `decoding="async"`,
   `width`/`height` = size, `objectFit: contain`, `pointer-events: none`) when
   `id` is in `TIER_ART`, else `icon(id, size)`. Relative path only.
3. `ui.js` line ~181: the gen card uses `tierArt(g.id, 44)` instead of
   `tierIcon(g.id, 24)`, keeping the absolute centring. A locked row's
   `opacity: 0.5` still applies.
4. `sw.js`: precache `icons/tiers/<id>.webp?v=` for every id, kept in sync
   with `TIER_ART` by a test like `test/sw-portraits.test.js`.
5. `tools/smoke.js`: on a fresh game, the Pi run button holds an `img` that
   loaded (`naturalWidth > 0`), and tapping it still starts the bar.

## Acceptance

- Main rows show the 12 machines inside their round buttons; tapping works
  exactly as before (the image never swallows the tap).
- Works offline after one online load.
- `tools/release.sh` passes.

## Known follow-up

The Raspberry Pi art shows the Raspberry Pi raspberry logo, a trademark.
Fine for testing; replace it with a logo-free version before any store
release (prompt in the project files, "no logos").
