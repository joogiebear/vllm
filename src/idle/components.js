// Small accessible UI building blocks (docs/COMPONENTS.md).
//
// Plain DOM, no framework, no dependencies. Every factory builds its DOM
// once and returns a handle ({ el, ...methods }); callers update it
// through those methods and never rebuild it, so rows keep their height
// and nothing moves under a finger.
//
// The pure helpers at the top have no DOM and are unit-tested
// (test/components.test.js); the DOM parts are covered by tools/smoke.js.

// --- pure helpers ------------------------------------------------------------

// have / need as a fraction in [0, 1]. A missing, zero or negative need
// counts as done (1); NaN or infinite input counts as nothing yet (0).
export function clampFraction(have, need) {
  const h = Number(have);
  const n = Number(need);
  if (!Number.isFinite(n) || n <= 0) return 1;
  if (!Number.isFinite(h) || h <= 0) return 0;
  return Math.min(1, h / n);
}

// A fraction as a whole percent, 0 to 100.
export function percent(frac) {
  return Math.round(clampFraction(frac, 1) * 100);
}

// One spoken name from the visible parts of a control, skipping empty
// ones: ('Buy 25 → 50', '105.1K') -> 'Buy 25 → 50, 105.1K'.
export function accessibleName(...parts) {
  return parts
    .filter((p) => p !== null && p !== undefined && String(p).trim() !== '')
    .map((p) => String(p).trim())
    .join(', ');
}

// The CSS state class for a button variant (the one button grammar:
// amber when affordable, outline when not, green when done, dashed when
// locked, red for danger).
const VARIANT_CLASS = { primary: 'afford', done: 'done', lock: 'lock', danger: 'danger' };
export function variantClass(variant) {
  return VARIANT_CLASS[variant] || '';
}

// --- el ------------------------------------------------------------------------

// el('div', { className: 'card', text: 'Hi', attrs: { role: 'note' },
//   on: { click: fn }, hidden: true }, [child, 'text'])
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.id) node.id = props.id;
  if (props.text !== undefined) node.textContent = String(props.text);
  if (props.type) node.type = props.type;
  if (props.hidden) node.hidden = true;
  if (props.attrs) {
    for (const [k, v] of Object.entries(props.attrs)) {
      if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v === true ? '' : String(v));
    }
  }
  if (props.style) Object.assign(node.style, props.style);
  if (props.on) {
    for (const [ev, fn] of Object.entries(props.on)) node.addEventListener(ev, fn);
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

let idSeq = 0;
// A unique id for aria-labelledby and friends.
export function uid(prefix = 'oc') {
  idSeq += 1;
  return `${prefix}-${idSeq}`;
}

// --- Button ----------------------------------------------------------------------

// Two-line button: the verb (label) and the price or detail (sub). The
// spoken name joins both, so a screen reader hears "Hire, 15.0K".
// Button({ label, sub, variant, disabled, onClick, className })
//   -> { el, set({ label, sub, variant, disabled }) }
export function Button(props = {}) {
  const l1 = el('span', { className: 'btn-l1' });
  const l2 = el('span', { className: 'btn-l2' });
  const btn = el('button', { type: 'button', className: props.className || '' }, [l1, l2]);
  if (props.onClick) btn.addEventListener('click', props.onClick);
  let variant = '';
  function set(p = {}) {
    if (p.label !== undefined) l1.textContent = p.label;
    if (p.sub !== undefined) {
      l2.textContent = p.sub || '';
      l2.hidden = !p.sub;
    }
    if (p.variant !== undefined) {
      if (variant) btn.classList.remove(variant);
      variant = variantClass(p.variant);
      if (variant) btn.classList.add(variant);
    }
    if (p.disabled !== undefined) btn.disabled = !!p.disabled;
    btn.setAttribute('aria-label', accessibleName(l1.textContent, l2.hidden ? '' : l2.textContent));
  }
  set({ label: props.label || '', sub: props.sub || '', variant: props.variant, disabled: props.disabled });
  return { el: btn, set };
}

// --- ProgressBar -----------------------------------------------------------------

// Gives an existing bar (a track and its fill) progressbar semantics:
// role, a name, min/max/now and a spoken value text.
// bindProgress(track, fill, { label, mode: 'width' | 'scale' })
//   -> { set(fraction, valueText) }
export function bindProgress(track, fill, { label = '', mode = 'width' } = {}) {
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  if (label) track.setAttribute('aria-label', label);
  function set(fraction, valueText) {
    const pct = percent(fraction);
    if (mode === 'scale') fill.style.transform = `scaleX(${pct / 100})`;
    else fill.style.width = `${pct}%`;
    track.setAttribute('aria-valuenow', String(pct));
    track.setAttribute('aria-valuetext', valueText || `${pct}%`);
  }
  // A bar always reports a value, even before its first update.
  set(0);
  return { set };
}

// --- Dialog ----------------------------------------------------------------------

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// A modal: an overlay holding one panel. Opening moves focus inside and
// keeps it there (Tab wraps), marks the rest of the app inert, and closes
// on Escape or a tap on the backdrop. Closing returns focus to whatever
// had it before. The caller fills `panel` and gives the title element's
// id as labelledBy.
// Dialog({ overlayClass, panelClass, labelledBy, closeOnBackdrop, onClose })
//   -> { el, panel, open(initialFocus), close(), isOpen() }
export function Dialog(props = {}) {
  const panel = el('div', {
    className: props.panelClass || '',
    attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': props.labelledBy || null },
  });
  const overlay = el('div', { className: props.overlayClass || '', hidden: true }, [panel]);
  let returnTo = null;
  const app = () => document.getElementById('app');

  function focusables() {
    return [...panel.querySelectorAll(FOCUSABLE)].filter((n) => n.getClientRects().length > 0);
  }
  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    const f = focusables();
    if (f.length === 0) {
      e.preventDefault();
      return;
    }
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
  function open(initialFocus) {
    if (overlay.hidden) returnTo = document.activeElement;
    overlay.hidden = false;
    const a = app();
    if (a) {
      a.inert = true;
      a.setAttribute('aria-hidden', 'true');
    }
    document.addEventListener('keydown', onKey);
    const target = initialFocus || focusables()[0];
    if (target) target.focus();
  }
  function close() {
    if (overlay.hidden) return;
    overlay.hidden = true;
    document.removeEventListener('keydown', onKey);
    const a = app();
    if (a) {
      a.inert = false;
      a.removeAttribute('aria-hidden');
    }
    if (returnTo && document.contains(returnTo) && typeof returnTo.focus === 'function') returnTo.focus();
    returnTo = null;
    if (props.onClose) props.onClose();
  }
  if (props.closeOnBackdrop !== false) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
  }
  document.body.append(overlay);
  return { el: overlay, panel, open, close, isOpen: () => !overlay.hidden };
}

// --- Toggle ----------------------------------------------------------------------

// An on/off switch row: a real switch (role="switch", aria-checked) with
// the row's label as its name.
// Toggle({ label, checked, onChange, note }) -> { el, set(checked) }
export function Toggle(props = {}) {
  const labelId = uid('tg');
  const lab = el('span', { className: 'set-label', id: labelId, text: props.label || '' });
  const btn = el('button', { type: 'button', attrs: { role: 'switch', 'aria-labelledby': labelId } });
  let checked = false;
  function set(on) {
    checked = !!on;
    btn.textContent = checked ? 'On' : 'Off';
    btn.classList.toggle('active', checked);
    btn.setAttribute('aria-checked', String(checked));
  }
  btn.addEventListener('click', () => {
    set(!checked);
    if (props.onChange) props.onChange(checked);
  });
  const row = el('div', { className: 'set-row' }, [lab, btn]);
  if (props.note) row.append(el('div', { className: 'set-note', text: props.note }));
  set(props.checked);
  return { el: row, set };
}

// --- Announcer -------------------------------------------------------------------

// Polite screen-reader announcements ("Bought 10 Raspberry Pis") from one
// visually hidden live region. The same text twice is still announced.
let liveRegion = null;
export function announce(text) {
  if (typeof document === 'undefined' || !text) return;
  if (!liveRegion) {
    liveRegion = el('div', { className: 'sr-only', attrs: { 'aria-live': 'polite', 'aria-atomic': 'true' } });
    document.body.append(liveRegion);
  }
  liveRegion.textContent = '';
  setTimeout(() => {
    liveRegion.textContent = String(text);
  }, 30);
}

// --- ArtImage --------------------------------------------------------------------

// An art image with a loading state and a fallback: a soft placeholder
// shows until the file arrives, and a missing or broken file swaps in
// fallback() (the drawn SVG icon) so a row never shows a broken image.
// ArtImage({ src, alt, width, height, className, style, fallback }) -> img
export function ArtImage(props = {}) {
  const img = el('img', { className: `art-img loading ${props.className || ''}`.trim() });
  img.alt = props.alt || '';
  img.decoding = 'async';
  if (props.width) img.width = props.width;
  if (props.height) img.height = props.height;
  if (props.style) Object.assign(img.style, props.style);
  img.addEventListener('load', () => img.classList.remove('loading'), { once: true });
  img.addEventListener('error', () => {
    img.classList.remove('loading');
    const fb = props.fallback ? props.fallback() : null;
    if (fb && img.parentNode) img.replaceWith(fb);
  }, { once: true });
  img.src = props.src;
  return img;
}
