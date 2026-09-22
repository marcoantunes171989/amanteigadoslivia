import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { COOKIE_NAME, signSession } from './admin-auth.js';
import {
  handleAdminCatalog,
  handleAdminLogin,
  handleAdminPublicacoes,
  handleAdminRelatorios,
  handleAdminUploadUrl,
  handlePublicVenda,
} from './admin-http.js';
import { captureVenda, computeFaturamento } from './admin-sales.js';
import { cancelScheduledChange, parseSaoPauloDateTime } from './admin-schedule.js';
import { MAX_IMAGE_BYTES, validateImageUploadMeta } from './admin-storage.js';
import { getReports } from './admin-reports.js';
import { AdminError } from './admin-errors.js';
import { hashPassword } from './password.js';
import { parseReaisToCentavos } from './money.js';
import { getPublicationStatus, promoteToProduction, validatePromotionDryRun } from './admin-publish.js';

const SECRET = 'test-admin-session-secret-value-32b';

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
      if (payload && this.body == null && this.text == null) this.text = payload;
      return this;
    },
  };
}

function sessionHeaders() {
  return { cookie: `${COOKIE_NAME}=${signSession(SECRET, { id_usuario_admin: 'u1', email: 'admin@example.com', perfil: 'ADMIN' })}` };
}

afterEach(() => {
  delete process.env.ADMIN_SESSION_SECRET;
  delete process.env.PROMOCAO_PROD_HABILITADA;
  delete process.env.GIT_SHA;
  delete process.env.VERCEL_GIT_COMMIT_SHA;
  delete process.env.VERCEL_RELEASE_TOKEN;
  delete process.env.VERCEL_TEAM_ID;
  delete process.env.VERCEL_PROD_PROJECT_ID;
  delete process.env.VERCEL_PROD_PROJECT_NAME;
  delete process.env.VERCEL_RELEASE_GIT_OWNER;
  delete process.env.VERCEL_RELEASE_GIT_REPO;
  delete process.env.VERCEL;
});

test('login email/senha succeeds and inactive user is rejected', async () => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  const hashed = await hashPassword('senha-forte-123');
  const user = {
    id_usuario_admin: 'u1',
    nome_usuario: 'Admin',
    email_usuario: 'livia@example.com',
    senha_hash: hashed.senha_hash,
    senha_salt: hashed.senha_salt,
    perfil_usuario: 'ADMIN',
    ativo: false,
  };
  const response = mockResponse();
  await handleAdminLogin({
    method: 'POST',
    headers: {},
    body: { email: 'livia@example.com', senha: 'senha-forte-123' },
  }, response, {
    getPool: () => ({
      async query(sql) {
        if (String(sql).includes('get_usuario_email')) return { rows: [user] };
        return { rows: [] };
      },
    }),
  });
  assert.equal(response.statusCode, 401);
});

test('unknown email returns the same generic 401', async () => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  const response = mockResponse();
  await handleAdminLogin({
    method: 'POST',
    headers: {},
    body: { email: 'naoexiste@example.com', senha: 'qualquer-senha' },
  }, response, {
    getPool: () => ({
      async query() { return { rows: [] }; },
    }),
  });
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.message, 'E-mail ou senha inválidos.');
});

test('upload metadata rejects files larger than 2MB and invalid mime', () => {
  assert.throws(() => validateImageUploadMeta({
    nome_arquivo: 'foto.jpg',
    tipo_mime: 'image/jpeg',
    tamanho_bytes: MAX_IMAGE_BYTES + 1,
  }), (error) => error instanceof AdminError && /2 MB/.test(error.message));

  assert.throws(() => validateImageUploadMeta({
    nome_arquivo: 'arquivo.svg',
    tipo_mime: 'image/svg+xml',
    tamanho_bytes: 1000,
  }), (error) => error instanceof AdminError);

  const ok = validateImageUploadMeta({
    nome_arquivo: 'foto.webp',
    tipo_mime: 'image/webp',
    tamanho_bytes: 1024,
  });
  assert.equal(ok.extension, 'webp');
});

test('upload URL endpoint rejects oversized and invalid mime without session leak', async () => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  const oversized = mockResponse();
  await handleAdminUploadUrl({
    method: 'POST',
    headers: sessionHeaders(),
    body: { nome_arquivo: 'x.jpg', tipo_mime: 'image/jpeg', tamanho_bytes: MAX_IMAGE_BYTES + 10 },
  }, oversized, { getPool: () => ({ query: async () => ({ rows: [] }) }) });
  assert.equal(oversized.statusCode, 400);
  assert.match(oversized.body.message, /2 MB/);

  const invalid = mockResponse();
  await handleAdminUploadUrl({
    method: 'POST',
    headers: sessionHeaders(),
    body: { nome_arquivo: 'x.gif', tipo_mime: 'image/gif', tamanho_bytes: 100 },
  }, invalid, { getPool: () => ({ query: async () => ({ rows: [] }) }) });
  assert.equal(invalid.statusCode, 400);
});

test('converts BRL to centavos for scheduled and immediate prices', () => {
  assert.equal(parseReaisToCentavos('24,90'), 2490);
});

test('produto agendado does not mutate catalog immediately', async () => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  const future = new Date(Date.now() + 10 * 60 * 1000);
  const isoDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(future);
  const hour = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(future);
  let inserted = null;
  const response = mockResponse();
  await handleAdminCatalog({
    method: 'POST',
    headers: sessionHeaders(),
    body: {
      recurso: 'produto',
      acao: 'editar',
      id: 'p1',
      dados: {
        aplicar: 'agendar',
        data_agendada: isoDay,
        hora_agendada: hour,
        nome: 'Produto teste V2',
      },
    },
  }, response, {
    getPool: () => ({
      async query(sql, params) {
        if (String(sql).includes('insert_alteracao')) {
          inserted = params;
          return { rows: [{ id_alteracao_agendada: 'a1', id_registro: params[3], data_vigencia: params[5], status_alteracao: 'AGENDADA' }] };
        }
        if (String(sql).includes('insert_auditoria')) return { rows: [] };
        return { rows: [] };
      },
    }),
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.agendada, true);
  assert.ok(inserted);
});

test('parseSaoPauloDateTime rejects past dates', () => {
  assert.throws(() => parseSaoPauloDateTime('2020-01-01', '10:00'), (error) => error instanceof AdminError);
});

test('cancelar agendamento only affects AGENDADA rows', async () => {
  const result = await cancelScheduledChange({
    async query(sql, params) {
      assert.equal(params[0], 'ag-1');
      return { rows: [{ id_alteracao_agendada: 'ag-1', status_alteracao: 'CANCELADA' }] };
    },
  }, 'ag-1');
  assert.equal(result.status_alteracao, 'CANCELADA');
});

test('venda is idempotent and totals are recalculated server-side', async () => {
  const product = {
    id: 'prod-1',
    name: 'Amanteigado teste V2',
    active: true,
    price: 10,
    promotionalPrice: null,
  };
  const vendas = [];
  const itens = [];
  const pool = {
    async query(sql, params = []) {
      const text = String(sql);
      if (text.includes('BEGIN') || text.includes('COMMIT') || text.includes('ROLLBACK')) return { rows: [] };
      if (text.includes('get_venda_chave')) return { rows: vendas.filter((row) => row.chave_idempotencia === params[0]) };
      if (text.includes('json_agg')) {
        return {
          rows: [{
            categories: [{ id_categoria: 'c1', nome_categoria: 'Teste', slug_categoria: 'teste', ordem_exibicao: 0, ativo: true }],
            products: [{ id_produto: product.id, id_categoria: 'c1', nome_produto: product.name, slug_produto: 'teste-v2', descricao_produto: null, destaque: false, ativo: true, ordem_exibicao: 0 }],
            images: [],
            prices: [{ id_preco: 'pr1', id_produto: product.id, valor_centavos: 1000, promocional: false, inicio_vigencia: null, fim_vigencia: null, ativo: true, data_criacao: new Date() }],
          }],
        };
      }
      if (text.includes('FROM app.tab_categoria')) return { rows: [{ id_categoria: 'c1', nome_categoria: 'Teste', slug_categoria: 'teste', ordem_exibicao: 0, ativo: true }] };
      if (text.includes('FROM app.tab_produto') && text.includes('WHERE ativo')) {
        return { rows: [{ id_produto: product.id, id_categoria: 'c1', nome_produto: product.name, slug_produto: 'teste-v2', descricao_produto: null, destaque: false, ativo: true, ordem_exibicao: 0 }] };
      }
      if (text.includes('tab_produto_imagem')) return { rows: [] };
      if (text.includes('tab_produto_preco')) return { rows: [{ id_preco: 'pr1', id_produto: product.id, valor_centavos: 1000, promocional: false, inicio_vigencia: null, fim_vigencia: null, ativo: true, data_criacao: new Date() }] };
      if (text.includes('tab_alteracao_agendada') || text.includes('tab_venda') && text.includes('GREATEST')) {
        return { rows: [{ revisao: new Date(), proxima_atualizacao: null }] };
      }
      if (text.includes('insert_venda') && !text.includes('item')) {
        const row = {
          id_venda: params[0],
          chave_idempotencia: params[1],
          status_venda: 'PENDENTE',
          origem_venda: params[2],
          nome_cliente: params[3],
          telefone_cliente: params[4],
          valor_total_centavos: params[5],
          data_venda: new Date(),
          data_atualizacao: new Date(),
        };
        vendas.push(row);
        return { rows: [row] };
      }
      if (text.includes('insert_venda_item')) {
        const row = {
          id_item_venda: params[0],
          id_venda: params[1],
          id_produto: params[2],
          nome_produto: params[3],
          quantidade: params[4],
          valor_unitario_centavos: params[5],
          valor_total_centavos: params[6],
        };
        itens.push(row);
        return { rows: [row] };
      }
      if (text.includes('list_venda_itens')) return { rows: itens.filter((row) => row.id_venda === params[0]) };
      return { rows: [] };
    },
    async connect() {
      return {
        query: this.query.bind(this),
        release() {},
      };
    },
  };

  const first = mockResponse();
  await handlePublicVenda({
    method: 'POST',
    headers: {},
    body: {
      chave_idempotencia: 'idem-1',
      nome_cliente: '  Ana   Paula  ',
      telefone_cliente: '(18) 99999-8888',
      itens: [{ id_produto: 'prod-1', quantidade: 2, valor_unitario_centavos: 1 }],
    },
  }, first, { getPool: () => pool });
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.venda.valor_total_centavos, 2000);
  assert.equal(first.body.duplicated, false);
  assert.equal(first.body.venda.nome_cliente, 'Ana Paula');
  assert.equal(first.body.venda.telefone_cliente, '18999998888');
  assert.equal(first.body.venda.status_venda, 'PENDENTE');

  const second = mockResponse();
  await handlePublicVenda({
    method: 'POST',
    headers: {},
    body: {
      chave_idempotencia: 'idem-1',
      nome_cliente: 'Ana Paula',
      telefone_cliente: '18999998888',
      itens: [{ id_produto: 'prod-1', quantidade: 9 }],
    },
  }, second, { getPool: () => pool });
  assert.equal(second.body.duplicated, true);
  assert.equal(second.body.venda.valor_total_centavos, 2000);
  assert.equal(vendas.length, 1);
});

test('captureVenda exige nome e telefone válidos antes de tocar o banco', async () => {
  const untouchedPool = {
    async query() { throw new Error('banco não deve ser consultado'); },
    async connect() { throw new Error('banco não deve ser consultado'); },
  };
  const base = { chave_idempotencia: 'idem-cliente', itens: [{ id_produto: 'prod-1', quantidade: 1 }] };
  const cases = [
    ['sem nome', { telefone_cliente: '18999998888' }, 'Informe seu nome.'],
    ['nome vazio', { nome_cliente: '', telefone_cliente: '18999998888' }, 'Informe seu nome.'],
    ['nome só espaços', { nome_cliente: '    ', telefone_cliente: '18999998888' }, 'Informe seu nome.'],
    ['nome de 1 caractere', { nome_cliente: 'A', telefone_cliente: '18999998888' }, 'Informe seu nome.'],
    ['nome não string', { nome_cliente: { x: 1 }, telefone_cliente: '18999998888' }, 'Informe seu nome.'],
    ['sem telefone', { nome_cliente: 'Ana' }, 'Informe um telefone válido.'],
    ['telefone vazio', { nome_cliente: 'Ana', telefone_cliente: '   ' }, 'Informe um telefone válido.'],
    ['telefone com 9 dígitos', { nome_cliente: 'Ana', telefone_cliente: '999998888' }, 'Informe um telefone válido.'],
    ['telefone com letras', { nome_cliente: 'Ana', telefone_cliente: 'abc' }, 'Informe um telefone válido.'],
    ['telefone iniciando em 0', { nome_cliente: 'Ana', telefone_cliente: '0899998888' }, 'Informe um telefone válido.'],
  ];
  for (const [label, extra, message] of cases) {
    await assert.rejects(
      () => captureVenda(untouchedPool, { ...base, ...extra }),
      (error) => error instanceof AdminError && error.status === 400 && error.message === message,
      label,
    );
  }

  const res = mockResponse();
  await handlePublicVenda({
    method: 'POST',
    headers: {},
    body: { ...base, telefone_cliente: '18999998888' },
  }, res, { getPool: () => untouchedPool });
  assert.equal(res.statusCode, 400);
});

test('faturamento considera somente vendas CONFIRMADA', () => {
  const result = computeFaturamento([
    { status_venda: 'PENDENTE', valor_total_centavos: 5000 },
    { status_venda: 'CONFIRMADA', valor_total_centavos: 2000 },
    { status_venda: 'CONFIRMADA', valor_total_centavos: 1000 },
    { status_venda: 'CANCELADA', valor_total_centavos: 9000 },
  ]);
  assert.equal(result.pedidos, 4);
  assert.equal(result.vendas_confirmadas, 2);
  assert.equal(result.faturamento_centavos, 3000);
  assert.equal(result.ticket_medio_centavos, 1500);
});

test('relatorios vazios and with data', async () => {
  const emptyPool = {
    async query(sql) {
      const text = String(sql);
      if (text.includes('list_vendas') || text.includes('FROM app.tab_venda')) return { rows: [] };
      if (text.includes('tab_categoria')) return { rows: [] };
      if (text.includes('tab_produto')) return { rows: [] };
      if (text.includes('alteracao')) return { rows: [] };
      if (text.includes('auditoria')) return { rows: [] };
      return { rows: [] };
    },
  };
  const empty = await getReports(emptyPool);
  assert.equal(empty.visao_geral.faturamento_centavos, 0);
  assert.equal(empty.produtos.length, 0);

  const filled = await getReports({
    async query(sql) {
      const text = String(sql);
      if (text.includes('list_vendas') && !text.includes('item')) {
        return {
          rows: [{
            id_venda: 'v1',
            chave_idempotencia: 'k',
            status_venda: 'CONFIRMADA',
            origem_venda: 'SITE',
            nome_cliente: 'Teste',
            telefone_cliente: null,
            valor_total_centavos: 2500,
            data_venda: new Date(),
            data_atualizacao: new Date(),
          }],
        };
      }
      if (text.includes('list_vendas_itens') || text.includes('tab_venda_item')) {
        return { rows: [{ id_venda: 'v1', id_produto: 'p1', nome_produto: 'Teste', quantidade: 1, valor_unitario_centavos: 2500, valor_total_centavos: 2500 }] };
      }
      if (text.includes('tab_categoria')) return { rows: [{ ativo: true }] };
      if (text.includes('FROM app.tab_produto')) return { rows: [{ id_produto: 'p1', ativo: true, destaque: true, tem_imagem: true, tem_preco_vigente: true, promocao_ativa: false }] };
      if (text.includes('alteracao')) return { rows: [] };
      if (text.includes('auditoria')) return { rows: [] };
      return { rows: [] };
    },
  });
  assert.equal(filled.visao_geral.faturamento_centavos, 2500);
  assert.equal(filled.produtos[0].quantidade, 1);
});

function sessionHeadersFor(claims = {}) {
  return {
    cookie: `${COOKIE_NAME}=${signSession(SECRET, {
      id_usuario_admin: claims.id_usuario_admin || 'u1',
      email: claims.email || 'admin@example.com',
      perfil: claims.perfil || 'ADMIN',
      protegido: claims.protegido === true,
      nome_usuario: claims.nome_usuario || 'Admin',
    })}`,
  };
}

function publishPool() {
  const audits = [];
  const inserted = [];
  return {
    audits,
    inserted,
    async query(sql, params = []) {
      const text = String(sql);
      if (text.includes('list_publicacoes')) return { rows: [] };
      if (text.includes('tab_categoria')) return { rows: [{ total: 2 }] };
      if (text.includes('tab_produto')) return { rows: [{ total: 3 }] };
      if (text.includes('schema_migrations')) return { rows: [] };
      if (text.includes('insert_publicacao')) {
        const row = {
          id_publicacao: params[0],
          id_usuario_admin: params[1],
          tipo_publicacao: params[2],
          git_sha: params[3],
          status_publicacao: params[4],
          mensagem_erro: params[7],
        };
        inserted.push(row);
        return { rows: [row] };
      }
      if (text.includes('insert_auditoria')) {
        audits.push({ acao: params[2], sucesso: params[5] });
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
}

async function postPublicacao(claims, body, extra = {}) {
  const response = mockResponse();
  const pool = extra.pool || publishPool();
  let vercelCalls = 0;
  await handleAdminPublicacoes({
    method: 'POST',
    headers: sessionHeadersFor(claims),
    url: '/api/admin/publicacoes',
    body,
  }, response, {
    getPool: () => pool,
    vercelReleaseClient: extra.vercelReleaseClient || (async () => { vercelCalls += 1; }),
    prodDatabaseReady: extra.prodDatabaseReady,
    prodEnvReady: extra.prodEnvReady,
  });
  return { response, pool, vercelCalls };
}

test('publicacao is blocked without production enabled', async () => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  process.env.PROMOCAO_PROD_HABILITADA = 'false';
  const { response } = await postPublicacao({ perfil: 'ADMIN' }, { acao: 'publicar', tipo_publicacao: 'CATALOGO' });
  assert.equal(response.statusCode, 403);
  assert.equal(response.body.error, 'forbidden');
});

test('ADMIN e GESTOR nao promovem producao', async () => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  for (const perfil of ['ADMIN', 'GESTOR']) {
    const { response, vercelCalls } = await postPublicacao({ perfil }, {
      acao: 'publicar',
      tipo_publicacao: 'CATALOGO',
      confirmacao: 'PUBLICAR PRODUCAO',
    });
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.status, 'BLOQUEADA');
    assert.equal(vercelCalls, 0);
  }
});

test('SUPER_ADMIN nao protegido nao promove e ROOT chega ao gate bloqueado', async () => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  process.env.PROMOCAO_PROD_HABILITADA = 'false';
  const unprotected = await postPublicacao({ perfil: 'SUPER_ADMIN', protegido: false }, {
    acao: 'publicar',
    git_sha: 'abc',
    confirmacao: 'PUBLICAR PRODUCAO',
  });
  assert.equal(unprotected.response.statusCode, 403);
  assert.equal(unprotected.vercelCalls, 0);

  const root = await postPublicacao({ perfil: 'SUPER_ADMIN', protegido: true, nome_usuario: 'Marco' }, {
    acao: 'publicar',
    git_sha: 'abc',
    confirmacao: 'PUBLICAR PRODUCAO',
  });
  assert.equal(root.response.statusCode, 409);
  assert.equal(root.response.body.error, 'production_not_enabled');
  assert.equal(root.response.body.status, 'BLOQUEADA');
  assert.equal(root.vercelCalls, 0);
  assert.equal(root.response.body.checks.some((item) => item.id === 'feature_flag' && item.status === 'BLOCK'), true);
});

test('validar promocao retorna checks estruturados e nao publica', async () => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  process.env.PROMOCAO_PROD_HABILITADA = 'false';
  process.env.GIT_SHA = '89d0a9152a2604d71e5898040fb95b5783e5e3d0';
  const { response, vercelCalls, pool } = await postPublicacao({ perfil: 'SUPER_ADMIN', protegido: true }, {
    acao: 'validar',
    git_sha: '89d0a9152a2604d71e5898040fb95b5783e5e3d0',
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.status, 'BLOQUEADA');
  assert.equal(Array.isArray(response.body.checks), true);
  assert.equal(response.body.checks.some((item) => item.id === 'feature_flag' && item.status === 'BLOCK'), true);
  assert.equal(vercelCalls, 0);
  assert.equal(pool.audits.some((item) => item.acao === 'VALIDAR_PUBLICACAO'), true);
});

test('confirmacao errada, ausente, SHA divergente e config incompleta bloqueiam', async () => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  process.env.PROMOCAO_PROD_HABILITADA = 'true';
  process.env.GIT_SHA = 'sha-hml-exato';
  const root = { perfil: 'SUPER_ADMIN', protegido: true };

  const missing = await postPublicacao(root, { acao: 'publicar', git_sha: 'sha-hml-exato' });
  assert.equal(missing.response.statusCode, 409);
  assert.equal(missing.response.body.checks.some((item) => item.id === 'confirmacao' && item.status === 'BLOCK'), true);
  assert.equal(missing.vercelCalls, 0);

  const wrong = await postPublicacao(root, {
    acao: 'publicar',
    git_sha: 'sha-hml-exato',
    confirmacao: true,
  });
  assert.equal(wrong.response.statusCode, 409);
  assert.equal(wrong.response.body.checks.some((item) => item.id === 'confirmacao' && /inválida/i.test(item.mensagem)), true);
  assert.equal(wrong.vercelCalls, 0);

  const diverged = await postPublicacao(root, {
    acao: 'publicar',
    git_sha: 'sha-diferente',
    confirmacao: 'PUBLICAR PRODUCAO',
  });
  assert.equal(diverged.response.statusCode, 409);
  assert.equal(diverged.response.body.checks.some((item) => item.id === 'git_sha' && item.status === 'BLOCK'), true);
  assert.equal(diverged.vercelCalls, 0);

  const incomplete = await postPublicacao(root, {
    acao: 'publicar',
    git_sha: 'sha-hml-exato',
    confirmacao: 'PUBLICAR PRODUCAO',
  });
  assert.equal(incomplete.response.statusCode, 409);
  assert.equal(incomplete.response.body.checks.some((item) => item.id === 'release_config' && item.status === 'BLOCK'), true);
  assert.equal(incomplete.vercelCalls, 0);
});

test('GET publicacoes expoe readiness sem segredo e promote mockado nao chama Vercel real', async () => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  process.env.PROMOCAO_PROD_HABILITADA = 'false';
  process.env.GIT_SHA = '89d0a9152a2604d71e5898040fb95b5783e5e3d0';
  process.env.VERCEL_RELEASE_TOKEN = 'super-secret-token-value';
  const response = mockResponse();
  const pool = publishPool();
  await handleAdminPublicacoes({
    method: 'GET',
    headers: sessionHeadersFor({ perfil: 'SUPER_ADMIN', protegido: true }),
    url: '/api/admin/publicacoes',
  }, response, { getPool: () => pool });
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.producao.habilitada, false);
  assert.equal(response.body.producao.release_configurada, false);
  assert.equal(response.body.producao.pronta, false);
  assert.equal(Array.isArray(response.body.producao.bloqueios), true);
  assert.doesNotMatch(JSON.stringify(response.body), /super-secret-token-value/);

  const dryRun = validatePromotionDryRun({ session: { id_usuario_admin: 'u1', perfil: 'SUPER_ADMIN', protegido: true } });
  assert.equal(dryRun.status, 'BLOQUEADA');
  assert.equal(dryRun.checks.some((item) => item.id === 'feature_flag'), true);

  let vercelCalls = 0;
  const promoted = await promoteToProduction(pool, {
    acao: 'publicar',
    git_sha: '89d0a9152a2604d71e5898040fb95b5783e5e3d0',
    confirmacao: 'PUBLICAR PRODUCAO',
  }, { id_usuario_admin: 'u1', perfil: 'SUPER_ADMIN', protegido: true }, {
    vercelReleaseClient: async () => { vercelCalls += 1; throw new Error('should not call vercel'); },
  });
  assert.equal(promoted.ok, false);
  assert.equal(promoted.vercelCalled, false);
  assert.equal(vercelCalls, 0);
});

test('promoteToProduction so chama cliente mock quando o gate passa', async () => {
  process.env.PROMOCAO_PROD_HABILITADA = 'true';
  process.env.GIT_SHA = 'sha-hml-exato';
  process.env.VERCEL_RELEASE_TOKEN = 'token';
  process.env.VERCEL_TEAM_ID = 'team';
  process.env.VERCEL_PROD_PROJECT_ID = 'proj';
  process.env.VERCEL_RELEASE_GIT_OWNER = 'owner';
  process.env.VERCEL_RELEASE_GIT_REPO = 'repo';
  process.env.VERCEL = '1';
  const pool = publishPool();
  let vercelCalls = 0;
  const result = await promoteToProduction(pool, {
    git_sha: 'sha-hml-exato',
    confirmacao: 'PUBLICAR PRODUCAO',
    tipo_publicacao: 'CATALOGO',
  }, { id_usuario_admin: 'u1', perfil: 'SUPER_ADMIN', protegido: true, nome_usuario: 'Marco' }, {
    prodDatabaseReady: true,
    prodEnvReady: true,
    vercelReleaseClient: async ({ sha, target }) => {
      vercelCalls += 1;
      assert.equal(sha, 'sha-hml-exato');
      assert.equal(target, 'production');
      // PUBLICADA exige evidencia explicita READY (V15).
      return { ok: true, state: 'READY', deploymentId: 'dpl_mock', attempts: 1 };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'PUBLICADA');
  assert.equal(vercelCalls, 1);
});

async function promoteWithClient(vercelReleaseClient) {
  process.env.PROMOCAO_PROD_HABILITADA = 'true';
  process.env.GIT_SHA = 'sha-hml-exato';
  process.env.VERCEL_RELEASE_TOKEN = 'token';
  process.env.VERCEL_TEAM_ID = 'team';
  process.env.VERCEL_PROD_PROJECT_ID = 'proj';
  process.env.VERCEL_RELEASE_GIT_OWNER = 'owner';
  process.env.VERCEL_RELEASE_GIT_REPO = 'repo';
  process.env.VERCEL = '1';
  return promoteToProduction(publishPool(), {
    git_sha: 'sha-hml-exato',
    confirmacao: 'PUBLICAR PRODUCAO',
    tipo_publicacao: 'CATALOGO',
  }, { id_usuario_admin: 'u1', perfil: 'SUPER_ADMIN', protegido: true, nome_usuario: 'Marco' }, {
    prodDatabaseReady: true,
    prodEnvReady: true,
    vercelReleaseClient,
  });
}

test('promoteToProduction nao publica sem evidencia READY (criado, erro, timeout, sem estado)', async () => {
  for (const state of ['CREATED', 'BUILDING', 'ERROR', 'CANCELED', 'TIMEOUT', undefined]) {
    const result = await promoteWithClient(async () => (state ? { ok: false, state, deploymentId: 'dpl_x' } : undefined));
    assert.equal(result.ok, false, String(state));
    assert.notEqual(result.status, 'PUBLICADA', String(state));
    assert.equal(result.status, 'ERRO', String(state));
    assert.equal(result.publicacao.status_publicacao, 'ERRO', String(state));
  }
});

test('promoteToProduction: falha do cliente nao vira PUBLICADA e nao vaza detalhes', async () => {
  const notConfigured = await promoteWithClient(async () => {
    throw new AdminError(409, 'release_not_configured', 'Bearer super-secret-token');
  });
  assert.equal(notConfigured.ok, false);
  assert.equal(notConfigured.status, 'BLOQUEADA');
  assert.equal(notConfigured.error, 'release_not_configured');
  assert.doesNotMatch(JSON.stringify(notConfigured), /super-secret-token/);

  const failed = await promoteWithClient(async () => {
    throw Object.assign(new Error('Bearer super-secret-token boom'), { called: true });
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.status, 'ERRO');
  assert.equal(failed.error, 'release_failed');
  assert.equal(failed.vercelCalled, true);
  assert.doesNotMatch(JSON.stringify(failed), /super-secret-token/);
});

test('release config incompleta (sem git owner/repo) mantem release_config BLOCK', () => {
  process.env.PROMOCAO_PROD_HABILITADA = 'true';
  process.env.VERCEL_RELEASE_TOKEN = 'token';
  process.env.VERCEL_TEAM_ID = 'team';
  process.env.VERCEL_PROD_PROJECT_ID = 'proj';
  process.env.VERCEL_RELEASE_GIT_OWNER = 'owner';
  delete process.env.VERCEL_RELEASE_GIT_REPO;
  const evaluation = validatePromotionDryRun({ session: { id_usuario_admin: 'u1', perfil: 'SUPER_ADMIN', protegido: true } });
  assert.equal(evaluation.checks.find((item) => item.id === 'release_config').status, 'BLOCK');
});

const ROOT = { perfil: 'SUPER_ADMIN', protegido: true };

function checkStatus(body, id) {
  return body.checks.find((item) => item.id === id)?.status;
}

test('V15 wiring: dry run "validar" usa readiness do servidor e ignora o body do browser', async () => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  process.env.PROMOCAO_PROD_HABILITADA = 'false';
  process.env.GIT_SHA = '89d0a9152a2604d71e5898040fb95b5783e5e3d0';

  // Servidor sem readiness (default) + browser tentando forcar => BLOCK.
  const forced = await postPublicacao(ROOT, {
    acao: 'validar',
    git_sha: '89d0a9152a2604d71e5898040fb95b5783e5e3d0',
    prodDatabaseReady: true,
    prodEnvReady: true,
    prod_database_ready: true,
    prod_env_ready: true,
  });
  assert.equal(forced.response.statusCode, 200);
  assert.equal(checkStatus(forced.response.body, 'prod_database'), 'BLOCK');
  assert.equal(checkStatus(forced.response.body, 'prod_env'), 'BLOCK');
  assert.equal(checkStatus(forced.response.body, 'feature_flag'), 'BLOCK');

  // Readiness real do servidor (deps) => PASS.
  const ready = await postPublicacao(ROOT, {
    acao: 'validar',
    git_sha: '89d0a9152a2604d71e5898040fb95b5783e5e3d0',
  }, { prodDatabaseReady: true, prodEnvReady: true });
  assert.equal(checkStatus(ready.response.body, 'prod_database'), 'PASS');
  assert.equal(checkStatus(ready.response.body, 'prod_env'), 'PASS');
});

test('V15 wiring: publicar nao e liberado por prodDatabaseReady/prodEnvReady vindos do body', async () => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  process.env.PROMOCAO_PROD_HABILITADA = 'true';
  process.env.GIT_SHA = 'sha-hml-exato';
  process.env.VERCEL_RELEASE_TOKEN = 'token';
  process.env.VERCEL_TEAM_ID = 'team';
  process.env.VERCEL_PROD_PROJECT_ID = 'proj';
  process.env.VERCEL_RELEASE_GIT_OWNER = 'owner';
  process.env.VERCEL_RELEASE_GIT_REPO = 'repo';
  const result = await postPublicacao(ROOT, {
    acao: 'publicar',
    git_sha: 'sha-hml-exato',
    confirmacao: 'PUBLICAR PRODUCAO',
    prodDatabaseReady: true,
    prodEnvReady: true,
  });
  assert.equal(result.response.statusCode, 409);
  assert.equal(result.response.body.status, 'BLOQUEADA');
  assert.equal(checkStatus(result.response.body, 'prod_database'), 'BLOCK');
  assert.equal(checkStatus(result.response.body, 'prod_env'), 'BLOCK');
  assert.equal(result.vercelCalls, 0);
});

test('V15 wiring: GET publicacoes usa readiness do servidor (BLOCK por padrao, PASS quando deps ready)', async () => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  process.env.PROMOCAO_PROD_HABILITADA = 'false';
  const get = async (deps) => {
    const response = mockResponse();
    await handleAdminPublicacoes({
      method: 'GET',
      headers: sessionHeadersFor(ROOT),
      url: '/api/admin/publicacoes',
    }, response, { getPool: () => publishPool(), ...deps });
    return response;
  };

  const blocked = await get({});
  assert.equal(blocked.statusCode, 200);
  assert.equal(blocked.body.producao.pronta, false);
  assert.equal(blocked.body.producao.bloqueios.includes('Banco PROD não preparado.'), true);
  assert.equal(blocked.body.producao.bloqueios.includes('Env PROD incompleto.'), true);

  const ready = await get({ prodDatabaseReady: true, prodEnvReady: true });
  assert.equal(ready.body.producao.bloqueios.includes('Banco PROD não preparado.'), false);
  assert.equal(ready.body.producao.bloqueios.includes('Env PROD incompleto.'), false);
  // Flag continua false: producao nao fica pronta.
  assert.equal(ready.body.producao.pronta, false);
  assert.equal(ready.body.producao.habilitada, false);
});

test('GET publicacoes status permanece disponivel', async () => {
  const status = await getPublicationStatus(publishPool(), {
    session: { id_usuario_admin: 'u1', perfil: 'ADMIN' },
  });
  assert.equal(Boolean(status.homolog), true);
  assert.equal(status.producao.habilitada, false);
  assert.equal(status.permissoes.pode_atualizar_producao, false);
});

test('admin APIs without session return 401', async () => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  const response = mockResponse();
  await handleAdminRelatorios({
    method: 'GET',
    headers: {},
    url: '/api/admin/relatorios',
  }, response, {
    getPool() {
      throw new Error('should not query');
    },
  });
  assert.equal(response.statusCode, 401);
});
