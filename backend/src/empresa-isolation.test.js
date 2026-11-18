import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterRowsByEmpresaIds } from './empresa-scope.js';

test('isolamento: produtos de empresas distintas nunca se misturam no filtro', () => {
  const norte = [
    { id_produto: 'n1', nome: 'Pão de Queijo' },
    { id_produto: 'n2', nome: 'Croissant' },
  ];
  const aurora = [
    { id_produto: 'a1', nome: 'Cookie' },
    { id_produto: 'a2', nome: 'Brownie' },
  ];
  const livia = [
    { id_produto: 'l1', nome: 'Amanteigado' },
  ];
  const all = [...norte, ...aurora, ...livia];

  const onlyNorte = filterRowsByEmpresaIds(all, 'id_produto', new Set(['n1', 'n2']));
  const onlyAurora = filterRowsByEmpresaIds(all, 'id_produto', new Set(['a1', 'a2']));
  const onlyLivia = filterRowsByEmpresaIds(all, 'id_produto', new Set(['l1']));

  assert.deepEqual(onlyNorte.map((p) => p.id_produto), ['n1', 'n2']);
  assert.deepEqual(onlyAurora.map((p) => p.id_produto), ['a1', 'a2']);
  assert.deepEqual(onlyLivia.map((p) => p.id_produto), ['l1']);

  const norteIds = new Set(onlyNorte.map((p) => p.id_produto));
  const auroraIds = new Set(onlyAurora.map((p) => p.id_produto));
  for (const id of norteIds) assert.equal(auroraIds.has(id), false);
});

test('isolamento: Set vazio não vaza catálogo global', () => {
  const rows = [{ id_produto: 'x' }, { id_produto: 'y' }];
  assert.deepEqual(filterRowsByEmpresaIds(rows, 'id_produto', new Set()), []);
});
