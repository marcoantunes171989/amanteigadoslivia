import { getPool, logDatabaseError } from './catalogo.js';
import {
  handleProcessPublications,
  handleProcessScheduledChanges,
} from '../backend/src/admin-http.js';

export const INTERNO_ROUTES = {
  'processar-alteracoes-agendadas': handleProcessScheduledChanges,
  'processar-publicacoes': handleProcessPublications,
};

function firstQueryValue(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join('/');
  if (typeof value === 'string' && value.trim()) {
    return value.replace(/^\/+|\/+$/g, '');
  }
  return '';
}

export function internoJobFromRequest(request) {
  const fromQuery = firstQueryValue(request?.query?.job);
  if (fromQuery) return fromQuery;

  const url = String(request?.url || '');
  const match = url.match(/\/api\/interno\/([^/?]+)/);
  return match ? match[1] : '';
}

export function createInternoHandler(deps = { getPool, logDatabaseError }) {
  return async function handler(request, response) {
    const job = internoJobFromRequest(request);
    const route = Object.hasOwn(INTERNO_ROUTES, job) ? INTERNO_ROUTES[job] : null;
    if (!route) {
      response.statusCode = 404;
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(JSON.stringify({ error: 'not_found' }));
      return;
    }
    await route(request, response, deps);
  };
}

export default createInternoHandler();
