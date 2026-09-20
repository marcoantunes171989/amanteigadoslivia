import { getPool, logDatabaseError } from './catalogo.js';
import {
  handleAdminAlteracoes,
  handleAdminAuditoria,
  handleAdminCatalog,
  handleAdminLogin,
  handleAdminLogout,
  handleAdminPublicacoes,
  handleAdminRelatorios,
  handleAdminUploadUrl,
  handleAdminUsuarios,
  handleAdminVendas,
} from '../backend/src/admin-http.js';

export const ADMIN_ROUTES = {
  login: handleAdminLogin,
  logout: handleAdminLogout,
  catalogo: handleAdminCatalog,
  vendas: handleAdminVendas,
  relatorios: handleAdminRelatorios,
  auditoria: handleAdminAuditoria,
  usuarios: handleAdminUsuarios,
  'alteracoes-agendadas': handleAdminAlteracoes,
  publicacoes: handleAdminPublicacoes,
  'imagens/upload-url': handleAdminUploadUrl,
};

function firstQueryValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join('/');
  if (typeof value === 'string' && value.trim()) {
    return value.replace(/^\/+|\/+$/g, '');
  }
  return '';
}

export function adminPathFromRequest(request) {
  const fromQuery = firstQueryValue(request?.query?.slug)
    || firstQueryValue(request?.query?.path);
  if (fromQuery) return fromQuery;

  const url = String(request?.url || '');
  const match = url.match(/\/api\/admin\/([^?]+)/);
  return match ? match[1].replace(/\/+$/, '') : '';
}

export function createAdminHandler(deps = { getPool, logDatabaseError }) {
  return async function handler(request, response) {
    const pathName = adminPathFromRequest(request);
    const route = Object.hasOwn(ADMIN_ROUTES, pathName) ? ADMIN_ROUTES[pathName] : null;
    if (!route) {
      response.statusCode = 404;
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(JSON.stringify({ error: 'not_found' }));
      return;
    }
    await route(request, response, deps);
  };
}

export default createAdminHandler();
