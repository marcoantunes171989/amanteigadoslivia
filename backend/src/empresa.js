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
});

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
  if (!row) return { ...DEFAULT_EMPRESA };
  return {
    id_empresa: String(row.id_empresa || EMPRESA_PADRAO_ID),
    slug: row.slug || EMPRESA_PADRAO_SLUG,
    nome_fantasia: row.nome_fantasia || DEFAULT_EMPRESA.nome_fantasia,
    ativo: row.ativo !== false,
  };
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
  };
}

export function publicEmpresaPayload(empresa, tema) {
  return {
    empresa: {
      id_empresa: empresa.id_empresa,
      slug: empresa.slug,
      nome_fantasia: empresa.nome_fantasia,
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
      WHERE table_schema = 'app' AND table_name = 'tab_empresa'
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
               t.nome_exibicao, t.cor_primaria, t.cor_primaria_escura, t.cor_fundo,
               t.cor_texto, t.cor_destaque, t.logo_topo_url, t.logo_favicon_url, t.whatsapp_telefone
        FROM app.tab_empresa e
        LEFT JOIN app.tab_empresa_tema t ON t.id_empresa = e.id_empresa
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
               t.nome_exibicao, t.cor_primaria, t.cor_primaria_escura, t.cor_fundo,
               t.cor_texto, t.cor_destaque, t.logo_topo_url, t.logo_favicon_url, t.whatsapp_telefone
        FROM app.tab_empresa e
        LEFT JOIN app.tab_empresa_tema t ON t.id_empresa = e.id_empresa
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
      FROM app.tab_empresa
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
             t.nome_exibicao, t.cor_primaria, t.cor_primaria_escura, t.cor_fundo,
             t.cor_texto, t.cor_destaque, t.logo_topo_url, t.logo_favicon_url, t.whatsapp_telefone
      FROM app.tab_empresa e
      LEFT JOIN app.tab_empresa_tema t ON t.id_empresa = e.id_empresa
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
  };

  await queryable.query(
    `-- op:upsert_empresa_tema
      INSERT INTO app.tab_empresa_tema (
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

  if (payload.nome_fantasia != null) {
    const nome = String(payload.nome_fantasia).trim().slice(0, 120);
    if (nome) {
      await queryable.query(
        `-- op:update_empresa_nome
          UPDATE app.tab_empresa
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

export function resetEmpresaSchemaCacheForTests() {
  empresaSchemaReady = false;
}
