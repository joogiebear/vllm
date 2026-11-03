# Cycles, managers and the row layout

Approved by the owner on 2026-11-03 (mockup: https://claude.ai/artifact/CBaV79xFx9NbSNy7rvhnyS,
owner's reply "That looks sweet"). This replaces the layout in docs/UX-OVERHAUL.md.
Our own game: borrow the feel of the "business rows" idle genre, not any game's art,
names or text. Theme stays GPUs and servers.

## Rules (src/idle/core.js, src/idle/data.js)

### Cycles
- Each generator runs in cycles. One cycle takes `cycleSeconds` and pays
  `owned * tps * cycleSeconds * multipliers` in one lump at the end.
- Base cycle times: pi 7, gamer 3, workstation 6, rack 12, cluster 24,
  datacenter 48, campus 96, swarm 192 seconds. (pi tuned from 1 to 7 so an
  idle player who taps every 60s still completes a cycle per tap; 7s keeps
  400 pi under the 0.25s continuous threshold.)
- The steady-state rate of a managed row equals the old continuous rate, so
  existing balance (costs, tps, prestige divisor) mostly holds.
- Milestones at 25/50/100/200/400 owned now HALVE the cycle time (speed x2),
  replacing the output doubling. Same rate, but visible.
- A cycle shorter than 0.25 s is treated as continuous: the bar shows full and
  the row pays every tick.
- `state.cycles[id]` holds progress in seconds (or null when idle).

### Running a row
- Without a manager: tapping the row's icon starts one cycle. When it finishes
  it pays and stops ("Tap to run"). Tapping a running row does nothing.
- With a manager: the row restarts itself forever.
- A row with 0 owned cannot run.

### Managers (new)
- One per generator, bought with tokens on the Upgrades tab, Managers segment.
- Names and costs: Cron Job (pi) 100, Driver Daemon (gamer) 15K,
  Build Bot (workstation) 100K, Load Balancer (rack) 1M, Scheduler (cluster) 25M,
  Orchestrator (datacenter) 500M, Fleet Controller (campus) 10B,
  Swarm Mind (swarm) 200B. (Cron Job tuned from 1K to 100 so the first
  manager lands under 2 min for an active player.)
- Managers reset on prestige, like regular upgrades.
- Offline earnings count only managed rows.

### Removed
- SERVE / click, heat and overclock leave the main game. Drop the click and
  cooling upgrades (macro, api, api2, fans, liquid, immersion) and replace them
  with per-tier production upgrades (for example "x3 Raspberry Pi output"), so
  there are still about 15 upgrades. The Weight upgrade "Autoscaler" (overclock)
  becomes "Standing Orders": start each run with the Cron Job manager hired.
- Rush stays as a small chip in the header ("Rush ready").

### Save migration
- Bump the save version. Keep tokens, lifetime, generators, weights, weight
  upgrades. Refund removed upgrades at their cost. Unknown fields are ignored.
  An old save must load without errors and without losing generators.

## Layout (index.html, src/idle/ui.js), matching the mockup
- Header: tokens (large), "N per sec", Weights chip with total bonus, and the
  x1 / x10 / x100 / Max switch.
- Game tab: one card per owned tier plus the next locked tier ("Unlock <cost>").
  Card = round icon button (tier colour ring, owned count) | name + "x2 speed at N"
  | bar with the payout written inside and filling left to right | Buy button
  ("Buy x10" + cost, orange only when affordable) and a timer showing time left
  in the cycle.
- Upgrades tab: segmented control Managers | Upgrades, one row each,
  owned ones dimmed with "Hired" / check mark. Buy All stays.
- Calm palette: background #0b0f17, cards #131a27, borders #1d2636, text
  #eef3f9, dim #93a3b8, affordable #ffb547, tier colours from the mockup.
- Prestige, Shop, Settings tabs unchanged apart from colours.
- Bars animate with CSS transforms, not layout changes; 10 Hz updates are fine.

## Tests
Cycle pays once at the end; unmanaged rows stop; managed rows repeat; milestones
halve cycle time; sub-0.25 s cycles are continuous; offline counts managed rows
only; managers reset on prestige; Standing Orders hires Cron Job; old v1 save
migrates with refunds. Keep all existing tests that still apply.
