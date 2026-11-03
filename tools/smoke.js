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
      if (p.response && p.response.status === 404) notFound.push(p.response.url);
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
  // reload waits the same way.
  const loadPage = () => {
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
    return withTimeout(loaded, 15000, 'page load');
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
  // The first-run tip ("Tap the Pi to run it...") shows before the tap,
  // because tapping the run button dismisses it.
  await check(
    'fresh game: first tip appears',
    () => poll(4000, 'document.querySelector(".hint-bubble.show")')
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
          const tabs = ['game', 'upgrades', 'prestige', 'shop', 'more'];
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
