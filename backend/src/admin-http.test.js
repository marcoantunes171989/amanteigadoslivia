import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { COOKIE_NAME, signSession } from './admin-auth.js';
import { handleAdminCatalog, handleAdminLogin, handleAdminLogout } from './admin-http.js';

const SECRET = 'test-admin-session-secret-value-32b';
const PASSWORD = 'homolog-admin-test-password';

function mockResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

afterEach(() => {
  delete process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_SESSION_SECRET;
  delete process.env.VERCEL;
});

test('login rejects requests without a valid password', async () => {
  process.env.ADMIN_PASSWORD = PASSWORD;
  process.env.ADMIN_SESSION_SECRET = SECRET;
  const response = mockResponse();
  await handleAdminLogin({
    method: 'POST',
    headers: {},
    body: { senha: 'outra-senha' },
  }, response);
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.error, 'unauthorized');
  assert.equal(response.headers['set-cookie'], undefined);
});

test('login sets an HttpOnly session cookie', async () => {
  process.env.ADMIN_PASSWORD = PASSWORD;
  process.env.ADMIN_SESSION_SECRET = SECRET;
  const response = mockResponse();
  await handleAdminLogin({
    method: 'POST',
    headers: { 'x-forwarded-proto': 'https' },
    body: { senha: PASSWORD },
  }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  const cookie = response.headers['set-cookie'];
  assert.match(cookie, new RegExp(`${COOKIE_NAME}=`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /Path=\//);
});

test('logout clears the session cookie', async () => {
  const response = mockResponse();
  await handleAdminLogout({
    method: 'POST',
    headers: { 'x-forwarded-proto': 'https' },
  }, response);
  assert.equal(response.statusCode, 200);
  assert.match(response.headers['set-cookie'], new RegExp(`${COOKIE_NAME}=;`));
  assert.match(response.headers['set-cookie'], /Max-Age=0/);
});

test('admin catalog API returns 401 without a session', async () => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  const response = mockResponse();
  await handleAdminCatalog({
    method: 'GET',
    headers: {},
  }, response, {
    getPool() {
      throw new Error('pool should not be used without a session');
    },
  });
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.error, 'unauthorized');
});

test('admin catalog API returns 401 for POST without a session', async () => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  const response = mockResponse();
  await handleAdminCatalog({
    method: 'POST',
    headers: {},
    body: { recurso: 'categoria', acao: 'criar', dados: { nome: 'X' } },
  }, response, {
    getPool() {
      throw new Error('pool should not be used without a session');
    },
  });
  assert.equal(response.statusCode, 401);
});

test('admin catalog GET succeeds with a signed session', async () => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  const token = signSession(SECRET);
  const response = mockResponse();
  await handleAdminCatalog({
    method: 'GET',
    headers: { cookie: `${COOKIE_NAME}=${token}` },
  }, response, {
    getPool() {
      return {
        async query() {
          return { rows: [] };
        },
      };
    },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.resumo.categorias, 0);
  assert.equal(response.body.resumo.produtos, 0);
});
