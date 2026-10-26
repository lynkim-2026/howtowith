// Offline support. The app shell is cached up front and refreshed on every online load;
// audio files are cached on first play (or all at once from the Data screen).
const SHELL = 'howtowith-shell-v1';
const AUDIO = 'howtowith-audio-v1';

const SHELL_FILES = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css', 'fonts/newsreader.woff2',
  'js/app.js', 'js/backup.js', 'js/db.js', 'js/flame.js', 'js/importer.js', 'js/session.js', 'js/srs.js',
  'js/state.js', 'js/stats.js', 'js/text.js', 'js/tts.js', 'js/ui.js', 'js/views.js',
  'vendor/ts-fsrs.mjs', 'vendor/read-excel-file.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== SHELL && k !== AUDIO) await caches.delete(k);
    await self.clients.claim();
  })());
});

// <audio> asks for byte ranges; a cached full response has to be sliced to answer them.
async function rangeResponse(request, response) {
  const m = /bytes=(\d*)-(\d*)/.exec(request.headers.get('range') || '');
  if (!m) return response;
  const buf = await response.arrayBuffer();
  const start = m[1] ? Number(m[1]) : 0;
  const end = m[2] ? Math.min(Number(m[2]), buf.byteLength - 1) : buf.byteLength - 1;
  if (start > end || start >= buf.byteLength) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${buf.byteLength}` } });
  }
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${buf.byteLength}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}

async function audio(request) {
  const cache = await caches.open(AUDIO);
  const url = new URL(request.url);
  url.search = '';
  let res = await cache.match(url.href);
  if (!res) {
    const net = await fetch(url.href); // full file, so it can be cached and sliced
    if (!net.ok) return net;
    await cache.put(url.href, net.clone());
    res = net;
  }
  return rangeResponse(request, res);
}

async function indexJson(request) {
  const cache = await caches.open(AUDIO);
  try {
    const net = await fetch(request);
    if (net.ok) cache.put(request, net.clone());
    return net;
  } catch {
    return (await cache.match(request)) || new Response('{}', { headers: { 'Content-Type': 'application/json' } });
  }
}

// Network first so updates show up on the next load; the cache keeps the app working offline.
async function shell(request) {
  const cache = await caches.open(SHELL);
  try {
    const net = await fetch(request, { cache: 'no-cache' });
    if (net.ok) cache.put(request, net.clone());
    return net;
  } catch {
    const hit = await cache.match(request, { ignoreSearch: true });
    return hit || (request.mode === 'navigate' ? cache.match('index.html') : Response.error());
  }
}

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  const path = url.pathname;
  if (path.endsWith('/audio/index.json') || path.endsWith('/data/expressions.json')) e.respondWith(indexJson(request));
  else if (/\/audio\/[^/]+\.(mp3|wav|ogg)$/i.test(path)) e.respondWith(audio(request));
  else e.respondWith(shell(request));
});
