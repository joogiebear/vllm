# Achievements, stats, welcome back and settings

Builds on docs/CYCLES-DESIGN.md. Same palette, card style and one-line rows.

## Navigation

The fifth tab, Settings, becomes **More**. It opens on a segmented control:
**Achievements | Stats | Settings**, remembered across visits. Shop stays its own tab.
A dot on More shows when there is an unseen achievement.

## Stats (state.stats)

New counters, kept across prestiges unless marked *run*, and migrated from old saves as zero:

- `allTimeTokens`: every token ever earned, across runs.
- `bestRunTokens`: the highest `lifetime` reached in any run.
- `playSeconds`: time with the page open. `offlineSeconds` and `offlineTokens` are time and tokens
  credited while away.
- `prestiges`, `managersHired`, `taps` (rows started by hand), `generatorsBought`, `upgradesBought`.
- `rushGames`, `bestRushScore`.
- `runStartedAt`: game time in seconds when this run began. *run*

The core updates these in the existing functions: tick, runRow, buy, buyUpgrade, buyManager, prestige,
applyOffline and applyRush. No clock reads in core: app.js passes elapsed time as now.

The Stats screen is a list of label and value rows, with short numbers and durations such as
"3h 12m". Group them into This run, All time and Rush.

## Achievements (src/idle/achievements.js, data in data.js)

- `state.achievements`: ids unlocked, kept across prestiges.
- Each achievement adds **+1% production**, multiplied into tokensPerSecond as
  `(1 + 0.01 * achievements unlocked)`.
- `checkAchievements(state)` is pure and returns newly unlocked ids. It is called every tick.
- The list, generated in data.js:
  - Every generator at 1, 25, 100 and 400 owned: 32. Names like "Raspberry Pi: First Boot",
    "Raspberry Pi: 25 Online", "Raspberry Pi: Server Farm", "Raspberry Pi: Overkill".
  - Lifetime-in-run tokens of 1M, 1B, 1T and 1Qa: 4.
  - Prestiges 1, 5 and 25: 3.
  - All 8 managers hired in one run: 1.
  - Taps 100 and 1,000: 2.
  - Rush games 1 and 10: 2.
  That makes 44 in total.
- Screen: a progress line, for example "12 of 44, +12% production". Then one-line rows: name,
  condition, and a check mark when done. Locked ones are dim, unlocked first.
- A small toast slides in at the top when one unlocks, for example "Achievement: First Boot +1%",
  and disappears after 3 seconds. Several queue rather than overlap.

## Welcome back (src/idle/welcome.js)

When the game loads, or comes back from hidden, after more than 60 seconds away and with tokens
earned, show a modal card:

- "Welcome back"
- "You were away 2h 14m"
- "Your managed servers earned 1.23M" in a large number
- If the cap applied: "Offline earnings cap at 8h. Upgrade it in Prestige."
- "You can now afford: 3 upgrades, 1 manager", only when non-zero
- One button, "Collect". The tokens are already credited; the button only closes the card.

It replaces the old offline banner for this case.

## Settings

- Number format: Short (1.23M), Scientific (1.23e6). Stored in localStorage, applied everywhere.
- Confirm before prestige: on or off, default on.
- Reduce motion: Auto (follow the system), On or Off.
- Save: Export, Import and Hard reset (existing, keep them).
- About: version stamp, "Free and open source under GPL-3.0", a link to the GitHub repo, and
  "Designed with Claude, built by Qwen3.8 on Hermes".

## Tests

Counters update in each core function. Stats survive prestige except run counters. Achievements
unlock at the exact thresholds and only once. The +1% applies. Old saves migrate with empty stats
and achievements. Hard reset clears everything.
