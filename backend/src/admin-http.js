import crypto, { randomUUID } from 'node:crypto';
import {
  buildSessionCookie,
  clearSessionCookie,
  isSecureRequest,
  readSession,
  readSessionToken,
  signSession,
} from './admin-auth.js';
import { AUDIT_ACTIONS, recordAudit } from './admin-audit.js';
import { executeAdminAction, getAdminCatalog } from './admin-catalog.js';
import { assertSameOrigin, isMutableMethod } from './admin-csrf.js';
import { AdminError, toClientError } from './admin-errors.js';
import { getPublicationStatus, createPublicacao, processDuePublications, validatePromotionDryRun } from './admin-publish.js';
import { assertLoginRateLimit } from './admin-rate-limit.js';
import { getReports, toCsv } from './admin-reports.js';
import { captureVenda, listVendas, updateVendaStatus } from './admin-sales.js';
import { cancelScheduledChange, listScheduledChanges, parseSaoPauloDateTime, processDueScheduledChanges, scheduleChange } from './admin-schedule.js';
import { createSignedImageUpload } from './admin-storage.js';
import { createUsuario, findUsuarioByEmail, listUsuarios, resetUsuarioSenha, touchUltimoLogin, updateUsuario } from './admin-users.js';
import { getCatalogPayload } from './catalog.js';
import { broadcastCatalogUpdated, getCatalogRevision } from './catalog-revision.js';
import { verifyPassword } from './password.js';

const GENERIC_LOGIN_ERROR = 'E-mail ou senha inválidos.';

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

function sendText(response, status, contentType, body) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', contentType);
  if (typeof response.status === 'function') {
    response.status(status);
    if (typeof response.send === 'function') {
      response.send(body);
      return;
    }
    response.end(body);
    return;
  }
  response.statusCode = status;
  response.end(body);
}

function sendError(response, error) {
  if (error?.code === 'rate_limited' || error?.status === 429) {
    sendJson(response, 429, { error: 'rate_limited', message: 'Muitas tentativas. Tente novamente em instantes.' });
    return;
  }
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

function requestId(request) {
  return request?.headers?.['x-request-id'] || randomUUID();
}

export function assertAdminSession(request) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new AdminError(500, 'internal_error', 'Não foi possível validar a sessão.');
  }
  const token = readSessionToken(request);
  const session = readSession(token, secret);
  if (!session) {
    throw new AdminError(401, 'unauthorized', 'Sessão administrativa ausente ou inválida.');
  }
  return session;
}

function assertAdminCsrf(request) {
  if (isMutableMethod(request.method)) {
    assertSameOrigin(request);
  }
}

function requirePool(getPool) {
  if (typeof getPool !== 'function') {
    throw new AdminError(500, 'internal_error', 'Não foi possível concluir a operação.');
  }
  return getPool();
}

async function withAdmin(request, response, { getPool, logDatabaseError } = {}, fn) {
  try {
    const session = assertAdminSession(request);
    assertAdminCsrf(request);
    const pool = requirePool(getPool);
    await fn({ pool, session, requestId: requestId(request) });
  } catch (error) {
    if (!(error instanceof AdminError) && typeof logDatabaseError === 'function') {
      logDatabaseError('[admin] request failed', error);
    }
    sendError(response, error);
  }
}

function catalogActionName(recurso, acao) {
  const map = {
    'categoria:criar': AUDIT_ACTIONS.CRIAR_CATEGORIA,
    'categoria:editar': AUDIT_ACTIONS.EDITAR_CATEGORIA,
    'categoria:ativar': AUDIT_ACTIONS.ATIVAR_CATEGORIA,
    'categoria:desativar': AUDIT_ACTIONS.DESATIVAR_CATEGORIA,
    'produto:criar': AUDIT_ACTIONS.CRIAR_PRODUTO,
    'produto:editar': AUDIT_ACTIONS.EDITAR_PRODUTO,
    'produto:ativar': AUDIT_ACTIONS.ATIVAR_PRODUTO,
    'produto:desativar': AUDIT_ACTIONS.DESATIVAR_PRODUTO,
  };
  return map[`${recurso}:${acao}`] || `${String(recurso || '').toUpperCase()}_${String(acao || '').toUpperCase()}`;
}

async function notifyCatalogChanged(pool) {
  try {
    const revision = await getCatalogRevision(pool);
    await broadcastCatalogUpdated(revision.revisao);
  } catch {
    // best-effort
  }
}

async function applyDueJobsIfNeeded(pool) {
  let applied = false;
  try {
    const due = await pool.query(`
      SELECT 1
      FROM app.tab_alteracao_agendada
      WHERE status_alteracao = 'AGENDADA' AND data_vigencia <= now()
      LIMIT 1
    `);
    if (due.rowCount > 0) {
      const results = await processDueScheduledChanges(pool);
      applied = results.some((item) => item.status === 'APLICADA');
    }
  } catch {
    // tabelas novas podem não existir em testes isolados
  }
  try {
    await processDuePublications(pool);
  } catch {
    // publicação ainda não configurada / tabela ausente
  }
  if (applied) {
    await notifyCatalogChanged(pool);
  }
}

export async function handleAdminLogin(request, response, { getPool, logDatabaseError } = {}) {
  response.setHeader('Cache-Control', 'no-store');

  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'method_not_allowed' });
    return;
  }

  if (!process.env.ADMIN_SESSION_SECRET) {
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

  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const senha = typeof body?.senha === 'string'
    ? body.senha
    : (typeof body?.password === 'string' ? body.password : '');

  try {
    assertLoginRateLimit(request, email);
  } catch (error) {
    sendError(response, error);
    return;
  }

  const fail = async (pool) => {
    if (pool) {
      await recordAudit(pool, {
        acao: AUDIT_ACTIONS.LOGIN_FALHA,
        entidade: 'usuario_admin',
        sucesso: false,
        descricao_evento: 'Falha de autenticação administrativa.',
        identificador_requisicao: requestId(request),
      });
    }
    sendJson(response, 401, { error: 'unauthorized', message: GENERIC_LOGIN_ERROR });
  };

  if (!email || !senha) {
    sendJson(response, 401, { error: 'unauthorized', message: GENERIC_LOGIN_ERROR });
    return;
  }

  let pool = null;
  try {
    pool = requirePool(getPool);
    const user = await findUsuarioByEmail(pool, email);
    if (!user || user.ativo !== true || !(await verifyPassword(senha, user.senha_hash, user.senha_salt))) {
      await fail(pool);
      return;
    }

    await touchUltimoLogin(pool, user.id_usuario_admin);
    await recordAudit(pool, {
      id_usuario_admin: user.id_usuario_admin,
      acao: AUDIT_ACTIONS.LOGIN_SUCESSO,
      entidade: 'usuario_admin',
      id_registro: user.id_usuario_admin,
      sucesso: true,
      descricao_evento: 'Login administrativo.',
      identificador_requisicao: requestId(request),
    });

    const token = signSession(process.env.ADMIN_SESSION_SECRET, {
      id_usuario_admin: String(user.id_usuario_admin),
      email: user.email_usuario,
      perfil: user.perfil_usuario,
    });
    response.setHeader('Set-Cookie', buildSessionCookie(token, {
      secure: isSecureRequest(request),
    }));
    sendJson(response, 200, {
      ok: true,
      usuario: {
        id_usuario_admin: String(user.id_usuario_admin),
        nome_usuario: user.nome_usuario,
        email_usuario: user.email_usuario,
        perfil_usuario: user.perfil_usuario,
      },
    });
  } catch (error) {
    if (typeof logDatabaseError === 'function') {
      logDatabaseError('[admin-auth] login failed', error);
    }
    sendError(response, error);
  }
}

export async function handleAdminLogout(request, response, { getPool } = {}) {
  response.setHeader('Cache-Control', 'no-store');

  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'method_not_allowed' });
    return;
  }

  try {
    const secret = process.env.ADMIN_SESSION_SECRET;
    const session = secret ? readSession(readSessionToken(request), secret) : null;
    if (session && typeof getPool === 'function') {
      await recordAudit(getPool(), {
        id_usuario_admin: session.id_usuario_admin,
        acao: AUDIT_ACTIONS.LOGOUT,
        entidade: 'usuario_admin',
        id_registro: session.id_usuario_admin,
        sucesso: true,
        descricao_evento: 'Logout administrativo.',
        identificador_requisicao: requestId(request),
      });
    }
  } catch {
    // logout always clears the cookie
  }

  response.setHeader('Set-Cookie', clearSessionCookie({
    secure: isSecureRequest(request),
  }));
  sendJson(response, 200, { ok: true });
}

export async function handleAdminCatalog(request, response, deps = {}) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET' && request.method !== 'POST') {
    sendJson(response, 405, { error: 'method_not_allowed' });
    return;
  }

  await withAdmin(request, response, deps, async ({ pool, session, requestId: reqId }) => {
    if (request.method === 'GET') {
      sendJson(response, 200, await getAdminCatalog(pool));
      return;
    }

    let body;
    try {
      body = await readJsonBody(request);
    } catch {
      sendJson(response, 400, { error: 'validation_error', message: 'JSON inválido.' });
      return;
    }

    const dados = body.dados || body;
    const aplicar = String(dados.aplicar || body.aplicar || 'agora').toLowerCase();
    const recurso = body.recurso;
    const acao = body.acao;
    const id = body.id || body.id_categoria || body.id_produto || dados.id_categoria || dados.id_produto;

    if (aplicar === 'agendar') {
      const vigencia = parseSaoPauloDateTime(dados.data_agendada || body.data_agendada, dados.hora_agendada || body.hora_agendada);
      const scheduled = await scheduleChange(pool, {
        id_usuario_admin: session.id_usuario_admin,
        tipo_entidade: recurso === 'categoria' ? 'CATEGORIA' : 'PRODUTO',
        id_registro: id || randomUUID(),
        data_vigencia: vigencia,
        dados_alteracao: { ...dados, recurso, acao, id },
      });
      await recordAudit(pool, {
        id_usuario_admin: session.id_usuario_admin,
        acao: AUDIT_ACTIONS.AGENDAR_ALTERACAO,
        entidade: recurso,
        id_registro: scheduled.id_registro,
        sucesso: true,
        descricao_evento: 'Alteração agendada.',
        identificador_requisicao: reqId,
      });
      sendJson(response, 200, { ok: true, agendada: true, alteracao: scheduled });
      return;
    }

    const result = await executeAdminAction(pool, body);
    await recordAudit(pool, {
      id_usuario_admin: session.id_usuario_admin,
      acao: catalogActionName(recurso, acao),
      entidade: recurso,
      id_registro: result?.categoria?.id_categoria || result?.produto?.id_produto || id,
      sucesso: true,
      descricao_evento: 'Alteração imediata de catálogo.',
      identificador_requisicao: reqId,
    });
    await notifyCatalogChanged(pool);
    sendJson(response, 200, { ok: true, ...result });
  });
}

export async function handleAdminVendas(request, response, deps = {}) {
  response.setHeader('Cache-Control', 'no-store');
  await withAdmin(request, response, deps, async ({ pool, session, requestId: reqId }) => {
    if (request.method === 'GET') {
      const url = new URL(request.url || 'http://localhost/api/admin/vendas', 'http://localhost');
      const vendas = await listVendas(pool, Object.fromEntries(url.searchParams.entries()));
      sendJson(response, 200, { vendas });
      return;
    }
    if (request.method !== 'POST') {
      sendJson(response, 405, { error: 'method_not_allowed' });
      return;
    }
    const body = await readJsonBody(request);
    const venda = await updateVendaStatus(pool, body.id_venda || body.id, body.status_venda || body.status);
    await recordAudit(pool, {
      id_usuario_admin: session.id_usuario_admin,
      acao: venda.status_venda === 'CONFIRMADA' ? AUDIT_ACTIONS.CONFIRMAR_VENDA : AUDIT_ACTIONS.CANCELAR_VENDA,
      entidade: 'venda',
      id_registro: venda.id_venda,
      sucesso: true,
      identificador_requisicao: reqId,
    });
    sendJson(response, 200, { ok: true, venda });
  });
}

export async function handleAdminRelatorios(request, response, deps = {}) {
  response.setHeader('Cache-Control', 'no-store');
  await withAdmin(request, response, deps, async ({ pool }) => {
    if (request.method !== 'GET') {
      sendJson(response, 405, { error: 'method_not_allowed' });
      return;
    }
    const url = new URL(request.url || 'http://localhost/api/admin/relatorios', 'http://localhost');
    const query = Object.fromEntries(url.searchParams.entries());
    const reports = await getReports(pool, query);
    if (query.formato === 'csv') {
      const secao = query.secao || 'vendas';
      let csv = '';
      if (secao === 'produtos') {
        csv = toCsv(reports.produtos, [
          { key: 'nome_produto', label: 'Produto' },
          { key: 'quantidade', label: 'Quantidade' },
          { key: 'receita_centavos', label: 'Receita centavos' },
        ]);
      } else if (secao === 'auditoria') {
        csv = toCsv(reports.auditoria, [
          { key: 'data_evento', label: 'Data' },
          { key: 'acao', label: 'Acao' },
          { key: 'entidade', label: 'Entidade' },
          { key: 'sucesso', label: 'Sucesso' },
          { key: 'descricao_evento', label: 'Descricao' },
        ]);
      } else {
        csv = toCsv(reports.vendas.por_dia, [
          { key: 'dia', label: 'Dia' },
          { key: 'pedidos', label: 'Pedidos' },
          { key: 'confirmadas', label: 'Confirmadas' },
          { key: 'faturamento_centavos', label: 'Faturamento centavos' },
        ]);
      }
      sendText(response, 200, 'text/csv; charset=utf-8', csv);
      return;
    }
    sendJson(response, 200, reports);
  });
}

export async function handleAdminAuditoria(request, response, deps = {}) {
  response.setHeader('Cache-Control', 'no-store');
  await withAdmin(request, response, deps, async ({ pool }) => {
    if (request.method !== 'GET') {
      sendJson(response, 405, { error: 'method_not_allowed' });
      return;
    }
    const url = new URL(request.url || 'http://localhost/api/admin/auditoria', 'http://localhost');
    const query = Object.fromEntries(url.searchParams.entries());
    const params = [];
    const where = [];
    if (query.acao) {
      params.push(query.acao);
      where.push(`acao = $${params.length}`);
    }
    if (query.entidade) {
      params.push(query.entidade);
      where.push(`entidade = $${params.length}`);
    }
    if (query.sucesso === 'true' || query.sucesso === 'false') {
      params.push(query.sucesso === 'true');
      where.push(`sucesso = $${params.length}`);
    }
    const sql = `-- op:list_auditoria
      SELECT a.id_auditoria, a.id_usuario_admin, u.nome_usuario, u.email_usuario,
             a.acao, a.entidade, a.id_registro, a.sucesso, a.descricao_evento, a.data_evento
      FROM app.tab_auditoria_admin a
      LEFT JOIN app.tab_usuario_admin u ON u.id_usuario_admin = a.id_usuario_admin
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY a.data_evento DESC
      LIMIT 300
    `;
    const result = await pool.query(sql, params);
    if (query.formato === 'csv') {
      sendText(response, 200, 'text/csv; charset=utf-8', toCsv(result.rows, [
        { key: 'data_evento', label: 'Data' },
        { key: 'email_usuario', label: 'Usuario' },
        { key: 'acao', label: 'Acao' },
        { key: 'entidade', label: 'Entidade' },
        { key: 'id_registro', label: 'Registro' },
        { key: 'sucesso', label: 'Sucesso' },
        { key: 'descricao_evento', label: 'Descricao' },
      ]));
      return;
    }
    sendJson(response, 200, { eventos: result.rows });
  });
}

export async function handleAdminUsuarios(request, response, deps = {}) {
  response.setHeader('Cache-Control', 'no-store');
  await withAdmin(request, response, deps, async ({ pool, session, requestId: reqId }) => {
    if (request.method === 'GET') {
      sendJson(response, 200, { usuarios: await listUsuarios(pool) });
      return;
    }
    if (request.method !== 'POST') {
      sendJson(response, 405, { error: 'method_not_allowed' });
      return;
    }
    const body = await readJsonBody(request);
    const acao = body.acao;
    let result;
    if (acao === 'criar') {
      result = { usuario: await createUsuario(pool, body.dados || body) };
      await recordAudit(pool, {
        id_usuario_admin: session.id_usuario_admin,
        acao: AUDIT_ACTIONS.CRIAR_USUARIO,
        entidade: 'usuario_admin',
        id_registro: result.usuario.id_usuario_admin,
        sucesso: true,
        identificador_requisicao: reqId,
      });
    } else if (acao === 'editar') {
      result = { usuario: await updateUsuario(pool, body.id, body.dados || body, session) };
      await recordAudit(pool, {
        id_usuario_admin: session.id_usuario_admin,
        acao: AUDIT_ACTIONS.EDITAR_USUARIO,
        entidade: 'usuario_admin',
        id_registro: result.usuario.id_usuario_admin,
        sucesso: true,
        identificador_requisicao: reqId,
      });
    } else if (acao === 'redefinir_senha') {
      result = await resetUsuarioSenha(pool, body.id, body.senha || body.dados?.senha);
      await recordAudit(pool, {
        id_usuario_admin: session.id_usuario_admin,
        acao: AUDIT_ACTIONS.REDEFINIR_SENHA,
        entidade: 'usuario_admin',
        id_registro: body.id,
        sucesso: true,
        identificador_requisicao: reqId,
      });
    } else {
      throw new AdminError(400, 'validation_error', 'Ação de usuário inválida.');
    }
    sendJson(response, 200, { ok: true, ...result });
  });
}

export async function handleAdminAlteracoes(request, response, deps = {}) {
  response.setHeader('Cache-Control', 'no-store');
  await withAdmin(request, response, deps, async ({ pool, session, requestId: reqId }) => {
    if (request.method === 'GET') {
      sendJson(response, 200, { alteracoes: await listScheduledChanges(pool) });
      return;
    }
    if (request.method !== 'POST') {
      sendJson(response, 405, { error: 'method_not_allowed' });
      return;
    }
    const body = await readJsonBody(request);
    if (body.acao === 'cancelar') {
      const alteracao = await cancelScheduledChange(pool, body.id || body.id_alteracao_agendada);
      await recordAudit(pool, {
        id_usuario_admin: session.id_usuario_admin,
        acao: AUDIT_ACTIONS.CANCELAR_ALTERACAO,
        entidade: 'alteracao_agendada',
        id_registro: alteracao.id_alteracao_agendada,
        sucesso: true,
        identificador_requisicao: reqId,
      });
      sendJson(response, 200, { ok: true, alteracao });
      return;
    }
    throw new AdminError(400, 'validation_error', 'Ação inválida.');
  });
}

export async function handleAdminPublicacoes(request, response, deps = {}) {
  response.setHeader('Cache-Control', 'no-store');
  await withAdmin(request, response, deps, async ({ pool, session, requestId: reqId }) => {
    if (request.method === 'GET') {
      sendJson(response, 200, await getPublicationStatus(pool));
      return;
    }
    if (request.method !== 'POST') {
      sendJson(response, 405, { error: 'method_not_allowed' });
      return;
    }
    const body = await readJsonBody(request);
    if (body.acao === 'validar' && !body.persistir) {
      sendJson(response, 200, validatePromotionDryRun());
      return;
    }
    const publicacao = await createPublicacao(pool, body, session);
    await recordAudit(pool, {
      id_usuario_admin: session.id_usuario_admin,
      acao: AUDIT_ACTIONS.PUBLICACAO_HML_PROD,
      entidade: 'publicacao',
      id_registro: publicacao.id_publicacao,
      sucesso: publicacao.status_publicacao !== 'ERRO',
      descricao_evento: publicacao.mensagem_erro || 'Registro de publicação.',
      identificador_requisicao: reqId,
    });
    sendJson(response, 200, { ok: true, publicacao });
  });
}

export async function handleAdminUploadUrl(request, response, deps = {}) {
  response.setHeader('Cache-Control', 'no-store');
  await withAdmin(request, response, deps, async () => {
    if (request.method !== 'POST') {
      sendJson(response, 405, { error: 'method_not_allowed' });
      return;
    }
    const body = await readJsonBody(request);
    const payload = await createSignedImageUpload(body);
    sendJson(response, 200, payload);
  });
}

export async function handlePublicVenda(request, response, { getPool, logDatabaseError } = {}) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST') {
    sendJson(response, 405, { error: 'method_not_allowed' });
    return;
  }
  try {
    const body = await readJsonBody(request);
    const result = await captureVenda(requirePool(getPool), body);
    sendJson(response, 200, { ok: true, ...result });
  } catch (error) {
    if (!(error instanceof AdminError) && typeof logDatabaseError === 'function') {
      logDatabaseError('[vendas] request failed', error);
    }
    sendError(response, error);
  }
}

export async function handleCatalogRevision(request, response, { getPool, logDatabaseError } = {}) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') {
    sendJson(response, 405, { error: 'method_not_allowed' });
    return;
  }
  try {
    const pool = requirePool(getPool);
    await applyDueJobsIfNeeded(pool);
    sendJson(response, 200, await getCatalogRevision(pool));
  } catch (error) {
    if (typeof logDatabaseError === 'function') {
      logDatabaseError('[catalog-revisao] request failed', error);
    }
    sendJson(response, 503, { error: 'catalog_unavailable' });
  }
}

export async function handlePublicCatalog(request, response, { getPool, logDatabaseError } = {}) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') {
    sendJson(response, 405, { error: 'method_not_allowed' });
    return;
  }
  try {
    const pool = requirePool(getPool);
    await applyDueJobsIfNeeded(pool);
    sendJson(response, 200, await getCatalogPayload(pool));
  } catch (error) {
    if (typeof logDatabaseError === 'function') {
      logDatabaseError('[catalog-api] database request failed', error);
    }
    sendJson(response, 503, { error: 'catalog_unavailable' });
  }
}

function secretsMatch(provided, expected) {
  if (!expected) return false;
  const a = Buffer.from(String(provided || ''));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) {
    crypto.timingSafeEqual(b, b);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function assertInternalSecret(request) {
  const internal = String(process.env.INTERNAL_JOB_SECRET || '').trim();
  const cron = String(process.env.CRON_SECRET || '').trim();
  if (!internal && !cron) {
    throw new AdminError(500, 'internal_error', 'Job interno não configurado.');
  }
  const provided = String(
    request?.headers?.['x-internal-job-secret']
    || String(request?.headers?.authorization || '').replace(/^Bearer\s+/i, ''),
  ).trim();
  if (secretsMatch(provided, internal) || secretsMatch(provided, cron)) {
    return;
  }
  throw new AdminError(401, 'unauthorized', 'Não autorizado.');
}

export async function handleProcessScheduledChanges(request, response, { getPool, logDatabaseError } = {}) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST' && request.method !== 'GET') {
    sendJson(response, 405, { error: 'method_not_allowed' });
    return;
  }
  try {
    assertInternalSecret(request);
    const results = await processDueScheduledChanges(requirePool(getPool));
    if (results.some((item) => item.status === 'APLICADA')) {
      await notifyCatalogChanged(requirePool(getPool));
    }
    sendJson(response, 200, { ok: true, results });
  } catch (error) {
    if (typeof logDatabaseError === 'function') {
      logDatabaseError('[jobs] scheduled changes failed', error);
    }
    sendError(response, error);
  }
}

export async function handleProcessPublications(request, response, { getPool, logDatabaseError } = {}) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'POST' && request.method !== 'GET') {
    sendJson(response, 405, { error: 'method_not_allowed' });
    return;
  }
  try {
    assertInternalSecret(request);
    const result = await processDuePublications(requirePool(getPool));
    sendJson(response, 200, { ok: true, ...result });
  } catch (error) {
    if (typeof logDatabaseError === 'function') {
      logDatabaseError('[jobs] publications failed', error);
    }
    sendError(response, error);
  }
}
