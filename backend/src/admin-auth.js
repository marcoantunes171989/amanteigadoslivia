import crypto from 'node:crypto';

export const COOKIE_NAME = 'al_admin_sess';
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

function asBuffer(value) {
  return Buffer.from(String(value ?? ''), 'utf8');
}

export function timingSafeEqualText(left, right) {
  const a = asBuffer(left);
  const b = asBuffer(right);
  if (a.length !== b.length) {
    crypto.timingSafeEqual(a, a);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

export function passwordsMatch(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') {
    return false;
  }
  if (provided.length === 0 || expected.length === 0) {
    return false;
  }
  return timingSafeEqualText(provided, expected);
}

function encodePayload(data) {
  return Buffer.from(JSON.stringify(data), 'utf8').toString('base64url');
}

export function signSession(secret, claimsOrNow, maybeNow) {
  if (!secret) {
    throw new Error('session_secret_missing');
  }

  let claims = {};
  let now = Date.now();
  if (typeof claimsOrNow === 'number') {
    now = claimsOrNow;
  } else if (claimsOrNow && typeof claimsOrNow === 'object') {
    claims = claimsOrNow;
    if (typeof maybeNow === 'number') {
      now = maybeNow;
    }
  }

  const payload = encodePayload({
    v: 2,
    id_usuario_admin: claims.id_usuario_admin || null,
    email: claims.email || null,
    perfil: claims.perfil || 'ADMIN',
    protegido: claims.protegido === true,
    exp: now + SESSION_TTL_SECONDS * 1000,
  });
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function readSession(token, secret, now = Date.now()) {
  if (!token || !secret || typeof token !== 'string' || typeof secret !== 'string') {
    return null;
  }

  const separator = token.lastIndexOf('.');
  if (separator <= 0 || separator === token.length - 1) {
    return null;
  }

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (!timingSafeEqualText(signature, expected)) {
    return null;
  }

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if ((data?.v !== 1 && data?.v !== 2) || typeof data.exp !== 'number') {
      return null;
    }
    if (now >= data.exp) {
      return null;
    }
    return {
      v: data.v,
      id_usuario_admin: data.id_usuario_admin || null,
      email: data.email || null,
      perfil: data.perfil || 'ADMIN',
      protegido: data.protegido === true,
      exp: data.exp,
    };
  } catch {
    return null;
  }
}

export function verifySession(token, secret, now = Date.now()) {
  return Boolean(readSession(token, secret, now));
}

export function readCookie(request, name) {
  const header = request?.headers?.cookie || request?.headers?.Cookie || '';
  const pieces = String(header).split(';');
  for (const piece of pieces) {
    const index = piece.indexOf('=');
    if (index === -1) continue;
    const key = piece.slice(0, index).trim();
    if (key === name) {
      return piece.slice(index + 1).trim();
    }
  }
  return null;
}

export function readSessionToken(request) {
  return readCookie(request, COOKIE_NAME);
}

export function isSecureRequest(request) {
  const forwarded = String(request?.headers?.['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  if (forwarded === 'https') {
    return true;
  }
  return Boolean(process.env.VERCEL);
}

export function buildSessionCookie(token, { secure, maxAgeSeconds = SESSION_TTL_SECONDS } = {}) {
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function clearSessionCookie({ secure } = {}) {
  const parts = [
    `${COOKIE_NAME}=`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (secure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}
