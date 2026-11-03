# Art pass and first-run hints

Status: APPROVED (owner approved the art pass and first-run hints as part of
phase 1; "I trust your recommendation" on the details). Design owner: thread
Claude. Builder: RC with Qwen, in the passes listed at the end.

Two pieces of work. First-run hints come first because they are small and
touch few files. The art pass follows in four passes.

## 1. First-run hints

Three tips, shown once each, one at a time, only to new players.

| # | Shows when | Text | Points at | Goes away when |
| --- | --- | --- | --- | --- |
| 1 | A fresh game loads (lifetime 0, no taps) | "Tap the Pi icon to run it. When the bar fills, you get tokens." | Raspberry Pi row's round run button | First tap on that button, or "Got it" |
| 2 | Hint 1 done and tokens >= cost of the next Pi | "Buy more Pis to earn more each run. Every 25 owned makes them faster." | Pi row's Buy button | First generator purchase, or "Got it" |
| 3 | Hint 2 done and tokens >= Cron Job cost (100) and no manager hired | "Hire a manager in Upgrades. It runs the row for you, even while you're away." | Upgrades tab in the bottom menu | Any manager hired, or the Upgrades tab is opened, or "Got it" |

Row text cleanup (owner, 2026-11-03): the "Tap to run" status text goes
away. Only the round tier icon runs a row, so the text pointed at the wrong
place; hint 1 teaches the tap instead. A row that is idle and has no manager
shows its cycle time (for example `0:07`) in the status box, dimmed. Running
rows keep the countdown, managed rows keep "Auto", continuous rows keep the
per-second rate. The idle run button gets a slow, subtle pulse on its tier
colour ring (off with reduced motion) so it reads as the thing to tap.

Rules:

- Save key `hints: { seen: [] }`, ids `run`, `buy`, `manager`. Kept across
  prestige and Regions. The save migration marks all three seen for any save
  with lifetime > 0, so existing players never see them.
- The callout is a small bubble (max 260 px wide, the app's card colours,
  14 px text) with an arrow toward its target and a "Got it" text button. It
  sits above or below the target, whichever has room. No dimmed overlay and no
  blocked input: the game stays fully playable.
- Only one hint at a time. If the target is off screen (another tab is open),
  wait until it is visible again.
- No animation beyond a 150 ms fade, and none when reduced motion is on.
- Settings gets a "Show tips again" button that clears `hints.seen`.
- A hint never appears in the same second as the welcome-back card or an
  achievement toast; it waits for those to close.
- Files: new `src/idle/hints.js` (pure `nextHint(state)` plus the DOM
  callout), small hooks in `ui.js`, `save.js` and `settings.js`. Tests for
  `nextHint` and the migration.

## 2. Art pass

### Style

One icon family for everything, so the game reads as one product:

- Hand-written inline SVG, `viewBox="0 0 24 24"`, stroke only, stroke width
  1.8, round caps and joins, `fill="none"`, colour from `currentColor`.
  This matches the bottom menu icons already in the game.
- No image files, fonts or build step for in-game icons. They live in one
  module, `src/idle/icons.js`, as `export const ICONS = { id: '<path d>' }`
  plus `icon(id, size)` that returns an `<svg>` element.
- Colour comes from the existing `TIER_COLORS` in `ui.js` (move it into
  `icons.js` and import it back, so there is one source).
- Each icon must read at 20 px on a phone: at most about 6 path segments, no
  detail under 2 units.

### Tier icons (12)

Shown in the round run button of each row, replacing the plain circle.

| Tier | Drawing |
| --- | --- |
| Raspberry Pi | Small board: rectangle with 4 pin dots along the top edge |
| Gaming GPU | Card outline with one fan circle and a bracket on the left |
| Workstation | Tower case with a front slot and a power dot |
| Rack Server | Three stacked rounded slabs, each with an LED dot |
| GPU Cluster | 2x2 grid of small squares joined by short lines |
| Datacenter | Building with three rows of windows |
| Fusion Campus | Atom: one dot with two crossing ellipses |
| Dyson Inference Swarm | Sun circle ringed by 6 small dots |
| Orbital Compute Ring | Planet circle with a tilted ring across it |
| Lunar Datacenter | Crescent moon with a small building on its curve |
| Matrioshka Brain | Three nested circles, the inner one solid |
| Inference Singularity | Spiral into a centre dot |

### Manager icons (12)

One shared person silhouette (head circle plus shoulders arc), drawn in the
row's tier colour, with the tier icon as a small badge at the lower right
(10 px, on a dark disc). That gives 12 distinct managers from one drawing plus
the tier set, which keeps the work small and consistent. Hired managers also
show the silhouette inside the run button's corner on the Game tab.

### Achievement badges

One glyph per achievement kind, inside a shared hexagon frame:

| Kind | Glyph |
| --- | --- |
| owned | That tier's icon (tinted in its tier colour) |
| lifetime | Stacked coins |
| prestiges | The Weights diamond already used on the Prestige tab |
| taps | Pointer finger |
| rushGames | Lightning bolt |
| events | Clock with an exclamation mark |
| regions | Globe with one meridian |
| allPerks | Star |
| allManagers | Two person silhouettes |

Locked: frame and glyph in `#2a3446`, no fill. Unlocked: frame in the
achievement's colour (gold `#ffb547` for non-tier kinds), glyph in `#eef3f9`.

### App icon, home-screen install and splash

- `icons/app-icon.svg`: the Inference Singularity spiral in gold `#ffb547`
  on a `#0b0f17` rounded square, with the word mark omitted (icons read
  better without text). This is the master for every size.
- `tools/make-icons.js` renders the SVG to PNG with the Playwright already on
  the build box: 180 (`apple-touch-icon.png`), 192, 512 and 1024. The PNGs are
  committed so Pages needs no build.
- `manifest.webmanifest` with name "OVERCLOCK", `display: standalone`,
  `background_color` and `theme_color` `#0b0f17`, the 192 and 512 icons, and
  `start_url: "./"`. Add `<link rel="manifest">`, `<link rel="apple-touch-icon">`,
  `<meta name="theme-color">` and `apple-mobile-web-app-capable` to
  `index.html`. Paths stay relative (the site is served under `/vllm/`).
  Result: "Add to Home Screen" on the owner's phone gives a real icon and a
  full-screen game without the browser bar.
- Splash: a `#boot` div in `index.html` (the app icon, 96 px, centred on
  `#0b0f17`) that `app.js` removes once the first frame renders. It replaces
  the empty shell a slow load shows today. The native iOS launch screen comes
  later with the Capacitor phase and reuses the same SVG.

### Sample sheet

`tools/icon-sheet.html` renders every icon (tiers, managers, all badge
states, the app icon at 3 sizes) on one dark page at 20, 32 and 64 px. It is
for the owner to look at on a phone and for review. Building the game does not
wait on it; changes the owner asks for after seeing it are a follow-up pass.

### Out of scope

Animated icons, backgrounds or illustrations, a new font, and Shop art (the
Shop is still placeholders).

## 3. Buy button shows the count (owner, 2026-11-03)

Today the Max button reads `Buy xMax · 1.20M`, which looks like a cost in
millions with no idea how many levels you get. Every buy button now names the
number of levels and the cost separately:

- x1, x10, x100: `Buy 10` on the left, cost on the right (`1.20M`), as two
  spans in the button (the layout in the approved mockup).
- Max: `Buy 37` with the real affordable count from `maxAffordable`, cost on
  the right. With nothing affordable, show `Buy 1` and the single-level cost,
  disabled, so the next target is still visible.
- Under the button row, in the milestone line's small dim text, show the
  result: `112 → 149 owned`. If the buy crosses a milestone, add
  "· x2 speed!" in the tier colour.
- Locked rows stay `Unlock` plus cost.
- The cost always carries the token unit icon or the word "tokens" in
  aria-label, so screen readers say "Buy 37 Raspberry Pi for 1.2 million
  tokens".

Files: `ui.js` only (plus a CSS line in `index.html`). Do it in pass 1 with
the hints.

## 4. Fixed-height header (owner, 2026-11-03)

Today `#hud` is two flex columns. When the token number gets wider,
`#hud-right` (Weights chip, x1/x10/x100/Max, Rush chip) wraps to a second
line and the whole page jumps. The header becomes three fixed rows that never
change height or wrap, whatever the numbers are:

```
+------------------------------------------+
| 1.24M                        3.21K /sec  |  row 1, 44 px
| [◆ 3 Weights +30%] [Iowa] [Rush ready]   |  row 2, 28 px chips
| [  x1  |  x10  |  x100  |  Max  ]        |  row 3, 36 px, Game tab only
+------------------------------------------+
```

- Row 1: tokens on the left, per-second on the right, one line each,
  `white-space: nowrap`, `font-variant-numeric: tabular-nums` so digits
  don't jiggle as they tick. Tokens is 34 px; if the formatted string is
  longer than 7 characters it drops to 28 px (a class, not measured layout).
  Per-second is 14 px dim text, right-aligned.
- Row 2: one line of chips (Weights, region name, Rush, timed event when
  running). `flex-wrap: nowrap; overflow-x: auto` with the scrollbar hidden,
  so extra chips scroll sideways instead of adding a line. Hidden chips leave
  the row in place (the row always takes 28 px, even if empty).
- Row 3: the buy amount as a full-width segmented control (4 equal
  columns, 36 px tall, 44 px tap height via padding). It only shows on the
  Game tab; other tabs don't use it.
- `#hud` uses CSS grid with fixed row heights. Check at 320, 390 and 430 px
  wide with 999.99Qa tokens and all chips showing: no wrap and no height
  change while the numbers tick.

Files: `index.html` (markup and CSS) and the small `ui.js` code that fills
the header. Do it with the buy-count change (section 3); both touch the same
area.

## 5. Row tidy-up (owner feedback on the live art pass, 2026-11-03)

The owner's phone screenshot (390 px wide) shows each row about 330 px tall,
so only about 3 rows fit on screen, and the rows look busy. The approved
mockup (CYCLES-DESIGN) fit 5. Problems and fixes, all CSS plus small
`ui.js` changes:

| Seen | Fix |
| --- | --- |
| Count pill hangs off the ring's bottom edge and clips it | Put the count inside the ring under the glyph, as in the mockup: 56 px ring, 22 px glyph, 12 px bold count below it, all centred. No pill. Never truncate the count (no ellipsis). |
| Manager mark draws as a stray curl on the ring's lower right | Remove the mark from the ring. A managed row shows its state in the status text ("Auto") only. |
| Buy button is two lines and ~90 px tall | One line, 40 px tall: `Buy 1 level` on the left, `494 tokens` on the right (two spans, `justify-content: space-between`). Bold left, mono right. |
| "Auto" floats in its own column beside the button | Move status into the top row, right-aligned after the name block (`Auto`, the countdown, or the cycle time). The Buy button then spans the full card width. |
| Bar fill is a muddy brown (amber at 22% opacity) | Fill with the row's tier colour at 85% opacity; payout text white with `text-shadow: 0 1px 2px #0008` so it reads on both fill and empty track. Bar height 26 px, radius 13 px. |
| x1 / x10 / x100 / Max bar is square, heavy and touches the rows | Rounded inset control like the mockup: 36 px tall, track `var(--bg)` with 3 px padding and 10 px radius, active segment 8 px radius. 12 px margin left and right and 8 px below. |

Target layout per row (card padding 10 px, gap 8 px):

```
[ring 56] Raspberry Pi            Auto
          x2 speed at 50
[==== tier colour bar  +389.8K ========]
[ Buy 1 level                494 tokens ]
```

About 140 px per row, so 4-5 rows fit on a 390 x 844 phone.

Acceptance: screenshot at 390 x 844 shows at least 4 full rows; no element
overlaps the ring; the count shows in full at 4 digits; the bar fill uses each
tier's colour; tests pass.

Build as small tasks, one at a time: (a) ring with count inside and manager
mark removed; (b) one-line Buy button and status moved to the top row;
(c) bar colour and size; (d) buy-amount control styling.

## Build passes

Keep each Qwen pass to a few files; check the live site under `/vllm/` after
each push.

No wasted compute (owner, 2026-11-03):

- One pass at a time per file; never two jobs on `ui.js` or `index.html`.
- Qwen writes all the code; Claude does not (owner, 2026-11-03). Claude
  designs, splits the work, briefs and reviews.
- Tasks are small: one function or one small file each, with the exact code
  it touches pasted into the brief, a test command it must pass, and a diff
  back. Wiring into `ui.js` and `index.html` is its own small task per spot.
- A task gets one retry. If it loops, hits its call cap or fails the tests
  twice, stop it and split it smaller before the next try.
- Kill any test servers and browsers a pass leaves running.
- After each pass, push and post one line in the thread, so a stall shows up
  as silence on the thread rather than an idle session.

1. Hints and the row text cleanup: `hints.js`, hooks in `ui.js`, `save.js`,
   `settings.js`, tests.
2. `icons.js` with the 12 tier icons and `TIER_COLORS`; run buttons use them;
   `tools/icon-sheet.html`.
3. Manager silhouettes and achievement badges, wired into the Upgrades and
   Achievements views.
4. App icon SVG, `tools/make-icons.js`, PNGs, manifest, `index.html` head
   tags and the boot splash.
5. Buy-count buttons (section 3) and the fixed header (section 4) together,
   after the art passes because they share `ui.js` and `index.html`.

Acceptance: all tests pass; at 390 px wide every icon is recognisable and
nothing overlaps; the version stamp script covers `icons.js` and `hints.js`;
Add to Home Screen on iPhone shows the app icon.
