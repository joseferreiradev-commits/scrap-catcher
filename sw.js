const CACHE = 'scrap-catcher-v4';
const ASSETS = ['./', './index.html', './static/styles.css?v=5', './static/app.js?v=5', './manifest.webmanifest', './static/icon.svg', './static/icon-192.svg', './static/icon-512.svg'];
self.addEventListener('install', (event) => event.waitUntil(caches.open(CACHE).then((cache) => Promise.all(ASSETS.map((asset) => cache.add(asset).catch(() => null))))));
self.addEventListener('activate', (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (event) => event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => { if (event.request.method === 'GET' && response.ok) { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(event.request, copy)); } return response; }).catch(() => caches.match('./index.html')))));
