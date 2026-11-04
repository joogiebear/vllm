# UX overhaul: build plan

Status: APPROVED by the owner ("This looks awesome", then "Go", 2026-11-04 20:03 UTC).
Source: docs/UX-REVIEW.md (the review) and the mock-up
https://claude.ai/artifact/9yQ4np8RGkZF8B3LMFGESV (13 screens). The mock-up is the
visual reference; match it. Builder: Claude writes the code directly (owner, 2026-11-04:
no Qwen). Design owner: thread Claude. Supersedes docs/UX-PLAN.md where they differ.

iOS work stays paused until this overhaul is live.

## Owner's answers to the review's questions (defaults stated in the thread, not overruled)

1. First Pi cycle: `cycleSeconds` 7 -> 2 in data.js. Rate per second unchanged (tps 1),
   so a cycle pays 2. Re-run tools/idle-balance.js and note the first-manager time.
2. Region perks are paid in **Region credits**, a separate counter, so a perk never reads
   as losing Regions. One credit per Region earned; old saves get credits = Regions earned
   minus credits already spent on perks. The x2-per-Region multiplier is unchanged.
3. The iOS app will be a native wrapper (Capacitor or WKWebView). Haptics and iCloud
   rows in Settings show only in that build; hide them on the web.
4. The goal line stays on purchases and resets; events stay in the header pill and their card.

## Batches (one release each, tools/release.sh must pass, smoke checks for each)

**A. Fixes first**
- Safe areas: `padding-top: env(safe-area-inset-top)` on the header and sub-screen title
  bars; keep the bottom inset on the tab bar.
- Settings backup slots: empty slots say "Empty" (the label is built but never appended).
- Welcome back: pass `affordable` so "You can now afford" shows; number first and biggest;
  hold toasts until the card closes.
- No achievement toasts in the first 2 minutes of a brand-new save (show them as a badge on More).

**B. Shell: header, tabs, no heading cards**
- Header: one 54 px row (balance + "tokens", real rate, one pill for Weights/Region or the
  live event) plus a 36 px goal line that is a button and holds the "?". Rename the goal
  state "Open" to "Ready". Region name moves into the pill.
- Remove the per-tab heading cards.
- Buy-amount control becomes a sticky row inside the Servers list, shown from 2 machines owned.
- Five icon tabs: Servers, Managers, Upgrades, Progress, More. No second-level switchers.

**C. First run**
- Pulsing Pi icon, status "TAP TO BOOT", coach mark as an inline card under the Pi (never over it),
  rate line "0 per sec · nothing running yet" then "1 machine running", goal line walks
  boot -> second Pi -> Cron Job.

**D. Progress tab (replaces Prestige)**
- One scroll ladder: Prestige -> Weights card (bar, button, keeps line, Weight upgrades),
  Regions card (locked with the 2,000 Weights bar, resets and keeps, Expand button),
  Region perks card (Region credits).
- Reset confirm: bottom sheet with You gain / You lose / You keep, primary button and
  "Not yet". Expand's sheet says in red that Weights reset. Replaces double-tap arming.
  Setting "Confirm before resets" (on by default).
- New-run moment: full-screen "Generation N, +X Weights" card with "Boot it".

**E. Rows, Managers, Upgrades**
- One button grammar: verb line one, price line two; amber affordable, outline not,
  green done, dashed with the rule when locked.
- Machine rows: status word right of the name (Auto · manager green / countdown / TAP TO RUN amber);
  drop the "1 / 25 · next" line; whole 60 px icon column is the run target; bar 24 px; "+N" floats on payout.
- Managers: hired, hireable and the next two at full size; later ones collapsed to one line
  with the price range; Region-gated ones collapsed to one locked line; disabled text "Needs 1 / <machine>".
- Upgrades: groups (Boost everything / One machine / Prompt cache), machine icon on per-machine rows,
  far-off upgrades collapsed, x5 round as one locked line, sticky "Buy all N ready · total" footer.
  Global-milestone line moves to Progress once any tier passes 100.

**F. More and Settings**
- More: grouped list (Achievements with count and "N new", Stats, How to play; Settings,
  Support OVERCLOCK; About).
- Settings: Feel (sound, haptics*, reduce motion, numbers), Play (confirm resets, show tips again),
  Save (iCloud sync*, backups, export, import), Delete all progress in red with a two-step sheet.
  Save codes behind rows, no always-visible text areas. (*native build only)
- Support row and screen: per docs/SUPPORT-DESIGN.md, shown only in the native build.

Keep: Next buy mode, art, colours, number format, tab dots, events, the locked-but-visible rule.
Save compatibility: every batch loads test/fixtures/late-save.json and a fresh save.
