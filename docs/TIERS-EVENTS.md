# Tiers 9 to 12 and timed events

## New tiers

Same pattern as the first eight: cost about 15 times the previous tier, output about 6 times, and
cycle time doubled. Append them to GENERATORS and MANAGERS in data.js.

| Id | Name | Base cost | Tokens/s | Cycle s | Manager | Manager cost |
| --- | --- | ---: | ---: | ---: | --- | ---: |
| `orbital` | Orbital Compute Ring | 8e9 | 1.5e6 | 384 | Orbit Ops | 4e12 |
| `lunar` | Lunar Datacenter | 1.3e11 | 9e6 | 768 | Lunar Admin | 8e13 |
| `matrioshka` | Matrioshka Brain | 2.2e12 | 5.4e7 | 1536 | Brain Warden | 1.6e15 |
| `singularity` | Inference Singularity | 4e13 | 3.3e8 | 3072 | Event Horizon | 3.2e16 |

Tier colours, continuing the existing ones: `#f56565`, `#ed64a6`, `#9f7aea`, `#e2e8f0`.
Achievements are generated per generator, so the owned-count achievements grow from 32 to 48
automatically. Old saves gain the new tiers at 0 owned. Add one production upgrade per new tier,
"x3 <Name> output", costing 50 times the tier's base cost.

## Timed events

Short bonuses that reward checking in. They never spawn offline, and one exists at a time.

- **Spawning.** `state.nextEventIn` counts down in game seconds, starting at 120. When it reaches
  0, an offer appears and the next delay is drawn between 180 and 360 seconds. Randomness comes
  from a mulberry32 generator whose state is `state.rng`, seeded once at createState from a fixed
  constant and migrated in old saves, so core stays pure.
- **Offer.** `state.eventOffer = {kind, claimBy}`. It must be tapped within 20 seconds or it
  vanishes.
- **Kinds**, drawn with equal odds:
  - `spike`, "Traffic spike": production x3 for 30 seconds.
  - `turbo`, "Turbo clocks": every cycle runs 2 times as fast for 30 seconds.
  - `windfall`, "Enterprise contract": instantly pays 180 seconds of the current tokensPerSecond.
- **Claiming.** `claimEvent(state)` returns the kind or null. Timed kinds set
  `state.eventActive = {kind, remaining}`. Spike multiplies tokensPerSecond, and so the cycle payout.
  Turbo halves the effective cycle time in tick. If a new offer is claimed while one is active,
  it replaces it.
- **Offline.** applyOffline clears the offer and the active event and does not count down
  `nextEventIn`.
- **Stats and achievements.** Count `stats.eventsClaimed`. Add achievements for claiming 1 and
  25 events.

## Event UI

A banner card at the top of the Game tab, above the generator cards, only while an offer exists:
title, one line of effect, a draining bar for the 20 seconds, and a "Claim" button. While a timed
event runs, a small chip in the header shows "x3 · 0:24" or "Turbo · 0:24". Play the
'achievement' sound on claim. Respect reduce motion: no pulsing then.

## Tests

The new tiers' cost, output and managers; migration adds tiers at 0. Events: the first offer at
120 seconds, the gap stays within 180 to 360, an offer expires after 20 seconds, claiming each
kind has the right effect and duration, spike and turbo end on time, nothing spawns or counts down
offline, RNG determinism, and the new achievements.
