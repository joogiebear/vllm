# DECISIONS

Choices for things the design leaves unspecified. All are the simplest option.

## Tick order

- Internal order per tick (actions first, as specified): (1) level timer, (2) arrivals,
  (3) queued-patience decay, (4) GPU progress. Consequences: a request loses one tick of
  patience on its arrival tick, and a cache-miss stall starts on the assign tick.
- `step()` always clears `state.events`, increments `state.tick`, and applies actions even
  in `upgrade`/`over` phases; `simulateTick` runs only in `playing`, so those phases freeze
  the world (patience, heat, timers all hold).

## RNG

- Draw order per arrival: prefix, then tokens, then VIP (VIP only drawn from level 2).
  A dropped arrival (queue full) consumes no draws.
- Upgrade offers: Fisher-Yates shuffle of the 7 upgrade ids with the game RNG, first three
  taken.

## Requests and queue

- The queue is single and shared; one arrival timer counts down in seconds and resets to
  the current level's interval on every arrival or drop.
- Evicted requests keep `done` but have `stall`/`cacheHit` reset: if re-assigned to a GPU
  whose `active` prefix no longer matches, they stall again.
- The `patience` upgrade applies to VIPs too: `maxPatience = (vip ? 8 : 14) + 3 * level`.

## GPU

- Boost: +25 heat applied immediately on the action, not spread over the 4 s.
- Boost duration: the timer decays 1/30 s per tick; by floating-point accumulation it is
  still > 0 after exactly 120 ticks, so a boost is active for exactly 120 ticks (4.0 s)
  and expires on tick 121.
- Throttle: the `heat >= 100` check runs after the per-tick heat update (gain and loss),
  so entry only happens through the clamp; release at `heat <= 60` (hysteresis).
- A stalled slot counts as occupied (per design); it still generates heat and blocks
  nothing else.

## Scoring and reputation

- Multiplier is tracked in tenths (`Math.round(multiplier * 10)`) to avoid float drift;
  points = `tokens * (vip ? 2 : 1) * tenths / 10`, so scores are exact to one decimal.
- VIP finish +1 reputation is clamped at the max (10).
- The `slots` upgrade is a no-op (no level gained) once GPUs have 6 slots.
- The `queue` upgrade has no cap (queue capacity +2 per level).

## Events

- In addition to the design's examples (`served`, `dropped`, `timeout`), the sim emits
  `assign`, `evict`, `boost`, `throttle`, `upgrade`, `gameOver`.

## UI (M2)

- The game starts in `playing` immediately on load (no title screen until M3); the seed
  is a fixed constant (1337) in main.js so a run is reproducible.
- Pause is view-level (`ui.paused`): the step loop stops and the world freezes; queued
  actions apply on the first tick after resume. `P` toggles pause, `M` toggles mute
  (audio itself is M3).
- The canvas is sized to the largest 960x600 rectangle that fits the window (letterboxed
  by the page background); pointer coordinates map from the canvas bounding box straight
  into logical space.
- Queue card keys: `1`-`9` select cards 1-9 and `0` selects card 10 (the design's
  `1`-`8` extended for queue upgrades).
- Slot keys on a filled slot evict, mirroring the tap behavior; on an empty slot they
  assign the selected card.
- The `upgrade` phase draws the three offers as clickable cards over the frozen scene;
  the `over` phase draws "GAME OVER" and the score (full screens are M3).
- main.js exposes `window.__overclock = { state, ui }` only when the page is
  loaded with a `?debug` query parameter (browser testing hook; inert in
  normal play).

## UI (M3)

- The page opens on a title screen (name, how-to-play, best score); any tap or
  key starts a run, and any tap or key on the game-over screen restarts.
- The seed is a fresh 32-bit random value generated in main.js per run;
  `?seed=N` forces a seed. `?debug` now also exposes `ui` and `best`.
- The sim now emits the `assign` event the Events section above already states
  (it was documented but missing); invalid assigns emit nothing. No rule
  changed.
- Best score is stored in `localStorage` under `overclock-best` (the only
  localStorage use), wrapped in try/catch so private mode degrades to no
  persistence.
- The page auto-pauses when hidden (visibilitychange); on becoming visible the
  frame clock is reset so a backgrounded run neither loses nor gains time.
- Effects (floating score numbers, finish particles, timeout shake and red
  flash, throttled panel flicker and red pulse, scanlines) are renderer view
  state fed from `state.events` via `ingestEvents()`; they never write back to
  the sim.
- Audio (WebAudio, synthesised) unlocks on the first pointer or key gesture;
  `M` mutes by checking `ui.muted` on every play.

## Balance (M3)

`tools/balance.js` plays the sim headlessly with two bots over 200 seeds each:
`idle` (never acts; freezes in the upgrade phase after level 1) and `greedy`
(each tick: most-urgent queued request to a free slot, preferring a GPU whose
active prefix matches, otherwise the coolest GPU; avoids throttled or >85-heat
GPUs when another option exists; takes the first offered upgrade; runs to game
over or level 30).

Targets: idle loses in level 1–2; greedy median between level 5 and 9 with the
game clearly getting harder. Before tuning, the greedy bot reached level 30
(the cap) in all 200 seeds, so the difficulty curve was flattened by the
0.7 s arrival floor. CONFIG-only changes (no rule changes):

| CONFIG key | before | after |
| --- | --- | --- |
| `arrivalIntervalStep` | 0.25 | 0.4 |
| `minArrivalInterval` | 0.7 | 0.3 |
| `maxPatience` | 14 | 11 |
| `vipPatience` | 8 | 6 |

Results (200 seeds, `node tools/balance.js`):

| bot | level median | level p90 | score median | score p90 |
| --- | --- | --- | --- | --- |
| idle (before) | 1 | 1 | 0 | 0 |
| idle (after) | 1 | 1 | 0 | 0 |
| greedy (before) | 30 | 30 | 519549.8 | 527327.6 |
| greedy (after) | 7 | 7 | 71939.9 | 82182.7 |

Arrival interval now falls 2.6 s → 0.3 s over levels 1–7, so the game clearly
gets harder; the prefix pool growth (C at level 2, D at level 3) and VIPs add
pressure on top. The `patience` upgrade test and the CONFIG test were updated
for the new 11/6 values; no other test hard-coded a changed number.

## Balance (idle)

`tools/idle-balance.js` plays the idle game headlessly with the design's bot
(best output-per-cost, every affordable upgrade, no clicks, no overclock,
prestige at `max(1, 0.5 * weights)`).

Targets: first generator under 30 s (20 clicks at start); second generator tier
unlocked under 3 minutes; first prestige available in 20–60 minutes.

Before tuning, the bot's pre-prestige `totalLifetime` crossed 1,000,000 at
about 5 min 50 s, so the first prestige landed far too early. The bot's
pre-prestige curve (1 s steps, no prestige): 300 s → 3.5e5, 360 s → 1.2e6,
600 s → 8.3e7, 1200 s → 3.0e11, 1800 s → 1.4e13, 3600 s → 1.0e14.

| data.js constant | before | after |
| --- | --- | --- |
| `PRESTIGE_DIVISOR` | 1,000,000 | 10,000,000,000,000 |

With the new divisor the first weight requires 10,000,000,000,000 of
`totalLifetime`, which the bot reaches between 25 and 30 minutes; the other two
targets are unaffected. The formula in `docs/IDLE-DESIGN.md` was updated to the
new number; no test hard-codes `PRESTIGE_DIVISOR`.

## 2026-11-03 — Prestige divisor 1e13 -> 1e11

| data.js constant | before | after |
| --- | --- | --- |
| `PRESTIGE_DIVISOR` | 10,000,000,000,000 | 100,000,000,000 |

The 1e13 divisor made the first reset pay only 1 weight (a 2% bonus), which was
not worth losing a run. At 1e11 the first reset pays 10 weights (a 20% bonus).
The formula in `docs/IDLE-DESIGN.md` and the formula tests in
`test/idle.test.js` were updated to the new number.

## 2026-11-03 — Pacing: play through 4 prestiges, 20–40 min target

`tools/idle-balance.js` now plays through 4 resets instead of stopping at the
first. The bot prestiges at `max(5, 0.5 * weights)` (was `max(1, ...)`) and buys
every weight upgrade it can afford. Targets: first prestige in 20–40 minutes, and
each later run reaching its reset faster than the one before.

| data.js constant | before | after |
| --- | --- | --- |
| `WEIGHT_BONUS_PER_WEIGHT` | 0.02 | 0.1 |
| `warm` cost | 5 | 1 |
| `long` cost | 10 | 15 |
| `distill` value | 0.03 | 0.13 |
| `gamer` baseCost | 110 | 220 |
| `workstation` baseCost | 1,200 | 2,400 |
| `rack` baseCost | 13,000 | 26,000 |

Before tuning the first prestige landed at 17m32s (too early) and run durations
were roughly constant (~22–24 min). The 0.02 per-weight bonus was too small to
make later runs meaningfully faster, and the bot was dumping its weights on the
fixed 1.25x `warm` and the non-production `long`, leaving nothing for the
per-weight bonus.

- Per-weight bonus raised to 0.1 so each extra weight is 5x more valuable and
  later runs accelerate.
- `warm` lowered to 1 so the bot keeps weights for the per-weight bonus instead
  of the fixed cache rate.
- `long` raised to 15 so the offline-cap upgrade is unaffordable in run 4 and the
  bot cannot dump all its weights on a non-production upgrade.
- `gamer`/`workstation`/`rack` base costs raised to slow early-run token
  generation, pushing the first prestige from 17m32s into the 20–40 min window.
- `distill` raised to 0.13 because `weightBonusPer` replaces (not adds to) the
  base bonus; at the old 0.03 it would have lowered the bonus below the new 0.1
  base. (The bot does not buy distill in the first 4 runs — cost 50.)

Result: first prestige 21m3s; run durations strictly decreasing:
26m14s > 23m22s > 17m10s > 14m37s.

Bug fix (not a data.js tuning): `buyWeightUpgrade` now grants the seed's 1,000
tokens immediately, so the run that buys the seed can continue. Previously the
seed's tokens were only granted at `prestige()` time, which deadlocked the run
that bought it (the bot was stuck at 0 tokens in run 2). This aligns the code
with the design's "Start **each** run with 1,000 tokens".

The tables in `docs/IDLE-DESIGN.md` and the tests in `test/idle.test.js` were
updated to match the new numbers.
