# OVERCLOCK: design

A browser arcade game. You are the scheduler on an overloaded AI inference server. Requests
pour in, and you slot them onto two GPUs before their users give up. Batch cleverly, reuse the
cache, and keep the silicon from cooking.

Implement exactly what this document says. If something is unspecified, choose the simplest
option and record it in `docs/DECISIONS.md`.

## Hard rules

- Plain ES modules, HTML, CSS and Canvas 2D. No dependencies, no build step, no `package.json`
  dependencies, no network requests, no external fonts or images.
- Must run from any static file server, so it can be hosted on GitHub Pages. All paths relative.
- `src/sim.js` must not touch the DOM, canvas, audio, `Date`, `performance` or `Math.random`.
- Tests run with `node --test test/` using only Node built-ins.

## Files

| File | Responsibility |
| --- | --- |
| `index.html` | Canvas, loads `src/main.js` as a module |
| `src/sim.js` | All game rules. Pure and deterministic |
| `src/render.js` | Draws a state to the canvas. Never changes game state |
| `src/input.js` | Turns mouse, touch and keys into actions |
| `src/audio.js` | Sound effects synthesised with WebAudio |
| `src/main.js` | Fixed-step loop, screens, wires everything together |
| `test/sim.test.js` | Rule tests |

## Simulation API (`src/sim.js`)

```js
export function createGame(seed)            // returns a plain JSON-serialisable state
export function step(state, actions)        // advances exactly one tick, mutates and returns state
export const TICK_SECONDS = 1 / 30
```

`actions` is an array applied in order at the start of the tick:

- `{type:'assign', requestId, gpu, slot}`
- `{type:'evict', gpu, slot}`
- `{type:'boost', gpu}`
- `{type:'upgrade', choice}` where `choice` is 0, 1 or 2

Invalid actions are ignored and never throw. Randomness comes only from a mulberry32 generator
whose 32-bit state is stored in `state.rng`. Identical seed and actions must give an identical
state. `state.events` is cleared at the start of each step and receives objects such as
`{type:'served', requestId, points}` that the renderer and audio read.

## Rules

All numbers below live in one exported `CONFIG` object.

### Requests

Each request has `id`, `prefix`, `tokens`, `done` (starts at 0), `patience`, `maxPatience`, and
`vip` (boolean).

- `prefix` is one of `A B C D`. In level 1 only `A` and `B` occur, level 2 adds `C`, level 3 adds `D`.
- `tokens` is a uniform integer from 40 to 160.
- `maxPatience` is 11 seconds, or 6 seconds for a VIP.
- Each arrival has a 10% chance of being a VIP, starting at level 2.
- The queue holds at most 8 requests. An arrival that finds the queue full is dropped and costs
  1 reputation, with event `dropped`.
- Patience falls only while a request is queued. At 0 it leaves, costing 1 reputation, or 2 for
  a VIP, with event `timeout`.

### Arrivals and levels

- A level lasts 45 seconds.
- Seconds between arrivals: `max(0.3, 2.6 - 0.4 * (level - 1))`, the same for both GPUs' queue.
- When a level's timer ends the game pauses in phase `upgrade` until an `upgrade` action arrives.
  While in that phase, ticks change nothing except that invalid actions are ignored.

### GPUs

There are 2 GPUs, each with 4 slots, an `active` cached prefix (null at start), and `heat` from 0 to 100.

- Throughput is shared by the occupied slots. Total tokens per second on a GPU is
  `60 * (1 + 0.35 * (occupied - 1))`, divided equally among occupied slots.
- **Cache:** when a request is assigned to a GPU whose `active` prefix matches, it runs 1.5 times
  as fast for its whole run. Otherwise it costs a 1.0 second stall in its slot before making
  progress, and `active` becomes that prefix. A stalled slot still counts as occupied.
- **Heat:** per second, gains `5 * occupied` and loses 9. Clamped to 0 to 100.
- **Throttle:** at heat 100 the GPU enters `throttled`. It runs at 25% speed until heat falls to 60.
- **Boost:** doubles the GPU's speed for 4 seconds and adds 25 heat. Cooldown 12 seconds per GPU.
  It is ignored while throttled or on cooldown.
- **Evict:** removes a request from a slot and returns it to the back of the queue with its
  progress kept. Ignored if the queue is full.

### Scoring

Finishing a request gives `tokens` points, times 2 for a VIP, times the current multiplier.

- The multiplier starts at 1. Each finish adds 0.1, up to 3.0.
- Any `timeout` or `dropped` resets it to 1.

### Reputation

Starts at 10, maximum 10. A finished VIP gives +1. At 0 the phase becomes `over`.

### Upgrades

At the end of each level, offer 3 different upgrades chosen by the RNG from this list. Store them
in `state.offer`. Each may be taken any number of times unless noted.

| Id | Effect |
| --- | --- |
| `slots` | Each GPU gains 1 slot, maximum 6 |
| `cooling` | Heat loss +3 per second |
| `throughput` | Base 60 becomes 15 higher |
| `patience` | `maxPatience` of new requests +3 seconds |
| `queue` | Queue capacity +2 |
| `reputation` | Restore 3 reputation |
| `boost` | Boost cooldown -3 seconds, minimum 4 |

## Screen

Canvas is a fixed logical 960 by 600, scaled to fit the window with letterboxing and correct for
device pixel ratio.

- **Top bar:** score, multiplier, level, level timer, 10 reputation pips.
- **Left column:** the queue as stacked cards. Colour shows prefix, a bar shows patience, and the
  number shows tokens. VIP cards have a gold border.
- **Right:** two GPU panels, each with slot boxes with a progress bar, a heat bar that shifts from
  cyan to red, the active prefix badge, and a boost button with its cooldown.
- **Style:** near-black background, neon cyan, magenta, lime and amber prefix colours, monospace
  system font, subtle scanlines, glow using `shadowBlur`.
- **Effects:** floating score numbers, particles on a finish, screen shake on a timeout, panel
  flicker and red pulse while throttled. Effects belong to the renderer and must not affect the sim.

## Controls

- Mouse or touch: drag a card to a slot, or tap a card and then tap a slot.
- Tap a filled slot to evict it. Tap a boost button to boost.
- Keys: `1`-`8` select a queue card, `Q W E R` and `A S D F` choose slots on GPU 1 and GPU 2,
  `Z` and `X` boost, `P` pauses, `M` mutes. `1 2 3` choose an upgrade on that screen.

## Screens

Title (with how to play and best score), playing, paused, upgrade choice, game over (score, level,
requests served, best score). The best score is the only thing in `localStorage`, wrapped in
try/catch. Audio starts only after the first user gesture.

## Sound

Short synthesised effects for assign, finish, VIP finish, timeout, throttle, boost and upgrade.
Mute is respected.

## Definition of done per milestone

- **M1:** `src/sim.js` and `test/sim.test.js`. Tests cover determinism, cache hit and stall, heat
  and throttle hysteresis, boost cooldown, timeout, full queue, multiplier reset, invalid actions,
  upgrades and game over. All pass.
- **M2:** `index.html`, `render.js`, `input.js`, `main.js`. The game is fully playable with mouse,
  touch and keys, and no console errors.
- **M3:** upgrade screen, title and game over screens, audio, effects, `README.md`.
