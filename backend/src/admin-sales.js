import { randomUUID } from 'node:crypto';
import { getCatalogPayload } from './catalog.js';
import { AdminError, mapDatabaseError } from './admin-errors.js';
import { withTransaction } from './db-tx.js';
import { CHECKOUT_MESSAGES, CHECKOUT_NAME_MIN, normalizeCustomerName } from '../../ui-core.js';
import { normalizeWhatsAppPhone } from './whatsapp.js';
import {
  endExclusiveOfBoundary,
  saoPauloDayKey,
  saoPauloDayStart,
  startOfBoundary,
} from './sao-paulo-time.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function toCentavos(value) {
  if (value === null || value === undefined) return null;
  const asNumber = typeof value === 'bigint' ? Number(value) : Number(value);
  if (!Number.isFinite(asNumber)) return null;
  return Math.round(asNumber * 100);
}

function publicSale(row, itens = []) {
  const numero = row.numero_pedido == null ? null : Number(row.numero_pedido);
  return {
    id_venda: String(row.id_venda),
    numero_pedido: Number.isFinite(numero) ? numero : null,
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

const VENDA_BASE_COLS = `v.id_venda, v.chave_idempotencia, v.status_venda, v.origem_venda, v.nome_cliente,
                 v.telefone_cliente, v.valor_total_centavos, v.data_venda, v.data_atualizacao`;

let numeroPedidoReady = false;

async function pedidoNumeroTableExists(queryable) {
  const probe = await queryable.query(`
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tab_pedido_numero'
    LIMIT 1
  `);
  return Boolean(probe.rows[0]);
}

export async function ensureNumeroPedidoSupport(queryable) {
  if (numeroPedidoReady) return true;
  try {
    if (await pedidoNumeroTableExists(queryable)) {
      numeroPedidoReady = true;
      return true;
    }
    // DDL de criação deve ser feita no SQL Editor (public). Runtime APP só usa a tabela.
    return false;
  } catch (error) {
    console.warn('[vendas] ensureNumeroPedidoSupport', error?.code || error?.message || error);
    return false;
  }
}

async function attachNumeroPedido(client, { idVenda, telefone }) {
  await client.query('SAVEPOINT sp_pedido_numero');
  try {
    const inserted = await client.query(
      `-- op:insert_pedido_numero
        INSERT INTO public.tab_pedido_numero (id_venda, telefone_normalizado)
        VALUES ($1, $2)
        ON CONFLICT (id_venda) DO UPDATE
          SET telefone_normalizado = EXCLUDED.telefone_normalizado
        RETURNING numero_pedido
      `,
      [idVenda, telefone],
    );
    await client.query('RELEASE SAVEPOINT sp_pedido_numero');
    return Number(inserted.rows[0]?.numero_pedido) || null;
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT sp_pedido_numero');
    console.warn('[vendas] attachNumeroPedido', error?.code || error?.message || error);
    return null;
  }
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
  // Dados do cliente são obrigatórios: não confiar somente no frontend.
  const nomeCliente = normalizeCustomerName(payload.nome_cliente);
  if (nomeCliente.length < CHECKOUT_NAME_MIN) {
    throw new AdminError(400, 'validation_error', CHECKOUT_MESSAGES.nameRequired);
  }
  const telefoneCliente = normalizeWhatsAppPhone(
    typeof payload.telefone_cliente === 'string' || typeof payload.telefone_cliente === 'number'
      ? payload.telefone_cliente
      : '',
  );
  if (!telefoneCliente) {
    throw new AdminError(400, 'validation_error', CHECKOUT_MESSAGES.phoneInvalid);
  }

  try {
    return await withTransaction(pool, async (client) => {
      const numberingReady = await ensureNumeroPedidoSupport(client);
      // Busca a venda sem depender de JOIN em public (evita 42501/RLS no caminho crítico).
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
        let numeroPedido = null;
        if (numberingReady) {
          numeroPedido = await attachNumeroPedido(client, {
            idVenda: existing.rows[0].id_venda,
            telefone: existing.rows[0].telefone_cliente || telefoneCliente,
          });
        }
        return {
          duplicated: true,
          venda: publicSale({ ...existing.rows[0], numero_pedido: numeroPedido }, itens.rows),
        };
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
          nomeCliente,
          telefoneCliente,
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

      let numeroPedido = null;
      if (numberingReady) {
        numeroPedido = await attachNumeroPedido(client, { idVenda, telefone: telefoneCliente });
      }
      return {
        duplicated: false,
        venda: publicSale({ ...inserted.rows[0], numero_pedido: numeroPedido }, itens),
      };
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
      ).catch(() => ({ rows: [] }));
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
        return { duplicated: true, venda: publicSale({ ...existing.rows[0], numero_pedido: null }, itens.rows) };
      }
    }
    throw mapDatabaseError(error);
  }
}

// Intervalo [start, end) em instantes. Datas civis (AAAA-MM-DD) são dias de São Paulo;
// timestamps ISO completos preservam o instante informado. Sem data_fim, o fim é o próprio "agora".
export function periodBounds(query = {}, now = new Date()) {
  const preset = String(query.periodo || query.range || '30d').toLowerCase();
  const reference = query.data_fim ? startOfBoundary(query.data_fim) : now;
  const end = query.data_fim ? endExclusiveOfBoundary(query.data_fim) : now;
  let start;
  if (query.data_inicio) {
    start = startOfBoundary(query.data_inicio);
  } else if (preset === 'hoje' || preset === 'today') {
    start = saoPauloDayStart(saoPauloDayKey(reference));
  } else if (preset === '7d' || preset === '7dias') {
    start = new Date(reference.getTime() - 7 * DAY_MS);
  } else if (preset === 'mes' || preset === 'month') {
    start = saoPauloDayStart(`${saoPauloDayKey(reference).slice(0, 7)}-01`);
  } else {
    start = new Date(reference.getTime() - 30 * DAY_MS);
  }
  return { start, end };
}

export async function listVendas(queryable, query = {}, { now = new Date() } = {}) {
  await ensureNumeroPedidoSupport(queryable);
  const { start, end } = periodBounds(query, now);
  const status = query.status && query.status !== 'todos' ? String(query.status).toUpperCase() : null;
  const params = [start.toISOString(), end.toISOString()];
  let sql = `-- op:list_vendas
    SELECT ${VENDA_BASE_COLS}, n.numero_pedido
    FROM app.tab_venda v
    LEFT JOIN public.tab_pedido_numero n ON n.id_venda = v.id_venda
    WHERE v.data_venda >= $1 AND v.data_venda < $2
  `;
  if (status && ['PENDENTE', 'CONFIRMADA', 'CANCELADA'].includes(status)) {
    params.push(status);
    sql += ` AND v.status_venda = $${params.length}`;
  }
  sql += ' ORDER BY v.data_venda DESC';
  const result = await queryable.query(sql, params).catch(async (error) => {
    if (error?.code !== '42P01') throw error;
    let legacy = `-- op:list_vendas_legacy
      SELECT id_venda, chave_idempotencia, status_venda, origem_venda, nome_cliente,
             telefone_cliente, valor_total_centavos, data_venda, data_atualizacao,
             NULL::bigint AS numero_pedido
      FROM app.tab_venda
      WHERE data_venda >= $1 AND data_venda < $2
    `;
    if (status && ['PENDENTE', 'CONFIRMADA', 'CANCELADA'].includes(status)) {
      legacy += ` AND status_venda = $3`;
    }
    legacy += ' ORDER BY data_venda DESC';
    return queryable.query(legacy, params);
  });
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
  await ensureNumeroPedidoSupport(queryable);
  const current = await queryable.query(
    `-- op:get_venda
      SELECT ${VENDA_BASE_COLS}, n.numero_pedido
      FROM app.tab_venda v
      LEFT JOIN public.tab_pedido_numero n ON n.id_venda = v.id_venda
      WHERE v.id_venda = $1
    `,
    [id],
  ).catch(async (error) => {
    if (error?.code !== '42P01') throw error;
    return queryable.query(
      `-- op:get_venda_legacy
        SELECT id_venda, chave_idempotencia, status_venda, origem_venda, nome_cliente,
               telefone_cliente, valor_total_centavos, data_venda, data_atualizacao,
               NULL::bigint AS numero_pedido
        FROM app.tab_venda
        WHERE id_venda = $1
      `,
      [id],
    );
  });
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
  return publicSale({ ...updated.rows[0], numero_pedido: row.numero_pedido }, []);
}

export async function getPedidoAcompanhamento(queryable, { numero_pedido, telefone } = {}) {
  const numero = Number.parseInt(String(numero_pedido || ''), 10);
  const phone = normalizeWhatsAppPhone(telefone || '');
  if (!Number.isInteger(numero) || numero <= 0 || !phone) {
    throw new AdminError(400, 'validation_error', 'Informe número do pedido e WhatsApp válidos.');
  }

  const ready = await ensureNumeroPedidoSupport(queryable);
  if (!ready) {
    throw new AdminError(503, 'schema_unavailable', 'Acompanhamento de pedidos em atualização. Tente novamente em instantes.');
  }

  const result = await queryable.query(
    `-- op:get_pedido_acompanhamento
      SELECT ${VENDA_BASE_COLS}, n.numero_pedido
      FROM public.tab_pedido_numero n
      INNER JOIN app.tab_venda v ON v.id_venda = n.id_venda
      WHERE n.numero_pedido = $1
        AND n.telefone_normalizado = $2
      LIMIT 1
    `,
    [numero, phone],
  );
  const row = result.rows[0];
  if (!row) {
    throw new AdminError(404, 'not_found', 'Pedido não encontrado para este WhatsApp.');
  }
  const itens = await queryable.query(
    `-- op:list_venda_itens
      SELECT id_item_venda, id_venda, id_produto, nome_produto, quantidade,
             valor_unitario_centavos, valor_total_centavos
      FROM app.tab_venda_item
      WHERE id_venda = $1
      ORDER BY data_criacao ASC
    `,
    [row.id_venda],
  );
  const venda = publicSale(row, itens.rows);
  const terminal = venda.status_venda === 'CONFIRMADA' || venda.status_venda === 'CANCELADA';
  return {
    venda,
    acompanhamento: {
      ativo: !terminal,
      finalizado: terminal,
      rotulo_status: venda.status_venda === 'PENDENTE'
        ? 'Em preparação'
        : venda.status_venda === 'CONFIRMADA'
          ? 'Finalizado'
          : venda.status_venda === 'CANCELADA'
            ? 'Cancelado'
            : venda.status_venda,
    },
  };
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
