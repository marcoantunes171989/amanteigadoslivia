// Adapter server-side ISOLADO para a futura orquestracao de release PROD via API Vercel.
//
// V15: somente prepara e testa. Nada aqui e chamado com rede real nesta fase:
//  - `fetchImpl` e injetavel (testes usam fake);
//  - o cliente recusa (zero fetch) se PROMOCAO_PROD_HABILITADA != true;
//  - o cliente recusa (zero fetch) se a config/SHA estiver incompleta ou invalida.
//
// O projeto PROD nao tem Git conectado de proposito: o deployment e criado
// explicitamente (POST /v13/deployments com gitSource + SHA exato, target=production).
// O token vive so em memoria server-side e nunca entra em resposta, log ou erro.

import { AdminError } from './admin-errors.js';

export const VERCEL_API_BASE = 'https://api.vercel.com';
export const DEFAULT_GIT_REF = 'homologacao';
export const RELEASE_TARGET = 'production';

export const RELEASE_STATE = Object.freeze({
  CREATED: 'CREATED',
  BUILDING: 'BUILDING',
  READY: 'READY',
  ERROR: 'ERROR',
  CANCELED: 'CANCELED',
  TIMEOUT: 'TIMEOUT',
});

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
  };
}

export function isReleaseConfigComplete(config) {
  return Boolean(
    config.token
    && ID_PATTERN.test(config.teamId)
    && (ID_PATTERN.test(config.projectId) || ID_PATTERN.test(config.projectName))
    && GIT_NAME_PATTERN.test(config.gitOwner)
    && GIT_NAME_PATTERN.test(config.gitRepo)
    && REF_PATTERN.test(config.gitRef),
  );
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
  const projectName = config.projectName || config.projectId;
  return {
    method: 'POST',
    url: `${baseUrl}/v13/deployments?teamId=${encodeURIComponent(config.teamId)}`,
    body: {
      name: projectName,
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

// Evidencia do deployment: precisa ser production e (se informado) do SHA pedido.
function evaluateDeployment(body, sha) {
  const state = mapReadyState(body?.readyState ?? body?.status);
  if (body && 'target' in body && body.target !== RELEASE_TARGET) {
    return { state: RELEASE_STATE.ERROR, reason: 'target_mismatch' };
  }
  const reportedSha = body?.meta?.githubCommitSha;
  if (typeof reportedSha === 'string' && reportedSha && reportedSha.toLowerCase() !== sha) {
    return { state: RELEASE_STATE.ERROR, reason: 'sha_mismatch' };
  }
  return { state, reason: null };
}

export function createVercelReleaseClient(options = {}) {
  const {
    env = process.env,
    fetchImpl = globalThis.fetch,
    sleep = defaultSleep,
    now = Date.now,
    baseUrl = VERCEL_API_BASE,
  } = options;
  const intervalMs = positiveInt(options.pollIntervalMs, POLL_DEFAULTS.intervalMs);
  const timeoutMs = positiveInt(options.pollTimeoutMs, POLL_DEFAULTS.timeoutMs);
  const maxAttempts = positiveInt(options.maxAttempts, POLL_DEFAULTS.maxAttempts);

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

    // 3) Target e SHA exatos. Nunca latest/main/HEAD.
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

    const headers = {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    };

    async function call(method, url, body) {
      let res;
      try {
        res = await fetchImpl(url, {
          method,
          headers,
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
      } catch {
        // Nao repassa a mensagem original: so o motivo generico.
        throw new ReleaseError(502, 'release_api_error', 'Falha de rede ao contatar a API Vercel.', { called: true });
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
    }

    const request = buildDeploymentRequest(config, exactSha, baseUrl);
    const created = await call(request.method, request.url, request.body);
    const deploymentId = typeof created.id === 'string' ? created.id : '';
    if (!ID_PATTERN.test(deploymentId)) {
      throw new ReleaseError(502, 'release_api_error', 'API Vercel não retornou o id do deployment.', { called: true });
    }

    const result = (state, reason, attempts) => ({
      ok: state === RELEASE_STATE.READY,
      state,
      reason: reason || null,
      deploymentId,
      sha: exactSha,
      attempts,
    });

    let current = evaluateDeployment(created, exactSha);
    if (TERMINAL.has(current.state)) {
      return result(current.state, current.reason, 0);
    }

    // 4) Polling limitado: intervalo, timeout e max de tentativas. Nunca espera para sempre.
    const startedAt = now();
    const statusUrl = `${baseUrl}/v13/deployments/${encodeURIComponent(deploymentId)}?teamId=${encodeURIComponent(config.teamId)}`;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (now() - startedAt >= timeoutMs) {
        return result(RELEASE_STATE.TIMEOUT, 'poll_timeout', attempt - 1);
      }
      await sleep(intervalMs);
      const polled = await call('GET', statusUrl);
      current = evaluateDeployment(polled, exactSha);
      if (TERMINAL.has(current.state)) {
        return result(current.state, current.reason, attempt);
      }
    }
    return result(RELEASE_STATE.TIMEOUT, 'poll_max_attempts', maxAttempts);
  };
}
