# Roadmap

Goal: a polished idle game that can ship on the iOS App Store. Items are grouped into milestones.
Items marked **(parallel)** touch their own files and can be built side by side.

## Decisions needed before an App Store release

1. **License.** GPL-3.0 and the App Store's terms are widely considered incompatible, which is why
   GPL apps such as VLC were pulled in the past. As the sole copyright holder you can still publish
   your own build, or dual-license it. That stops being simple once anyone else contributes code.
   Decide before accepting outside contributions.
2. **Money.** Apple requires its own in-app purchase system for anything digital sold in the app,
   including the Shop items. A tip jar also has to use it. Apple takes 15% under the Small Business
   Program. Paid up front, free with cosmetic purchases, and free with no purchases are all options.
3. **Accounts and costs.** An Apple Developer membership costs $99 a year. Building needs a Mac with
   Xcode; the Mac mini on the network will do.

## Milestone 1: depth (what keeps people playing)

- **Achievements (parallel).** Around 40, for owned counts, lifetime tokens, prestiges and managers.
  Each gives a small permanent bonus. New tab or a section in More.
- **Stats page (parallel).** Lifetime tokens, play time, prestiges, best run, and a history graph.
- **Events (parallel).** Occasional timed events such as "Traffic spike: x3 for 30s", tapped to claim.
  These give active players something to do.
- **Second prestige layer.** Something like "New datacenter region" once Weights are high: resets
  Weights for a bigger permanent multiplier and unlocks new tiers.
- **More content.** Tiers 9 to 12 and their managers, and per-tier milestone rewards beyond speed.
- **Welcome-back report.** What was earned while away, and a list of what can now be bought.

## Milestone 2: polish and feel

- **Art (parallel).** Drawn icons for each tier, an app icon, and a splash screen, replacing the
  placeholders. Keep them simple vector shapes so they stay sharp on every device.
- **Sound and haptics (parallel).** Soft sounds on payouts and purchases, haptics on iOS. A mute
  switch, on by default during quiet hours.
- **Onboarding.** A 30-second guided start: tap the Pi, buy a second, hire a manager.
- **Number settings.** Short names or scientific notation.
- **Accessibility.** VoiceOver labels, Dynamic Type, reduced motion, and colour contrast checks.

## Milestone 3: ready for a phone

- **PWA.** A manifest and a service worker, so it installs to the home screen, works offline and
  starts instantly. This is also the base for the app build.
- **Saves you cannot lose.** Keep two rotating local saves, export as a file, and on iOS sync through
  iCloud key-value storage.
- **Notifications.** Optional local notifications such as "Your servers have earned 1.2M", with no
  server needed.
- **Performance.** Test on an older iPhone. Keep the main loop cheap and the battery use low while idle.
- **Real-device testing.** Safari on an actual iPhone for each release, since the emulator has missed
  real bugs.

## Milestone 4: App Store

- **Wrapper.** Capacitor packages the existing web game as a native iOS app. Few code changes needed.
- **Native extras.** Haptics, local notifications, Game Center achievements and leaderboards, and iCloud
  saves. Apple can reject apps that are only a website in a wrapper (guideline 4.2), and these
  features help show it is a real app.
- **In-app purchases**, if chosen: StoreKit through a Capacitor plugin. Server-side receipt checks are
  optional at this size.
- **Store requirements.** A privacy policy page (the game collects nothing, which keeps it simple), the
  age rating questionnaire, screenshots, a description, and a support URL.
- **TestFlight.** A beta for friends before release.
- **Android** later, from the same Capacitor project.

## Working method

- Claude designs, reviews in a browser at phone width, and checks every release on the live site.
- Qwen implements through Hermes in small passes, with up to 2 or 3 passes in parallel when they do
  not share files.
- `sh tools/stamp.sh` before each push.
