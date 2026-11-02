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
