import { getPool, logDatabaseError } from './catalogo.js';

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  if (request.method !== 'GET') {
    response.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  try {
    await getPool().query('SELECT 1');
    response.status(200).json({
      ok: true,
      database: 'connected',
    });
  } catch (error) {
    logDatabaseError('[catalog-api] health-db request failed', error);
    response.status(503).json({
      ok: false,
      database: 'unavailable',
      code: error?.code || 'unknown',
    });
  }
}
