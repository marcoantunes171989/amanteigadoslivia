// Trava DEV LOCAL do bootstrap de administrador.
// Modulo puro: recebe `env`, valida o destino efetivo e devolve a configuracao do Pool. Nao abre conexao.
// Fail-closed: qualquer desvio do destino literal aborta antes de qualquer conexao ou INSERT.

export const DEV_ADMIN_HOST = '127.0.0.1';
export const DEV_ADMIN_PORT = '5432';
export const DEV_ADMIN_DATABASE = 'amanteigados_dev';
export const DEV_ADMIN_USER = 'amanteigados_dev_app';

export class DevAdminTargetError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DevAdminTargetError';
    this.code = 'dev_target_rejected';
  }
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// DATABASE_URL e proibida nesta ferramenta: nao e lida nem usada como fallback, e sua presenca aborta.
// Assim nenhuma URL remota pode competir com as variaveis discretas.
export function resolveDevAdminTarget(env = process.env) {
  if (clean(env.DATABASE_URL) !== '') {
    throw new DevAdminTargetError('DATABASE_URL nao e permitida nesta ferramenta (use apenas DATABASE_* discretas).');
  }

  const host = clean(env.DATABASE_HOST);
  const port = clean(env.DATABASE_PORT);
  const database = clean(env.DATABASE_NAME);
  const user = clean(env.DATABASE_USER);
  const password = typeof env.DATABASE_PASSWORD === 'string' ? env.DATABASE_PASSWORD : '';

  if (!host || !port || !database || !user || !password.trim()) {
    throw new DevAdminTargetError('Configuracao incompleta: DATABASE_HOST, DATABASE_PORT, DATABASE_NAME, DATABASE_USER e DATABASE_PASSWORD sao obrigatorias.');
  }
  if (host !== DEV_ADMIN_HOST) {
    throw new DevAdminTargetError(`Host nao permitido: esperado ${DEV_ADMIN_HOST}.`);
  }
  if (port !== DEV_ADMIN_PORT) {
    throw new DevAdminTargetError(`Porta nao permitida: esperada ${DEV_ADMIN_PORT}.`);
  }
  if (database !== DEV_ADMIN_DATABASE) {
    throw new DevAdminTargetError(`Database nao permitido: esperado ${DEV_ADMIN_DATABASE}.`);
  }
  if (user !== DEV_ADMIN_USER) {
    throw new DevAdminTargetError(`Usuario PostgreSQL nao permitido: esperado ${DEV_ADMIN_USER}.`);
  }

  return Object.freeze({
    host,
    port: Number(port),
    database,
    user,
    password,
    ssl: false,
  });
}
