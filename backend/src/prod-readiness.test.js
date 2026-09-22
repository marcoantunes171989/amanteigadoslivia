import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withServerReleaseDeps } from '../../api/admin-router.js';
import {
  getProdReadiness,
  isProdDatabaseReady,
  isProdEnvReady,
} from './prod-readiness.js';

test('PROD_DATABASE_READY: default false; somente a string exata "true" e ready', () => {
  assert.equal(isProdDatabaseReady({}), false);
  assert.equal(isProdDatabaseReady({ PROD_DATABASE_READY: 'false' }), false);
  assert.equal(isProdDatabaseReady({ PROD_DATABASE_READY: 'true' }), true);
  // Decisao documentada: "TRUE", " true " e demais valores NAO liberam (fail-closed, exato).
  for (const value of ['TRUE', 'True', ' true', 'true ', '1', 'yes', 'on', '', 'null', 'tru']) {
    assert.equal(isProdDatabaseReady({ PROD_DATABASE_READY: value }), false, JSON.stringify(value));
  }
});

test('PROD_ENV_READY: mesma regra, independente da database', () => {
  assert.equal(isProdEnvReady({}), false);
  assert.equal(isProdEnvReady({ PROD_ENV_READY: 'false' }), false);
  assert.equal(isProdEnvReady({ PROD_ENV_READY: 'true' }), true);
  for (const value of ['TRUE', ' true ', '1', 'yes']) {
    assert.equal(isProdEnvReady({ PROD_ENV_READY: value }), false, JSON.stringify(value));
  }
  assert.deepEqual(getProdReadiness({ PROD_ENV_READY: 'true' }), { prodDatabaseReady: false, prodEnvReady: true });
  assert.deepEqual(getProdReadiness({ PROD_DATABASE_READY: 'true' }), { prodDatabaseReady: true, prodEnvReady: false });
});

test('VERCEL_RELEASE_TOKEN (ou qualquer outra env) nao implica readiness', () => {
  const env = {
    VERCEL_RELEASE_TOKEN: 'tok',
    VERCEL_TEAM_ID: 'team',
    VERCEL_PROD_PROJECT_ID: 'proj',
    PROMOCAO_PROD_HABILITADA: 'true',
    DATABASE_HOST: 'x',
  };
  assert.deepEqual(getProdReadiness(env), { prodDatabaseReady: false, prodEnvReady: false });
});

test('router: deps de release vem do servidor (default false) e o cliente e sempre funcao', () => {
  const deps = withServerReleaseDeps({ getPool: () => null }, {});
  assert.equal(deps.prodDatabaseReady, false);
  assert.equal(deps.prodEnvReady, false);
  assert.equal(typeof deps.vercelReleaseClient, 'function');
  assert.equal(typeof deps.getPool, 'function');

  const ready = withServerReleaseDeps({}, { PROD_DATABASE_READY: 'true', PROD_ENV_READY: 'true' });
  assert.equal(ready.prodDatabaseReady, true);
  assert.equal(ready.prodEnvReady, true);
});

test('router: deps explicitos (injecao de teste) tem precedencia sobre o env', () => {
  const client = async () => ({});
  const deps = withServerReleaseDeps(
    { prodDatabaseReady: true, prodEnvReady: false, vercelReleaseClient: client },
    { PROD_DATABASE_READY: 'false', PROD_ENV_READY: 'true' },
  );
  assert.equal(deps.prodDatabaseReady, true);
  assert.equal(deps.prodEnvReady, false);
  assert.equal(deps.vercelReleaseClient, client);
});

test('router: cliente real default e fail-closed (flag ausente => zero fetch)', async () => {
  let fetchCalls = 0;
  // O cliente default captura o fetch global na criacao; sem a flag ele nunca o usa.
  const original = globalThis.fetch;
  globalThis.fetch = async () => { fetchCalls += 1; throw new Error('nao deveria chamar fetch'); };
  try {
    const deps = withServerReleaseDeps({}, {});
    await assert.rejects(
      () => deps.vercelReleaseClient({ sha: 'a'.repeat(40), target: 'production' }),
      (error) => error.code === 'production_not_enabled',
    );
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(fetchCalls, 0);
});
