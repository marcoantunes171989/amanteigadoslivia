import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_TEMA,
  EMPRESA_PADRAO_SLUG,
  empresaUrlAcesso,
  mapEmpresa,
  mapTema,
  normalizeEmpresaDominio,
  normalizeEmpresaSlug,
  publicEmpresaPayload,
} from './empresa.js';
import { empresaUrlPath } from './empresa-scope.js';

test('empresa padrão expõe url_path /loja/amanteigados-livia', () => {
  const payload = publicEmpresaPayload(
    { id_empresa: 'a0000000-0000-4000-8000-000000000001', slug: EMPRESA_PADRAO_SLUG, nome_fantasia: 'Amanteigados Lívia', ativo: true },
    DEFAULT_TEMA,
  );
  assert.equal(payload.empresa.url_path, '/loja/amanteigados-livia');
  assert.equal(empresaUrlPath(EMPRESA_PADRAO_SLUG), '/loja/amanteigados-livia');
});

test('slug inválido é rejeitado; slug válido normaliza', () => {
  assert.equal(normalizeEmpresaSlug('Loja Demo'), null);
  assert.equal(normalizeEmpresaSlug('loja-demo'), 'loja-demo');
});

test('tema inclui tipografia padrão Nunito', () => {
  const tema = mapTema(null);
  assert.equal(tema.fonte_titulo, 'Nunito');
  assert.equal(tema.fonte_corpo, 'Nunito');
});

test('mapEmpresa de outra loja gera URL própria', () => {
  const empresa = mapEmpresa({
    id_empresa: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    slug: 'confeitaria-sol',
    nome_fantasia: 'Confeitaria Sol',
    ativo: true,
  });
  assert.equal(empresa.url_path, '/loja/confeitaria-sol');
  assert.equal(empresa.url_acesso, '/loja/confeitaria-sol');
});

test('domínio próprio define url_acesso https sem herdar path amanteigados', () => {
  assert.equal(normalizeEmpresaDominio('https://WWW.DoceAurora.com.br/loja'), 'www.doceaurora.com.br');
  const empresa = mapEmpresa({
    id_empresa: 'b1000000-0000-4000-8000-000000000001',
    slug: 'doce-aurora',
    nome_fantasia: 'Doce Aurora',
    dominio: 'www.doceaurora.com.br',
    ativo: true,
  });
  assert.equal(empresa.url_acesso, 'https://www.doceaurora.com.br');
  assert.equal(empresaUrlAcesso(empresa), 'https://www.doceaurora.com.br');
  assert.equal(empresa.url_path, '/loja/doce-aurora');
});

test('vercel.json aponta /loja/:empresa para páginas cleanUrls', async () => {
  const { readFileSync } = await import('node:fs');
  const raw = readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8');
  const config = JSON.parse(raw);
  const sources = config.rewrites.map((item) => item.source);
  assert.ok(sources.includes('/loja/:empresa'));
  assert.ok(sources.includes('/loja/:empresa/produtos'));
  assert.ok(sources.includes('/loja/:empresa/carrinho'));
  assert.ok(sources.includes('/loja/:empresa/acompanhar'));
  const produtos = config.rewrites.find((item) => item.source === '/loja/:empresa/produtos');
  assert.equal(produtos.destination, '/produtos');
});
