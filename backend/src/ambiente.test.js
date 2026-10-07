import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import { AMBIENTE, resolveAmbiente } from './ambiente.js';
import { AMBIENTE_LABELS, ambienteLabel } from '../../admin-session-ui.js';

test('DEV: development e local resolvem para DEV', () => {
  assert.equal(resolveAmbiente({ APP_AMBIENTE: 'development' }), AMBIENTE.DEV);
  assert.equal(resolveAmbiente({ APP_AMBIENTE: 'local' }), AMBIENTE.DEV);
});

test('HML: homolog, homologacao e staging resolvem para HML', () => {
  assert.equal(resolveAmbiente({ APP_AMBIENTE: 'homolog' }), AMBIENTE.HML);
  assert.equal(resolveAmbiente({ APP_AMBIENTE: 'homologacao' }), AMBIENTE.HML);
  assert.equal(resolveAmbiente({ APP_AMBIENTE: 'staging' }), AMBIENTE.HML);
});

test('PROD: production resolve para PROD', () => {
  assert.equal(resolveAmbiente({ APP_AMBIENTE: 'production' }), AMBIENTE.PROD);
});

test('valor com espaços e maiúsculas é normalizado', () => {
  assert.equal(resolveAmbiente({ APP_AMBIENTE: '  Homologacao ' }), AMBIENTE.HML);
  assert.equal(resolveAmbiente({ APP_AMBIENTE: ' PRODUCTION' }), AMBIENTE.PROD);
});

test('ambiente desconhecido, ausente ou inválido nunca vira PROD', () => {
  const casos = [undefined, null, '', '   ', 'prod', 'PROD', 'test', 'toString', '__proto__', 'hasOwnProperty', 42];
  for (const valor of casos) {
    assert.equal(resolveAmbiente({ APP_AMBIENTE: valor }), AMBIENTE.UNKNOWN, String(valor));
  }
  assert.equal(resolveAmbiente({}), AMBIENTE.UNKNOWN);
  assert.equal(resolveAmbiente(undefined), AMBIENTE.UNKNOWN);
});

test('NODE_ENV não é usado como fonte de ambiente (production não distingue HML de PROD)', () => {
  assert.equal(resolveAmbiente({ NODE_ENV: 'production', VERCEL_ENV: 'production' }), AMBIENTE.UNKNOWN);
  assert.equal(resolveAmbiente({ NODE_ENV: 'development' }), AMBIENTE.UNKNOWN);
});

test('códigos do backend têm rótulo no frontend; UNKNOWN nunca mostra Produção', () => {
  for (const codigo of Object.values(AMBIENTE)) {
    if (codigo === AMBIENTE.UNKNOWN) continue;
    assert.ok(Object.hasOwn(AMBIENTE_LABELS, codigo), codigo);
  }
  assert.equal(ambienteLabel(AMBIENTE.DEV), 'Desenvolvimento');
  assert.equal(ambienteLabel(AMBIENTE.HML), 'Homologação');
  assert.equal(ambienteLabel(AMBIENTE.PROD), 'Produção');
  assert.equal(ambienteLabel(AMBIENTE.UNKNOWN), 'Ambiente não identificado');
  assert.equal(ambienteLabel(undefined), 'Ambiente não identificado');
  assert.equal(ambienteLabel('toString'), 'Ambiente não identificado');
});

test('APP_AMBIENTE é lido somente pelo módulo central de ambiente', () => {
  const arquivos = [
    ...readdirSync(new URL('.', import.meta.url)).filter((f) => f.endsWith('.js')).map((f) => new URL(f, import.meta.url)),
    new URL('../../admin.js', import.meta.url),
    new URL('../../admin-session-ui.js', import.meta.url),
  ];
  const quem = arquivos
    .filter((url) => !url.pathname.endsWith('.test.js'))
    .filter((url) => readFileSync(url, 'utf8').includes('APP_AMBIENTE'))
    .map((url) => url.pathname.split('/').pop());
  assert.deepEqual(quem, ['ambiente.js']);
});
