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

export function signSession(secret, now = Date.now()) {
  if (!secret) {
    throw new Error('session_secret_missing');
  }
  const payload = Buffer.from(JSON.stringify({
    v: 1,
    exp: now + SESSION_TTL_SECONDS * 1000,
  }), 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifySession(token, secret, now = Date.now()) {
  if (!token || !secret || typeof token !== 'string' || typeof secret !== 'string') {
    return false;
  }

  const separator = token.lastIndexOf('.');
  if (separator <= 0 || separator === token.length - 1) {
    return false;
  }

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  if (!timingSafeEqualText(signature, expected)) {
    return false;
  }

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data?.v !== 1 || typeof data.exp !== 'number') {
      return false;
    }
    return now < data.exp;
  } catch {
    return false;
  }
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
