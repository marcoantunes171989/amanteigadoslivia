import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DATA_LOAD_ERROR_MESSAGE,
  canAccessUsuarios,
  creatablePerfisFor,
  decideBootAction,
  decideCatalogLoadAction,
  decideSessionErrorAction,
  perfilBadgeLabel,
} from '../../admin-session-ui.js';

test('sessao 200 abre o painel e 401 vai para login', () => {
  assert.equal(decideBootAction(200), 'app');
  assert.equal(decideBootAction(401), 'login');
  assert.equal(decideBootAction(500), 'retry');
});

test('catalogo 500 com sessao valida nao desloga', () => {
  assert.equal(decideCatalogLoadAction(500), 'retry');
  assert.equal(decideCatalogLoadAction(502), 'retry');
  assert.equal(decideCatalogLoadAction(503), 'retry');
  assert.equal(decideSessionErrorAction(500), 'retry');
  assert.notEqual(decideCatalogLoadAction(500), 'login');
  assert.equal(DATA_LOAD_ERROR_MESSAGE, 'Não foi possível carregar os dados agora.');
});

test('catalogo 401 desloga', () => {
  assert.equal(decideCatalogLoadAction(401), 'login');
  assert.equal(decideSessionErrorAction(401), 'login');
});

test('403 e 429 nao deslogam', () => {
  assert.equal(decideSessionErrorAction(403), 'forbidden');
  assert.equal(decideSessionErrorAction(429), 'rate_limit');
});

test('ROOT cria Super Admin, ADMIN e Gerente; GESTOR nao cria', () => {
  assert.deepEqual(creatablePerfisFor({ perfil: 'SUPER_ADMIN', protegido: true }), ['SUPER_ADMIN', 'ADMIN', 'GESTOR']);
  assert.deepEqual(creatablePerfisFor({ perfil: 'SUPER_ADMIN', protegido: false }), ['ADMIN', 'GESTOR']);
  assert.deepEqual(creatablePerfisFor({ perfil: 'ADMIN' }), ['GESTOR']);
  assert.deepEqual(creatablePerfisFor({ perfil: 'GESTOR' }), []);
  assert.equal(canAccessUsuarios({ perfil: 'GESTOR' }), false);
  assert.equal(canAccessUsuarios({ perfil: 'ADMIN' }), true);
});

test('badges visuais de perfil', () => {
  assert.equal(perfilBadgeLabel('SUPER_ADMIN'), 'SUPER ADMIN');
  assert.equal(perfilBadgeLabel('ADMIN'), 'ADMINISTRADOR');
  assert.equal(perfilBadgeLabel('GESTOR'), 'GERENTE');
});
