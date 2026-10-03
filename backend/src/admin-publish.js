import { randomUUID } from 'node:crypto';
import { AdminError } from './admin-errors.js';
import { isRootSuperAdmin } from './admin-users.js';
import { withTransaction } from './db-tx.js';
import { verifyPostReleaseDeployment } from './vercel-release.js';

export const PROD_PUBLISH_CONFIRMATION = 'PUBLICAR PRODUCAO';
export const BLOCK_REASON = 'Credenciais/ambiente de produção ainda não habilitados.';
export const ROLLBACK_MANUAL_REQUIRED = 'ROLLBACK_MANUAL_REQUIRED';

const CHECK = Object.freeze({
  PASS: 'PASS',
  WARN: 'WARN',
  BLOCK: 'BLOCK',
});

function envFlag(name) {
  return String(process.env[name] || '').trim();
}

function envEnabled(name) {
  return envFlag(name).toLowerCase() === 'true';
}

function envPresent(name) {
  return envFlag(name).length > 0;
}

export function isProdPromotionEnabled() {
  return envEnabled('PROMOCAO_PROD_HABILITADA');
}

export function currentHomologSha() {
  return envFlag('VERCEL_GIT_COMMIT_SHA') || envFlag('GIT_SHA') || null;
}

export function releaseConfigPresence() {
  return {
    promocao_habilitada: isProdPromotionEnabled(),
    vercel_release_token: envPresent('VERCEL_RELEASE_TOKEN'),
    vercel_team_id: envPresent('VERCEL_TEAM_ID'),
    vercel_prod_project_id: envPresent('VERCEL_PROD_PROJECT_ID'),
    vercel_prod_project_name: envPresent('VERCEL_PROD_PROJECT_NAME'),
    vercel_prod_domain: envPresent('VERCEL_PROD_DOMAIN'),
    vercel_release_git_owner: envPresent('VERCEL_RELEASE_GIT_OWNER'),
    vercel_release_git_repo: envPresent('VERCEL_RELEASE_GIT_REPO'),
  };
}

export function isReleaseConfigured(presence = releaseConfigPresence()) {
  return presence.vercel_release_token
    && presence.vercel_team_id
    && (presence.vercel_prod_project_id || presence.vercel_prod_project_name)
    && presence.vercel_prod_domain
    && presence.vercel_release_git_owner
    && presence.vercel_release_git_repo;
}

// Readiness PROD vem SEMPRE do servidor (deps montadas em api/admin-router.js).
// Nunca do body/query da requisicao. Ausente => false (fail-closed).
export function readinessFromDeps(deps = {}) {
  return {
    prodDatabaseReady: deps?.prodDatabaseReady === true,
    prodEnvReady: deps?.prodEnvReady === true,
  };
}

function check(id, status, mensagem) {
  return { id, status, mensagem };
}

function overallStatus(checks) {
  if (checks.some((item) => item.status === CHECK.BLOCK)) return 'BLOQUEADA';
  return 'VALIDADA';
}

function sessionActor(session = {}) {
  return {
    id_usuario_admin: session.id_usuario_admin || null,
    perfil: session.perfil || session.perfil_usuario || null,
    protegido: session.protegido === true,
    nome_usuario: session.nome_usuario || null,
  };
}

export function canPromoteProduction(session) {
  return isRootSuperAdmin(sessionActor(session));
}

export function evaluatePromotionChecks(options = {}) {
  const session = sessionActor(options.session);
  const requireConfirmation = options.requireConfirmation === true;
  const requestedSha = options.requestedSha ? String(options.requestedSha).trim() : '';
  const homologSha = currentHomologSha();
  const presence = releaseConfigPresence();
  const prodDatabaseReady = options.prodDatabaseReady === true;
  const prodEnvReady = options.prodEnvReady === true;
  const checks = [];

  if (session.id_usuario_admin) {
    checks.push(check('session', CHECK.PASS, 'Sessão administrativa autenticada.'));
  } else {
    checks.push(check('session', CHECK.BLOCK, 'Sessão administrativa ausente.'));
  }

  if (canPromoteProduction(session)) {
    checks.push(check('perfil', CHECK.PASS, 'Usuário ROOT SUPER_ADMIN protegido autorizado.'));
  } else if (String(session.perfil || '').toUpperCase() === 'SUPER_ADMIN') {
    checks.push(check('perfil', CHECK.BLOCK, 'SUPER_ADMIN não protegido não pode promover produção.'));
  } else if (session.perfil) {
    checks.push(check('perfil', CHECK.BLOCK, 'Usuário sem permissão para atualizar produção.'));
  } else {
    checks.push(check('perfil', CHECK.BLOCK, 'Perfil administrativo desconhecido.'));
  }

  if (envPresent('VERCEL') || envFlag('VERCEL_ENV')) {
    checks.push(check('ambiente', CHECK.PASS, 'Ambiente de homologação identificado.'));
  } else {
    checks.push(check('ambiente', CHECK.WARN, 'Execução fora da homologação publicada.'));
  }

  if (presence.promocao_habilitada) {
    checks.push(check('feature_flag', CHECK.PASS, 'Promoção de produção habilitada.'));
  } else {
    checks.push(check('feature_flag', CHECK.BLOCK, 'Promoção de produção desabilitada.'));
  }

  if (!homologSha) {
    checks.push(check('git_sha', CHECK.BLOCK, 'SHA de homologação ausente.'));
  } else if (requireConfirmation && !requestedSha) {
    checks.push(check('git_sha', CHECK.BLOCK, 'SHA solicitado ausente. Informe o SHA exato da homologação validada.'));
  } else if (requestedSha && requestedSha !== homologSha) {
    checks.push(check('git_sha', CHECK.BLOCK, 'SHA divergente da homologação atual. Exija nova validação.'));
  } else {
    checks.push(check('git_sha', CHECK.PASS, `SHA de homologação ${homologSha}.`));
  }

  if (presence.vercel_release_token) {
    checks.push(check('release_token', CHECK.PASS, 'Token de release configurado.'));
  } else {
    checks.push(check('release_token', CHECK.BLOCK, 'Release token ausente.'));
  }

  if (isReleaseConfigured(presence)) {
    checks.push(check('release_config', CHECK.PASS, 'Mecanismo de release configurado.'));
  } else {
    checks.push(check('release_config', CHECK.BLOCK, 'Projeto Vercel PROD não configurado.'));
  }

  if (prodEnvReady) {
    checks.push(check('prod_env', CHECK.PASS, 'Parâmetros de produção evidenciados.'));
  } else {
    checks.push(check('prod_env', CHECK.BLOCK, 'Env PROD incompleto.'));
  }

  if (prodDatabaseReady) {
    checks.push(check('prod_database', CHECK.PASS, 'Banco PROD evidenciado como preparado.'));
  } else {
    checks.push(check('prod_database', CHECK.BLOCK, 'Banco PROD não preparado.'));
  }

  if (requireConfirmation) {
    if (String(options.confirmacao || '') === PROD_PUBLISH_CONFIRMATION) {
      checks.push(check('confirmacao', CHECK.PASS, 'Confirmação textual aceita.'));
    } else if (options.confirmacao == null || options.confirmacao === '') {
      checks.push(check('confirmacao', CHECK.BLOCK, 'Confirmação ausente. Digite PUBLICAR PRODUCAO.'));
    } else {
      checks.push(check('confirmacao', CHECK.BLOCK, 'Confirmação inválida. Digite PUBLICAR PRODUCAO.'));
    }
  }

  const status = overallStatus(checks);
  const bloqueios = checks.filter((item) => item.status === CHECK.BLOCK).map((item) => item.mensagem);
  return {
    status,
    motivo: status === 'BLOQUEADA' ? (bloqueios[0] || BLOCK_REASON) : null,
    git_sha: homologSha,
    checks,
    bloqueios,
  };
}

export function validatePromotionDryRun(options = {}) {
  return evaluatePromotionChecks({ ...options, requireConfirmation: false });
}

export function productionReadiness(options = {}) {
  const evaluation = evaluatePromotionChecks(options);
  const presence = releaseConfigPresence();
  const habilitada = presence.promocao_habilitada;
  const releaseConfigurada = isReleaseConfigured(presence);
  const pronta = habilitada && releaseConfigurada && evaluation.status === 'VALIDADA';
  return {
    status: habilitada && pronta ? 'Online' : 'Produção não habilitada',
    badge: pronta ? 'ONLINE' : 'BLOQUEADA',
    habilitada,
    release_configurada: releaseConfigurada,
    pronta,
    git_sha: null,
    mensagem: pronta
      ? 'Produção pronta para promoção controlada.'
      : 'Prepare o ambiente de produção antes de liberar a promoção.',
    bloqueios: evaluation.bloqueios,
  };
}

export async function getPublicationStatus(queryable, options = {}) {
  const [migrations, categorias, produtos, lastCatalog] = await sequentialQueries(queryable, [
    [`SELECT 1`, []],
    [`SELECT count(*) FILTER (WHERE ativo = true)::int AS total FROM app.tab_categoria`, []],
    [`SELECT count(*) FILTER (WHERE ativo = true)::int AS total FROM app.tab_produto`, []],
    [`
      SELECT GREATEST(
        COALESCE((SELECT MAX(data_atualizacao) FROM app.tab_categoria), '-infinity'::timestamptz),
        COALESCE((SELECT MAX(data_atualizacao) FROM app.tab_produto), '-infinity'::timestamptz)
      ) AS ultima_alteracao
    `, []],
  ]);

  let migrationsAplicadas = [];
  try {
    const ledger = await queryable.query(
      `SELECT migration_id FROM app.schema_migrations ORDER BY applied_at ASC`,
    );
    migrationsAplicadas = ledger.rows.map((row) => row.migration_id);
  } catch {
    migrationsAplicadas = [];
  }

  const publicacoes = await queryable.query(
    `-- op:list_publicacoes
      SELECT id_publicacao, id_usuario_admin, tipo_publicacao, ambiente_origem, ambiente_destino,
             git_sha, status_publicacao, data_agendada, data_criacao, data_inicio, data_fim,
             resumo_json, mensagem_erro
      FROM app.tab_publicacao
      ORDER BY data_criacao DESC
    `,
  );

  const producao = productionReadiness(options);
  return {
    homolog: {
      git_sha: currentHomologSha(),
      vercel_status: process.env.VERCEL ? 'conectado' : 'local',
      database_status: 'conectado',
      migrations: migrationsAplicadas,
      categorias_ativas: categorias.rows[0]?.total ?? 0,
      produtos_ativos: produtos.rows[0]?.total ?? 0,
      ultima_alteracao_catalogo: lastCatalog.rows[0]?.ultima_alteracao || null,
    },
    producao,
    permissoes: {
      pode_atualizar_producao: canPromoteProduction(options.session),
    },
    publicacoes: publicacoes.rows,
  };
}

async function sequentialQueries(queryable, items) {
  const out = [];
  for (const [sql, params] of items) {
    out.push(await queryable.query(sql, params));
  }
  return out;
}

function parseResumo(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string' || !value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function publicacaoResumo(dados = {}, extra = {}) {
  return {
    observacao: dados.observacao || null,
    acao: dados.acao || 'registrar',
    ...extra,
  };
}

async function insertPublicacao(queryable, dados = {}, session = {}, extra = {}) {
  const tipo = String(dados.tipo_publicacao || dados.tipo || 'CATALOGO').toUpperCase();
  if (!['CATALOGO', 'ESTRUTURA', 'COMPLETA'].includes(tipo)) {
    throw new AdminError(400, 'validation_error', 'Tipo de publicação inválido.');
  }
  if (!session.id_usuario_admin) {
    throw new AdminError(400, 'validation_error', 'Usuário é obrigatório.');
  }

  const result = await queryable.query(
    `-- op:insert_publicacao
      INSERT INTO app.tab_publicacao (
        id_publicacao, id_usuario_admin, tipo_publicacao, git_sha, status_publicacao,
        data_agendada, resumo_json, mensagem_erro
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
      RETURNING id_publicacao, id_usuario_admin, tipo_publicacao, ambiente_origem, ambiente_destino,
                git_sha, status_publicacao, data_agendada, data_criacao, resumo_json, mensagem_erro
    `,
    [
      randomUUID(),
      session.id_usuario_admin,
      tipo,
      extra.git_sha || currentHomologSha(),
      extra.status || 'RASCUNHO',
      dados.data_agendada || null,
      JSON.stringify(publicacaoResumo(dados, {
        nome_usuario: session.nome_usuario || null,
        checks: extra.checks || null,
        requested_sha: dados.git_sha || null,
        release: extra.release || null,
      })),
      extra.mensagem || null,
    ],
  );
  return result.rows[0];
}

// B3: atualiza a reserva EM_EXECUCAO com o resultado final. Grava em resumo_json.release (sem migration).
async function finalizePublicacao(queryable, idPublicacao, { status, mensagem, release }) {
  const result = await queryable.query(
    `-- op:finalize_publicacao
      UPDATE app.tab_publicacao
      SET status_publicacao = $2,
          mensagem_erro = $3,
          data_fim = now(),
          resumo_json = COALESCE(resumo_json, '{}'::jsonb) || $4::jsonb
      WHERE id_publicacao = $1
      RETURNING id_publicacao, id_usuario_admin, tipo_publicacao, ambiente_origem, ambiente_destino,
                git_sha, status_publicacao, data_agendada, data_criacao, resumo_json, mensagem_erro
    `,
    [idPublicacao, status, mensagem || null, JSON.stringify({ release: release || null })],
  );
  return result.rows[0] || null;
}

// B3: um registro pode ter POST enviado se marca post_sent, ou se tem evidencia pos-POST
// (deployment_id ou state). Registros pre-POST gravam so post_sent=false e nao bloqueiam.
// Cobre tambem linhas gravadas antes do campo post_sent existir.
function releaseMayExist(resumoJson) {
  const release = parseResumo(resumoJson)?.release;
  if (!release || typeof release !== 'object') return false;
  if (release.post_sent === true) return true;
  return Boolean(release.deployment_id || release.state);
}

// B3: reserva persistente por SHA ANTES de qualquer POST.
// Lock transacional por SHA, checagem de estados existentes e INSERT EM_EXECUCAO, com COMMIT antes do POST.
// Bloqueia: PUBLICADA, EM_EXECUCAO, ou ERRO com POST enviado (resultado remoto pode existir; conciliar manualmente).
export async function reserveProductionRelease(queryable, dados = {}, session = {}, evaluation) {
  return withTransaction(queryable, async (tx) => {
    await tx.query(
      `-- op:lock_publicacao_sha
        SELECT pg_advisory_xact_lock(hashtext($1))`,
      [evaluation.git_sha],
    );
    const existing = await tx.query(
      `-- op:select_publicacoes_sha
        SELECT status_publicacao, resumo_json
        FROM app.tab_publicacao
        WHERE git_sha = $1
          AND status_publicacao IN ('PUBLICADA', 'EM_EXECUCAO', 'ERRO')`,
      [evaluation.git_sha],
    );
    const blocked = (existing.rows || []).some((row) => {
      if (row.status_publicacao === 'PUBLICADA' || row.status_publicacao === 'EM_EXECUCAO') return true;
      return releaseMayExist(row.resumo_json);
    });
    if (blocked) return { blocked: true, publicacao: null };
    const publicacao = await insertPublicacao(tx, dados, session, {
      status: 'EM_EXECUCAO',
      mensagem: null,
      checks: evaluation.checks,
      git_sha: evaluation.git_sha,
    });
    return { blocked: false, publicacao };
  });
}

export async function createPublicacao(queryable, dados = {}, session = {}, deps = {}) {
  const tipo = String(dados.tipo_publicacao || dados.tipo || 'CATALOGO').toUpperCase();
  if (!['CATALOGO', 'ESTRUTURA', 'COMPLETA'].includes(tipo)) {
    throw new AdminError(400, 'validation_error', 'Tipo de publicação inválido.');
  }
  if (!session.id_usuario_admin) {
    throw new AdminError(400, 'validation_error', 'Usuário é obrigatório.');
  }

  let status = 'RASCUNHO';
  let mensagem = null;
  let checks = null;
  if (dados.acao === 'validar') {
    const dryRun = validatePromotionDryRun({
      session,
      requestedSha: dados.git_sha,
      ...readinessFromDeps(deps),
    });
    status = dryRun.status;
    mensagem = dryRun.motivo;
    checks = dryRun.checks;
  } else if (dados.acao === 'publicar') {
    const promotion = await promoteToProduction(queryable, dados, session, deps);
    return promotion.publicacao;
  } else if (dados.acao === 'agendar') {
    status = 'AGENDADA';
    mensagem = isProdPromotionEnabled() ? null : BLOCK_REASON;
  }

  return insertPublicacao(queryable, dados, session, { status, mensagem, checks });
}

async function callVercelProductionRelease({ sha, vercelReleaseClient }) {
  if (typeof vercelReleaseClient !== 'function') {
    throw new AdminError(409, 'release_not_configured', 'Orquestração de produção não configurada.');
  }
  return vercelReleaseClient({ sha, target: 'production' });
}

// Mensagens fixas (nunca repassa texto de terceiros): sem token, sem corpo de resposta.
const RELEASE_STATE_MESSAGE = Object.freeze({
  ERROR: 'Deployment de produção terminou com erro.',
  CANCELED: 'Deployment de produção foi cancelado.',
  TIMEOUT: 'Deployment de produção sem confirmação READY no tempo limite.',
});

// B6: depois do POST o deployment pode existir e ate virar producao. Recuperacao manual em qualquer
// estado diferente de ERROR/CANCELED (deployment que nunca serve trafego).
function needsRecovery(state) {
  return state !== 'ERROR' && state !== 'CANCELED';
}

// Campos canonicos de recuperacao manual (B6). Vazio quando nao aplicavel.
function recoveryFields(enabled) {
  return enabled ? { rollback: ROLLBACK_MANUAL_REQUIRED, rollback_manual_required: true } : {};
}

function releaseSummary(release) {
  if (!release || typeof release !== 'object') return null;
  return {
    state: typeof release.state === 'string' ? release.state : null,
    deployment_id: typeof release.deploymentId === 'string' ? release.deploymentId : null,
    attempts: Number.isInteger(release.attempts) ? release.attempts : null,
    reason: typeof release.reason === 'string' ? release.reason : null,
    previous_production_deployment_id: typeof release.previousProductionDeploymentId === 'string'
      ? release.previousProductionDeploymentId
      : null,
    post_sent: true,
  };
}

// Falha ocorrida com o POST ja enviado (resultado desconhecido OU falha nao classificada):
// o deployment pode existir. Registra post_sent e recuperacao manual, preservando o anterior.
function postFailureRecord(error) {
  return {
    state: 'UNKNOWN',
    deployment_id: null,
    attempts: null,
    reason: typeof error?.code === 'string' ? error.code : 'release_failed',
    previous_production_deployment_id: typeof error?.previousProductionDeploymentId === 'string'
      ? error.previousProductionDeploymentId
      : null,
    post_sent: true,
    ...recoveryFields(true),
  };
}

export async function promoteToProduction(queryable, dados = {}, session = {}, deps = {}) {
  if (!canPromoteProduction(session)) {
    const evaluation = evaluatePromotionChecks({
      session,
      requestedSha: dados.git_sha,
      confirmacao: dados.confirmacao,
      requireConfirmation: true,
      prodDatabaseReady: deps.prodDatabaseReady,
      prodEnvReady: deps.prodEnvReady,
    });
    const publicacao = session.id_usuario_admin
      ? await insertPublicacao(queryable, dados, session, {
        status: 'BLOQUEADA',
        mensagem: evaluation.motivo || 'Usuário sem permissão.',
        checks: evaluation.checks,
        git_sha: evaluation.git_sha,
      }).catch(() => null)
      : null;
    return {
      ok: false,
      httpStatus: 403,
      error: 'forbidden',
      status: 'BLOQUEADA',
      mensagem: 'Usuário sem permissão para atualizar produção.',
      checks: evaluation.checks,
      publicacao,
      vercelCalled: false,
    };
  }

  const evaluation = evaluatePromotionChecks({
    session,
    requestedSha: dados.git_sha,
    confirmacao: dados.confirmacao,
    requireConfirmation: true,
    prodDatabaseReady: deps.prodDatabaseReady,
    prodEnvReady: deps.prodEnvReady,
  });

  if (evaluation.status !== 'VALIDADA') {
    const publicacao = await insertPublicacao(queryable, dados, session, {
      status: 'BLOQUEADA',
      mensagem: evaluation.motivo,
      checks: evaluation.checks,
      git_sha: evaluation.git_sha,
    }).catch(() => null);
    return {
      ok: false,
      httpStatus: 409,
      error: evaluation.checks.some((item) => item.id === 'feature_flag' && item.status === CHECK.BLOCK)
        ? 'production_not_enabled'
        : 'promotion_blocked',
      status: 'BLOQUEADA',
      mensagem: evaluation.motivo,
      checks: evaluation.checks,
      publicacao,
      vercelCalled: false,
    };
  }

  if (typeof deps.vercelReleaseClient !== 'function') {
    const publicacao = await insertPublicacao(queryable, dados, session, {
      status: 'BLOQUEADA',
      mensagem: 'Orquestração de produção não configurada.',
      checks: evaluation.checks,
      git_sha: evaluation.git_sha,
    }).catch(() => null);
    return {
      ok: false,
      httpStatus: 409,
      error: 'release_not_configured',
      status: 'BLOQUEADA',
      mensagem: 'Orquestração de produção não configurada.',
      checks: evaluation.checks,
      publicacao,
      vercelCalled: false,
    };
  }

  // B3: reserva EM_EXECUCAO commitada ANTES do POST. SHA ja publicado, em execucao ou com POST enviado => zero POST.
  const reservation = await reserveProductionRelease(queryable, dados, session, evaluation);
  if (reservation.blocked) {
    return {
      ok: false,
      httpStatus: 409,
      error: 'release_already_attempted',
      status: 'BLOQUEADA',
      mensagem: 'Release deste SHA já foi iniciado ou concluído. Não repetir automaticamente.',
      checks: evaluation.checks,
      publicacao: null,
      vercelCalled: false,
    };
  }
  const reservationId = reservation.publicacao.id_publicacao;

  let release;
  try {
    release = await callVercelProductionRelease({
      sha: evaluation.git_sha,
      vercelReleaseClient: deps.vercelReleaseClient,
    });
  } catch (error) {
    // Falha do adapter: nunca PUBLICADA. Mensagem so do codigo controlado.
    // Outcome unknown do POST: NAO e falha confirmada nem sucesso. Preserva o codigo e o resumo UNKNOWN.
    const notConfigured = ['release_not_configured', 'production_not_enabled', 'invalid_sha'].includes(error?.code);
    const previousUnproven = error?.code === 'release_previous_unproven';
    const outcomeUnknown = error?.code === 'release_post_outcome_unknown';
    const status = notConfigured || previousUnproven ? 'BLOQUEADA' : 'ERRO';
    const code = notConfigured || previousUnproven || outcomeUnknown ? error.code : 'release_failed';
    let mensagem = 'Falha ao criar o deployment de produção.';
    if (notConfigured) mensagem = 'Orquestração de produção não configurada.';
    if (previousUnproven) mensagem = 'Não foi possível identificar o deployment de produção anterior. Release bloqueado antes do POST.';
    if (outcomeUnknown) mensagem = 'Não foi possível confirmar o resultado do POST: o deployment de produção pode ter sido criado. Não repetir automaticamente; verificar na Vercel antes de nova tentativa.';
    // Pos-POST (incluindo falha generica) => post_sent + recuperacao manual. Pre-POST => post_sent=false.
    const postMayExist = outcomeUnknown || error?.postSent === true;
    const record = postMayExist
      ? postFailureRecord(error)
      : { post_sent: false, previous_production_deployment_id: typeof error?.previousProductionDeploymentId === 'string' ? error.previousProductionDeploymentId : null };
    const publicacao = await finalizePublicacao(queryable, reservationId, { status, mensagem, release: record }).catch(() => null);
    return {
      ok: false,
      httpStatus: notConfigured || previousUnproven ? 409 : 502,
      error: code,
      status,
      mensagem,
      checks: evaluation.checks,
      publicacao,
      vercelCalled: error?.called === true,
    };
  }

  // PUBLICADA exige evidencia explicita READY. Aceitar o request (CREATED/BUILDING),
  // erro, cancelamento, timeout ou retorno sem estado nao publica.
  if (release?.state !== 'READY') {
    const state = typeof release?.state === 'string' ? release.state : null;
    const mensagem = RELEASE_STATE_MESSAGE[state] || 'Deployment de produção sem evidência READY.';
    const publicacao = await finalizePublicacao(queryable, reservationId, {
      status: 'ERRO',
      mensagem,
      release: { ...releaseSummary(release), ...recoveryFields(needsRecovery(state)) },
    }).catch(() => null);
    return {
      ok: false,
      httpStatus: 502,
      error: 'release_not_ready',
      status: 'ERRO',
      mensagem,
      checks: evaluation.checks,
      publicacao,
      vercelCalled: true,
    };
  }

  // B4/B2/B7: PUBLICADA exige verificacao pos-release positiva (GET read-only do deployment).
  // expectedProjectId = identidade comprovada pelo cliente (B7). Excecao, falha ou inconclusivo => fail-closed.
  let postVerify = null;
  try {
    postVerify = await (deps.verifyPostRelease || verifyPostReleaseDeployment)({
      deploymentId: release.deploymentId,
      sha: evaluation.git_sha,
      expectedProjectId: release.projectId,
    });
  } catch {
    postVerify = null;
  }
  if (postVerify?.ok !== true) {
    // B6: READY sem verificacao positiva nao vira PUBLICADA. Novo deployment e anterior ficam registrados.
    const mensagem = `Verificação pós-release não confirmou o deployment de produção. ${ROLLBACK_MANUAL_REQUIRED}: reverter manualmente conforme o runbook.`;
    const publicacao = await finalizePublicacao(queryable, reservationId, {
      status: 'ERRO',
      mensagem,
      release: { ...releaseSummary(release), post_verify: 'FAIL', ...recoveryFields(true) },
    }).catch(() => null);
    return {
      ok: false,
      httpStatus: 502,
      error: 'post_release_verify_failed',
      status: 'ERRO',
      mensagem,
      checks: evaluation.checks,
      publicacao,
      vercelCalled: true,
    };
  }

  const publicacao = await finalizePublicacao(queryable, reservationId, {
    status: 'PUBLICADA',
    mensagem: null,
    release: { ...releaseSummary(release), post_verify: 'PASS' },
  });

  return {
    ok: true,
    httpStatus: 200,
    status: 'PUBLICADA',
    checks: evaluation.checks,
    publicacao,
    vercelCalled: true,
  };
}

export async function processDuePublications(pool, now = new Date()) {
  if (isProdPromotionEnabled()) {
    return { processed: 0, blocked: 0, note: 'ready_for_prod_connections' };
  }

  const due = await pool.query(
    `-- op:list_publicacoes_devidas
      SELECT id_publicacao, status_publicacao
      FROM app.tab_publicacao
      WHERE status_publicacao = 'AGENDADA'
        AND data_agendada IS NOT NULL
        AND data_agendada <= $1
    `,
    [now.toISOString()],
  );

  for (const row of due.rows) {
    await pool.query(
      `-- op:block_publicacao
        UPDATE app.tab_publicacao
        SET status_publicacao = 'BLOQUEADA',
            mensagem_erro = $2,
            data_fim = now()
        WHERE id_publicacao = $1
      `,
      [row.id_publicacao, BLOCK_REASON],
    );
  }

  return {
    processed: due.rows.length,
    blocked: due.rows.length,
    note: 'production_not_enabled',
  };
}

export function parsePublicacaoResumo(row) {
  return parseResumo(row?.resumo_json);
}
