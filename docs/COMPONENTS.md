# UI components

`src/idle/components.js` holds the game's reusable interface pieces. Each one
is accessible and handles its loading and edge cases. They are plain DOM with
no framework, build step or dependency, the same as the rest of the game.

## Architecture

```
data.js      rules and numbers (no DOM)
core.js      the game model: state in, state out (no DOM)
advice.js    the next goal and best buy (no DOM)
fmt.js       number format (no DOM)
components.js
  pure helpers   clampFraction, percent, accessibleName, variantClass
  DOM factories  el, Button, bindProgress, Dialog, Toggle, announce, ArtImage
icons.js     drawn icons and art (uses ArtImage)
ui.js        the screens: builds rows once, updates them every frame
```

Three rules hold throughout:

1. **Build once, update in place.** A factory builds its DOM a single time and
   returns a handle such as `{ el, set() }` or `{ el, open(), close() }`.
   Callers update the handle and never rebuild the element. Rows therefore
   keep their height, nothing moves under a finger, and `ui.js` can call
   `set()` every frame cheaply.
2. **The DOM is for display only.** Factories hold no game state. The game
   state lives in `core.js`, and callers pass in what to show.
3. **The pure parts are unit-tested and the DOM parts are smoke-tested.**
   `test/components.test.js` covers the helpers and the number edge cases.
   `tools/smoke.js` drives the real page in headless Chrome and covers
   focus, Escape, names, bar values, switches and the art fallback.

## Components

### `el(tag, props, children)`

A small DOM builder. Every other factory uses it.

| Prop | Type | What it does |
| --- | --- | --- |
| `className`, `id`, `type` | string | Set the attribute of the same name. |
| `text` | any | `textContent`. Never HTML, so it is safe for player data. |
| `hidden` | boolean | Starts the element hidden. |
| `attrs` | object | Attributes. `true` sets an empty attribute; `false`, `null` and `undefined` are skipped. |
| `style` | object | Inline styles. |
| `on` | object | Event listeners, for example `{ click: fn }`. |
| `children` | array | Nodes or strings. `null` and `false` are skipped. |

```js
const card = el('div', { className: 'layer', attrs: { role: 'note' } }, [
  el('b', { text: 'Regions' }),
  'Unlock at 2,000 Weights',
]);
```

### `Button(props) -> { el, set(props) }`

The one button grammar: the verb on line one and the price or detail on line
two. Screen readers hear both lines as one name, for example "Hire, 15.0K".

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `label` | string | `''` | Line one, the verb. |
| `sub` | string | `''` | Line two. Hidden when empty. |
| `variant` | `'default' \| 'primary' \| 'done' \| 'lock' \| 'danger'` | `'default'` | Amber, outline, green, dashed or red. |
| `disabled` | boolean | `false` | A real `disabled` attribute, so the button is skipped by keyboard and clicks. |
| `onClick` | function | | |
| `className` | string | | Any extra layout class. |

```js
const hire = Button({ label: 'Hire', sub: '15.0K', variant: 'primary', onClick: () => buyManager(state, 'gamer') });
row.append(hire.el);
// later, every frame:
hire.set({ variant: state.tokens >= 15000 ? 'primary' : 'default', disabled: state.tokens < 15000 });
```

Rows that already exist use `setLines(r, line1, line2)` in `ui.js`. It gives
the same spoken name.

### `bindProgress(track, fill, { label, mode }) -> { set(fraction, valueText) }`

Turns an existing bar into a real progress bar: `role="progressbar"`, a name,
`aria-valuemin`, `aria-valuemax`, `aria-valuenow` and a spoken value text.
`mode` is `'width'` (the default) or `'scale'` (for bars animated with
`transform`).

```js
const bar = bindProgress(track, fill, { label: 'Progress to the next Weight' });
bar.set(total / need, `${fmt(total)} of ${fmt(need)} lifetime tokens`);
```

Edge cases: the fraction is clamped to 0–1. A missing or zero `need` counts
as done, and `NaN` or infinity counts as nothing yet (see `clampFraction`).

### `Dialog(props) -> { el, panel, open(initialFocus), close(), isOpen() }`

One modal for every pop-up: the help cards, the reset sheet, the new-run
moment, the welcome-back card and the backup restore confirm. The last two
are one-offs: they build a Dialog each time and remove its element in
`onClose`.

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `overlayClass` | string | | The backdrop (for example `reset-ov`). |
| `panelClass` | string | | The panel (for example `reset-sheet`). |
| `labelledBy` | string | | The id of the panel's title; screen readers read it as the dialog's name. |
| `closeOnBackdrop` | boolean | `true` | A tap outside closes it. The new-run moment turns this off. |
| `onClose` | function | | Called after it closes, however that happened. |

What it guarantees:

- `role="dialog"`, `aria-modal="true"` and `aria-labelledby`.
- On open, focus moves to `initialFocus` (or the first control). Tab and
  Shift+Tab wrap inside the panel.
- The rest of the app becomes `inert` and `aria-hidden` while it is open.
- Escape closes it.
- On close, focus returns to whatever had it before.

```js
const title = el('h3', { id: uid('help') });
const dlg = Dialog({ overlayClass: 'help-overlay', panelClass: 'help-card', labelledBy: title.id });
const ok = el('button', { type: 'button', text: 'Got it', on: { click: () => dlg.close() } });
dlg.panel.append(title, el('p', { text: 'Each machine runs a cycle…' }), ok);
title.textContent = 'Servers';
dlg.open(ok);
```

### `Toggle(props) -> { el, set(checked) }`

A Settings row with a real switch: `role="switch"` and `aria-checked`, named
by its label. The visible "On" or "Off" text matches the state.

| Prop | Type | Notes |
| --- | --- | --- |
| `label` | string | The row label and the switch's name. |
| `checked` | boolean | The starting state. |
| `onChange` | function | Called with the new state. |
| `note` | string | An optional small line under the row. |

```js
feel.append(Toggle({ label: 'Sound', checked: get('sound') !== false, onChange: (on) => set('sound', on) }).el);
```

### `announce(text)`

A polite screen-reader announcement from one hidden live region. Purchases
("Bought 10 Raspberry Pi. You own 35."), hires, toasts and the new-run moment
use it. The same text twice is still announced.

### `ArtImage(props) -> img`

An art image with a loading state and a fallback. A soft pulsing disc shows
until the file arrives (no pulse with reduced motion). A missing or broken
file is swapped for `fallback()`, the drawn SVG icon, so a row never shows a
broken image. `tierArt` and `managerIcon` in `icons.js` use it.

| Prop | Type | Notes |
| --- | --- | --- |
| `src` | string | A relative path (the game is served under `/vllm/`). |
| `alt` | string | `''` for decorative art next to a visible name. |
| `width`, `height`, `style`, `className` | | Layout. |
| `fallback` | function | Returns the node to show instead. |

## Pure helpers

| Helper | Input → output | Edge cases |
| --- | --- | --- |
| `clampFraction(have, need)` | → 0…1 | `need <= 0` or missing → 1; `NaN` or infinite `have` → 0 |
| `percent(fraction)` | → 0…100 | clamped and rounded |
| `accessibleName(...parts)` | → `'a, b'` | skips empty, `null` and `undefined`; keeps `0` |
| `variantClass(variant)` | → CSS class | unknown → `''` |
| `fmt(n)` (fmt.js) | → short text | K, M, B, T, Q, Qi, Sx, Sp, Oc, No, Dc, then scientific from 1e36; never `1000.0K`; `NaN`, `null`, `undefined` and junk → `0`; negatives keep their sign; at most 8 characters |

## States every screen handles

- **Loading:** the boot screen until the first frame; art discs until images
  arrive; the service worker serves everything offline after one visit.
- **Empty:** "Everything bought for this run", "N more upgrades unlock at 2
  Regions", locked layers with their rule, "Backup: empty".
- **Locked:** dashed buttons that state the rule ("Unlocks at Iowa (1
  Region)", "Needs 1 / Datacenter").
- **Errors:** an unreadable save restores a backup with a toast; a bad save
  code says so; broken art falls back to the drawn icon.
- **Responsive:** one column from 320 px phones up, safe-area padding top
  and bottom, 44 px minimum tap targets, and sticky rows that never cover
  content.
- **Motion:** every animation stops when the player turns on reduce motion,
  or when the device asks for it.
