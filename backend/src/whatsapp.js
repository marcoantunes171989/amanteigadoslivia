import {
  buildCartWhatsAppMessage as buildSharedCartWhatsAppMessage,
  buildEncomendaWhatsAppMessage as buildSharedEncomendaWhatsAppMessage,
  isPlaceholderWhatsAppDigits,
  moneyPtBr,
} from '../../ui-core.js';

export { moneyPtBr };

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

export function buildCartWhatsAppMessage(payload = {}) {
  return buildSharedCartWhatsAppMessage(payload);
}

// Destino comercial do checkout: número normalizado, nunca placeholder
// (ex.: 5500000000000). Retorna null quando ausente/inválido.
export function resolveCommercialWhatsAppPhone(raw) {
  const digits = normalizeWhatsAppPhone(raw);
  if (!digits || isPlaceholderWhatsAppDigits(digits)) return null;
  return digits;
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
