import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { AdminError } from './admin-errors.js';
import { handleAdminLogin } from './admin-http.js';
import {
  assertLoginRateLimit,
  LOGIN_IDENTITY_MAX_ATTEMPTS,
  LOGIN_ORIGIN_MAX_ATTEMPTS,
  resetLoginRateLimitForTests,
} from './admin-rate-limit.js';
import {
  createUsuario,
  loginFormatError,
  normalizeLoginUsuario,
  publicUser,
  updateUsuario,
} from './admin-users.js';
import { hashPassword, verifyPassword } from './password.js';

const SECRET = 'test-admin-session-secret-value-32b';
const WINDOW_MS = 15 * 60 * 1000;
const ROOT = {
  id_usuario_admin: '11111111-1111-4111-8111-111111111111',
  perfil: 'SUPER_ADMIN',
  protegido: true,
};
const GENERIC = 'Usuário ou senha inválidos.';

// Pool que captura o INSERT/UPDATE para inspecionar exatamente o que seria gravado.
function capturingPool(existing = []) {
  const writes = [];
  return {
    writes,
    async query(sql, params = []) {
      const text = String(sql);
      if (text.includes('op:get_usuario_id')) {
        return { rows: existing.filter((u) => u.id_usuario_admin === params[0]) };
      }
      if (text.includes('op:insert_usuario')) {
        writes.push({ op: 'insert', params });
        return { rows: [{
          id_usuario_admin: params[0],
          nome_usuario: params[1],
          email_usuario: params[2],
          login_usuario: params[7],
          perfil_usuario: params[5],
          ativo: params[6],
          protegido: false,
        }] };
      }
      if (text.includes('op:update_usuario')) {
        writes.push({ op: 'update', params });
        return { rows: [{
          id_usuario_admin: params[0],
          nome_usuario: params[1],
          email_usuario: params[2],
          login_usuario: params[5],
          perfil_usuario: params[3],
          ativo: params[4],
          protegido: false,
        }] };
      }
      if (text.includes('op:count_admin_ativos')) return { rows: [{ total: 2 }] };
      return { rows: [] };
    },
  };
}

async function expectAdminError(promise, status, code) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof AdminError, `esperado AdminError, veio ${error?.name}`);
    assert.equal(error.status, status);
    if (code) assert.equal(error.code, code);
    return true;
  });
}

// ---------- CADASTRO ----------

test('CADASTRO: usuário é obrigatório (vazio, espaços e ausente)', async () => {
  for (const usuario of ['', '   ', undefined]) {
    await expectAdminError(
      createUsuario(capturingPool(), { nome: 'Ana', usuario, email: 'ana@example.com', perfil: 'GESTOR', senha: '1234' }, ROOT),
      400,
      'validation_error',
    );
  }
  assert.equal(loginFormatError(''), 'Usuário é obrigatório.');
});

test('CADASTRO: usuário é tratado como string; número vira string e é validado como tal', () => {
  assert.equal(normalizeLoginUsuario(123), '123');
  assert.throws(() => normalizeLoginUsuario(12), AdminError);
});

test('CADASTRO: trim e minúsculas; variantes de caixa e espaço viram o mesmo login gravado', async () => {
  const variants = ['Administrador', 'administrador', '  ADMINISTRADOR ', ' Administrador\t'];
  for (const usuario of variants) {
    assert.equal(normalizeLoginUsuario(usuario), 'administrador');
  }
  const pool = capturingPool();
  await createUsuario(pool, { nome: 'Adm', usuario: '  ADMINistrador ', email: 'adm@example.com', perfil: 'ADMIN', senha: '1234' }, ROOT);
  assert.equal(pool.writes[0].params[7], 'administrador');
});

test('CADASTRO: limites e caracteres — 3 a 32, a-z 0-9 . _ -; sem acento, espaço interno ou e-mail', () => {
  assert.equal(normalizeLoginUsuario('abc'), 'abc');
  assert.equal(normalizeLoginUsuario('a'.repeat(32)), 'a'.repeat(32));
  assert.throws(() => normalizeLoginUsuario('ab'), /entre 3 e 32/);
  assert.throws(() => normalizeLoginUsuario('a'.repeat(33)), /entre 3 e 32/);
  assert.throws(() => normalizeLoginUsuario('João'), /somente letras sem acento/);
  assert.throws(() => normalizeLoginUsuario('dois nomes'), /somente letras sem acento/);
  assert.throws(() => normalizeLoginUsuario('admin@example.com'), /somente letras sem acento/);
  assert.equal(normalizeLoginUsuario('gerente.loja-1_x'), 'gerente.loja-1_x');
});

test('CADASTRO: e-mail continua gravado como dado cadastral e NÃO é o login', async () => {
  const pool = capturingPool();
  const created = await createUsuario(pool, { nome: 'Ana', usuario: 'ana.lima', email: 'Ana@Example.com', perfil: 'GESTOR', senha: '0123' }, ROOT);
  assert.equal(pool.writes[0].params[2], 'ana@example.com');
  assert.equal(pool.writes[0].params[7], 'ana.lima');
  assert.equal(created.email_usuario, 'ana@example.com');
  assert.equal(created.login_usuario, 'ana.lima');
});

test('CADASTRO: duplicidade case-insensitive do usuário gera 409 com mensagem de login', async () => {
  const pool = {
    async query(sql) {
      if (String(sql).includes('op:insert_usuario')) {
        const error = new Error('duplicate key');
        error.code = '23505';
        error.constraint = 'tab_usuario_admin_login_unq';
        throw error;
      }
      return { rows: [] };
    },
  };
  await assert.rejects(
    createUsuario(pool, { nome: 'Outro', usuario: 'ADMINISTRADOR', email: 'outro@example.com', perfil: 'GESTOR', senha: '1234' }, ROOT),
    (error) => error.status === 409 && /usuário de login já está em uso/.test(error.message),
  );
});

test('CADASTRO: duplicidade de e-mail continua com a mensagem de e-mail', async () => {
  const pool = {
    async query(sql) {
      if (String(sql).includes('op:insert_usuario')) {
        const error = new Error('duplicate key');
        error.code = '23505';
        error.constraint = 'tab_usuario_admin_email_unq';
        throw error;
      }
      return { rows: [] };
    },
  };
  await assert.rejects(
    createUsuario(pool, { nome: 'Outro', usuario: 'outro.login', email: 'dup@example.com', perfil: 'GESTOR', senha: '1234' }, ROOT),
    (error) => error.status === 409 && /este e-mail/.test(error.message),
  );
});

test('CADASTRO: ADMIN com PIN numérico ≥ 4; PIN com zero inicial preservado; PIN curto/não numérico recusado', async () => {
  const pool = capturingPool();
  await createUsuario(pool, { nome: 'Adm', usuario: 'adm.pin', email: 'adm@example.com', perfil: 'ADMIN', senha: '0123' }, ROOT);
  const { params } = pool.writes[0];
  assert.equal(await verifyPassword('0123', params[3], params[4]), true);
  assert.equal(await verifyPassword('123', params[3], params[4]), false);
  await expectAdminError(createUsuario(capturingPool(), { nome: 'Adm', usuario: 'adm2', email: 'a2@example.com', perfil: 'ADMIN', senha: '123' }, ROOT), 400, 'validation_error');
  await expectAdminError(createUsuario(capturingPool(), { nome: 'Adm', usuario: 'adm3', email: 'a3@example.com', perfil: 'ADMIN', senha: '12a4' }, ROOT), 400, 'validation_error');
});

test('CADASTRO: GESTOR com PIN numérico ≥ 4 e zero inicial preservado', async () => {
  const pool = capturingPool();
  await createUsuario(pool, { nome: 'Ger', usuario: 'gerente.01', email: 'ger@example.com', perfil: 'GESTOR', senha: '0042' }, ROOT);
  const { params } = pool.writes[0];
  assert.equal(params[5], 'GESTOR');
  assert.equal(await verifyPassword('0042', params[3], params[4]), true);
  assert.equal(await verifyPassword('42', params[3], params[4]), false);
});

test('CADASTRO: SUPER_ADMIN mantém senha forte (não aceita PIN curto)', async () => {
  const pool = capturingPool();
  await createUsuario(pool, { nome: 'Sup', usuario: 'super.novo', email: 'sup@example.com', perfil: 'SUPER_ADMIN', senha: 'SenhaForte123' }, ROOT);
  assert.equal(pool.writes[0].params[5], 'SUPER_ADMIN');
  await expectAdminError(createUsuario(capturingPool(), { nome: 'Sup', usuario: 'super.fraco', email: 'fraco@example.com', perfil: 'SUPER_ADMIN', senha: '1234' }, ROOT), 400, 'validation_error');
});

test('EDIÇÃO: login é validado, normalizado e pode ser definido em usuário sem login (ex.: SUPER_ADMIN legado)', async () => {
  const legacy = { id_usuario_admin: ROOT.id_usuario_admin, nome_usuario: 'Root', email_usuario: 'root@example.com', login_usuario: null, perfil_usuario: 'SUPER_ADMIN', ativo: true, protegido: true };
  const pool = capturingPool([legacy]);
  const updated = await updateUsuario(pool, ROOT.id_usuario_admin, { nome: 'Root', usuario: '  Root.Master ', email: 'root@example.com', perfil: 'SUPER_ADMIN', ativo: true }, ROOT);
  assert.equal(pool.writes[0].params[5], 'root.master');
  assert.equal(updated.login_usuario, 'root.master');
});

test('EDIÇÃO: sem login informado e sem login atual, a edição é recusada', async () => {
  const legacy = { id_usuario_admin: '22222222-2222-4222-8222-222222222222', nome_usuario: 'Gestor', email_usuario: 'g@example.com', login_usuario: null, perfil_usuario: 'GESTOR', ativo: true, protegido: false };
  await expectAdminError(
    updateUsuario(capturingPool([legacy]), legacy.id_usuario_admin, { nome: 'Gestor', email: 'g@example.com', perfil: 'GESTOR', ativo: true }, { id_usuario_admin: 'x', perfil: 'SUPER_ADMIN', protegido: true }),
    400,
    'validation_error',
  );
});

test('EDIÇÃO: sem login no payload, mantém o login atual', async () => {
  const current = { id_usuario_admin: '22222222-2222-4222-8222-222222222222', nome_usuario: 'Gestor', email_usuario: 'g@example.com', login_usuario: 'gestor.ana', perfil_usuario: 'GESTOR', ativo: true, protegido: false };
  const pool = capturingPool([current]);
  await updateUsuario(pool, current.id_usuario_admin, { nome: 'Gestor', email: 'g@example.com', perfil: 'GESTOR', ativo: true }, { id_usuario_admin: 'x', perfil: 'SUPER_ADMIN', protegido: true });
  assert.equal(pool.writes[0].params[5], 'gestor.ana');
});

test('publicUser expõe login_usuario e mantém e-mail', () => {
  const view = publicUser({ id_usuario_admin: 'id', nome_usuario: 'N', email_usuario: 'e@example.com', login_usuario: 'n.login', perfil_usuario: 'ADMIN', ativo: true, protegido: false });
  assert.equal(view.login_usuario, 'n.login');
  assert.equal(view.email_usuario, 'e@example.com');
});

// ---------- LOGIN ----------

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

function loginPool(users = []) {
  const auditoria = [];
  const lookups = [];
  return {
    auditoria,
    lookups,
    async query(sql, params = []) {
      const text = String(sql);
      if (text.includes('op:get_usuario_login')) {
        lookups.push(params[0]);
        const user = users.find((u) => String(u.login_usuario || '').toLowerCase() === String(params[0]).toLowerCase());
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

async function doLogin(pool, body, request = { headers: {}, socket: { remoteAddress: '198.51.100.7' } }) {
  const response = mockResponse();
  await handleAdminLogin({ ...request, method: 'POST', body }, response, { getPool: () => pool });
  return response;
}

async function userFixture(overrides = {}) {
  const hashed = await hashPassword(overrides.senha || 'SenhaForte123');
  return {
    id_usuario_admin: '33333333-3333-4333-8333-333333333333',
    nome_usuario: 'Usuário Teste',
    email_usuario: 'teste@example.com',
    login_usuario: 'teste.login',
    senha_hash: hashed.senha_hash,
    senha_salt: hashed.senha_salt,
    perfil_usuario: 'ADMIN',
    ativo: true,
    protegido: false,
    ...overrides,
  };
}

beforeEach(() => {
  resetLoginRateLimitForTests();
  process.env.ADMIN_SESSION_SECRET = SECRET;
});

afterEach(() => {
  resetLoginRateLimitForTests();
  delete process.env.ADMIN_SESSION_SECRET;
});

test('LOGIN: usuário correto + credencial correta autentica e grava cookie', async () => {
  const user = await userFixture({ senha: 'SenhaForte123' });
  const response = await doLogin(loginPool([user]), { usuario: 'teste.login', senha: 'SenhaForte123' });
  assert.equal(response.statusCode, 200);
  assert.match(response.headers['set-cookie'], /HttpOnly/);
});

test('LOGIN: usuário inexistente e credencial incorreta retornam a MESMA resposta genérica', async () => {
  const user = await userFixture({ senha: 'SenhaForte123' });
  const pool = loginPool([user]);
  const missing = await doLogin(pool, { usuario: 'nao.existe', senha: 'SenhaForte123' });
  const wrong = await doLogin(pool, { usuario: 'teste.login', senha: 'errada-123' });
  assert.equal(missing.statusCode, 401);
  assert.equal(wrong.statusCode, 401);
  assert.deepEqual(missing.body, wrong.body);
  assert.equal(missing.body.message, GENERIC);
  assert.equal(missing.headers['set-cookie'], undefined);
});

test('LOGIN: e-mail NÃO autentica — nem no campo usuario, nem como fallback', async () => {
  const user = await userFixture({ senha: 'SenhaForte123' });
  const pool = loginPool([user]);
  const byEmailInUsuario = await doLogin(pool, { usuario: 'teste@example.com', senha: 'SenhaForte123' });
  const byEmailField = await doLogin(pool, { email: 'teste@example.com', senha: 'SenhaForte123' });
  assert.equal(byEmailInUsuario.statusCode, 401);
  assert.equal(byEmailField.statusCode, 401);
  assert.deepEqual(byEmailField.body, { error: 'unauthorized', message: GENERIC });
  // Formato de e-mail nem chega ao banco.
  assert.equal(pool.lookups.includes('teste@example.com'), false);
});

test('LOGIN: maiúsculas/minúsculas e espaços externos seguem a normalização do cadastro', async () => {
  const user = await userFixture({ senha: 'SenhaForte123' });
  const pool = loginPool([user]);
  assert.equal((await doLogin(pool, { usuario: 'TESTE.LOGIN', senha: 'SenhaForte123' })).statusCode, 200);
  assert.equal((await doLogin(pool, { usuario: '  Teste.Login  ', senha: 'SenhaForte123' })).statusCode, 200);
});

test('LOGIN: zero inicial do PIN é preservado na autenticação', async () => {
  const gestor = await userFixture({ nome_usuario: 'Gerente', login_usuario: 'gerente.zero', perfil_usuario: 'GESTOR', senha: '0123' });
  const pool = loginPool([gestor]);
  assert.equal((await doLogin(pool, { usuario: 'gerente.zero', senha: '0123' })).statusCode, 200);
  assert.equal((await doLogin(pool, { usuario: 'gerente.zero', senha: '123' })).statusCode, 401);
});

test('LOGIN: usuário com formato inválido responde genérico sem consultar o banco', async () => {
  const pool = loginPool([]);
  const response = await doLogin(pool, { usuario: 'ab', senha: 'x' });
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.message, GENERIC);
  assert.deepEqual(pool.lookups, []);
});

// ---------- RATE LIMIT (identidade = usuário normalizado) ----------

test('RATE LIMIT: variantes de caixa e espaço do mesmo usuário caem no mesmo bucket', () => {
  const now = Date.now();
  let blocked = 0;
  const variants = ['Admin', ' admin ', 'ADMIN', 'aDmIn'];
  for (let i = 0; i < LOGIN_IDENTITY_MAX_ATTEMPTS + 1; i += 1) {
    const socketIp = `198.51.100.${10 + i}`; // origens diferentes: só o bucket de identidade pode bloquear
    try {
      assertLoginRateLimit({ headers: {}, socket: { remoteAddress: socketIp } }, variants[i % variants.length], { now });
    } catch (error) {
      assert.equal(error.status, 429);
      blocked += 1;
    }
  }
  assert.equal(blocked, 1);
});

test('RATE LIMIT: trocar X-Forwarded-For não zera o bucket do usuário', () => {
  const now = Date.now();
  const socket = { remoteAddress: '198.51.100.99' };
  let blocked = 0;
  for (let i = 0; i < LOGIN_IDENTITY_MAX_ATTEMPTS + 3; i += 1) {
    try {
      assertLoginRateLimit({ headers: { 'x-forwarded-for': `203.0.113.${i}` }, socket }, 'teste.login', { now });
    } catch (error) {
      assert.equal(error.status, 429);
      blocked += 1;
    }
  }
  assert.equal(blocked, 3, 'após o limite de identidade, todas as tentativas seguintes são bloqueadas');
});

test('RATE LIMIT: proteção por origem continua funcionando com usuários diferentes', () => {
  const now = Date.now();
  const request = { headers: {}, socket: { remoteAddress: '198.51.100.200' } };
  let blocked = 0;
  for (let i = 0; i < LOGIN_ORIGIN_MAX_ATTEMPTS + 5; i += 1) {
    try {
      assertLoginRateLimit(request, `usuario.${i}`, { now });
    } catch (error) {
      assert.equal(error.status, 429);
      blocked += 1;
    }
  }
  assert.equal(blocked, 5);
});

test('RATE LIMIT: sucesso não zera contador e a janela fixa libera', () => {
  const now = Date.now();
  const request = { headers: {}, socket: { remoteAddress: '198.51.100.201' } };
  for (let i = 0; i < LOGIN_IDENTITY_MAX_ATTEMPTS; i += 1) {
    assertLoginRateLimit(request, 'janela.teste', { now });
  }
  assert.throws(() => assertLoginRateLimit(request, 'janela.teste', { now }), (error) => error.status === 429);
  assert.doesNotThrow(() => assertLoginRateLimit(request, 'janela.teste', { now: now + WINDOW_MS + 1 }));
});
