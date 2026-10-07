import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { assertLoginRateLimit, assertPublicFormRateLimit, resetLoginRateLimitForTests, LOGIN_IDENTITY_MAX_ATTEMPTS, LOGIN_ORIGIN_MAX_ATTEMPTS } from './admin-rate-limit.js';
import { handleAdminLogin } from './admin-http.js';
import { hashPassword } from './password.js';

const SECRET = 'test-admin-session-secret-value-32b';
const WINDOW_MS = 15 * 60 * 1000;

function req({ xff, vercelIp, socketIp, headers = {} } = {}) {
  const h = { ...headers };
  if (xff !== undefined) h['x-forwarded-for'] = xff;
  if (vercelIp !== undefined) h['x-vercel-forwarded-for'] = vercelIp;
  return { method: 'POST', headers: h, socket: socketIp ? { remoteAddress: socketIp } : undefined };
}

function attempt(request, email, options) {
  try {
    assertLoginRateLimit(request, email, options);
    return 'allowed';
  } catch (error) {
    assert.equal(error.status, 429);
    return 'blocked';
  }
}

function mockResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    send(payload) { this.body = payload; return this; },
    end(payload) { this.body = payload; return this; },
  };
}

function createUserPool(users = []) {
  const auditoria = [];
  return {
    auditoria,
    async query(sql, params = []) {
      const text = String(sql);
      if (text.includes('op:get_usuario_login')) {
        // Mesma regra de comparação do SQL (lower + trim já feito na aplicação).
        const user = users.find((u) => loginFromEmail(u.email_usuario) === String(params[0]).trim().toLowerCase());
        return { rows: user ? [user] : [] };
      }
      if (text.includes('op:touch_usuario_login')) return { rows: [] };
      if (text.includes('op:insert_auditoria')) {
        auditoria.push({ acao: params[2], sucesso: params[5] });
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
}

// Os fixtures mantêm e-mail como cadastro; o login é enviado pelo USUÁRIO derivado
// da parte local do e-mail (ver loginFromEmail). O e-mail em si não autentica.
function loginFromEmail(email) {
  return String(email || '').split('@')[0].toLowerCase();
}

async function login(pool, { email, senha, request = req() }) {
  const response = mockResponse();
  await handleAdminLogin({ ...request, method: 'POST', body: { usuario: loginFromEmail(email), senha } }, response, { getPool: () => pool });
  return response;
}

beforeEach(() => {
  resetLoginRateLimitForTests();
  process.env.ADMIN_SESSION_SECRET = SECRET;
});

afterEach(() => {
  resetLoginRateLimitForTests();
  delete process.env.ADMIN_SESSION_SECRET;
  delete process.env.VERCEL;
});

// ---------- Lógica pura do limiter (clock injetável, sem espera real) ----------

test('[abuso 1] repetidas senhas erradas para o mesmo e-mail atingem bloqueio', () => {
  const request = req({ socketIp: '198.51.100.1' });
  const now = 1_000_000;
  let results = [];
  for (let i = 0; i < LOGIN_IDENTITY_MAX_ATTEMPTS + 3; i += 1) {
    results.push(attempt(request, 'admin@example.com', { now }));
  }
  assert.equal(results.slice(0, LOGIN_IDENTITY_MAX_ATTEMPTS).every((r) => r === 'allowed'), true);
  assert.equal(results[LOGIN_IDENTITY_MAX_ATTEMPTS], 'blocked');
  assert.equal(results.at(-1), 'blocked');
});

test('[abuso 2] variar X-Forwarded-For NÃO zera o contador do mesmo e-mail', () => {
  const now = 1_000_000;
  const email = 'admin@example.com';
  let allowed = 0;
  for (let i = 0; i < 200; i += 1) {
    const request = req({ xff: `10.0.${i}.${i}`, socketIp: '198.51.100.1' });
    if (attempt(request, email, { now }) === 'allowed') allowed += 1;
  }
  assert.equal(allowed, LOGIN_IDENTITY_MAX_ATTEMPTS);
});

test('[abuso 2b] variar X-Forwarded-For sem IP de socket também não reabre tentativas', () => {
  const now = 1_000_000;
  let allowed = 0;
  for (let i = 0; i < 100; i += 1) {
    if (attempt(req({ xff: `203.0.113.${i}` }), 'admin@example.com', { now }) === 'allowed') allowed += 1;
  }
  assert.equal(allowed, LOGIN_IDENTITY_MAX_ATTEMPTS);
});

test('[abuso 3] e-mails diferentes não compartilham bucket de identidade', () => {
  const now = 1_000_000;
  const request = req({ socketIp: '198.51.100.2' });
  for (let i = 0; i < LOGIN_IDENTITY_MAX_ATTEMPTS; i += 1) attempt(request, 'a@example.com', { now });
  assert.equal(attempt(request, 'a@example.com', { now }), 'blocked');
  assert.equal(attempt(request, 'b@example.com', { now }), 'allowed');
});

test('[identidade] e-mail é normalizado (caixa e espaços) para o mesmo bucket', () => {
  const now = 1_000_000;
  const request = req({ socketIp: '198.51.100.3' });
  for (let i = 0; i < LOGIN_IDENTITY_MAX_ATTEMPTS; i += 1) attempt(request, 'Admin@Example.com', { now });
  assert.equal(attempt(request, '  admin@example.com ', { now }), 'blocked');
});

test('[abuso 4] origem abusiva é limitada mesmo variando e-mail e XFF', () => {
  const now = 1_000_000;
  let allowed = 0;
  for (let i = 0; i < LOGIN_ORIGIN_MAX_ATTEMPTS + 20; i += 1) {
    const request = req({ xff: `192.0.2.${i % 250}`, socketIp: '198.51.100.4' });
    if (attempt(request, `user${i}@example.com`, { now }) === 'allowed') allowed += 1;
  }
  assert.equal(allowed, LOGIN_ORIGIN_MAX_ATTEMPTS);
});

test('[abuso 4b] origem diferente (IP de socket distinto) não é afetada pelo bloqueio de outra', () => {
  const now = 1_000_000;
  for (let i = 0; i < LOGIN_ORIGIN_MAX_ATTEMPTS; i += 1) {
    attempt(req({ socketIp: '198.51.100.5' }), `u${i}@example.com`, { now });
  }
  assert.equal(attempt(req({ socketIp: '198.51.100.5' }), 'z@example.com', { now }), 'blocked');
  assert.equal(attempt(req({ socketIp: '198.51.100.6' }), 'z@example.com', { now }), 'allowed');
});

test('[janela] após a janela expirar o bloqueio é liberado (sem espera real)', () => {
  const request = req({ socketIp: '198.51.100.7' });
  const now = 1_000_000;
  for (let i = 0; i < LOGIN_IDENTITY_MAX_ATTEMPTS; i += 1) attempt(request, 'x@example.com', { now });
  assert.equal(attempt(request, 'x@example.com', { now }), 'blocked');
  assert.equal(attempt(request, 'x@example.com', { now: now + WINDOW_MS }), 'allowed');
});

test('[ausência de headers] sem XFF e sem socket a identidade continua limitada', () => {
  const now = 1_000_000;
  let allowed = 0;
  for (let i = 0; i < 50; i += 1) {
    if (attempt(req(), 'nohdr@example.com', { now }) === 'allowed') allowed += 1;
  }
  assert.equal(allowed, LOGIN_IDENTITY_MAX_ATTEMPTS);
});

test('[headers malformados] valores estranhos não lançam exceção fora do 429', () => {
  const now = 1_000_000;
  const weird = [
    req({ xff: ['a', 'b'] }),
    req({ xff: ',,,' }),
    req({ xff: '\u0000\u0001' }),
    req({ vercelIp: 'não-é-ip' }),
    { headers: { 'x-forwarded-for': 42 }, socket: { remoteAddress: 12345 } },
    { headers: null },
    {},
  ];
  for (const request of weird) {
    assert.doesNotThrow(() => attempt(request, 'mal@example.com', { now }));
  }
});

test('[serverless] na Vercel, x-vercel-forwarded-for é usado; XFF do cliente é ignorado', () => {
  process.env.VERCEL = '1';
  const now = 1_000_000;
  for (let i = 0; i < LOGIN_ORIGIN_MAX_ATTEMPTS; i += 1) {
    attempt(req({ vercelIp: '203.0.113.50', xff: `10.1.1.${i}` }), `s${i}@example.com`, { now });
  }
  assert.equal(attempt(req({ vercelIp: '203.0.113.50', xff: '10.9.9.9' }), 'novo@example.com', { now }), 'blocked');
  assert.equal(attempt(req({ vercelIp: '203.0.113.51' }), 'novo@example.com', { now }), 'allowed');
});

test('[serverless] na Vercel, socketIp e XFF sozinhos não são confiáveis', () => {
  process.env.VERCEL = '1';
  const now = 1_000_000;
  let allowed = 0;
  for (let i = 0; i < 200; i += 1) {
    const request = req({ xff: `10.2.2.${i % 250}`, socketIp: `198.51.100.${i % 250}` });
    if (attempt(request, `v${i}@example.com`, { now }) === 'allowed') allowed += 1;
  }
  assert.equal(allowed, LOGIN_ORIGIN_MAX_ATTEMPTS);
});

test('[formulário público] variar XFF não contorna o limite do encomendas', () => {
  const now = 1_000_000;
  let blocked = 0;
  for (let i = 0; i < 30; i += 1) {
    try {
      assertPublicFormRateLimit(req({ xff: `10.3.3.${i}`, socketIp: '198.51.100.8' }), 'encomenda', { now });
    } catch (error) {
      blocked += error.status === 429 ? 1 : 0;
    }
  }
  assert.ok(blocked > 0, 'alguma tentativa deveria ser bloqueada');
});

// ---------- Endpoint /api/admin/login ----------

test('[endpoint abuso 1+5] muitas senhas erradas bloqueiam e a senha correta é recusada até a janela', async () => {
  const hashed = await hashPassword('1234');
  const pool = createUserPool([{
    id_usuario_admin: '11111111-1111-4111-8111-111111111111',
    nome_usuario: 'Gestora',
    email_usuario: 'gestor@example.com',
    senha_hash: hashed.senha_hash,
    senha_salt: hashed.senha_salt,
    perfil_usuario: 'GESTOR',
    ativo: true,
  }]);
  for (let i = 0; i < LOGIN_IDENTITY_MAX_ATTEMPTS; i += 1) {
    const response = await login(pool, { email: 'gestor@example.com', senha: '9999', request: req({ xff: `10.4.4.${i}` }) });
    assert.equal(response.statusCode, 401);
  }
  const blockedResponse = await login(pool, { email: 'gestor@example.com', senha: '1234', request: req({ xff: '10.5.5.5' }) });
  assert.equal(blockedResponse.statusCode, 429);
  assert.equal(blockedResponse.body.error, 'rate_limited');
  assert.equal(blockedResponse.headers['set-cookie'], undefined);
});

test('[endpoint 5] login correto funciona quando permitido', async () => {
  const hashed = await hashPassword('0123');
  const pool = createUserPool([{
    id_usuario_admin: '22222222-2222-4222-8222-222222222222',
    nome_usuario: 'Gerente',
    email_usuario: 'gerente@example.com',
    senha_hash: hashed.senha_hash,
    senha_salt: hashed.senha_salt,
    perfil_usuario: 'GESTOR',
    ativo: true,
  }]);
  const response = await login(pool, { email: 'gerente@example.com', senha: '0123' });
  assert.equal(response.statusCode, 200);
  assert.match(response.headers['set-cookie'], /al_admin_sess=/);
});

test('[endpoint 7] ADMIN e GESTOR autenticam com PIN numérico (zeros à esquerda e 4-6+ dígitos)', async () => {
  const pins = ['1234', '0123', '12345', '0000', '987654'];
  for (const [index, pin] of pins.entries()) {
    const hashed = await hashPassword(pin);
    const pool = createUserPool([{
      id_usuario_admin: `3333333${index}-3333-4333-8333-333333333333`,
      nome_usuario: 'Pin',
      email_usuario: `pin${index}@example.com`,
      senha_hash: hashed.senha_hash,
      senha_salt: hashed.senha_salt,
      perfil_usuario: index % 2 ? 'GESTOR' : 'ADMIN',
      ativo: true,
    }]);
    const ok = await login(pool, { email: `pin${index}@example.com`, senha: pin });
    assert.equal(ok.statusCode, 200, `PIN ${pin} deveria autenticar`);
    const wrong = await login(pool, { email: `pin${index}@example.com`, senha: pin.slice(1) + '9' });
    assert.equal(wrong.statusCode, 401);
  }
});

test('[endpoint 6] SUPER_ADMIN continua autenticando com a senha forte existente', async () => {
  const hashed = await hashPassword('SenhaForte123');
  const pool = createUserPool([{
    id_usuario_admin: '44444444-4444-4444-8444-444444444444',
    nome_usuario: 'Super',
    email_usuario: 'super@example.com',
    senha_hash: hashed.senha_hash,
    senha_salt: hashed.senha_salt,
    perfil_usuario: 'SUPER_ADMIN',
    protegido: true,
    ativo: true,
  }]);
  const response = await login(pool, { email: 'super@example.com', senha: 'SenhaForte123' });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.usuario.perfil_usuario, 'SUPER_ADMIN');
});

test('[endpoint 8] resposta de sucesso e de erro não expõem senha, hash nem salt', async () => {
  const hashed = await hashPassword('5678');
  const pool = createUserPool([{
    id_usuario_admin: '55555555-5555-4555-8555-555555555555',
    nome_usuario: 'Admin',
    email_usuario: 'admin5@example.com',
    senha_hash: hashed.senha_hash,
    senha_salt: hashed.senha_salt,
    perfil_usuario: 'ADMIN',
    ativo: true,
  }]);
  for (const senha of ['5678', 'errada']) {
    const response = await login(pool, { email: 'admin5@example.com', senha });
    const serialized = JSON.stringify(response.body);
    assert.equal(serialized.includes(hashed.senha_hash), false);
    assert.equal(serialized.includes(hashed.senha_salt), false);
    assert.equal(serialized.includes('5678'), false);
    assert.equal(/senha_hash|senha_salt|password/i.test(serialized), false);
  }
});

test('[endpoint 9] headers malformados no login não quebram o endpoint', async () => {
  const pool = createUserPool([]);
  const response = mockResponse();
  await handleAdminLogin({
    method: 'POST',
    headers: { 'x-forwarded-for': ['a', 'b'], 'x-vercel-forwarded-for': '::::' },
    socket: { remoteAddress: 'not-an-ip' },
    body: { usuario: 'nada', senha: 'x' },
  }, response, { getPool: () => pool });
  assert.equal(response.statusCode, 401);
});

test('[endpoint 10] ausência de X-Forwarded-For não desativa a proteção', async () => {
  const hashed = await hashPassword('1111');
  const pool = createUserPool([{
    id_usuario_admin: '66666666-6666-4666-8666-666666666666',
    nome_usuario: 'Sem',
    email_usuario: 'sem@example.com',
    senha_hash: hashed.senha_hash,
    senha_salt: hashed.senha_salt,
    perfil_usuario: 'ADMIN',
    ativo: true,
  }]);
  let blocked = false;
  for (let i = 0; i < LOGIN_IDENTITY_MAX_ATTEMPTS + 2; i += 1) {
    const response = await login(pool, { email: 'sem@example.com', senha: '0000', request: req() });
    if (response.statusCode === 429) blocked = true;
  }
  assert.equal(blocked, true);
});

test('[enumeração] usuário inexistente e senha errada recebem a mesma resposta', async () => {
  const hashed = await hashPassword('2468');
  const pool = createUserPool([{
    id_usuario_admin: '77777777-7777-4777-8777-777777777777',
    nome_usuario: 'Real',
    email_usuario: 'real@example.com',
    senha_hash: hashed.senha_hash,
    senha_salt: hashed.senha_salt,
    perfil_usuario: 'ADMIN',
    ativo: true,
  }]);
  const missing = await login(pool, { email: 'nao-existe@example.com', senha: '2468' });
  const wrong = await login(pool, { email: 'real@example.com', senha: '0000' });
  assert.equal(missing.statusCode, wrong.statusCode);
  assert.deepEqual(missing.body, wrong.body);
});
