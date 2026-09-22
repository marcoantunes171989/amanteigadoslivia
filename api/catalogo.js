import pg from 'pg';
import { handlePublicCatalog } from '../backend/src/admin-http.js';
import { safeDatabaseErrorLog } from '../backend/src/admin-errors.js';
import { resolvePoolConfig } from '../backend/src/db-config.js';

const { Pool } = pg;

// Serverless: 1 conexão por instância, liberada rápido (Supavisor transaction mode).
export const POOL_LIMITS = Object.freeze({
  max: 1,
  connectionTimeoutMillis: 8000,
  idleTimeoutMillis: 1000,
  allowExitOnIdle: true,
});

let pool = null;

export function getPool() {
  if (pool) {
    return pool;
  }

  // Fail-closed: configuração inválida lança ANTES de abrir o pool (sem fallback de porta).
  const { options } = resolvePoolConfig(process.env);
  pool = new Pool({ ...options, ...POOL_LIMITS });

  pool.on('error', (error) => {
    console.error('[catalog-api] unexpected database pool error', {
      code: error?.code || 'unknown',
      name: error?.name || 'Error',
    });
  });

  return pool;
}

export function logDatabaseError(scope, error) {
  console.error(scope, safeDatabaseErrorLog(error));
}

export default async function handler(request, response) {
  await handlePublicCatalog(request, response, { getPool, logDatabaseError });
}
