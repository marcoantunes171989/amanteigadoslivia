import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  DEFAULT_APPLICATION_NAME,
  DatabaseConfigError,
  isSupabasePoolerHost,
  resolveApplicationName,
  resolvePoolConfig,
} from './db-config.js';

const POOLER = 'aws-0-sa-east-1.pooler.supabase.com';

function discrete(extra = {}) {
  return {
    DATABASE_HOST: POOLER,
    DATABASE_PORT: '6543',
    DATABASE_NAME: 'postgres',
    DATABASE_USER: 'app.ref',
    DATABASE_PASSWORD: 'unit-test-password',
    ...extra,
  };
}

test('DATABASE_HOST presente: usa variaveis discretas (e ignora DATABASE_URL)', () => {
  const { mode, options } = resolvePoolConfig(discrete({ DATABASE_URL: 'postgres://ignored@other:5432/db' }));
  assert.equal(mode, 'discrete');
  assert.equal(options.host, POOLER);
  assert.equal(options.port, 6543);
  assert.equal(options.database, 'postgres');
  assert.equal(options.user, 'app.ref');
  assert.equal(options.connectionString, undefined);
});

test('DATABASE_HOST presente + porta ausente/vazia: FALHA sem fallback 5432', () => {
  for (const port of [undefined, '', '   ']) {
    const env = discrete({ DATABASE_PORT: port });
    if (port === undefined) delete env.DATABASE_PORT;
    assert.throws(
      () => resolvePoolConfig(env),
      (error) => error instanceof DatabaseConfigError
        && error.message === 'DATABASE_PORT is required when DATABASE_HOST is configured',
    );
  }
  // Host nao-Supabase tambem exige porta: nao existe default 5432.
  assert.throws(
    () => resolvePoolConfig({ DATABASE_HOST: 'db.internal.example', DATABASE_NAME: 'x' }),
    /DATABASE_PORT is required when DATABASE_HOST is configured/,
  );
});

test('porta invalida (nao numerica/fora de faixa) falha', () => {
  for (const port of ['abc', '65536', '0', '-1', '5432.5', '6543x']) {
    assert.throws(() => resolvePoolConfig(discrete({ DATABASE_PORT: port })), DatabaseConfigError, port);
  }
});

test('pooler Supabase + 5432 (ou qualquer porta != 6543): FALHA e nao troca a porta em silencio', () => {
  for (const port of ['5432', '6542', '6544']) {
    assert.throws(
      () => resolvePoolConfig(discrete({ DATABASE_PORT: port })),
      (error) => error instanceof DatabaseConfigError && /must be 6543/.test(error.message),
      port,
    );
  }
});

test('pooler Supabase + 6543: PASS', () => {
  assert.equal(resolvePoolConfig(discrete()).options.port, 6543);
  // Host em caixa alta/espacos continua sendo reconhecido como pooler.
  assert.throws(() => resolvePoolConfig(discrete({
    DATABASE_HOST: ` ${POOLER.toUpperCase()} `,
    DATABASE_PORT: '5432',
  })), /must be 6543/);
});

test('regra 6543 nao e universal: Postgres direto/local continua livre para configurar a porta', () => {
  const { options } = resolvePoolConfig({
    DATABASE_HOST: 'localhost',
    DATABASE_PORT: '5433',
    DATABASE_NAME: 'dev',
  });
  assert.equal(options.port, 5433);
  assert.equal(isSupabasePoolerHost('localhost'), false);
  assert.equal(isSupabasePoolerHost('db.abc.supabase.co'), false);
  assert.equal(isSupabasePoolerHost(POOLER), true);
});

test('DATABASE_HOST ausente + DATABASE_URL valida: mantem fallback compativel', () => {
  const url = 'postgres://user:secret@example.test:6543/postgres';
  const { mode, options } = resolvePoolConfig({ DATABASE_URL: url });
  assert.equal(mode, 'url');
  assert.equal(options.connectionString, url);
  // DATABASE_HOST em branco conta como ausente.
  assert.equal(resolvePoolConfig({ DATABASE_HOST: '  ', DATABASE_URL: url }).mode, 'url');
});

test('sem DATABASE_HOST e sem DATABASE_URL: falha explicita', () => {
  assert.throws(() => resolvePoolConfig({}), /DATABASE_HOST or DATABASE_URL is required/);
  assert.throws(() => resolvePoolConfig({ DATABASE_URL: '   ' }), /DATABASE_HOST or DATABASE_URL is required/);
});

test('application_name: generico, override opcional, sem depender de VERCEL_ENV', () => {
  assert.equal(DEFAULT_APPLICATION_NAME, 'amanteigados-livia-api');
  assert.equal(resolvePoolConfig(discrete()).options.application_name, 'amanteigados-livia-api');
  assert.equal(
    resolvePoolConfig(discrete({ VERCEL_ENV: 'production' })).options.application_name,
    'amanteigados-livia-api',
  );
  assert.equal(resolveApplicationName({ DATABASE_APPLICATION_NAME: ' custom-app ' }), 'custom-app');
  assert.equal(
    resolvePoolConfig({ DATABASE_URL: 'postgres://u@h:6543/d' }).options.application_name,
    'amanteigados-livia-api',
  );
});

test('mensagens de erro nao contem senha nem connection string', () => {
  const secretEnv = discrete({ DATABASE_PORT: '5432', DATABASE_PASSWORD: 'p4ssw0rd-super-secreta' });
  try {
    resolvePoolConfig(secretEnv);
    assert.fail('deveria falhar');
  } catch (error) {
    assert.doesNotMatch(error.message, /p4ssw0rd-super-secreta/);
    assert.doesNotMatch(error.message, /postgres:\/\//);
  }
});

test('api/catalogo.js usa db-config e nao carrega mais fallback 5432 nem application_name homolog', () => {
  const source = readFileSync(new URL('../../api/catalogo.js', import.meta.url), 'utf8');
  assert.match(source, /resolvePoolConfig/);
  assert.doesNotMatch(source, /\|\|\s*5432/);
  assert.doesNotMatch(source, /api-homolog/);
  assert.doesNotMatch(source, /VERCEL_ENV/);
});
