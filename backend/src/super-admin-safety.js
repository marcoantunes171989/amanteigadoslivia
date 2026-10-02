// Regras PURAS de seguranca do script scripts/criar-super-admin-seguro.mjs.
// Sem I/O, sem rede, sem banco: tudo testavel offline.

export const ENVIRONMENTS = Object.freeze({
  HOMOLOGACAO: Object.freeze({ label: 'HOMOLOGACAO', projectRef: 'ywlzswyepcawcgkllwlu' }),
  PRODUCAO: Object.freeze({ label: 'PRODUCAO', projectRef: 'suyablzfgupcslfasgzw' }),
});

export const PROD_SUPER_ADMIN_CONFIRMATION = 'CRIAR SUPER ADMIN PRODUCAO';
export const REQUIRED_PORT = 5432;
export const POOLER_SUFFIX = '.pooler.supabase.com';
export const REQUIRED_DATABASE = 'postgres';

// Chave fixa e documentada, reservada exclusivamente para serializar via
// pg_advisory_xact_lock a criacao/manutencao do SUPER_ADMIN. Nao reutilizar
// para nenhum outro proposito no projeto. Liberada automaticamente no fim
// da transacao (xact lock), sem necessidade de unlock manual.
export const SUPER_ADMIN_ADVISORY_LOCK_KEY = 802871455;

// Somente as duas strings exatas. Qualquer outra coisa => null (script sai sem conexao).
export function parseEnvironment(input) {
  const value = String(input ?? '').trim();
  return Object.hasOwn(ENVIRONMENTS, value) ? value : null;
}

// PRODUCAO exige a digitacao exata; HOMOLOGACAO nao exige confirmacao extra.
export function isEnvironmentConfirmed(environment, typedConfirmation) {
  if (environment === 'PRODUCAO') {
    return typedConfirmation === PROD_SUPER_ADMIN_CONFIRMATION;
  }
  return environment === 'HOMOLOGACAO';
}

export function expectedAdminUser(projectRef) {
  return `postgres.${projectRef}`;
}

// Valida a conexao ADMINISTRATIVA informada localmente. Retorna lista de erros (vazia = ok).
export function validateAdminConnection({ environment, host, port, database, user, projectRef } = {}) {
  const errors = [];
  const env = Object.hasOwn(ENVIRONMENTS, environment) ? ENVIRONMENTS[environment] : null;
  if (!env) {
    return ['environment_invalid'];
  }

  const ref = String(projectRef ?? '').trim();
  if (ref !== env.projectRef) {
    const other = Object.values(ENVIRONMENTS).find((item) => item.projectRef === ref);
    errors.push(other ? 'project_ref_belongs_to_other_environment' : 'project_ref_mismatch');
  }

  const cleanHost = String(host ?? '').trim().toLowerCase();
  if (!cleanHost.endsWith(POOLER_SUFFIX)) {
    errors.push('host_must_be_supabase_pooler');
  }

  if (String(port ?? '').trim() !== String(REQUIRED_PORT)) {
    errors.push('port_must_be_5432');
  }

  if (String(database ?? '').trim() !== REQUIRED_DATABASE) {
    errors.push('database_must_be_postgres');
  }

  const cleanUser = String(user ?? '').trim();
  if (cleanUser !== expectedAdminUser(env.projectRef)) {
    // Cobre tambem roles *_app.<ref> (runtime), que nao sao administrativas.
    errors.push('user_must_be_postgres_project_ref');
  }

  return errors;
}

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email ?? ''));
}

// So valida que um caminho foi informado (string nao vazia). A verificacao de
// existencia/tipo de arquivo e I/O e fica no script, executada apenas antes
// de client.connect() no momento real de execucao.
export function validateCaPath(caPath) {
  return typeof caPath === 'string' && caPath.trim() ? [] : ['ca_path_required'];
}

// Decide a acao sobre o SUPER_ADMIN a partir de TODOS os registros existentes
// com perfil_usuario='SUPER_ADMIN' (nao apenas o email solicitado), para evitar
// a criacao de um segundo SUPER_ADMIN com email diferente.
//
// 0 existentes            -> create
// 1 existente, mesmo email -> update (reconciliacao do mesmo registro)
// 1 existente, email diff. -> block (different_email_super_admin_exists)
// >1 existentes            -> block (multiple_super_admin_exists)
export function evaluateSuperAdminState(existingSuperAdmins, email) {
  const rows = Array.isArray(existingSuperAdmins) ? existingSuperAdmins : [];
  const targetEmail = String(email ?? '').trim().toLowerCase();

  if (rows.length === 0) {
    return { action: 'create' };
  }
  if (rows.length > 1) {
    return { action: 'block', reason: 'multiple_super_admin_exists' };
  }

  const [only] = rows;
  const existingEmail = String(only?.email_usuario ?? '').trim().toLowerCase();
  if (existingEmail === targetEmail) {
    return { action: 'update', id: only?.id_usuario_admin };
  }
  return { action: 'block', reason: 'different_email_super_admin_exists' };
}
