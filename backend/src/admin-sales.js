import { randomUUID } from 'node:crypto';
import { getCatalogPayload } from './catalog.js';
import { AdminError, mapDatabaseError } from './admin-errors.js';
import { withTransaction } from './db-tx.js';

function toCentavos(value) {
  if (value === null || value === undefined) return null;
  const asNumber = typeof value === 'bigint' ? Number(value) : Number(value);
  if (!Number.isFinite(asNumber)) return null;
  return Math.round(asNumber * 100);
}

function publicSale(row, itens = []) {
  return {
    id_venda: String(row.id_venda),
    chave_idempotencia: row.chave_idempotencia,
    status_venda: row.status_venda,
    origem_venda: row.origem_venda,
    nome_cliente: row.nome_cliente || null,
    telefone_cliente: row.telefone_cliente || null,
    valor_total_centavos: Number(row.valor_total_centavos),
    quantidade_itens: itens.reduce((sum, item) => sum + Number(item.quantidade || 0), 0),
    data_venda: row.data_venda,
    data_atualizacao: row.data_atualizacao,
    itens,
  };
}

function effectiveUnitCentavos(product) {
  const promo = toCentavos(product.promotionalPrice);
  const regular = toCentavos(product.price);
  if (regular != null && promo != null && promo < regular) {
    return promo;
  }
  return regular;
}

export async function captureVenda(pool, payload = {}) {
  const chave = typeof payload.chave_idempotencia === 'string' ? payload.chave_idempotencia.trim() : '';
  if (!chave) {
    throw new AdminError(400, 'validation_error', 'Chave de idempotência é obrigatória.');
  }
  const itensEntrada = Array.isArray(payload.itens) ? payload.itens : [];
  if (itensEntrada.length === 0) {
    throw new AdminError(400, 'validation_error', 'Informe ao menos um item.');
  }

  try {
    return await withTransaction(pool, async (client) => {
      const existing = await client.query(
        `-- op:get_venda_chave
          SELECT id_venda, chave_idempotencia, status_venda, origem_venda, nome_cliente,
                 telefone_cliente, valor_total_centavos, data_venda, data_atualizacao
          FROM app.tab_venda
          WHERE chave_idempotencia = $1
        `,
        [chave],
      );
      if (existing.rows[0]) {
        const itens = await client.query(
          `-- op:list_venda_itens
            SELECT id_item_venda, id_venda, id_produto, nome_produto, quantidade,
                   valor_unitario_centavos, valor_total_centavos
            FROM app.tab_venda_item
            WHERE id_venda = $1
            ORDER BY data_criacao ASC
          `,
          [existing.rows[0].id_venda],
        );
        return { duplicated: true, venda: publicSale(existing.rows[0], itens.rows) };
      }

      const catalog = await getCatalogPayload(client);
      const productsById = new Map(catalog.products.map((item) => [String(item.id), item]));
      const resolved = [];
      let total = 0;
      for (const raw of itensEntrada) {
        const product = productsById.get(String(raw.id_produto || raw.productId || ''));
        if (!product || product.active !== true) {
          throw new AdminError(400, 'validation_error', 'Produto indisponível no catálogo.');
        }
        const quantidade = Number.parseInt(String(raw.quantidade ?? raw.quantity ?? ''), 10);
        if (!Number.isInteger(quantidade) || quantidade <= 0) {
          throw new AdminError(400, 'validation_error', 'Quantidade inválida.');
        }
        const unitario = effectiveUnitCentavos(product);
        if (unitario == null || unitario < 0) {
          throw new AdminError(400, 'validation_error', 'Produto sem preço vigente.');
        }
        const itemTotal = unitario * quantidade;
        total += itemTotal;
        resolved.push({
          id_produto: product.id,
          nome_produto: product.name,
          quantidade,
          valor_unitario_centavos: unitario,
          valor_total_centavos: itemTotal,
        });
      }

      const idVenda = payload.id_venda || randomUUID();
      const inserted = await client.query(
        `-- op:insert_venda
          INSERT INTO app.tab_venda (
            id_venda, chave_idempotencia, status_venda, origem_venda,
            nome_cliente, telefone_cliente, valor_total_centavos
          ) VALUES ($1, $2, 'PENDENTE', $3, $4, $5, $6)
          RETURNING id_venda, chave_idempotencia, status_venda, origem_venda, nome_cliente,
                    telefone_cliente, valor_total_centavos, data_venda, data_atualizacao
        `,
        [
          idVenda,
          chave,
          payload.origem_venda || 'SITE',
          typeof payload.nome_cliente === 'string' ? payload.nome_cliente.trim() || null : null,
          typeof payload.telefone_cliente === 'string' ? payload.telefone_cliente.trim() || null : null,
          total,
        ],
      );

      const itens = [];
      for (const item of resolved) {
        const row = await client.query(
          `-- op:insert_venda_item
            INSERT INTO app.tab_venda_item (
              id_item_venda, id_venda, id_produto, nome_produto, quantidade,
              valor_unitario_centavos, valor_total_centavos
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id_item_venda, id_venda, id_produto, nome_produto, quantidade,
                      valor_unitario_centavos, valor_total_centavos
          `,
          [
            randomUUID(),
            idVenda,
            item.id_produto,
            item.nome_produto,
            item.quantidade,
            item.valor_unitario_centavos,
            item.valor_total_centavos,
          ],
        );
        itens.push(row.rows[0]);
      }

      return { duplicated: false, venda: publicSale(inserted.rows[0], itens) };
    });
  } catch (error) {
    if (error?.code === '23505') {
      const existing = await pool.query(
        `-- op:get_venda_chave
          SELECT id_venda, chave_idempotencia, status_venda, origem_venda, nome_cliente,
                 telefone_cliente, valor_total_centavos, data_venda, data_atualizacao
          FROM app.tab_venda
          WHERE chave_idempotencia = $1
        `,
        [chave],
      );
      if (existing.rows[0]) {
        const itens = await pool.query(
          `-- op:list_venda_itens
            SELECT id_item_venda, id_venda, id_produto, nome_produto, quantidade,
                   valor_unitario_centavos, valor_total_centavos
            FROM app.tab_venda_item
            WHERE id_venda = $1
            ORDER BY data_criacao ASC
          `,
          [existing.rows[0].id_venda],
        );
        return { duplicated: true, venda: publicSale(existing.rows[0], itens.rows) };
      }
    }
    throw mapDatabaseError(error);
  }
}

function periodBounds(query = {}, now = new Date()) {
  const preset = String(query.periodo || query.range || '30d').toLowerCase();
  const end = query.data_fim ? new Date(query.data_fim) : new Date(now.getTime() + 5000);
  let start;
  if (query.data_inicio) {
    start = new Date(query.data_inicio);
  } else if (preset === 'hoje' || preset === 'today') {
    start = new Date(end);
    start.setHours(0, 0, 0, 0);
  } else if (preset === '7d' || preset === '7dias') {
    start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (preset === 'mes' || preset === 'month') {
    start = new Date(end.getFullYear(), end.getMonth(), 1);
  } else {
    start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  return { start, end };
}

export async function listVendas(queryable, query = {}) {
  const { start, end } = periodBounds(query);
  const status = query.status && query.status !== 'todos' ? String(query.status).toUpperCase() : null;
  const params = [start.toISOString()];
  let sql = `-- op:list_vendas
    SELECT id_venda, chave_idempotencia, status_venda, origem_venda, nome_cliente,
           telefone_cliente, valor_total_centavos, data_venda, data_atualizacao
    FROM app.tab_venda
    WHERE data_venda >= $1 AND data_venda <= now() + interval '2 minutes'
  `;
  if (query.data_fim) {
    params.push(end.toISOString());
    sql = `-- op:list_vendas
    SELECT id_venda, chave_idempotencia, status_venda, origem_venda, nome_cliente,
           telefone_cliente, valor_total_centavos, data_venda, data_atualizacao
    FROM app.tab_venda
    WHERE data_venda >= $1 AND data_venda <= $2
  `;
  }
  if (status && ['PENDENTE', 'CONFIRMADA', 'CANCELADA'].includes(status)) {
    params.push(status);
    sql += ` AND status_venda = $${params.length}`;
  }
  sql += ' ORDER BY data_venda DESC';
  const result = await queryable.query(sql, params);
  const ids = result.rows.map((row) => row.id_venda);
  let itens = [];
  if (ids.length) {
    const itemsResult = await queryable.query(
      `-- op:list_vendas_itens
        SELECT id_item_venda, id_venda, id_produto, nome_produto, quantidade,
               valor_unitario_centavos, valor_total_centavos
        FROM app.tab_venda_item
        WHERE id_venda = ANY($1::uuid[])
      `,
      [ids],
    );
    itens = itemsResult.rows;
  }
  const byVenda = new Map();
  for (const item of itens) {
    const key = String(item.id_venda);
    const list = byVenda.get(key) || [];
    list.push(item);
    byVenda.set(key, list);
  }
  return result.rows.map((row) => publicSale(row, byVenda.get(String(row.id_venda)) || []));
}

export async function updateVendaStatus(queryable, id, status) {
  const next = String(status || '').toUpperCase();
  if (!['CONFIRMADA', 'CANCELADA'].includes(next)) {
    throw new AdminError(400, 'validation_error', 'Status de venda inválido.');
  }
  const current = await queryable.query(
    `-- op:get_venda
      SELECT id_venda, chave_idempotencia, status_venda, origem_venda, nome_cliente,
             telefone_cliente, valor_total_centavos, data_venda, data_atualizacao
      FROM app.tab_venda
      WHERE id_venda = $1
    `,
    [id],
  );
  const row = current.rows[0];
  if (!row) {
    throw new AdminError(404, 'not_found', 'Venda não encontrada.');
  }
  if (row.status_venda !== 'PENDENTE') {
    throw new AdminError(409, 'conflict', 'Somente vendas pendentes podem mudar de status.');
  }
  const updated = await queryable.query(
    `-- op:update_venda_status
      UPDATE app.tab_venda
      SET status_venda = $2, data_atualizacao = now()
      WHERE id_venda = $1
      RETURNING id_venda, chave_idempotencia, status_venda, origem_venda, nome_cliente,
                telefone_cliente, valor_total_centavos, data_venda, data_atualizacao
    `,
    [id, next],
  );
  return publicSale(updated.rows[0]);
}

export function computeFaturamento(vendas) {
  const confirmadas = vendas.filter((item) => item.status_venda === 'CONFIRMADA');
  const faturamento = confirmadas.reduce((sum, item) => sum + Number(item.valor_total_centavos || 0), 0);
  const ticket = confirmadas.length ? Math.round(faturamento / confirmadas.length) : 0;
  return {
    pedidos: vendas.length,
    vendas_confirmadas: confirmadas.length,
    faturamento_centavos: faturamento,
    ticket_medio_centavos: ticket,
  };
}
