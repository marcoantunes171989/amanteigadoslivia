import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AdminError } from './admin-errors.js';
import {
  executeContentAction,
  getPublicSiteContent,
  publicConfigMap,
  validateSiteConfigPatch,
  visibleImagesForSlot,
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

test('quantidade minima config is stored as valor_json', () => {
  const patch = validateSiteConfigPatch({
    chave_configuracao: 'quantidade_minima_solicitacao',
    valor_json: { ANIVERSARIO: 30, ENCOMENDA: 1 },
  });
  assert.equal(patch.valor_json.ANIVERSARIO, 30);
  assert.equal(patch.valor_json.PRESENTE, 1);
  assert.equal(patch.valor_texto, null);
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
  assert.deepEqual(payload.configuracao.quantidade_minima_solicitacao.ENCOMENDA, 1);
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

test('substituir principal nao cria segunda imagem visual', async () => {
  const images = [{
    id_conteudo_imagem: 'img-1',
    id_conteudo_site: 'c1',
    url_imagem: 'assets/old.jpg',
    texto_alternativo: 'Antiga',
    ordem_exibicao: 0,
    principal: true,
    ativo: true,
  }];
  const queryable = {
    async query(sql, params = []) {
      const text = String(sql);
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
      if (text.includes('op:list_imagens_conteudo')) return { rows: images.slice() };
      if (text.includes('op:clear_principal_conteudo')) {
        for (const row of images) row.principal = false;
        return { rows: [] };
      }
      if (text.includes('op:update_conteudo_imagem_principal')) {
        const row = images.find((item) => item.id_conteudo_imagem === params[0]);
        row.url_imagem = params[1];
        row.texto_alternativo = params[2];
        row.principal = true;
        row.ativo = true;
        return { rows: [row] };
      }
      if (text.includes('op:insert_conteudo_imagem')) {
        images.push({
          id_conteudo_imagem: params[0],
          id_conteudo_site: params[1],
          url_imagem: params[2],
          principal: true,
          ativo: true,
        });
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
  const result = await executeContentAction(queryable, {
    acao: 'substituir_imagem_principal',
    dados: { id_conteudo_site: 'c1', url_imagem: 'assets/new.jpg', texto_alternativo: 'Nova' },
  });
  assert.equal(result.imagem.substituida, true);
  assert.equal(images.length, 1);
  assert.equal(images[0].principal, true);
  assert.equal(images[0].url_imagem, 'assets/new.jpg');
});

test('adicionar galeria continua criando imagem adicional', async () => {
  const images = [{
    id_conteudo_imagem: 'img-1',
    id_conteudo_site: 'c1',
    url_imagem: 'assets/main.jpg',
    principal: true,
    ativo: true,
  }];
  const queryable = {
    async query(sql, params = []) {
      if (String(sql).includes('op:insert_conteudo_imagem_galeria')) {
        images.push({
          id_conteudo_imagem: params[0],
          id_conteudo_site: params[1],
          url_imagem: params[2],
          principal: false,
          ativo: true,
        });
      }
      return { rows: [] };
    },
  };
  await executeContentAction(queryable, {
    acao: 'adicionar_galeria',
    dados: { id_conteudo_site: 'c1', url_imagem: 'assets/extra.jpg' },
  });
  assert.equal(images.length, 2);
  assert.equal(images.filter((item) => item.principal === true).length, 1);
  assert.equal(images.filter((item) => item.principal !== true).length, 1);
});

test('imagem antiga deixa de ser principal se nova for inserida', async () => {
  const images = [{
    id_conteudo_imagem: 'img-old',
    id_conteudo_site: 'c1',
    url_imagem: 'assets/old.jpg',
    principal: true,
    ativo: true,
  }];
  const queryable = {
    async query(sql, params = []) {
      const text = String(sql);
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] };
      if (text.includes('op:list_imagens_conteudo')) return { rows: images.map((row) => ({ ...row })) };
      if (text.includes('op:clear_principal_conteudo')) {
        for (const row of images) row.principal = false;
        return { rows: [] };
      }
      if (text.includes('op:insert_conteudo_imagem_principal')) {
        images.push({
          id_conteudo_imagem: params[0],
          id_conteudo_site: params[1],
          url_imagem: params[2],
          principal: true,
          ativo: true,
        });
        return { rows: [] };
      }
      if (text.includes('op:update_conteudo_imagem_principal')) {
        const row = images.find((item) => item.id_conteudo_imagem === params[0]);
        row.url_imagem = params[1];
        row.principal = true;
        return { rows: [row] };
      }
      return { rows: [] };
    },
  };
  await executeContentAction(queryable, {
    acao: 'substituir_imagem_principal',
    dados: { id_conteudo_site: 'c1', url_imagem: 'assets/new.jpg' },
  });
  assert.equal(images.filter((item) => item.principal === true).length, 1);
  assert.equal(images.find((item) => item.principal === true).url_imagem, 'assets/new.jpg');
});

test('publico retorna uma principal e nao mistura galeria', () => {
  const row = { id_conteudo_site: 'c1', tipo_conteudo: 'CARD' };
  const images = [
    { id_conteudo_imagem: 'a', id_conteudo_site: 'c1', url_imagem: 'assets/main.jpg', principal: true, ativo: true, ordem_exibicao: 0 },
    { id_conteudo_imagem: 'b', id_conteudo_site: 'c1', url_imagem: 'assets/extra.jpg', principal: false, ativo: true, ordem_exibicao: 1 },
  ];
  const publicSlot = visibleImagesForSlot(row, images, { publicView: true });
  assert.equal(publicSlot.imagens.length, 1);
  assert.equal(publicSlot.imagens[0].url_imagem, 'assets/main.jpg');
  const gallery = visibleImagesForSlot({ id_conteudo_site: 'c1', tipo_conteudo: 'GALERIA' }, images, { publicView: true });
  assert.equal(gallery.imagens.length, 1);
  assert.equal(gallery.imagens[0].url_imagem, 'assets/extra.jpg');
});
