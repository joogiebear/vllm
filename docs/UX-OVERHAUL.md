# UX overhaul

The screen is a wall of numbers. The player should see their server room grow, and should always
know the one thing worth doing next. Rules and balance do not change: `core.js` and `data.js` stay
as they are.

## Principles

1. **One number matters.** Tokens and rate are the only numbers shown large. Everything else is
   small, or hidden until asked for.
2. **Show, then tell.** Growth and heat are seen in the machine, not read from a table.
3. **One clear next step.** The best purchase is highlighted. Rows are not all shouting at once.
4. **Short numbers.** Never more than 3 significant figures on screen: `502K`, `1.23M`. Below 1,000
   show whole numbers. No commas. Exact values appear only in a generator's details.
5. **Calm by default.** Unaffordable things recede. Things that can be bought get colour.

## Game tab, top to bottom

### Header

Tokens large, rate beside it in smaller text. Weights appear only after the first is earned, as a
small magenta chip. Heat is not here.

### The rack: the new centrepiece

A visual server rack, built with DOM and CSS (`src/idle/rack.js`), about 200px tall on a phone.

- One horizontal unit per owned generator tier, stacked from the bottom. Each tier looks different:
  a small green board for Pi, a card with a fan for Gaming GPU, wider chassis further up, and so on.
  CSS shapes only.
- Each unit has a row of LEDs. Lit LED count grows with owned count, up to 12 per unit.
- LEDs blink. The blink rate speeds up with production, capped so it does not strobe. Respect
  `prefers-reduced-motion` by not animating them.
- A tier appears with a short slide-in the first time you own one.
- **Tapping the rack is Serve.** The whole rack is one large `<button>` labelled "Serve", with
  floating +N numbers. Remove the separate Serve button. Add a brief press effect.
- **Heat is shown on the rack**, not as a panel: the rack's outline and glow shift from cool cyan
  through amber to red as heat rises. Throttled: units dim and flicker, with a small "THROTTLED"
  label. Overclocked: LEDs turn amber.
- Below the rack, a single slim row: a thin heat bar and an Overclock switch. No numeric heat value
  and no "COOLING" text. The switch is disabled while throttled.

### Next best buy

Directly below that, one highlighted card: the affordable or nearest generator or upgrade with the
best gain per cost, for example `Dynamic Batching  +1.1K/s  [Buy 1K]`. It updates live. With nothing
useful it shows the next goal. Add a pure helper for this in `src/idle/advice.js`, with tests.

### Generators

- A compact x1, x10, Max segmented control, as the section's header.
- One row per generator at most 56px tall, on one line:
  `Name  x12` on the left, and on the right a single button such as `+60/s  20K`.
- A thin bar along the row's bottom edge shows progress to affordable. Remove the "x2 at 25",
  "Producing" and share lines from the row.
- Affordable: bright lime button. Not affordable: dim button with the bar visible.
- Only show the next unowned tier plus all owned ones. Later tiers stay hidden until reached.
- **Tapping the name area expands that row** to show details: producing now, share of total, gain
  per unit, next doubling. Only one row is open at a time.

### Rush

A small chip row beneath generators: `Rush ready · Play` when available, `Rush in 7:32` otherwise.
Tapping the info icon shows the current explanation. Remove the large card.

## Upgrades tab

One-line rows at most 56px tall in the same style: name and short effect on the left, and a button
with the price on the right, plus a gain if it has one. Sort by cost as now. Unaffordable rows dim.
Owned rows shrink to a thin single line with a check mark, in place. Buy All stays pinned at the top.

## Prestige tab

Top: a progress bar to the next Weight with one sentence: "12% of the way to your first Weight".
Then the current bonus in one sentence. Then the button and what resets. Weight upgrades use the
same one-line rows.

## Motion

Small touches only: buy flash on the row, +N floats, tier slide-in. All disabled under
`prefers-reduced-motion`. Nothing may cause layout jumps, so buttons do not move under a finger.

## Not changing

The bottom menu, the scrolling layout, Shop, Settings, the arcade, saves, rules and balance.
