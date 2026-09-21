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

export const QUANTIDADE_MINIMA_KEY = 'quantidade_minima_solicitacao';

export const ENCOMENDA_TIPO_LABELS = Object.freeze({
  ENCOMENDA: 'Encomenda',
  ANIVERSARIO: 'Aniversário',
  PRESENTE: 'Presente',
  CELEBRACAO: 'Celebração',
  EVENTO: 'Evento',
  LEMBRANCA: 'Lembrança',
  PERSONALIZADO: 'Personalizado',
});

export const QUANTIDADE_MINIMA_DEFAULT = Object.freeze({
  ENCOMENDA: 1,
  ANIVERSARIO: 1,
  PRESENTE: 1,
  CELEBRACAO: 1,
  EVENTO: 1,
  LEMBRANCA: 1,
  PERSONALIZADO: 1,
});

export function normalizeQuantidadeMinimaMap(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const out = {};
  for (const tipo of Object.keys(QUANTIDADE_MINIMA_DEFAULT)) {
    const parsed = Number.parseInt(String(source[tipo] ?? QUANTIDADE_MINIMA_DEFAULT[tipo]), 10);
    out[tipo] = Number.isInteger(parsed) && parsed >= 1 && parsed <= 10000
      ? parsed
      : QUANTIDADE_MINIMA_DEFAULT[tipo];
  }
  return out;
}

export function minQuantidadeForTipo(map, tipo) {
  const normalized = normalizeQuantidadeMinimaMap(map);
  return normalized[String(tipo || '').toUpperCase()] || 1;
}

export function isSimpleEmail(value) {
  const text = String(value || '').trim();
  if (!text) return true;
  if (/\s/.test(text)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
}

export function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

export function maskWhatsAppPtBr(value) {
  const digits = digitsOnly(value).slice(0, 11);
  if (!digits) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function formatWhatsAppMaskDisplay(raw) {
  const digits = digitsOnly(raw);
  if (digits.startsWith('55') && digits.length >= 12) {
    return maskWhatsAppPtBr(digits.slice(2));
  }
  return maskWhatsAppPtBr(digits);
}

export function isValidIsoDate(iso) {
  const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function parseBrDateToIso(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return isValidIsoDate(text) ? text : null;
  }
  const match = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  return isValidIsoDate(iso) ? iso : null;
}

export function formatIsoToBrDate(value) {
  const iso = parseBrDateToIso(value);
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

export function maskBrDateInput(value) {
  const digits = digitsOnly(value).slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function buildEncomendaWhatsAppMessage({
  nome,
  tipo,
  telefone,
  email,
  dataEvento,
  quantidade,
  descricao,
  solicitacaoId,
} = {}) {
  const lines = ['Olá! Gostaria de solicitar uma encomenda na Amanteigados Lívia.'];
  const tipoLabel = ENCOMENDA_TIPO_LABELS[String(tipo || '').toUpperCase()] || String(tipo || '').trim();
  const dateLabel = formatIsoToBrDate(dataEvento) || String(dataEvento || '').trim();
  const fields = [
    tipoLabel ? `*Tipo:* ${tipoLabel}` : '',
    nome ? `*Nome:* ${String(nome).trim()}` : '',
    telefone ? `*WhatsApp:* ${String(telefone).trim()}` : '',
    email ? `*E-mail:* ${String(email).trim()}` : '',
    dateLabel ? `*Data:* ${dateLabel}` : '',
    quantidade ? `*Quantidade estimada:* ${String(quantidade).trim()}` : '',
  ].filter(Boolean);
  if (fields.length) {
    lines.push('', ...fields);
  }
  const details = String(descricao || '').trim();
  if (details) {
    lines.push('', '*Detalhes do pedido:*', details);
  }
  if (solicitacaoId) {
    lines.push('', `*Solicitação:* ${String(solicitacaoId).trim()}`);
  }
  return lines.join('\n');
}

export function isMobileWhatsAppClient(userAgent = '') {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(String(userAgent));
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
