/* Service worker leve — HTML/API sempre da rede; CSS/JS com rede primeiro. */
const SHELL = 'amanteigados-shell-v27';
const ASSETS = [
  '/storefront.css?v=27',
  '/storefront-theme-boot.js?v=27',
  '/api/tema-css',
  '/no-zoom.js?v=18',
  '/storefront-config.js?v=18',
  '/storefront-theme.js?v=27',
  '/order-track.js?v=18',
  '/acompanhar.js?v=18',
  '/produtos.js?v=18',
  '/carrinho.js?v=18',
  '/catalog-core.js?v=18',
  '/catalog-demo-data.js?v=18',
  '/cart.js?v=18',
  '/assets/brand/logo-topo.jpeg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== SHELL).map((key) => caches.delete(key)),
    )).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  const isDocument = request.mode === 'navigate'
    || request.destination === 'document'
    || url.pathname === '/'
    || url.pathname === '/produtos'
    || url.pathname === '/carrinho'
    || url.pathname === '/acompanhar'
    || url.pathname.endsWith('.html');

  if (isDocument) {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match('/produtos')) || Response.error()),
    );
    return;
  }

  const isCode = /\.(?:css|js)$/i.test(url.pathname);
  if (isCode) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(SHELL).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || Response.error())),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(SHELL).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      });
    }),
  );
});
