import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  filterRowsByEmpresaIds,
  listIdsByEmpresa,
  resetEmpresaVinculosCacheForTests,
} from './empresa-scope.js';

test('filterRowsByEmpresaIds: null allowedIds mantém todas as linhas', () => {
  const rows = [{ id_produto: '1' }, { id_produto: '2' }];
  assert.deepEqual(filterRowsByEmpresaIds(rows, 'id_produto', null), rows);
});

test('filterRowsByEmpresaIds: Set vazio isola tudo', () => {
  const rows = [{ id_produto: '1' }];
  assert.deepEqual(filterRowsByEmpresaIds(rows, 'id_produto', new Set()), []);
});

test('listIdsByEmpresa: tabela inexistente => null (legado)', async () => {
  resetEmpresaVinculosCacheForTests();
  const queryable = {
    async query() {
      return { rows: [] };
    },
  };
  const ids = await listIdsByEmpresa(queryable, 'tab_produto_empresa', 'id_produto', 'a0000000-0000-4000-8000-000000000001');
  assert.equal(ids, null);
});

test('listIdsByEmpresa: tabela vazia (sem backfill) => null', async () => {
  resetEmpresaVinculosCacheForTests();
  let step = 0;
  const queryable = {
    async query(sql) {
      step += 1;
      if (String(sql).includes('information_schema.tables')) {
        return { rows: [{ '?column?': 1 }] };
      }
      if (String(sql).includes('WHERE id_empresa')) {
        return { rows: [] };
      }
      if (String(sql).includes('LIMIT 1')) {
        return { rows: [] }; // nenhuma linha na tabela
      }
      return { rows: [] };
    },
  };
  const ids = await listIdsByEmpresa(queryable, 'tab_produto_empresa', 'id_produto', 'a0000000-0000-4000-8000-000000000001');
  assert.equal(ids, null);
  assert.ok(step >= 3);
});

test('listIdsByEmpresa: empresa nova sem produtos (tabela já populada) => Set vazio', async () => {
  resetEmpresaVinculosCacheForTests();
  const queryable = {
    async query(sql) {
      if (String(sql).includes('information_schema.tables')) {
        return { rows: [{ '?column?': 1 }] };
      }
      if (String(sql).includes('WHERE id_empresa')) {
        return { rows: [] };
      }
      if (String(sql).includes('LIMIT 1')) {
        return { rows: [{ '?column?': 1 }] }; // outras empresas já têm vínculo
      }
      return { rows: [] };
    },
  };
  const ids = await listIdsByEmpresa(queryable, 'tab_produto_empresa', 'id_produto', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  assert.ok(ids instanceof Set);
  assert.equal(ids.size, 0);
});

test('listIdsByEmpresa: retorna ids da empresa', async () => {
  resetEmpresaVinculosCacheForTests();
  const queryable = {
    async query(sql) {
      if (String(sql).includes('information_schema.tables')) {
        return { rows: [{ '?column?': 1 }] };
      }
      return { rows: [{ id: 'p1' }, { id: 'p2' }] };
    },
  };
  const ids = await listIdsByEmpresa(queryable, 'tab_produto_empresa', 'id_produto', 'a0000000-0000-4000-8000-000000000001');
  assert.deepEqual([...ids].sort(), ['p1', 'p2']);
});
