const CACHE_NAME = 'web-reader-pro-v7';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './volumes.js',
  './chapters.js',
  './app.js',
  './manifest.webmanifest',
  './favicon.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL.filter(Boolean)))
      .catch(err => console.warn('SW pre-cache error (non-fatal):', err))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) return;
  
  // Do not cache audio stream requests via service worker (handled via IndexedDB/memory)
  if (event.request.url.includes('/api/tts') || event.request.url.includes('/tts')) return;

  // Network-first for HTML, CSS, JS to guarantee fresh UI updates
  if (event.request.url.includes('.css') || event.request.url.includes('.js') || event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok && response.type === 'basic') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first fallback for static media
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
