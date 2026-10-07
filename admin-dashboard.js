// Cálculos do Dashboard gerencial (somente leitura).
// Recebe os payloads já existentes de /api/admin/relatorios e /api/admin/catalogo
// e devolve o modelo da tela. Não faz chamadas de rede nem altera dados.

export const DASHBOARD_PERIODS = Object.freeze([
  { id: 'hoje', label: 'Hoje', dias: 0 },
  { id: '7d', label: '7 dias', dias: 7 },
  { id: '30d', label: '30 dias', dias: 30 },
  { id: '90d', label: '90 dias', dias: 90 },
]);

export const DASHBOARD_PERIOD_DEFAULT = '30d';
export const DASHBOARD_CUSTOM_ID = 'personalizado';
export const DASHBOARD_EMPTY_INSIGHTS = 'Dados insuficientes para gerar insights neste período.';
export const SEM_CATEGORIA = 'Sem categoria';

const DAY_MS = 24 * 60 * 60 * 1000;
const SAO_PAULO_OFFSET = '-03:00';

const moneyFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const moneySignedFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', signDisplay: 'exceptZero' });
const countSignedFmt = new Intl.NumberFormat('pt-BR', { signDisplay: 'exceptZero' });
const percentSignedFmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'exceptZero' });
const percentFmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const axisMoneyFmt = new Intl.NumberFormat('pt-BR', { notation: 'compact', style: 'currency', currency: 'BRL', maximumFractionDigits: 1 });
const axisCountFmt = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

function saoPauloDayKey(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

// Soma dias a uma chave AAAA-MM-DD sem depender do fuso local.
function addDaysToKey(key, days) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

// AAAA-MM-DD -> dd/mm (o backend agrupa os pedidos pelo dia civil de São Paulo).
export function formatDayKey(key) {
  return `${key.slice(8, 10)}/${key.slice(5, 7)}`;
}

function formatBrDate(key) {
  return `${key.slice(8, 10)}/${key.slice(5, 7)}/${key.slice(0, 4)}`;
}

export function dashboardPeriodOption(id) {
  return DASHBOARD_PERIODS.find((item) => item.id === id)
    || DASHBOARD_PERIODS.find((item) => item.id === DASHBOARD_PERIOD_DEFAULT);
}

// Período atual: do início do dia (America/Sao_Paulo) até o momento.
// "Hoje" = dia corrente; "7 dias" = hoje + 6 dias anteriores; e assim por diante.
export function dashboardRange(periodId, now = new Date()) {
  const option = dashboardPeriodOption(periodId);
  const todayKey = saoPauloDayKey(now);
  const startKey = option.dias === 0 ? todayKey : addDaysToKey(todayKey, 1 - option.dias);
  return {
    id: option.id,
    label: option.label,
    dias: option.dias,
    inicio: new Date(`${startKey}T00:00:00${SAO_PAULO_OFFSET}`),
    fim: now,
  };
}

// Dia civil AAAA-MM-DD válido (rejeita 31/02 e similares).
export function isValidDateKey(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// Valida o período personalizado (chaves AAAA-MM-DD). Retorna mensagem para o usuário ou null.
// Data futura não é bloqueada: /api/admin/relatorios aceita data_fim futura sem erro.
export function validateCustomPeriod(inicio, fim) {
  if (!inicio || !fim) return 'Informe a data inicial e a data final.';
  if (!isValidDateKey(inicio) || !isValidDateKey(fim)) return 'Data inválida. Use o formato dd/mm/aaaa.';
  if (inicio > fim) return 'A data inicial não pode ser posterior à data final.';
  return null;
}

function daysBetweenKeys(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

// Período personalizado: dias civis inclusivos de São Paulo (início 00:00 até fim 23:59:59,999).
// Usa a mesma semântica inclusiva do período atual (o backend filtra data_inicio <= venda <= data_fim).
export function customDashboardRange(inicioKey, fimKey) {
  const erro = validateCustomPeriod(inicioKey, fimKey);
  if (erro) throw new RangeError(erro);
  return {
    id: DASHBOARD_CUSTOM_ID,
    label: 'Personalizado',
    dias: daysBetweenKeys(inicioKey, fimKey) + 1,
    inicioKey,
    fimKey,
    inicio: new Date(`${inicioKey}T00:00:00${SAO_PAULO_OFFSET}`),
    fim: new Date(`${fimKey}T23:59:59.999${SAO_PAULO_OFFSET}`),
  };
}

// Período anterior equivalente: a mesma janela deslocada em N dias (1 dia para "Hoje").
// Mantém o mesmo tempo decorrido, então a comparação é justa também no dia corrente.
export function previousDashboardRange(range) {
  if (range.id === DASHBOARD_CUSTOM_ID) {
    // Personalizado: os N dias imediatamente anteriores, sem sobreposição (termina no dia anterior ao início).
    return customDashboardRange(addDaysToKey(range.inicioKey, -range.dias), addDaysToKey(range.inicioKey, -1));
  }
  const shift = (range.dias || 1) * DAY_MS;
  return {
    id: range.id,
    label: range.label,
    dias: range.dias,
    inicio: new Date(range.inicio.getTime() - shift),
    fim: new Date(range.fim.getTime() - shift),
  };
}

// Usa apenas os parâmetros de intervalo que /api/admin/relatorios já aceita.
export function dashboardQuery(range) {
  return new URLSearchParams({
    data_inicio: range.inicio.toISOString(),
    data_fim: range.fim.toISOString(),
  });
}

// Controle de corrida: cada disparo recebe um token; só o disparo mais recente continua "atual".
// Respostas antigas (troca rápida de período) não sobrescrevem o estado.
export function createLatestGate() {
  let latest = 0;
  return {
    next() {
      latest += 1;
      const token = latest;
      return { isLatest: () => token === latest };
    },
  };
}

export function formatPeriodLabel(range) {
  const start = saoPauloDayKey(range.inicio);
  const end = saoPauloDayKey(range.fim);
  return `${formatBrDate(start)} a ${formatBrDate(end)}`;
}

// Série diária contínua (dias sem venda entram com zero), do início ao fim do período.
// Limites pelo dia civil de São Paulo (não pelo UTC), para não criar um dia a mais à noite.
export function dailySeries(porDia = [], range) {
  const byDay = new Map(porDia.map((row) => [row.dia, row]));
  const first = saoPauloDayKey(range.inicio);
  const last = saoPauloDayKey(range.fim);
  const series = [];
  for (let key = first; key <= last; key = addDaysToKey(key, 1)) {
    const row = byDay.get(key) || {};
    series.push({
      dia: key,
      pedidos: Number(row.pedidos) || 0,
      confirmadas: Number(row.confirmadas) || 0,
      faturamento_centavos: Number(row.faturamento_centavos) || 0,
    });
  }
  return series;
}

// Teto "redondo" para o eixo vertical (1, 2 ou 5 x potência de 10).
export function niceMax(value) {
  const max = Number(value) || 0;
  if (max <= 0) return 0;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const factor = max / magnitude;
  const nice = factor <= 1 ? 1 : factor <= 2 ? 2 : factor <= 5 ? 5 : 10;
  return nice * magnitude;
}

export function sharePercent(parte, total) {
  const denominador = Number(total) || 0;
  if (denominador <= 0) return null;
  return ((Number(parte) || 0) / denominador) * 100;
}

export function formatPercent(value) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${percentFmt.format(value)}%`;
}

export function formatBrl(centavos) {
  return moneyFmt.format((Number(centavos) || 0) / 100);
}

export function formatAxisBrl(centavos) {
  return axisMoneyFmt.format((Number(centavos) || 0) / 100);
}

export function formatAxisCount(value) {
  return axisCountFmt.format(Number(value) || 0);
}

// Variação entre período atual e anterior. Divisão por zero vira "sem base" (percentual null).
export function deltaInfo(atual, anterior) {
  const current = Number(atual) || 0;
  const previous = Number(anterior) || 0;
  const diferenca = current - previous;
  const base = previous !== 0;
  return {
    atual: current,
    anterior: previous,
    diferenca,
    base,
    percentual: base ? (diferenca / previous) * 100 : null,
    status: diferenca > 0 ? 'up' : diferenca < 0 ? 'down' : 'flat',
  };
}

// kind: 'money' (valores em centavos) ou 'count'.
export function formatDeltaText(info, kind = 'count') {
  if (!info.base) return 'Sem base de comparação';
  const pct = `${percentSignedFmt.format(info.percentual)}%`;
  const abs = kind === 'money' ? moneySignedFmt.format(info.diferenca / 100) : countSignedFmt.format(info.diferenca);
  return `${pct} · ${abs} vs. período anterior`;
}

// Ranking por quantidade (desempate por receita). Participação calculada sobre a receita dos produtos vendidos.
export function topProdutos(produtos = [], limite = 5) {
  const vendidos = produtos.filter((item) => Number(item.quantidade) > 0);
  const totalReceita = vendidos.reduce((sum, item) => sum + (Number(item.receita_centavos) || 0), 0);
  return [...vendidos]
    .sort((a, b) => (Number(b.quantidade) - Number(a.quantidade))
      || (Number(b.receita_centavos) - Number(a.receita_centavos)))
    .slice(0, limite)
    .map(normalizeProduto(totalReceita));
}

function normalizeProduto(totalReceita) {
  return (item) => ({
    id_produto: item.id_produto ?? null,
    nome_produto: item.nome_produto || 'Produto sem nome',
    quantidade: Number(item.quantidade) || 0,
    receita_centavos: Number(item.receita_centavos) || 0,
    participacao: sharePercent(item.receita_centavos, totalReceita),
  });
}

export function produtoMaiorFaturamento(produtos = []) {
  const vendidos = produtos.filter((item) => Number(item.quantidade) > 0);
  const totalReceita = vendidos.reduce((sum, item) => sum + (Number(item.receita_centavos) || 0), 0);
  const maior = [...vendidos].sort((a, b) => Number(b.receita_centavos) - Number(a.receita_centavos))[0];
  return maior ? normalizeProduto(totalReceita)(maior) : null;
}

// Faturamento por categoria. A categoria vem do catálogo (os itens de venda não trazem categoria).
export function categoriasVendidas(produtos = [], catalogoProdutos = []) {
  const categoriaPorProduto = new Map(
    catalogoProdutos.map((item) => [String(item.id_produto), item.nome_categoria || SEM_CATEGORIA]),
  );
  const grupos = new Map();
  for (const item of produtos) {
    if (!(Number(item.quantidade) > 0)) continue;
    const nome = categoriaPorProduto.get(String(item.id_produto)) || SEM_CATEGORIA;
    const grupo = grupos.get(nome) || { nome, quantidade: 0, receita_centavos: 0 };
    grupo.quantidade += Number(item.quantidade) || 0;
    grupo.receita_centavos += Number(item.receita_centavos) || 0;
    grupos.set(nome, grupo);
  }
  const lista = [...grupos.values()].sort((a, b) => (b.receita_centavos - a.receita_centavos)
    || a.nome.localeCompare('pt-BR'));
  const total = lista.reduce((sum, grupo) => sum + grupo.receita_centavos, 0);
  return lista.map((grupo) => ({ ...grupo, participacao: sharePercent(grupo.receita_centavos, total) }));
}

// Produtos ativos do catálogo que não aparecem entre os vendidos no período.
export function produtosSemVenda(catalogoProdutos = [], produtos = []) {
  const vendidos = new Set(
    produtos.filter((item) => Number(item.quantidade) > 0).map((item) => String(item.id_produto)),
  );
  return catalogoProdutos
    .filter((item) => item.ativo === true && !vendidos.has(String(item.id_produto)))
    .map((item) => ({ id_produto: String(item.id_produto), nome_produto: item.nome_produto || 'Produto sem nome' }));
}

// Insights determinísticos: cada frase só existe se a regra tiver base de cálculo.
export function buildInsights({ atual, anterior, serie, maiorFaturamento, categorias, semVenda }) {
  const insights = [];

  const fat = deltaInfo(atual.faturamento_centavos, anterior.faturamento_centavos);
  if (fat.base && fat.percentual !== 0) {
    const verbo = fat.diferenca > 0 ? 'cresceu' : 'caiu';
    insights.push(`Faturamento ${verbo} ${percentFmt.format(Math.abs(fat.percentual))}% em relação ao período anterior.`);
  }

  const ped = deltaInfo(atual.pedidos, anterior.pedidos);
  if (ped.base && ped.percentual !== 0) {
    const verbo = ped.diferenca > 0 ? 'cresceram' : 'caíram';
    insights.push(`Pedidos ${verbo} ${percentFmt.format(Math.abs(ped.percentual))}% em relação ao período anterior.`);
  }

  if (serie.length > 1) {
    const diaPico = serie.reduce((best, row) => (row.pedidos > (best?.pedidos ?? 0) ? row : best), null);
    if (diaPico && diaPico.pedidos > 0) {
      insights.push(`${formatDayKey(diaPico.dia)} foi o dia com maior volume de pedidos (${diaPico.pedidos}).`);
    }
  }

  if (maiorFaturamento && atual.faturamento_centavos > 0 && maiorFaturamento.participacao != null) {
    insights.push(`${maiorFaturamento.nome_produto} representa ${formatPercent(maiorFaturamento.participacao)} do faturamento do período.`);
  }

  const lider = categorias.find((item) => item.nome !== SEM_CATEGORIA);
  if (categorias.length > 1 && lider && lider.participacao != null) {
    insights.push(`${lider.nome} lidera o faturamento por categoria, com ${formatPercent(lider.participacao)} do total.`);
  }

  if (atual.vendas_confirmadas > 0 && semVenda.length > 0) {
    insights.push(semVenda.length === 1
      ? '1 produto ativo não teve venda no período.'
      : `${semVenda.length} produtos ativos não tiveram venda no período.`);
  }

  return insights;
}

// Modelo completo da tela. Entrada: payloads já carregados; saída: tudo que a view precisa.
export function buildDashboardModel({ range, atual, anterior, catalogoProdutos = [] }) {
  const resumo = atual?.visao_geral || {};
  const resumoAnterior = anterior?.visao_geral || {};
  const produtos = atual?.produtos || [];
  const catalogo = atual?.catalogo || {};
  const serie = dailySeries(atual?.vendas?.por_dia || [], range);
  const maiorFaturamento = produtoMaiorFaturamento(produtos);
  const categorias = categoriasVendidas(produtos, catalogoProdutos);
  const semVenda = (Number(resumo.vendas_confirmadas) || 0) > 0 ? produtosSemVenda(catalogoProdutos, produtos) : [];
  const top = topProdutos(produtos, 5);

  return {
    periodo: { id: range.id, label: range.label, texto: formatPeriodLabel(range) },
    financeiro: {
      faturamento: deltaInfo(resumo.faturamento_centavos, resumoAnterior.faturamento_centavos),
      pedidos: deltaInfo(resumo.pedidos, resumoAnterior.pedidos),
      ticket: deltaInfo(resumo.ticket_medio_centavos, resumoAnterior.ticket_medio_centavos),
      confirmadas: deltaInfo(resumo.vendas_confirmadas, resumoAnterior.vendas_confirmadas),
    },
    catalogo: {
      produtos_ativos: Number(catalogo.produtos_ativos) || 0,
      categorias_ativas: Number(catalogo.categorias_ativas) || 0,
      destaques: Number(catalogo.destaques) || 0,
      promocoes_ativas: Number(catalogo.promocoes_ativas) || 0,
      sem_imagem: Number(catalogo.sem_imagem) || 0,
      sem_preco_vigente: Number(catalogo.sem_preco_vigente) || 0,
    },
    serie,
    temPedidos: (Number(resumo.pedidos) || 0) > 0,
    temFaturamento: serie.some((row) => row.faturamento_centavos > 0),
    topProdutos: top,
    maiorFaturamento,
    categorias,
    semVenda,
    insights: buildInsights({
      atual: resumo,
      anterior: resumoAnterior,
      serie,
      maiorFaturamento,
      categorias,
      semVenda,
    }),
  };
}
