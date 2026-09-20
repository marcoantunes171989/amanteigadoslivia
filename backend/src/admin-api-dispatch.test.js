import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { COOKIE_NAME, signSession } from './admin-auth.js';
import {
  handleAdminAlteracoes,
  handleAdminAuditoria,
  handleAdminCatalog,
  handleAdminConteudo,
  handleAdminLogin,
  handleAdminLogout,
  handleAdminPublicacoes,
  handleAdminRelatorios,
  handleAdminSolicitacoes,
  handleAdminUploadUrl,
  handleAdminUsuarios,
  handleAdminVendas,
  handleProcessPublications,
  handleProcessScheduledChanges,
} from './admin-http.js';
import {
  ADMIN_ROUTES,
  adminPathFromRequest,
  createAdminHandler,
} from '../../api/admin-router.js';
import {
  INTERNO_ROUTES,
  createInternoHandler,
  internoJobFromRequest,
} from '../../api/interno-router.js';

const SECRET = 'test-admin-session-secret-value-32b';
const INTERNAL = 'test-internal-job-secret-value';

function mockResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    text: null,
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
      this.text = payload;
      return this;
    },
    end(payload) {
      if (payload != null && this.body == null) {
        const text = String(payload);
        try {
          this.body = JSON.parse(text);
        } catch {
          this.text = text;
        }
      }
      return this;
    },
  };
}

function emptyPool() {
  return {
    async query() {
      return { rows: [] };
    },
  };
}

afterEach(() => {
  delete process.env.ADMIN_SESSION_SECRET;
  delete process.env.INTERNAL_JOB_SECRET;
  delete process.env.CRON_SECRET;
});

test('admin router exposes a static map of public URLs', () => {
  assert.equal(ADMIN_ROUTES.login, handleAdminLogin);
  assert.equal(ADMIN_ROUTES.logout, handleAdminLogout);
  assert.equal(ADMIN_ROUTES.catalogo, handleAdminCatalog);
  assert.equal(ADMIN_ROUTES.vendas, handleAdminVendas);
  assert.equal(ADMIN_ROUTES.relatorios, handleAdminRelatorios);
  assert.equal(ADMIN_ROUTES.auditoria, handleAdminAuditoria);
  assert.equal(ADMIN_ROUTES.usuarios, handleAdminUsuarios);
  assert.equal(ADMIN_ROUTES['alteracoes-agendadas'], handleAdminAlteracoes);
  assert.equal(ADMIN_ROUTES.publicacoes, handleAdminPublicacoes);
  assert.equal(ADMIN_ROUTES['imagens/upload-url'], handleAdminUploadUrl);
  assert.equal(ADMIN_ROUTES.conteudo, handleAdminConteudo);
  assert.equal(ADMIN_ROUTES.solicitacoes, handleAdminSolicitacoes);
  assert.deepEqual(Object.keys(ADMIN_ROUTES).sort(), [
    'alteracoes-agendadas',
    'auditoria',
    'catalogo',
    'conteudo',
    'imagens/upload-url',
    'login',
    'logout',
    'publicacoes',
    'relatorios',
    'solicitacoes',
    'usuarios',
    'vendas',
  ]);
});

test('interno router exposes only the two worker jobs', () => {
  assert.equal(INTERNO_ROUTES['processar-alteracoes-agendadas'], handleProcessScheduledChanges);
  assert.equal(INTERNO_ROUTES['processar-publicacoes'], handleProcessPublications);
  assert.deepEqual(Object.keys(INTERNO_ROUTES).sort(), [
    'processar-alteracoes-agendadas',
    'processar-publicacoes',
  ]);
});

test('admin path is read from URL, query string or slug array', () => {
  assert.equal(adminPathFromRequest({ url: '/api/admin/login' }), 'login');
  assert.equal(adminPathFromRequest({ url: '/api/admin/imagens/upload-url?x=1' }), 'imagens/upload-url');
  assert.equal(adminPathFromRequest({ query: { slug: 'catalogo' } }), 'catalogo');
  assert.equal(adminPathFromRequest({ query: { slug: ['imagens', 'upload-url'] } }), 'imagens/upload-url');
  assert.equal(adminPathFromRequest({ query: { path: 'alteracoes-agendadas' } }), 'alteracoes-agendadas');
  assert.equal(adminPathFromRequest({ url: '/api/admin-router' }), '');
});

test('interno job is read from URL or query', () => {
  assert.equal(
    internoJobFromRequest({ url: '/api/interno/processar-publicacoes' }),
    'processar-publicacoes',
  );
  assert.equal(
    internoJobFromRequest({ query: { job: 'processar-alteracoes-agendadas' } }),
    'processar-alteracoes-agendadas',
  );
});

test('unknown admin and interno routes return 404', async () => {
  const admin = createAdminHandler({ getPool: emptyPool });
  const missingAdmin = mockResponse();
  await admin({ method: 'GET', url: '/api/admin/nao-existe', headers: {} }, missingAdmin);
  assert.equal(missingAdmin.statusCode, 404);
  assert.equal(missingAdmin.body.error, 'not_found');

  const interno = createInternoHandler({ getPool: emptyPool });
  const missingJob = mockResponse();
  await interno({ method: 'POST', url: '/api/interno/outro-job', headers: {} }, missingJob);
  assert.equal(missingJob.statusCode, 404);
  assert.equal(missingJob.body.error, 'not_found');
});

test('valid admin routes keep original method handling', async () => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  const handler = createAdminHandler({
    getPool() {
      throw new Error('pool should not run for method checks');
    },
  });

  const cases = [
    ['/api/admin/login', 'GET', 405],
    ['/api/admin/logout', 'GET', 405],
    ['/api/admin/catalogo', 'PUT', 405],
    ['/api/admin/imagens/upload-url', 'GET', 401],
  ];

  for (const [url, method, status] of cases) {
    const response = mockResponse();
    await handler({ method, url, headers: {} }, response);
    assert.equal(response.statusCode, status, `${method} ${url}`);
    if (status === 405) assert.equal(response.body.error, 'method_not_allowed');
    if (status === 401) assert.equal(response.body.error, 'unauthorized');
  }
});

test('protected admin routes still require a session', async () => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  const handler = createAdminHandler({
    getPool() {
      throw new Error('pool should not be used without a session');
    },
  });

  for (const url of [
    '/api/admin/catalogo',
    '/api/admin/vendas',
    '/api/admin/relatorios',
    '/api/admin/auditoria',
    '/api/admin/usuarios',
    '/api/admin/alteracoes-agendadas',
    '/api/admin/publicacoes',
    '/api/admin/imagens/upload-url',
    '/api/admin/conteudo',
    '/api/admin/solicitacoes',
  ]) {
    const response = mockResponse();
    await handler({ method: 'GET', url, headers: {} }, response);
    assert.equal(response.statusCode, 401, url);
    assert.equal(response.body.error, 'unauthorized');
  }
});

test('signed session reaches the catalog handler through the router', async () => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  const handler = createAdminHandler({ getPool: emptyPool });
  const response = mockResponse();
  await handler({
    method: 'GET',
    url: '/api/admin/catalogo',
    headers: { cookie: `${COOKIE_NAME}=${signSession(SECRET, { id_usuario_admin: 'u1', email: 'admin@example.com', perfil: 'ADMIN' })}` },
  }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.resumo.categorias, 0);
});

test('interno jobs reject missing secret and wrong method', async () => {
  process.env.INTERNAL_JOB_SECRET = INTERNAL;
  const handler = createInternoHandler({
    getPool() {
      throw new Error('pool should not run without a valid secret');
    },
  });

  const unauthorized = mockResponse();
  await handler({
    method: 'POST',
    url: '/api/interno/processar-alteracoes-agendadas',
    headers: {},
  }, unauthorized);
  assert.equal(unauthorized.statusCode, 401);
  assert.equal(unauthorized.body.error, 'unauthorized');

  const wrongMethod = mockResponse();
  await handler({
    method: 'PUT',
    url: '/api/interno/processar-publicacoes',
    headers: { 'x-internal-job-secret': INTERNAL },
  }, wrongMethod);
  assert.equal(wrongMethod.statusCode, 405);
  assert.equal(wrongMethod.body.error, 'method_not_allowed');
});

test('interno jobs accept INTERNAL_JOB_SECRET and dispatch the worker', async () => {
  process.env.INTERNAL_JOB_SECRET = INTERNAL;
  let scheduled = false;
  let published = false;
  const handler = createInternoHandler({
    getPool: () => ({
      async query(sql) {
        const text = String(sql);
        if (text.includes('tab_alteracao_agendada') || text.includes('alteracao')) {
          scheduled = true;
          return { rows: [], rowCount: 0 };
        }
        if (text.includes('publicacao')) {
          published = true;
          return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
      },
    }),
  });

  const scheduledRes = mockResponse();
  await handler({
    method: 'POST',
    url: '/api/interno/processar-alteracoes-agendadas',
    headers: { 'x-internal-job-secret': INTERNAL },
  }, scheduledRes);
  assert.equal(scheduledRes.statusCode, 200);
  assert.equal(scheduledRes.body.ok, true);

  const publishedRes = mockResponse();
  await handler({
    method: 'POST',
    url: '/api/interno/processar-publicacoes',
    headers: { 'x-internal-job-secret': INTERNAL },
  }, publishedRes);
  assert.equal(publishedRes.statusCode, 200);
  assert.equal(publishedRes.body.ok, true);
  assert.equal(scheduled, true);
  assert.equal(published, true);
});
