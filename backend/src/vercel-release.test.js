import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ReleaseError,
  buildDeploymentRequest,
  createVercelReleaseClient,
  isValidSha,
  mapReadyState,
  readReleaseConfig,
  redactSecrets,
} from './vercel-release.js';

const SHA = 'a22fbf22e907c8179e28f113b07d5f260aa0ce03';
const TOKEN = 'vercel-token-super-secreto-123';

function fullEnv(extra = {}) {
  return {
    PROMOCAO_PROD_HABILITADA: 'true',
    VERCEL_RELEASE_TOKEN: TOKEN,
    VERCEL_TEAM_ID: 'team_abc123',
    VERCEL_PROD_PROJECT_ID: 'prj_prod123',
    VERCEL_PROD_PROJECT_NAME: 'amanteigados-livia',
    VERCEL_RELEASE_GIT_OWNER: 'owner-x',
    VERCEL_RELEASE_GIT_REPO: 'repo-y',
    ...extra,
  };
}

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

function makeClient(env, fetchImpl, extra = {}) {
  return createVercelReleaseClient({
    env,
    fetchImpl,
    sleep: async () => {},
    pollIntervalMs: 10,
    ...extra,
  });
}

test('flag PROMOCAO_PROD_HABILITADA != true: zero fetch, mesmo com config completa', async () => {
  for (const flag of [undefined, 'false', '', '0', 'yes']) {
    const env = fullEnv();
    if (flag === undefined) delete env.PROMOCAO_PROD_HABILITADA; else env.PROMOCAO_PROD_HABILITADA = flag;
    const fetchImpl = fakeFetch([jsonResponse(200, { id: 'dpl_1', readyState: 'READY' })]);
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
    const fetchImpl = fakeFetch([jsonResponse(200, { id: 'dpl_1', readyState: 'READY' })]);
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
  const fetchImpl = fakeFetch([jsonResponse(200, {})]);
  await assert.rejects(() => makeClient(env, fetchImpl)({ sha: SHA }), (error) => error.code === 'release_not_configured');
  assert.equal(fetchImpl.calls.length, 0);

  // Apenas um dos dois (id OU name) basta.
  const onlyName = fullEnv();
  delete onlyName.VERCEL_PROD_PROJECT_ID;
  const okFetch = fakeFetch([jsonResponse(200, { id: 'dpl_1', readyState: 'READY' })]);
  const result = await makeClient(onlyName, okFetch)({ sha: SHA, target: 'production' });
  assert.equal(result.state, 'READY');
});

test('SHA ausente ou invalido: zero fetch (nunca latest/main/HEAD/abreviado)', async () => {
  for (const sha of [undefined, '', '   ', 'latest', 'main', 'HEAD', 'a22fbf2', SHA.slice(0, 39), `${SHA}0`, `${SHA.slice(0, 39)}g`, 123, null]) {
    const fetchImpl = fakeFetch([jsonResponse(200, { id: 'dpl_1', readyState: 'READY' })]);
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
  const fetchImpl = fakeFetch([jsonResponse(200, { id: 'dpl_1', readyState: 'READY' })]);
  await assert.rejects(
    () => makeClient(fullEnv(), fetchImpl)({ sha: SHA, target: 'preview' }),
    (error) => error.code === 'release_not_configured',
  );
  assert.equal(fetchImpl.calls.length, 0);
});

test('config completa + mock: POST correto (URL, target production, projeto, team, SHA exato, Bearer)', async () => {
  const fetchImpl = fakeFetch([jsonResponse(200, { id: 'dpl_abc', readyState: 'READY', target: 'production' })]);
  const result = await makeClient(fullEnv(), fetchImpl)({ sha: SHA, target: 'production' });

  assert.equal(fetchImpl.calls.length, 1);
  const { url, init } = fetchImpl.calls[0];
  assert.equal(url, 'https://api.vercel.com/v13/deployments?teamId=team_abc123');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(init.headers['Content-Type'], 'application/json');

  const body = JSON.parse(init.body);
  assert.equal(body.target, 'production');
  assert.equal(body.project, 'prj_prod123');
  assert.equal(body.name, 'amanteigados-livia');
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

test('token nunca aparece no payload publico, no resultado nem em erros', async () => {
  const config = readReleaseConfig(fullEnv());
  const publicRequest = buildDeploymentRequest(config, SHA);
  assert.doesNotMatch(JSON.stringify(publicRequest), new RegExp(TOKEN));

  const okFetch = fakeFetch([jsonResponse(200, { id: 'dpl_abc', readyState: 'READY' })]);
  const result = await makeClient(fullEnv(), okFetch)({ sha: SHA, target: 'production' });
  assert.doesNotMatch(JSON.stringify(result), new RegExp(TOKEN));

  // Resposta de erro da API que ecoa o token: a mensagem do erro nao o repassa.
  const echoFetch = fakeFetch([jsonResponse(403, { error: { code: 'forbidden', message: `bad token ${TOKEN}` } })]);
  await assert.rejects(
    () => makeClient(fullEnv(), echoFetch)({ sha: SHA, target: 'production' }),
    (error) => {
      assert.doesNotMatch(String(error.message), new RegExp(TOKEN));
      assert.doesNotMatch(JSON.stringify({ ...error, message: error.message }), new RegExp(TOKEN));
      return true;
    },
  );

  // Erro de rede cuja mensagem contem o token: tambem nao vaza.
  const netFetch = fakeFetch([new Error(`connect failed Bearer ${TOKEN}`)]);
  await assert.rejects(
    () => makeClient(fullEnv(), netFetch)({ sha: SHA, target: 'production' }),
    (error) => error.code === 'release_api_error' && !String(error.message).includes(TOKEN),
  );

  assert.equal(redactSecrets(`x Bearer ${TOKEN} y`, [TOKEN]).includes(TOKEN), false);
  assert.equal(new ReleaseError(500, 'x', `Bearer ${TOKEN}`).message.includes(TOKEN), false);
});

test('API retorna erro: nao publica (lanca release_api_error, called=true)', async () => {
  for (const status of [400, 401, 403, 429, 500]) {
    const fetchImpl = fakeFetch([jsonResponse(status, { error: { code: 'bad_request' } })]);
    await assert.rejects(
      () => makeClient(fullEnv(), fetchImpl)({ sha: SHA, target: 'production' }),
      (error) => error.code === 'release_api_error' && error.called === true && /HTTP/.test(error.message),
      String(status),
    );
    assert.equal(fetchImpl.calls.length, 1);
  }
  // Resposta 200 sem id de deployment tambem nao vale.
  const noId = fakeFetch([jsonResponse(200, { readyState: 'READY' })]);
  await assert.rejects(
    () => makeClient(fullEnv(), noId)({ sha: SHA, target: 'production' }),
    (error) => error.code === 'release_api_error',
  );
});

test('deployment BUILDING e depois READY: so vira READY (evidencia) apos o polling', async () => {
  const fetchImpl = fakeFetch([
    jsonResponse(200, { id: 'dpl_abc', readyState: 'QUEUED' }),
    jsonResponse(200, { id: 'dpl_abc', readyState: 'BUILDING' }),
    jsonResponse(200, { id: 'dpl_abc', readyState: 'BUILDING' }),
    jsonResponse(200, { id: 'dpl_abc', readyState: 'READY', target: 'production' }),
  ]);
  let sleeps = 0;
  const result = await makeClient(fullEnv(), fetchImpl, {
    sleep: async () => { sleeps += 1; },
  })({ sha: SHA, target: 'production' });

  assert.equal(result.ok, true);
  assert.equal(result.state, 'READY');
  assert.equal(result.attempts, 3);
  assert.equal(sleeps, 3);
  assert.equal(fetchImpl.calls.length, 4);
  // Polling e GET no deployment criado, com o teamId.
  assert.equal(fetchImpl.calls[1].url, 'https://api.vercel.com/v13/deployments/dpl_abc?teamId=team_abc123');
  assert.equal(fetchImpl.calls[1].init.method, 'GET');
  assert.equal(fetchImpl.calls[1].init.body, undefined);
});

test('criado mas nao READY: o resultado nunca e ok (nao publicavel) enquanto nao houver READY', async () => {
  const fetchImpl = fakeFetch([
    jsonResponse(200, { id: 'dpl_abc', readyState: 'QUEUED' }),
    jsonResponse(200, { id: 'dpl_abc', readyState: 'BUILDING' }),
  ]);
  const result = await makeClient(fullEnv(), fetchImpl, { maxAttempts: 2 })({ sha: SHA, target: 'production' });
  assert.equal(result.ok, false);
  assert.equal(result.state, 'TIMEOUT');
});

test('ERROR e CANCELED: terminais, ok=false', async () => {
  for (const readyState of ['ERROR', 'CANCELED']) {
    const immediate = fakeFetch([jsonResponse(200, { id: 'dpl_abc', readyState })]);
    const a = await makeClient(fullEnv(), immediate)({ sha: SHA, target: 'production' });
    assert.equal(a.ok, false);
    assert.equal(a.state, readyState);
    assert.equal(immediate.calls.length, 1);

    const afterBuild = fakeFetch([
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
  const building = fakeFetch([jsonResponse(200, { id: 'dpl_abc', readyState: 'BUILDING' })]);
  const byAttempts = await makeClient(fullEnv(), building, { maxAttempts: 3 })({ sha: SHA, target: 'production' });
  assert.equal(byAttempts.state, 'TIMEOUT');
  assert.equal(byAttempts.ok, false);
  assert.equal(building.calls.length, 1 + 3);

  // Por relogio injetado: cada now() avanca 1000 ms; timeout 2500 ms.
  let clock = 0;
  const building2 = fakeFetch([jsonResponse(200, { id: 'dpl_abc', readyState: 'BUILDING' })]);
  const byClock = await makeClient(fullEnv(), building2, {
    now: () => { clock += 1000; return clock; },
    pollTimeoutMs: 2500,
    maxAttempts: 100,
  })({ sha: SHA, target: 'production' });
  assert.equal(byClock.state, 'TIMEOUT');
  assert.equal(byClock.ok, false);
  assert.ok(building2.calls.length < 10);
});

test('estado desconhecido nunca vira READY', () => {
  assert.equal(mapReadyState('WEIRD'), 'BUILDING');
  assert.equal(mapReadyState(undefined), 'BUILDING');
  assert.equal(mapReadyState('ready'), 'READY');
  assert.equal(mapReadyState('QUEUED'), 'CREATED');
  assert.equal(mapReadyState('INITIALIZING'), 'CREATED');
});

test('READY com target != production ou SHA divergente NAO e evidencia valida', async () => {
  const wrongTarget = fakeFetch([jsonResponse(200, { id: 'dpl_abc', readyState: 'READY', target: null })]);
  const a = await makeClient(fullEnv(), wrongTarget)({ sha: SHA, target: 'production' });
  assert.equal(a.ok, false);
  assert.equal(a.state, 'ERROR');
  assert.equal(a.reason, 'target_mismatch');

  const wrongSha = fakeFetch([jsonResponse(200, {
    id: 'dpl_abc',
    readyState: 'READY',
    target: 'production',
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

test('identificadores com caracteres perigosos (path/query injection) sao rejeitados sem fetch', async () => {
  for (const [key, value] of [
    ['VERCEL_TEAM_ID', 'team&x=1'],
    ['VERCEL_PROD_PROJECT_ID', 'prj/../x'],
    ['VERCEL_RELEASE_GIT_OWNER', 'own er'],
    ['VERCEL_RELEASE_GIT_REPO', 'repo?x'],
  ]) {
    const env = fullEnv({ [key]: value });
    if (key === 'VERCEL_PROD_PROJECT_ID') delete env.VERCEL_PROD_PROJECT_NAME;
    const fetchImpl = fakeFetch([jsonResponse(200, { id: 'dpl_1', readyState: 'READY' })]);
    await assert.rejects(
      () => makeClient(env, fetchImpl)({ sha: SHA, target: 'production' }),
      (error) => error.code === 'release_not_configured',
      key,
    );
    assert.equal(fetchImpl.calls.length, 0, key);
  }
});
