export const SIDEBAR_STORAGE_KEY = 'admin_sidebar_collapsed';

export function readSidebarCollapsed(storage) {
  try {
    return storage?.getItem?.(SIDEBAR_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(storage, collapsed) {
  try {
    storage?.setItem?.(SIDEBAR_STORAGE_KEY, collapsed ? 'true' : 'false');
    return true;
  } catch {
    return false;
  }
}

export function createRefreshGate({ minIntervalMs = 250 } = {}) {
  let inflight = null;
  let queued = false;
  let lastStarted = 0;

  async function run(task) {
    if (typeof task !== 'function') return null;
    if (inflight) {
      queued = true;
      return inflight;
    }
    const wait = Math.max(0, minIntervalMs - (Date.now() - lastStarted));
    const execute = async () => {
      lastStarted = Date.now();
      try {
        return await task();
      } finally {
        inflight = null;
        if (queued) {
          queued = false;
          await run(task);
        }
      }
    };
    inflight = wait > 0
      ? new Promise((resolve) => setTimeout(resolve, wait)).then(execute)
      : execute();
    return inflight;
  }

  return {
    run,
    isBusy() {
      return Boolean(inflight);
    },
  };
}

export function shouldApplyRevision(previous, next) {
  if (!next) return false;
  if (!previous) return true;
  return previous !== next;
}

export function catalogItemsSignature(products) {
  return (products || []).map((product) => [
    product?.id,
    product?.name,
    product?.shortDescription,
    product?.description,
    product?.price,
    product?.promotionalPrice,
    product?.image,
    product?.active,
    product?.featured,
    product?.categoryId,
  ].join('\u001f')).join('\u001e');
}

export function preserveCatalogFilters(state, next = {}) {
  const current = state && typeof state === 'object' ? state : {};
  return {
    ...current,
    query: next.query == null ? current.query : String(next.query),
    category: next.category == null ? current.category : next.category,
    sort: next.sort == null ? current.sort : next.sort,
  };
}

export function isDevHost(hostname) {
  const host = String(hostname || '');
  return host === 'localhost' || host === '127.0.0.1';
}

export function buildRealtimeBroadcastBody(channel, event, payload) {
  return {
    messages: [
      {
        topic: channel,
        event,
        payload: payload || {},
      },
    ],
  };
}

export function realtimeBroadcastUrl(supabaseUrl) {
  return `${String(supabaseUrl || '').replace(/\/$/, '')}/realtime/v1/api/broadcast`;
}

export const APP_SHELL_MAX_PX = 1024;
export const PHONE_MAX_PX = 767;

export function isAppShellViewport(width) {
  return Number(width) <= APP_SHELL_MAX_PX;
}

export function isPhoneViewport(width) {
  return Number(width) <= PHONE_MAX_PX;
}

export function appBottomNavItems() {
  return [
    { id: 'inicio', label: 'Início', href: '/' },
    { id: 'cardapio', label: 'Cardápio', href: '/produtos' },
    { id: 'encomendas', label: 'Encomendas', href: '/#encomendas' },
    { id: 'carrinho', label: 'Carrinho', href: '/carrinho' },
    { id: 'mais', label: 'Mais', href: '#mais' },
  ];
}

export function appMoreMenuItems() {
  return [
    { id: 'festas', label: 'Festas', href: '/#festas-momentos' },
    { id: 'personalizados', label: 'Personalizados', href: '/#personalizados-historia' },
    { id: 'admin', label: 'Painel Administrativo', href: '/admin' },
  ];
}

export function activeAppNavId(pathname, hash = '') {
  const path = String(pathname || '/');
  const frag = String(hash || '').replace(/^#/, '');
  if (path.startsWith('/carrinho')) return 'carrinho';
  if (path.startsWith('/produtos')) return 'cardapio';
  if (path === '/' || path === '/index.html' || path === '') {
    if (frag === 'encomendas') return 'encomendas';
    if (frag === 'festas-momentos' || frag === 'personalizados-historia') return 'mais';
    return 'inicio';
  }
  return 'inicio';
}
