// Service worker: offline play and instant start
// (docs/STABILITY-DESIGN.md, section 2, build task 6).
//
// - Versioned files (any URL with ?v=) and icons/: cache first. They never
//   change once stamped, so this is always safe.
// - The shell (index.html, manifest.webmanifest, rush.html, and the scope
//   root, which serves index.html): network first with a 3 s timeout,
//   falling back to the cache. An update shows up on the next online load;
//   the game still opens with no signal.
// - Cache name overclock-<stamp>: tools/stamp.sh writes the release id into
//   CACHE below, and activate deletes every other overclock-* cache, so old
//   files never pile up.
// - skipWaiting and clients.claim, no reload prompt: the new version applies
//   on the next launch.
// - Never caches non-GET requests or other origins.

const CACHE = 'overclock-20261103183009';

// The named shell files, resolved against the scope.
const SHELL = ['index.html', 'manifest.webmanifest', 'rush.html'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(precache());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith('overclock-') && n !== CACHE)
          .map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // never cache non-GET requests
  let url;
  try {
    url = new URL(req.url);
  } catch (err) {
    return;
  }
  if (url.origin !== self.location.origin) return; // other origins: never
  const name = url.pathname.split('/').pop();
  const shell =
    name === 'index.html' ||
    name === 'manifest.webmanifest' ||
    name === 'rush.html' ||
    url.pathname.endsWith('/'); // the scope root serves index.html
  const versioned =
    /\?v=/.test(url.search) || url.pathname.includes('/icons/');
  if (versioned) event.respondWith(cacheFirst(req));
  else if (shell) event.respondWith(networkFirst(req));
  // anything else: let it go to the network, uncached
});

// Cache first; a miss goes to the network and fills the cache.
async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}

// Network first with a 3 s timeout; a timeout or failure falls back to the
// cache. A success refreshes the cache, so the next offline load is fresh.
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  let res = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    res = await fetch(req, { signal: controller.signal });
    clearTimeout(timer);
  } catch (err) {
    res = null;
  }
  if (res && res.ok) cache.put(req, res.clone());
  if (res) return res;
  const hit = await cache.match(req);
  if (hit) return hit;
  return Response.error();
}

// Precache on install so the game opens offline after the first online load:
// the shell, every versioned file it references (following module imports),
// and the icons it references. A failure is ignored: the fetch handlers fill
// the cache on the next online load.
async function precache() {
  const cache = await caches.open(CACHE);
  const seen = new Set();
  const put = async (href) => {
    if (seen.has(href)) return;
    seen.add(href);
    try {
      const res = await fetch(href, { cache: 'no-cache' });
      if (res && res.ok) await cache.put(href, res);
    } catch (err) {
      // offline or missing: the fetch handlers catch up on the next load
    }
  };
  const putJs = async (href) => {
    if (seen.has(href)) return;
    seen.add(href);
    try {
      const res = await fetch(href, { cache: 'no-cache' });
      if (!res || !res.ok) return;
      await cache.put(href, res.clone());
      const text = await res.text();
      for (const m of text.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        let abs;
        try {
          abs = new URL(m[1], href).href;
        } catch (err) {
          continue;
        }
        if (abs.startsWith(self.location.origin)) await putJs(abs);
      }
    } catch (err) {
      // skip
    }
  };
  const putHtml = async (href) => {
    if (seen.has(href)) return;
    seen.add(href);
    try {
      const res = await fetch(href, { cache: 'no-cache' });
      if (!res || !res.ok) return;
      await cache.put(href, res.clone());
      const html = await res.text();
      for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
        let abs;
        try {
          abs = new URL(m[1], href).href;
        } catch (err) {
          continue;
        }
        if (!abs.startsWith(self.location.origin)) continue;
        const u = new URL(abs);
        if (/\?v=/.test(u.search)) await putJs(abs);
        else if (u.pathname.includes('/icons/')) await put(abs);
      }
    } catch (err) {
      // skip
    }
  };
  const scope = self.registration.scope;
  await putHtml(scope); // the scope root serves index.html
  for (const f of SHELL) {
    const href = new URL(f, scope).href;
    if (f === 'manifest.webmanifest') await put(href);
    else await putHtml(href);
  }
}
