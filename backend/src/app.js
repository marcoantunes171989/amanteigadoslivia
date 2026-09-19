import express from 'express';
import { handleAdminCatalog, handleAdminLogin, handleAdminLogout } from './admin-http.js';
import { getCatalogPayload } from './catalog.js';
import pool from './database.js';
import { checkReadiness } from './readiness.js';

const app = express();

app.disable('x-powered-by');

app.use(express.json({
  limit: '100kb',
}));

app.get('/health', (_request, response) => {
  response.set('Cache-Control', 'no-store');
  response.status(200).json({
    status: 'ok',
    service: 'amanteigados-livia-api',
  });
});

app.get('/api/catalogo', async (_request, response) => {
  response.set('Cache-Control', 'no-store');

  try {
    const payload = await getCatalogPayload(pool);
    response.status(200).json(payload);
  } catch {
    response.status(503).json({ error: 'catalog_unavailable' });
  }
});

app.post('/api/admin/login', async (request, response) => {
  await handleAdminLogin(request, response);
});

app.post('/api/admin/logout', async (request, response) => {
  await handleAdminLogout(request, response);
});

app.all('/api/admin/catalogo', async (request, response) => {
  await handleAdminCatalog(request, response, {
    getPool: () => pool,
    logDatabaseError(scope, error) {
      console.error(scope, {
        code: error?.code || 'unknown',
        name: error?.name || 'Error',
        message: error?.message || 'unknown error',
      });
    },
  });
});

app.get('/ready', async (_request, response) => {
  const readiness = await checkReadiness();

  response.set('Cache-Control', 'no-store');

  if (readiness.ready) {
    response.status(200).json({
      status: 'ready',
      service: 'amanteigados-livia-api',
      dependencies: {
        database: 'ready',
      },
    });
    return;
  }

  response.status(503).json({
    status: 'not_ready',
    service: 'amanteigados-livia-api',
    dependencies: {
      database: 'not_ready',
    },
  });
});

app.use((_request, response) => {
  response.status(404).json({
    error: 'not_found',
  });
});

export default app;
