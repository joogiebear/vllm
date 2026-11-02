// OVERCLOCK audio.
//
// Short synthesised WebAudio effects for the sim's events: assign, finish,
// VIP finish, timeout, throttle, boost, upgrade. The AudioContext is created
// (unlocked) only after the first user gesture; until then every call is a
// no-op. Mute is read from `ui.muted` on every play.

export function createAudio(ui) {
  let ctx = null;
  let master = null;

  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.4;
      master.connect(ctx.destination);
    } catch (err) {
      ctx = null; // audio is best-effort; the game runs without it
    }
  }

  function tone(freq, dur, opts = {}) {
    if (!ctx || ui.muted) return;
    const { type = 'square', vol = 0.25, delay = 0, slide = 0 } = opts;
    try {
      const t0 = ctx.currentTime + delay;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      if (slide > 0) o.frequency.linearRampToValueAtTime(slide, t0 + dur);
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.connect(g);
      g.connect(master);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    } catch (err) {
      // a failed sound must never break the game
    }
  }

  const sounds = {
    assign() {
      tone(660, 0.06, { type: 'square', vol: 0.18 });
    },
    finish() {
      tone(880, 0.07, { type: 'triangle', vol: 0.25 });
      tone(1318, 0.1, { type: 'triangle', vol: 0.22, delay: 0.06 });
    },
    vipFinish() {
      tone(880, 0.06, { type: 'triangle', vol: 0.25 });
      tone(1108, 0.06, { type: 'triangle', vol: 0.25, delay: 0.05 });
      tone(1318, 0.14, { type: 'triangle', vol: 0.28, delay: 0.1 });
    },
    timeout() {
      tone(320, 0.3, { type: 'sawtooth', vol: 0.3, slide: 110 });
    },
    throttle() {
      tone(90, 0.35, { type: 'sawtooth', vol: 0.3 });
    },
    boost() {
      tone(220, 0.2, { type: 'square', vol: 0.28, slide: 880 });
    },
    upgrade() {
      tone(523, 0.25, { type: 'triangle', vol: 0.22 });
      tone(659, 0.25, { type: 'triangle', vol: 0.2, delay: 0.05 });
      tone(784, 0.3, { type: 'triangle', vol: 0.22, delay: 0.1 });
    },
  };

  // `reqInfo` maps requestId -> { vip, prefix } so a `served` event can be
  // told apart from a VIP finish (the event itself does not carry that).
  function playEvents(events, reqInfo) {
    for (const e of events) {
      switch (e.type) {
        case 'assign':
          sounds.assign();
          break;
        case 'served': {
          const info = reqInfo ? reqInfo.get(e.requestId) : null;
          if (info && info.vip) sounds.vipFinish();
          else sounds.finish();
          break;
        }
        case 'timeout':
          sounds.timeout();
          break;
        case 'throttle':
          sounds.throttle();
          break;
        case 'boost':
          sounds.boost();
          break;
        case 'upgrade':
          sounds.upgrade();
          break;
        default:
          break;
      }
    }
  }

  return {
    unlock,
    playEvents,
    // debug/testing only: whether the AudioContext has been created
    get unlocked() { return !!ctx; },
  };
}
