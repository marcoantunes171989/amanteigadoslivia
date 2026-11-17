/* Service worker leve — cache de shell apenas. Pedidos sempre vão ao servidor. */
const SHELL = 'amanteigados-shell-v1';
const ASSETS = [
  '/produtos',
  '/carrinho',
  '/storefront.css',
  '/produtos.js',
  '/carrinho.js',
  '/catalog-core.js',
  '/cart.js',
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
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        if (response.ok && (url.origin === self.location.origin)) {
          caches.open(SHELL).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
          return caches.match('/produtos');
        }
        return Response.error();
      }),
  );
});
