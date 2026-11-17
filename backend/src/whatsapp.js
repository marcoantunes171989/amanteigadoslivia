import { buildEncomendaWhatsAppMessage as buildSharedEncomendaWhatsAppMessage } from '../../ui-core.js';

const DIGITS = /\D/g;

export function normalizeWhatsAppPhone(raw) {
  const digits = String(raw || '').replace(DIGITS, '');
  if (!digits) return null;
  if (digits.length < 10 || digits.length > 15) return null;
  if (digits.startsWith('0')) return null;
  return digits;
}

export function formatWhatsAppDisplay(raw) {
  const digits = normalizeWhatsAppPhone(raw);
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 12) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length === 9) {
      return `+55 ${ddd} ${rest.slice(0, 5)}-${rest.slice(5)}`;
    }
    if (rest.length === 8) {
      return `+55 ${ddd} ${rest.slice(0, 4)}-${rest.slice(4)}`;
    }
  }
  return `+${digits}`;
}

export function moneyPtBr(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount);
}

export function buildCartWhatsAppMessage({
  items = [],
  total,
  nome,
  telefone,
  numeroPedido,
  modalidade,
  endereco,
} = {}) {
  const lines = ['*NOVO PEDIDO — AMANTEIGADOS LÍVIA*', ''];
  if (numeroPedido != null) {
    const label = typeof numeroPedido === 'number'
      ? `#${String(numeroPedido).padStart(6, '0')}`
      : String(numeroPedido);
    lines.push(`Pedido: ${label}`);
  }
  if (nome) lines.push(`Cliente: ${String(nome).trim()}`);
  if (telefone) lines.push(`WhatsApp: ${String(telefone).trim()}`);
  lines.push('', '*PRODUTOS*', '');
  for (const item of items) {
    const qty = Number(item.quantity) || 0;
    const name = String(item.name || 'Produto').trim() || 'Produto';
    const weight = String(item.weight || item.unit || '').trim();
    const unit = Number(item.unitPrice);
    const subtotal = Number.isFinite(unit) ? unit * qty : Number(item.subtotal);
    lines.push(`${qty}x ${name}${weight ? ` — ${weight}` : ''}`);
    if (qty > 1 && Number.isFinite(unit)) {
      lines.push(`Valor unitário: ${moneyPtBr(unit)}`);
      lines.push(`Subtotal: ${moneyPtBr(subtotal)}`);
    } else {
      lines.push(`Valor: ${moneyPtBr(subtotal)}`);
    }
    lines.push('');
  }
  lines.push(`*TOTAL DOS PRODUTOS: ${moneyPtBr(total)}*`);
  if (modalidade === 'entrega') {
    lines.push(`Entrega: A combinar${endereco ? ` — ${String(endereco).trim()}` : ''}`);
  } else if (modalidade === 'retirada') {
    lines.push('Retirada');
  } else {
    lines.push('Entrega: A combinar');
  }
  lines.push('Aguardando confirmação do atendimento.');
  return lines.join('\n');
}

export function buildEncomendaWhatsAppMessage(payload = {}) {
  return buildSharedEncomendaWhatsAppMessage(payload);
}

export function buildWhatsAppUrl(phone, message) {
  const digits = normalizeWhatsAppPhone(phone);
  if (!digits) return null;
  const text = encodeURIComponent(String(message || ''));
  return `https://wa.me/${digits}?text=${text}`;
}
