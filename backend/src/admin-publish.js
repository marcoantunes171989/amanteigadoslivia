import { randomUUID } from 'node:crypto';
import { AdminError } from './admin-errors.js';

export function isProdPromotionEnabled() {
  return String(process.env.PROMOCAO_PROD_HABILITADA || '').toLowerCase() === 'true';
}

const BLOCK_REASON = 'Credenciais/ambiente de produção ainda não habilitados.';

export async function getPublicationStatus(queryable) {
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

  return {
    homolog: {
      git_sha: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_SHA || null,
      vercel_status: process.env.VERCEL ? 'conectado' : 'local',
      database_status: 'conectado',
      migrations: migrationsAplicadas,
      categorias_ativas: categorias.rows[0]?.total ?? 0,
      produtos_ativos: produtos.rows[0]?.total ?? 0,
      ultima_alteracao_catalogo: lastCatalog.rows[0]?.ultima_alteracao || null,
    },
    producao: {
      status: 'Aguardando configuração de produção',
      habilitada: isProdPromotionEnabled(),
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

export function validatePromotionDryRun() {
  if (!isProdPromotionEnabled()) {
    return {
      status: 'BLOQUEADA',
      motivo: BLOCK_REASON,
    };
  }
  return {
    status: 'VALIDADA',
    motivo: null,
  };
}

export async function createPublicacao(queryable, dados = {}, session = {}) {
  const tipo = String(dados.tipo_publicacao || dados.tipo || 'CATALOGO').toUpperCase();
  if (!['CATALOGO', 'ESTRUTURA', 'COMPLETA'].includes(tipo)) {
    throw new AdminError(400, 'validation_error', 'Tipo de publicação inválido.');
  }
  if (!session.id_usuario_admin) {
    throw new AdminError(400, 'validation_error', 'Usuário é obrigatório.');
  }

  let status = 'RASCUNHO';
  let mensagem = null;
  if (dados.acao === 'validar') {
    const dryRun = validatePromotionDryRun();
    status = dryRun.status;
    mensagem = dryRun.motivo;
  } else if (dados.acao === 'publicar') {
    if (!isProdPromotionEnabled()) {
      throw new AdminError(409, 'production_not_enabled', 'Produção ainda não habilitada. Configure e aprove o ambiente antes de publicar.');
    }
  } else if (dados.acao === 'agendar') {
    status = 'AGENDADA';
    mensagem = isProdPromotionEnabled() ? null : BLOCK_REASON;
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
      process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_SHA || null,
      status,
      dados.data_agendada || null,
      JSON.stringify({ observacao: dados.observacao || null, acao: dados.acao || 'registrar' }),
      mensagem,
    ],
  );
  return result.rows[0];
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
