import { randomUUID } from 'node:crypto';
import { EMPRESA_PADRAO_ID, ensureEmpresaSupport, normalizeEmpresaSlug } from './empresa.js';
import { AdminError } from './admin-errors.js';

let vinculosReady = null;

export async function ensureEmpresaVinculosSupport(queryable) {
  if (vinculosReady === true) return true;
  if (vinculosReady === false) return false;
  try {
    const probe = await queryable.query(`
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'tab_produto_empresa'
      LIMIT 1
    `);
    vinculosReady = Boolean(probe.rows[0]);
    return vinculosReady;
  } catch {
    vinculosReady = false;
    return false;
  }
}

export function resetEmpresaVinculosCacheForTests() {
  vinculosReady = null;
}

export async function listIdsByEmpresa(queryable, table, idColumn, idEmpresa) {
  const ready = await ensureEmpresaVinculosSupport(queryable);
  if (!ready) return null; // null = sem filtro (legado)
  const result = await queryable.query(
    `SELECT ${idColumn} AS id FROM public.${table} WHERE id_empresa = $1`,
    [String(idEmpresa || EMPRESA_PADRAO_ID)],
  );
  const ids = new Set(result.rows.map((row) => String(row.id)));
  // Tabela criada sem backfill: não isola (evita loja padrão vazia).
  if (ids.size === 0) {
    const any = await queryable.query(`SELECT 1 FROM public.${table} LIMIT 1`);
    if (!any.rows[0]) return null;
  }
  return ids;
}

export function filterRowsByEmpresaIds(rows, idField, allowedIds) {
  if (!allowedIds) return rows;
  return (rows || []).filter((row) => allowedIds.has(String(row[idField])));
}

export async function linkRecursoEmpresa(queryable, table, idColumn, idRecurso, idEmpresa) {
  if (!(await ensureEmpresaVinculosSupport(queryable))) return;
  try {
    await queryable.query(
      `INSERT INTO public.${table} (${idColumn}, id_empresa)
       VALUES ($1, $2)
       ON CONFLICT (${idColumn}) DO UPDATE
         SET id_empresa = EXCLUDED.id_empresa`,
      [idRecurso, String(idEmpresa || EMPRESA_PADRAO_ID)],
    );
  } catch (error) {
    // Sem GRANT/RLS ainda: não derruba o cadastro; isolamento fica pendente do SQL 0010/0010b.
    if (error?.code === '42501' || error?.code === '42P01') {
      vinculosReady = false;
      return;
    }
    throw error;
  }
}

export async function linkUsuarioEmpresa(queryable, idUsuario, idEmpresa) {
  return linkRecursoEmpresa(queryable, 'tab_usuario_empresa', 'id_usuario_admin', idUsuario, idEmpresa);
}

export async function linkCategoriaEmpresa(queryable, idCategoria, idEmpresa) {
  return linkRecursoEmpresa(queryable, 'tab_categoria_empresa', 'id_categoria', idCategoria, idEmpresa);
}

export async function linkProdutoEmpresa(queryable, idProduto, idEmpresa) {
  return linkRecursoEmpresa(queryable, 'tab_produto_empresa', 'id_produto', idProduto, idEmpresa);
}

export async function linkVendaEmpresa(queryable, idVenda, idEmpresa) {
  return linkRecursoEmpresa(queryable, 'tab_venda_empresa', 'id_venda', idVenda, idEmpresa);
}

export async function getUsuarioEmpresaId(queryable, idUsuario) {
  if (!(await ensureEmpresaVinculosSupport(queryable))) return EMPRESA_PADRAO_ID;
  try {
    const result = await queryable.query(
      `SELECT id_empresa FROM public.tab_usuario_empresa WHERE id_usuario_admin = $1 LIMIT 1`,
      [idUsuario],
    );
    return result.rows[0]?.id_empresa || EMPRESA_PADRAO_ID;
  } catch {
    return EMPRESA_PADRAO_ID;
  }
}

export function empresaUrlPath(slug) {
  const normalized = normalizeEmpresaSlug(slug) || 'amanteigados-livia';
  return `/loja/${normalized}`;
}

export function assertCanManageEmpresa(session, idEmpresaAlvo) {
  const perfil = String(session?.perfil || '').toUpperCase();
  if (perfil === 'SUPER_ADMIN') return;
  const sessaoEmpresa = String(session?.id_empresa || EMPRESA_PADRAO_ID);
  if (String(idEmpresaAlvo || '') !== sessaoEmpresa) {
    throw new AdminError(403, 'forbidden', 'Sem permissão para outra empresa.');
  }
}

export function newEmpresaId() {
  return randomUUID();
}
