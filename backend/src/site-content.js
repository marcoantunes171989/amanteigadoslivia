import { randomUUID } from 'node:crypto';
import { AdminError } from './admin-errors.js';
import { getCatalogRevision, getPublicRealtimeConfig } from './catalog-revision.js';
import { withTransaction } from './db-tx.js';
import { formatWhatsAppDisplay, normalizeWhatsAppPhone } from './whatsapp.js';
import {
  QUANTIDADE_MINIMA_KEY,
  normalizeQuantidadeMinimaMap,
} from '../../ui-core.js';

export const PUBLIC_CONFIG_KEYS = Object.freeze([
  'whatsapp_telefone',
  'logo_topo_url',
  'logo_rodape_url',
  'hero_imagem_url',
  'descubra_imagem_url',
]);

export const CONTENT_SECTIONS = Object.freeze(['HOME', 'ENCOMENDAS', 'FESTAS', 'PERSONALIZADOS']);
export const CONTENT_TYPES = Object.freeze(['CHAMADA', 'DESTAQUE', 'GALERIA', 'CARD']);

const TEXT_LIMITS = {
  titulo: 180,
  subtitulo: 240,
  descricao: 4000,
  texto_botao: 80,
  url_destino: 500,
  texto_alternativo: 180,
  chave_configuracao: 80,
  valor_texto: 2000,
};

function stripHtml(value) {
  return String(value ?? '').replace(/<[^>]*>/g, '').trim();
}

function clip(value, max) {
  const text = stripHtml(value);
  return text.length > max ? text.slice(0, max) : text;
}

function optionalText(value, max) {
  if (value == null) return null;
  const text = clip(value, max);
  return text || null;
}

function isSafePublicUrl(url) {
  const value = String(url || '').trim();
  if (!value) return false;
  if (value.startsWith('assets/') || value.startsWith('/assets/') || value.startsWith('/')) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function publicConfigMap(rows = []) {
  const map = {};
  for (const row of rows) {
    if (!PUBLIC_CONFIG_KEYS.includes(row.chave_configuracao)) continue;
    if (row.ativo !== true) continue;
    map[row.chave_configuracao] = row.valor_texto || null;
  }
  return map;
}

export function publicQuantidadeMinima(rows = []) {
  const row = (rows || []).find((item) => item.chave_configuracao === QUANTIDADE_MINIMA_KEY && item.ativo !== false);
  return normalizeQuantidadeMinimaMap(row?.valor_json);
}

function mapImage(image) {
  return {
    id_conteudo_imagem: String(image.id_conteudo_imagem),
    url_imagem: image.url_imagem,
    texto_alternativo: image.texto_alternativo,
    ordem_exibicao: image.ordem_exibicao ?? 0,
    principal: image.principal === true,
    ativo: image.ativo === true,
  };
}

function imagesForContent(row, images = []) {
  return images
    .filter((image) => String(image.id_conteudo_site) === String(row.id_conteudo_site) && image.ativo !== false)
    .sort((a, b) => {
      if (a.principal === true && b.principal !== true) return -1;
      if (b.principal === true && a.principal !== true) return 1;
      return (a.ordem_exibicao ?? 0) - (b.ordem_exibicao ?? 0);
    });
}

export function visibleImagesForSlot(row, images = [], { publicView = false } = {}) {
  const all = imagesForContent(row, images).map(mapImage);
  const principal = all.find((image) => image.principal === true) || null;
  const galeria = all.filter((image) => image.principal !== true);
  let visiveis = all;
  if (publicView) {
    visiveis = row.tipo_conteudo === 'GALERIA' ? galeria : (principal ? [principal] : []);
  }
  return {
    imagens: visiveis,
    imagem_principal: principal,
    galeria,
  };
}

function mapContent(row, images = [], options = {}) {
  const slots = visibleImagesForSlot(row, images, options);
  return {
    id_conteudo_site: String(row.id_conteudo_site),
    secao: row.secao,
    tipo_conteudo: row.tipo_conteudo,
    titulo: row.titulo,
    subtitulo: row.subtitulo,
    descricao: row.descricao,
    texto_botao: row.texto_botao,
    url_destino: row.url_destino,
    ordem_exibicao: row.ordem_exibicao ?? 0,
    ativo: row.ativo === true,
    imagens: slots.imagens,
    imagem_principal: slots.imagem_principal,
    galeria: slots.galeria,
  };
}

export async function getPublicSiteContent(queryable) {
  const result = await queryable.query(`
      SELECT
        COALESCE((
          SELECT json_agg(to_jsonb(cfg))
          FROM (
            SELECT chave_configuracao, valor_texto, valor_json, ativo
            FROM app.tab_configuracao_site
            WHERE ativo = true
              AND chave_configuracao = ANY($1::text[])
          ) cfg
        ), '[]'::json) AS configuracoes,
        COALESCE((
          SELECT json_agg(to_jsonb(c) ORDER BY c.secao, c.ordem_exibicao)
          FROM (
            SELECT id_conteudo_site, secao, tipo_conteudo, titulo, subtitulo, descricao,
                   texto_botao, url_destino, ordem_exibicao, ativo
            FROM app.tab_conteudo_site
            WHERE ativo = true
          ) c
        ), '[]'::json) AS conteudos,
        COALESCE((
          SELECT json_agg(to_jsonb(i) ORDER BY i.ordem_exibicao)
          FROM (
            SELECT id_conteudo_imagem, id_conteudo_site, url_imagem, texto_alternativo,
                   ordem_exibicao, principal, ativo
            FROM app.tab_conteudo_imagem
            WHERE ativo = true
          ) i
        ), '[]'::json) AS imagens
    `, [[...PUBLIC_CONFIG_KEYS, QUANTIDADE_MINIMA_KEY]]);

  const row = result.rows[0] || {};
  const configuracao = publicConfigMap(row.configuracoes || []);
  configuracao.quantidade_minima_solicitacao = publicQuantidadeMinima(row.configuracoes || []);
  if (configuracao.whatsapp_telefone) {
    configuracao.whatsapp_telefone = normalizeWhatsAppPhone(configuracao.whatsapp_telefone)
      || configuracao.whatsapp_telefone;
    configuracao.whatsapp_exibicao = formatWhatsAppDisplay(configuracao.whatsapp_telefone);
  }

  let revisao = String(Date.now());
  let proxima = null;
  let realtime = getPublicRealtimeConfig();
  try {
    const revision = await getCatalogRevision(queryable);
    revisao = revision.revisao;
    proxima = revision.proxima_atualizacao;
    realtime = revision.realtime;
  } catch {
    // revision best-effort
  }

  return {
    configuracao,
    branding: {
      logo_topo_url: configuracao.logo_topo_url || 'assets/logo.jpg',
      logo_rodape_url: configuracao.logo_rodape_url || 'assets/footer-brand.png',
    },
    secoes: (row.conteudos || []).map((item) => mapContent(item, row.imagens || [], { publicView: true })),
    revisao_site: revisao,
    proxima_atualizacao: proxima,
    realtime,
  };
}

export async function getAdminSiteContent(queryable) {
  const [configResult, contentResult, imageResult] = await Promise.all([
    queryable.query(`
      SELECT id_configuracao_site, chave_configuracao, valor_texto, valor_json, ativo,
             data_criacao, data_atualizacao
      FROM app.tab_configuracao_site
      ORDER BY chave_configuracao ASC
    `),
    queryable.query(`
      SELECT id_conteudo_site, secao, tipo_conteudo, titulo, subtitulo, descricao,
             texto_botao, url_destino, ordem_exibicao, ativo, data_criacao, data_atualizacao
      FROM app.tab_conteudo_site
      ORDER BY secao ASC, ordem_exibicao ASC, data_criacao ASC
    `),
    queryable.query(`
      SELECT id_conteudo_imagem, id_conteudo_site, url_imagem, texto_alternativo,
             ordem_exibicao, principal, ativo, data_criacao
      FROM app.tab_conteudo_imagem
      ORDER BY ordem_exibicao ASC, data_criacao ASC
    `),
  ]);
  return {
    configuracoes: configResult.rows,
    conteudos: contentResult.rows.map((row) => mapContent(row, imageResult.rows)),
  };
}

export function validateSiteConfigPatch(payload = {}) {
  const chave = clip(payload.chave_configuracao || payload.chave, TEXT_LIMITS.chave_configuracao);
  if (chave === QUANTIDADE_MINIMA_KEY) {
    const map = normalizeQuantidadeMinimaMap(payload.valor_json ?? payload.valor);
    for (const [tipo, value] of Object.entries(map)) {
      if (!Number.isInteger(value) || value < 1 || value > 10000) {
        throw new AdminError(400, 'validation_error', `Quantidade mínima inválida para ${tipo}.`);
      }
    }
    return { chave_configuracao: chave, valor_texto: null, valor_json: map };
  }
  if (!PUBLIC_CONFIG_KEYS.includes(chave)) {
    throw new AdminError(400, 'validation_error', 'Configuração pública inválida.');
  }
  let valor = optionalText(payload.valor_texto ?? payload.valor, TEXT_LIMITS.valor_texto);
  if (chave === 'whatsapp_telefone') {
    const digits = normalizeWhatsAppPhone(valor);
    if (!digits) {
      throw new AdminError(400, 'validation_error', 'Informe um WhatsApp válido, apenas dígitos com DDI.');
    }
    valor = digits;
  } else if (valor && chave.endsWith('_url') && !isSafePublicUrl(valor)) {
    throw new AdminError(400, 'validation_error', 'URL de imagem inválida.');
  }
  return { chave_configuracao: chave, valor_texto: valor, valor_json: null };
}

export async function upsertSiteConfig(queryable, payload = {}) {
  const patch = validateSiteConfigPatch(payload);
  const existing = await queryable.query(
    `SELECT id_configuracao_site FROM app.tab_configuracao_site WHERE chave_configuracao = $1`,
    [patch.chave_configuracao],
  );
  const id = existing.rows[0]?.id_configuracao_site || payload.id_configuracao_site || randomUUID();
  await queryable.query(
    `-- op:upsert_configuracao_site
      INSERT INTO app.tab_configuracao_site (
        id_configuracao_site, chave_configuracao, valor_texto, valor_json, ativo, data_atualizacao
      ) VALUES ($1, $2, $3, $4::jsonb, true, now())
      ON CONFLICT (chave_configuracao) DO UPDATE
        SET valor_texto = COALESCE(EXCLUDED.valor_texto, app.tab_configuracao_site.valor_texto),
            valor_json = COALESCE(EXCLUDED.valor_json, app.tab_configuracao_site.valor_json),
            ativo = true,
            data_atualizacao = now()
    `,
    [
      id,
      patch.chave_configuracao,
      patch.valor_texto,
      patch.valor_json != null ? JSON.stringify(patch.valor_json) : null,
    ],
  );
  return { id_configuracao_site: String(id), ...patch };
}

function validateContentPayload(payload = {}, { partial = false } = {}) {
  const secao = payload.secao ? String(payload.secao).toUpperCase() : null;
  const tipo = payload.tipo_conteudo ? String(payload.tipo_conteudo).toUpperCase() : null;
  if (!partial || secao) {
    if (!CONTENT_SECTIONS.includes(secao)) {
      throw new AdminError(400, 'validation_error', 'Seção de conteúdo inválida.');
    }
  }
  if (!partial || tipo) {
    if (!CONTENT_TYPES.includes(tipo)) {
      throw new AdminError(400, 'validation_error', 'Tipo de conteúdo inválido.');
    }
  }
  return {
    secao,
    tipo_conteudo: tipo,
    titulo: optionalText(payload.titulo, TEXT_LIMITS.titulo),
    subtitulo: optionalText(payload.subtitulo, TEXT_LIMITS.subtitulo),
    descricao: optionalText(payload.descricao, TEXT_LIMITS.descricao),
    texto_botao: optionalText(payload.texto_botao, TEXT_LIMITS.texto_botao),
    url_destino: optionalText(payload.url_destino, TEXT_LIMITS.url_destino),
    ordem_exibicao: Number.isInteger(payload.ordem_exibicao) ? payload.ordem_exibicao : 0,
    ativo: payload.ativo !== false,
  };
}

export async function saveSiteContent(queryable, payload = {}) {
  const data = validateContentPayload(payload, { partial: Boolean(payload.id_conteudo_site) });
  const id = payload.id_conteudo_site || randomUUID();
  if (payload.id_conteudo_site) {
    await queryable.query(
      `-- op:update_conteudo_site
        UPDATE app.tab_conteudo_site
           SET secao = COALESCE($2, secao),
               tipo_conteudo = COALESCE($3, tipo_conteudo),
               titulo = $4,
               subtitulo = $5,
               descricao = $6,
               texto_botao = $7,
               url_destino = $8,
               ordem_exibicao = $9,
               ativo = $10,
               data_atualizacao = now()
         WHERE id_conteudo_site = $1
      `,
      [id, data.secao, data.tipo_conteudo, data.titulo, data.subtitulo, data.descricao, data.texto_botao, data.url_destino, data.ordem_exibicao, data.ativo],
    );
  } else {
    await queryable.query(
      `-- op:insert_conteudo_site
        INSERT INTO app.tab_conteudo_site (
          id_conteudo_site, secao, tipo_conteudo, titulo, subtitulo, descricao,
          texto_botao, url_destino, ordem_exibicao, ativo
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `,
      [id, data.secao, data.tipo_conteudo, data.titulo, data.subtitulo, data.descricao, data.texto_botao, data.url_destino, data.ordem_exibicao, data.ativo],
    );
  }
  return { id_conteudo_site: String(id), ...data };
}

export async function replacePrincipalImage(queryable, payload = {}) {
  if (!payload.id_conteudo_site) {
    throw new AdminError(400, 'validation_error', 'Conteúdo é obrigatório.');
  }
  const url = clip(payload.url_imagem, 1000);
  if (!isSafePublicUrl(url)) {
    throw new AdminError(400, 'validation_error', 'URL de imagem inválida.');
  }
  const alt = optionalText(payload.texto_alternativo, TEXT_LIMITS.texto_alternativo);
  return withTransaction(queryable, async (client) => {
    const existing = await client.query(
      `-- op:list_imagens_conteudo
        SELECT id_conteudo_imagem, id_conteudo_site, url_imagem, texto_alternativo,
               ordem_exibicao, principal, ativo
        FROM app.tab_conteudo_imagem
        WHERE id_conteudo_site = $1
        ORDER BY ordem_exibicao ASC, data_criacao ASC
      `,
      [payload.id_conteudo_site],
    );
    const rows = existing.rows;
    const sameUrl = rows.find((row) => row.url_imagem === url);
    const previousPrincipal = rows.find((row) => row.principal === true);
    await client.query(
      `-- op:clear_principal_conteudo
        UPDATE app.tab_conteudo_imagem
           SET principal = false
         WHERE id_conteudo_site = $1 AND principal = true
      `,
      [payload.id_conteudo_site],
    );
    if (sameUrl) {
      await client.query(
        `-- op:set_principal_conteudo
          UPDATE app.tab_conteudo_imagem
             SET principal = true, ativo = true, texto_alternativo = COALESCE($2, texto_alternativo),
                 url_imagem = $3
           WHERE id_conteudo_imagem = $1
        `,
        [sameUrl.id_conteudo_imagem, alt, url],
      );
      return { id_conteudo_imagem: String(sameUrl.id_conteudo_imagem), principal: true, substituida: true };
    }
    if (previousPrincipal) {
      await client.query(
        `-- op:update_conteudo_imagem_principal
          UPDATE app.tab_conteudo_imagem
             SET url_imagem = $2,
                 texto_alternativo = $3,
                 principal = true,
                 ativo = true
           WHERE id_conteudo_imagem = $1
        `,
        [previousPrincipal.id_conteudo_imagem, url, alt],
      );
      return { id_conteudo_imagem: String(previousPrincipal.id_conteudo_imagem), principal: true, substituida: true };
    }
    const id = payload.id_conteudo_imagem || randomUUID();
    await client.query(
      `-- op:insert_conteudo_imagem_principal
        INSERT INTO app.tab_conteudo_imagem (
          id_conteudo_imagem, id_conteudo_site, url_imagem, texto_alternativo,
          ordem_exibicao, principal, ativo
        ) VALUES ($1,$2,$3,$4,$5,true,true)
      `,
      [id, payload.id_conteudo_site, url, alt, Number.isInteger(payload.ordem_exibicao) ? payload.ordem_exibicao : 0],
    );
    return { id_conteudo_imagem: String(id), principal: true, substituida: false };
  });
}

export async function addGalleryImage(queryable, payload = {}) {
  if (!payload.id_conteudo_site) {
    throw new AdminError(400, 'validation_error', 'Conteúdo é obrigatório.');
  }
  const url = clip(payload.url_imagem, 1000);
  if (!isSafePublicUrl(url)) {
    throw new AdminError(400, 'validation_error', 'URL de imagem inválida.');
  }
  const id = payload.id_conteudo_imagem || randomUUID();
  await queryable.query(
    `-- op:insert_conteudo_imagem_galeria
      INSERT INTO app.tab_conteudo_imagem (
        id_conteudo_imagem, id_conteudo_site, url_imagem, texto_alternativo,
        ordem_exibicao, principal, ativo
      ) VALUES ($1,$2,$3,$4,$5,false,$6)
    `,
    [
      id,
      payload.id_conteudo_site,
      url,
      optionalText(payload.texto_alternativo, TEXT_LIMITS.texto_alternativo),
      Number.isInteger(payload.ordem_exibicao) ? payload.ordem_exibicao : 0,
      payload.ativo !== false,
    ],
  );
  return { id_conteudo_imagem: String(id), principal: false };
}

export async function saveContentImage(queryable, payload = {}) {
  if (payload.id_conteudo_imagem && payload.principal !== true) {
    if (!payload.id_conteudo_site) {
      throw new AdminError(400, 'validation_error', 'Conteúdo é obrigatório.');
    }
    const url = clip(payload.url_imagem, 1000);
    if (!isSafePublicUrl(url)) {
      throw new AdminError(400, 'validation_error', 'URL de imagem inválida.');
    }
    await queryable.query(
      `-- op:update_conteudo_imagem
        UPDATE app.tab_conteudo_imagem
           SET url_imagem = $2,
               texto_alternativo = $3,
               ordem_exibicao = $4,
               principal = false,
               ativo = $5
         WHERE id_conteudo_imagem = $1
      `,
      [
        payload.id_conteudo_imagem,
        url,
        optionalText(payload.texto_alternativo, TEXT_LIMITS.texto_alternativo),
        Number.isInteger(payload.ordem_exibicao) ? payload.ordem_exibicao : 0,
        payload.ativo !== false,
      ],
    );
    return { id_conteudo_imagem: String(payload.id_conteudo_imagem), principal: false };
  }
  if (payload.principal === true || !payload.id_conteudo_imagem) {
    return replacePrincipalImage(queryable, payload);
  }
  return addGalleryImage(queryable, payload);
}

export async function executeContentAction(queryable, body = {}) {
  const acao = String(body.acao || '').toLowerCase();
  const dados = body.dados || body;
  if (acao === 'salvar_configuracao' || acao === 'alterar_branding') {
    return { configuracao: await upsertSiteConfig(queryable, dados) };
  }
  if (acao === 'salvar_conteudo') {
    return { conteudo: await saveSiteContent(queryable, dados) };
  }
  if (acao === 'substituir_imagem_principal') {
    return { imagem: await replacePrincipalImage(queryable, dados) };
  }
  if (acao === 'adicionar_galeria') {
    return { imagem: await addGalleryImage(queryable, dados) };
  }
  if (acao === 'salvar_imagem' || acao === 'alterar_galeria') {
    if (dados.principal === false) {
      return { imagem: await addGalleryImage(queryable, dados) };
    }
    return { imagem: await replacePrincipalImage(queryable, dados) };
  }
  throw new AdminError(400, 'validation_error', 'Ação de conteúdo inválida.');
}
