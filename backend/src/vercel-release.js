// Adapter server-side ISOLADO para a orquestracao de release PROD via API Vercel.
//
// V15: somente prepara e testa. Nada aqui e chamado com rede real nesta fase:
//  - `fetchImpl` e injetavel (testes usam fake);
//  - o cliente recusa (zero fetch) se PROMOCAO_PROD_HABILITADA != true;
//  - o cliente recusa (zero fetch) se a config/SHA estiver incompleta ou invalida.
//
// P10-H1 (hardening local):
//  - isolamento HML x PROD: projeto HML ou nome PROD diferente bloqueiam ANTES de qualquer fetch;
//  - preflight read-only (GET) obrigatorio antes do POST; falha/mismatch/timeout => zero POST;
//  - deployment so e READY com evidencia explicita: target production, SHA aprovado e projeto PROD;
//  - um SHA recebe no maximo um POST por processo (sem retry automatico). Timeout/erro pos-POST
//    continua fail-closed. Guarda por processo: NAO e garantia entre instancias (ver REQUIRES_MIGRATION).
//  - verificacao pos-release read-only (verifyPostReleaseDeployment). Alias: sem contrato, nao verificado.
//
// O projeto PROD nao tem Git conectado de proposito: o deployment e criado
// explicitamente (POST /v13/deployments com gitSource + SHA exato, target=production).
// O token vive so em memoria server-side e nunca entra em resposta, log ou erro.

import { AdminError } from './admin-errors.js';

export const VERCEL_API_BASE = 'https://api.vercel.com';
export const DEFAULT_GIT_REF = 'homologacao';
export const RELEASE_TARGET = 'production';
export const PROD_PROJECT_NAME = 'amanteigadoslivia';
export const HML_PROJECT_NAME = 'amanteigados-livia-homolog';

export const RELEASE_STATE = Object.freeze({
  CREATED: 'CREATED',
  BUILDING: 'BUILDING',
  READY: 'READY',
  ERROR: 'ERROR',
  CANCELED: 'CANCELED',
  TIMEOUT: 'TIMEOUT',
});

export const RELEASE_GUARD_STATE = Object.freeze({
  RESERVED: 'RESERVED',
  POSTED: 'POSTED',
});

// Guarda por processo: SHA -> RESERVED (preflight em curso) | POSTED (POST tentado).
// Compartilhada entre clientes do mesmo processo; testes injetam um Map proprio.
const PROCESS_RELEASE_GUARD = new Map();

export const POLL_DEFAULTS = Object.freeze({
  intervalMs: 3000,
  timeoutMs: 45000,
  maxAttempts: 15,
});

const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const GIT_NAME_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;
const REF_PATTERN = /^[A-Za-z0-9._\/-]{1,200}$/;

export class ReleaseError extends AdminError {
  constructor(status, code, message, { called = false } = {}) {
    // Defesa em profundidade: nenhum Bearer token sobrevive em mensagem de erro.
    super(status, code, redactSecrets(message));
    this.name = 'ReleaseError';
    // true somente quando algum request de rede foi tentado.
    this.called = called;
  }
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function isValidSha(sha) {
  return typeof sha === 'string' && SHA_PATTERN.test(sha);
}

function promotionEnabled(env) {
  return clean(env.PROMOCAO_PROD_HABILITADA).toLowerCase() === 'true';
}

// Dominio PROD esperado (hostname, sem protocolo). Invalido ou ausente vira '' => fail-closed.
const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

// Sem normalizacao silenciosa: protocolo, barra ou caminho invalidam a config (fail-closed).
export function normalizeDomain(value) {
  const cleaned = clean(value).toLowerCase();
  return DOMAIN_PATTERN.test(cleaned) ? cleaned : '';
}

// Le SOMENTE server-side. Nunca logar nem devolver este objeto.
export function readReleaseConfig(env = process.env) {
  return {
    token: clean(env.VERCEL_RELEASE_TOKEN),
    teamId: clean(env.VERCEL_TEAM_ID),
    projectId: clean(env.VERCEL_PROD_PROJECT_ID),
    projectName: clean(env.VERCEL_PROD_PROJECT_NAME),
    gitOwner: clean(env.VERCEL_RELEASE_GIT_OWNER),
    gitRepo: clean(env.VERCEL_RELEASE_GIT_REPO),
    gitRef: clean(env.VERCEL_RELEASE_GIT_REF) || DEFAULT_GIT_REF,
    prodDomain: normalizeDomain(env.VERCEL_PROD_DOMAIN),
  };
}

export function isReleaseConfigComplete(config) {
  return Boolean(
    config.token
    && ID_PATTERN.test(config.teamId)
    && (ID_PATTERN.test(config.projectId) || ID_PATTERN.test(config.projectName))
    && GIT_NAME_PATTERN.test(config.gitOwner)
    && GIT_NAME_PATTERN.test(config.gitRepo)
    && REF_PATTERN.test(config.gitRef)
    && config.prodDomain,
  );
}

// B6: GET read-only do deployment PROD atual (anterior ao novo POST). Nunca POST.
export function buildPreviousProductionRequest(config, projectId, baseUrl = VERCEL_API_BASE) {
  return {
    method: 'GET',
    url: `${baseUrl}/v6/deployments?teamId=${encodeURIComponent(config.teamId)}&projectId=${encodeURIComponent(projectId)}&target=production&state=READY&limit=1`,
  };
}

// Sem deployment de producao previo (primeiro release) => null. Resposta malformada => erro (fail-closed).
export function parsePreviousProductionId(payload) {
  const list = payload?.deployments;
  if (!Array.isArray(list)) {
    throw new ReleaseError(502, 'release_previous_unproven', 'Resposta sem lista de deployments de produção.', { called: true });
  }
  if (list.length === 0) return null;
  const first = list[0] && typeof list[0] === 'object' ? list[0] : {};
  const id = typeof first.uid === 'string' ? first.uid : (typeof first.id === 'string' ? first.id : '');
  const state = first.readyState ?? first.state;
  if (!ID_PATTERN.test(id) || (state !== undefined && String(state).toUpperCase() !== 'READY')) {
    throw new ReleaseError(502, 'release_previous_unproven', 'Deployment de produção anterior não identificável.', { called: true });
  }
  return id;
}

// B2: alias do deployment PROD contem o dominio esperado. Contrato de alias de production NAO comprovado offline.
function aliasState(alias, domain) {
  if (!Array.isArray(alias) || alias.length === 0) return 'MISSING';
  const hit = alias.some((item) => typeof item === 'string' && item.trim().toLowerCase() === domain);
  return hit ? 'VERIFIED' : 'MISMATCH';
}

export function redactSecrets(text, secrets = []) {
  let out = String(text ?? '');
  for (const secret of secrets) {
    if (secret) out = out.split(secret).join('[redacted]');
  }
  return out.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
}

// Request PUBLICO do deployment (sem token). Exatamente o que sera enviado, menos o header.
export function buildDeploymentRequest(config, sha, baseUrl = VERCEL_API_BASE) {
  // name vem somente do nome PROD (config ou comprovado pelo preflight); nunca do projectId.
  return {
    method: 'POST',
    url: `${baseUrl}/v13/deployments?teamId=${encodeURIComponent(config.teamId)}`,
    body: {
      name: config.projectName,
      project: config.projectId || config.projectName,
      target: RELEASE_TARGET,
      gitSource: {
        type: 'github',
        org: config.gitOwner,
        repo: config.gitRepo,
        ref: config.gitRef,
        sha,
      },
    },
  };
}

export function mapReadyState(readyState) {
  switch (String(readyState || '').toUpperCase()) {
    case 'READY': return RELEASE_STATE.READY;
    case 'ERROR': return RELEASE_STATE.ERROR;
    case 'CANCELED': return RELEASE_STATE.CANCELED;
    case 'BUILDING': return RELEASE_STATE.BUILDING;
    case 'QUEUED':
    case 'INITIALIZING': return RELEASE_STATE.CREATED;
    // Estado desconhecido nunca vira READY: segue nao-terminal ate o timeout.
    default: return RELEASE_STATE.BUILDING;
  }
}

const TERMINAL = new Set([RELEASE_STATE.READY, RELEASE_STATE.ERROR, RELEASE_STATE.CANCELED]);

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function positiveInt(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

// Isolamento HML x PROD decidido SOMENTE com a config local, antes de qualquer fetch.
// Config ID-only (sem nome) e confirmada depois, pelo nome devolvido no GET (assertPreflightIsProd).
export function assertProdProjectIdentity(config) {
  if (config.projectName === HML_PROJECT_NAME) {
    throw new ReleaseError(409, 'release_hml_project_blocked', 'Configuração de produção aponta para o projeto HML. Release bloqueado.');
  }
  if (config.projectName && config.projectName !== PROD_PROJECT_NAME) {
    throw new ReleaseError(409, 'release_wrong_project_name', 'Nome do projeto de produção diferente do esperado. Release bloqueado.');
  }
}

// Depois do GET: o projeto realmente retornado precisa ser o PROD (exigido para config ID-only).
function assertPreflightIsProd(access) {
  if (access.projectName === HML_PROJECT_NAME) {
    throw new ReleaseError(409, 'release_hml_project_blocked', 'Projeto retornado é o projeto HML. Release bloqueado.', { called: true });
  }
  if (access.projectName !== PROD_PROJECT_NAME) {
    throw new ReleaseError(502, 'release_project_mismatch', 'Projeto retornado não é o projeto de produção esperado.', { called: true });
  }
}

// Divergencia explicita em QUALQUER estado e evidencia contraria: falha imediata.
function findMismatch(body, expected) {
  if ('target' in body && body.target !== RELEASE_TARGET) return 'target_mismatch';
  const reportedSha = body.meta?.githubCommitSha;
  if (reportedSha !== undefined && (typeof reportedSha !== 'string' || reportedSha.toLowerCase() !== expected.sha)) {
    return 'sha_mismatch';
  }
  if ('name' in body && body.name !== PROD_PROJECT_NAME) return 'project_mismatch';
  if ('projectId' in body && expected.projectId && body.projectId !== expected.projectId) return 'project_mismatch';
  return null;
}

// READY exige evidencia POSITIVA de target, SHA e projeto. Ausencia nunca e sucesso.
// Projeto provado = nome PROD OU projectId igual ao identificador esperado (nunca "qualquer projectId").
function readyEvidenceGap(body, expected) {
  if (body.target === undefined) return 'target_missing';
  if (body.meta?.githubCommitSha === undefined) return 'sha_missing';
  // B7: a identidade e o projectId esperado. Nome nunca substitui o ID (sem fallback para nome).
  if (!expected.projectId || body.projectId !== expected.projectId) return 'project_missing';
  return null;
}

// Evidencia do deployment: mismatch falha em qualquer estado; READY sem evidencia completa vira ERROR.
function evaluateDeployment(payload, expected) {
  const body = payload && typeof payload === 'object' ? payload : {};
  const state = mapReadyState(body.readyState ?? body.status);
  const mismatch = findMismatch(body, expected);
  if (mismatch) return { state: RELEASE_STATE.ERROR, reason: mismatch };
  if (state === RELEASE_STATE.READY) {
    const gap = readyEvidenceGap(body, expected);
    if (gap) return { state: RELEASE_STATE.ERROR, reason: gap };
  }
  return { state, reason: null };
}

function defaultScheduleTimeout(fn, ms) {
  return setTimeout(fn, ms);
}

function defaultClearTimeout(handle) {
  clearTimeout(handle);
}

export const ACCESS_CHECK_DEFAULTS = Object.freeze({
  timeoutMs: 10000,
});

// Limita uma operacao assincrona inteira (fetch + leitura do body) por tempo.
// O abort sinaliza o fetch; o race garante que um fetch que ignora o signal tambem nao pendura o fluxo.
async function withTimeout(run, { timeoutMs, scheduleTimeout, clearTimeoutImpl, what }) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = scheduleTimeout(() => {
      reject(new ReleaseError(504, 'release_api_timeout', `Timeout ao ${what}.`, { called: true }));
      if (controller) controller.abort();
    }, timeoutMs);
  });
  try {
    return await Promise.race([run(controller ? controller.signal : undefined), timeout]);
  } finally {
    clearTimeoutImpl(timer);
  }
}

// Config minima para o preflight read-only: token, team e projeto (id OU name).
// Nao exige git owner/repo/ref: isso e exclusivo do fluxo de deployment.
function hasProjectAccessConfig(config) {
  return Boolean(
    config.token
    && ID_PATTERN.test(config.teamId)
    && (ID_PATTERN.test(config.projectId) || ID_PATTERN.test(config.projectName)),
  );
}

// Request PUBLICO de leitura do projeto (sem token). GET puro, sem body.
export function buildProjectAccessRequest(config, baseUrl = VERCEL_API_BASE) {
  const projectRef = config.projectId || config.projectName;
  return {
    method: 'GET',
    url: `${baseUrl}/v9/projects/${encodeURIComponent(projectRef)}?teamId=${encodeURIComponent(config.teamId)}`,
  };
}

// Unico ponto de GET autenticado: timeout limitado, erros sem token, nunca POST.
async function readOnlyGet(url, token, { fetchImpl, timeoutMs, scheduleTimeout, clearTimeoutImpl }, what) {
  return withTimeout(async (signal) => {
    let res;
    try {
      res = await fetchImpl(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        ...(signal ? { signal } : {}),
      });
    } catch {
      throw new ReleaseError(502, 'release_api_error', `Falha de rede ao ${what}.`, { called: true });
    }

    // Leitura do body dentro do mesmo limite de tempo do GET.
    let payload = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }

    if (!res?.ok) {
      throw new ReleaseError(502, 'release_api_error', `API Vercel retornou HTTP ${Number(res?.status) || 0} ao ${what}.`, { called: true });
    }
    return payload;
  }, { timeoutMs, scheduleTimeout, clearTimeoutImpl, what });
}

// Preflight READ-ONLY: confirma autenticacao + team + projeto sem criar deployment.
// GET exclusivo. Nunca faz fallback para POST nem toca /deployments.
export async function verifyVercelProjectAccess(options = {}) {
  const {
    env = process.env,
    fetchImpl = globalThis.fetch,
    baseUrl = VERCEL_API_BASE,
    scheduleTimeout = defaultScheduleTimeout,
    clearTimeoutImpl = defaultClearTimeout,
  } = options;
  const timeoutMs = positiveInt(options.timeoutMs, ACCESS_CHECK_DEFAULTS.timeoutMs);

  // 1) Config minima presente e valida. Fail-closed antes de qualquer fetch.
  const config = readReleaseConfig(env);
  if (!hasProjectAccessConfig(config) || typeof fetchImpl !== 'function') {
    throw new ReleaseError(409, 'release_not_configured', 'Verificação de acesso ao projeto não configurada.');
  }

  const request = buildProjectAccessRequest(config, baseUrl);
  const payload = await readOnlyGet(
    request.url,
    config.token,
    { fetchImpl, timeoutMs, scheduleTimeout, clearTimeoutImpl },
    'verificar acesso ao projeto na API Vercel',
  );

  const projectId = typeof payload?.id === 'string' ? payload.id : '';
  const projectName = typeof payload?.name === 'string' ? payload.name : '';
  if (!projectId && !projectName) {
    throw new ReleaseError(502, 'release_api_error', 'API Vercel não retornou identificação do projeto.', { called: true });
  }
  // Com ID configurado, o id devolvido precisa ser exatamente o configurado: resposta sem id nao comprova o projeto.
  if (config.projectId && projectId !== config.projectId) {
    throw new ReleaseError(502, 'release_project_mismatch', 'Projeto retornado não corresponde à configuração.', { called: true });
  }
  if (config.projectName && projectName && projectName !== config.projectName) {
    throw new ReleaseError(502, 'release_project_mismatch', 'Projeto retornado não corresponde à configuração.', { called: true });
  }

  return { ok: true, projectId, projectName };
}

// Verificacao POS-release, read-only: GET do deployment criado e avaliacao de projeto/target/SHA/readyState.
// Alias/dominio NAO e verificado (sem contrato local conhecido): retorna alias = NOT_VERIFIED.
export async function verifyPostReleaseDeployment(options = {}) {
  const {
    env = process.env,
    fetchImpl = globalThis.fetch,
    baseUrl = VERCEL_API_BASE,
    scheduleTimeout = defaultScheduleTimeout,
    clearTimeoutImpl = defaultClearTimeout,
    deploymentId,
    sha,
    expectedProjectId,
  } = options;
  const timeoutMs = positiveInt(options.timeoutMs, ACCESS_CHECK_DEFAULTS.timeoutMs);

  const config = readReleaseConfig(env);
  if (!hasProjectAccessConfig(config) || typeof fetchImpl !== 'function') {
    throw new ReleaseError(409, 'release_not_configured', 'Verificação pós-release não configurada.');
  }
  assertProdProjectIdentity(config);
  // Identidade explicita e obrigatoria: ID configurado OU projectId resolvido no preflight (argumento).
  // Sem ela nao ha como provar o projeto do deployment: fail-closed antes do fetch.
  const suppliedId = clean(expectedProjectId);
  if (config.projectId && suppliedId && suppliedId !== config.projectId) {
    throw new ReleaseError(409, 'release_identity_unproven', 'Identidade do projeto divergente da configuração. Verificação bloqueada.');
  }
  const identityId = config.projectId || suppliedId;
  if (!ID_PATTERN.test(identityId)) {
    throw new ReleaseError(409, 'release_identity_unproven', 'Identidade do projeto não comprovada para verificação pós-release.');
  }
  if (!isValidSha(sha)) {
    throw new ReleaseError(409, 'invalid_sha', 'SHA de release inválido.');
  }
  if (typeof deploymentId !== 'string' || !ID_PATTERN.test(deploymentId)) {
    throw new ReleaseError(409, 'invalid_deployment_id', 'Id de deployment inválido.');
  }
  // B2: dominio PROD esperado e obrigatorio antes do fetch (sem ele nao ha como comprovar o alias).
  if (!config.prodDomain) {
    throw new ReleaseError(409, 'release_domain_not_configured', 'Domínio de produção não configurado para verificação pós-release.');
  }
  const exactSha = sha.toLowerCase();

  const url = `${baseUrl}/v13/deployments/${encodeURIComponent(deploymentId)}?teamId=${encodeURIComponent(config.teamId)}`;
  const body = await readOnlyGet(
    url,
    config.token,
    { fetchImpl, timeoutMs, scheduleTimeout, clearTimeoutImpl },
    'consultar o deployment na API Vercel',
  );
  const evaluation = evaluateDeployment(body, { sha: exactSha, projectId: identityId });
  let alias = 'NOT_EVALUATED';
  let reason = evaluation.reason;
  if (evaluation.state === RELEASE_STATE.READY) {
    alias = aliasState(body.alias, config.prodDomain);
    if (alias !== 'VERIFIED') reason = alias === 'MISSING' ? 'alias_missing' : 'alias_mismatch';
  }
  return {
    ok: evaluation.state === RELEASE_STATE.READY && alias === 'VERIFIED',
    state: evaluation.state,
    reason,
    deploymentId,
    sha: exactSha,
    alias,
  };
}

export function createVercelReleaseClient(options = {}) {
  const {
    env = process.env,
    fetchImpl = globalThis.fetch,
    sleep = defaultSleep,
    now = Date.now,
    baseUrl = VERCEL_API_BASE,
    attemptGuard = PROCESS_RELEASE_GUARD,
    scheduleTimeout = defaultScheduleTimeout,
    clearTimeoutImpl = defaultClearTimeout,
    accessTimeoutMs,
    requestTimeoutMs,
  } = options;
  const intervalMs = positiveInt(options.pollIntervalMs, POLL_DEFAULTS.intervalMs);
  const timeoutMs = positiveInt(options.pollTimeoutMs, POLL_DEFAULTS.timeoutMs);
  const maxAttempts = positiveInt(options.maxAttempts, POLL_DEFAULTS.maxAttempts);
  const perRequestTimeoutMs = positiveInt(requestTimeoutMs, ACCESS_CHECK_DEFAULTS.timeoutMs);

  // Criacao do deployment (POST) e polling limitado. So e chamada apos preflight PASS.
  async function deployAndPoll(config, exactSha, previousProductionDeploymentId) {
    const headers = {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    };
    const expected = { sha: exactSha, projectId: config.projectId };

    // Cada request tem limite proprio (fetch + body). Timeout nunca libera nova tentativa aqui.
    async function call(method, url, body, what) {
      return withTimeout(async (signal) => {
        let res;
        try {
          res = await fetchImpl(url, {
            method,
            headers,
            ...(signal ? { signal } : {}),
            ...(body ? { body: JSON.stringify(body) } : {}),
          });
        } catch {
          // Erro de transporte SEM resposta HTTP. Nao repassa a mensagem original: so o motivo generico.
          throw new ReleaseError(502, 'release_network_error', 'Falha de rede ao contatar a API Vercel.', { called: true });
        }
        let payload = null;
        try {
          payload = await res.json();
        } catch {
          payload = null;
        }
        if (!res.ok) {
          const vercelCode = typeof payload?.error?.code === 'string' && /^[a-z_]{1,64}$/.test(payload.error.code)
            ? ` (${payload.error.code})`
            : '';
          throw new ReleaseError(
            502,
            'release_api_error',
            `API Vercel retornou HTTP ${Number(res.status) || 0}${vercelCode}.`,
            { called: true },
          );
        }
        return payload || {};
      }, { timeoutMs: perRequestTimeoutMs, scheduleTimeout, clearTimeoutImpl, what });
    }

    const request = buildDeploymentRequest(config, exactSha, baseUrl);
    let created;
    try {
      created = await call(request.method, request.url, request.body, 'criar o deployment na API Vercel');
    } catch (error) {
      // Timeout ou falha de transporte sem resposta: o POST pode ter chegado e sido processado pela Vercel.
      // Resultado remoto DESCONHECIDO, nunca "nao criado". HTTP nao-2xx confirmado segue como release_api_error.
      if (error?.code === 'release_api_timeout' || error?.code === 'release_network_error') {
        throw new ReleaseError(
          504,
          'release_post_outcome_unknown',
          'Não foi possível confirmar o resultado do POST do deployment: ele pode ter sido criado. Não repetir automaticamente.',
          { called: true },
        );
      }
      throw error;
    }
    const deploymentId = typeof created.id === 'string' ? created.id : '';
    if (!ID_PATTERN.test(deploymentId)) {
      // HTTP 2xx sem ID utilizável: o POST foi aceito, mas o deployment não é identificável.
      // Estado remoto DESCONHECIDO (não é falha confirmada). Sem retry; guarda permanece POSTED.
      throw new ReleaseError(
        502,
        'release_post_outcome_unknown',
        'O POST foi respondido com sucesso HTTP, mas não foi possível identificar o deployment; não é possível confirmar com segurança o estado remoto. Não repetir automaticamente.',
        { called: true },
      );
    }

    const result = (state, reason, attempts) => ({
      ok: state === RELEASE_STATE.READY,
      state,
      reason: reason || null,
      deploymentId,
      sha: exactSha,
      attempts,
      projectId: config.projectId,
      previousProductionDeploymentId,
    });

    let current = evaluateDeployment(created, expected);
    if (TERMINAL.has(current.state)) {
      return result(current.state, current.reason, 0);
    }

    // Polling limitado: intervalo, timeout e max de tentativas. Nunca espera para sempre.
    const startedAt = now();
    const statusUrl = `${baseUrl}/v13/deployments/${encodeURIComponent(deploymentId)}?teamId=${encodeURIComponent(config.teamId)}`;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (now() - startedAt >= timeoutMs) {
        return result(RELEASE_STATE.TIMEOUT, 'poll_timeout', attempt - 1);
      }
      await sleep(intervalMs);
      // Deadline reavaliado depois do await do sleep: o sleep tambem consome o orcamento.
      if (now() - startedAt >= timeoutMs) {
        return result(RELEASE_STATE.TIMEOUT, 'poll_timeout', attempt - 1);
      }
      let polled;
      try {
        polled = await call('GET', statusUrl, undefined, 'consultar o deployment na API Vercel');
      } catch (error) {
        // Incapacidade de consultar NAO e FAILED nem READY: estado remoto desconhecido, deploymentId preservado, sem novo POST.
        if (error?.code === 'release_api_timeout') {
          return result(RELEASE_STATE.TIMEOUT, 'poll_request_timeout', attempt);
        }
        if (error?.code === 'release_api_error') {
          return result(RELEASE_STATE.TIMEOUT, 'poll_http_error', attempt);
        }
        if (error?.code === 'release_network_error') {
          return result(RELEASE_STATE.TIMEOUT, 'poll_network_error', attempt);
        }
        throw error;
      }
      current = evaluateDeployment(polled, expected);
      if (TERMINAL.has(current.state)) {
        return result(current.state, current.reason, attempt);
      }
    }
    return result(RELEASE_STATE.TIMEOUT, 'poll_max_attempts', maxAttempts);
  }

  return async function vercelReleaseClient({ sha, target } = {}) {
    // 1) Feature flag: sem PROMOCAO_PROD_HABILITADA=true nao existe chamada de rede.
    if (!promotionEnabled(env)) {
      throw new ReleaseError(409, 'production_not_enabled', 'Promoção de produção desabilitada.');
    }

    // 2) Config completa (token, team, project, repo owner/name).
    const config = readReleaseConfig(env);
    if (!isReleaseConfigComplete(config) || typeof fetchImpl !== 'function') {
      throw new ReleaseError(409, 'release_not_configured', 'Orquestração de produção não configurada.');
    }

    // 3) Isolamento HML x PROD: antes de qualquer chamada externa.
    assertProdProjectIdentity(config);

    // 4) Target e SHA exatos. Nunca latest/main/HEAD.
    if (target !== undefined && target !== RELEASE_TARGET) {
      throw new ReleaseError(409, 'release_not_configured', 'Target de release inválido.');
    }
    if (typeof sha !== 'string' || !sha.trim()) {
      throw new ReleaseError(409, 'release_not_configured', 'SHA de release ausente.');
    }
    if (!isValidSha(sha)) {
      throw new ReleaseError(409, 'invalid_sha', 'SHA de release inválido.');
    }
    const exactSha = sha.toLowerCase();

    // 5) Reserva por SHA, sincrona e antes de qualquer await: chamadas concorrentes do mesmo SHA
    // no mesmo processo nao chegam ao POST. Sem fetch.
    if (attemptGuard.has(exactSha)) {
      throw new ReleaseError(409, 'release_already_attempted', 'Release deste SHA já foi iniciado neste processo. Não repetir automaticamente.');
    }
    attemptGuard.set(exactSha, RELEASE_GUARD_STATE.RESERVED);

    let postSent = false;
    try {
      // 6) Preflight read-only (GET) ANTES do POST. Exatamente uma chamada.
      const access = await verifyVercelProjectAccess({
        env,
        fetchImpl,
        baseUrl,
        timeoutMs: accessTimeoutMs,
        scheduleTimeout,
        clearTimeoutImpl,
      });
      assertPreflightIsProd(access);

      // 7) Identidade esperada: config com ID usa o ID configurado (ja conferido pelo preflight);
      // config so com nome usa o projectId devolvido pelo GET PROD. Sem ID comprovado: fail-closed antes do POST.
      const resolvedProjectId = config.projectId || access.projectId;
      if (!ID_PATTERN.test(resolvedProjectId)) {
        throw new ReleaseError(409, 'release_identity_unproven', 'Identidade do projeto de produção não comprovada pelo preflight. Release bloqueado.', { called: true });
      }

      // 7b) B6: identifica o deployment PROD anterior (GET read-only) ANTES do POST.
      // Falha ou resposta nao identificavel => fail-closed, sem POST.
      let previousProductionDeploymentId;
      try {
        const previousRequest = buildPreviousProductionRequest({ ...config, projectId: resolvedProjectId }, resolvedProjectId, baseUrl);
        const previousPayload = await readOnlyGet(
          previousRequest.url,
          config.token,
          { fetchImpl, timeoutMs: perRequestTimeoutMs, scheduleTimeout, clearTimeoutImpl },
          'consultar o deployment de produção anterior na API Vercel',
        );
        previousProductionDeploymentId = parsePreviousProductionId(previousPayload);
      } catch (error) {
        if (error?.code === 'release_previous_unproven') throw error;
        throw new ReleaseError(502, 'release_previous_unproven', 'Não foi possível identificar o deployment de produção anterior. Release bloqueado antes do POST.', { called: true });
      }

      // 8) Marca como tentado ANTES do POST: qualquer falha pos-POST nao libera novo POST.
      attemptGuard.set(exactSha, RELEASE_GUARD_STATE.POSTED);
      postSent = true;
      // Nome PROD enviado no POST: config (ja validada) ou o nome comprovado pelo preflight (assertPreflightIsProd).
      try {
        return await deployAndPoll({
          ...config,
          projectId: resolvedProjectId,
          projectName: config.projectName || access.projectName,
        }, exactSha, previousProductionDeploymentId);
      } catch (error) {
        // Qualquer falha dentro de deployAndPoll ocorre com o POST ja enviado: o deployment pode existir.
        // Anexa o anterior conhecido e marca postSent (fail-closed; o chamador registra recuperacao manual).
        if (error && typeof error === 'object') {
          error.previousProductionDeploymentId = previousProductionDeploymentId ?? null;
          error.postSent = true;
        }
        throw error;
      }
    } finally {
      // Falha antes do POST libera a reserva: nenhum deployment foi pedido.
      if (!postSent) attemptGuard.delete(exactSha);
    }
  };
}
