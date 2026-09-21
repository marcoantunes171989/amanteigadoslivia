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

// ===================== CHECKOUT DO CARRINHO (V10) =====================
// Helpers puros compartilhados entre navegador (carrinho.js / cart-checkout.js)
// e backend (admin-sales.js). Sem DOM, sem fetch, sem módulos Node.
export const CHECKOUT_NAME_MIN = 2;
export const CHECKOUT_NAME_MAX = 120;

export const CHECKOUT_MESSAGES = Object.freeze({
  nameRequired: 'Informe seu nome.',
  phoneRequired: 'Informe seu telefone.',
  phoneInvalid: 'Informe um telefone válido.',
  destinationUnavailable: 'WhatsApp comercial indisponível no momento. Tente novamente em instantes.',
  rateLimited: 'Muitas tentativas. Aguarde um momento.',
  serverError: 'Não foi possível registrar o pedido agora. Tente novamente.',
  registered: 'Pedido registrado. Continue no WhatsApp para concluir.',
  registeredDuplicated: 'Este pedido já estava registrado. Continue no WhatsApp para concluir.',
});

// Remove controles/quebras de linha (evita injeção de linhas na mensagem do
// WhatsApp), colapsa espaços e aplica o limite seguro de comprimento.
export function normalizeCustomerName(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CHECKOUT_NAME_MAX)
    .trim();
}

export function validateCheckoutName(value) {
  const name = normalizeCustomerName(value);
  if (name.length < CHECKOUT_NAME_MIN) {
    return { ok: false, value: name, message: CHECKOUT_MESSAGES.nameRequired };
  }
  return { ok: true, value: name, message: '' };
}

// Telefone nacional: 10 (fixo) ou 11 (celular) dígitos. Aceita colar com
// +55/55 na frente. Retorna somente dígitos normalizados.
export function nationalPhoneDigits(value) {
  let digits = digitsOnly(value);
  if (digits.length > 11 && digits.startsWith('55')) digits = digits.slice(2);
  return digits;
}

export function validateCheckoutPhone(value) {
  const raw = String(value || '');
  if (!digitsOnly(raw)) {
    return { ok: false, value: '', message: CHECKOUT_MESSAGES.phoneRequired };
  }
  const digits = nationalPhoneDigits(raw);
  if ((digits.length !== 10 && digits.length !== 11) || digits.startsWith('0')) {
    return { ok: false, value: digits, message: CHECKOUT_MESSAGES.phoneInvalid };
  }
  return { ok: true, value: digits, message: '' };
}

export function maskCheckoutPhone(value) {
  return maskWhatsAppPtBr(nationalPhoneDigits(value).slice(0, 11));
}

// Posição do cursor logo após o n-ésimo dígito de um valor já mascarado.
export function caretAfterDigits(masked, digitCount) {
  const text = String(masked || '');
  if (digitCount <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (/\d/.test(text[i])) {
      seen += 1;
      if (seen === digitCount) return i + 1;
    }
  }
  return text.length;
}

// Reaplica a máscara preservando o cursor (colar, apagar, editar no meio).
// Se Backspace apagou só um caractere de formatação — "(18) |9" → "(18|9" —,
// a máscara restauraria o mesmo texto e o cursor travaria; nesse caso remove
// o dígito anterior ao cursor.
export function applyPhoneMaskEdit({ previous = '', next = '', caret = null, inputType = '' } = {}) {
  const nextText = String(next || '');
  const pos = Number.isInteger(caret) ? Math.min(Math.max(caret, 0), nextText.length) : nextText.length;
  let digits = digitsOnly(nextText);
  let digitsBeforeCaret = digitsOnly(nextText.slice(0, pos)).length;
  const removedOnlyFormatting = inputType === 'deleteContentBackward'
    && digits === digitsOnly(previous)
    && digitsBeforeCaret > 0;
  if (removedOnlyFormatting) {
    digits = digits.slice(0, digitsBeforeCaret - 1) + digits.slice(digitsBeforeCaret);
    digitsBeforeCaret -= 1;
  }
  const fromPaste = digits.length > 11 && digits.startsWith('55');
  if (fromPaste) {
    digits = digits.slice(2);
    digitsBeforeCaret = Math.max(0, digitsBeforeCaret - 2);
  }
  const value = maskWhatsAppPtBr(digits.slice(0, 11));
  return { value, caret: caretAfterDigits(value, Math.min(digitsBeforeCaret, 11)) };
}

export function moneyPtBr(value) {
  const amount = Number(value);
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
    .format(safe)
    .replace(/ /g, ' ');
}

// Identificador curto e amigável (nunca o UUID completo) para a mensagem.
export function shortOrderId(id) {
  const compact = String(id ?? '').replace(/[^0-9a-zA-Z]/g, '');
  return compact ? compact.slice(0, 8).toUpperCase() : '';
}

// Placeholder/inválido nunca é destino de checkout (ex.: 5500000000000).
export function isPlaceholderWhatsAppDigits(digits) {
  const value = String(digits || '');
  const rest = value.startsWith('55') ? value.slice(2) : value;
  return !rest || /^0+$/.test(rest) || /^(\d)\1+$/.test(rest);
}

// Mensagem do pedido. Valores em reais (Number); itens: {quantity, name,
// subtotal} ou {quantity, name, unitPrice}.
export function buildCartWhatsAppMessage({ items = [], total, nome, telefone, pedidoId } = {}) {
  const lines = ['Olá! Gostaria de fazer um pedido na Amanteigados Lívia.'];
  const cliente = normalizeCustomerName(nome);
  const telefoneFmt = telefone ? formatWhatsAppMaskDisplay(telefone) : '';
  const customer = [
    cliente ? `*Cliente:* ${cliente}` : '',
    telefoneFmt ? `*Telefone:* ${telefoneFmt}` : '',
  ].filter(Boolean);
  if (customer.length) lines.push('', ...customer);

  lines.push('', '*Pedido:*');
  for (const item of items) {
    const qty = Number(item.quantity) || 0;
    const name = String(item.name || 'Produto').replace(/\s+/g, ' ').trim() || 'Produto';
    const unit = Number(item.unitPrice);
    const subtotal = item.subtotal != null && Number.isFinite(Number(item.subtotal))
      ? Number(item.subtotal)
      : unit * qty;
    lines.push(`${qty}x ${name} — ${moneyPtBr(subtotal)}`);
  }
  lines.push('', `*Total:* ${moneyPtBr(total)}`);
  const code = shortOrderId(pedidoId);
  if (code) lines.push('', `*Código do pedido:* #${code}`);
  lines.push('', 'Aguardo a confirmação. Obrigado!');
  return lines.join('\n');
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
