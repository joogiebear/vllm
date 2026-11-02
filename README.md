# OVERCLOCK

A browser arcade game about keeping an overloaded AI inference server alive. You
are the scheduler: inference requests pour in (some are impatient VIPs), and you
slot them onto two GPUs before their users give up. Reuse the prefix cache,
batch cleverly, and keep the silicon from cooking — at heat 100 a GPU throttles
to 25% speed. Every 45-second level ends with a choice of three upgrades.
Reputation is your health: time out too many requests and it's game over.

## How to play

- **Mouse / touch:** drag a queue card onto a slot, or tap a card and then tap a
  slot. Tap a filled slot to evict the request back to the queue. Tap a boost
  button to double a GPU's speed for 4 seconds (it adds heat).
- **Keys:** `1`-`9` (and `0` for card 10) select a queue card; `Q W E R` and
  `A S D F` assign the selected card to slots on GPU 1 and GPU 2 (pressing a
  filled slot evicts it). `Z` and `X` boost the GPUs. `P` pauses, `M` mutes. On
  the upgrade screen, `1 2 3` pick an upgrade.

A request runs 1.5× faster on a GPU whose active prefix matches, but a cache
miss stalls the slot for 1 second. Finishing requests raises your multiplier
(up to 3×); any timeout or dropped arrival resets it.

## Running it locally

There is no build step. Serve the repo from any static file server:

```
python3 -m http.server
```

Then open http://localhost:8000 (or the port it prints). The game works from
any static host, e.g. GitHub Pages.

## Running the tests

```
node --test test/sim.test.js
```

The rule tests are pure Node built-ins; `src/sim.js` is deterministic (no DOM,
no `Date`, no `Math.random`).

A headless balance check (two bots, 200 seeds each) is available at
`node tools/balance.js`.

## How this was made

Designed and reviewed by Claude. All game code was written by Qwen3.8, a local model running on vLLM, through the Hermes agent. See docs/TOKENS.md for token use.
