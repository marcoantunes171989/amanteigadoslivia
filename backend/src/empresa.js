import { randomUUID } from 'node:crypto';
import { AdminError } from './admin-errors.js';
import { normalizeWhatsAppPhone } from './whatsapp.js';

/** UUID fixo da empresa padrão (Amanteigados Lívia). */
export const EMPRESA_PADRAO_ID = 'a0000000-0000-4000-8000-000000000001';
export const EMPRESA_PADRAO_SLUG = 'amanteigados-livia';

export const DEFAULT_EMPRESA = Object.freeze({
  id_empresa: EMPRESA_PADRAO_ID,
  slug: EMPRESA_PADRAO_SLUG,
  nome_fantasia: 'Amanteigados Lívia',
  ativo: true,
});

export const DEFAULT_TEMA = Object.freeze({
  id_empresa: EMPRESA_PADRAO_ID,
  nome_exibicao: 'Amanteigados Lívia',
  cor_primaria: '#800020',
  cor_primaria_escura: '#650019',
  cor_fundo: '#fff8f1',
  cor_texto: '#2d2020',
  cor_destaque: '#d8a44d',
  logo_topo_url: 'assets/brand/logo-topo.jpeg',
  logo_favicon_url: 'assets/brand/logo-topo.jpeg',
  whatsapp_telefone: '5518981465499',
  fonte_titulo: 'Nunito',
  fonte_corpo: 'Nunito',
});

const FONT_SAFE = /^[A-Za-z0-9][A-Za-z0-9 \-_]{0,60}$/;

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

let empresaSchemaReady = false;

export function isHexColor(value) {
  return typeof value === 'string' && HEX_COLOR.test(value.trim());
}

export function normalizeEmpresaSlug(raw) {
  const slug = String(raw || '').trim().toLowerCase();
  if (!slug || !SLUG_RE.test(slug)) return null;
  return slug;
}

export function mapEmpresa(row) {
  if (!row) return { ...DEFAULT_EMPRESA, url_path: `/loja/${EMPRESA_PADRAO_SLUG}` };
  const slug = row.slug || EMPRESA_PADRAO_SLUG;
  return {
    id_empresa: String(row.id_empresa || EMPRESA_PADRAO_ID),
    slug,
    nome_fantasia: row.nome_fantasia || DEFAULT_EMPRESA.nome_fantasia,
    ativo: row.ativo !== false,
    url_path: `/loja/${slug}`,
  };
}

function safeFont(value, fallback) {
  const text = String(value || '').trim();
  if (!text || !FONT_SAFE.test(text)) return fallback;
  return text;
}

export function mapTema(row, empresa = DEFAULT_EMPRESA) {
  const base = { ...DEFAULT_TEMA, id_empresa: empresa.id_empresa };
  if (!row) return base;
  return {
    id_empresa: String(row.id_empresa || empresa.id_empresa),
    nome_exibicao: row.nome_exibicao || empresa.nome_fantasia || base.nome_exibicao,
    cor_primaria: isHexColor(row.cor_primaria) ? row.cor_primaria : base.cor_primaria,
    cor_primaria_escura: isHexColor(row.cor_primaria_escura) ? row.cor_primaria_escura : base.cor_primaria_escura,
    cor_fundo: isHexColor(row.cor_fundo) ? row.cor_fundo : base.cor_fundo,
    cor_texto: isHexColor(row.cor_texto) ? row.cor_texto : base.cor_texto,
    cor_destaque: isHexColor(row.cor_destaque) ? row.cor_destaque : base.cor_destaque,
    logo_topo_url: row.logo_topo_url || base.logo_topo_url,
    logo_favicon_url: row.logo_favicon_url || row.logo_topo_url || base.logo_favicon_url,
    whatsapp_telefone: normalizeWhatsAppPhone(row.whatsapp_telefone) || base.whatsapp_telefone,
    fonte_titulo: safeFont(row.fonte_titulo, base.fonte_titulo),
    fonte_corpo: safeFont(row.fonte_corpo, base.fonte_corpo),
  };
}

export function publicEmpresaPayload(empresa, tema) {
  const mapped = mapEmpresa(empresa);
  return {
    empresa: {
      id_empresa: mapped.id_empresa,
      slug: mapped.slug,
      nome_fantasia: mapped.nome_fantasia,
      url_path: mapped.url_path,
      ativo: mapped.ativo,
    },
    tema,
  };
}

export async function ensureEmpresaSupport(queryable) {
  if (empresaSchemaReady) return true;
  try {
    const probe = await queryable.query(`
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'tab_empresa'
      LIMIT 1
    `);
    empresaSchemaReady = Boolean(probe.rows[0]);
    return empresaSchemaReady;
  } catch (error) {
    console.warn('[empresa] ensureEmpresaSupport', error?.code || error?.message || error);
    return false;
  }
}

export async function getEmpresaPadrao(queryable) {
  const ready = queryable ? await ensureEmpresaSupport(queryable) : false;
  if (!ready) {
    return publicEmpresaPayload(DEFAULT_EMPRESA, DEFAULT_TEMA);
  }
  try {
    const result = await queryable.query(
      `-- op:get_empresa_padrao
        SELECT e.id_empresa, e.slug, e.nome_fantasia, e.ativo,
               t.*
        FROM public.tab_empresa e
        LEFT JOIN public.tab_empresa_tema t ON t.id_empresa = e.id_empresa
        WHERE e.id_empresa = $1 OR e.slug = $2
        ORDER BY CASE WHEN e.id_empresa = $1 THEN 0 ELSE 1 END
        LIMIT 1
      `,
      [EMPRESA_PADRAO_ID, EMPRESA_PADRAO_SLUG],
    );
    const row = result.rows[0];
    const empresa = mapEmpresa(row || DEFAULT_EMPRESA);
    const tema = mapTema(row, empresa);
    return publicEmpresaPayload(empresa, tema);
  } catch (error) {
    console.warn('[empresa] getEmpresaPadrao', error?.code || error?.message || error);
    return publicEmpresaPayload(DEFAULT_EMPRESA, DEFAULT_TEMA);
  }
}

/**
 * Resolve empresa por slug (query), host (subdomínio futuro) ou default.
 * Fallback permanente: Amanteigados Lívia.
 */
export async function resolveEmpresa(queryable, { slug = '', host = '' } = {}) {
  const ready = queryable ? await ensureEmpresaSupport(queryable) : false;
  if (!ready) {
    return publicEmpresaPayload(DEFAULT_EMPRESA, DEFAULT_TEMA);
  }

  let candidate = normalizeEmpresaSlug(slug);
  if (!candidate && host) {
    const hostName = String(host).split(':')[0].toLowerCase();
    const first = hostName.split('.')[0];
    if (first && first !== 'www' && first !== 'amanteigadoslivia' && first !== 'localhost') {
      candidate = normalizeEmpresaSlug(first);
    }
  }

  if (!candidate || candidate === EMPRESA_PADRAO_SLUG) {
    return getEmpresaPadrao(queryable);
  }

  try {
    const result = await queryable.query(
      `-- op:get_empresa_by_slug
        SELECT e.id_empresa, e.slug, e.nome_fantasia, e.ativo,
               t.*
        FROM public.tab_empresa e
        LEFT JOIN public.tab_empresa_tema t ON t.id_empresa = e.id_empresa
        WHERE e.slug = $1 AND e.ativo = true
        LIMIT 1
      `,
      [candidate],
    );
    if (!result.rows[0]) {
      return getEmpresaPadrao(queryable);
    }
    const empresa = mapEmpresa(result.rows[0]);
    const tema = mapTema(result.rows[0], empresa);
    return publicEmpresaPayload(empresa, tema);
  } catch (error) {
    console.warn('[empresa] resolveEmpresa', error?.code || error?.message || error);
    return getEmpresaPadrao(queryable);
  }
}

export async function listEmpresas(queryable) {
  const ready = await ensureEmpresaSupport(queryable);
  if (!ready) return [DEFAULT_EMPRESA];
  const result = await queryable.query(
    `-- op:list_empresas
      SELECT id_empresa, slug, nome_fantasia, ativo
      FROM public.tab_empresa
      ORDER BY nome_fantasia ASC
    `,
  );
  return result.rows.length ? result.rows.map(mapEmpresa) : [DEFAULT_EMPRESA];
}

export async function getEmpresaTemaById(queryable, idEmpresa) {
  const id = String(idEmpresa || EMPRESA_PADRAO_ID);
  const ready = await ensureEmpresaSupport(queryable);
  if (!ready) {
    return publicEmpresaPayload(DEFAULT_EMPRESA, DEFAULT_TEMA);
  }
  const result = await queryable.query(
    `-- op:get_empresa_tema_by_id
      SELECT e.id_empresa, e.slug, e.nome_fantasia, e.ativo,
             t.*
      FROM public.tab_empresa e
      LEFT JOIN public.tab_empresa_tema t ON t.id_empresa = e.id_empresa
      WHERE e.id_empresa = $1
      LIMIT 1
    `,
    [id],
  );
  if (!result.rows[0]) {
    return getEmpresaPadrao(queryable);
  }
  const empresa = mapEmpresa(result.rows[0]);
  const tema = mapTema(result.rows[0], empresa);
  return publicEmpresaPayload(empresa, tema);
}

function optionalHex(value, label) {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  if (!isHexColor(text)) {
    throw new AdminError(400, 'validation_error', `${label} inválida. Use formato #RRGGBB.`);
  }
  return text;
}

function optionalUrl(value, label) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.length > 500) {
    throw new AdminError(400, 'validation_error', `${label} muito longa.`);
  }
  return text;
}

export async function updateEmpresaTema(queryable, idEmpresa, payload = {}) {
  const id = String(idEmpresa || EMPRESA_PADRAO_ID);
  const ready = await ensureEmpresaSupport(queryable);
  if (!ready) {
    throw new AdminError(503, 'schema_unavailable', 'Tema da empresa em atualização.');
  }

  const current = await getEmpresaTemaById(queryable, id);
  const tema = current.tema;

  const next = {
    nome_exibicao: payload.nome_exibicao != null
      ? String(payload.nome_exibicao).trim().slice(0, 120) || tema.nome_exibicao
      : tema.nome_exibicao,
    cor_primaria: optionalHex(payload.cor_primaria, 'Cor primária') || tema.cor_primaria,
    cor_primaria_escura: optionalHex(payload.cor_primaria_escura, 'Cor primária escura') || tema.cor_primaria_escura,
    cor_fundo: optionalHex(payload.cor_fundo, 'Cor de fundo') || tema.cor_fundo,
    cor_texto: optionalHex(payload.cor_texto, 'Cor de texto') || tema.cor_texto,
    cor_destaque: optionalHex(payload.cor_destaque, 'Cor de destaque') || tema.cor_destaque,
    logo_topo_url: optionalUrl(payload.logo_topo_url, 'Logo do topo') || tema.logo_topo_url,
    logo_favicon_url: optionalUrl(payload.logo_favicon_url, 'Favicon') || tema.logo_favicon_url,
    whatsapp_telefone: payload.whatsapp_telefone != null
      ? (normalizeWhatsAppPhone(payload.whatsapp_telefone) || tema.whatsapp_telefone)
      : tema.whatsapp_telefone,
    fonte_titulo: payload.fonte_titulo != null
      ? safeFont(payload.fonte_titulo, tema.fonte_titulo)
      : tema.fonte_titulo,
    fonte_corpo: payload.fonte_corpo != null
      ? safeFont(payload.fonte_corpo, tema.fonte_corpo)
      : tema.fonte_corpo,
  };

  try {
    await queryable.query(
      `-- op:upsert_empresa_tema
        INSERT INTO public.tab_empresa_tema (
          id_empresa, nome_exibicao, cor_primaria, cor_primaria_escura, cor_fundo,
          cor_texto, cor_destaque, logo_topo_url, logo_favicon_url, whatsapp_telefone,
          fonte_titulo, fonte_corpo
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (id_empresa) DO UPDATE SET
          nome_exibicao = EXCLUDED.nome_exibicao,
          cor_primaria = EXCLUDED.cor_primaria,
          cor_primaria_escura = EXCLUDED.cor_primaria_escura,
          cor_fundo = EXCLUDED.cor_fundo,
          cor_texto = EXCLUDED.cor_texto,
          cor_destaque = EXCLUDED.cor_destaque,
          logo_topo_url = EXCLUDED.logo_topo_url,
          logo_favicon_url = EXCLUDED.logo_favicon_url,
          whatsapp_telefone = EXCLUDED.whatsapp_telefone,
          fonte_titulo = EXCLUDED.fonte_titulo,
          fonte_corpo = EXCLUDED.fonte_corpo,
          data_atualizacao = now()
      `,
      [
        id,
        next.nome_exibicao,
        next.cor_primaria,
        next.cor_primaria_escura,
        next.cor_fundo,
        next.cor_texto,
        next.cor_destaque,
        next.logo_topo_url,
        next.logo_favicon_url,
        next.whatsapp_telefone,
        next.fonte_titulo,
        next.fonte_corpo,
      ],
    );
  } catch (error) {
    // Compatível antes da migration 0010 (sem colunas de tipografia).
    if (error?.code !== '42703') throw error;
    await queryable.query(
      `-- op:upsert_empresa_tema_legacy
        INSERT INTO public.tab_empresa_tema (
          id_empresa, nome_exibicao, cor_primaria, cor_primaria_escura, cor_fundo,
          cor_texto, cor_destaque, logo_topo_url, logo_favicon_url, whatsapp_telefone
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (id_empresa) DO UPDATE SET
          nome_exibicao = EXCLUDED.nome_exibicao,
          cor_primaria = EXCLUDED.cor_primaria,
          cor_primaria_escura = EXCLUDED.cor_primaria_escura,
          cor_fundo = EXCLUDED.cor_fundo,
          cor_texto = EXCLUDED.cor_texto,
          cor_destaque = EXCLUDED.cor_destaque,
          logo_topo_url = EXCLUDED.logo_topo_url,
          logo_favicon_url = EXCLUDED.logo_favicon_url,
          whatsapp_telefone = EXCLUDED.whatsapp_telefone,
          data_atualizacao = now()
      `,
      [
        id,
        next.nome_exibicao,
        next.cor_primaria,
        next.cor_primaria_escura,
        next.cor_fundo,
        next.cor_texto,
        next.cor_destaque,
        next.logo_topo_url,
        next.logo_favicon_url,
        next.whatsapp_telefone,
      ],
    );
  }

  if (payload.nome_fantasia != null) {
    const nome = String(payload.nome_fantasia).trim().slice(0, 120);
    if (nome) {
      await queryable.query(
        `-- op:update_empresa_nome
          UPDATE public.tab_empresa
          SET nome_fantasia = $2, data_atualizacao = now()
          WHERE id_empresa = $1
        `,
        [id, nome],
      );
    }
  }

  return getEmpresaTemaById(queryable, id);
}

/** Filtro SQL seguro: empresa da sessão OU legado NULL OU empresa padrão. */
export function empresaScopeClause(alias, idEmpresa, paramIndex) {
  const id = String(idEmpresa || EMPRESA_PADRAO_ID);
  return {
    sql: `(${alias}.id_empresa = $${paramIndex} OR ${alias}.id_empresa IS NULL)`,
    params: [id],
  };
}

export async function createEmpresa(queryable, payload = {}) {
  const ready = await ensureEmpresaSupport(queryable);
  if (!ready) {
    throw new AdminError(503, 'schema_unavailable', 'Cadastro de empresa indisponível.');
  }
  const slug = normalizeEmpresaSlug(payload.slug);
  if (!slug) {
    throw new AdminError(400, 'validation_error', 'Slug inválido. Use letras minúsculas, números e hífen.');
  }
  if (slug === EMPRESA_PADRAO_SLUG) {
    throw new AdminError(400, 'validation_error', 'Slug reservado para a empresa padrão.');
  }
  const nome = String(payload.nome_fantasia || payload.nome || '').trim().slice(0, 120);
  if (!nome) {
    throw new AdminError(400, 'validation_error', 'Nome da empresa é obrigatório.');
  }
  const id = String(payload.id_empresa || randomUUID());
  try {
    await queryable.query(
      `INSERT INTO public.tab_empresa (id_empresa, slug, nome_fantasia, ativo)
       VALUES ($1, $2, $3, true)`,
      [id, slug, nome],
    );
  } catch (error) {
    if (error?.code === '23505') {
      throw new AdminError(409, 'conflict', 'Já existe empresa com este slug.');
    }
    throw error;
  }
  await updateEmpresaTema(queryable, id, {
    nome_exibicao: payload.nome_exibicao || nome,
    nome_fantasia: nome,
    cor_primaria: payload.cor_primaria,
    cor_primaria_escura: payload.cor_primaria_escura,
    cor_fundo: payload.cor_fundo,
    cor_texto: payload.cor_texto,
    cor_destaque: payload.cor_destaque,
    logo_topo_url: payload.logo_topo_url,
    logo_favicon_url: payload.logo_favicon_url,
    whatsapp_telefone: payload.whatsapp_telefone,
    fonte_titulo: payload.fonte_titulo,
    fonte_corpo: payload.fonte_corpo,
  });
  return getEmpresaTemaById(queryable, id);
}

export async function setEmpresaAtivo(queryable, idEmpresa, ativo) {
  const id = String(idEmpresa || '');
  if (!id) throw new AdminError(400, 'validation_error', 'Empresa obrigatória.');
  if (id === EMPRESA_PADRAO_ID && ativo === false) {
    throw new AdminError(400, 'validation_error', 'A empresa padrão não pode ser desativada.');
  }
  await queryable.query(
    `UPDATE public.tab_empresa SET ativo = $2, data_atualizacao = now() WHERE id_empresa = $1`,
    [id, ativo === true],
  );
  return getEmpresaTemaById(queryable, id);
}

export function resetEmpresaSchemaCacheForTests() {
  empresaSchemaReady = false;
}
