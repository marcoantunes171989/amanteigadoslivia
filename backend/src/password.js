import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const SCRYPT_KEYLEN = 64;

function asBuffer(value) {
  return Buffer.isBuffer(value) ? value : Buffer.from(String(value ?? ''), 'utf8');
}

export function timingSafeEqualBuffer(left, right) {
  const a = asBuffer(left);
  const b = asBuffer(right);
  if (a.length !== b.length) {
    crypto.timingSafeEqual(a, a);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('password_too_short');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, SCRYPT_KEYLEN);
  return {
    senha_hash: derived.toString('hex'),
    senha_salt: salt,
  };
}

export async function verifyPassword(password, senhaHash, senhaSalt) {
  if (typeof password !== 'string' || typeof senhaHash !== 'string' || typeof senhaSalt !== 'string') {
    return false;
  }
  if (!password || !senhaHash || !senhaSalt) {
    return false;
  }
  try {
    const derived = await scrypt(password, senhaSalt, SCRYPT_KEYLEN);
    const expected = Buffer.from(senhaHash, 'hex');
    return timingSafeEqualBuffer(derived, expected);
  } catch {
    return false;
  }
}
