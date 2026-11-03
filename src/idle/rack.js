// The server rack: one large "Serve" button with 8 fixed bays stacked from
// the bottom, one per tier, filling the 200px height evenly. An unowned bay
// is a faint outlined slot (the room left to fill); an owned bay is a solid
// unit with a bright 4px tier stripe, a small tier detail, and its LEDs in a
// row inside the same unit, right-aligned. update() only changes classes and
// CSS custom properties, and a unit appears (with a slide-in) only when its
// tier is first owned.
import { click, tokensPerSecond } from './core.js';
import { GENERATORS } from './data.js';

const LED_MAX = 12;

// The blink period speeds up as production rises, clamped so the LEDs never
// strobe: at most 2.5 Hz (400 ms).
function blinkPeriodMs(tps) {
  return Math.max(400, 1600 / (1 + Math.log10(1 + Math.max(0, tps))));
}

// One small distinguishing CSS detail per tier: a chip square for the Pi, a
// fan circle for the Gaming GPU, vent lines and drive slots for the rest.
function tierDetail(id) {
  const detail = document.createElement('div');
  detail.className = 'detail';
  const add = (cls, n = 1) => {
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div');
      el.className = cls;
      detail.appendChild(el);
    }
  };
  if (id === 'pi') add('chip');
  else if (id === 'gamer') add('fan');
  else if (id === 'workstation') add('vent', 3);
  else if (id === 'rack') add('slot', 2);
  else if (id === 'cluster') add('vent', 4);
  else if (id === 'datacenter') add('slot', 3);
  else if (id === 'campus') add('vent', 3);
  else add('node', 3); // swarm
  return detail;
}

export function createRack(state, fmt) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'rack';
  btn.setAttribute('aria-label', 'Serve');
  const label = document.createElement('span');
  label.className = 'rack-label';
  label.textContent = 'SERVE';
  const throttleLabel = document.createElement('span');
  throttleLabel.className = 'throttle-label';
  throttleLabel.textContent = 'THROTTLED';
  throttleLabel.hidden = true;
  const unitsBox = document.createElement('div');
  unitsBox.className = 'rack-units';
  const units = GENERATORS.map((g) => {
    const unit = document.createElement('div');
    unit.className = 'unit';
    unit.dataset.tier = g.id;
    const stripe = document.createElement('div');
    stripe.className = 'stripe';
    const leds = document.createElement('span');
    leds.className = 'leds';
    const ledEls = [];
    for (let i = 0; i < LED_MAX; i++) {
      const led = document.createElement('span');
      led.className = 'led';
      leds.appendChild(led);
      ledEls.push(led);
    }
    unit.append(stripe, tierDetail(g.id), leds);
    unitsBox.appendChild(unit);
    return { g, unit, ledEls };
  });
  btn.append(label, unitsBox, throttleLabel);

  // Tapping the rack is Serve: click + a floating +N.
  btn.addEventListener('click', () => {
    const earned = click(state);
    const f = document.createElement('span');
    f.className = 'float';
    f.textContent = `+${fmt(earned)}`;
    btn.appendChild(f);
    setTimeout(() => f.remove(), 900);
  });

  const seen = new Set();
  function update(state) {
    const tps = tokensPerSecond(state);
    btn.style.setProperty('--blink', `${Math.round(blinkPeriodMs(tps))}ms`);
    // Heat state: the outline/glow colour is set on the tab (see ui.js);
    // here the classes drive the dimmed flicker (throttled) and the amber
    // LEDs (overclocked, and not throttled).
    btn.classList.toggle('throttled', !!state.throttled);
    btn.classList.toggle('overclock', !state.throttled && !!state.overclock);
    throttleLabel.hidden = !state.throttled;
    for (const u of units) {
      const owned = state.generators[u.g.id] || 0;
      const nowOwned = owned > 0;
      if (nowOwned && !seen.has(u.g.id)) {
        // First time this tier is owned: it appears with a slide-in.
        seen.add(u.g.id);
        u.unit.classList.add('show', 'slide-in');
        u.unit.addEventListener(
          'animationend',
          () => u.unit.classList.remove('slide-in'),
          { once: true }
        );
      } else if (!nowOwned && seen.has(u.g.id)) {
        seen.delete(u.g.id);
        u.unit.classList.remove('show', 'slide-in');
      }
      const lit = Math.min(LED_MAX, owned);
      u.ledEls.forEach((led, i) => led.classList.toggle('lit', i < lit));
    }
  }
  return { el: btn, update };
}
