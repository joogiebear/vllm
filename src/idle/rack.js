// The server rack: one large "Serve" button with one unit per owned tier,
// stacked from the bottom. The units are built once; update() only changes
// classes and CSS custom properties, and a unit appears (with a slide-in)
// only when its tier is first owned.
import { click, tokensPerSecond } from './core.js';
import { GENERATORS } from './data.js';

const LED_MAX = 12;

// The blink period speeds up as production rises, clamped so the LEDs never
// strobe: at most 2.5 Hz (400 ms).
function blinkPeriodMs(tps) {
  return Math.max(400, 1600 / (1 + Math.log10(1 + Math.max(0, tps))));
}

export function createRack(state, fmt) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'rack';
  btn.setAttribute('aria-label', 'Serve');
  const label = document.createElement('span');
  label.className = 'rack-label';
  label.textContent = 'SERVE';
  const unitsBox = document.createElement('div');
  unitsBox.className = 'rack-units';
  const units = GENERATORS.map((g) => {
    const unit = document.createElement('div');
    unit.className = 'unit';
    unit.dataset.tier = g.id;
    const shape = document.createElement('div');
    shape.className = 'shape';
    // One visually distinct CSS shape per tier: a small green board for the
    // Pi, a card with a fan for the Gaming GPU, wider chassis further up.
    if (g.id === 'gamer') {
      const fan = document.createElement('div');
      fan.className = 'fan';
      shape.appendChild(fan);
    }
    if (g.id === 'cluster') {
      for (let i = 0; i < 2; i++) {
        const gpu = document.createElement('div');
        gpu.className = 'gpu';
        shape.appendChild(gpu);
      }
    }
    if (g.id === 'swarm') {
      for (let i = 0; i < 3; i++) {
        const node = document.createElement('div');
        node.className = 'node';
        shape.appendChild(node);
      }
    }
    const leds = document.createElement('span');
    leds.className = 'leds';
    const ledEls = [];
    for (let i = 0; i < LED_MAX; i++) {
      const led = document.createElement('span');
      led.className = 'led';
      leds.appendChild(led);
      ledEls.push(led);
    }
    unit.append(shape, leds);
    unitsBox.appendChild(unit);
    return { g, unit, ledEls };
  });
  btn.append(label, unitsBox);

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
