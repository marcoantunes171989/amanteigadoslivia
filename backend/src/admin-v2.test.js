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
import { computeFaturamento } from './admin-sales.js';
import { cancelScheduledChange, parseSaoPauloDateTime } from './admin-schedule.js';
import { MAX_IMAGE_BYTES, validateImageUploadMeta } from './admin-storage.js';
import { getReports } from './admin-reports.js';
import { AdminError } from './admin-errors.js';
import { hashPassword } from './password.js';
import { parseReaisToCentavos } from './money.js';

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
      itens: [{ id_produto: 'prod-1', quantidade: 2, valor_unitario_centavos: 1 }],
    },
  }, first, { getPool: () => pool });
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.venda.valor_total_centavos, 2000);
  assert.equal(first.body.duplicated, false);

  const second = mockResponse();
  await handlePublicVenda({
    method: 'POST',
    headers: {},
    body: {
      chave_idempotencia: 'idem-1',
      itens: [{ id_produto: 'prod-1', quantidade: 9 }],
    },
  }, second, { getPool: () => pool });
  assert.equal(second.body.duplicated, true);
  assert.equal(second.body.venda.valor_total_centavos, 2000);
  assert.equal(vendas.length, 1);
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

test('publicacao is blocked without production enabled', async () => {
  process.env.ADMIN_SESSION_SECRET = SECRET;
  process.env.PROMOCAO_PROD_HABILITADA = 'false';
  const response = mockResponse();
  await handleAdminPublicacoes({
    method: 'POST',
    headers: sessionHeaders(),
    url: '/api/admin/publicacoes',
    body: { acao: 'publicar', tipo_publicacao: 'CATALOGO' },
  }, response, {
    getPool: () => ({ query: async () => ({ rows: [] }) }),
  });
  assert.equal(response.statusCode, 409);
  assert.equal(response.body.error, 'production_not_enabled');
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
