# Late game: something new in every Region

Status: APPROVED by the owner ("build it", 2026-11-03 20:41 UTC). Design owner: thread Claude.
Builder: desktop RC, with Qwen writing all code in small tasks.

## What the data says (docs/BALANCE-REPORT.md, 2026-11-03)

- All 12 tiers are owned before the first Region (Inference Singularity at
  about 2h 15m). After that nothing new ever appears.
- Regions snowball: the requirement is `floor(sqrt(weightsEverEarned /
  4000))`, a curve that grows slower than production does once each Region
  doubles output. Regions 5-8 landed at the same moment, then 9-12. The run
  "ended" at 12 Regions in 11h 20m.
- The first Region now comes at 2h 15m, under the approved 3-5 h.
- No stalls, but owned counts sit around 150-230 per tier in every Region,
  so later Regions are repeats.

Goal: every Region gives the player something new to unlock and a reason to
push further, and the pace stays steady (a few hours per Region) instead of
collapsing.

## 1. Unlock the top tiers through Regions

Tiers 1-8 work as now. Tiers 9-12 need Regions earned:

| Tier | Unlocks at | Region name then |
| --- | --- | --- |
| Orbital Compute Ring | 1 Region | Iowa |
| Lunar Datacenter | 3 Regions | Frankfurt |
| Matrioshka Brain | 5 Regions | São Paulo |
| Inference Singularity | 8 Regions | Lunar Base |

- A locked row shows its icon dimmed and "Unlocks at Frankfurt (3 Regions)"
  instead of a Buy button. Only the next locked tier is shown, so the list
  doesn't fill with locked rows.
- Their managers and their x3 upgrades follow the same gate.
- Existing saves keep everything they already own (nothing is taken away).
  A row the player already owns stays usable even if its gate isn't met.

## 2. One Region at a time, with a rising cost

Replace the sqrt formula with a per-Region target:

- Expanding needs **Weights earned since the last expansion** to reach
  `REGION_BASE * REGION_GROWTH ^ regionsEarned`.
- Start with `REGION_BASE = 4000` and `REGION_GROWTH = 1.6`, then let the
  bot tune both (section 5).
- Never more than one Region available at a time. The Regions view shows a
  progress bar to the next one ("2,140 / 6,400 Weights").
- The x2 production per Region stays: it is the reward players feel. The
  rising cost is what keeps it from running away.
- Migration: a save keeps its `regionsEarned`; Weights earned since the last
  expansion start from the save's current Weights.

## 3. Bigger milestones past 200 owned

Today milestones at 25, 50, 100, 200 and 400 owned halve the cycle time.
Most rows are already near-continuous by 200, so more speed adds little.
Add payout milestones per tier:

| Owned | Reward |
| --- | --- |
| 300 | x2 payout |
| 500 | x3 payout |
| 750 | x3 payout |
| 1000 | x5 payout |

And global milestones when **every unlocked tier** reaches a count:

| All tiers at | Reward |
| --- | --- |
| 100 | x2 all production |
| 250 | x3 all production |
| 500 | x5 all production |

- The row's milestone text shows whichever reward is next
  ("x2 payout at 300").
- A global milestone line sits at the top of the Upgrades list
  ("All tiers at 250: x3 production. Lowest now: Lunar 212").
- New achievements for the first 500 and 1000 of any tier and for each
  global milestone, +1% each like the others.

## 4. A second round of upgrades

After 2 Regions, a second x5 output upgrade appears for each of the 12 tiers
(for tiers 9-12, only once the tier itself is unlocked). Price: 1,000 times
that tier's x3 upgrade. They reset on prestige like other upgrades, so Buy
All and Auto-Procure handle them.

## 5. Balance targets (checked by the late-game bot)

`node tools/idle-balance.js --late` must report:

- First Region in 3-5 h.
- Every later Region takes 2-5 h, never 0 (no two Regions in the same
  minute).
- Inference Singularity first owned around Region 8, roughly 20-35 h in.
- 10 Regions in roughly 30-50 h.
- Owned counts on tiers 1-4 reach 500+ by Region 10, so the new milestones
  are actually hit.
- No stall over 20 minutes.

The bot tunes `REGION_BASE`, `REGION_GROWTH` and the x5 upgrade prices to hit
these, and the report lists the final values.

## Out of scope for now

Weekly challenges (need a fair, date-based design and are better after the
app build), new tiers past 12, and any change to the Shop.

## Build tasks (small, one change each)

1. `data.js`: tier gate table, payout and global milestone tables, the 12
   x5 upgrades, `REGION_BASE` and `REGION_GROWTH`. No behaviour yet. Tests
   that the tables are well formed.
2. `core.js`: tier gating in `buy`, managers and upgrades, with tests
   (including "already owned stays usable").
3. `core.js`: per-Region requirement and one-at-a-time rule, plus save
   migration, with tests.
4. `core.js`: payout and global milestone multipliers in the production
   formula, with tests.
5. `ui.js`: locked next-tier row and milestone text.
6. `ui.js`: Regions progress bar and the global milestone line.
7. `achievements` data for the new milestones.
8. Bot: run `--late`, tune the constants, update `docs/BALANCE-REPORT.md`.

Tasks 2-4 touch `core.js` and go one at a time; 5-6 go after 2-4; 7 can run
beside them.

## Fix 1 (2026-11-04): don't show the locked tier too early

Found on the live site: a brand-new game shows "Orbital Compute Ring,
Unlocks at Iowa (1 Region)" right under the Gaming GPU, before tiers 3-8
exist. Section 1 meant "the next locked tier is shown once you reach it".

One small task, `ui.js` visibility rule only (around `nextLocked`): a
Region-locked row is visible only when the tier just before it in
`GENERATORS` is owned (owned > 0). Everything else stays as is. Test with
the smoke test's fresh game (no Orbital row) and late save (unchanged).

## Fix 2 (2026-11-04): the way to Regions must always be visible

Owner's phone screenshot (14:22 UTC, 1.0Q tokens, +5317% Weights bonus):
the Prestige tab shows only the "Weights" segment, so there is no sign of
Regions at all, and the Weight upgrades read "×1000", "×0.75", "×true".
Separate from the readability fix (solid panels behind progress text),
which is already being built.

Two small tasks, one at a time:

1. `ui.js` `updatePrestigeSeg`: the Regions segment shows when
   `regionsEarned > 0` **or** `weightsEverEarned >= REGION_UNLOCK_WEIGHTS`.
   Before that, the Weights view gets one line under the prestige hint:
   "Regions unlock at 2,000 Weights earned in total (you have 1,240)."
   Test: a state with `regionsEarned: 1, weightsEverEarned: 0` shows the
   segment; a fresh state shows the line instead.
2. `ui.js` `WU_WORDS`: plain words for every Weight upgrade, keyed by the
   real ids in `WEIGHT_UPGRADES`, and never fall back to `×${value}`
   (fall back to the upgrade name instead):
   - seed: "Start each run with 1,000 tokens"
   - night: "Earn 75% while away (was 50%)" (check the real base rate)
   - warm: "+25% cache rate"
   - procure: "Adds the Buy All button"
   - long: "Offline earnings cap 24 h"
   - auto: "Start each run with the Cron Job hired"
   - distill: "+13% bonus per Weight"
   Test: every `WEIGHT_UPGRADES` id has an entry.

## Fix 3 (2026-11-04): Regions always on screen

Owner, 14:48 UTC: "I still do not clearly see a regions button. If this
is a game, things clearly need to be shown on screen and not hidden behind
something that only we know." Rule for the whole game from now on: every
progression layer is visible from the start, shown as locked with what it
takes, never hidden until a threshold.

The owner's save is still below 2,000 total Weights, so fix 2's change
(show the segment for saves that already passed it) doesn't reach it.

Three small tasks, in order (after the upgrade-labels task in fix 2):

1. **Regions segment always visible** (`ui.js` `updatePrestigeSeg`, drop
   the `hidden` rule). Before `REGION_UNLOCK_WEIGHTS` total Weights, the
   Regions view shows a locked card instead of the Expand button:
   "Regions: open at 2,000 Weights earned in total (you have 409, 20%).
   Each Region doubles all production and unlocks new machines." with the
   same progress bar style. Remove the auto-switch back to Weights.
2. **Goal strip on the Game tab** (`index.html` + `ui.js`): one slim
   solid bar (36 px, card colour, rounded) just below the header, above
   the rows, tappable, opens Prestige on the Regions segment. Text, by
   state:
   - no Weights earned yet: "Next goal: Prestige for your first Weight
     (Prestige tab)" with the lifetime-to-first-Weight progress.
   - Regions not open yet: "Regions open at 2,000 Weights: 409 / 2,000"
     with bar.
   - Regions open: "Next Region (Iowa): 2,700 / 26,000 Weights" with bar.
   - Region ready: gold strip, "Region ready: tap to expand to Iowa".
   Updates at most once a second. Never hidden.
3. **Smoke checks:** a fresh game shows the goal strip and the Regions
   segment (locked card); tapping the strip lands on Prestige → Regions.
