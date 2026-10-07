import { randomUUID } from 'node:crypto';
import { executeAdminAction } from './admin-catalog.js';
import { AdminError, mapDatabaseError } from './admin-errors.js';
import { saoPauloCivilDateTime } from './sao-paulo-time.js';

export function parseSaoPauloDateTime(data, hora, now = new Date()) {
  const dateText = typeof data === 'string' ? data.trim() : '';
  const timeText = typeof hora === 'string' ? hora.trim() : '';
  if (!dateText || !timeText) {
    throw new AdminError(400, 'validation_error', 'Informe data e hora do agendamento.');
  }
  // saoPauloCivilDateTime nunca assume um offset fixo (-03:00): recalcula o
  // deslocamento a partir do relógio de parede real em America/Sao_Paulo e
  // rejeita datas de calendário inexistentes (ex.: 29/02 em ano não bissexto)
  // em vez de normalizá-las silenciosamente para outro dia.
  const vigencia = saoPauloCivilDateTime(dateText, timeText);
  if (!vigencia) {
    throw new AdminError(400, 'validation_error', 'Data ou hora inválida.');
  }
  if (vigencia.getTime() <= now.getTime()) {
    throw new AdminError(400, 'validation_error', 'A data de vigência não pode estar no passado.');
  }
  return vigencia;
}

function entityTypeFromRecurso(recurso, acao) {
  if (recurso === 'categoria') return 'CATEGORIA';
  if (recurso === 'produto') {
    if (acao === 'editar' && (arguments[2]?.preco_normal || arguments[2]?.preco_promocional)) {
      return 'PRODUTO';
    }
    return 'PRODUTO';
  }
  return String(recurso || '').toUpperCase();
}

export async function scheduleChange(queryable, {
  id_usuario_admin,
  tipo_entidade,
  id_registro,
  dados_alteracao,
  data_vigencia,
}) {
  const tipo = String(tipo_entidade || '').toUpperCase();
  if (!['CATEGORIA', 'PRODUTO', 'PRECO', 'PROMOCAO', 'IMAGEM'].includes(tipo)) {
    throw new AdminError(400, 'validation_error', 'Tipo de alteração inválido.');
  }
  if (!id_usuario_admin) {
    throw new AdminError(400, 'validation_error', 'Usuário é obrigatório para agendar.');
  }
  if (!id_registro) {
    throw new AdminError(400, 'validation_error', 'Registro é obrigatório.');
  }
  const vigencia = data_vigencia instanceof Date ? data_vigencia : new Date(data_vigencia);
  if (Number.isNaN(vigencia.getTime()) || vigencia.getTime() <= Date.now()) {
    throw new AdminError(400, 'validation_error', 'A data de vigência não pode estar no passado.');
  }
  try {
    const result = await queryable.query(
      `-- op:insert_alteracao
        INSERT INTO app.tab_alteracao_agendada (
          id_alteracao_agendada, id_usuario_admin, tipo_entidade, id_registro,
          dados_alteracao, data_vigencia, status_alteracao
        ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, 'AGENDADA')
        RETURNING id_alteracao_agendada, id_usuario_admin, tipo_entidade, id_registro,
                  dados_alteracao, data_vigencia, status_alteracao, data_criacao
      `,
      [
        randomUUID(),
        id_usuario_admin,
        tipo,
        id_registro,
        JSON.stringify(dados_alteracao || {}),
        vigencia.toISOString(),
      ],
    );
    return result.rows[0];
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function listScheduledChanges(queryable, query = {}) {
  const status = query.status ? String(query.status).toUpperCase() : null;
  const params = [];
  let sql = `-- op:list_alteracoes
    SELECT id_alteracao_agendada, id_usuario_admin, tipo_entidade, id_registro,
           dados_alteracao, data_vigencia, status_alteracao, data_criacao,
           data_aplicacao, data_cancelamento, mensagem_erro
    FROM app.tab_alteracao_agendada
  `;
  if (status && ['AGENDADA', 'APLICADA', 'CANCELADA', 'ERRO'].includes(status)) {
    params.push(status);
    sql += ` WHERE status_alteracao = $1`;
  }
  sql += ' ORDER BY data_vigencia ASC';
  const result = await queryable.query(sql, params);
  return result.rows;
}

export async function cancelScheduledChange(queryable, id) {
  const result = await queryable.query(
    `-- op:cancel_alteracao
      UPDATE app.tab_alteracao_agendada
      SET status_alteracao = 'CANCELADA', data_cancelamento = now()
      WHERE id_alteracao_agendada = $1 AND status_alteracao = 'AGENDADA'
      RETURNING id_alteracao_agendada, status_alteracao, data_cancelamento
    `,
    [id],
  );
  if (!result.rows[0]) {
    throw new AdminError(409, 'conflict', 'Alteração não encontrada ou não pode ser cancelada.');
  }
  return result.rows[0];
}

function payloadFromScheduled(row) {
  const raw = row.dados_alteracao;
  const dados = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
  const tipo = String(row.tipo_entidade || '').toLowerCase();
  return {
    recurso: dados.recurso || tipo,
    acao: dados.acao || 'editar',
    id: row.id_registro,
    dados,
  };
}

export async function processDueScheduledChanges(pool, now = new Date()) {
  const due = await pool.query(
    `-- op:list_alteracoes_devidas
      SELECT id_alteracao_agendada, id_usuario_admin, tipo_entidade, id_registro,
             dados_alteracao, data_vigencia, status_alteracao
      FROM app.tab_alteracao_agendada
      WHERE status_alteracao = 'AGENDADA' AND data_vigencia <= $1
      ORDER BY data_vigencia ASC
    `,
    [now.toISOString()],
  );

  const results = [];
  for (const row of due.rows) {
    try {
      // A trava de idempotência é o próprio UPDATE: WHERE exige mensagem_erro IS NULL,
      // então apenas a primeira chamada concorrente que alcançar essa linha consegue
      // marcá-la como "APLICANDO"; qualquer outra (retry, instância duplicada,
      // segunda requisição) não encontra a linha mais e não reaplica a alteração.
      const claimed = await pool.query(
        `-- op:claim_alteracao
          UPDATE app.tab_alteracao_agendada
          SET mensagem_erro = 'APLICANDO'
          WHERE id_alteracao_agendada = $1 AND status_alteracao = 'AGENDADA' AND mensagem_erro IS NULL
          RETURNING id_alteracao_agendada, status_alteracao, dados_alteracao, id_registro, tipo_entidade
        `,
        [row.id_alteracao_agendada],
      );
      const current = claimed.rows[0];
      if (!current) {
        continue;
      }
      await executeAdminAction(pool, payloadFromScheduled({
        ...row,
        ...current,
      }));
      await pool.query(
        `-- op:mark_alteracao_aplicada
          UPDATE app.tab_alteracao_agendada
          SET status_alteracao = 'APLICADA', data_aplicacao = now(), mensagem_erro = NULL
          WHERE id_alteracao_agendada = $1
        `,
        [row.id_alteracao_agendada],
      );
      results.push({ id: row.id_alteracao_agendada, status: 'APLICADA' });
    } catch (error) {
      await pool.query(
        `-- op:mark_alteracao_erro
          UPDATE app.tab_alteracao_agendada
          SET status_alteracao = 'ERRO', mensagem_erro = $2
          WHERE id_alteracao_agendada = $1 AND status_alteracao = 'AGENDADA'
        `,
        [row.id_alteracao_agendada, 'Não foi possível aplicar a alteração agendada.'],
      );
      await pool.query(
        `-- op:mark_alteracao_erro_claimed
          UPDATE app.tab_alteracao_agendada
          SET status_alteracao = 'ERRO', mensagem_erro = $2
          WHERE id_alteracao_agendada = $1 AND mensagem_erro = 'APLICANDO'
        `,
        [row.id_alteracao_agendada, 'Não foi possível aplicar a alteração agendada.'],
      );
      results.push({ id: row.id_alteracao_agendada, status: 'ERRO', error: error?.message || 'erro' });
    }
  }
  return results;
}

export { entityTypeFromRecurso };
