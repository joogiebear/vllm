# Stability: smoke test, offline play, save backups

Status: APPROVED (owner chose "Stability first", 2026-11-03). Design owner:
thread Claude. Builder: desktop RC, with Qwen writing all code in small tasks
(see the build rules in ART-DESIGN.md).

Why: the worst problems on 2026-11-03 were not design. Two broken loads (an
absolute script path, then a moved import) and the Max lag each reached the
owner's phone. Earlier, a save dropped achievements on reload. These three
pieces stop that class of problem.

## 1. Release gate: smoke test before every push

`tools/smoke.js` (Node, using the Playwright already on the build box) plus
`tools/release.sh`, which runs, in order, and stops at the first failure:

1. `sh tools/stamp.sh`
2. `node --test`
3. the import check (already added)
4. `node tools/smoke.js`
5. `git push`

Nothing reaches GitHub Pages unless all four checks pass. Pushing by hand
without `release.sh` is not allowed for game code.

`smoke.js`:

- Starts a small static server (Node `http`, no new dependency) that serves
  the repo under `/vllm/`, exactly like Pages. This is what catches absolute
  paths.
- Phone viewport 390 x 844. Fails on any `pageerror`, any `console.error`,
  or any request that returns 404.
- **Fresh game:** empty storage. After load, `#tokens` has text and
  `#gen-cards` has at least one card. Tap the Pi's run button; the bar starts
  filling within 1 s. The first tip appears.
- **Late save:** loads `test/fixtures/late-save.json` (100T tokens, 25 of
  each early tier, one Region, managers hired). Select Max; time 60 animation
  frames and fail if they take over 1.5 s (catches loops like the Max bug).
  Tap Buy on the Pi; tokens go down and the count goes up.
- **Tabs:** open each bottom tab and come back to Game with no error.
- **Offline:** after the first load, set the context offline and reload; the
  game still renders (checks section 2).
- Prints one line per check and exits non-zero on any failure. Target run
  time under 30 s.

## 2. Offline play and instant start

A service worker, `sw.js` at the repo root (scope `/vllm/`), registered from
`app.js` only on `https:` or `localhost`.

- **Versioned files** (any URL with `?v=`, plus `icons/`): cache first. They
  never change once stamped, so this is always safe.
- **Everything else** (`index.html`, `manifest.webmanifest`, `rush.html`):
  network first with a 3 s timeout, falling back to the cache. This way an
  update shows up on the next load when online, and the game still opens with
  no signal.
- Cache name `overclock-<stamp>`. `stamp.sh` writes the release id into
  `sw.js` too, and `activate` deletes every other `overclock-*` cache, so
  old files never pile up.
- `skipWaiting` and `clients.claim`, with no reload prompt: the new version
  applies on the next launch. This keeps it simple and avoids mid-game
  reloads.
- Never cache non-GET requests or other origins.

## 3. Save backups

In `save.js`, on top of the existing main save:

- **Rotation:** at most every 5 minutes of play, and at every prestige and
  Region, copy the current save into backup slots `SAVE_KEY + ':b1'`,
  `':b2'`, `':b3'` (b1 newest). Each slot stores `{ savedAt, lifetime,
  data }`.
- **Automatic fallback:** if the main save fails to parse or migrate,
  `load()` tries b1, then b2, then b3, and the game shows a toast: "Your save
  couldn't be read, so we restored the backup from 10:42." The bad main save
  is kept under the existing corrupt key for diagnosis.
- **Manual restore:** Settings gets a "Backups" section listing the three
  slots (time saved and lifetime tokens). Restore asks for confirmation in an
  in-game card (no `window.confirm`), then loads the slot and reloads the
  view.
- Export and import stay as they are.

Tests (in `node --test`, with a fake `localStorage`): rotation keeps the 3
newest and respects the 5-minute gap; a corrupt main save falls back to b1;
an empty b1 falls back to b2; restore replaces the main save; a prestige
forces a backup.

## Build tasks (one at a time, small)

1. `tools/smoke.js` with the static server and the fresh-game checks.
2. `test/fixtures/late-save.json` and the late-save, Max-timing and tab
   checks in `smoke.js`.
3. `tools/release.sh`.
4. `save.js`: backup rotation and fallback, with tests.
5. Settings "Backups" section and restore card.
6. `sw.js`, its registration in `app.js`, the `stamp.sh` line, and the
   offline check in `smoke.js`.

Tasks 1-3 and 4 touch different files and can run side by side; 5 waits for
4; 6 waits for 1.

## Acceptance

- `tools/release.sh` refuses to push when a check fails. Verify by breaking
  a script path on a scratch branch and seeing the smoke test fail.
- On the owner's iPhone: after one online load, the game opens in airplane
  mode.
- Settings shows three backups after about 15 minutes of play, and restoring
  one works.
