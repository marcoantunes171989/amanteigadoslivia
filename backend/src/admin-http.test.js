import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { COOKIE_NAME, signSession } from './admin-auth.js';
import { handleAdminCatalog, handleAdminLogin, handleAdminLogout, handleAdminUsuarios, handlePublicCatalog, handlePublicVenda } from './admin-http.js';
import { hashPassword } from './password.js';

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

function createUserPool(user) {
  const auditoria = [];
  return {
    auditoria,
    async query(sql, params = []) {
      const text = String(sql);
      if (text.includes('op:get_usuario_email')) {
        return {
          rows: user && String(params[0]).toLowerCase() === String(user.email_usuario).toLowerCase()
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
    email_usuario: 'admin@example.com',
    senha_hash: hashed.senha_hash,
    senha_salt: hashed.senha_salt,
    perfil_usuario: 'ADMIN',
    ativo: true,
  });
  const response = mockResponse();
  await handleAdminLogin({
    method: 'POST',
    headers: {},
    body: { email: 'admin@example.com', senha: 'outra-senha-errada' },
  }, response, { getPool: () => pool });
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.error, 'unauthorized');
  assert.equal(response.body.message, 'E-mail ou senha inválidos.');
  assert.equal(response.headers['set-cookie'], undefined);
  assert.equal(pool.auditoria[0].acao, 'LOGIN_FALHA');
});

test('login sets an HttpOnly session cookie', async () => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  const hashed = await hashPassword(PASSWORD);
  const pool = createUserPool({
    id_usuario_admin: '11111111-1111-4111-8111-111111111111',
    nome_usuario: 'Admin',
    email_usuario: 'admin@example.com',
    senha_hash: hashed.senha_hash,
    senha_salt: hashed.senha_salt,
    perfil_usuario: 'ADMIN',
    ativo: true,
  });
  const response = mockResponse();
  await handleAdminLogin({
    method: 'POST',
    headers: { 'x-forwarded-proto': 'https' },
    body: { email: 'admin@example.com', senha: PASSWORD },
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
  assert.match(inserted[0].sql, /tab_solicitacao_encomenda/);
});

test('SUPER_ADMIN login sets session cookie with perfil', async () => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  const hashed = await hashPassword(PASSWORD);
  const pool = createUserPool({
    id_usuario_admin: '22222222-2222-4222-8222-222222222222',
    nome_usuario: 'Super',
    email_usuario: 'super@example.com',
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
    body: { email: 'super@example.com', senha: PASSWORD },
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
  const response = mockResponse();
  await handleAdminUsuarios({
    method: 'POST',
    headers: {
      cookie: `${COOKIE_NAME}=${signSession(SECRET, {
        id_usuario_admin: '22222222-2222-4222-8222-222222222222',
        email: 'super@example.com',
        perfil: 'SUPER_ADMIN',
      })}`,
    },
    body: { acao: 'excluir', id: '11111111-1111-4111-8111-111111111111' },
  }, response, {
    getPool() {
      return {
        async query() {
          throw new Error('pool should not run for blocked delete');
        },
      };
    },
  });
  assert.equal(response.statusCode, 403);
  assert.equal(response.body.error, 'forbidden');
});
