import { computeFaturamento, listVendas } from './admin-sales.js';
import { listScheduledChanges } from './admin-schedule.js';

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n;]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export function toCsv(rows, columns) {
  const header = columns.map((col) => csvEscape(col.label)).join(';');
  const lines = rows.map((row) => columns.map((col) => csvEscape(row[col.key])).join(';'));
  return [header, ...lines].join('\n');
}

function startOfSaoPauloDay(now = new Date()) {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return new Date(`${day}T00:00:00-03:00`);
}

function within(vendas, start, end) {
  return vendas.filter((item) => {
    const time = new Date(item.data_venda).getTime();
    return time >= start.getTime() && time <= end.getTime();
  });
}

export async function getReports(queryable, query = {}) {
  const now = new Date();
  const vendas = await listVendas(queryable, { ...query, periodo: query.periodo || '30d' });
  const faturamento = computeFaturamento(vendas);
  const byDay = new Map();
  const byProduct = new Map();
  for (const venda of vendas) {
    const day = venda.data_venda ? new Date(venda.data_venda).toISOString().slice(0, 10) : 'sem-data';
    const current = byDay.get(day) || { dia: day, pedidos: 0, confirmadas: 0, faturamento_centavos: 0 };
    current.pedidos += 1;
    if (venda.status_venda === 'CONFIRMADA') {
      current.confirmadas += 1;
      current.faturamento_centavos += Number(venda.valor_total_centavos || 0);
    }
    byDay.set(day, current);

    for (const item of venda.itens || []) {
      if (venda.status_venda !== 'CONFIRMADA') continue;
      const key = String(item.id_produto || item.nome_produto);
      const product = byProduct.get(key) || {
        id_produto: item.id_produto,
        nome_produto: item.nome_produto,
        quantidade: 0,
        receita_centavos: 0,
      };
      product.quantidade += Number(item.quantidade || 0);
      product.receita_centavos += Number(item.valor_total_centavos || 0);
      byProduct.set(key, product);
    }
  }

  const categorias = await queryable.query(`SELECT ativo FROM app.tab_categoria`);
  const produtos = await queryable.query(`
    SELECT p.id_produto, p.ativo, p.destaque,
           EXISTS (
             SELECT 1 FROM app.tab_produto_imagem i WHERE i.id_produto = p.id_produto
           ) AS tem_imagem,
           EXISTS (
             SELECT 1 FROM app.tab_produto_preco pr
             WHERE pr.id_produto = p.id_produto AND pr.ativo = true AND pr.promocional = false
               AND (pr.inicio_vigencia IS NULL OR pr.inicio_vigencia <= now())
               AND (pr.fim_vigencia IS NULL OR pr.fim_vigencia > now())
           ) AS tem_preco_vigente,
           EXISTS (
             SELECT 1 FROM app.tab_produto_preco pr
             WHERE pr.id_produto = p.id_produto AND pr.ativo = true AND pr.promocional = true
               AND (pr.inicio_vigencia IS NULL OR pr.inicio_vigencia <= now())
               AND (pr.fim_vigencia IS NULL OR pr.fim_vigencia > now())
           ) AS promocao_ativa
    FROM app.tab_produto p
  `);

  const alteracoes = await listScheduledChanges(queryable, {});
  const auditoria = await queryable.query(`
    SELECT id_auditoria, id_usuario_admin, acao, entidade, id_registro, sucesso,
           descricao_evento, data_evento
    FROM app.tab_auditoria_admin
    ORDER BY data_evento DESC
    LIMIT 200
  `);

  const catalogo = {
    categorias_ativas: categorias.rows.filter((row) => row.ativo === true).length,
    categorias_inativas: categorias.rows.filter((row) => row.ativo !== true).length,
    produtos_ativos: produtos.rows.filter((row) => row.ativo === true).length,
    produtos_inativos: produtos.rows.filter((row) => row.ativo !== true).length,
    destaques: produtos.rows.filter((row) => row.destaque === true).length,
    promocoes_ativas: produtos.rows.filter((row) => row.promocao_ativa === true).length,
    sem_imagem: produtos.rows.filter((row) => row.tem_imagem !== true).length,
    sem_preco_vigente: produtos.rows.filter((row) => row.tem_preco_vigente !== true).length,
  };

  const statusCount = (status) => alteracoes.filter((row) => row.status_alteracao === status).length;
  const todayStart = startOfSaoPauloDay(now);
  const vendasHoje = within(vendas, todayStart, now);
  const vendas7 = within(vendas, new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), now);

  return {
    visao_geral: faturamento,
    dashboard: {
      ...catalogo,
      hoje: computeFaturamento(vendasHoje),
      dias_7: computeFaturamento(vendas7),
      dias_30: faturamento,
    },
    vendas: {
      ...faturamento,
      por_dia: [...byDay.values()],
    },
    produtos: [...byProduct.values()].sort((a, b) => b.quantidade - a.quantidade),
    catalogo,
    alteracoes: {
      imediatas: 0,
      agendadas: statusCount('AGENDADA'),
      aplicadas: statusCount('APLICADA'),
      canceladas: statusCount('CANCELADA'),
      erro: statusCount('ERRO'),
      itens: alteracoes,
    },
    auditoria: auditoria.rows,
  };
}
