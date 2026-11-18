/**
 * Multi-tenant: em domínio próprio da loja, a raiz vira o cardápio.
 * Em amanteigadoslivia.vercel.app, /loja/{slug} continua como preview.
 */
export const config = {
  matcher: ['/', '/index', '/index.html'],
};

const PLATFORM_HOSTS = new Set([
  'amanteigadoslivia.vercel.app',
  'localhost',
  '127.0.0.1',
]);

/** Hosts de marketing: raiz serve a landing, não o cardápio da loja. */
const LANDING_HOSTS = new Set([
  'cardapio.pedidoprime.com.br',
]);

export default function middleware(request) {
  const host = String(request.headers.get('host') || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '');

  if (!host || PLATFORM_HOSTS.has(host) || host.endsWith('.vercel.app') || LANDING_HOSTS.has(host)) {
    return;
  }

  const url = new URL(request.url);
  if (url.pathname === '/' || url.pathname === '/index' || url.pathname === '/index.html') {
    url.pathname = '/produtos';
    return Response.redirect(url, 307);
  }
}
