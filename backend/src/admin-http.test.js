import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { afterEach, test } from 'node:test';
import { AUDIT_PAGE_LIMIT, parseAuditPagination } from './admin-audit.js';
import { COOKIE_NAME, signSession } from './admin-auth.js';
import { handleAdminAuditoria, handleAdminCatalog, handleAdminLogin, handleAdminLogout, handleAdminPublicacoes, handleAdminRelatorios, handleAdminSessao, handleAdminUsuarios, handlePublicCatalog, handlePublicVenda } from './admin-http.js';
import { hashPassword } from './password.js';
import { AdminError, isDatabaseUnavailable, mapDatabaseError, safeDatabaseErrorLog, toClientError } from './admin-errors.js';
import { POOL_LIMITS } from '../../api/catalogo.js';
import healthDbHandler from '../../api/health-db.js';

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
    send(payload) {
      this.body = payload;
      return this;
    },
    end(payload) {
      this.body = payload;
      return this;
    },
  };
}

function superAdminToken() {
  return signSession(SECRET, {
    id_usuario_admin: '22222222-2222-4222-8222-222222222222',
    email: 'super@example.com',
    perfil: 'SUPER_ADMIN',
    protegido: false,
  });
}

// Sessão assinada com o segredo real, mas com perfil arbitrário (inclusive ausente/nulo).
// signSession() troca perfil falsy por ADMIN; aqui o payload é montado literalmente.
function forgedToken(claims) {
  const payload = Buffer.from(JSON.stringify({ v: 2, exp: Date.now() + 60_000, ...claims }), 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function createUserPool(user) {
  const auditoria = [];
  return {
    auditoria,
    async query(sql, params = []) {
      const text = String(sql);
      if (text.includes('op:get_usuario_login')) {
        return {
          rows: user && String(params[0]).trim().toLowerCase() === String(user.login_usuario || '').toLowerCase()
            ? [user]
            : [],
        };
      }
      if (text.includes('op:touch_usuario_login')) {
        if (user) user.data_ultimo_login = new Date();
        return { rows: [] };
      }
      if (text.includes('op:insert_auditoria')) {
        auditoria.push({ acao: params[2], sucesso: params[5] });
        return { rows: [] };
      }
      if (text.includes('op:list_categorias') || text.includes('op:list_produtos')
        || text.includes('op:list_imagens') || text.includes('op:list_precos')) {
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
}

afterEach(() => {
  delete process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_SESSION_SECRET;
  delete process.env.VERCEL;
});

test('login rejects requests without a valid password', async () => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  const hashed = await hashPassword(PASSWORD);
  const pool = createUserPool({
    id_usuario_admin: '11111111-1111-4111-8111-111111111111',
    nome_usuario: 'Admin',
    email_usuario: 'admin@example.com', login_usuario: 'admin',
    senha_hash: hashed.senha_hash,
    senha_salt: hashed.senha_salt,
    perfil_usuario: 'ADMIN',
    ativo: true,
  });
  const response = mockResponse();
  await handleAdminLogin({
    method: 'POST',
    headers: {},
    body: { usuario: 'admin', senha: 'outra-senha-errada' },
  }, response, { getPool: () => pool });
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.error, 'unauthorized');
  assert.equal(response.body.message, 'Usuário ou senha inválidos.');
  assert.equal(response.headers['set-cookie'], undefined);
  assert.equal(pool.auditoria[0].acao, 'LOGIN_FALHA');
});

test('login sets an HttpOnly session cookie', async () => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  const hashed = await hashPassword(PASSWORD);
  const pool = createUserPool({
    id_usuario_admin: '11111111-1111-4111-8111-111111111111',
    nome_usuario: 'Admin',
    email_usuario: 'admin@example.com', login_usuario: 'admin',
    senha_hash: hashed.senha_hash,
    senha_salt: hashed.senha_salt,
    perfil_usuario: 'ADMIN',
    ativo: true,
  });
  const response = mockResponse();
  await handleAdminLogin({
    method: 'POST',
    headers: { 'x-forwarded-proto': 'https' },
    body: { usuario: 'admin', senha: PASSWORD },
  }, response, { getPool: () => pool });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  const cookie = response.headers['set-cookie'];
  assert.match(cookie, new RegExp(`${COOKIE_NAME}=`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /Path=\//);
  assert.equal(pool.auditoria[0].acao, 'LOGIN_SUCESSO');
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

test('SUPER_ADMIN session reaches catalog API', async () => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  const token = signSession(SECRET, {
    id_usuario_admin: '22222222-2222-4222-8222-222222222222',
    email: 'super@example.com',
    perfil: 'SUPER_ADMIN',
  });
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
  assert.equal(response.body.sessao.perfil, 'SUPER_ADMIN');
  assert.equal(response.body.sessao.email, 'super@example.com');
});

test('public catalog rewrite serves only public site content', async () => {
  const response = mockResponse();
  await handlePublicCatalog({
    method: 'GET',
    url: '/api/catalogo?recurso=conteudo-site',
    query: { recurso: 'conteudo-site' },
    headers: {},
  }, response, {
    getPool() {
      return {
        async query(sql) {
          if (String(sql).includes('json_agg')) {
            return {
              rows: [{
                configuracoes: [{ chave_configuracao: 'logo_topo_url', valor_texto: 'assets/logo.jpg', ativo: true }],
                conteudos: [],
                imagens: [],
              }],
            };
          }
          return { rows: [{ revisao: new Date('2026-01-01T00:00:00Z') }] };
        },
      };
    },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.branding.logo_topo_url, 'assets/logo.jpg');
  assert.equal(response.body.solicitacoes, undefined);
  assert.equal(response.body.usuarios, undefined);
});

test('public encomenda rewrite validates and stores a new request', async () => {
  const inserted = [];
  const response = mockResponse();
  await handlePublicVenda({
    method: 'POST',
    url: '/api/vendas?recurso=encomendas',
    query: { recurso: 'encomendas' },
    headers: {},
    body: {
      nome_cliente: 'Ana',
      telefone_cliente: '11999990000',
      tipo_solicitacao: 'ENCOMENDA',
      quantidade_estimada: 1,
      descricao_pedido: 'Caixa de clássicos',
    },
  }, response, {
    getPool() {
      return {
        async query(sql, params) {
          inserted.push({ sql: String(sql), params });
          return { rows: [] };
        },
      };
    },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.solicitacao.status_solicitacao, 'NOVA');
  assert.equal(inserted.some((item) => /tab_solicitacao_encomenda/.test(item.sql)), true);
});

test('SUPER_ADMIN login sets session cookie with perfil', async () => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  const hashed = await hashPassword(PASSWORD);
  const pool = createUserPool({
    id_usuario_admin: '22222222-2222-4222-8222-222222222222',
    nome_usuario: 'Super',
    email_usuario: 'super@example.com', login_usuario: 'super',
    senha_hash: hashed.senha_hash,
    senha_salt: hashed.senha_salt,
    perfil_usuario: 'SUPER_ADMIN',
    ativo: true,
    protegido: true,
  });
  const response = mockResponse();
  await handleAdminLogin({
    method: 'POST',
    headers: { 'x-forwarded-proto': 'https' },
    body: { usuario: 'super', senha: PASSWORD },
  }, response, { getPool: () => pool });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.usuario.perfil_usuario, 'SUPER_ADMIN');
  assert.equal(response.body.usuario.protegido, true);
  const cookie = response.headers['set-cookie'];
  assert.match(cookie, new RegExp(`${COOKIE_NAME}=`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cookie, /Secure/);
  assert.doesNotMatch(cookie, /senha|hash|salt/i);
});

test('delete de usuario e bloqueado na API', async () => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  const actorId = '22222222-2222-4222-8222-222222222222';
  const response = mockResponse();
  await handleAdminUsuarios({
    method: 'POST',
    headers: {
      cookie: `${COOKIE_NAME}=${signSession(SECRET, {
        id_usuario_admin: actorId,
        email: 'super@example.com',
        perfil: 'SUPER_ADMIN',
        protegido: true,
      })}`,
    },
    body: { acao: 'excluir', id: '11111111-1111-4111-8111-111111111111' },
  }, response, {
    getPool() {
      return {
        async query(sql, params = []) {
          if (String(sql).includes('op:get_usuario_id') && String(params[0]) === actorId) {
            return {
              rows: [{
                id_usuario_admin: actorId,
                nome_usuario: 'Super',
                email_usuario: 'super@example.com', login_usuario: 'super',
                perfil_usuario: 'SUPER_ADMIN',
                ativo: true,
                protegido: true,
              }],
            };
          }
          throw new Error('pool should not run for blocked delete');
        },
      };
    },
  });
  assert.equal(response.statusCode, 403);
  assert.equal(response.body.error, 'forbidden');
});

test('GET /api/admin/sessao returns 200 for a valid cookie without catalog', async () => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  const response = mockResponse();
  await handleAdminSessao({
    method: 'GET',
    headers: {
      cookie: `${COOKIE_NAME}=${signSession(SECRET, {
        id_usuario_admin: 'u-root',
        email: 'super@example.com',
        perfil: 'SUPER_ADMIN',
        protegido: true,
      })}`,
    },
  }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.autenticado, true);
  assert.equal(response.body.usuario.email, 'super@example.com');
  assert.equal(response.body.usuario.perfil, 'SUPER_ADMIN');
  assert.equal(response.body.usuario.protegido, true);
  assert.equal(response.body.usuario.senha_hash, undefined);
  assert.equal(response.body.usuario.senha_salt, undefined);
  assert.equal(response.body.usuario.nome_usuario, null);
});

test('GET /api/admin/sessao returns nome_usuario from signed cookie', async () => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  const response = mockResponse();
  await handleAdminSessao({
    method: 'GET',
    headers: {
      cookie: `${COOKIE_NAME}=${signSession(SECRET, {
        id_usuario_admin: 'u-root',
        email: 'super@example.com',
        perfil: 'SUPER_ADMIN',
        protegido: true,
        nome_usuario: 'Marco Antônio',
      })}`,
    },
  }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.usuario.nome_usuario, 'Marco Antônio');
  assert.equal(response.body.usuario.email, 'super@example.com');
  assert.equal(response.body.usuario.senha, undefined);
});

test('GET /api/admin/sessao returns 401 without a cookie', async () => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  const response = mockResponse();
  await handleAdminSessao({ method: 'GET', headers: {} }, response);
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.error, 'unauthorized');
});

test('GET /api/admin/sessao entrega ambiente resolvido por APP_AMBIENTE ao frontend', async () => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  const anterior = process.env.APP_AMBIENTE;
  const casos = [
    ['development', 'DEV'],
    ['homologacao', 'HML'],
    ['production', 'PROD'],
    ['valor-invalido', 'UNKNOWN'],
    [undefined, 'UNKNOWN'],
  ];
  try {
    for (const [valor, esperado] of casos) {
      if (valor === undefined) delete process.env.APP_AMBIENTE;
      else process.env.APP_AMBIENTE = valor;
      const response = mockResponse();
      await handleAdminSessao({
        method: 'GET',
        headers: { cookie: `${COOKIE_NAME}=${superAdminToken()}` },
      }, response);
      assert.equal(response.statusCode, 200, String(valor));
      assert.equal(response.body.ambiente, esperado, String(valor));
    }
  } finally {
    if (anterior === undefined) delete process.env.APP_AMBIENTE;
    else process.env.APP_AMBIENTE = anterior;
  }
});

test('auditoria pagination defaults to 10 and ignores larger limite', () => {
  assert.deepEqual(parseAuditPagination({}), { pagina: 1, limite: AUDIT_PAGE_LIMIT });
  assert.deepEqual(parseAuditPagination({ limite: '50', pagina: '2' }), { pagina: 2, limite: 10 });
  assert.deepEqual(parseAuditPagination({ pagina: '0' }), { pagina: 1, limite: 10 });
});

test('GET /api/admin/auditoria paginates with count, offset and preserved filters', async () => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  const token = superAdminToken();
  const calls = [];
  const rows = Array.from({ length: 10 }, (_, index) => ({
    id_auditoria: `evt-${index + 11}`,
    acao: 'EDITAR_PRODUTO',
    entidade: 'produto',
    sucesso: true,
  }));
  const pool = {
    async query(sql, params = []) {
      calls.push({ sql: String(sql), params });
      if (String(sql).includes('op:count_auditoria')) {
        return { rows: [{ total: 47 }] };
      }
      return { rows };
    },
  };
  const page1 = mockResponse();
  await handleAdminAuditoria({
    method: 'GET',
    url: '/api/admin/auditoria?acao=EDITAR_PRODUTO&limite=50&pagina=1',
    headers: { cookie: `${COOKIE_NAME}=${token}` },
  }, page1, { getPool: () => pool });
  assert.equal(page1.statusCode, 200);
  assert.equal(page1.body.eventos.length, 10);
  assert.equal(page1.body.paginacao.limite, 10);
  assert.equal(page1.body.paginacao.pagina, 1);
  assert.equal(page1.body.paginacao.total, 47);
  assert.equal(page1.body.paginacao.total_paginas, 5);
  assert.equal(calls[0].params.includes('EDITAR_PRODUTO'), true);

  const page2 = mockResponse();
  await handleAdminAuditoria({
    method: 'GET',
    url: '/api/admin/auditoria?acao=EDITAR_PRODUTO&pagina=2',
    headers: { cookie: `${COOKIE_NAME}=${token}` },
  }, page2, { getPool: () => pool });
  const listCalls = calls.filter((item) => item.sql.includes('op:list_auditoria') && item.sql.includes('OFFSET'));
  assert.equal(listCalls[0].params.at(-1), 0);
  assert.equal(listCalls[1].params.at(-1), 10);
  assert.equal(listCalls[1].params.at(-2), 10);
  assert.equal(page2.body.paginacao.pagina, 2);
});

test('auditoria CSV is not limited to the current page', async () => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  const token = superAdminToken();
  const csvRows = Array.from({ length: 47 }, (_, index) => ({
    data_evento: '2026-01-01',
    email_usuario: 'a@b.com',
    acao: 'LOGIN_SUCESSO',
    entidade: 'usuario_admin',
    id_registro: `id-${index}`,
    sucesso: true,
    descricao_evento: 'ok',
  }));
  const response = mockResponse();
  await handleAdminAuditoria({
    method: 'GET',
    url: '/api/admin/auditoria?formato=csv&pagina=2',
    headers: { cookie: `${COOKIE_NAME}=${token}` },
  }, response, {
    getPool() {
      return {
        async query(sql) {
          if (String(sql).includes('op:count_auditoria')) return { rows: [{ total: 47 }] };
          if (String(sql).includes('op:list_auditoria_csv')) return { rows: csvRows };
          return { rows: csvRows.slice(0, 10) };
        },
      };
    },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(String(response.body).split('\n').length, 48);
});

// ---- V11: estabilidade de conexão (SQLSTATE 53300) ----

function tooManyConnectionsError() {
  const error = new Error('too many connections for role "amanteigados_homolog_app"');
  error.code = '53300';
  error.name = 'error';
  return error;
}

test('53300 (too many connections) é indisponibilidade do banco', () => {
  assert.equal(isDatabaseUnavailable(tooManyConnectionsError()), true);
  assert.equal(isDatabaseUnavailable({ code: '23505' }), false);
});

test('mapDatabaseError: 53300 => 503 database_unavailable sem vazar SQLSTATE/role', () => {
  const original = tooManyConnectionsError();
  const mapped = mapDatabaseError(original);
  assert.equal(mapped instanceof AdminError, true);
  assert.equal(mapped.status, 503);
  assert.equal(mapped.code, 'database_unavailable');
  assert.equal(mapped.message, 'Serviço temporariamente indisponível. Tente novamente em instantes.');

  const client = toClientError(original);
  assert.equal(client.status, 503);
  assert.equal(client.body.error, 'database_unavailable');
  const publicJson = JSON.stringify(client.body);
  assert.equal(publicJson.includes('53300'), false);
  assert.equal(publicJson.includes('amanteigados_homolog_app'), false);
  assert.equal(publicJson.includes('role'), false);

  // causa original só existe para log server-side
  assert.equal(mapped.cause, original);
  assert.equal(Object.keys(client.body).sort().join(','), 'error,message');
});

test('safeDatabaseErrorLog mantém SQLSTATE e nome, sem nome de role/usuário', () => {
  const logged = safeDatabaseErrorLog(tooManyConnectionsError());
  assert.equal(logged.code, '53300');
  assert.equal(logged.name, 'error');
  assert.equal(logged.message.includes('amanteigados_homolog_app'), false);
  assert.equal(safeDatabaseErrorLog(new Error('password authentication failed for user "x.abc"')).message.includes('x.abc'), false);
});

test('POST /api/vendas com 53300: 503 público sem detalhes e SQLSTATE original no log', async () => {
  const logs = [];
  const response = mockResponse();
  await handlePublicVenda({
    method: 'POST',
    url: '/api/vendas',
    query: {},
    headers: {},
    body: {
      chave_idempotencia: 'v11-53300-probe',
      nome_cliente: 'Ana Souza',
      telefone_cliente: '11999990000',
      itens: [{ id_produto: 'p1', quantidade: 1 }],
    },
  }, response, {
    getPool() {
      return { async connect() { throw tooManyConnectionsError(); } };
    },
    logDatabaseError(scope, error) {
      logs.push({ scope, error });
    },
  });
  const publicBody = typeof response.body === 'string' ? response.body : JSON.stringify(response.body);
  assert.equal(response.statusCode, 503);
  assert.equal(JSON.parse(publicBody).error, 'database_unavailable');
  assert.equal(publicBody.includes('53300'), false);
  assert.equal(publicBody.includes('amanteigados_homolog_app'), false);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].scope, '[vendas] request failed');
  assert.equal(logs[0].error.code, '53300');
});

test('erros de negócio (409/400) não geram log de banco', async () => {
  const logs = [];
  const response = mockResponse();
  await handlePublicVenda({
    method: 'POST', url: '/api/vendas', query: {}, headers: {}, body: { chave_idempotencia: 'k' },
  }, response, { getPool: () => ({}), logDatabaseError: (...args) => logs.push(args) });
  assert.equal(response.statusCode, 400);
  assert.equal(logs.length, 0);
});

test('pool serverless: max=1 e liberação rápida de conexões ociosas', () => {
  assert.equal(POOL_LIMITS.max, 1);
  assert.equal(POOL_LIMITS.idleTimeoutMillis, 1000);
  assert.equal(POOL_LIMITS.connectionTimeoutMillis, 8000);
  assert.equal(POOL_LIMITS.allowExitOnIdle, true);
});

test('GET /api/health-db em erro devolve só {ok:false, database:unavailable} com 503', async (t) => {
  const saved = { host: process.env.DATABASE_HOST, url: process.env.DATABASE_URL };
  delete process.env.DATABASE_HOST;
  delete process.env.DATABASE_URL;
  t.after(() => {
    if (saved.host !== undefined) process.env.DATABASE_HOST = saved.host;
    if (saved.url !== undefined) process.env.DATABASE_URL = saved.url;
  });
  t.mock.method(console, 'error', () => {});
  const response = mockResponse();
  await healthDbHandler({ method: 'GET' }, response);
  assert.equal(response.statusCode, 503);
  assert.deepEqual(response.body, { ok: false, database: 'unavailable' });
});

// ---- Gestão (Publicações, Auditoria, Usuários) exclusiva de SUPER_ADMIN ----
// Perfis sem valor real no token (vazio/nulo/ausente) viram ADMIN em readSession; continuam negados.

const PERFIS_NAO_SUPER = [
  { label: 'ADMIN', token: () => forgedToken({ id_usuario_admin: 'a1', email: 'admin@example.com', perfil: 'ADMIN' }) },
  { label: 'GESTOR', token: () => forgedToken({ id_usuario_admin: 'g1', email: 'gestor@example.com', perfil: 'GESTOR' }) },
  { label: 'desconhecido', token: () => forgedToken({ id_usuario_admin: 'x1', perfil: 'ROOT' }) },
  { label: 'vazio', token: () => forgedToken({ id_usuario_admin: 'x2', perfil: '' }) },
  { label: 'null', token: () => forgedToken({ id_usuario_admin: 'x3', perfil: null }) },
  { label: 'ausente', token: () => forgedToken({ id_usuario_admin: 'x4' }) },
];

const USUARIO_ALVO = '77777777-7777-4777-8777-777777777777';

const GESTAO_CASOS = [
  { label: 'publicacoes GET', handler: handleAdminPublicacoes, method: 'GET', url: '/api/admin/publicacoes' },
  { label: 'publicacoes validar', handler: handleAdminPublicacoes, method: 'POST', url: '/api/admin/publicacoes', body: { acao: 'validar', git_sha: 'sha-hml-exato' } },
  { label: 'publicacoes validar persistir', handler: handleAdminPublicacoes, method: 'POST', url: '/api/admin/publicacoes', body: { acao: 'validar', persistir: true } },
  { label: 'publicacoes agendar', handler: handleAdminPublicacoes, method: 'POST', url: '/api/admin/publicacoes', body: { acao: 'agendar', tipo_publicacao: 'CATALOGO' } },
  { label: 'publicacoes publicar', handler: handleAdminPublicacoes, method: 'POST', url: '/api/admin/publicacoes', body: { acao: 'publicar', git_sha: 'sha-hml-exato', confirmacao: 'PUBLICAR PRODUCAO' } },
  { label: 'auditoria JSON', handler: handleAdminAuditoria, method: 'GET', url: '/api/admin/auditoria' },
  { label: 'auditoria CSV', handler: handleAdminAuditoria, method: 'GET', url: '/api/admin/auditoria?formato=csv' },
  { label: 'relatorios secao=auditoria JSON', handler: handleAdminRelatorios, method: 'GET', url: '/api/admin/relatorios?secao=auditoria' },
  { label: 'relatorios secao=auditoria CSV', handler: handleAdminRelatorios, method: 'GET', url: '/api/admin/relatorios?formato=csv&secao=auditoria' },
  { label: 'usuarios GET', handler: handleAdminUsuarios, method: 'GET', url: '/api/admin/usuarios' },
  { label: 'usuarios criar', handler: handleAdminUsuarios, method: 'POST', url: '/api/admin/usuarios', body: { acao: 'criar', dados: { nome: 'Novo', email: 'novo@example.com', usuario: 'novo.gestor', senha: '1234', perfil: 'GESTOR' } } },
  { label: 'usuarios editar', handler: handleAdminUsuarios, method: 'POST', url: '/api/admin/usuarios', body: { acao: 'editar', id: USUARIO_ALVO, dados: { nome: 'G', email: 'g@example.com', perfil: 'GESTOR', ativo: false } } },
  { label: 'usuarios redefinir_senha', handler: handleAdminUsuarios, method: 'POST', url: '/api/admin/usuarios', body: { acao: 'redefinir_senha', id: USUARIO_ALVO, senha: '0123' } },
  { label: 'usuarios excluir', handler: handleAdminUsuarios, method: 'POST', url: '/api/admin/usuarios', body: { acao: 'excluir', id: USUARIO_ALVO } },
];

function strictPool() {
  const calls = [];
  return {
    calls,
    async query(sql) {
      calls.push(String(sql));
      throw new Error('nao deve consultar o banco');
    },
  };
}

test('Gestão negada a todo perfil que não seja SUPER_ADMIN, antes de qualquer efeito colateral', async () => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  process.env.PROMOCAO_PROD_HABILITADA = 'true';
  process.env.GIT_SHA = 'sha-hml-exato';
  process.env.VERCEL = '1';
  try {
    for (const perfil of PERFIS_NAO_SUPER) {
      for (const caso of GESTAO_CASOS) {
        const label = `${caso.label} / ${perfil.label}`;
        const pool = strictPool();
        let vercelCalls = 0;
        const response = mockResponse();
        await caso.handler({
          method: caso.method,
          url: caso.url,
          headers: { cookie: `${COOKIE_NAME}=${perfil.token()}` },
          body: caso.body,
        }, response, {
          getPool: () => pool,
          prodDatabaseReady: true,
          prodEnvReady: true,
          vercelReleaseClient: async () => { vercelCalls += 1; return { state: 'READY' }; },
          verifyPostRelease: async () => ({ ok: true }),
        });
        assert.equal(response.statusCode, 403, label);
        assert.equal(response.body.error, 'forbidden', label);
        assert.equal(vercelCalls, 0, `${label}: Vercel não pode ser chamada`);
        assert.deepEqual(pool.calls, [], `${label}: nenhuma consulta ao banco`);
        assert.equal(response.body.eventos ?? response.body.usuarios ?? response.body.publicacoes ?? response.body.auditoria, undefined, `${label}: sem dados parciais`);
      }
    }
  } finally {
    delete process.env.PROMOCAO_PROD_HABILITADA;
    delete process.env.GIT_SHA;
  }
});

test('sessão ausente em Gestão continua 401 (comportamento de autenticação existente)', async () => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  for (const caso of GESTAO_CASOS) {
    const response = mockResponse();
    await caso.handler({ method: caso.method, url: caso.url, headers: {}, body: caso.body }, response, {
      getPool: () => strictPool(),
    });
    assert.equal(response.statusCode, 401, caso.label);
  }
});

test('SUPER_ADMIN alcança leitura de usuários, criação de GESTOR e auditoria (caminho autorizado mockado)', async () => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  const cookie = { cookie: `${COOKIE_NAME}=${superAdminToken()}` };
  const superRow = {
    id_usuario_admin: '22222222-2222-4222-8222-222222222222',
    nome_usuario: 'Super',
    email_usuario: 'super@example.com',
    login_usuario: 'super',
    perfil_usuario: 'SUPER_ADMIN',
    ativo: true,
    protegido: false,
  };
  const pool = {
    async query(sql) {
      const text = String(sql);
      if (text.includes('op:get_usuario_id')) return { rows: [superRow] };
      if (text.includes('op:insert_usuario')) {
        return { rows: [{ ...superRow, id_usuario_admin: 'novo-1', nome_usuario: 'Novo', email_usuario: 'novo@example.com', login_usuario: 'novo.gestor', perfil_usuario: 'GESTOR' }] };
      }
      if (text.includes('op:count_auditoria')) return { rows: [{ total: 0 }] };
      return { rows: [] };
    },
  };
  const listagem = mockResponse();
  await handleAdminUsuarios({ method: 'GET', url: '/api/admin/usuarios', headers: cookie }, listagem, { getPool: () => pool });
  assert.equal(listagem.statusCode, 200);
  assert.deepEqual(listagem.body.usuarios, []);

  const criacao = mockResponse();
  await handleAdminUsuarios({
    method: 'POST',
    url: '/api/admin/usuarios',
    headers: cookie,
    body: { acao: 'criar', dados: { nome: 'Novo', email: 'novo@example.com', usuario: 'novo.gestor', senha: '0123', perfil: 'GESTOR' } },
  }, criacao, { getPool: () => pool });
  assert.equal(criacao.statusCode, 200);
  assert.equal(criacao.body.usuario.perfil_usuario, 'GESTOR');

  const auditoria = mockResponse();
  await handleAdminAuditoria({ method: 'GET', url: '/api/admin/auditoria', headers: cookie }, auditoria, { getPool: () => pool });
  assert.equal(auditoria.statusCode, 200);
  assert.deepEqual(auditoria.body.eventos, []);
});

test('relatorios: ADMIN não recebe auditoria e a tabela não é consultada; SUPER_ADMIN recebe', async () => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  const seen = [];
  const pool = {
    async query(sql) {
      seen.push(String(sql));
      return { rows: [] };
    },
  };

  const adminResponse = mockResponse();
  await handleAdminRelatorios({
    method: 'GET',
    url: '/api/admin/relatorios',
    headers: { cookie: `${COOKIE_NAME}=${forgedToken({ id_usuario_admin: 'a1', perfil: 'ADMIN' })}` },
  }, adminResponse, { getPool: () => pool });
  assert.equal(adminResponse.statusCode, 200);
  assert.equal('auditoria' in adminResponse.body, false);
  assert.equal(seen.some((sql) => sql.includes('tab_auditoria_admin')), false);

  seen.length = 0;
  const superResponse = mockResponse();
  await handleAdminRelatorios({
    method: 'GET',
    url: '/api/admin/relatorios',
    headers: { cookie: `${COOKIE_NAME}=${superAdminToken()}` },
  }, superResponse, { getPool: () => pool });
  assert.equal(superResponse.statusCode, 200);
  assert.deepEqual(superResponse.body.auditoria, []);
  assert.equal(seen.some((sql) => sql.includes('tab_auditoria_admin')), true);
});
