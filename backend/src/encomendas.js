import { randomUUID } from 'node:crypto';
import { AdminError } from './admin-errors.js';
import { normalizeWhatsAppPhone } from './whatsapp.js';

export const ENCOMENDA_TIPOS = Object.freeze([
  'ENCOMENDA',
  'ANIVERSARIO',
  'PRESENTE',
  'CELEBRACAO',
  'EVENTO',
  'LEMBRANCA',
  'PERSONALIZADO',
]);

export const ENCOMENDA_STATUS = Object.freeze([
  'NOVA',
  'EM_ATENDIMENTO',
  'CONCLUIDA',
  'CANCELADA',
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function stripHtml(value) {
  return String(value ?? '').replace(/<[^>]*>/g, '').trim();
}

export function validateEncomendaPayload(payload = {}) {
  const nome = stripHtml(payload.nome_cliente || payload.nome).slice(0, 120);
  const telefone = normalizeWhatsAppPhone(payload.telefone_cliente || payload.telefone || payload.whatsapp);
  const emailRaw = stripHtml(payload.email_cliente || payload.email).slice(0, 160);
  const tipo = String(payload.tipo_solicitacao || payload.tipo || '').toUpperCase();
  const descricao = stripHtml(payload.descricao_pedido || payload.descricao).slice(0, 4000);
  const dataEvento = payload.data_evento || payload.data || null;
  const quantidadeRaw = payload.quantidade_estimada ?? payload.quantidade;
  const jsonSize = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  if (jsonSize > 20_000) {
    throw new AdminError(400, 'validation_error', 'Pedido grande demais.');
  }
  if (!nome) {
    throw new AdminError(400, 'validation_error', 'Informe o nome.');
  }
  if (!telefone) {
    throw new AdminError(400, 'validation_error', 'Informe um WhatsApp/telefone válido.');
  }
  if (emailRaw && !EMAIL_RE.test(emailRaw)) {
    throw new AdminError(400, 'validation_error', 'E-mail inválido.');
  }
  if (!ENCOMENDA_TIPOS.includes(tipo)) {
    throw new AdminError(400, 'validation_error', 'Tipo de solicitação inválido.');
  }
  if (!descricao) {
    throw new AdminError(400, 'validation_error', 'Conte-nos o que deseja.');
  }
  let quantidade = null;
  if (quantidadeRaw !== null && quantidadeRaw !== undefined && quantidadeRaw !== '') {
    quantidade = Number(quantidadeRaw);
    if (!Number.isInteger(quantidade) || quantidade <= 0 || quantidade > 10000) {
      throw new AdminError(400, 'validation_error', 'Quantidade estimada inválida.');
    }
  }
  let data = null;
  if (dataEvento) {
    const parsed = new Date(`${dataEvento}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      throw new AdminError(400, 'validation_error', 'Data do evento inválida.');
    }
    data = dataEvento;
  }
  return {
    tipo_solicitacao: tipo,
    nome_cliente: nome,
    telefone_cliente: telefone,
    email_cliente: emailRaw || null,
    data_evento: data,
    quantidade_estimada: quantidade,
    descricao_pedido: descricao,
  };
}

export async function createSolicitacaoEncomenda(queryable, payload = {}) {
  const data = validateEncomendaPayload(payload);
  const id = randomUUID();
  await queryable.query(
    `-- op:insert_solicitacao_encomenda
      INSERT INTO app.tab_solicitacao_encomenda (
        id_solicitacao_encomenda, tipo_solicitacao, nome_cliente, telefone_cliente,
        email_cliente, data_evento, quantidade_estimada, descricao_pedido, status_solicitacao
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'NOVA')
    `,
    [
      id,
      data.tipo_solicitacao,
      data.nome_cliente,
      data.telefone_cliente,
      data.email_cliente,
      data.data_evento,
      data.quantidade_estimada,
      data.descricao_pedido,
    ],
  );
  return {
    id_solicitacao_encomenda: id,
    status_solicitacao: 'NOVA',
    ...data,
  };
}

export async function listSolicitacoesEncomenda(queryable, filters = {}) {
  const params = [];
  const where = [];
  if (filters.status_solicitacao && ENCOMENDA_STATUS.includes(String(filters.status_solicitacao).toUpperCase())) {
    params.push(String(filters.status_solicitacao).toUpperCase());
    where.push(`status_solicitacao = $${params.length}`);
  }
  const result = await queryable.query(
    `-- op:list_solicitacao_encomenda
      SELECT id_solicitacao_encomenda, tipo_solicitacao, nome_cliente, telefone_cliente,
             email_cliente, data_evento, quantidade_estimada, descricao_pedido,
             status_solicitacao, data_criacao, data_atualizacao
      FROM app.tab_solicitacao_encomenda
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY data_criacao DESC
      LIMIT 200
    `,
    params,
  );
  return result.rows;
}

export async function updateSolicitacaoStatus(queryable, id, status) {
  const next = String(status || '').toUpperCase();
  if (!ENCOMENDA_STATUS.includes(next)) {
    throw new AdminError(400, 'validation_error', 'Status inválido.');
  }
  const result = await queryable.query(
    `-- op:update_solicitacao_status
      UPDATE app.tab_solicitacao_encomenda
         SET status_solicitacao = $2,
             data_atualizacao = now()
       WHERE id_solicitacao_encomenda = $1
   RETURNING id_solicitacao_encomenda, tipo_solicitacao, nome_cliente, telefone_cliente,
             email_cliente, data_evento, quantidade_estimada, descricao_pedido,
             status_solicitacao, data_criacao, data_atualizacao
    `,
    [id, next],
  );
  if (!result.rows[0]) {
    throw new AdminError(404, 'not_found', 'Solicitação não encontrada.');
  }
  return result.rows[0];
}
