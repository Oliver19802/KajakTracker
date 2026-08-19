const CACHE = 'kajaktracker-v10';

const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json'
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
  const isCoreFile = ['index.html', 'app.js', 'style.css', 'manifest.json']
    .includes(relativePath);
  const isNavigation = event.request.mode === 'navigate';
  if (!isCoreFile && !isNavigation) return;

  event.respondWith(networkFirst(event.request, isNavigation));
});
