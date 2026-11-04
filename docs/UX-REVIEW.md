# UX review (independent, 2026-11-04)

Status: FOR OWNER REVIEW. Nothing here is approved or built yet. Mock-up: see the thread link (also `overclock-ux-review/mockup.html` in the project files). Screenshot file names below refer to the reviewer's working folder, not the repo.


Reviewed 2026-11-04 against the repo clone, served locally and played in a 390x844 touch viewport (Playwright, iPhone profile). I played a fresh start for the first ten minutes, a hand-built "ten minutes in" save with a two-hour absence, an event offer, the late-game fixture (`test/fixtures/late-save.json`), a real prestige, and a Regions-ready save. Screenshots are in `shots/` (prefix `f` fresh, `m` ten minutes, `e` event, `l` late, `r` regions). The mock-up is `mockup.html`; its rendered screens are `mock-*.png`. Mock-up screens are named in bold below, for example **Home (10 min)**.

I read the design docs for intent only. The judgements below are from the screen.

## Verdict

The game logic and content are in better shape than the interface. The rules are clear, the art is good, and the owner's two rules (nothing hidden, no pay-to-win) are already honoured in the code. The interface, though, is a desktop web layout squeezed into a phone: a third of the first screen is chrome before the first machine appears, five text-only tabs hide two more levels of switchers, every tab repeats a heading card, and the biggest decisions in the game (prestige, expand) are armed by a double tap. The first sixty seconds are the weakest part: the new player sees an achievement toast before the tutorial hint, then taps once and waits seven seconds for seven tokens. I recommend an overhaul of the shell (header, tabs, Prestige and More tabs, confirms, first run) and a tidy of the rows, while keeping the row model, the Next buy mode, the goal strip idea, the art and the colour scheme. None of the recommendations need rule or balance changes except one, which I flag as a question.

## What works

- The machine row model is right for the genre: round icon with a count, payout bar, Buy button, a status word. Keep it (`f05-after-buy.png`).
- The Next buy mode is the best idea in the UI. "Buy 13 -> 25, 2.8K" tells the player exactly what they get. Keep it as the default (`m02-servers-10min.png`).
- Locked layers are visible with their rule: "Regions unlock at 2,000 Weights earned (you have 0)", "Unlocks at Iowa (1 Region)", "6 more tiers to discover". This is rare and good. Keep the principle (`f09-regions-locked.png`, `f06-managers.png`).
- Amber for "you can afford this", green pill for "done", grey outline for "not yet". One colour rule, applied everywhere (`l06-upgrades.png`).
- Manager portraits and machine icons give each row a face. They are the best thing on screen (`f06-managers.png`).
- Tab dots for "something affordable here" work. The event chip in the header ("Turbo 0:30") is small and clear (`e02-event-active.png`).
- Plain-English effect lines on every upgrade ("All production x2", "Earn 75% of your rate while away"). No internal codes leak.
- The welcome-back card is the right shape and the right moment (`m01-welcome-back.png`).
- Dark theme, 44 px targets on most buttons, system font, tabular numbers. The basics are there.

## What doesn't

Ranked by impact. Each item names the screen and what I saw.

1. **The first minute is wrong.** On a brand-new game the first thing on screen is a toast, "Achievement: Raspberry Pi: First Boot", awarded for owning the starter Pi (`f01-fresh.png`). The tutorial hint waits while a toast is up (hints.js `check()`), so the player's first seconds show a reward for nothing and no instruction. The hint then arrives as a bubble that covers the Pi card it points at, hiding the "Tap to run" label and most of the icon (`f04-can-buy.png`). The first tap starts a seven-second bar for seven tokens (`f02-after-tap.png`); a second Pi costs 18, so the player taps three times and waits 21 seconds before the first purchase, and roughly 90 seconds before the first manager. Meanwhile the header says "1.0 per sec" while nothing is running (`f01-fresh.png`), which is false until the Pi is tapped.
2. **Too much chrome above the fold.** On the Servers tab the player scrolls past: token row (56 px), buy-amount control (44 px), goal strip (42 px), and a "Servers: Your machines earn tokens" heading card with a "?" (80 px). The first machine starts at y = 250 of 844, and only two and a half rows fit on screen (`f01-fresh.png`, `l01-servers-top.png`). The heading card repeats on every tab and never changes. The buy-amount control is shown to a player who owns one machine and cannot buy anything yet.
3. **No safe-area handling at the top.** `#hud` has no `padding-top: env(safe-area-inset-top)`; only the tab bar and toast handle the bottom inset. The app sets `apple-mobile-web-app-status-bar-style: black-translucent`, so on an iPhone home-screen install or a WKWebView wrapper the token count sits under the status bar and Dynamic Island. This is a release blocker for the iOS build.
4. **Navigation is three levels deep and the second level is invisible.** Five text-only 13 px tabs; the Prestige tab holds a Weights | Regions switcher, the More tab holds an Achievements | Stats | Settings switcher (`f08-prestige.png`, `f10-more-achievements.png`). Regions, the second reset layer, is a tab inside a tab. Settings is two taps away and the More tab remembers your last sub-tab, so where you land changes between visits.
5. **Destructive resets are armed by a double tap.** Prestige and Expand turn red on first tap and fire on the second (`l09-prestige-armed.png`, `r03-expand-armed.png`). A stray second tap resets the run, and for Expand it also wipes all Weights and Weight upgrades. There is no sheet that says what is gained, lost and kept at the moment of the decision; that text is in a dim line under the button. After prestige the player is left on the Prestige tab looking at a greyed-out button and a six-second banner that says "New run: buy a Raspberry Pi" (`l14-after-prestige.png`). The biggest moment in the game has no moment.
6. **Button grammar differs on every tab.** Servers: "Buy 25 -> 50 / 105.1K tokens". Managers: "Hire / 100 tokens". Upgrades: a button whose only label is the price, "1.0K" (`l06-upgrades.png`). Weights: "Buy / 1 Weight". Perks: "Buy / 2 Regions". A new player learns four button styles for one action.
7. **The Upgrades tab opens with noise.** Top to bottom: a heading card, a nearly invisible disabled "Buy all", then a grey line "All tiers at 100: x2 production. Lowest now: Gaming GPU 0", which means nothing to someone with two machines (`f07-upgrades.png`). Then 19 identical rows with no icons and prices up to 5.0B. Nothing is grouped and nothing says which upgrades matter now.
8. **The Managers tab is three screens of "Own a X first".** Twelve rows from the first minute, long disabled labels ("Own a Dyson Inference Swarm first") that push names onto two and three lines (`f06-managers.png`, `l05-managers-bottom.png`). The rule says show it; it does not say show it at full size.
9. **The Prestige tab says "prestige" four times before the button.** Segmented control, heading card, a hint card ("Next weight at 100.0B lifetime", "Current bonus +0%"), then a "Prestige now" card with the same sentence again (`f08-prestige.png`). The progress bar is empty for the whole first session and gives no sense of time. Weight upgrades are listed below as seven "Buy / N Weights" rows the player cannot touch for hours.
10. **Settings is a developer panel.** Two always-visible empty text areas for save codes, a "Delete all progress" button one row below "Paste save code", three blank rounded pills under "Backups" with no text at all (`f13-more-settings-bottom.png`). The pills are a bug: in `buildSettings()` the "Empty" label is created but only appended when a slot is not null, so empty slots render as bare boxes. "Show tips again" is a small loose button with no row.
11. **Welcome-back card buries the number.** "Your managed servers earned 64.8K" is one orange sentence in 30 px; the amount is the least visible word (`m01-welcome-back.png`). The code supports "You can now afford: 2 upgrades, 1 manager" but app.js never passes `affordable`, so that line never shows. An achievement toast fires behind the modal at the same time.
12. **Small things that add up.** Row milestone text "1 / 25 · next: x2 speed" is 11 px dim jargon. The goal strip's right side says "Open" when a goal is affordable; "Open" reads as a verb, not a state. The payout bar (28 px) is a tap target under the 44 px minimum, and the tappable area is the icon or the bar, not the "Tap to run" label the eye lands on. The background art shows only in slivers between cards and sits behind text on Upgrades. Achievement toasts (69 of them) cover the bottom buy button of whatever list is open (`l03-servers-bottom.png`). Region perks are "bought with Regions", so "Buy / 2 Regions" reads as losing two regions; the design says the multiplier is kept, the button does not. The region name is tacked onto the rate line ("195.6K per sec · Iowa").

## Recommendations

Ranked. Each is marked keep, fix or overhaul.

1. **Overhaul the first run** (**First run**, **First run: booting**). No toasts for the first two minutes; achievements earned then are shown as a badge count on More. The coach mark sits under the card it talks about, never over it. The Pi icon pulses until tapped and the status word is "TAP TO BOOT". The rate line says "0 per sec · nothing running yet" and then "1 machine running". The goal line names the next three steps (boot, second Pi, Cron Job). No buy-amount control until the player owns two machines; the next tier stays visible with its price. Question 1 below covers the seven-second cycle.
2. **Overhaul the header and drop the heading cards** (**Home (10 min)**). Header = safe area + one 54 px row (balance with "tokens" unit, real rate, one pill for Weights/Region or the live event) + one 36 px goal line that is also a button. The buy-amount control moves into the list as a sticky 34 px row. The "?" lives on the goal line, not in an 80 px card. First machine at about y = 190 instead of 250, four rows on screen instead of two and a half.
3. **Fix the safe areas** (every mock screen). `padding-top: env(safe-area-inset-top)` on the header and on sub-screen titles; keep the bottom inset on the tab bar. Test as a home-screen install, not only in Safari.
4. **Overhaul navigation to five icon tabs with no switchers** (every mock screen): Servers, Managers, Upgrades, Progress, More. Icons plus 10 px labels, 49 px plus inset. Progress replaces Prestige and holds both resets in one scroll. More is a grouped list. Nothing is two taps away that was one tap away before.
5. **Overhaul the Prestige and Regions screens into one ladder** (**Progress ladder**). Three cards top to bottom: Prestige -> Weights (bar, "Prestige for +31 Weights" button, keeps line, Weight upgrades under it), Regions (locked card with the 2,000 Weights bar and what it resets and keeps), Region perks (locked, lists the six names). Every layer visible from minute one with its rule, which is the owner's requirement, without a switcher.
6. **Fix the confirms: a sheet, not an armed button** (**Prestige confirm**, **New run moment**). Bottom sheet with "You gain / You lose / You keep", one primary button, one "Not yet". Same sheet for Expand, which must say in red that Weights reset. After the reset, a full-screen "Generation 2: +31 Weights" card with one button back to the Pi, so the reset is a reward, not a banner.
7. **Fix the button grammar** (**Home**, **Managers**, **Upgrades**, **Progress**). One rule: verb on line one, price on line two, amber when affordable, outline when not, green "Hired/Owned" when done, dashed outline with the rule when locked. Servers rows keep "Buy 13 -> 25" with the price on the right and the milestone reward ("x2 speed") inline, since that is what Next is for.
8. **Fix Upgrades** (**Upgrades**). Group by what they boost (everything, one machine, prompt cache), put the machine icon on per-machine rows, collapse upgrades more than two price steps away into one "10 more upgrades" row, show the x5 round as one locked line with its rule, and make Buy all a sticky footer that says how many are ready and the total. Drop the global-milestone line from this tab; it belongs on Progress once any tier passes 100.
9. **Fix Managers** (**Managers**). Keep the four rows around the player at full size (hired, hireable, next two), collapse later managers into one line with their price range, collapse Region-gated managers into one locked line with the Region numbers. Disabled label is two words: "Needs 1 / Workstation".
10. **Fix the welcome-back card** (**Welcome back**). Number first and biggest ("+64.8K"), one line naming why it earned ("Cron Job kept the Pi running"), chips for what is now affordable (wire the `affordable` argument that already exists), the cap note in small text. Hold toasts until the card closes.
11. **Overhaul More and Settings** (**More**, **Settings**). More = grouped list: Achievements (with count and "3 new"), Stats, How to play; Settings, Support OVERCLOCK; About. Settings = real toggles in three groups (Feel, Play, Save); save export, import and backups behind rows, not text areas on the page; Delete at the bottom in red with a two-step confirm sheet. Fix the blank backup pills.
12. **Add the Support row the owner wants** (**More**, **Support**). One quiet row in More: "Support OVERCLOCK: optional tip jar, cosmetics only". The screen behind it has three tip sizes and the thank-you cosmetics. It is the only place money appears. Hidden in the web build.
13. **Keep** the Next buy mode, the row layout, amber/green/grey states, portraits and tier art, the event chip and banner, the number format, tab dots, and the locked-but-visible rule.
14. **Fix row details** (**Home**). Status word on the right of the name in one of three states: "Auto · Cron Job" (green), countdown, "TAP TO RUN" (amber). Drop the "1 / 25 · next: x2 speed" line; the count pill and the Buy button carry it. Make the whole icon column the run target at 60 px and give the bar 24 px with the payout centred. Float "+7" from the bar on payout. Put the region name in the header pill, not the rate line. Rename the "Open" state on the goal line to "Ready".

## Proposed new screen structure

Navigation model: one tab bar, five tabs, no second-level switchers. Sub-screens (Settings, Support, Achievements, Stats, How to play, Backups) push from More with a back arrow. Modals are limited to three: welcome back, reset confirm sheet, new-run moment. Coach marks are inline cards in the list, never overlays.

| Tab | Screen | What lives there |
| --- | --- | --- |
| Servers | **Home** | Header (balance, rate, Weights/Region or event pill), goal line, sticky buy-amount row, machine rows in tier order: owned, next unowned with price, next Region-gated tier as a locked row with its rule, footer with the count of tiers still to come. Event offer appears as a card above the first row. |
| Managers | **Managers** | Rows in tier order with portraits. Hired, hireable, next two at full size; later managers collapsed to one line; Region-gated managers collapsed to one locked line. One note on what resets. |
| Upgrades | **Upgrades** | Three groups (everything, one machine, prompt cache), far-off upgrades collapsed, x5 round as a locked line, sticky Buy all footer with count and total. |
| Progress | **Progress ladder** | Prestige card (bar, button, keeps line, Weight upgrades), Regions card (locked or ready, bar, resets and keeps, Expand button), Region perks card. Global milestone line once relevant. Reset confirm sheet and new-run moment open from here. |
| More | **More** | Grouped list: Achievements, Stats, How to play; Settings, Support OVERCLOCK; About. |
| More > Settings | **Settings** | Feel (sound, haptics, reduce motion, numbers), Play (confirm resets, show tips again), Save (iCloud sync on iOS, backups, export, import), Delete all progress. |
| More > Support | **Support** | Tip jar, three sizes, thank-you cosmetics, later cosmetic packs. iOS only. |
| Overlay | **Welcome back** | Amount, reason, affordable chips, Collect. |
| Overlay | **Prestige confirm** | Gain, lose, keep, Prestige, Not yet. Same sheet for Expand. |
| Overlay | **New run moment** | Generation number, Weights earned, new bonus, Boot it. |

Header is identical on Servers, Managers, Upgrades and Progress so the balance never jumps. More and its sub-screens use a plain title bar instead.

## First-session flow

Minute by minute for a new player on an iPhone, with the proposed UX.

- **0:00** App opens straight to **First run**. Balance 0 tokens, "nothing running yet". One Pi card with a pulsing icon and "TAP TO BOOT". Coach mark under the card: tap the Pi, it pays 7, a second Pi costs 18. Gaming GPU shown below at 500. Footer: 10 more machines, 4 need Regions. No toast, no buy-amount row.
- **0:05** Player taps. Countdown on the row, bar fills, the coach mark changes to "Booting... three boots pay for a second Pi, at 100 you can hire Cron Job". Goal line reads "buy a second Pi 0 / 18" (**First run: booting**). Payout floats "+7" into the balance.
- **0:30** After three boots the Buy button turns amber. Goal line says Ready. Player buys; the card flashes, count pill reads 2, goal line moves to "hire Cron Job 20 / 100". A dot appears on Managers when 100 is reached.
- **1:30 to 2:00** Player taps through to 100, opens Managers, hires Cron Job (the only amber button on the screen), returns to Home. The Pi row now says "Auto · Cron Job" and the pulse is gone. Buy-amount row appears now that there are two machines.
- **2:00 to 4:00** Goal line steers to Quantization (100) on Upgrades, then back to Pis toward 25 with "Buy N -> 25 x2 speed". First achievement badge appears on More, quietly.
- **4:00 to 6:00** Gaming GPU unlocks at 500. Its row shows "TAP TO RUN" in amber so the player learns a new machine needs a boot. The first timed event arrives at about two minutes of play and shows as a card above the rows with a 20 second bar; claiming it puts a "Turbo 0:30" pill in the header.
- **6:00 to 10:00** Driver Daemon at 15K is the next long goal. The goal line shows the running count. Player opens Progress once out of curiosity and sees the whole ladder: Prestige at 100B lifetime, Regions at 2,000 Weights, perks after that. Nothing to do there yet, but nothing is a mystery.
- **Later that day** Player returns. **Welcome back** shows "+64.8K", "Cron Job kept the Pi running", chips "2 upgrades ready, 1 manager ready". Collect, then the two tab dots say where to go.

## Open questions for the owner

1. The first Pi cycle is 7 seconds for 7 tokens, so a new player waits about 90 seconds before the first manager. Is that intended? A 1 to 2 second first cycle (balance change, not a UX change) would make the first minute feel like a phone game. The mock-up assumes the current numbers.
2. Region perks are paid in "Regions" while the Region count also sets the x2 multiplier. Would you rename the perk currency (for example "Region credits") so "Buy / 2 Regions" does not read as losing two regions?
3. Is the iOS build a native wrapper (WKWebView or Capacitor) or a home-screen web app? The answer decides whether haptics, iCloud sync and the Support row can exist, and the mock-up shows all three.
4. Timed events are the only reason to check in between purchases. Should the goal line ever point at an event, or stay on purchases only? The mock-up keeps events in the header pill and the card above the rows.
