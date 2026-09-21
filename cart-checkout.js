// ===================== CHECKOUT DO CARRINHO — FLUXO (V10) =====================
// Orquestra o clique único de "Finalizar pelo WhatsApp":
//   validar formulário → validar destino → POST /api/vendas → (200) montar
//   mensagem → abrir WhatsApp.
// Sem DOM/fetch/window aqui: tudo entra por injeção, para testar sem navegador.
// O WhatsApp NUNCA abre antes de o servidor responder sucesso.
import {
  CHECKOUT_MESSAGES,
  buildCartWhatsAppMessage,
  isMobileWhatsAppClient,
  validateCheckoutName,
  validateCheckoutPhone,
} from './ui-core.js';
import { buildWhatsAppUrl, resolveCommercialWhatsAppPhone } from './backend/src/whatsapp.js';

export function validateCheckoutFields({ nome, telefone } = {}) {
  const name = validateCheckoutName(nome);
  const phone = validateCheckoutPhone(telefone);
  const errors = {};
  if (!name.ok) errors.nome = name.message;
  if (!phone.ok) errors.telefone = phone.message;
  return {
    ok: !errors.nome && !errors.telefone,
    errors,
    values: { nome: name.value, telefone: phone.value },
  };
}

// Lê o número comercial atual; se ainda não carregado/válido, tenta atualizar
// a configuração pública uma vez (fluxo existente loadFromApi) e relê.
export async function resolveCheckoutDestination({ readPhone, refreshPhone } = {}) {
  let phone = resolveCommercialWhatsAppPhone(readPhone?.());
  if (!phone && typeof refreshPhone === 'function') {
    try {
      await refreshPhone();
    } catch {
      // segue: destino continua indisponível e o checkout é bloqueado
    }
    phone = resolveCommercialWhatsAppPhone(readPhone?.());
  }
  return phone;
}

function centavosToReais(value) {
  const centavos = Number(value);
  return Number.isFinite(centavos) ? centavos / 100 : null;
}

// Usa os dados autoritativos devolvidos pelo servidor (data.venda); só cai no
// carrinho local para itens se o servidor não devolver a lista.
export function buildCheckoutMessage({ venda, localItems = [], nome, telefone }) {
  const serverItems = Array.isArray(venda?.itens) ? venda.itens : [];
  const items = serverItems.length
    ? serverItems.map((item) => ({
      quantity: item.quantidade,
      name: item.nome_produto,
      subtotal: centavosToReais(item.valor_total_centavos),
    }))
    : localItems.map((item) => ({
      quantity: item.quantity,
      name: item.product?.name || item.name,
      subtotal: item.subtotal,
    }));
  const serverTotal = centavosToReais(venda?.valor_total_centavos);
  const total = serverTotal != null
    ? serverTotal
    : items.reduce((sum, item) => sum + (Number(item.subtotal) || 0), 0);
  return buildCartWhatsAppMessage({
    items,
    total,
    nome: venda?.nome_cliente || nome,
    telefone: venda?.telefone_cliente || telefone,
    pedidoId: venda?.id_venda,
  });
}

function fieldForMessage(message) {
  const text = String(message || '');
  if (/telefone/i.test(text)) return 'telefone';
  if (/nome/i.test(text)) return 'nome';
  return null;
}

// deps:
//   fields        { nome, telefone }  valores crus dos inputs
//   items         itens do carrinho (Cart.getCartItems())
//   idempotencyKey(fields)  → string
//   readPhone()   → número comercial cru da configuração pública
//   refreshPhone()  (opcional) recarrega a configuração pública
//   postVenda(payload) → { ok, status, data }  (pode lançar em falha de rede)
//   openWhatsApp(url)
export async function runCartCheckout(deps = {}) {
  const items = Array.isArray(deps.items) ? deps.items : [];
  if (!items.length) return { ok: false, code: 'empty' };

  const validation = validateCheckoutFields(deps.fields);
  if (!validation.ok) return { ok: false, code: 'validation', errors: validation.errors };

  const destination = await resolveCheckoutDestination({
    readPhone: deps.readPhone,
    refreshPhone: deps.refreshPhone,
  });
  if (!destination) {
    return { ok: false, code: 'destination', message: CHECKOUT_MESSAGES.destinationUnavailable };
  }

  const { nome, telefone } = validation.values;
  const payload = {
    chave_idempotencia: deps.idempotencyKey({ nome, telefone }),
    origem_venda: 'SITE',
    nome_cliente: nome,
    telefone_cliente: telefone,
    itens: items.map((item) => ({
      id_produto: item.productId,
      quantidade: item.quantity,
    })),
  };

  let response;
  try {
    response = await deps.postVenda(payload);
  } catch {
    return { ok: false, code: 'api', status: 0, message: CHECKOUT_MESSAGES.serverError };
  }

  if (!response?.ok) {
    const status = Number(response?.status) || 0;
    if (status === 429) {
      return { ok: false, code: 'api', status, message: CHECKOUT_MESSAGES.rateLimited };
    }
    if (status === 400) {
      const message = response?.data?.message || CHECKOUT_MESSAGES.serverError;
      return { ok: false, code: 'api', status, message, field: fieldForMessage(message) };
    }
    return { ok: false, code: 'api', status, message: CHECKOUT_MESSAGES.serverError };
  }

  const data = response.data || {};
  const message = buildCheckoutMessage({ venda: data.venda, localItems: items, nome, telefone });
  const url = buildWhatsAppUrl(destination, message);
  if (!url) {
    return { ok: false, code: 'destination', message: CHECKOUT_MESSAGES.destinationUnavailable, registered: true };
  }
  deps.openWhatsApp(url);
  return {
    ok: true,
    duplicated: data.duplicated === true,
    url,
    venda: data.venda || null,
    message: data.duplicated === true
      ? CHECKOUT_MESSAGES.registeredDuplicated
      : CHECKOUT_MESSAGES.registered,
  };
}

// Mobile: navega direto (app/Web do WhatsApp), sem popup em branco.
// Desktop: nova aba; se bloqueada, navega na aba atual. Chamamos window.open
// SEM a feature 'noopener' — com ela o retorno é sempre null e não daria para
// detectar bloqueio — e cortamos o opener manualmente (equivalente).
export function openWhatsAppUrl(url, { win, userAgent = '' } = {}) {
  if (!win) return 'none';
  if (isMobileWhatsAppClient(userAgent)) {
    win.location.assign(url);
    return 'assign';
  }
  let popup = null;
  try {
    popup = win.open(url, '_blank');
  } catch {
    popup = null;
  }
  if (!popup) {
    win.location.assign(url);
    return 'assign';
  }
  try {
    popup.opener = null;
  } catch {
    // ignorado
  }
  return 'open';
}
