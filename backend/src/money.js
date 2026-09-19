import { AdminError } from './admin-errors.js';

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function slugFromName(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function assertSlug(slug, label = 'Slug') {
  if (typeof slug !== 'string' || !SLUG_PATTERN.test(slug)) {
    throw new AdminError(400, 'validation_error', `${label} inválido.`);
  }
  return slug;
}

export function parseReaisToCentavos(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new AdminError(400, 'validation_error', 'Preço inválido.');
    }
    const asString = Number.isInteger(value)
      ? String(value)
      : value.toFixed(2);
    return parseReaisToCentavos(asString);
  }

  let raw = String(value).trim().replace(/\s/g, '').replace(/^R\$/i, '');
  if (raw === '') {
    return null;
  }
  if (raw.startsWith('-')) {
    throw new AdminError(400, 'validation_error', 'Preço deve ser maior que zero.');
  }

  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  let normalized;

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      normalized = raw.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = raw.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    const decimals = raw.length - lastComma - 1;
    normalized = decimals <= 2 ? raw.replace(',', '.') : raw.replace(/,/g, '');
  } else if (lastDot !== -1) {
    const decimals = raw.length - lastDot - 1;
    normalized = decimals <= 2 ? raw : raw.replace(/\./g, '');
  } else {
    normalized = raw;
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new AdminError(400, 'validation_error', 'Preço inválido.');
  }

  const [whole, frac = ''] = normalized.split('.');
  const centavos = Number.parseInt(whole, 10) * 100
    + Number.parseInt((frac + '00').slice(0, 2), 10);

  if (!Number.isInteger(centavos) || centavos <= 0) {
    throw new AdminError(400, 'validation_error', 'Preço deve ser maior que zero.');
  }

  return centavos;
}

export function formatCentavosToReais(centavos) {
  if (centavos === null || centavos === undefined || centavos === '') {
    return '';
  }
  const asNumber = typeof centavos === 'bigint' ? Number(centavos) : Number(centavos);
  if (!Number.isFinite(asNumber)) {
    return '';
  }
  const absolute = Math.abs(Math.trunc(asNumber));
  const whole = Math.floor(absolute / 100);
  const frac = String(absolute % 100).padStart(2, '0');
  return `${whole},${frac}`;
}

export function parseOrdem(value, fallback = 0) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  const asNumber = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(asNumber) || asNumber < 0) {
    throw new AdminError(400, 'validation_error', 'Ordem de exibição inválida.');
  }
  return asNumber;
}

export function parseBoolean(value, fallback = false) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 'true' || value === '1' || value === 1) {
    return true;
  }
  if (value === 'false' || value === '0' || value === 0) {
    return false;
  }
  throw new AdminError(400, 'validation_error', 'Valor booleano inválido.');
}
