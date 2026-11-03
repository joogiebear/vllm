# Manager portraits

Status: APPROVED by the owner ("Go", 2026-11-03 23:46 UTC). The 12 WebP
files are already in `icons/managers/`; start at code task 1. Design owner: thread Claude.
Builder: desktop RC, with Qwen writing all code in small tasks (rules in
ART-DESIGN.md). Art: drawn by the owner from the prompts in
`docs/ART-MANAGERS.md` and the final list in the project files.

## What changes

Each manager gets a cartoon portrait in place of the person silhouette in
the Managers list. A manager without a portrait file keeps today's SVG icon,
so the set can ship before all 12 exist.

## Art (settled, do not change)

- One portrait per tier id, main colour = that tier's colour in
  `TIER_COLORS`. **Driver Daemon (`gamer`) is blue #63b3ed with a hot pink
  accent**, matching its ring. The purple hard-hat bot is Build Bot
  (`workstation`).
- Received 2026-11-03, all 12: pi (v1), gamer, workstation, rack, cluster, datacenter,
  campus, swarm, orbital, lunar, matrioshka, singularity.
  Masters live in the project files under `overclock-art/` (not in the repo).

## Files

- `icons/managers/<id>.webp`, one per tier id that has art.
- DONE (thread Claude, 2026-11-03): all 12 in the repo, 15-21 KB each,
  219 KB total. How they were made, for future redos (no script in the repo):
  trim to the solid outline (alpha > 200, ignoring faint stray pixels), pad
  to a square so the character fills about 88% of the width, scale to
  256 x 256, WebP quality 80.
- Same margin on every portrait so they look the same size in the frame.

## Code (in this order, one task each)

1. `data.js`: `PORTRAITS`, a plain array of tier ids that have a file, and
   `PORTRAIT_V`, a number bumped whenever any portrait file changes. Test:
   every id in `PORTRAITS` is a tier id, and every listed file exists on
   disk (the test reads the folder). Never reference a file that isn't
   listed: the smoke test fails on any 404.
2. `icons.js`: `managerIcon(genId, size)` returns, when `genId` is in
   `PORTRAITS`, a `span.portrait` of `size` px: round, `overflow: hidden`,
   background `#151c2b`, a 2 px ring in the tier colour, holding an `img`
   with `src = icons/managers/<id>.webp?v=<PORTRAIT_V>`, `alt=""`,
   `decoding="async"`, filling the circle. Otherwise the current SVG,
   unchanged. Relative path only (the game is served under `/vllm/`).
3. `ui.js`: the Managers list uses `managerIcon(m.id, 56)` instead of 32, and
   the row keeps its height steady (no jump when the image loads: the span
   has fixed width and height).
4. `sw.js`: portraits are cache-first like other versioned files, and the
   install step also caches every `icons/managers/<id>.webp?v=` in
   `PORTRAITS`, so they show offline after the first load.
5. `tools/smoke.js`: on the late save, open Managers and check that the Pi
   row shows an `img` that finished loading (`naturalWidth > 0`).

Not in this pass: the small hired-manager badge on the main game rows
(18 px is too small for a face; keep the glyph), any hire animation, and
background scenes.

## Acceptance

- Managers list on the phone shows all 12 portraits in their tier rings.
- Replacing a portrait later is: drop in the new WebP,
  bump `PORTRAIT_V`, release.
- Offline after one online load: portraits still show.
- `tools/release.sh` passes.
