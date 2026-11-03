# OVERCLOCK Idle: design

The game becomes an idle game. You grow from one Raspberry Pi to a planet-scale inference empire.
The existing arcade game stays as an optional mode called Rush, which pays a bonus.

Implement exactly what this says. Record open choices in `docs/DECISIONS.md`. The hard rules from
`docs/DESIGN.md` still apply: no dependencies, no build step, no network, relative paths.

## Files

| File | Responsibility |
| --- | --- |
| `index.html` | The idle game. DOM and CSS, not canvas |
| `rush.html` | The arcade game: today's `index.html`, moved. `src/main.js`, `sim.js`, `render.js`, `input.js`, `audio.js` stay where they are |
| `src/idle/data.js` | Tables below as exported constants. No logic |
| `src/idle/core.js` | All idle rules. Pure: no DOM, `Date`, `performance`, `localStorage` or `Math.random` |
| `src/idle/save.js` | Save, load, export, import. May use `localStorage`, wrapped in try/catch |
| `src/idle/ui.js` | Renders state to the DOM and turns clicks into core calls |
| `src/idle/app.js` | Main loop and wiring. Only file that reads the clock |
| `test/idle.test.js` | Rule tests |
| `tools/idle-balance.js` | Headless pacing check |

## Core API

```js
createState()                 // plain JSON-serialisable state
tick(state, seconds)          // advance time. Must give the same result, within 0.1%, for one
                              // call of 60 seconds or 600 calls of 0.1 seconds
click(state)                  // manual serve
buy(state, generatorId, n)    // n is a count or 'max'; returns the number bought
buyUpgrade(state, id)         // returns boolean
setOverclock(state, on)
prestige(state)               // returns weights gained, 0 if not allowed
buyWeightUpgrade(state, id)   // returns boolean
applyOffline(state, seconds)  // returns tokens earned
applyRush(state, score, now)  // returns tokens paid; now is a number supplied by the caller
tokensPerSecond(state)        // effective rate right now
cost(state, generatorId, n)   // cost of the next n
weightsAvailable(state)
```

Invalid arguments are ignored and never throw.

## Currency

- **Tokens:** spent on generators and upgrades. Track `tokens` and `lifetime`, which counts all
  tokens earned in this run. Doubles are enough; do not add a big-number library.
- **Weights:** prestige currency, kept across runs.

## Generators

Cost of the next one is `baseCost * 1.15 ^ owned`, rounded up. Base production is per unit per second.

| Id | Name | Base cost | Tokens/s |
| --- | --- | ---: | ---: |
| `pi` | Raspberry Pi | 15 | 1 |
| `gamer` | Gaming GPU | 110 | 8 |
| `workstation` | Workstation | 1,200 | 47 |
| `rack` | Rack Server | 13,000 | 260 |
| `cluster` | GPU Cluster | 140,000 | 1,400 |
| `datacenter` | Datacenter | 2,000,000 | 7,800 |
| `campus` | Fusion Campus | 33,000,000 | 44,000 |
| `swarm` | Dyson Inference Swarm | 510,000,000 | 260,000 |

A generator's output doubles each time its owned count reaches 25, 50, 100, 200 and 400.

A generator is shown once `lifetime` reaches half its base cost.

## Production

`tokensPerSecond = sum(generator output) * (1 + cacheRate) * (1 + 0.02 * weights) * upgradeMultipliers * heatFactor`

`cacheRate` starts at 0 and is raised by upgrades.

A click earns `(1 + clickFlat) + clickShare * tokensPerSecond`. `clickFlat` and `clickShare` start at 0.

## Heat and overclock

- Heat runs from 0 to 100 and starts at 0. Overclock starts off.
- While overclock is on, production is multiplied by 2 and heat rises 2 per second, less `cooling`.
  A rise of 0 or less means it never overheats.
- While overclock is off, heat falls 5 per second.
- At 100 the system becomes `throttled`, overclock turns off, and production is multiplied by 0.5
  until heat falls to 40. Overclock cannot be turned on while throttled.
- `heatFactor` is 2 when overclocked, 0.5 when throttled, and otherwise 1.
- `tick` must handle a long step correctly by splitting it at the moments heat crosses 100 and 40.

## Upgrades

One-time purchases. Each is shown once `lifetime` reaches 25% of its cost.

| Id | Name | Cost | Effect |
| --- | --- | ---: | --- |
| `quant` | Quantization | 100 | Production x1.5 |
| `batch` | Dynamic Batching | 1,000 | Production x2 |
| `prefix1` | Prefix Cache | 5,000 | cacheRate +0.25 |
| `fans` | Bigger Fans | 8,000 | cooling +0.5 |
| `macro` | Keyboard Macro | 500 | clickFlat +4 |
| `api` | Public API | 20,000 | clickShare +0.02 |
| `flash` | Flash Attention | 50,000 | Production x2 |
| `prefix2` | Radix Cache | 250,000 | cacheRate +0.5 |
| `liquid` | Liquid Cooling | 400,000 | cooling +0.75 |
| `spec` | Speculative Decoding | 2,000,000 | Production x3 |
| `api2` | Enterprise Contract | 5,000,000 | clickShare +0.03 |
| `mxfp` | MXFP4 Weights | 40,000,000 | Production x3 |
| `prefix3` | Disaggregated Cache | 200,000,000 | cacheRate +1 |
| `immersion` | Immersion Cooling | 500,000,000 | cooling +1 |
| `custom` | Custom Silicon | 5,000,000,000 | Production x5 |

## Prestige: New Model Generation

- `weightsAvailable = floor(sqrt(totalLifetime / 10,000,000,000,000)) - weightsEarnedThisCycle`,
  where `totalLifetime` is the sum of `lifetime` across every run. Never below 0.
- `prestige` is allowed when `weightsAvailable >= 1`. It adds weights and resets tokens, lifetime,
  generators, upgrades, heat and overclock. Weights, weight upgrades, totalLifetime and rush
  cooldown stay.

Weight upgrades, bought with weights, one-time:

| Id | Name | Cost | Effect |
| --- | --- | ---: | --- |
| `seed` | Seed Funding | 1 | Start each run with 1,000 tokens |
| `night` | Night Shift | 3 | Offline rate 50% becomes 75% |
| `warm` | Warm Cache | 5 | cacheRate +0.25 |
| `long` | Long Weekend | 10 | Offline cap 8 hours becomes 24 |
| `auto` | Autoscaler | 20 | Heat never reaches 100: overclock turns itself off at 95 and back on at 40 |
| `distill` | Knowledge Distillation | 50 | Weight bonus 2% becomes 3% each |

## Offline

`applyOffline` credits `tokensPerSecond * seconds * offlineRate`, with seconds capped at the offline
cap, using production with overclock and throttle ignored. It sets overclock off. Negative or
non-finite seconds earn nothing. The app shows a "while you were away" message when it earns.

## Rush

- A Rush button links to `rush.html`. It is usable when the cooldown has passed: 10 minutes.
- `src/main.js` is changed in one way only: on game over it stores
  `{score, at}` under localStorage key `overclock.rush`. It adds a "Back to the server" link on the
  game over screen.
- On load, `app.js` reads and removes that key, then calls `applyRush`, which pays
  `tokensPerSecond * min(600, score / 50)` tokens, sets the cooldown, and ignores a call while still
  on cooldown. The arcade's rules and balance do not change.

## Save

- Autosave every 15 seconds and on `visibilitychange` to hidden, under `overclock.idle.v1`, with a
  `version` field and a timestamp.
- Load with defaults merged, so future fields do not break old saves. A corrupt save starts a new
  game and keeps the bad text under `overclock.idle.corrupt`.
- Settings panel: export as base64 text, import with validation, hard reset with a two-step confirm.

## Screen

A responsive single page that works at phone width (360px) and desktop.

- **Header:** tokens, tokens per second, weights.
- **Serve button:** large, with floating +N numbers.
- **Heat panel:** bar, overclock toggle.
- **Generators list:** icon-free rows with name, owned, output, next cost, and buy buttons. A x1, x10,
  Max selector applies to all rows. Unaffordable buttons look disabled.
- **Upgrades:** grid of cards with name, effect in words, cost. Purchased ones move to a collapsed list.
- **Prestige:** shows weights available and what resets. Two-step confirm.
- **Rush button and Settings.**

Style matches the arcade: near-black, neon cyan, magenta, lime, amber, system monospace font.
Number format: `1,234`, then `1.23M`, `1.23B`, `1.23T`, `1.23Qa`, `1.23Qi`, then `1.23e21`.

The DOM must update without rebuilding rows on every frame, so buttons stay clickable. Update text at
most 10 times a second. Use `<button>` elements and visible focus styles. Respect
`prefers-reduced-motion`.

## Pacing targets, checked by `tools/idle-balance.js`

A bot buys whatever gives the best output per cost, buys every upgrade it can afford, does not click,
never overclocks, and prestiges when weights available reach `max(1, 0.5 * current weights)`.

- First generator after under 30 seconds of play, given 20 clicks at the start.
- First prestige available: 20 to 60 minutes.
- Second generator tier unlocked in under 3 minutes.

Tune numbers only in `data.js`, and record before and after in `docs/DECISIONS.md`.
