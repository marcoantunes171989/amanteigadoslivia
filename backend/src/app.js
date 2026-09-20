import express from 'express';
import {
  handleAdminAlteracoes,
  handleAdminAuditoria,
  handleAdminCatalog,
  handleAdminLogin,
  handleAdminLogout,
  handleAdminPublicacoes,
  handleAdminRelatorios,
  handleAdminSessao,
  handleAdminUploadUrl,
  handleAdminUsuarios,
  handleAdminVendas,
  handleCatalogRevision,
  handleProcessPublications,
  handleProcessScheduledChanges,
  handlePublicCatalog,
  handlePublicVenda,
} from './admin-http.js';
import pool from './database.js';
import { checkReadiness } from './readiness.js';

const app = express();

app.disable('x-powered-by');

app.use(express.json({
  limit: '100kb',
}));

const deps = {
  getPool: () => pool,
  logDatabaseError(scope, error) {
    console.error(scope, {
      code: error?.code || 'unknown',
      name: error?.name || 'Error',
      message: error?.message || 'unknown error',
    });
  },
};

app.get('/health', (_request, response) => {
  response.set('Cache-Control', 'no-store');
  response.status(200).json({
    status: 'ok',
    service: 'amanteigados-livia-api',
  });
});

app.get('/api/catalogo', (request, response) => handlePublicCatalog(request, response, deps));
app.get('/api/catalogo/revisao', (request, response) => handleCatalogRevision(request, response, deps));
app.post('/api/vendas', (request, response) => handlePublicVenda(request, response, deps));
app.post('/api/admin/login', (request, response) => handleAdminLogin(request, response, deps));
app.post('/api/admin/logout', (request, response) => handleAdminLogout(request, response, deps));
app.get('/api/admin/sessao', (request, response) => handleAdminSessao(request, response, deps));
app.all('/api/admin/catalogo', (request, response) => handleAdminCatalog(request, response, deps));
app.all('/api/admin/vendas', (request, response) => handleAdminVendas(request, response, deps));
app.get('/api/admin/relatorios', (request, response) => handleAdminRelatorios(request, response, deps));
app.get('/api/admin/auditoria', (request, response) => handleAdminAuditoria(request, response, deps));
app.all('/api/admin/usuarios', (request, response) => handleAdminUsuarios(request, response, deps));
app.all('/api/admin/alteracoes-agendadas', (request, response) => handleAdminAlteracoes(request, response, deps));
app.all('/api/admin/publicacoes', (request, response) => handleAdminPublicacoes(request, response, deps));
app.post('/api/admin/imagens/upload-url', (request, response) => handleAdminUploadUrl(request, response, deps));
app.post('/api/interno/processar-alteracoes-agendadas', (request, response) => handleProcessScheduledChanges(request, response, deps));
app.post('/api/interno/processar-publicacoes', (request, response) => handleProcessPublications(request, response, deps));

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
