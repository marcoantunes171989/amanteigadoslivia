import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_EMPRESA,
  DEFAULT_TEMA,
  EMPRESA_PADRAO_ID,
  EMPRESA_PADRAO_SLUG,
  mapEmpresa,
  mapTema,
  normalizeEmpresaSlug,
  publicEmpresaPayload,
  resolveEmpresa,
  resetEmpresaSchemaCacheForTests,
} from './empresa.js';

test('normalizeEmpresaSlug accepts valid slugs', () => {
  assert.equal(normalizeEmpresaSlug('Amanteigados-Livia'), 'amanteigados-livia');
  assert.equal(normalizeEmpresaSlug('loja-2'), 'loja-2');
  assert.equal(normalizeEmpresaSlug('Bad Slug'), null);
  assert.equal(normalizeEmpresaSlug(''), null);
});

test('mapTema falls back to current Amanteigados defaults', () => {
  const tema = mapTema(null, DEFAULT_EMPRESA);
  assert.equal(tema.cor_primaria, '#800020');
  assert.equal(tema.logo_topo_url, 'assets/brand/logo-topo.jpeg');
  assert.equal(tema.whatsapp_telefone, '5518981465499');
  assert.equal(tema.nome_exibicao, 'Amanteigados Lívia');
});

test('publicEmpresaPayload keeps stable shape', () => {
  const payload = publicEmpresaPayload(DEFAULT_EMPRESA, DEFAULT_TEMA);
  assert.equal(payload.empresa.slug, EMPRESA_PADRAO_SLUG);
  assert.equal(payload.empresa.id_empresa, EMPRESA_PADRAO_ID);
  assert.equal(payload.tema.cor_primaria_escura, '#650019');
});

test('resolveEmpresa without schema returns default tenant', async () => {
  resetEmpresaSchemaCacheForTests();
  const pool = {
    async query() {
      throw Object.assign(new Error('undefined_table'), { code: '42P01' });
    },
  };
  const resolved = await resolveEmpresa(pool, {});
  assert.equal(resolved.empresa.slug, EMPRESA_PADRAO_SLUG);
  assert.equal(resolved.tema.nome_exibicao, 'Amanteigados Lívia');
});

test('mapEmpresa tolerates partial rows', () => {
  const empresa = mapEmpresa({ id_empresa: 'x', slug: 'loja-demo' });
  assert.equal(empresa.slug, 'loja-demo');
  assert.equal(empresa.nome_fantasia, 'Amanteigados Lívia');
});
