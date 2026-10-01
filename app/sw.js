// App-shell cache. Bump VERSION on every release so clients pick up new files.
const VERSION = 'v1.0.0';
const CACHE = `forge-depths-${VERSION}`;
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/main.js', './js/game.js', './js/dungeon.js', './js/fov.js', './js/path.js', './js/rng.js', './js/data.js', './js/bot.js',
  './js/render.js', './js/sprites.js', './js/sheet.js', './js/audio.js', './js/music.js', './js/chip/synth.js', './js/chip/worklet.js',
  './fonts/jacquard-12.woff2', './fonts/vt323.woff2', './fonts/silkscreen-400.woff2',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png',
];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request).then((hit) => {
    const net = fetch(e.request).then((res) => { if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone())); return res; }).catch(() => hit);
    return hit || net;
  }));
});
