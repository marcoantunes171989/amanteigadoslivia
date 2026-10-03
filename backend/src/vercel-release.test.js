import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ReleaseError,
  buildDeploymentRequest,
  buildProjectAccessRequest,
  createVercelReleaseClient,
  isValidSha,
  mapReadyState,
  readReleaseConfig,
  redactSecrets,
  verifyPostReleaseDeployment,
  verifyVercelProjectAccess,
} from './vercel-release.js';

const SHA = 'a22fbf22e907c8179e28f113b07d5f260aa0ce03';
const TOKEN = 'vercel-token-super-secreto-123';
const PROD_NAME = 'amanteigadoslivia';
const HML_NAME = 'amanteigados-livia-homolog';

function fullEnv(extra = {}) {
  return {
    PROMOCAO_PROD_HABILITADA: 'true',
    VERCEL_RELEASE_TOKEN: TOKEN,
    VERCEL_TEAM_ID: 'team_abc123',
    VERCEL_PROD_PROJECT_ID: 'prj_prod123',
    VERCEL_PROD_PROJECT_NAME: PROD_NAME,
    VERCEL_RELEASE_GIT_OWNER: 'owner-x',
    VERCEL_RELEASE_GIT_REPO: 'repo-y',
    ...extra,
  };
}

const PROD_PROJECT = { id: 'prj_prod123', name: PROD_NAME };

// Evidencia completa de deployment READY em producao, no SHA aprovado.
const READY_BODY = {
  id: 'dpl_abc',
  readyState: 'READY',
  target: 'production',
  projectId: 'prj_prod123',
  name: PROD_NAME,
  meta: { githubCommitSha: SHA },
};

function jsonResponse(status, payload) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload };
}

// fetch fake: registra chamadas e responde na ordem (ultimo item se repete).
function fakeFetch(responses) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (next instanceof Error) throw next;
    return next;
  };
  impl.calls = calls;
  return impl;
}

// fetch do fluxo de release: GET /v9/projects (preflight) separado dos /deployments.
// `calls` tem tudo na ordem real; `deploymentCalls` so os /deployments.
function releaseFetch(responses, preflight = jsonResponse(200, PROD_PROJECT)) {
  const deployments = fakeFetch(responses);
  const impl = async (url, init) => {
    impl.calls.push({ url, init });
    if (url.includes('/v9/projects/')) {
      if (preflight instanceof Error) throw preflight;
      return preflight;
    }
    return deployments(url, init);
  };
  impl.calls = [];
  impl.deploymentCalls = deployments.calls;
  impl.postCount = () => deployments.calls.filter((call) => call.init.method === 'POST').length;
  return impl;
}

// Cada teste recebe guarda propria, para nao herdar reservas de outro teste.
function makeClient(env, fetchImpl, extra = {}) {
  return createVercelReleaseClient({
    env,
    fetchImpl,
    sleep: async () => {},
    pollIntervalMs: 10,
    attemptGuard: new Map(),
    ...extra,
  });
}

function immediateTimer(fn) {
  fn();
  return 'timer';
}

function hangFetchUntilAbort() {
  return async (url, init) => new Promise((resolve, reject) => {
    const signal = init.signal;
    if (!signal) return;
    if (signal.aborted) {
      reject(new Error('aborted'));
      return;
    }
    signal.addEventListener('abort', () => reject(new Error('aborted')));
  });
}

test('flag PROMOCAO_PROD_HABILITADA != true: zero fetch, mesmo com config completa', async () => {
  for (const flag of [undefined, 'false', '', '0', 'yes']) {
    const env = fullEnv();
    if (flag === undefined) delete env.PROMOCAO_PROD_HABILITADA; else env.PROMOCAO_PROD_HABILITADA = flag;
    const fetchImpl = releaseFetch([jsonResponse(200, READY_BODY)]);
    await assert.rejects(
      () => makeClient(env, fetchImpl)({ sha: SHA, target: 'production' }),
      (error) => error instanceof ReleaseError && error.code === 'production_not_enabled' && error.called === false,
      String(flag),
    );
    assert.equal(fetchImpl.calls.length, 0, String(flag));
  }
});

test('config incompleta: release_not_configured e zero fetch', async () => {
  for (const missing of [
    'VERCEL_RELEASE_TOKEN',
    'VERCEL_TEAM_ID',
    'VERCEL_RELEASE_GIT_OWNER',
    'VERCEL_RELEASE_GIT_REPO',
  ]) {
    const env = fullEnv();
    delete env[missing];
    const fetchImpl = releaseFetch([jsonResponse(200, READY_BODY)]);
    await assert.rejects(
      () => makeClient(env, fetchImpl)({ sha: SHA, target: 'production' }),
      (error) => error.code === 'release_not_configured',
      missing,
    );
    assert.equal(fetchImpl.calls.length, 0, missing);
  }

  // Sem project id E sem project name.
  const env = fullEnv();
  delete env.VERCEL_PROD_PROJECT_ID;
  delete env.VERCEL_PROD_PROJECT_NAME;
  const fetchImpl = releaseFetch([jsonResponse(200, READY_BODY)]);
  await assert.rejects(() => makeClient(env, fetchImpl)({ sha: SHA }), (error) => error.code === 'release_not_configured');
  assert.equal(fetchImpl.calls.length, 0);

  // Apenas um dos dois (id OU name) basta.
  const onlyName = fullEnv();
  delete onlyName.VERCEL_PROD_PROJECT_ID;
  const okFetch = releaseFetch([jsonResponse(200, READY_BODY)]);
  const result = await makeClient(onlyName, okFetch)({ sha: SHA, target: 'production' });
  assert.equal(result.state, 'READY');
});

test('SHA ausente ou invalido: zero fetch (nunca latest/main/HEAD/abreviado)', async () => {
  for (const sha of [undefined, '', '   ', 'latest', 'main', 'HEAD', 'a22fbf2', SHA.slice(0, 39), `${SHA}0`, `${SHA.slice(0, 39)}g`, 123, null]) {
    const fetchImpl = releaseFetch([jsonResponse(200, READY_BODY)]);
    await assert.rejects(
      () => makeClient(fullEnv(), fetchImpl)({ sha, target: 'production' }),
      (error) => ['invalid_sha', 'release_not_configured'].includes(error.code),
      String(sha),
    );
    assert.equal(fetchImpl.calls.length, 0, String(sha));
  }
  assert.equal(isValidSha(SHA), true);
  assert.equal(isValidSha(SHA.toUpperCase()), true);
  assert.equal(isValidSha('main'), false);
});

test('target diferente de production: zero fetch', async () => {
  const fetchImpl = releaseFetch([jsonResponse(200, READY_BODY)]);
  await assert.rejects(
    () => makeClient(fullEnv(), fetchImpl)({ sha: SHA, target: 'preview' }),
    (error) => error.code === 'release_not_configured',
  );
  assert.equal(fetchImpl.calls.length, 0);
});

test('config completa + mock: POST correto (URL, target production, projeto, team, SHA exato, Bearer)', async () => {
  const fetchImpl = releaseFetch([jsonResponse(200, READY_BODY)]);
  const result = await makeClient(fullEnv(), fetchImpl)({ sha: SHA, target: 'production' });

  assert.equal(fetchImpl.deploymentCalls.length, 1);
  const { url, init } = fetchImpl.deploymentCalls[0];
  assert.equal(url, 'https://api.vercel.com/v13/deployments?teamId=team_abc123');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(init.headers['Content-Type'], 'application/json');
  const body = JSON.parse(init.body);
  assert.equal(body.target, 'production');
  assert.equal(body.project, 'prj_prod123');
  assert.equal(body.name, PROD_NAME);
  assert.deepEqual(body.gitSource, {
    type: 'github',
    org: 'owner-x',
    repo: 'repo-y',
    ref: 'homologacao',
    sha: SHA,
  });
  assert.doesNotMatch(init.body, /latest|"main"|HEAD/);

  assert.equal(result.ok, true);
  assert.equal(result.state, 'READY');
  assert.equal(result.sha, SHA);
  assert.equal(result.deploymentId, 'dpl_abc');
});

test('GET_BEFORE_POST = YES: preflight read-only (GET v9 com Bearer) acontece antes do POST', async () => {
  const fetchImpl = releaseFetch([jsonResponse(200, READY_BODY)]);
  await makeClient(fullEnv(), fetchImpl)({ sha: SHA, target: 'production' });

  assert.equal(fetchImpl.calls.length, 2);
  assert.equal(fetchImpl.calls[0].init.method, 'GET');
  assert.equal(fetchImpl.calls[0].url, 'https://api.vercel.com/v9/projects/prj_prod123?teamId=team_abc123');
  assert.equal(fetchImpl.calls[0].init.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(fetchImpl.calls[1].init.method, 'POST');
  // Exatamente um preflight por release.
  assert.equal(fetchImpl.calls.filter((call) => call.url.includes('/v9/projects/')).length, 1);
});

test('PREFLIGHT_FAILURE_POST_COUNT = 0: HTTP nao-2xx no GET impede POST', async () => {
  for (const status of [401, 403, 404, 429, 500]) {
    const fetchImpl = releaseFetch([jsonResponse(200, READY_BODY)], jsonResponse(status, { error: { code: 'x' } }));
    await assert.rejects(
      () => makeClient(fullEnv(), fetchImpl)({ sha: SHA, target: 'production' }),
      (error) => error.code === 'release_api_error' && error.called === true,
      String(status),
    );
    assert.equal(fetchImpl.postCount(), 0, String(status));
  }
});

test('PREFLIGHT_TIMEOUT_POST_COUNT = 0: timeout no GET impede POST', async () => {
  const hang = hangFetchUntilAbort();
  const fetchImpl = async (url, init) => {
    if (url.includes('/v9/projects/')) return hang(url, init);
    throw new Error('POST must not be reached');
  };
  const calls = [];
  const tracked = async (url, init) => {
    calls.push({ url, init });
    return fetchImpl(url, init);
  };
  await assert.rejects(
    () => makeClient(fullEnv(), tracked, {
      accessTimeoutMs: 5,
      scheduleTimeout: immediateTimer,
      clearTimeoutImpl: () => {},
    })({ sha: SHA, target: 'production' }),
    (error) => error.code === 'release_api_timeout' && error.called === true,
  );
  assert.equal(calls.filter((call) => call.init.method === 'POST').length, 0);
  assert.equal(calls.length, 1);
});

test('PREFLIGHT_PROJECT_MISMATCH_POST_COUNT = 0: id ou nome divergente no GET impede POST', async () => {
  const wrongId = releaseFetch([jsonResponse(200, READY_BODY)], jsonResponse(200, { id: 'prj_outro', name: PROD_NAME }));
  await assert.rejects(
    () => makeClient(fullEnv(), wrongId)({ sha: SHA, target: 'production' }),
    (error) => error.code === 'release_project_mismatch',
  );
  assert.equal(wrongId.postCount(), 0);

  const wrongName = releaseFetch([jsonResponse(200, READY_BODY)], jsonResponse(200, { id: 'prj_prod123', name: HML_NAME }));
  await assert.rejects(
    () => makeClient(fullEnv(), wrongName)({ sha: SHA, target: 'production' }),
    (error) => error.code === 'release_project_mismatch',
  );
  assert.equal(wrongName.postCount(), 0);
});

test('preflight falho libera a reserva: nova tentativa pode ocorrer e faz exatamente um POST', async () => {
  const guard = new Map();
  const failing = releaseFetch([jsonResponse(200, READY_BODY)], jsonResponse(503, {}));
  await assert.rejects(() => makeClient(fullEnv(), failing, { attemptGuard: guard })({ sha: SHA, target: 'production' }));
  assert.equal(failing.postCount(), 0);
  assert.equal(guard.has(SHA), false);

  const recovered = releaseFetch([jsonResponse(200, READY_BODY)]);
  const result = await makeClient(fullEnv(), recovered, { attemptGuard: guard })({ sha: SHA, target: 'production' });
  assert.equal(result.state, 'READY');
  assert.equal(recovered.postCount(), 1);
});

test('ID-only sem nome configurado: GET devolve nome HML => bloqueado antes do POST', async () => {
  const env = fullEnv();
  delete env.VERCEL_PROD_PROJECT_NAME;
  const fetchImpl = releaseFetch([jsonResponse(200, READY_BODY)], jsonResponse(200, { id: 'prj_prod123', name: HML_NAME }));
  await assert.rejects(
    () => makeClient(env, fetchImpl)({ sha: SHA, target: 'production' }),
    (error) => error.code === 'release_hml_project_blocked',
  );
  assert.equal(fetchImpl.postCount(), 0);
});

test('ID-only sem nome no GET (so id): nome PROD nao comprovado => bloqueado antes do POST', async () => {
  const env = fullEnv();
  delete env.VERCEL_PROD_PROJECT_NAME;
  const fetchImpl = releaseFetch([jsonResponse(200, READY_BODY)], jsonResponse(200, { id: 'prj_prod123' }));
  await assert.rejects(
    () => makeClient(env, fetchImpl)({ sha: SHA, target: 'production' }),
    (error) => error.code === 'release_project_mismatch',
  );
  assert.equal(fetchImpl.postCount(), 0);
});

test('HML_NAME_BLOCKED: config PROD apontando para o projeto HML => zero chamada externa', async () => {
  const fetchImpl = releaseFetch([jsonResponse(200, READY_BODY)]);
  await assert.rejects(
    () => makeClient(fullEnv({ VERCEL_PROD_PROJECT_NAME: HML_NAME }), fetchImpl)({ sha: SHA, target: 'production' }),
    (error) => error.code === 'release_hml_project_blocked' && error.called === false,
  );
  assert.equal(fetchImpl.calls.length, 0);
});

test('WRONG_PROD_NAME_BLOCKED: nome PROD diferente do esperado => zero chamada externa', async () => {
  for (const name of ['amanteigados-livia', 'amanteigadoslivia-2', 'outro-projeto']) {
    const fetchImpl = releaseFetch([jsonResponse(200, READY_BODY)]);
    await assert.rejects(
      () => makeClient(fullEnv({ VERCEL_PROD_PROJECT_NAME: name }), fetchImpl)({ sha: SHA, target: 'production' }),
      (error) => error.code === 'release_wrong_project_name' && error.called === false,
      name,
    );
    assert.equal(fetchImpl.calls.length, 0, name);
  }
});

test('EXPECTED_PROD_NAME_ALLOWED: nome PROD correto prossegue para preflight e POST', async () => {
  const fetchImpl = releaseFetch([jsonResponse(200, READY_BODY)]);
  const result = await makeClient(fullEnv({ VERCEL_PROD_PROJECT_NAME: PROD_NAME }), fetchImpl)({ sha: SHA, target: 'production' });
  assert.equal(result.state, 'READY');
  assert.equal(fetchImpl.calls[0].init.method, 'GET');
  assert.equal(fetchImpl.postCount(), 1);
});

test('ID-only com GET confirmando nome PROD: prossegue', async () => {
  const env = fullEnv();
  delete env.VERCEL_PROD_PROJECT_NAME;
  const fetchImpl = releaseFetch([jsonResponse(200, READY_BODY)]);
  const result = await makeClient(env, fetchImpl)({ sha: SHA, target: 'production' });
  assert.equal(result.state, 'READY');
  assert.equal(fetchImpl.postCount(), 1);
});

test('MISSING_TARGET_BLOCKED: READY sem target nao e sucesso', async () => {
  const { target, ...noTarget } = READY_BODY;
  assert.equal(target, 'production');
  const result = await makeClient(fullEnv(), releaseFetch([jsonResponse(200, noTarget)]))({ sha: SHA, target: 'production' });
  assert.equal(result.ok, false);
  assert.equal(result.state, 'ERROR');
  assert.equal(result.reason, 'target_missing');
});

test('TARGET_MISMATCH_BLOCKED: target divergente bloqueia em qualquer estado', async () => {
  const preview = await makeClient(fullEnv(), releaseFetch([jsonResponse(200, { ...READY_BODY, target: 'preview' })]))({ sha: SHA, target: 'production' });
  assert.equal(preview.ok, false);
  assert.equal(preview.reason, 'target_mismatch');

  const midFlight = await makeClient(fullEnv(), releaseFetch([jsonResponse(200, { id: 'dpl_abc', readyState: 'QUEUED', target: 'preview' })]))({ sha: SHA, target: 'production' });
  assert.equal(midFlight.ok, false);
  assert.equal(midFlight.reason, 'target_mismatch');
});

test('MISSING_SHA_BLOCKED: READY sem meta.githubCommitSha nao e sucesso', async () => {
  const { meta, ...noMeta } = READY_BODY;
  assert.equal(meta.githubCommitSha, SHA);
  const result = await makeClient(fullEnv(), releaseFetch([jsonResponse(200, noMeta)]))({ sha: SHA, target: 'production' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'sha_missing');
});

test('SHA_MISMATCH_BLOCKED: SHA divergente bloqueia (READY e estado intermediario)', async () => {
  const other = 'b'.repeat(40);
  const ready = await makeClient(fullEnv(), releaseFetch([jsonResponse(200, { ...READY_BODY, meta: { githubCommitSha: other } })]))({ sha: SHA, target: 'production' });
  assert.equal(ready.ok, false);
  assert.equal(ready.reason, 'sha_mismatch');

  const midFlight = await makeClient(fullEnv(), releaseFetch([jsonResponse(200, { id: 'dpl_abc', readyState: 'BUILDING', meta: { githubCommitSha: other } })]))({ sha: SHA, target: 'production' });
  assert.equal(midFlight.ok, false);
  assert.equal(midFlight.reason, 'sha_mismatch');
});

test('EXPECTED_SHA_TARGET_ACCEPTED: SHA correto + target production (+ projeto PROD) => READY', async () => {
  const result = await makeClient(fullEnv(), releaseFetch([jsonResponse(200, READY_BODY)]))({ sha: SHA, target: 'production' });
  assert.equal(result.ok, true);
  assert.equal(result.state, 'READY');
  assert.equal(result.reason, null);
});

test('READY sem evidencia de projeto (sem name nem projectId) nao e sucesso', async () => {
  const { name, projectId, ...noProject } = READY_BODY;
  assert.equal(name, PROD_NAME);
  assert.equal(projectId, 'prj_prod123');
  const result = await makeClient(fullEnv(), releaseFetch([jsonResponse(200, noProject)]))({ sha: SHA, target: 'production' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'project_missing');
});

test('API retorna erro: nao publica (lanca release_api_error, called=true)', async () => {
  for (const status of [400, 401, 403, 429, 500]) {
    const fetchImpl = releaseFetch([jsonResponse(status, { error: { code: 'bad_request' } })]);
    await assert.rejects(
      () => makeClient(fullEnv(), fetchImpl)({ sha: SHA, target: 'production' }),
      (error) => error.code === 'release_api_error' && error.called === true && /HTTP/.test(error.message),
      String(status),
    );
    assert.equal(fetchImpl.deploymentCalls.length, 1);
  }
  // Resposta 200 sem id de deployment tambem nao vale.
  const noId = releaseFetch([jsonResponse(200, { readyState: 'READY' })]);
  await assert.rejects(
    () => makeClient(fullEnv(), noId)({ sha: SHA, target: 'production' }),
    (error) => error.code === 'release_api_error',
  );
});

test('token nunca aparece no payload publico, no resultado nem em erros', async () => {
  const config = readReleaseConfig(fullEnv());
  const publicRequest = buildDeploymentRequest(config, SHA);
  assert.doesNotMatch(JSON.stringify(publicRequest), new RegExp(TOKEN));

  const okFetch = releaseFetch([jsonResponse(200, READY_BODY)]);
  const result = await makeClient(fullEnv(), okFetch)({ sha: SHA, target: 'production' });
  assert.doesNotMatch(JSON.stringify(result), new RegExp(TOKEN));

  // Resposta de erro da API que ecoa o token: a mensagem do erro nao o repassa.
  const echoFetch = releaseFetch([jsonResponse(403, { error: { code: 'forbidden', message: `bad token ${TOKEN}` } })]);
  await assert.rejects(
    () => makeClient(fullEnv(), echoFetch)({ sha: SHA, target: 'production' }),
    (error) => {
      assert.doesNotMatch(String(error.message), new RegExp(TOKEN));
      assert.doesNotMatch(JSON.stringify({ ...error, message: error.message }), new RegExp(TOKEN));
      return true;
    },
  );

  // Erro de rede cuja mensagem contem o token: tambem nao vaza.
  const netFetch = releaseFetch([new Error(`connect failed Bearer ${TOKEN}`)]);
  await assert.rejects(
    () => makeClient(fullEnv(), netFetch)({ sha: SHA, target: 'production' }),
    (error) => error.code === 'release_api_error' && !String(error.message).includes(TOKEN),
  );

  // Preflight que ecoa o token em erro de rede: tambem nao vaza.
  const preflightNet = releaseFetch([jsonResponse(200, READY_BODY)], new Error(`connect failed Bearer ${TOKEN}`));
  await assert.rejects(
    () => makeClient(fullEnv(), preflightNet)({ sha: SHA, target: 'production' }),
    (error) => error.code === 'release_api_error' && !String(error.message).includes(TOKEN),
  );

  assert.equal(redactSecrets(`x Bearer ${TOKEN} y`, [TOKEN]).includes(TOKEN), false);
  assert.equal(new ReleaseError(500, 'x', `Bearer ${TOKEN}`).message.includes(TOKEN), false);
});

test('deployment BUILDING e depois READY: so vira READY (evidencia) apos o polling', async () => {
  const fetchImpl = releaseFetch([
    jsonResponse(200, { id: 'dpl_abc', readyState: 'QUEUED' }),
    jsonResponse(200, { id: 'dpl_abc', readyState: 'BUILDING' }),
    jsonResponse(200, { id: 'dpl_abc', readyState: 'BUILDING' }),
    jsonResponse(200, READY_BODY),
  ]);
  let sleeps = 0;
  const result = await makeClient(fullEnv(), fetchImpl, {
    sleep: async () => { sleeps += 1; },
  })({ sha: SHA, target: 'production' });

  assert.equal(result.ok, true);
  assert.equal(result.state, 'READY');
  assert.equal(result.attempts, 3);
  assert.equal(sleeps, 3);
  assert.equal(fetchImpl.deploymentCalls.length, 4);
  // Polling e GET no deployment criado, com o teamId.
  assert.equal(fetchImpl.deploymentCalls[1].url, 'https://api.vercel.com/v13/deployments/dpl_abc?teamId=team_abc123');
  assert.equal(fetchImpl.deploymentCalls[1].init.method, 'GET');
  assert.equal(fetchImpl.deploymentCalls[1].init.body, undefined);
});

test('criado mas nao READY: o resultado nunca e ok (nao publicavel) enquanto nao houver READY', async () => {
  const fetchImpl = releaseFetch([
    jsonResponse(200, { id: 'dpl_abc', readyState: 'QUEUED' }),
    jsonResponse(200, { id: 'dpl_abc', readyState: 'BUILDING' }),
  ]);
  const result = await makeClient(fullEnv(), fetchImpl, { maxAttempts: 2 })({ sha: SHA, target: 'production' });
  assert.equal(result.ok, false);
  assert.equal(result.state, 'TIMEOUT');
});

test('ERROR e CANCELED: terminais, ok=false', async () => {
  for (const readyState of ['ERROR', 'CANCELED']) {
    const immediate = releaseFetch([jsonResponse(200, { id: 'dpl_abc', readyState })]);
    const a = await makeClient(fullEnv(), immediate)({ sha: SHA, target: 'production' });
    assert.equal(a.ok, false);
    assert.equal(a.state, readyState);
    assert.equal(immediate.deploymentCalls.length, 1);

    const afterBuild = releaseFetch([
      jsonResponse(200, { id: 'dpl_abc', readyState: 'BUILDING' }),
      jsonResponse(200, { id: 'dpl_abc', readyState }),
    ]);
    const b = await makeClient(fullEnv(), afterBuild)({ sha: SHA, target: 'production' });
    assert.equal(b.ok, false);
    assert.equal(b.state, readyState);
  }
});

test('timeout por relogio e por max de tentativas: nunca READY/ok e nunca espera para sempre', async () => {
  // Por max de tentativas.
  const building = releaseFetch([jsonResponse(200, { id: 'dpl_abc', readyState: 'BUILDING' })]);
  const byAttempts = await makeClient(fullEnv(), building, { maxAttempts: 3 })({ sha: SHA, target: 'production' });
  assert.equal(byAttempts.state, 'TIMEOUT');
  assert.equal(byAttempts.ok, false);
  assert.equal(building.deploymentCalls.length, 1 + 3);

  // Por relogio injetado: cada now() avanca 1000 ms; timeout 2500 ms.
  let clock = 0;
  const building2 = releaseFetch([jsonResponse(200, { id: 'dpl_abc', readyState: 'BUILDING' })]);
  const byClock = await makeClient(fullEnv(), building2, {
    now: () => { clock += 1000; return clock; },
    pollTimeoutMs: 2500,
    maxAttempts: 100,
  })({ sha: SHA, target: 'production' });
  assert.equal(byClock.state, 'TIMEOUT');
  assert.equal(byClock.ok, false);
  assert.ok(building2.deploymentCalls.length < 10);
});

test('estado desconhecido nunca vira READY', () => {
  assert.equal(mapReadyState('WEIRD'), 'BUILDING');
  assert.equal(mapReadyState(undefined), 'BUILDING');
  assert.equal(mapReadyState('ready'), 'READY');
  assert.equal(mapReadyState('QUEUED'), 'CREATED');
  assert.equal(mapReadyState('INITIALIZING'), 'CREATED');
});

test('READY com target != production ou SHA divergente NAO e evidencia valida', async () => {
  const wrongTarget = releaseFetch([jsonResponse(200, { id: 'dpl_abc', readyState: 'READY', target: null })]);
  const a = await makeClient(fullEnv(), wrongTarget)({ sha: SHA, target: 'production' });
  assert.equal(a.ok, false);
  assert.equal(a.state, 'ERROR');
  assert.equal(a.reason, 'target_mismatch');

  const wrongSha = releaseFetch([jsonResponse(200, {
    ...READY_BODY,
    meta: { githubCommitSha: 'b'.repeat(40) },
  })]);
  const b = await makeClient(fullEnv(), wrongSha)({ sha: SHA, target: 'production' });
  assert.equal(b.ok, false);
  assert.equal(b.reason, 'sha_mismatch');
});

test('config e ref do Git: ref default homologacao, override opcional, com sha sempre fixo', () => {
  const config = readReleaseConfig(fullEnv({ VERCEL_RELEASE_GIT_REF: 'release-1' }));
  assert.equal(buildDeploymentRequest(config, SHA).body.gitSource.ref, 'release-1');
  assert.equal(buildDeploymentRequest(config, SHA).body.gitSource.sha, SHA);
  assert.equal(buildDeploymentRequest(readReleaseConfig(fullEnv()), SHA).body.gitSource.ref, 'homologacao');
});

test('IDEMPOTENCIA: concorrencia no mesmo processo => um unico POST por SHA', async () => {
  const guard = new Map();
  const fetchImpl = releaseFetch([jsonResponse(200, READY_BODY)]);
  const client = makeClient(fullEnv(), fetchImpl, { attemptGuard: guard });
  const results = await Promise.allSettled([
    client({ sha: SHA, target: 'production' }),
    client({ sha: SHA, target: 'production' }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const rejected = results.find((r) => r.status === 'rejected');
  assert.equal(rejected.reason.code, 'release_already_attempted');
  assert.equal(rejected.reason.called, false);
  assert.equal(fetchImpl.postCount(), 1);
});

test('IDEMPOTENCIA: mesmo SHA repetido apos sucesso => bloqueado sem nenhuma chamada', async () => {
  const guard = new Map();
  const first = releaseFetch([jsonResponse(200, READY_BODY)]);
  await makeClient(fullEnv(), first, { attemptGuard: guard })({ sha: SHA, target: 'production' });

  const second = releaseFetch([jsonResponse(200, READY_BODY)]);
  await assert.rejects(
    () => makeClient(fullEnv(), second, { attemptGuard: guard })({ sha: SHA, target: 'production' }),
    (error) => error.code === 'release_already_attempted' && error.called === false,
  );
  assert.equal(second.calls.length, 0);
});

test('IDEMPOTENCIA: erro de rede no POST nao gera novo POST automatico nem nova tentativa', async () => {
  const guard = new Map();
  const fetchImpl = releaseFetch([new Error('ECONNRESET')]);
  await assert.rejects(
    () => makeClient(fullEnv(), fetchImpl, { attemptGuard: guard })({ sha: SHA, target: 'production' }),
    (error) => error.code === 'release_api_error' && error.called === true,
  );
  assert.equal(fetchImpl.postCount(), 1);

  await assert.rejects(
    () => makeClient(fullEnv(), fetchImpl, { attemptGuard: guard })({ sha: SHA, target: 'production' }),
    (error) => error.code === 'release_already_attempted',
  );
  assert.equal(fetchImpl.postCount(), 1);
});

test('POST_RELEASE: verificacao read-only aprova deployment READY com projeto/target/SHA corretos', async () => {
  const fetchImpl = fakeFetch([jsonResponse(200, READY_BODY)]);
  const result = await verifyPostReleaseDeployment({
    env: fullEnv(),
    fetchImpl,
    deploymentId: 'dpl_abc',
    sha: SHA,
  });
  assert.equal(result.ok, true);
  assert.equal(result.state, 'READY');
  assert.equal(result.alias, 'NOT_VERIFIED');
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(fetchImpl.calls[0].init.method, 'GET');
  assert.equal(fetchImpl.calls[0].init.body, undefined);
  assert.equal(fetchImpl.calls[0].url, 'https://api.vercel.com/v13/deployments/dpl_abc?teamId=team_abc123');
  assert.doesNotMatch(JSON.stringify(result), new RegExp(TOKEN));
});

test('POST_RELEASE: projeto, target, SHA ou readyState divergentes => ok=false com motivo', async () => {
  const cases = [
    [{ ...READY_BODY, name: HML_NAME, projectId: 'prj_hml' }, 'project_mismatch'],
    [{ ...READY_BODY, projectId: 'prj_outro', name: undefined }, 'project_mismatch'],
    [{ ...READY_BODY, target: 'preview' }, 'target_mismatch'],
    [{ ...READY_BODY, meta: { githubCommitSha: 'c'.repeat(40) } }, 'sha_mismatch'],
    [{ ...READY_BODY, meta: undefined }, 'sha_missing'],
    [{ id: 'dpl_abc', readyState: 'BUILDING' }, null],
  ];
  for (const [body, reason] of cases) {
    const result = await verifyPostReleaseDeployment({
      env: fullEnv(),
      fetchImpl: fakeFetch([jsonResponse(200, body)]),
      deploymentId: 'dpl_abc',
      sha: SHA,
    });
    assert.equal(result.ok, false, JSON.stringify(body));
    assert.equal(result.reason, reason, JSON.stringify(body));
  }
});

test('POST_RELEASE: HTTP de erro lanca release_api_error; HML/ID invalido/SHA invalido sem fetch', async () => {
  const notFound = fakeFetch([jsonResponse(404, {})]);
  await assert.rejects(
    () => verifyPostReleaseDeployment({ env: fullEnv(), fetchImpl: notFound, deploymentId: 'dpl_abc', sha: SHA }),
    (error) => error.code === 'release_api_error' && error.called === true,
  );

  const none = fakeFetch([jsonResponse(200, READY_BODY)]);
  await assert.rejects(
    () => verifyPostReleaseDeployment({ env: fullEnv({ VERCEL_PROD_PROJECT_NAME: HML_NAME }), fetchImpl: none, deploymentId: 'dpl_abc', sha: SHA }),
    (error) => error.code === 'release_hml_project_blocked' && error.called === false,
  );
  await assert.rejects(
    () => verifyPostReleaseDeployment({ env: fullEnv(), fetchImpl: none, deploymentId: 'dpl/../x', sha: SHA }),
    (error) => error.code === 'invalid_deployment_id',
  );
  await assert.rejects(
    () => verifyPostReleaseDeployment({ env: fullEnv(), fetchImpl: none, deploymentId: 'dpl_abc', sha: 'main' }),
    (error) => error.code === 'invalid_sha',
  );
  assert.equal(none.calls.length, 0);
});

function accessEnv(extra = {}) {
  return {
    VERCEL_RELEASE_TOKEN: TOKEN,
    VERCEL_TEAM_ID: 'team_abc123',
    VERCEL_PROD_PROJECT_ID: 'prj_prod123',
    VERCEL_PROD_PROJECT_NAME: PROD_NAME,
    ...extra,
  };
}

test('verifyVercelProjectAccess: config valida -> GET correto no v9/projects com Bearer', async () => {
  const fetchImpl = fakeFetch([jsonResponse(200, PROD_PROJECT)]);
  const result = await verifyVercelProjectAccess({ env: accessEnv(), fetchImpl });

  assert.equal(fetchImpl.calls.length, 1);
  const { url, init } = fetchImpl.calls[0];
  assert.equal(url, 'https://api.vercel.com/v9/projects/prj_prod123?teamId=team_abc123');
  assert.equal(init.method, 'GET');
  assert.equal(init.body, undefined);
  assert.equal(init.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(result.ok, true);
  assert.equal(result.projectId, 'prj_prod123');
  assert.equal(result.projectName, PROD_NAME);
});

test('verifyVercelProjectAccess: usa projectName quando projectId ausente, URL e teamId codificados', async () => {
  const env = accessEnv({ VERCEL_TEAM_ID: 'team x/1' });
  delete env.VERCEL_PROD_PROJECT_ID;
  const fetchImpl = fakeFetch([jsonResponse(200, PROD_PROJECT)]);
  await assert.rejects(
    () => verifyVercelProjectAccess({ env, fetchImpl }),
    (error) => error.code === 'release_not_configured',
  );
  assert.equal(fetchImpl.calls.length, 0);
});

test('verifyVercelProjectAccess: caracteres perigosos em project/team sao codificados na URL', async () => {
  const config = readReleaseConfig(accessEnv({ VERCEL_PROD_PROJECT_ID: 'prj_prod123' }));
  const request = buildProjectAccessRequest({ ...config, teamId: 'team&x=1' });
  assert.equal(request.url, 'https://api.vercel.com/v9/projects/prj_prod123?teamId=team%26x%3D1');
  const request2 = buildProjectAccessRequest({ ...config, projectId: 'prj/../x' });
  assert.equal(request2.url, 'https://api.vercel.com/v9/projects/prj%2F..%2Fx?teamId=team_abc123');
});

test('verifyVercelProjectAccess: token nunca aparece no resultado nem em erros', async () => {
  const okFetch = fakeFetch([jsonResponse(200, PROD_PROJECT)]);
  const result = await verifyVercelProjectAccess({ env: accessEnv(), fetchImpl: okFetch });
  assert.doesNotMatch(JSON.stringify(result), new RegExp(TOKEN));

  const echoFetch = fakeFetch([jsonResponse(403, { error: { code: 'forbidden', message: `bad token ${TOKEN}` } })]);
  await assert.rejects(
    () => verifyVercelProjectAccess({ env: accessEnv(), fetchImpl: echoFetch }),
    (error) => {
      assert.doesNotMatch(String(error.message), new RegExp(TOKEN));
      return error.code === 'release_api_error';
    },
  );

  const netFetch = fakeFetch([new Error(`connect failed Bearer ${TOKEN}`)]);
  await assert.rejects(
    () => verifyVercelProjectAccess({ env: accessEnv(), fetchImpl: netFetch }),
    (error) => error.code === 'release_api_error' && !String(error.message).includes(TOKEN),
  );
});

test('verifyVercelProjectAccess: ausencia de token/team/project -> fail-closed antes do fetch', async () => {
  for (const missing of ['VERCEL_RELEASE_TOKEN', 'VERCEL_TEAM_ID']) {
    const env = accessEnv();
    delete env[missing];
    const fetchImpl = fakeFetch([jsonResponse(200, PROD_PROJECT)]);
    await assert.rejects(
      () => verifyVercelProjectAccess({ env, fetchImpl }),
      (error) => error.code === 'release_not_configured',
      missing,
    );
    assert.equal(fetchImpl.calls.length, 0, missing);
  }

  const noProject = accessEnv();
  delete noProject.VERCEL_PROD_PROJECT_ID;
  delete noProject.VERCEL_PROD_PROJECT_NAME;
  const fetchImpl = fakeFetch([jsonResponse(200, PROD_PROJECT)]);
  await assert.rejects(
    () => verifyVercelProjectAccess({ env: noProject, fetchImpl }),
    (error) => error.code === 'release_not_configured',
  );
  assert.equal(fetchImpl.calls.length, 0);
});

test('verifyVercelProjectAccess: HTTP nao-2xx resulta em falha segura (401/403/404/429/500)', async () => {
  for (const status of [401, 403, 404, 429, 500]) {
    const fetchImpl = fakeFetch([jsonResponse(status, { error: { code: 'x' } })]);
    await assert.rejects(
      () => verifyVercelProjectAccess({ env: accessEnv(), fetchImpl }),
      (error) => error.code === 'release_api_error' && error.called === true && /HTTP/.test(error.message),
      String(status),
    );
    assert.equal(fetchImpl.calls.length, 1, String(status));
  }
});

test('verifyVercelProjectAccess: JSON invalido ou sem id/name necessarios -> falha', async () => {
  const badJson = fakeFetch([{ ok: true, status: 200, json: async () => { throw new Error('bad json'); } }]);
  await assert.rejects(
    () => verifyVercelProjectAccess({ env: accessEnv(), fetchImpl: badJson }),
    (error) => error.code === 'release_api_error',
  );

  const noIds = fakeFetch([jsonResponse(200, {})]);
  await assert.rejects(
    () => verifyVercelProjectAccess({ env: accessEnv(), fetchImpl: noIds }),
    (error) => error.code === 'release_api_error',
  );
});

test('verifyVercelProjectAccess: mismatch de projeto retornado -> falha segura', async () => {
  const wrongId = fakeFetch([jsonResponse(200, { id: 'prj_outro', name: PROD_NAME })]);
  await assert.rejects(
    () => verifyVercelProjectAccess({ env: accessEnv(), fetchImpl: wrongId }),
    (error) => error.code === 'release_project_mismatch',
  );

  const wrongName = fakeFetch([jsonResponse(200, { id: 'prj_prod123', name: 'outro-nome' })]);
  await assert.rejects(
    () => verifyVercelProjectAccess({ env: accessEnv(), fetchImpl: wrongName }),
    (error) => error.code === 'release_project_mismatch',
  );
});

test('verifyVercelProjectAccess: timeout limitado nunca espera para sempre', async () => {
  const fetchImpl = hangFetchUntilAbort();
  await assert.rejects(
    () => verifyVercelProjectAccess({
      env: accessEnv(),
      fetchImpl,
      scheduleTimeout: immediateTimer,
      clearTimeoutImpl: () => {},
      timeoutMs: 5,
    }),
    (error) => error.code === 'release_api_timeout' && error.called === true,
  );
});

test('verifyVercelProjectAccess: erro de rede generico (sem timeout) -> release_api_error', async () => {
  const fetchImpl = fakeFetch([new Error('ECONNRESET')]);
  await assert.rejects(
    () => verifyVercelProjectAccess({ env: accessEnv(), fetchImpl }),
    (error) => error.code === 'release_api_error' && error.called === true,
  );
});

test('verifyVercelProjectAccess: nunca faz POST nem toca endpoint /deployments', async () => {
  const fetchImpl = fakeFetch([jsonResponse(200, PROD_PROJECT)]);
  await verifyVercelProjectAccess({ env: accessEnv(), fetchImpl });
  for (const call of fetchImpl.calls) {
    assert.equal(call.init.method, 'GET');
    assert.doesNotMatch(call.url, /\/deployments/);
  }
});

test('identificadores com caracteres perigosos (path/query injection) sao rejeitados sem fetch', async () => {
  for (const [key, value] of [
    ['VERCEL_TEAM_ID', 'team&x=1'],
    ['VERCEL_PROD_PROJECT_ID', 'prj/../x'],
    ['VERCEL_RELEASE_GIT_OWNER', 'own er'],
    ['VERCEL_RELEASE_GIT_REPO', 'repo?x'],
  ]) {
    const env = fullEnv({ [key]: value });
    if (key === 'VERCEL_PROD_PROJECT_ID') delete env.VERCEL_PROD_PROJECT_NAME;
    const fetchImpl = releaseFetch([jsonResponse(200, READY_BODY)]);
    await assert.rejects(
      () => makeClient(env, fetchImpl)({ sha: SHA, target: 'production' }),
      (error) => error.code === 'release_not_configured',
      key,
    );
    assert.equal(fetchImpl.calls.length, 0, key);
  }
});

// P10-H2A: config somente por nome. O preflight GET resolve o projectId PROD; o deployment
// precisa provar esse mesmo projectId. Antes da correcao, um projectId DIFERENTE sem name passava.
test('P10-H2A NAME_ONLY_WRONG_PROJECT_ID_BLOCKED: preflight PROD com P1 e READY com P2 sem name => nao READY', async () => {
  const env = fullEnv();
  delete env.VERCEL_PROD_PROJECT_ID;
  const fetchImpl = releaseFetch(
    [jsonResponse(200, { id: 'dpl_abc', readyState: 'READY', target: 'production', projectId: 'prj_outro', meta: { githubCommitSha: SHA } })],
    jsonResponse(200, PROD_PROJECT),
  );
  const result = await makeClient(env, fetchImpl)({ sha: SHA, target: 'production' });
  assert.equal(result.ok, false);
  assert.equal(result.state, 'ERROR');
  assert.equal(result.reason, 'project_mismatch');
});

function nameOnlyEnv() {
  const env = fullEnv();
  delete env.VERCEL_PROD_PROJECT_ID;
  return env;
}

const READY_P1_NO_NAME = { id: 'dpl_abc', readyState: 'READY', target: 'production', projectId: 'prj_prod123', meta: { githubCommitSha: SHA } };

test('P10-H2A NAME_ONLY_MATCHING_ID_ACCEPTED: preflight PROD com P1 e READY com P1 sem name => READY', async () => {
  const fetchImpl = releaseFetch([jsonResponse(200, READY_P1_NO_NAME)], jsonResponse(200, PROD_PROJECT));
  const result = await makeClient(nameOnlyEnv(), fetchImpl)({ sha: SHA, target: 'production' });
  assert.equal(result.ok, true);
  assert.equal(result.state, 'READY');
  assert.equal(fetchImpl.postCount(), 1);
  // O ID resolvido pelo preflight passa a ser o projeto do POST (identidade unica do fluxo).
  const body = JSON.parse(fetchImpl.deploymentCalls[0].init.body);
  assert.equal(body.project, 'prj_prod123');
  assert.equal(body.name, PROD_NAME);
});

test('P10-H2A NAME_ONLY_INSUFFICIENT_EVIDENCE_BLOCKED: preflight sem projectId => fail-closed antes do POST', async () => {
  const fetchImpl = releaseFetch([jsonResponse(200, READY_BODY)], jsonResponse(200, { name: PROD_NAME }));
  await assert.rejects(
    () => makeClient(nameOnlyEnv(), fetchImpl)({ sha: SHA, target: 'production' }),
    (error) => error.code === 'release_identity_unproven' && error.called === true,
  );
  assert.equal(fetchImpl.postCount(), 0);
});

test('P10-H2A NAME_ONLY_NO_PROJECT_EVIDENCE_IN_READY_BLOCKED: READY sem name nem projectId => nao READY', async () => {
  const { projectId, ...noId } = READY_P1_NO_NAME;
  assert.equal(projectId, 'prj_prod123');
  const fetchImpl = releaseFetch([jsonResponse(200, noId)], jsonResponse(200, PROD_PROJECT));
  const result = await makeClient(nameOnlyEnv(), fetchImpl)({ sha: SHA, target: 'production' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'project_missing');
});

test('P10-H2A CONFIGURED_ID_STILL_ENFORCED: config com ID P1 e READY com P2 sem name => bloqueado', async () => {
  const fetchImpl = releaseFetch([jsonResponse(200, { ...READY_P1_NO_NAME, projectId: 'prj_outro' })]);
  const result = await makeClient(fullEnv(), fetchImpl)({ sha: SHA, target: 'production' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'project_mismatch');
});

test('P10-H2A POST_RELEASE_NAME_ONLY: identidade explicita P1 aceita P1 e bloqueia P2 sem name', async () => {
  const ok = fakeFetch([jsonResponse(200, READY_P1_NO_NAME)]);
  const accepted = await verifyPostReleaseDeployment({
    env: nameOnlyEnv(), fetchImpl: ok, deploymentId: 'dpl_abc', sha: SHA, expectedProjectId: 'prj_prod123',
  });
  assert.equal(accepted.ok, true);
  assert.equal(accepted.state, 'READY');

  const divergent = fakeFetch([jsonResponse(200, { ...READY_P1_NO_NAME, projectId: 'prj_outro' })]);
  const blocked = await verifyPostReleaseDeployment({
    env: nameOnlyEnv(), fetchImpl: divergent, deploymentId: 'dpl_abc', sha: SHA, expectedProjectId: 'prj_prod123',
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, 'project_mismatch');
});

test('P10-H2A POST_RELEASE_NAME_ONLY_WITHOUT_IDENTITY: sem identidade explicita => zero fetch', async () => {
  const fetchImpl = fakeFetch([jsonResponse(200, READY_P1_NO_NAME)]);
  await assert.rejects(
    () => verifyPostReleaseDeployment({ env: nameOnlyEnv(), fetchImpl, deploymentId: 'dpl_abc', sha: SHA }),
    (error) => error.code === 'release_identity_unproven' && error.called === false,
  );
  assert.equal(fetchImpl.calls.length, 0);
});

test('P10-H2A POST_RELEASE_CONFLICTING_IDENTITY: expectedProjectId divergente do ID configurado => zero fetch', async () => {
  const fetchImpl = fakeFetch([jsonResponse(200, READY_BODY)]);
  await assert.rejects(
    () => verifyPostReleaseDeployment({ env: fullEnv(), fetchImpl, deploymentId: 'dpl_abc', sha: SHA, expectedProjectId: 'prj_outro' }),
    (error) => error.code === 'release_identity_unproven' && error.called === false,
  );
  assert.equal(fetchImpl.calls.length, 0);
});
