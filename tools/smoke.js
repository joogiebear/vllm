#!/usr/bin/env node
// Release-gate smoke test (docs/STABILITY-DESIGN.md, section 1, build task 1).
//
// Serves the repo under /vllm/ (exactly like GitHub Pages; anything outside
// /vllm/ is a 404, which is what catches absolute paths), loads the game in
// a headless Chrome driven over the DevTools protocol (Node's built-in
// WebSocket, no npm packages), and runs the fresh-game checks.
//
// One line per check (PASS/FAIL). Exits non-zero on any failure, any page
// exception, any console.error, or any 404. Always kills Chrome and the
// server, and finishes in under 30 s (hard deadline 25 s).
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const REPO = path.resolve(__dirname, '..');
const DEADLINE_MS = 25000; // hard cap; the design target is under 30 s

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// --- static server ----------------------------------------------------------

// Serves the repo under /vllm/ like GitHub Pages: /vllm/ -> index.html,
// query strings stripped, everything outside /vllm/ is a 404.
function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const notFound = () => {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
      };
      let pathname;
      try {
        pathname = new URL(req.url, 'http://localhost').pathname;
      } catch (err) {
        res.writeHead(400, { 'content-type': 'text/plain' });
        res.end('bad request');
        return;
      }
      if (!pathname.startsWith('/vllm/')) {
        notFound();
        return;
      }
      let rel;
      try {
        rel = decodeURIComponent(pathname.slice('/vllm/'.length));
      } catch (err) {
        res.writeHead(400, { 'content-type': 'text/plain' });
        res.end('bad request');
        return;
      }
      let file = path.normalize(path.join(REPO, rel));
      if (file !== REPO && !file.startsWith(REPO + path.sep)) {
        notFound(); // path traversal
        return;
      }
      fs.stat(file, (err, st) => {
        if (!err && st.isDirectory()) file = path.join(file, 'index.html');
        fs.readFile(file, (err2, data) => {
          if (err2) {
            notFound();
            return;
          }
          const type =
            MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
          res.writeHead(200, { 'content-type': type });
          res.end(data);
        });
      });
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () =>
      resolve({ server, port: server.address().port })
    );
  });
}

// --- headless Chrome --------------------------------------------------------

function chromeBinary() {
  if (process.env.CHROME) return process.env.CHROME;
  const base = path.join(os.homedir(), '.hermes', 'tools');
  for (const entry of fs.readdirSync(base)) {
    if (!entry.startsWith('chromium-')) continue;
    const bin = path.join(base, entry, 'chrome-linux64', 'chrome');
    if (fs.existsSync(bin)) return bin;
  }
  throw new Error('no chromium build under ~/.hermes/tools (set CHROME)');
}

// Launches headless Chrome on a random debug port in a fresh profile and
// reads the DevTools URL from the stderr line "DevTools listening on ws://...".
function launchChrome() {
  return new Promise((resolve, reject) => {
    let settled = false;
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smoke-chrome-'));
    const fail = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGKILL');
      fs.rmSync(userDataDir, { recursive: true, force: true });
      reject(err);
    };
    const child = spawn(
      chromeBinary(),
      [
        '--headless=new',
        '--no-sandbox',
        '--remote-debugging-port=0',
        `--user-data-dir=${userDataDir}`,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    const exited = new Promise((resolve) =>
      child.once('exit', (code, signal) => resolve({ code, signal }))
    );
    let buf = '';
    const timer = setTimeout(
      () => fail(new Error('chrome did not open DevTools in 15 s')),
      15000
    );
    child.stderr.on('data', (d) => {
      buf += d.toString();
      const m = /DevTools listening on (ws:\/\/[^\s]+)/.exec(buf);
      if (m && !settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ child, wsUrl: m[1], exited });
      }
    });
    child.stdout.on('data', () => {});
    child.on('error', fail);
  });
}

// --- DevTools protocol client (built-in WebSocket) ---------------------------

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map(); // method -> Set of {sessionId, fn}
    const failPending = (err) => {
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
    };
    this.ws.addEventListener('close', () =>
      failPending(new Error('devtools websocket closed'))
    );
    this.ws.addEventListener('error', () =>
      failPending(new Error('devtools websocket error'))
    );
    this.ws.addEventListener('message', (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch (err) {
        return;
      }
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message));
        else p.resolve(msg.result);
        return;
      }
      const set = this.listeners.get(msg.method);
      if (!set) return;
      for (const l of set) {
        if (!l.sessionId || l.sessionId === msg.sessionId) l.fn(msg.params || {});
      }
    });
  }
  open() {
    return new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', () => reject(new Error('websocket error')), { once: true });
    });
  }
  send(method, params, sessionId) {
    const id = this.nextId++;
    const msg = { id, method, params: params || {} };
    if (sessionId) msg.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(msg));
    });
  }
  on(method, fn, sessionId) {
    if (!this.listeners.has(method)) this.listeners.set(method, new Set());
    const l = { fn, sessionId };
    this.listeners.get(method).add(l);
    return () => this.listeners.get(method).delete(l);
  }
  close() {
    try {
      this.ws.close();
    } catch (err) {
      // already closed
    }
  }
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms} ms`)),
      ms
    );
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

// --- fresh-game checks ------------------------------------------------------

async function runChecks(cdp, sessionId, url) {
  const exceptions = [];
  const consoleErrors = [];
  const notFound = [];
  let bgStatus = null;
  cdp.on(
    'Runtime.exceptionThrown',
    (p) => {
      const d = p.exceptionDetails || {};
      exceptions.push(
        d.exception && d.exception.description
          ? d.exception.description
          : d.text || 'page exception'
      );
    },
    sessionId
  );
  cdp.on(
    'Runtime.consoleAPICalled',
    (p) => {
      if (p.type !== 'error') return;
      const text = (p.args || [])
        .map((a) =>
          a.value !== undefined ? String(a.value) : a.description || a.type || ''
        )
        .join(' ');
      consoleErrors.push(text || 'console.error()');
    },
    sessionId
  );
  cdp.on(
    'Network.responseReceived',
    (p) => {
      if (!p.response) return;
      if (p.response.status === 404) notFound.push(p.response.url);
      if (p.response.url.indexOf('icons/bg/homelab.webp') !== -1) {
        bgStatus = p.response.status;
      }
    },
    sessionId
  );

  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Network.enable', {}, sessionId);
  await cdp.send(
    'Emulation.setDeviceMetricsOverride',
    { width: 390, height: 844, deviceScaleFactor: 1, mobile: true },
    sessionId
  );

  // Wait for the page to finish loading (loadEventFired, or readyState
  // 'complete' as a belt-and-braces fallback). Reusable so the late-save
  // reload and the offline reload wait the same way; the timeout is
  // parameterized (the offline reload gets a shorter one).
  const loadPage = (timeoutMs = 15000) => {
    const loaded = new Promise((resolve) => {
      let t;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearInterval(t);
        resolve();
      };
      cdp.on('Page.loadEventFired', finish, sessionId);
      // Belt and braces: also accept readyState === 'complete' in case the
      // load event is delayed or the page errors out late.
      t = setInterval(() => {
        if (done) return;
        cdp
          .send(
            'Runtime.evaluate',
            { expression: 'document.readyState', returnByValue: true },
            sessionId
          )
          .then((r) => {
            if (r.result && r.result.value === 'complete') finish();
          })
          .catch(() => {});
      }, 250);
    });
    return withTimeout(loaded, timeoutMs, 'page load');
  };
  cdp.send('Page.navigate', { url }, sessionId);
  await loadPage();

  const evalIn = (expression) =>
    cdp.send(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true, timeout: 10000 },
      sessionId
    );
  // Poll a boolean expression in the page every 100 ms until true or timeout.
  const poll = (ms, fnExpr) =>
    evalIn(
      `new Promise((resolve) => { const t0 = Date.now(); const iv = setInterval(() => { let v = false; try { v = ${fnExpr} ? true : false; } catch (e) {} if (v || Date.now() - t0 >= ${ms}) { clearInterval(iv); resolve(v); } }, 100); })`
    );

  const results = [];
  const check = async (name, fn) => {
    let pass = false;
    let detail = '';
    try {
      const r = await fn();
      // Runtime.evaluate resolves to { result: { value }, exceptionDetails? }.
      const value = r.result ? r.result.value : undefined;
      pass = !!value;
      if (!pass)
        detail = r.exceptionDetails
          ? (r.exceptionDetails.exception &&
            r.exceptionDetails.exception.description) ||
            r.exceptionDetails.text ||
            'exception'
          : JSON.stringify(value);
    } catch (err) {
      detail = err.message;
    }
    results.push({ name, pass, detail });
  };

  // Wait for the game to finish loading (#gen-cards has children), up to 5 s.
  await withTimeout(
    poll(
      5000,
      'document.querySelector("#gen-cards") && document.querySelector("#gen-cards").children.length > 0'
    ),
    6000,
    'game load'
  );

  // Fresh game: empty storage (fresh profile; the game has not autosaved yet).
  await check(
    'fresh game: storage is empty',
    () => evalIn('Object.keys(localStorage).length === 0')
  );
  await check(
    'fresh game: #tokens has text',
    () => evalIn('document.getElementById("tokens").textContent.trim().length > 0')
  );
  await check(
    'fresh game: #gen-cards has at least one card',
    () => evalIn('document.querySelectorAll("#gen-cards .gen-card").length >= 1')
  );
  // The Region-locked next-tier row (docs/LATE-GAME-DESIGN.md, section
  // 1) is hidden on a fresh game: no visible row says "Unlocks at ...".
  await check(
    'fresh game: no visible row says "Unlocks at"',
    () =>
      evalIn(
        `[...document.querySelectorAll("#gen-cards .gen-card")].every((c) => c.hidden || !c.textContent.includes("Unlocks at"))`
      )
  );
  // Progress (docs/UX-OVERHAUL-PLAN.md, batch D): one ladder, every layer
  // visible from minute one. On a fresh game Regions is locked at 2,000
  // Weights with no Expand button, and the perks are listed but locked.
  await check(
    'fresh game: Progress shows Prestige, Regions (locked at 2,000) and Region perks',
    () =>
      evalIn(
        `(async () => {
          document.querySelector('#tabs [data-tab="prestige"]').click();
          await new Promise((r) => setTimeout(r, 100));
          const ok = ['prestige-weights', 'layer-regions', 'layer-perks'].every((id) => {
            const el = document.getElementById(id);
            return el && el.getClientRects().length > 0;
          });
          const locked = document.getElementById('region-locked');
          const expand = document.getElementById('region-expand');
          const perkBtns = [...document.querySelectorAll('#region-perks button')];
          document.querySelector('#tabs [data-tab="game"]').click();
          await new Promise((r) => setTimeout(r, 100));
          return ok && !locked.hidden && locked.textContent.includes('2,000') && expand.hidden
            && perkBtns.length >= 6 && perkBtns.every((b) => b.disabled);
        })()`
      )
  );
  // The first-run tip ("Tap the Pi to run it...") shows before the tap,
  // because tapping the run button dismisses it.
  await check(
    'fresh game: first tip appears inline under the Pi card',
    () => poll(4000, 'document.querySelector("#gen-cards .gen-card + .hint-bubble")')
  );
  // The Pi's run button (the round icon on the first card) holds the WebP
  // machine art img that finished loading (docs/ART-TIERS.md, task 5).
  await check(
    'fresh game: Pi run button holds a loaded img (naturalWidth > 0)',
    () =>
      evalIn(
        `(async () => {
          const btn = document.querySelector('#gen-cards .gen-card .gen-icon');
          if (!btn) return false;
          const img = btn.querySelector('img');
          if (!img || img.src.indexOf('icons/tiers/') === -1) return false;
          const t0 = Date.now();
          while (img.naturalWidth === 0 && Date.now() - t0 < 5000) {
            await new Promise((r) => setTimeout(r, 100));
          }
          return img.naturalWidth > 0;
        })()`
      )
  );
  // The body's background is the Home Lab scene (docs/ART-BACKGROUNDS.md,
  // task 5): the computed background-image contains homelab.webp and the
  // image request returned 200.
  let bgOk = false;
  let bgDetail = '';
  let bgValue = '';
  try {
    const t0 = Date.now();
    while (Date.now() - t0 < 5000) {
      const r = await evalIn('getComputedStyle(document.body).backgroundImage');
      bgValue = (r.result && r.result.value) || '';
      if (bgValue.indexOf('homelab.webp') !== -1 && bgStatus === 200) {
        bgOk = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  } catch (err) {
    bgDetail = err.message;
  }
  if (!bgOk && !bgDetail) {
    bgDetail = `backgroundImage=${bgValue || 'empty'}, status=${bgStatus}`;
  }
  results.push({
    name: 'fresh game: body background is homelab.webp and the image request returned 200',
    pass: bgOk,
    detail: bgDetail,
  });
  // Overhaul batch A (docs/UX-OVERHAUL-PLAN.md): a brand-new save shows
  // no achievement toast (the starter Pi's "First Boot" goes to a dot on
  // More instead), the header pads for the safe area, and every backup
  // slot row has text.
  await check(
    'fresh game: no achievement toast, More dot instead; header safe area; backup slots labelled',
    () =>
      evalIn(
        `(async () => {
          await new Promise((r) => setTimeout(r, 400));
          if (document.querySelector('.toast-pill')) return false;
          const dot = document.querySelector('#tabs [data-tab="more"] .tab-dot');
          if (!dot || dot.hidden) return false;
          const pad = document.getElementById('hud').style.paddingTop || getComputedStyle(document.getElementById('hud')).paddingTop;
          if (pad === undefined) return false;
          const rows = [...document.querySelectorAll('#more-settings .set-row')];
          return rows.every((r) => r.textContent.trim().length > 0);
        })()`
      )
  );
  // Batch 2 (docs/UX-PLAN.md): the goal strip names a next goal, the idle
  // Pi row says "TAP TO BOOT" and pulses, the rate line says nothing is
  // running yet, and the footer counts the tiers to come.
  await check(
    'fresh game: goal line names a goal, Pi pulses with TAP TO BOOT, rate says nothing running, footer counts tiers',
    () =>
      evalIn(
        `(async () => {
          const t0 = Date.now();
          let strip = document.getElementById('goal-strip');
          while ((!strip || strip.hidden) && Date.now() - t0 < 2000) {
            await new Promise((r) => setTimeout(r, 100));
            strip = document.getElementById('goal-strip');
          }
          if (!strip || strip.hidden || !/^Next: ./.test(document.getElementById('goal-label').textContent)) return false;
          const st = document.querySelector('#gen-cards .gen-card .gen-status');
          if (!st || st.textContent !== 'TAP TO BOOT') return false;
          if (!document.querySelector('#gen-cards .gen-card .gen-icon.pulse')) return false;
          if (!/nothing running yet/.test(document.getElementById('rate').textContent)) return false;
          const f = document.getElementById('tier-footer');
          return !!f && /more tiers to discover/.test(f.textContent);
        })()`
      )
  );
  // Tap the Pi's run button (the round icon on the first card) and watch
  // the payout bar's scaleX move off zero within 1 s.
  await evalIn(
    'document.querySelector("#gen-cards .gen-card .gen-icon").click()'
  );
  await check(
    'fresh game: tapping the Pi\'s run button starts the bar filling within 1 s',
    () =>
      poll(
        1000,
        `(() => { const f = document.querySelector("#gen-cards .gen-card .gen-bar-fill"); if (!f) return false; const m = /scaleX\\(([0-9.]+)\\)/.exec(f.style.transform || ""); return m ? parseFloat(m[1]) > 0 : false; })()`
      )
  );

  // --- late save -----------------------------------------------------------
  // Load test/fixtures/late-save.json through the game's own load() path:
  // the fixture is written to localStorage before the reloaded document's
  // scripts run (addScriptToEvaluateOnNewDocument), so load() reads it.
  const fixture = fs.readFileSync(
    path.join(REPO, 'test', 'fixtures', 'late-save.json'),
    'utf8'
  );
  await cdp.send(
    'Page.addScriptToEvaluateOnNewDocument',
    {
      source: `try { localStorage.setItem('overclock.idle.v1', ${JSON.stringify(
        fixture
      )}); } catch (e) {}`,
    },
    sessionId
  );
  await cdp.send('Page.reload', {}, sessionId);
  await loadPage();
  // Wait for the game to re-render after the reload.
  await withTimeout(
    poll(
      5000,
      'document.querySelector("#gen-cards") && document.querySelector("#gen-cards").children.length > 0'
    ),
    6000,
    'game load (late save)'
  );
  // Dismiss the welcome-back modal if the offline gap credited earnings.
  await evalIn(
    'const wb = document.querySelector(".wb-btn"); if (wb) wb.click(); true'
  ).catch(() => {});

  // The fixture loaded through load(): the Pi shows the saved 25 (a fresh
  // game would show 1) and the token count shows the saved 100T.
  await check(
    'late save: save loaded (Pi count is 25, tokens show 100T)',
    () =>
      evalIn(
        'document.querySelector("#gen-cards .gen-card .gen-icon-count").textContent.trim() === "25" && /100\\.0T/.test(document.getElementById("tokens").textContent)'
      )
  );

  // Select Max.
  await evalIn(
    'document.querySelector(\'#buy-sel button[data-mode="max"]\').click(); true'
  );

  // 60 animation frames must complete in under 1.5 s (catches Max-lag loops).
  let frameMs = Infinity;
  try {
    const r = await evalIn(
      'new Promise((resolve) => { const t0 = performance.now(); let n = 0; const step = () => { n++; if (n >= 60) { resolve(performance.now() - t0); } else { requestAnimationFrame(step); } }; requestAnimationFrame(step); })'
    );
    frameMs =
      r.result && typeof r.result.value === 'number' ? r.result.value : Infinity;
  } catch (err) {
    frameMs = Infinity;
  }
  results.push({
    name: 'late save: 60 animation frames under 1.5 s (Max selected)',
    pass: frameMs < 1500,
    detail:
      frameMs < 1500
        ? ''
        : frameMs === Infinity
          ? 'timed out'
          : frameMs.toFixed(0) + ' ms',
  });

  // Tap Buy on the Pi (Max): tokens go down, the Pi count goes up.
  const parseFmt = (s) => {
    const m = /^([0-9.]+)([KMBTQ])?$/.exec(String(s).trim());
    if (!m) return NaN;
    const mult = { K: 1e3, M: 1e6, B: 1e9, T: 1e12, Q: 1e15 }[m[2] || ''] || 1;
    return parseFloat(m[1]) * mult;
  };
  const readHud = () =>
    evalIn(
      '({ t: document.getElementById("tokens").textContent, c: document.querySelector("#gen-cards .gen-card .gen-icon-count").textContent })'
    );
  const beforeHud = await readHud();
  await evalIn(
    'document.querySelector("#gen-cards .gen-card .gen-buy").click(); true'
  );
  await new Promise((r) => setTimeout(r, 300));
  const afterHud = await readHud();
  const bv = beforeHud.result && beforeHud.result.value ? beforeHud.result.value : {};
  const av = afterHud.result && afterHud.result.value ? afterHud.result.value : {};
  const tb = parseFmt(bv.t);
  const ta = parseFmt(av.t);
  const cb = parseFmt(bv.c);
  const ca = parseFmt(av.c);
  results.push({
    name: 'late save: Buy (Max) on the Pi lowers tokens and raises the Pi count',
    pass:
      Number.isFinite(tb) &&
      Number.isFinite(ta) &&
      Number.isFinite(cb) &&
      Number.isFinite(ca) &&
      ta < tb &&
      ca > cb,
    detail: `tokens ${tb} -> ${ta}, pi ${cb} -> ${ca}`,
  });

  // --- tabs ----------------------------------------------------------------
  // Open each bottom tab, then return to Game, with no error.
  await check(
    'tabs: open each bottom tab, then return to Game',
    () =>
      evalIn(
        `(async () => {
          const tabs = ['game', 'managers', 'upgrades', 'prestige', 'more'];
          for (const t of tabs) {
            const btn = document.querySelector('#tabs [data-tab="' + t + '"]');
            if (!btn) return false;
            btn.click();
            await new Promise((r) => setTimeout(r, 50));
            const sec = document.getElementById('tab-' + t);
            if (!sec || sec.hidden) return false;
          }
          const g = document.querySelector('#tabs [data-tab="game"]');
          g.click();
          await new Promise((r) => setTimeout(r, 50));
          const gs = document.getElementById('tab-game');
          return !!(gs && !gs.hidden);
        })()`
      )
  );

  // Batch 1 (docs/UX-PLAN.md): five tabs with these labels, no Shop and no
  // Rush; Next is the default buy mode and its button reads "Buy n → m";
  // every "?" opens a help card that closes again.
  await check(
    'layout: tabs are Servers, Managers, Upgrades, Progress, More; no Shop or Rush',
    () =>
      evalIn(
        `(() => {
          const labels = [...document.querySelectorAll('#tabs .tab-label')].map((b) => b.textContent.trim());
          return JSON.stringify(labels) === JSON.stringify(['Servers', 'Managers', 'Upgrades', 'Progress', 'More'])
            && !document.getElementById('tab-shop') && !document.getElementById('rush');
        })()`
      )
  );
  await check(
    'layout: Next buy mode is selected and the Pi button reads "Buy n → m"',
    () =>
      evalIn(
        `(async () => {
          const g = document.querySelector('#tabs [data-tab="game"]');
          g.click();
          const next = document.querySelector('#buy-sel button[data-mode="next"]');
          if (!next) return false;
          next.click();
          await new Promise((r) => setTimeout(r, 50));
          const btn = document.querySelector('#gen-cards .gen-card .gen-buy');
          return !!btn && /Buy [0-9,.KMBT]+ → [0-9,.KMBT]+/.test(btn.textContent);
        })()`
      )
  );
  await check(
    'layout: on every tab the goal line\'s "?" opens that screen\'s help card',
    () =>
      evalIn(
        `(async () => {
          const ov = document.querySelector('.help-overlay');
          const seen = new Set();
          for (const t of ['game', 'managers', 'upgrades', 'prestige', 'more']) {
            document.querySelector('#tabs [data-tab="' + t + '"]').click();
            await new Promise((r) => setTimeout(r, 150));
            document.getElementById('goal-help').click();
            if (!ov || ov.hidden || !ov.querySelector('p').textContent) return false;
            seen.add(ov.querySelector('h3').textContent);
            ov.querySelector('button').click();
            if (!ov.hidden) return false;
          }
          document.querySelector('#tabs [data-tab="game"]').click();
          return seen.size === 5 && !document.querySelector('.panel-head');
        })()`
      )
  );


  // Batch 3 (docs/UX-PLAN.md): Settings uses plain wording, How to play
  // walks the help cards in order, Expand names its Region, and its
  // resets/keeps list is always on screen.
  await check(
    'layout: Settings wording, How to play walks 6 cards, Expand names its Region',
    () =>
      evalIn(
        `(async () => {
          const reset = document.getElementById('reset-btn');
          if (!reset || reset.textContent !== 'Delete all progress') return false;
          if (document.getElementById('export-btn').textContent !== 'Copy') return false;
          document.getElementById('howto-btn').click();
          const ov = document.querySelector('.help-overlay');
          let cards = 0;
          while (ov && !ov.hidden && cards < 10) {
            cards++;
            ov.querySelector('button').click();
          }
          if (cards !== 6) return false;
          const ex = document.getElementById('expand-btn');
          const note = document.getElementById('expand-note');
          return /^EXPAND TO [A-Z]/.test(ex.textContent) && !!note && !note.hidden;
        })()`
      )
  );

  // Prestige asks first: the sheet says what is gained, lost and kept, and
  // "Not yet" leaves the run as it was.
  await check(
    'late save: Prestige opens the gain/lose/keep sheet and Not yet keeps the run',
    () =>
      evalIn(
        `(async () => {
          document.querySelector('#tabs [data-tab="prestige"]').click();
          await new Promise((r) => setTimeout(r, 100));
          const btn = document.getElementById('prestige-btn');
          if (!btn || btn.disabled || !/^Prestige for \\+/.test(btn.textContent)) return false;
          const before = document.getElementById('tokens').textContent;
          btn.click();
          const ov = document.querySelector('.reset-ov');
          if (!ov || ov.hidden) return false;
          const text = ov.textContent;
          if (!text.includes('You gain') || !text.includes('You lose') || !text.includes('You keep')) return false;
          ov.querySelector('.reset-no').click();
          await new Promise((r) => setTimeout(r, 150));
          return ov.hidden && document.getElementById('tokens').textContent === before;
        })()`
      )
  );

  // Batch E (docs/UX-OVERHAUL-PLAN.md): Upgrades are grouped with a Buy all
  // footer, far-off upgrades collapse into one line, and Managers collapse
  // the Region-gated ones into one locked line.
  await check(
    'late save: Upgrades grouped with a Buy all footer; Managers collapse gated rows',
    () =>
      evalIn(
        `(async () => {
          document.querySelector('#tabs [data-tab="upgrades"]').click();
          await new Promise((r) => setTimeout(r, 150));
          const secs = [...document.querySelectorAll('#up-grid .up-sec')].map((h) => h.textContent);
          if (!secs.includes('Boost everything') || !secs.includes('One machine')) return false;
          const all = document.getElementById('buy-all');
          if (!all || all.hidden || !/^Buy all [0-9]+ ready · /.test(all.textContent)) return false;
          document.querySelector('#tabs [data-tab="managers"]').click();
          await new Promise((r) => setTimeout(r, 150));
          const gated = document.querySelector('#man-grid .up-row.summary.gated');
          return !!gated && !gated.hidden && /Unlock with Region/.test(gated.textContent);
        })()`
      )
  );

  // Batch F (docs/UX-OVERHAUL-PLAN.md): More opens on a grouped list;
  // Settings is a sub-screen with Feel / Play / Save groups, no visible
  // text boxes, and Delete asks twice through the sheet.
  await check(
    'late save: More is a grouped list; Settings has groups, hidden save codes and a two-step delete',
    () =>
      evalIn(
        `(async () => {
          document.querySelector('#tabs [data-tab="more"]').click();
          await new Promise((r) => setTimeout(r, 150));
          const menu = document.getElementById('more-menu');
          if (!menu || menu.hidden) return false;
          if (!/ of [0-9]+ · /.test(document.getElementById('more-ach-sub').textContent)) return false;
          document.querySelector('#more-menu [data-open="settings"]').click();
          await new Promise((r) => setTimeout(r, 150));
          if (!menu.hidden || document.getElementById('sub-settings').hidden) return false;
          const secs = [...document.querySelectorAll('#more-settings .set-sec')].map((h) => h.textContent);
          if (secs.join() !== 'Feel,Play,Save') return false;
          const boxes = [...document.querySelectorAll('#more-settings textarea')].filter((t) => t.getClientRects().length > 0);
          if (boxes.length) return false;
          document.getElementById('reset-btn').click();
          const ov = document.querySelector('.reset-ov');
          if (ov.hidden || !ov.textContent.includes('Delete all progress?')) return false;
          ov.querySelector('.reset-go').click();
          if (ov.hidden || !ov.textContent.includes('Are you sure?')) return false;
          ov.querySelector('.reset-no').click();
          document.querySelector('#sub-settings .sub-back').click();
          await new Promise((r) => setTimeout(r, 100));
          return !menu.hidden && document.getElementById('tokens').textContent !== '0';
        })()`
      )
  );

  // Components (docs/COMPONENTS.md): accessibility and edge cases.
  await check(
    'a11y: a dialog takes focus, marks the app inert, closes on Escape and gives focus back',
    () =>
      evalIn(
        `(async () => {
          document.querySelector('#tabs [data-tab="game"]').click();
          await new Promise((r) => setTimeout(r, 100));
          const opener = document.getElementById('goal-help');
          opener.focus();
          opener.click();
          const panel = document.querySelector('.help-card');
          if (!panel || panel.getAttribute('role') !== 'dialog' || panel.getAttribute('aria-modal') !== 'true') return false;
          const title = document.getElementById(panel.getAttribute('aria-labelledby'));
          if (!title || !title.textContent.trim()) return false;
          if (!panel.contains(document.activeElement)) return false;
          if (!document.getElementById('app').inert) return false;
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          await new Promise((r) => setTimeout(r, 50));
          return panel.parentElement.hidden && document.activeElement === opener && !document.getElementById('app').inert;
        })()`
      )
  );
  await check(
    'a11y: every visible button has a name, bars report values, Settings uses real switches',
    () =>
      evalIn(
        `(async () => {
          const named = (b) => (b.getAttribute('aria-label') || b.textContent || '').trim().length > 0;
          for (const t of ['game', 'managers', 'upgrades', 'prestige', 'more']) {
            document.querySelector('#tabs [data-tab="' + t + '"]').click();
            await new Promise((r) => setTimeout(r, 100));
            const bad = [...document.querySelectorAll('#app button')].filter((b) => b.getClientRects().length > 0 && !named(b));
            if (bad.length) return false;
          }
          const bars = [...document.querySelectorAll('[role="progressbar"]')];
          if (bars.length < 4 || !bars.every((b) => b.hasAttribute('aria-valuenow') && b.getAttribute('aria-label'))) return false;
          const sw = [...document.querySelectorAll('#more-settings [role="switch"]')];
          document.querySelector('#tabs [data-tab="game"]').click();
          return sw.length >= 2 && sw.every((b) => ['true', 'false'].includes(b.getAttribute('aria-checked')));
        })()`
      )
  );
  await check(
    'edge: art that fails to load falls back to the drawn icon',
    () =>
      evalIn(
        `(async () => {
          const m = await import(new URL('src/idle/components.js', location.href).href);
          const box = document.createElement('div');
          document.body.append(box);
          const img = m.ArtImage({ src: 'icons/tiers/pi.webp', fallback: () => Object.assign(document.createElement('span'), { className: 'fb-test' }) });
          box.append(img);
          img.dispatchEvent(new Event('error'));
          const ok = !!box.querySelector('.fb-test') && !box.querySelector('img');
          box.remove();
          return ok;
        })()`
      )
  );

  // Managers tab: the Pi manager row (Cron Job) shows a portrait img that
  // finished loading (docs/ART-PORTRAITS.md, task 5).
  await check(
    'late save: Pi manager portrait loaded (Managers tab)',
    () =>
      evalIn(
        `(async () => {
          const tab = document.querySelector('#tabs [data-tab="managers"]');
          if (!tab) return false;
          tab.click();
          await new Promise((r) => setTimeout(r, 50));
          const sec = document.getElementById('tab-managers');
          if (!sec || sec.hidden) return false;
          const grid = document.getElementById('man-grid');
          if (!grid || grid.hidden) return false;
          let row = null;
          for (const r of grid.querySelectorAll('.up-row')) {
            const n = r.querySelector('.name');
            if (n && n.textContent === 'Cron Job') { row = r; break; }
          }
          if (!row) return false;
          const img = row.querySelector('.portrait img');
          if (!img) return false;
          const t0 = Date.now();
          while (img.naturalWidth === 0 && Date.now() - t0 < 5000) {
            await new Promise((r) => setTimeout(r, 100));
          }
          return img.naturalWidth > 0;
        })()`
      )
  );

  // --- offline ---------------------------------------------------------------
  // The service worker (registered by app.js on 127.0.0.1) is active after
  // the first load and its install precached the shell, the module graph
  // and the icons, so the cache is populated. Wait for it, go offline,
  // reload: the game still renders (docs/STABILITY-DESIGN.md, section 2).
  const swActive = await withTimeout(
    poll(
      8000,
      'navigator.serviceWorker !== undefined && navigator.serviceWorker.controller !== null'
    ),
    9000,
    'service worker active'
  );
  results.push({
    name: 'offline: service worker active',
    pass: !!swActive,
    detail: swActive ? '' : 'no controller',
  });
  await cdp.send(
    'Network.emulateNetworkConditions',
    { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
    sessionId
  );
  await cdp.send('Page.reload', {}, sessionId);
  await loadPage(10000);
  // Wait for the game to re-render from the cache.
  await withTimeout(
    poll(
      5000,
      'document.querySelector("#gen-cards") && document.querySelector("#gen-cards").children.length > 0'
    ),
    6000,
    'game load (offline)'
  );
  await check(
    'offline: #gen-cards still has cards after the offline reload',
    () => evalIn('document.querySelectorAll("#gen-cards .gen-card").length >= 1')
  );
  // Back online for any later checks.
  await cdp.send(
    'Network.emulateNetworkConditions',
    { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
    sessionId
  );

  results.push({
    name: 'no page exceptions',
    pass: exceptions.length === 0,
    detail: exceptions.length ? exceptions.join(' | ') : '',
  });
  results.push({
    name: 'no console errors',
    pass: consoleErrors.length === 0,
    detail: consoleErrors.length ? consoleErrors.join(' | ') : '',
  });
  results.push({
    name: 'no 404 responses',
    pass: notFound.length === 0,
    detail: notFound.length ? notFound.join(' ') : '',
  });
  return { results };
}

// --- main -------------------------------------------------------------------

async function main() {
  let exitCode = 1;
  let chrome = null;
  let cdp = null;
  let server = null;
  const deadline = setTimeout(() => {
    if (chrome) chrome.kill('SIGKILL');
    console.log('FAIL hard deadline (25 s) exceeded');
    process.exit(1);
  }, DEADLINE_MS);
  try {
    const s = await startServer();
    server = s.server;
    const c = await launchChrome();
    chrome = c.child;
    cdp = new Cdp(c.wsUrl);
    await cdp.open();
    const { targetId } = await cdp.send('Target.createTarget', {
      url: 'about:blank',
    });
    const { sessionId } = await cdp.send('Target.attachToTarget', {
      targetId,
      flatten: true,
    });
    const checks = runChecks(
      cdp,
      sessionId,
      `http://127.0.0.1:${s.port}/vllm/`
    );
    const earlyExit = c.exited.then(({ code, signal }) => {
      throw new Error(`chrome exited early (code ${code}, signal ${signal})`);
    });
    const { results } = await Promise.race([checks, earlyExit]);
    for (const r of results) {
      console.log(
        `${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.pass ? '' : ` (${r.detail})`}`
      );
    }
    exitCode = results.every((r) => r.pass) ? 0 : 1;
  } catch (err) {
    console.log(`FAIL setup (${err.message})`);
  } finally {
    clearTimeout(deadline);
    if (cdp) cdp.close();
    if (chrome) chrome.kill('SIGKILL');
    if (server) server.close();
  }
  process.exit(exitCode);
}

main();
