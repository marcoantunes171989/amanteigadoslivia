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

export function buildCartWhatsAppMessage({ items = [], total, nome, telefone } = {}) {
  const lines = ['Olá! Gostaria de fazer este pedido:', ''];
  for (const item of items) {
    const qty = Number(item.quantity) || 0;
    const name = String(item.name || 'Produto').trim() || 'Produto';
    const unit = Number(item.unitPrice);
    const subtotal = Number.isFinite(unit) ? unit * qty : Number(item.subtotal);
    lines.push(`${qty}x ${name} — ${moneyPtBr(subtotal)}`);
  }
  lines.push('', `Total: ${moneyPtBr(total)}`);
  if (nome) lines.push('', `Nome: ${String(nome).trim()}`);
  if (telefone) lines.push(`Telefone: ${String(telefone).trim()}`);
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
