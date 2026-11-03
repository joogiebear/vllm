# Second prestige layer: Regions

Status: APPROVED by the owner on 2026-11-03 ("Build it as designed"). Build it.
This is the ONE merged design (two drafts were written on 2026-11-03; this file supersedes both).

## The idea in one line
Once your Weights stop growing fast, you open a **new datacenter region**: everything from
the first layer resets, including Weights, and you earn **Regions**, a rarer currency that
makes every later run faster and unlocks quality-of-life perks.

## When it unlocks
- The Regions view appears once you've earned 25 Weights in total; the first Region needs 50.
- Target: the first Region lands at about 3 to 5 hours of active play.
  The test bot tunes `REGION_DIVISOR` until it does.

## Formula
- `regionsAvailable = floor(sqrt(weightsEverEarned / REGION_DIVISOR)) - regionsEarned`,
  starting with `REGION_DIVISOR = 50` (first Region at 50 Weights, 2nd at 200, 3rd at 450).
- `weightsEverEarned` is a new counter of all Weights ever claimed. It survives Region resets.

## What a Region reset does
- **Resets:** everything a normal prestige resets, plus `weights`, `weightUpgrades`,
  `weightsEarnedThisCycle` and `totalLifetime` (so Weights start from zero again).
- **Keeps:** `regions`, `regionPerks`, `weightsEverEarned`, achievements, stats,
  settings and the Rush cooldown.
- A two-step confirm, like prestige, and the dialog says exactly what is lost and gained.

## What Regions give
- **Passive:** each Region gives x2 to all production, multiplying (3 Regions = x8). Spending
  Regions on perks does not lower it. Shown in the header chip next to Weights.
- **Places:** each Region moves the server room: Home Lab, Iowa, Oregon, Frankfurt, Tokyo,
  São Paulo, Arctic, Low Orbit, Lunar Base, Mars Relay, then numbered. Shown in the header,
  with a slight cosmetic colour tint per region.
- **Region perks** (bought with Regions, kept forever):

| Perk | Cost | Effect |
| --- | --- | --- |
| Head Start | 1 | Every run starts with Seed Funding, Procurement Bot and Standing Orders owned, and the first 3 managers hired |
| Fresh Weights | 2 | Each new region starts with 5 Weights |
| Overclocked Fabric | 2 | All cycles 20% faster |
| Auto-Procure | 2 | Buy All for upgrades runs by itself every 10 s (toggle in Settings) |
| Event Desk | 3 | Timed events come twice as often and last 50% longer |
| Long Haul | 3 | Offline cap 24 h and offline rate 100% |

## Screens
- The Prestige tab gets a segmented control: **Weights | Regions**, the same pattern as
  Upgrades | Managers. Regions stays hidden until it unlocks, then shows a dot.
- The Regions view uses the same progress-bar-plus-sentence style:
  "You're 40% of the way to your first Region (20 / 50 Weights)".
- Region perks are rows like the Weight upgrades.
- New achievements: first Region, 3 Regions, 10 Regions, all perks bought (+1% each, like the rest), plus Regions stats.

## Save and tests
- Bump the save version; new fields default to 0 or empty, and old saves load unchanged.
- Tests: availability formula; reset wipes the right fields and keeps the rest; x2 per Region
  stacks multiplicatively; every perk; Head Start re-applies after both kinds of reset;
  migration from the current save.
- A bot run to tune `REGION_DIVISOR` toward the 3-to-5-hour target, and to check that the
  second Region comes noticeably faster than the first.
