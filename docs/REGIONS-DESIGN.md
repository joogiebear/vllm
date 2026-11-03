# Second prestige layer: Regions

Status: PROPOSED, waiting for the owner's OK. Do not build until the thread says approved.

## The idea in one line
Once your Weights stop growing fast, you open a **new datacenter region**: everything from
the first layer resets, including Weights, and you earn **Regions**, a rarer currency that
makes every later run faster and unlocks quality-of-life perks.

## When it unlocks
- The Region button appears once you've earned 25 Weights in total (`weightsEarnedThisCycle >= 25`).
- Target: the first Region lands at about 3 to 4 hours of active play (roughly 8 to 12 prestiges).
  The test bot tunes `REGION_DIVISOR` until it does.

## Formula
- `regionsAvailable = floor(sqrt(weightsEverEarned / REGION_DIVISOR)) - regionsEarned`,
  starting with `REGION_DIVISOR = 25` (first Region at 25 Weights, 2nd at 100, 3rd at 225).
- `weightsEverEarned` is a new counter of all Weights ever claimed. It survives Region resets.

## What a Region reset does
- **Resets:** everything a normal prestige resets, plus `weights`, `weightUpgrades`,
  `weightsEarnedThisCycle` and `totalLifetime` (so Weights start from zero again).
- **Keeps:** `regions`, `regionPerks`, `weightsEverEarned`, achievements, stats,
  settings and the Rush cooldown.
- A two-step confirm, like prestige, and the dialog says exactly what is lost and gained.

## What Regions give
- **Passive:** each Region gives x1.5 to all production, multiplying (2 Regions = x2.25).
  Shown in the header chip next to Weights.
- **Region perks** (bought with Regions, kept forever):

| Perk | Cost | Effect |
| --- | --- | --- |
| Head Start | 1 | Every run starts with Seed Funding, Procurement Bot and Standing Orders already owned |
| Hiring Pipeline | 1 | Managers cost 90% less |
| Auto-Procure | 2 | Buy All for upgrades runs by itself every 10 s (toggle in Settings) |
| Event Desk | 2 | Timed events come twice as often and last 50% longer |
| Long Haul | 3 | Offline cap 24 h and offline rate 100% |
| Weight Lifting | 5 | +50% Weights from every prestige |

## Screens
- The Prestige tab gets a segmented control: **Weights | Regions**, the same pattern as
  Upgrades | Managers. Regions stays hidden until it unlocks, then shows a dot.
- The Regions view uses the same progress-bar-plus-sentence style:
  "You're 40% of the way to your first Region (10 / 25 Weights)".
- Region perks are rows like the Weight upgrades.
- New achievements: first Region, 3 Regions, 10 Regions, all perks bought (+1% each, like the rest).

## Save and tests
- Bump the save version; new fields default to 0 or empty, and old saves load unchanged.
- Tests: availability formula; reset wipes the right fields and keeps the rest; x1.5 per Region
  stacks multiplicatively; every perk; Head Start re-applies after both kinds of reset;
  migration from the current save.
- A bot run to tune `REGION_DIVISOR` toward the 3-to-4-hour target, and to check that the
  second Region comes noticeably faster than the first.
