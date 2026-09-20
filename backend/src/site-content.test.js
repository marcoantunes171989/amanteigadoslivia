import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AdminError } from './admin-errors.js';
import {
  executeContentAction,
  getPublicSiteContent,
  publicConfigMap,
  validateSiteConfigPatch,
} from './site-content.js';

test('public config map keeps only safe keys', () => {
  const map = publicConfigMap([
    { chave_configuracao: 'whatsapp_telefone', valor_texto: '5511999999999', ativo: true },
    { chave_configuracao: 'logo_topo_url', valor_texto: 'assets/logo.jpg', ativo: true },
    { chave_configuracao: 'service_role', valor_texto: 'secret', ativo: true },
    { chave_configuracao: 'hero_imagem_url', valor_texto: 'assets/hero.jpg', ativo: false },
  ]);
  assert.equal(map.whatsapp_telefone, '5511999999999');
  assert.equal(map.logo_topo_url, 'assets/logo.jpg');
  assert.equal(map.service_role, undefined);
  assert.equal(map.hero_imagem_url, undefined);
});

test('whatsapp config rejects invalid numbers', () => {
  assert.throws(() => validateSiteConfigPatch({ chave_configuracao: 'whatsapp_telefone', valor_texto: 'abc' }), AdminError);
  const ok = validateSiteConfigPatch({ chave_configuracao: 'whatsapp_telefone', valor_texto: '+55 11 99999-0000' });
  assert.equal(ok.valor_texto, '5511999990000');
});

test('public site content never includes private collections', async () => {
  const queryable = {
    async query(sql) {
      if (String(sql).includes('json_agg')) {
        return {
          rows: [{
            configuracoes: [{ chave_configuracao: 'logo_topo_url', valor_texto: 'assets/logo.jpg', ativo: true }],
            conteudos: [{
              id_conteudo_site: '11111111-1111-4111-8111-111111111111',
              secao: 'HOME',
              tipo_conteudo: 'CHAMADA',
              titulo: 'Hero',
              subtitulo: null,
              descricao: null,
              texto_botao: 'Conheça o cardápio',
              url_destino: '/produtos',
              ordem_exibicao: 10,
              ativo: true,
            }],
            imagens: [],
          }],
        };
      }
      if (String(sql).includes('GREATEST')) {
        return { rows: [{ revisao: new Date('2026-01-01T00:00:00Z') }] };
      }
      return { rows: [] };
    },
  };
  const payload = await getPublicSiteContent(queryable);
  assert.equal(payload.branding.logo_topo_url, 'assets/logo.jpg');
  assert.equal(payload.secoes[0].titulo, 'Hero');
  assert.equal(payload.solicitacoes, undefined);
  assert.equal(payload.usuarios, undefined);
  assert.equal(payload.auditoria, undefined);
  assert.ok(!JSON.stringify(payload).includes('service_role'));
});

test('admin content CRUD validates section and image URL', async () => {
  const queryable = {
    async query(sql) {
      if (String(sql).includes('SELECT id_configuracao_site')) {
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
  const saved = await executeContentAction(queryable, {
    acao: 'salvar_conteudo',
    dados: { secao: 'HOME', tipo_conteudo: 'CHAMADA', titulo: 'Hero', descricao: 'Texto <b>limpo</b>' },
  });
  assert.equal(saved.conteudo.secao, 'HOME');
  assert.equal(saved.conteudo.descricao, 'Texto limpo');
  await executeContentAction(queryable, {
    acao: 'alterar_branding',
    dados: { chave_configuracao: 'logo_topo_url', valor_texto: 'assets/logo.jpg' },
  });
  await executeContentAction(queryable, {
    acao: 'alterar_galeria',
    dados: {
      id_conteudo_site: saved.conteudo.id_conteudo_site,
      url_imagem: 'assets/hero.jpg',
      texto_alternativo: 'Hero',
      principal: true,
    },
  });
  await assert.rejects(
    () => executeContentAction(queryable, { acao: 'salvar_conteudo', dados: { secao: 'X', tipo_conteudo: 'CHAMADA' } }),
    AdminError,
  );
});
