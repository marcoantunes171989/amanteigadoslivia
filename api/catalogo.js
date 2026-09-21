import pg from 'pg';
import { handlePublicCatalog } from '../backend/src/admin-http.js';
import { safeDatabaseErrorLog } from '../backend/src/admin-errors.js';

const { Pool } = pg;

// Serverless: 1 conexão por instância, liberada rápido (Supavisor transaction mode).
export const POOL_LIMITS = Object.freeze({
  max: 1,
  connectionTimeoutMillis: 8000,
  idleTimeoutMillis: 1000,
  allowExitOnIdle: true,
});

let pool = null;

function createPoolFromDiscreteEnv() {
  return new Pool({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT || 5432),
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    ssl: { rejectUnauthorized: false },
    ...POOL_LIMITS,
    application_name: 'amanteigados-livia-api-homolog',
  });
}

function createPoolFromUrl() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString || connectionString.trim() === '') {
    throw new Error('DATABASE_HOST or DATABASE_URL is required');
  }

  return new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    ...POOL_LIMITS,
    application_name: 'amanteigados-livia-api-homolog',
  });
}

export function getPool() {
  if (pool) {
    return pool;
  }

  const host = process.env.DATABASE_HOST;
  pool = host && host.trim() !== ''
    ? createPoolFromDiscreteEnv()
    : createPoolFromUrl();

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
