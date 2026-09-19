import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createCategoria,
  createProduto,
  executeAdminAction,
  getAdminCatalog,
  setCategoriaAtivo,
  setProdutoAtivo,
  setProdutoDestaque,
  updateCategoria,
  updateProduto,
} from './admin-catalog.js';
import { AdminError } from './admin-errors.js';

function op(sql) {
  const match = String(sql).match(/-- op:([a-z_]+)/);
  return match ? match[1] : String(sql).trim().split(/\s+/)[0].toUpperCase();
}

function createMemoryPool() {
  const data = {
    categorias: [],
    produtos: [],
    imagens: [],
    precos: [],
  };
  let clock = 0;

  function nextTime() {
    clock += 1;
    return new Date(1_700_000_000_000 + clock);
  }

  function duplicateSlug(table, field, value, exceptId, idField) {
    return table.some((row) => row[field] === value && row[idField] !== exceptId);
  }

  function exec(sql, params = []) {
    const name = op(sql);
    if (name === 'BEGIN' || name === 'COMMIT' || name === 'ROLLBACK') {
      return { rows: [] };
    }

    switch (name) {
      case 'list_categorias':
        return { rows: data.categorias.slice().sort((a, b) => a.ordem_exibicao - b.ordem_exibicao) };
      case 'list_produtos':
        return { rows: data.produtos.slice() };
      case 'list_imagens':
        return { rows: data.imagens.slice() };
      case 'list_precos':
        return { rows: data.precos.slice() };
      case 'get_categoria': {
        const row = data.categorias.find((item) => item.id_categoria === params[0]);
        return { rows: row ? [row] : [] };
      }
      case 'insert_categoria': {
        if (duplicateSlug(data.categorias, 'slug_categoria', params[2], null, 'id_categoria')) {
          const error = new Error('duplicate key');
          error.code = '23505';
          throw error;
        }
        const row = {
          id_categoria: params[0],
          nome_categoria: params[1],
          slug_categoria: params[2],
          descricao_categoria: params[3],
          ordem_exibicao: params[4],
          ativo: params[5],
        };
        data.categorias.push(row);
        return { rows: [row] };
      }
      case 'update_categoria': {
        if (duplicateSlug(data.categorias, 'slug_categoria', params[2], params[0], 'id_categoria')) {
          const error = new Error('duplicate key');
          error.code = '23505';
          throw error;
        }
        const row = data.categorias.find((item) => item.id_categoria === params[0]);
        if (!row) return { rows: [] };
        row.nome_categoria = params[1];
        row.slug_categoria = params[2];
        row.descricao_categoria = params[3];
        row.ordem_exibicao = params[4];
        row.ativo = params[5];
        return { rows: [row] };
      }
      case 'set_categoria_ativo': {
        const row = data.categorias.find((item) => item.id_categoria === params[0]);
        if (!row) return { rows: [] };
        row.ativo = params[1];
        return { rows: [row] };
      }
      case 'get_produto': {
        const row = data.produtos.find((item) => item.id_produto === params[0]);
        return { rows: row ? [row] : [] };
      }
      case 'insert_produto': {
        if (duplicateSlug(data.produtos, 'slug_produto', params[3], null, 'id_produto')) {
          const error = new Error('duplicate key');
          error.code = '23505';
          throw error;
        }
        const row = {
          id_produto: params[0],
          id_categoria: params[1],
          nome_produto: params[2],
          slug_produto: params[3],
          descricao_produto: params[4],
          ativo: params[5],
          destaque: params[6],
          ordem_exibicao: params[7],
        };
        data.produtos.push(row);
        return { rows: [row] };
      }
      case 'update_produto': {
        if (duplicateSlug(data.produtos, 'slug_produto', params[3], params[0], 'id_produto')) {
          const error = new Error('duplicate key');
          error.code = '23505';
          throw error;
        }
        const row = data.produtos.find((item) => item.id_produto === params[0]);
        if (!row) return { rows: [] };
        row.id_categoria = params[1];
        row.nome_produto = params[2];
        row.slug_produto = params[3];
        row.descricao_produto = params[4];
        row.ativo = params[5];
        row.destaque = params[6];
        row.ordem_exibicao = params[7];
        return { rows: [row] };
      }
      case 'set_produto_ativo': {
        const row = data.produtos.find((item) => item.id_produto === params[0]);
        if (!row) return { rows: [] };
        row.ativo = params[1];
        return { rows: [row] };
      }
      case 'set_produto_destaque': {
        const row = data.produtos.find((item) => item.id_produto === params[0]);
        if (!row) return { rows: [] };
        row.destaque = params[1];
        return { rows: [row] };
      }
      case 'list_precos_produto':
        return {
          rows: data.precos
            .filter((item) => item.id_produto === params[0])
            .slice()
            .sort((a, b) => b.data_criacao - a.data_criacao),
        };
      case 'deactivate_precos': {
        for (const row of data.precos) {
          if (row.id_produto === params[0] && row.promocional === params[1] && row.ativo === true) {
            row.ativo = false;
          }
        }
        return { rows: [] };
      }
      case 'insert_preco': {
        const row = {
          id_preco: params[0],
          id_produto: params[1],
          valor_centavos: params[2],
          codigo_moeda: 'BRL',
          promocional: params[3],
          ativo: true,
          inicio_vigencia: null,
          fim_vigencia: null,
          data_criacao: nextTime(),
        };
        data.precos.push(row);
        return { rows: [row] };
      }
      case 'list_imagens_produto':
        return { rows: data.imagens.filter((item) => item.id_produto === params[0]) };
      case 'clear_principal': {
        for (const row of data.imagens) {
          if (row.id_produto === params[0] && row.principal === true) {
            row.principal = false;
          }
        }
        return { rows: [] };
      }
      case 'update_imagem': {
        const row = data.imagens.find((item) => item.id_imagem === params[0]);
        if (!row) return { rows: [] };
        row.url_imagem = params[1];
        row.texto_alternativo = params[2];
        row.principal = true;
        return { rows: [row] };
      }
      case 'set_imagem_principal_flag': {
        const row = data.imagens.find((item) => item.id_imagem === params[0]);
        if (!row) return { rows: [] };
        row.principal = true;
        if (params[1] != null) row.texto_alternativo = params[1];
        return { rows: [row] };
      }
      case 'insert_imagem': {
        const row = {
          id_imagem: params[0],
          id_produto: params[1],
          url_imagem: params[2],
          texto_alternativo: params[3],
          ordem_exibicao: 0,
          principal: true,
          data_criacao: nextTime(),
        };
        data.imagens.push(row);
        return { rows: [row] };
      }
      default:
        throw new Error(`unhandled sql op: ${name}`);
    }
  }

  return {
    data,
    query: async (sql, params) => exec(sql, params),
    connect: async () => ({
      query: async (sql, params) => exec(sql, params),
      release() {},
    }),
  };
}

test('creates, edits and deactivates a category without physical delete', async () => {
  const pool = createMemoryPool();
  const created = await createCategoria(pool, {
    nome: 'Clássicos',
    descricao: 'Receitas tradicionais',
    ordem: 10,
  });
  assert.equal(created.slug_categoria, 'classicos');
  assert.equal(created.ativo, true);

  const edited = await updateCategoria(pool, created.id_categoria, {
    nome: 'Clássicos da casa',
    slug: 'classicos-da-casa',
  });
  assert.equal(edited.nome_categoria, 'Clássicos da casa');
  assert.equal(edited.slug_categoria, 'classicos-da-casa');

  const disabled = await setCategoriaAtivo(pool, created.id_categoria, false);
  assert.equal(disabled.ativo, false);
  assert.equal(pool.data.categorias.length, 1);
});

test('rejects duplicate category slugs as conflict', async () => {
  const pool = createMemoryPool();
  await createCategoria(pool, { nome: 'Festas' });
  await assert.rejects(
    () => createCategoria(pool, { nome: 'Outra', slug: 'festas' }),
    (error) => error instanceof AdminError && error.status === 409 && error.code === 'conflict',
  );
});

test('creates a product with price, promotion and principal image', async () => {
  const pool = createMemoryPool();
  const categoria = await createCategoria(pool, { nome: 'Clássicos' });
  const produto = await createProduto(pool, {
    id_categoria: categoria.id_categoria,
    nome: 'Amanteigado Mesclado',
    descricao: 'Produto de teste',
    preco_normal: '24,90',
    preco_promocional: '21,90',
    promocao_ativa: true,
    url_imagem_principal: 'assets/demo-products/mesclado.svg',
    destaque: true,
  });

  const catalog = await getAdminCatalog(pool);
  assert.equal(catalog.resumo.produtos, 1);
  assert.equal(catalog.resumo.produtos_ativos, 1);
  assert.equal(catalog.resumo.produtos_destaque, 1);
  assert.equal(catalog.produtos[0].id_produto, produto.id_produto);
  assert.equal(catalog.produtos[0].preco_normal_centavos, 2490);
  assert.equal(catalog.produtos[0].preco_promocional_centavos, 2190);
  assert.equal(catalog.produtos[0].promocao_ativa, true);
  assert.equal(catalog.produtos[0].url_imagem_principal, 'assets/demo-products/mesclado.svg');
});

test('keeps price history when the regular price changes', async () => {
  const pool = createMemoryPool();
  const categoria = await createCategoria(pool, { nome: 'Clássicos' });
  const produto = await createProduto(pool, {
    id_categoria: categoria.id_categoria,
    nome: 'Amanteigado Tradicional',
    preco_normal: '24,90',
  });

  await updateProduto(pool, produto.id_produto, {
    preco_normal: '29,90',
  });

  const normalPrices = pool.data.precos.filter((item) => item.promocional === false);
  assert.equal(normalPrices.length, 2);
  assert.equal(normalPrices.filter((item) => item.ativo === true).length, 1);
  assert.equal(normalPrices.find((item) => item.ativo === true).valor_centavos, 2990);
  assert.equal(normalPrices.find((item) => item.ativo === false).valor_centavos, 2490);
});

test('replaces promotional price without overwriting history', async () => {
  const pool = createMemoryPool();
  const categoria = await createCategoria(pool, { nome: 'Clássicos' });
  const produto = await createProduto(pool, {
    id_categoria: categoria.id_categoria,
    nome: 'Amanteigado com cobertura',
    preco_normal: '32,00',
    preco_promocional: '28,00',
    promocao_ativa: true,
  });

  await updateProduto(pool, produto.id_produto, {
    preco_normal: '32,00',
    preco_promocional: '26,50',
    promocao_ativa: true,
  });

  const promoPrices = pool.data.precos.filter((item) => item.promocional === true);
  assert.equal(promoPrices.length, 2);
  assert.equal(promoPrices.filter((item) => item.ativo === true).length, 1);
  assert.equal(promoPrices.find((item) => item.ativo === true).valor_centavos, 2650);

  await updateProduto(pool, produto.id_produto, {
    preco_normal: '32,00',
    promocao_ativa: false,
  });
  assert.equal(pool.data.precos.filter((item) => item.promocional === true && item.ativo === true).length, 0);
});

test('updates the principal image inside a transaction', async () => {
  const pool = createMemoryPool();
  const categoria = await createCategoria(pool, { nome: 'Clássicos' });
  const produto = await createProduto(pool, {
    id_categoria: categoria.id_categoria,
    nome: 'Amanteigado de limão',
    preco_normal: '27,00',
    url_imagem_principal: 'assets/demo-products/limao.svg',
  });

  await updateProduto(pool, produto.id_produto, {
    url_imagem_principal: 'https://example.com/limao-novo.jpg',
  });

  assert.equal(pool.data.imagens.length, 1);
  assert.equal(pool.data.imagens[0].principal, true);
  assert.equal(pool.data.imagens[0].url_imagem, 'https://example.com/limao-novo.jpg');
});

test('activates, deactivates and toggles featured without deleting the product', async () => {
  const pool = createMemoryPool();
  const categoria = await createCategoria(pool, { nome: 'Clássicos' });
  const produto = await createProduto(pool, {
    id_categoria: categoria.id_categoria,
    nome: 'Amanteigado de ninho',
    preco_normal: '28,00',
  });

  await setProdutoDestaque(pool, produto.id_produto, true);
  await setProdutoAtivo(pool, produto.id_produto, false);
  const catalog = await getAdminCatalog(pool);
  assert.equal(catalog.produtos[0].destaque, true);
  assert.equal(catalog.produtos[0].ativo, false);
  assert.equal(pool.data.produtos.length, 1);
});

test('executeAdminAction routes category and product commands', async () => {
  const pool = createMemoryPool();
  const created = await executeAdminAction(pool, {
    recurso: 'categoria',
    acao: 'criar',
    dados: { nome: 'Presentes' },
  });
  const produto = await executeAdminAction(pool, {
    recurso: 'produto',
    acao: 'criar',
    dados: {
      id_categoria: created.categoria.id_categoria,
      nome: 'Caixa presente',
      preco_normal: '45,00',
    },
  });
  const featured = await executeAdminAction(pool, {
    recurso: 'produto',
    acao: 'destacar',
    id: produto.produto.id_produto,
  });
  assert.equal(featured.produto.destaque, true);
});
