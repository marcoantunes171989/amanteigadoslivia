import pg from 'pg';
import config from './config.js';

const { Pool } = pg;

const APPLICATION_NAME = 'amanteigados-livia-api-dev';

const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.name,
  user: config.database.user,
  password: config.database.password,
  max: 5,
  connectionTimeoutMillis: 3000,
  idleTimeoutMillis: 10000,
  application_name: APPLICATION_NAME,
});

pool.on('error', (error) => {
  console.error('[amanteigados-livia-api] unexpected database pool error', {
    code: error.code ?? 'unknown_error',
  });
});

let closePromise = null;

export async function checkDatabaseConnection() {
  try {
    await pool.query('SELECT 1');
    return { ok: true };
  } catch (error) {
    return { ok: false, code: error.code ?? 'unknown_error' };
  }
}

export function closeDatabasePool() {
  if (!closePromise) {
    closePromise = pool.end();
  }

  return closePromise;
}

export default pool;
