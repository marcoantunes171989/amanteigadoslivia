import { AdminError } from './admin-errors.js';

function requestHost(request) {
  const forwarded = String(request?.headers?.['x-forwarded-host'] || '')
    .split(',')[0]
    .trim();
  const host = forwarded || String(request?.headers?.host || '').trim();
  return host.toLowerCase();
}

function hostnameOf(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return url.host.toLowerCase();
  } catch {
    return String(value).toLowerCase();
  }
}

export function assertSameOrigin(request) {
  const origin = request?.headers?.origin;
  const referer = request?.headers?.referer || request?.headers?.referrer;
  if (!origin && !referer) {
    return;
  }

  const host = requestHost(request);
  if (!host) {
    throw new AdminError(403, 'csrf_rejected', 'Origem da requisição não pôde ser validada.');
  }

  if (origin && hostnameOf(origin) !== host) {
    throw new AdminError(403, 'csrf_rejected', 'Origem da requisição não autorizada.');
  }
  if (!origin && referer && hostnameOf(referer) !== host) {
    throw new AdminError(403, 'csrf_rejected', 'Origem da requisição não autorizada.');
  }
}

export function isMutableMethod(method) {
  return !['GET', 'HEAD', 'OPTIONS'].includes(String(method || '').toUpperCase());
}
