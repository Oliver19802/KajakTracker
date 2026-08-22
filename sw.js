const CACHE = 'kajaktracker-v23';

const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './waterway-status.js',
  './offline-map.js',
  './poi-data/regions.json',
  './offline-test/data/spreewald-pois.json',
  './manifest.json',
  './vendor/leaflet/leaflet.css',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/images/layers.png',
  './vendor/leaflet/images/layers-2x.png',
  './vendor/leaflet/images/marker-icon.png',
  './vendor/leaflet/images/marker-icon-2x.png',
  './vendor/leaflet/images/marker-shadow.png',
  './offline-test/vendor/maplibre-gl.css',
  './offline-test/vendor/maplibre-gl.js',
  './offline-test/vendor/pmtiles.js',
  './offline-test/vendor/fonts/Open Sans Semibold/0-255.pbf',
  './offline-test/vendor/fonts/Open Sans Semibold/256-511.pbf'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith('kajaktracker-') && key !== CACHE)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

async function networkFirst(request, navigationFallback = false) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (navigationFallback) {
      const appShell = await caches.match('./index.html') || await caches.match('./');
      if (appShell) return appShell;
    }
    return Response.error();
  }
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  const scopeUrl = new URL(self.registration.scope);
  if (requestUrl.origin !== scopeUrl.origin ||
      !requestUrl.pathname.startsWith(scopeUrl.pathname)) return;

  const relativePath = requestUrl.pathname.slice(scopeUrl.pathname.length);
  const isCoreFile = ASSETS
    .map(path => path === './' ? '' : path.replace(/^\.\//, ''))
    .includes(relativePath);
  const isNavigation = event.request.mode === 'navigate';
  if (!isCoreFile && !isNavigation) return;

  event.respondWith(networkFirst(event.request, isNavigation));
});
