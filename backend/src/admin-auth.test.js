import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COOKIE_NAME,
  buildSessionCookie,
  passwordsMatch,
  signSession,
  verifySession,
  readSession,
} from './admin-auth.js';

const SECRET = 'test-admin-session-secret-value-32b';

test('accepts the exact password with a timing-safe comparison', () => {
  assert.equal(passwordsMatch('senha-correta', 'senha-correta'), true);
  assert.equal(passwordsMatch('senha-errada', 'senha-correta'), false);
  assert.equal(passwordsMatch('', 'senha-correta'), false);
  assert.equal(passwordsMatch('senha-correta', ''), false);
});

test('signs and verifies an HMAC SHA-256 admin session', () => {
  const token = signSession(SECRET, 1_000_000);
  assert.equal(verifySession(token, SECRET, 1_000_000), true);
  assert.equal(verifySession(token, 'other-secret-value-32-bytes-long', 1_000_000), false);
  assert.equal(verifySession('tampered.' + token.split('.')[1], SECRET, 1_000_000), false);
});

test('preserves SUPER_ADMIN in signed session without secrets', () => {
  const token = signSession(SECRET, {
    id_usuario_admin: 'u-super',
    email: 'super@example.com',
    perfil: 'SUPER_ADMIN',
    protegido: true,
    nome_usuario: 'Marco Antônio',
  }, 1_000_000);
  const session = readSession(token, SECRET, 1_000_000);
  assert.equal(session.perfil, 'SUPER_ADMIN');
  assert.equal(session.email, 'super@example.com');
  assert.equal(session.id_usuario_admin, 'u-super');
  assert.equal(session.protegido, true);
  assert.equal(session.nome_usuario, 'Marco Antônio');
  assert.doesNotMatch(token, /senha|hash|salt/i);
});

test('readSession accepts cookies without nome_usuario', () => {
  const token = signSession(SECRET, {
    id_usuario_admin: 'u-old',
    email: 'old@example.com',
    perfil: 'ADMIN',
  }, 1_000_000);
  const session = readSession(token, SECRET, 1_000_000);
  assert.equal(session.email, 'old@example.com');
  assert.equal(session.nome_usuario, null);
  assert.equal(session.perfil, 'ADMIN');
});

test('rejects expired sessions', () => {
  const now = 1_000_000;
  const token = signSession(SECRET, now);
  assert.equal(verifySession(token, SECRET, now + (12 * 60 * 60 * 1000) + 1), false);
});

test('builds an HttpOnly SameSite=Lax cookie with Secure on HTTPS', () => {
  const cookie = buildSessionCookie('payload.sig', { secure: true, maxAgeSeconds: 60 });
  assert.match(cookie, new RegExp(`^${COOKIE_NAME}=payload\\.sig;`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /Max-Age=60/);
});
