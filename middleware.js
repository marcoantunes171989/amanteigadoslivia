/**
 * Multi-tenant + landing:
 * - cardapio.pedidoprime.com.br → sempre a landing (nunca /produtos)
 * - demais domínios de loja → / vira cardápio
 * - /landing fora do host da landing → redireciona para o domínio oficial
 *
 * Nota: em projetos estáticos a Vercel serve index.html em "/" antes dos
 * rewrites do vercel.json; por isso a landing é forçada aqui no middleware.
 */
export const config = {
  matcher: [
    '/',
    '/index',
    '/index.html',
    '/landing',
    '/landing.html',
    '/produtos',
    '/produtos.html',
    '/carrinho',
    '/carrinho.html',
    '/acompanhar',
    '/acompanhar.html',
  ],
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

function isStorefrontPath(path) {
  return path === '/produtos'
    || path === '/produtos.html'
    || path === '/carrinho'
    || path === '/carrinho.html'
    || path === '/acompanhar'
    || path === '/acompanhar.html';
}

export default function middleware(request) {
  const host = requestHost(request);
  const url = new URL(request.url);
  const path = url.pathname;

  // Host da landing: nunca servir cardápio de empresa.
  if (host === LANDING_HOST) {
    if (path === '/' || path === '/index' || path === '/index.html' || isStorefrontPath(path)) {
      url.pathname = '/landing';
      url.search = '';
      return Response.redirect(url, 307);
    }
    return;
  }

  // /landing só existe em cardapio.pedidoprime.com.br
  if (path === '/landing' || path === '/landing.html') {
    return Response.redirect(LANDING_URL, 308);
  }

  if (!host || PLATFORM_HOSTS.has(host) || host.endsWith('.vercel.app')) {
    return;
  }

  if (path === '/' || path === '/index' || path === '/index.html') {
    url.pathname = '/produtos';
    return Response.redirect(url, 307);
  }
}
