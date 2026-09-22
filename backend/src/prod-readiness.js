// Readiness PROD server-side. O backend e a unica autoridade: nada aqui le body,
// query, header ou qualquer valor vindo do browser.
//
// Cada flag e evidencia EXPLICITA e futura (definida por um operador apos V14 +
// migrations + smoke DB). Regra: somente a string exata "true" => pronto.
// Ausente, "false", "TRUE", " true " ou qualquer outro valor => NAO pronto.
// (Mais estrito de proposito que PROMOCAO_PROD_HABILITADA, que ignora caixa.)
//
// Este modulo nao conecta em banco, nao chama Vercel e nunca retorna valores de env.

export const PROD_DATABASE_READY_ENV = 'PROD_DATABASE_READY';
export const PROD_ENV_READY_ENV = 'PROD_ENV_READY';

function exactTrue(env, name) {
  return env?.[name] === 'true';
}

export function isProdDatabaseReady(env = process.env) {
  return exactTrue(env, PROD_DATABASE_READY_ENV);
}

export function isProdEnvReady(env = process.env) {
  return exactTrue(env, PROD_ENV_READY_ENV);
}

export function getProdReadiness(env = process.env) {
  return {
    prodDatabaseReady: isProdDatabaseReady(env),
    prodEnvReady: isProdEnvReady(env),
  };
}
