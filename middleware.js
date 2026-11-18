/**
 * Multi-tenant + landing:
 * - cardapio.pedidoprime.com.br → landing (só nesse host)
 * - demais domínios de loja → / vira cardápio
 * - /landing fora do host da landing → redireciona para o domínio oficial
 */
export const config = {
  matcher: ['/', '/index', '/index.html', '/landing', '/landing.html'],
};

const PLATFORM_HOSTS = new Set([
  'amanteigadoslivia.vercel.app',
  'localhost',
  '127.0.0.1',
]);

const LANDING_HOST = 'cardapio.pedidoprime.com.br';
const LANDING_URL = `https://${LANDING_HOST}/`;

function requestHost(request) {
  return String(request.headers.get('host') || '')
    .split(',')[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '');
}

export default function middleware(request) {
  const host = requestHost(request);
  const url = new URL(request.url);
  const path = url.pathname;

  // Landing oficial: só em cardapio.pedidoprime.com.br
  if (path === '/landing' || path === '/landing.html') {
    if (host !== LANDING_HOST) {
      return Response.redirect(LANDING_URL, 308);
    }
    return;
  }

  if (!host || PLATFORM_HOSTS.has(host) || host.endsWith('.vercel.app') || host === LANDING_HOST) {
    return;
  }

  if (path === '/' || path === '/index' || path === '/index.html') {
    url.pathname = '/produtos';
    return Response.redirect(url, 307);
  }
}
