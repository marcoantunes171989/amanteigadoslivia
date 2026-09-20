import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapCatalogRows } from './catalog.js';

test('maps Portuguese catalog rows to the current frontend shape', () => {
  const payload = mapCatalogRows({
    categories: [{
      id_categoria: '0c1a5510-c1a5-4000-8000-000000000001',
      nome_categoria: 'Clássicos',
      slug_categoria: 'classicos',
      ordem_exibicao: 10,
      ativo: true,
    }],
    products: [{
      id_produto: '0f00d070-0001-4000-8000-000000000006',
      id_categoria: '0c1a5510-c1a5-4000-8000-000000000001',
      nome_produto: 'Amanteigado Mesclado',
      slug_produto: 'mesclado',
      descricao_produto: 'Produto demonstrativo com promoção.',
      destaque: true,
      ativo: true,
      ordem_exibicao: 60,
    }],
    images: [{
      id_imagem: '1f1a9e10-0001-4000-8000-000000000006',
      id_produto: '0f00d070-0001-4000-8000-000000000006',
      url_imagem: 'assets/demo-products/mesclado.svg',
      texto_alternativo: 'Amanteigado Mesclado',
      ordem_exibicao: 0,
      principal: true,
    }],
    prices: [
      {
        id_preco: '9f1ce010-0001-4000-8000-000000000006',
        id_produto: '0f00d070-0001-4000-8000-000000000006',
        valor_centavos: 2490,
        promocional: false,
        inicio_vigencia: null,
        fim_vigencia: null,
        ativo: true,
        data_criacao: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id_preco: '9f1ce010-0001-4000-8000-000000000009',
        id_produto: '0f00d070-0001-4000-8000-000000000006',
        valor_centavos: 2190,
        promocional: true,
        inicio_vigencia: null,
        fim_vigencia: null,
        ativo: true,
        data_criacao: new Date('2026-01-01T00:00:00Z'),
      },
    ],
  });

  assert.equal(payload.mode, 'live');
  assert.equal(payload.categories[0].id, '0c1a5510-c1a5-4000-8000-000000000001');
  assert.equal(payload.categories[0].name, 'Clássicos');
  assert.equal(payload.products[0].categoryId, '0c1a5510-c1a5-4000-8000-000000000001');
  assert.equal(payload.products[0].price, 24.9);
  assert.equal(payload.products[0].promotionalPrice, 21.9);
  assert.equal(payload.products[0].image, 'assets/demo-products/mesclado.svg');
  assert.equal(payload.products[0].featured, true);
});

test('catalog payload uses one data query before revision', async () => {
  const calls = [];
  const queryable = {
    async query(sql) {
      calls.push(String(sql));
      if (String(sql).includes('json_agg')) {
        return {
          rows: [{
            categories: [{
              id_categoria: '0c1a5510-c1a5-4000-8000-000000000001',
              nome_categoria: 'Clássicos',
              slug_categoria: 'classicos',
              ordem_exibicao: 10,
              ativo: true,
            }],
            products: [],
            images: [],
            prices: [],
          }],
        };
      }
      return { rows: [{ revisao: new Date('2026-01-01T00:00:00Z'), proxima_atualizacao: null }] };
    },
  };
  const { getCatalogPayload } = await import('./catalog.js');
  const payload = await getCatalogPayload(queryable);
  assert.equal(payload.categories.length, 1);
  assert.equal(calls.filter((sql) => sql.includes('json_agg')).length, 1);
});
