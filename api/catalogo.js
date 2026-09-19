import pg from 'pg';
import { getCatalogPayload } from '../backend/src/catalog.js';

const { Pool } = pg;

let pool = null;

function getPool() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString || connectionString.trim() === '') {
    throw new Error('DATABASE_URL is required');
  }

  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 5,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 10000,
      application_name: 'amanteigados-livia-api-homolog',
    });

    pool.on('error', (error) => {
      console.error('[amanteigados-livia-api] unexpected database pool error', {
        code: error.code ?? 'unknown_error',
      });
    });
  }

  return pool;
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  if (request.method !== 'GET') {
    response.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  try {
    const payload = await getCatalogPayload(getPool());
    response.status(200).json(payload);
  } catch {
    response.status(503).json({ error: 'catalog_unavailable' });
  }
}
