import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDevAdminTarget, DevAdminTargetError } from './dev-admin-target.mjs';

const SECRET = 'SenhaDeTesteNaoReal-42';

const VALID_ENV = Object.freeze({
  DATABASE_HOST: '127.0.0.1',
  DATABASE_PORT: '5432',
  DATABASE_NAME: 'amanteigados_dev',
  DATABASE_USER: 'amanteigados_dev_app',
  DATABASE_PASSWORD: SECRET,
});

function withEnv(overrides) {
  const env = { ...VALID_ENV, ...overrides };
  for (const key of Object.keys(env)) {
    if (env[key] === undefined) delete env[key];
  }
  return env;
}

function assertRejected(env) {
  assert.throws(
    () => resolveDevAdminTarget(env),
    (error) => {
      assert.ok(error instanceof DevAdminTargetError);
      assert.equal(error.code, 'dev_target_rejected');
      assert.ok(!error.message.includes(SECRET), 'mensagem de erro nao pode conter a senha');
      return true;
    },
  );
}

test('aceita somente 127.0.0.1:5432/amanteigados_dev com usuario app', () => {
  const target = resolveDevAdminTarget(withEnv({}));
  assert.equal(target.host, '127.0.0.1');
  assert.equal(target.port, 5432);
  assert.equal(target.database, 'amanteigados_dev');
  assert.equal(target.user, 'amanteigados_dev_app');
  assert.equal(target.ssl, false);
  assert.ok(Object.isFrozen(target));
});

test('rejeita localhost', () => {
  assertRejected(withEnv({ DATABASE_HOST: 'localhost' }));
});

test('rejeita IPv6 loopback ::1', () => {
  assertRejected(withEnv({ DATABASE_HOST: '::1' }));
});

test('rejeita IP remoto e hostname remoto', () => {
  assertRejected(withEnv({ DATABASE_HOST: '10.0.0.5' }));
  assertRejected(withEnv({ DATABASE_HOST: 'db.exemplo.com' }));
  assertRejected(withEnv({ DATABASE_HOST: '0.0.0.0' }));
});

test('rejeita pooler e host Supabase', () => {
  assertRejected(withEnv({ DATABASE_HOST: 'aws-0-sa-east-1.pooler.supabase.com', DATABASE_PORT: '6543' }));
  assertRejected(withEnv({ DATABASE_HOST: 'db.abcdefgh.supabase.co' }));
});

test('rejeita porta diferente de 5432', () => {
  assertRejected(withEnv({ DATABASE_PORT: '5433' }));
  assertRejected(withEnv({ DATABASE_PORT: '05432' }));
});

test('rejeita outro database, inclusive postgres', () => {
  assertRejected(withEnv({ DATABASE_NAME: 'postgres' }));
  assertRejected(withEnv({ DATABASE_NAME: 'amanteigados_hml' }));
  assertRejected(withEnv({ DATABASE_NAME: 'AMANTEIGADOS_DEV' }));
});

test('rejeita usuario diferente do runtime app (owner/migrator)', () => {
  assertRejected(withEnv({ DATABASE_USER: 'amanteigados_dev_owner' }));
  assertRejected(withEnv({ DATABASE_USER: 'amanteigados_dev_migrator' }));
});

test('rejeita DATABASE_URL remota ou local, mesmo com DATABASE_* validas', () => {
  assertRejected(withEnv({ DATABASE_URL: 'postgres://u:p@db.remoto.com:5432/amanteigados_dev' }));
  assertRejected(withEnv({ DATABASE_URL: 'postgres://u:p@127.0.0.1:5432/amanteigados_dev' }));
});

test('DATABASE_URL vazia nao bloqueia nem altera o destino (nunca e lida)', () => {
  assert.doesNotThrow(() => resolveDevAdminTarget(withEnv({ DATABASE_URL: '' })));
});

test('rejeita configuracao incompleta', () => {
  for (const key of ['DATABASE_HOST', 'DATABASE_PORT', 'DATABASE_NAME', 'DATABASE_USER', 'DATABASE_PASSWORD']) {
    assertRejected(withEnv({ [key]: undefined }));
    assertRejected(withEnv({ [key]: '   ' }));
  }
  assertRejected({});
});

test('nao usa PGPASSWORD nem PG* como fallback', () => {
  assertRejected(withEnv({ DATABASE_PASSWORD: undefined, PGPASSWORD: SECRET }));
});
