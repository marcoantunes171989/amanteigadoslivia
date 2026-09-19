import {
  buildSessionCookie,
  clearSessionCookie,
  isSecureRequest,
  passwordsMatch,
  readSessionToken,
  signSession,
  verifySession,
} from './admin-auth.js';
import { executeAdminAction, getAdminCatalog } from './admin-catalog.js';
import { AdminError, toClientError } from './admin-errors.js';

function sendJson(response, status, payload) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (typeof response.status === 'function') {
    response.status(status).json(payload);
    return;
  }
  response.statusCode = status;
  response.end(JSON.stringify(payload));
}

function sendError(response, error) {
  const mapped = toClientError(error);
  sendJson(response, mapped.status, mapped.body);
}

export async function readJsonBody(request) {
  if (request?.body != null) {
    if (Buffer.isBuffer(request.body)) {
      const text = request.body.toString('utf8').trim();
      return text ? JSON.parse(text) : {};
    }
    if (typeof request.body === 'string') {
      const text = request.body.trim();
      return text ? JSON.parse(text) : {};
    }
    if (typeof request.body === 'object') {
      return request.body;
    }
  }

  if (typeof request?.[Symbol.asyncIterator] !== 'function') {
    return {};
  }

  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {};
  }
  const text = Buffer.concat(chunks).toString('utf8').trim();
  return text ? JSON.parse(text) : {};
}

function hasAdminConfig() {
  return Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_SESSION_SECRET);
}

export function assertAdminSession(request) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new AdminError(500, 'internal_error', 'Não foi possível validar a sessão.');
  }
  const token = readSessionToken(request);
  if (!verifySession(token, secret)) {
    throw new AdminError(401, 'unauthorized', 'Sessão administrativa ausente ou inválida.');
  }
}

export async function handleAdminLogin(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'method_not_allowed' });
    return;
  }

  if (!hasAdminConfig()) {
    console.error('[admin-auth] missing configuration', {
      code: 'admin_auth_not_configured',
      name: 'Error',
      message: 'admin authentication is not configured',
    });
    sendJson(response, 500, { error: 'internal_error' });
    return;
  }

  let body;
  try {
    body = await readJsonBody(request);
  } catch {
    sendJson(response, 400, { error: 'validation_error', message: 'JSON inválido.' });
    return;
  }

  const senha = typeof body?.senha === 'string'
    ? body.senha
    : (typeof body?.password === 'string' ? body.password : '');

  if (!passwordsMatch(senha, process.env.ADMIN_PASSWORD)) {
    sendJson(response, 401, { error: 'unauthorized', message: 'Senha inválida.' });
    return;
  }

  const token = signSession(process.env.ADMIN_SESSION_SECRET);
  response.setHeader('Set-Cookie', buildSessionCookie(token, {
    secure: isSecureRequest(request),
  }));
  sendJson(response, 200, { ok: true });
}

export async function handleAdminLogout(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'method_not_allowed' });
    return;
  }

  response.setHeader('Set-Cookie', clearSessionCookie({
    secure: isSecureRequest(request),
  }));
  sendJson(response, 200, { ok: true });
}

export async function handleAdminCatalog(request, response, { getPool, logDatabaseError } = {}) {
  response.setHeader('Cache-Control', 'no-store');

  if (request.method !== 'GET' && request.method !== 'POST') {
    sendJson(response, 405, { error: 'method_not_allowed' });
    return;
  }

  try {
    assertAdminSession(request);
  } catch (error) {
    sendError(response, error);
    return;
  }

  if (typeof getPool !== 'function') {
    sendJson(response, 500, { error: 'internal_error' });
    return;
  }

  try {
    const pool = getPool();
    if (request.method === 'GET') {
      const payload = await getAdminCatalog(pool);
      sendJson(response, 200, payload);
      return;
    }

    let body;
    try {
      body = await readJsonBody(request);
    } catch {
      sendJson(response, 400, { error: 'validation_error', message: 'JSON inválido.' });
      return;
    }

    const result = await executeAdminAction(pool, body);
    sendJson(response, 200, { ok: true, ...result });
  } catch (error) {
    if (!(error instanceof AdminError) && typeof logDatabaseError === 'function') {
      logDatabaseError('[admin-catalog] request failed', error);
    } else if (!(error instanceof AdminError)) {
      console.error('[admin-catalog] request failed', {
        code: error?.code || 'unknown',
        name: error?.name || 'Error',
        message: error?.message || 'unknown error',
      });
    }
    sendError(response, error);
  }
}
