# UX plan: make OVERCLOCK understandable

Status: APPROVED by the owner (2026-11-04: "The layout looks great") after
the clickable mock-up. Planned by Fable 5.1; built by the desktop RC.

Owner decisions after the plan was written (they override the text below):

- **Rush is dropped** ("I'm not sure I'm into the rush gameplay. We can drop
  that."). The arcade (`rush.html`, `src/*.js`), the header chip, the Shop
  tab, the Rush card in More, the two Rush achievements and the Rush stats
  are gone. Old saves load; their Rush fields are ignored. Ignore every
  Rush item in this plan (1.6, 2.2, section 4.5 Rush, the Rush help card).
- Batch 1 also took task 2.1 (five tabs: Servers, Managers, Upgrades,
  Prestige, More) because the approved mock-up shows it. This document plans layout, copy and
navigation only. Rules and balance (`core.js`, `data.js` numbers) do not
change. Everything here is written against the code as it is today
(`index.html`, `src/idle/ui.js`, `src/idle/data.js`, `src/idle/core.js`).

Reference: the owner's screenshots of a well-known "business rows" idle game.
We borrow what makes it readable, not its art, names or text:

- Every panel opens with a title, a one-line purpose, and a "?" button.
- Every row says what it is, what it does, and what it costs, in words.
- A "Next" buy mode that buys exactly up to the row's next milestone.
- A goal strip under the header that always shows the next thing to reach.
- Nothing is hidden: locked things are shown locked, with the unlock rule.

## What is wrong today (read from the code, not guessed)

| Seen | Where in the code |
| --- | --- |
| A full-width orange "Weights" switcher that does nothing | `#prestige-seg`: the Regions segment is `hidden` until `regionsUnlocked()`, so one orange button fills the row |
| Regions are hidden until 2,000 Weights with no mention anywhere | `updatePrestigeSeg()`; the "Regions unlock at 2,000 Weights" line from LATE-GAME-DESIGN Fix 2 was never built |
| "×3 gamer output", "×3 pi output" | `upgradeWords()` prints `u.tier`, the id, not the name |
| "×1000", "×0.75", "×true", "×24", "×0.25" on Weight upgrades | `WU_WORDS` keys are `auto`, `distill`, `offline`; real ids are `seed`, `night`, `warm`, `procure`, `long`, `auto`, `distill`; the fallback is `×${u.value}` |
| The Rush chip looks tappable but does nothing | `<a href="#" id="rush">` has no click handler and no link to `rush.html` |
| The Shop tab is a dead end | `#tab-shop` is one sentence; nothing to do there |
| Managers live under a tab called "Upgrades" | `#up-seg` Managers / Upgrades; hint 3 even says "Hire a manager in Upgrades" |
| Text straight on the busy background | `.shop-note`; `#tab-prestige h2/p` outside a card when the panel is empty |
| Rows with a cycle timer that is never shown | `r.status.hidden = true` in `updateGenCards()`; the countdown from ART-DESIGN §1 was dropped |
| "x2 speed at 25" with no owned count beside it | `r.milestone` text; the count is in the icon only |

---

## 1. Principles

1. **Everything is visible; locked things say how to unlock.** No feature
   appears from nowhere. If it is not available yet, it is on screen, dimmed,
   with the rule in one sentence ("Unlocks at 2,000 Weights earned in total").
2. **Every panel has a title, one purpose line, and a "?".** The purpose line
   is one plain sentence. "?" opens a short help card (3-5 lines) in the same
   style as the welcome-back card.
3. **Action buttons look different from tabs and switchers.** Buttons that
   spend or change something are rounded, filled (orange when affordable),
   and have a verb ("Buy", "Hire", "Expand"). Tabs and switchers are flat
   segments. Nothing that cannot be acted on is drawn as a button.
4. **No raw codes, ever.** Tier ids, booleans, bare multipliers and internal
   names never reach the screen. Every effect is a sentence a new player can
   read ("Gaming GPU pays 3 times as much").
5. **One next goal, always on screen.** A strip under the header names the
   closest thing worth reaching and shows progress to it.
6. **Numbers are short, and compared to something.** `1.2M`, never
   `1234567`. A cost sits next to what you have or how long until you have it.
   A count sits next to its next milestone (`12 / 25`).
7. **Text sits on panels, never on the scene.** The background shows through
   gaps between cards only. Every word is on a solid or 80% card.
8. **Nothing moves under a finger.** Rows keep a fixed height; buttons change
   text and colour, never position. Reduce-motion is respected everywhere.
9. **Free means free.** No ads, no timers you can pay to skip, no paid
   currency, no fake urgency. The only "shop" is the arcade.

---

## 2. Information architecture

### Recommendation: keep bottom tabs, flatten them

Keep five bottom tabs. Do not move to the reference's main screen plus
hamburger panels.

Why: a bottom tab bar is the native iOS pattern, every tab is visible at all
times (principle 1), and the current code already builds around five
`<section>`s with a tab handler. The reference hides Upgrades, Managers and
Investors behind a hamburger; the owner's complaint is exactly that features
are hidden. What we take from the reference is the panel anatomy (title,
purpose, "?", rows that explain themselves), not its navigation.

What changes: the nested switchers are the problem, not the tabs. Today two
core features (Managers, Regions) live one level down behind a segment that
remembers its last state, so a player can open "Upgrades" and never see
Managers. Flatten:

| Tab | Label | Holds | Today |
| --- | --- | --- | --- |
| 1 | **Servers** | the tier rows (main screen) | "Game" |
| 2 | **Managers** | the 12 manager rows | hidden under Upgrades |
| 3 | **Upgrades** | token upgrades (x3 and x5 rows, Buy All, global milestone line) | shared with Managers |
| 4 | **Prestige** | Weights section and Regions section, both always present | Regions hidden |
| 5 | **More** | Rush, Achievements, Stats, Settings, Help | Achievements, Stats, Settings |

The Shop tab goes. Nothing is for sale, nothing will be for sale (section
8), and a tab whose only content is "the arcade is the shop" is a dead end.
Rush, the thing it points at, gets a proper home: the header chip becomes a
real button that opens `rush.html`, and a Rush card sits at the top of More.
If the owner wants to keep a Shop for free cosmetics later, it becomes a
card under More when it has content, not a tab now.

Prestige keeps its `Weights | Regions` switcher, but **both segments are
always shown**. A locked Regions segment shows a small lock glyph; its panel
shows the locked state (section 4). This is the smallest change that fixes
the "orange bar that does nothing".

### Navigation rules

- Tabs: the bottom bar. A dot on a tab means "something you can afford or
  claim is in here" (exists for Upgrades and Prestige; add it to Managers).
- Switchers inside a tab: flat segments, both always visible, never
  remembered across visits when one of them is locked (open on the unlocked
  one).
- Panels that overlay the game (welcome back, help cards, confirm cards):
  one card, one primary button, Escape or tap outside closes. Same `.bk-card`
  style as the restore-backup confirm.
- The header is the same on every tab; only the buy-mode row and the goal
  strip are Servers-only.
- `rush.html` is a separate page, as now. It already links back with "Back
  to the server"; that link reads "Back to OVERCLOCK".

---

## 3. The main screen (Servers tab), element by element

```
+--------------------------------------------------+
| 1.24M tokens                      [W 12 +120%]   |  row 1
| 3.21K per sec · Iowa              [Rush ready ▶] |
|--------------------------------------------------|
| ◆ Next: Hire Driver Daemon  9.2K / 15K   ▓▓▓▓░░░ |  goal strip
|--------------------------------------------------|
| [ x1 | x10 | x100 | Next | Max ]                 |  buy mode
+--------------------------------------------------+
| (Pi)  Raspberry Pi            Auto      0:04     |
|  12   12 / 25 · next: x2 speed                   |
|       [======== +389 =========]                   |
|       [ Buy 13 → 25           3.1K tokens ]      |
+--------------------------------------------------+
```

### 3.1 Header (`#hud`)

Fixed height, never wraps (ART-DESIGN §4). Left column: tokens large,
then rate with the region name. Right column: two chips.

| Element | Shows | Notes |
| --- | --- | --- |
| Tokens | `1.24M` and the word `tokens` in small dim text after it | Word added so a new player knows what the number is |
| Rate | `3.21K per sec · Iowa` | As now; region name only once a Region is earned |
| Weights chip | `◆ 12 Weights · +120%` (after first prestige) | Tapping it opens the Prestige tab. Before the first prestige the chip is hidden (as now); the goal strip covers the gap |
| Rush chip | `▶ Rush ready` or `Rush in 7:32` | Becomes a real button: tap when ready opens `rush.html`; tap while cooling down shows a toast "Rush is a bonus arcade run. Ready in 7:32." |
| Event chip | `x3 · 0:24` while a timed event runs | Takes the Rush chip's place, as now |

### 3.2 Goal strip (new, Servers tab only, under the header)

One line, one card, 36 px. Pure helper in `advice.js` (`nextGoal(state)`),
rendered by `ui.js`. It picks the first of these that applies:

| Priority | Goal | Text | Progress |
| --- | --- | --- | --- |
| 1 | An event offer is on screen | handled by the event banner, strip hidden | – |
| 2 | Prestige is available | `Prestige ready: +N Weights` | full bar, tap opens Prestige |
| 3 | A Region is available | `Region ready: expand to Oregon` | full bar |
| 4 | A manager for an owned, unmanaged tier is the cheapest unbought thing | `Hire Driver Daemon` with `9.2K / 15K` | tokens / cost |
| 5 | `nextBestBuy()` (already exists) | `Buy Flash Attention` or `Buy 13 Raspberry Pi → x2 speed` | tokens / cost |
| 6 | Nothing affordable soon | `Next Weight at 4.0B lifetime` | lifetime / threshold |

Tapping the strip opens the tab that holds the goal (Managers, Upgrades,
Prestige) or scrolls the row into view. The bar fills with the same amber as
affordable buttons. It is the only element on the screen that tells the
player what to do; the first-run hints point at it in step 3 (section 5).

### 3.3 Buy-mode control

Five equal segments: `x1 | x10 | x100 | Next | Max`. Default is **Next**
for a new game (it is the mode that teaches milestones), remembered in
`localStorage` like the segment choices.

**Next** buys exactly the number of levels that reaches the row's next
milestone. Everything it needs exists in `core.js`:

- `nextMilestone(state, id)` gives `{ kind, value, owned }`.
- `n = milestone.owned - (state.generators[id] || 0)`.
- `cost(state, id, n)` is the price (closed form, no loop).
- `buy(state, id, n)` buys them (it already caps at the affordable count, so
  the UI disables the button until the whole batch is affordable, like x10).

Button text in Next mode: line 1 `Buy 13 → 25`, line 2 `3.1K tokens`.
When the row has no milestone left (`nextMilestone` returns null, past
1,000 owned), Next behaves as x1 and the milestone line reads
`All milestones reached`.

Rows that are locked (0 owned) ignore the mode and show `Unlock · 15 tokens`
as now.

### 3.4 Tier row anatomy

Fixed layout, about 140 px, same DOM as today plus two text spans. Left to
right, top to bottom:

| Part | Shows | State rules |
| --- | --- | --- |
| Round icon (56 px, tier-colour ring, machine art) | the owned count inside the ring under the art | **Tap runs the row** when unmanaged and idle (as now). Slow ring pulse while idle and unmanaged (reduce-motion off) |
| Manager badge on the icon | small dark disc with a person glyph | only when `hasManager()` |
| Name | `Raspberry Pi` | – |
| Status (right of the name line; `r.status`, currently hidden) | `Auto` (managed), `0:04` countdown (running), `Tap to run` (idle, unmanaged), `12/s` (continuous) | dim text; the countdown uses `state.cycles[id]` and `cycleTime()` |
| Milestone line (`r.milestone`) | `12 / 25 · next: x2 speed` or `310 / 500 · next: x3 payout` | hidden while locked; `All milestones reached` when none left |
| Bar | fill = cycle progress; text inside = `+389` payout per cycle, or `12/s` when continuous | tap also runs the row (as now) |
| Buy button | line 1 verb + count (`Buy 13 → 25`, `Buy 10 levels`, `Buy 37 levels` in Max), line 2 cost (`3.1K tokens`) | orange filled when affordable; dim outline when not; never hidden |

Locked states, in order of how far away they are:

| State | Icon | Button | Milestone line |
| --- | --- | --- | --- |
| Next tier, 0 owned, not gated | art at 50% | `Unlock · 2.4K tokens`, orange when affordable | hidden |
| Next tier, gated by Regions | art at 50%, lock glyph in place of the count | disabled: `Unlocks at Frankfurt (3 Regions)` | one dim line: `Earn Regions on the Prestige tab` |
| Further tiers | not drawn as rows | – | – |

### 3.5 Future tiers

Today only owned tiers plus the next unowned (and the next Region-locked)
tier are drawn. Keep that, and add one footer line under the last row, on a
card: `3 more tiers to discover` (`GENERATORS.length` minus rows shown).
When the next tier is Region-gated the footer reads
`3 more tiers · unlocked by Regions`. When all 12 are owned it reads
`All 12 tiers online`. This is the only place the full count appears; it
tells a new player the list is longer than two rows without spoiling names.

---

## 4. Panels

Every panel below uses the same head: a title (18 px), a one-line purpose
(13 px dim) and a "?" button (44 px tap target, top right) that opens a help
card. Help card copy is in section 6. The head sits on a card like
`#prestige-hint`, never on the scene.

### 4.1 Managers (own tab)

- Title: **Managers**. Purpose: *Hire one per tier. It runs that tier for
  you, even while you're away.*
- Row (as now: 60 px portrait, name, effect, button):
  - name `Cron Job`, effect `Runs Raspberry Pi by itself`.
  - button: `Hire` + `100 tokens` (orange when affordable); `✓ Hired` green
    pill when hired; `Own a Raspberry Pi first` disabled when the tier has 0
    owned; `Unlocks with Orbital Compute Ring` when the tier is Region-gated.
- Order: tier order (as now). Hired rows stay at full strength on a solid
  card (already fixed in `3feffb2`); "Need …" rows dim their text only.
- Empty state: none possible (12 rows always). Locked state is per row.
- Tab dot when any manager is affordable (move the manager half of
  `updateTabDots()` here).

### 4.2 Upgrades (own tab)

- Title: **Upgrades**. Purpose: *One-time boosts bought with tokens. They
  reset when you prestige.*
- Top: `Buy all affordable` button (rename from "Buy all"), then the global
  milestone card: `All tiers at 250 → x3 production. Lowest: Lunar
  Datacenter 212`.
- Row: name, effect sentence (section 6 table), button `12K tokens` (orange
  when affordable) or `✓ Owned`.
- x5 rows (`X5_UPGRADES`) are hidden until available today. Instead show
  **one** dim row at the end of the list: `12 more upgrades unlock at 2
  Regions` (text from `minRegions`). When available they appear as normal
  rows and the dim row goes.
- Empty state: when every visible upgrade is owned, the list shows one card:
  `Everything bought for this run. More unlock after your next prestige.`

### 4.3 Prestige tab: Weights segment

- Title: **Prestige**. Purpose: *Reset this run to earn Weights. Each Weight
  gives +10% production forever.*
- Progress card: bar and `Next Weight at 4.0B lifetime tokens (2.1B, 52%)`,
  then `Current bonus +120% from 12 Weights`.
- Action card: `+N Weights available` large, `PRESTIGE` button (two-step
  confirm, as now). Under the button, always visible, the reset list:
  `Resets: tokens, tiers, upgrades, managers. Keeps: Weights, Weight
  upgrades, Regions, achievements.` (The current `#expand-note` pattern,
  but shown always, not only when armed.)
- Weight upgrade rows: name, effect sentence (section 6), button `Buy` +
  `3 Weights` or `✓ Owned`.
- Locked state (before the first Weight): the button is disabled with text
  `Need 1 Weight`; the progress card shows the bar; nothing else dims. This
  is the state a new player sees in minute 1, so it must explain itself.
- One extra line at the bottom of the segment, always: `Regions: the second
  reset layer. Unlocks at 2,000 Weights earned in total (you have 240).`
  Tapping it switches to the Regions segment.

### 4.4 Prestige tab: Regions segment (always visible)

- Title: **Regions**. Purpose: *Open a new datacenter region. Everything
  resets, including Weights, and all production doubles for good.*
- Locked state (`!regionsUnlocked(state)`): the segment button shows a lock
  glyph; the panel shows the head, then one card: `Unlocks at 2,000 Weights
  earned in total. You have 240.` with a bar, then the six perk rows dimmed
  with their costs, so the player can see what Regions buy. No button.
- Unlocked state: progress card `Next Region: Oregon. 2,140 / 6,400 Weights
  earned since your last expansion (33%)`, then `Current multiplier x4 (2
  Regions, each doubles production)`, then the `EXPAND` button with the
  resets/keeps list always visible, then the perk rows (`Buy` + `2 Regions`
  or `✓ Owned`).
- The tab dot on Prestige also lights when a Region is available.

### 4.5 More tab

Segments: `Rush | Achievements | Stats | Settings`. The More tab opens on
Rush when Rush is ready, else on the last-used segment.

**Rush**
- Title: **Rush**. Purpose: *A short arcade run. Your score pays out tokens
  back here. One run every 10 minutes.*
- Card: `Rush ready` + `PLAY` button (opens `rush.html`), or `Ready in 7:32`
  with a disabled button. Below: `Pays tokensPerSecond × up to 10 minutes,
  based on your score` written as `Best score 4,120 · last payout 1.2M`.
  Stats come from `state.stats.bestRushScore` and `rushGames`.
- Empty state (never played): `No runs yet. Scores pay up to 10 minutes of
  production.`

**Achievements**
- Title: **Achievements**. Purpose: *Each one adds +1% production.*
- Progress line and rows as now. The row condition text for `events`,
  `regions`, `allPerks`, `anyOwned`, `allTiers` is missing in
  `conditionText()` (falls to `''`); use `a.desc` from `data.js` as the
  fallback. "Hire all 8 managers" must read 12 (`MANAGERS.length`).

**Stats**
- Title: **Stats**. Purpose: *Totals for this run and all time.*
- As now, grouped This run / All time / Rush. Add `Regions earned` and
  `Weights earned, all time` to All time.

**Settings**
- Title: **Settings**. No purpose line needed.
- As now, plus a `Help` card at the top: `Show tips again` (exists) and
  `How to play` (opens the four help cards in order).
- `HARD RESET` moves to the bottom of the panel and reads `Delete all
  progress`, confirm text `Delete everything?` (red). Export / Import stay.

### 4.6 Events (banner on Servers)

- The offer banner stays where it is (above the rows). Add the word
  `Event` as a small caps label above the title so the card is recognisable,
  and keep the drain bar and `CLAIM` button.
- The active chip in the header stays.
- Before the first event has ever appeared (`stats.eventsClaimed === 0` and
  no offer), nothing is shown; the first-run help card mentions events.

### 4.7 Welcome back (modal)

As now. Change `Your managed servers earned 1.23M` to `Managed tiers earned
1.23M tokens`, and the cap line to `Offline earnings stop after 8 h. The
Long Weekend Weight upgrade raises it to 24 h.`

---

## 5. Onboarding and discoverability

The three existing hints (`hints.js`) stay. Hint 3 changes its target to the
Managers tab. Beyond those, features introduce themselves by being visible
in a locked state (principle 1), so there is no second tutorial system to
build. Timeline, with what the player sees:

**Minute 0 to 10 (first run)**
- Hint 1: tap the Pi. Hint 2: buy more Pis (the Next mode makes the button
  read `Buy 24 → 25`, so the milestone idea is visible from the first buy).
- Goal strip shows `Hire Cron Job 42 / 100` as soon as the Pi is owned.
- Hint 3 (tokens ≥ 100): "Hire a manager on the Managers tab. It runs the
  row for you, even while you're away." Points at the Managers tab.
- Gaming GPU row is visible from the start as `Unlock · 500 tokens`.
- First event offer at 2 minutes: the banner explains itself.
- The Prestige tab is visible with its locked state, so a player who taps it
  reads what Weights are before they matter.

**First prestige (20 to 40 minutes by the balance bot)**
- The goal strip switches to `Prestige ready: +1 Weight` and the Prestige
  tab dot lights. The Prestige panel's reset list is already on screen.
- After the first prestige the banner reads `Prestige! +1 Weight (+10%
  production). New run: buy a Raspberry Pi.` and the Weights chip appears in
  the header.
- The Weights segment's bottom line now reads `Regions ... (you have 1)`, so
  the next layer is named from the first Weight.

**First Region (about 3 to 5 hours)**
- At 2,000 Weights earned the Regions segment loses its lock; the dot on the
  segment shows once (exists: `regionDotSeen`).
- The goal strip shows `Region ready: expand to Iowa` when available.
- After expanding, the banner reads `New Region: Iowa. All production x2.
  Orbital Compute Ring is now available.` (append the tier name when a
  `TIER_GATES` entry is met by this expansion).
- The Orbital row shows as `Unlocks at Iowa (1 Region)` from the moment the
  Swarm is owned (exists), so the player has seen the gate before reaching it.

**Later**
- x5 upgrades: the dim `12 more upgrades unlock at 2 Regions` row.
- Global milestones: the card at the top of Upgrades.
- Payout milestones: the row milestone line switches from speed to payout.

Help cards (the "?" on each panel) are the reference material; they are
never forced on the player.

---

## 6. Copy rules

1. Name the thing by its display name, never its id. Look up names in
   `GENERATORS`, `MANAGERS`, `REGION_NAMES`.
2. Effects are sentences with a verb: "pays 3 times as much", "runs by
   itself", "start each run with". No bare `×3`, no `+true`.
3. Multipliers use `x` with no space before a number (`x2 speed`) in labels,
   and "times" in sentences.
4. Costs always carry the unit: `3.1K tokens`, `3 Weights`, `2 Regions`.
5. Progress is `have / need (percent)`: `2,140 / 6,400 Weights (33%)`.
6. Buttons are a verb plus the amount: `Buy 13 → 25`, `Hire`, `Expand`,
   `Claim`. Done states are a tick plus a past participle: `✓ Owned`,
   `✓ Hired`.
7. Titles are one or two words. Purpose lines are one sentence, no
   exclamation marks, no jokes that hide information.
8. Short numbers everywhere (`fmt`), exact numbers only in Stats and in
   progress fractions under 10,000.

### Label rewrites

| Where | Today | Becomes | Source of the fix |
| --- | --- | --- | --- |
| Upgrade effect | `×3 gamer output` | `Gaming GPU pays 3 times as much` | `upgradeWords()`: look up `GENERATORS.find(g => g.id === u.tier).name` |
| Upgrade effect | `×1.5 production` | `All tiers pay 1.5 times as much` | `upgradeWords()` production case |
| Upgrade effect | `+25% cache rate` | `+25% to all production (cache)` | `upgradeWords()` cacheRate case |
| Upgrade name | `x3 Raspberry Pi output` | `Raspberry Pi x3` | `data.js` name field (display only; ids unchanged) |
| Upgrade name | `x5 Raspberry Pi output` | `Raspberry Pi x5` | `data.js` |
| Weight upgrade effect | `×1000` (seed) | `Start each run with 1,000 tokens` | `WU_WORDS` keyed by real ids |
| Weight upgrade effect | `×0.75` (night) | `Earn 75% while away (now 50%)` | `WU_WORDS` |
| Weight upgrade effect | `×0.25` (warm) | `+25% to all production` | `WU_WORDS` |
| Weight upgrade effect | `×true` (procure) | `Adds the Buy All button to Upgrades` | `WU_WORDS` |
| Weight upgrade effect | `×24` (long) | `Offline earnings run for 24 h (now 8 h)` | `WU_WORDS` |
| Weight upgrade effect | `Managers auto-run their rows` (auto) | `Start each run with Cron Job hired` | `WU_WORDS` (the current text describes the old Autoscaler) |
| Weight upgrade effect | `+% bonus per weight` (distill) | `Each Weight gives +13% instead of +10%` | `WU_WORDS` |
| Row milestone | `x2 speed at 25` | `12 / 25 · next: x2 speed` | `updateGenCards()` |
| Row milestone | `x2 payout at 300` | `212 / 300 · next: x2 payout` | `updateGenCards()` |
| Buy button | `Buy 10 levels` | `Buy 10` | `setLines()` call; "levels" is jargon |
| Buy button | `Unlock · 500 tokens` | keep | – |
| Buy All | `Buy all` | `Buy all affordable` | `buyAllBtn.textContent` |
| Manager button | `Need Gaming GPU` | `Own a Gaming GPU first` | `updateManagers()` |
| Manager effect | `Runs Gaming GPU automatically` | `Runs Gaming GPU by itself` | `manRefs` |
| Prestige head | `Reset the run, keep your Weights.` | `Reset this run to earn Weights. Each Weight gives +10% production forever.` | `index.html` |
| Prestige hint | `Next weight at 4.0B lifetime` | `Next Weight at 4.0B lifetime tokens (2.1B, 52%)` | `updatePrestige()` |
| Prestige hint | `Current bonus +120%` | `Current bonus +120% from 12 Weights` | `updatePrestige()` |
| Prestige avail | `weights available` | `Weights available` | `index.html` |
| Region hint | `Next Region: earn 6,400 Weights by prestiging (2,140 so far, 33%)` | `Next Region: Oregon. 2,140 / 6,400 Weights since your last expansion (33%)` | `updateRegions()` with `REGION_NAMES[earned + 1]` |
| Region mult | `Current multiplier x4 — each Region doubles all production` | `Current multiplier x4 (2 Regions, each doubles production)` | `updateRegions()` |
| Expand button | `EXPAND` | `EXPAND TO OREGON` | `updateRegions()` |
| Region perk effect (headStart) | `Every run starts with Seed Funding, Procurement Bot, Standing Orders and the first 3 managers` | `Every run starts with Seed Funding, Procurement Bot, Standing Orders and the first 3 managers hired` | `PERK_WORDS` |
| Region perk effect (autoProcure) | `Buy All runs by itself every 10 s (toggle in Settings)` | `Buys every affordable upgrade for you every 10 s (switch in Settings)` | `PERK_WORDS` |
| Shop | `The arcade is the shop: play Rush, come back with a score.` | removed (tab gone; Rush card in More) | `index.html` |
| Rush chip | `Rush ready` | `▶ Rush ready` (tappable) / `Rush in 7:32` | `updateRushChip()` and a click handler |
| Tab | `Game` | `Servers` | `index.html` |
| Tab | `Shop` | `Managers` (Shop removed) | `index.html` |
| Welcome back | `Your managed servers earned 1.23M` | `Managed tiers earned 1.23M tokens` | `welcome.js` |
| Welcome back cap | `Offline earnings cap at 8h. Upgrade it in Prestige.` | `Offline earnings stop after 8 h. Long Weekend (Prestige) raises it to 24 h.` | `welcome.js` |
| Prestige banner | `Prestige! +1 weights. New run begins — buy a Raspberry Pi.` | `Prestige! +1 Weight (+10% production). New run: buy a Raspberry Pi.` | `ui.js` |
| Region banner | `New region: Iowa. +1 Region.` | `New Region: Iowa. All production x2.` plus ` Orbital Compute Ring is now available.` when a gate opens | `ui.js` |
| Hint 3 | `Hire a manager in Upgrades. ...` | `Hire a manager on the Managers tab. It runs the row for you, even while you're away.` | `hints.js` `HINT_TEXTS` and `targetFor('manager')` |
| Achievement cond | `Hire all 8 managers in one run` | `Hire all 12 managers in one run` | `achievements-ui.js` (use `MANAGERS.length`) |
| Settings | `HARD RESET` / `CONFIRM RESET` | `Delete all progress` / `Delete everything?` | `index.html`, `ui.js` |
| Settings | `Export save` / `Import save` | `Copy save code` / `Paste save code` | `index.html` |
| Global milestone | `All tiers at 250: x3 production. Lowest now: Lunar Datacenter 212` | `All tiers at 250 → x3 production. Lowest: Lunar Datacenter 212` | `updateGlobalMilestone()` |
| Event effect (windfall) | `Instantly pays 180 seconds of the current tokensPerSecond` | `Pays 3 minutes of production right now` | `data.js` `EVENT_KINDS` effect text |
| Event effect (turbo) | `Every cycle runs 2 times as fast for 30 seconds` | `All tiers run twice as fast for 30 seconds` | `data.js` |

### Help card copy (the "?" on each panel)

- **Servers**: "Each tier runs a cycle and pays tokens at the end. Tap the
  round icon to run a tier yourself, or hire its manager so it runs alone.
  Buy more of a tier to pay more per cycle. Every 25, 50, 100, 200 and 400
  owned makes it twice as fast; 300, 500, 750 and 1,000 pay more."
- **Managers**: "One manager per tier. A hired manager restarts the tier's
  cycle forever, including while the game is closed. Managers reset when you
  prestige."
- **Upgrades**: "One-time boosts paid in tokens. Some boost one tier, some
  boost everything. They reset when you prestige. Buy all affordable buys
  every one you can pay for, cheapest first."
- **Prestige**: "When your lifetime tokens are high enough you can prestige:
  the run resets and you earn Weights. Each Weight adds +10% production for
  every later run. Weight upgrades are paid in Weights and survive prestige.
  Regions are the layer above: they reset Weights too, but double all
  production permanently."
- **Rush**: "A short arcade game. Your score is paid out as tokens when you
  come back, up to 10 minutes of production. One run every 10 minutes."

---

## 7. Build batches

Rules from ART-DESIGN: one pass per file at a time, small tasks, a test
command per task, `tools/release.sh` after each batch. Nothing in any batch
touches balance numbers.

### Batch 1: a day. Highest impact, smallest diff.

Goal: no dead buttons, no hidden layer, no raw codes, a Next mode.

| # | Task | Files | Acceptance |
| --- | --- | --- | --- |
| 1.1 | **Next buy mode.** Add `Next` segment between x100 and Max. In `updateGenCards()` compute `n` from `nextMilestone()`; button text `Buy 13 → 25` / cost; fall back to x1 when no milestone remains. `buy(state, id, n)` on click. | `index.html` (one button), `ui.js` | On a fresh game with 1 Pi the button reads `Buy 24 → 25`; after buying, owned is 25 and the milestone line says `25 / 50`; with 999 owned Next reads `Buy 1 → 1000`; with 1000 owned it behaves as x1. Unit test for the count via `nextMilestone` + `cost` |
| 1.2 | **Milestone line with count.** `12 / 25 · next: x2 speed`, `All milestones reached` when null. | `ui.js` | Text matches for owned 12, 310, 1000 |
| 1.3 | **Regions always visible.** Remove `hidden` from the Regions segment; `updatePrestigeSeg()` adds a `locked` class and lock glyph instead; locked panel shows the unlock card (`Unlocks at 2,000 Weights earned in total. You have N.`) and the perk rows dimmed with no buttons. Add the Regions line at the bottom of the Weights segment. | `index.html`, `ui.js` | Fresh game: both segments visible, Regions locked, panel shows the unlock card with `You have 0`; state with `weightsEverEarned: 2000` or `regionsEarned: 1`: unlocked, Expand button present. The orange single-segment bar never appears |
| 1.4 | **Label fixes.** `upgradeWords()` uses tier names; `WU_WORDS` keyed by real ids with the table above and name fallback; `PERK_WORDS`, manager button text, Buy All text, prestige/region hint strings, banners. | `ui.js`, `data.js` (upgrade names, event effect text), `welcome.js` | Test: every `WEIGHT_UPGRADES` id has a `WU_WORDS` entry; every `REGION_PERKS` id has a `PERK_WORDS` entry; no rendered string contains `×true`, `×1000`, a tier id, or `undefined` (smoke test walks `#up-grid`, `#prestige-grid`, `#region-perks` text) |
| 1.5 | **Panel heads.** A `panelHead(title, purpose, helpText)` helper in `ui.js` that returns a card; prepend to Managers, Upgrades, Prestige (Weights and Regions), Achievements, Stats, Settings. "?" opens a `.bk-card` with the help text and one `Close` button. | `ui.js`, `index.html` (CSS for `.panel-head`) | Every tab except Servers starts with a title and a one-line purpose on a card; "?" opens and closes without errors; no text sits outside a card (smoke: `.shop-note` gone) |
| 1.6 | **Rush chip works.** Click handler: ready → `location.href = 'rush.html'`; cooling → toast. Chip text `▶ Rush ready`. | `ui.js` | Tapping when ready navigates; when not, a toast appears and nothing navigates |
| 1.7 | **Hint 3 text and target.** | `hints.js` | Test for `HINT_TEXTS.manager` |

Batch 1 does not move Managers to its own tab or remove Shop (that is batch
2), so 1.5 puts the Managers head above `#man-grid` and the Upgrades head
above `#up-grid` inside the existing segments, and 1.7 keeps pointing at the
Upgrades tab until batch 2 lands. Run `sh tools/release.sh` at the end.

### Batch 2: tabs and the goal strip (1 to 2 days)

| # | Task | Files | Acceptance |
| --- | --- | --- | --- |
| 2.1 | Five tabs: Servers, Managers, Upgrades, Prestige, More. Move `#man-grid` into a new `#tab-managers` section; drop `#up-seg` and `#tab-shop`; tab dot on Managers. Remembered `upSegment` key is ignored. | `index.html`, `ui.js`, `tools/smoke.js` | Smoke: five tabs with those labels; Managers tab shows 12 rows; no `#tab-shop`; the Upgrades tab has no switcher |
| 2.2 | More tab gets the Rush segment (card, PLAY button, cooldown, best score, last payout). Opens on Rush when ready. | `index.html`, `ui.js` | PLAY navigates to `rush.html` when ready and is disabled otherwise; best score matches `state.stats.bestRushScore` |
| 2.3 | Goal strip: `nextGoal(state)` in `advice.js` (pure, tested), rendered under the buy-mode row on Servers; tap opens the right tab. | `advice.js`, `ui.js`, `index.html`, `test/advice.test.js` | Tests for each priority in 3.2; the strip never shows while an event offer is on screen; fresh game shows `Hire Cron Job 0 / 100` once the first cycle pays |
| 2.4 | Hint 3 points at the Managers tab. | `hints.js` | `targetFor('manager')` returns the Managers tab button |
| 2.5 | Row status text back: `Auto`, `0:04`, `Tap to run`, `12/s`. | `ui.js` | Unmanaged idle row reads `Tap to run`; managed reads `Auto`; running shows a countdown that reaches `0:00` |
| 2.6 | Future-tiers footer line under the rows. | `ui.js` | Fresh game: `10 more tiers to discover`; all owned: `All 12 tiers online` |

### Batch 3: locked states and empty states (1 day)

| # | Task | Files | Acceptance |
| --- | --- | --- | --- |
| 3.1 | Upgrades: one dim `N more upgrades unlock at 2 Regions` row instead of hidden x5 rows; empty-state card when everything is owned. | `ui.js` | State with 0 Regions shows the dim row and no x5 rows; with 2 Regions the row is gone and x5 rows show |
| 3.2 | Prestige reset/keep lists always visible under both buttons; `EXPAND TO <next region>` text; banner names the newly unlocked tier. | `index.html`, `ui.js` | Text checks on fresh and late states |
| 3.3 | Manager locked-by-Region text; achievements `conditionText` fallback to `a.desc`; 12 managers; Stats rows for Regions and all-time Weights. | `ui.js`, `achievements-ui.js`, `stats-ui.js` | No empty condition cell on the Achievements list; Stats shows the two new rows |
| 3.4 | Settings: Help card (`How to play` runs the help cards in order), `Delete all progress` wording, save-code wording. | `ui.js`, `index.html` | Smoke: buttons present with the new labels; two-step delete still works |

### Batch 4 (later; needs new art or new systems)

- Region scenes for Iowa onward (`icons/bg/<key>.webp`) so Expand visibly
  changes the room. Art.
- An "unlock" moment for a new tier: a short card with the machine art and
  one line (`Workstation online. 47 tokens per second per unit.`). Needs a
  small event hook in `buy()` or a UI diff of owned tiers; new system.
- A per-row detail sheet (tap the name): exact rate, share of total, next
  three milestones, manager. UI-only but a new component.
- Logo-free Raspberry Pi art before any store release (ART-TIERS known
  follow-up). Art.
- A "What's new" card after an update, driven by the version stamp. New
  system.

---

## 8. Do not do

- No ads, no "watch a video for x2", no rewarded or interstitial anything.
- No paid currency, no shop with prices, no in-app purchases. The Shop tab
  is removed rather than kept as a placeholder.
- No dark patterns: no fake countdowns, no "offer expires" on things that do
  not expire (the 20 s event claim window is a real game rule and stays), no
  guilt copy on reset, no notification nagging.
- No hidden features. If something exists in `data.js`, it is on screen in
  some state.
- No raw ids, booleans or bare multipliers in any rendered string.
- No balance changes in a UX batch. Numbers in `data.js` move only through
  the balance bot and `docs/DECISIONS.md`.
- No new dependencies, build steps, fonts or network calls (DESIGN.md hard
  rules).
- Do not copy the reference's art, names, voice or exact text. Borrow the
  structure only.
