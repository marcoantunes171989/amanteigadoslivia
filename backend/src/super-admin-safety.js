// Regras PURAS de seguranca do script scripts/criar-super-admin-seguro.mjs.
// Sem I/O, sem rede, sem banco: tudo testavel offline.

export const ENVIRONMENTS = Object.freeze({
  HOMOLOGACAO: Object.freeze({ label: 'HOMOLOGACAO', projectRef: 'ywlzswyepcawcgkllwlu' }),
  PRODUCAO: Object.freeze({ label: 'PRODUCAO', projectRef: 'suyablzfgupcslfasgzw' }),
});

export const PROD_SUPER_ADMIN_CONFIRMATION = 'CRIAR SUPER ADMIN PRODUCAO';
export const REQUIRED_PORT = 6543;
export const POOLER_SUFFIX = '.pooler.supabase.com';
export const REQUIRED_DATABASE = 'postgres';

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
    errors.push('port_must_be_6543');
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
