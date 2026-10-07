import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  buildDashboardModel,
  buildInsights,
  createLatestGate,
  customDashboardRange,
  isValidDateKey,
  validateCustomPeriod,
  categoriasVendidas,
  dailySeries,
  dashboardQuery,
  dashboardRange,
  deltaInfo,
  formatDeltaText,
  niceMax,
  previousDashboardRange,
  produtosSemVenda,
  sharePercent,
  topProdutos,
} from '../../admin-dashboard.js';

// 06/10/2026 15:00 em São Paulo (= 18:00 UTC).
const NOW = new Date('2026-10-06T18:00:00.000Z');

test('dashboardRange usa dia civil de São Paulo e inclui o dia corrente', () => {
  const hoje = dashboardRange('hoje', NOW);
  assert.equal(hoje.inicio.toISOString(), '2026-10-06T03:00:00.000Z');
  assert.equal(dashboardRange('7d', NOW).inicio.toISOString(), '2026-09-30T03:00:00.000Z');
  assert.equal(dashboardRange('30d', NOW).inicio.toISOString(), '2026-09-07T03:00:00.000Z');
  assert.equal(dashboardRange('90d', NOW).inicio.toISOString(), '2026-07-09T03:00:00.000Z');
  assert.equal(dashboardRange('inexistente', NOW).id, '30d');
});

test('período anterior equivalente desloca a janela em N dias (1 dia para Hoje)', () => {
  const anteriorHoje = previousDashboardRange(dashboardRange('hoje', NOW));
  assert.equal(anteriorHoje.inicio.toISOString(), '2026-10-05T03:00:00.000Z');
  assert.equal(anteriorHoje.fim.toISOString(), '2026-10-05T18:00:00.000Z');

  const anterior7 = previousDashboardRange(dashboardRange('7d', NOW));
  assert.equal(anterior7.inicio.toISOString(), '2026-09-23T03:00:00.000Z');
  assert.equal(anterior7.fim.toISOString(), '2026-09-29T18:00:00.000Z');
});

test('dashboardQuery envia apenas intervalo ISO já aceito por /api/admin/relatorios', () => {
  const query = dashboardQuery(dashboardRange('7d', NOW));
  assert.equal(query.get('data_inicio'), '2026-09-30T03:00:00.000Z');
  assert.equal(query.get('data_fim'), '2026-10-06T18:00:00.000Z');
  assert.equal(query.has('periodo'), false);
});

test('deltaInfo trata divisão por zero sem Infinity nem NaN', () => {
  const semBase = deltaInfo(500, 0);
  assert.equal(semBase.base, false);
  assert.equal(semBase.percentual, null);
  assert.equal(formatDeltaText(semBase, 'money'), 'Sem base de comparação');

  const zerado = deltaInfo(0, 0);
  assert.equal(zerado.status, 'flat');
  assert.equal(formatDeltaText(zerado, 'count'), 'Sem base de comparação');

  const undefinedInput = deltaInfo(undefined, null);
  assert.equal(Number.isNaN(undefinedInput.diferenca), false);
});

test('deltaInfo calcula diferença absoluta e variação percentual', () => {
  const info = deltaInfo(1000, 800);
  assert.equal(info.diferenca, 200);
  assert.equal(info.percentual, 25);
  assert.equal(info.status, 'up');
  const texto = formatDeltaText(info, 'money');
  assert.match(texto, /^\+25,0% · \+R\$\s?2,00 vs\. período anterior$/);

  const queda = deltaInfo(3, 4);
  assert.equal(queda.status, 'down');
  assert.match(formatDeltaText(queda, 'count'), /^-25,0% · -1 vs\. período anterior$/);
});

test('sharePercent e niceMax tratam zero e valores pequenos', () => {
  assert.equal(sharePercent(10, 0), null);
  assert.equal(sharePercent(25, 100), 25);
  assert.equal(niceMax(0), 0);
  assert.equal(niceMax(1234), 2000);
  assert.equal(niceMax(480), 500);
});

test('dailySeries preenche dias sem venda com zero', () => {
  const range = {
    inicio: new Date('2026-10-04T03:00:00.000Z'),
    fim: new Date('2026-10-06T18:00:00.000Z'),
  };
  const serie = dailySeries([{ dia: '2026-10-05', pedidos: 2, confirmadas: 1, faturamento_centavos: 4500 }], range);
  assert.deepEqual(serie.map((row) => row.dia), ['2026-10-04', '2026-10-05', '2026-10-06']);
  assert.equal(serie[0].pedidos, 0);
  assert.equal(serie[1].faturamento_centavos, 4500);
  assert.equal(serie[2].pedidos, 0);
});

test('topProdutos ordena por quantidade, limita a 5 e calcula participação', () => {
  const produtos = [
    { id_produto: 'a', nome_produto: 'A', quantidade: 2, receita_centavos: 2000 },
    { id_produto: 'b', nome_produto: 'B', quantidade: 9, receita_centavos: 1000 },
    { id_produto: 'c', nome_produto: 'C', quantidade: 0, receita_centavos: 0 },
    { id_produto: 'd', nome_produto: 'D', quantidade: 1, receita_centavos: 1000 },
    { id_produto: 'e', nome_produto: 'E', quantidade: 3, receita_centavos: 1000 },
    { id_produto: 'f', nome_produto: 'F', quantidade: 4, receita_centavos: 1000 },
    { id_produto: 'g', nome_produto: 'G', quantidade: 5, receita_centavos: 1000 },
  ];
  const top = topProdutos(produtos, 5);
  assert.equal(top.length, 5);
  assert.deepEqual(top.map((item) => item.nome_produto), ['B', 'G', 'F', 'E', 'A']);
  assert.equal(top[4].participacao, 2000 / 7000 * 100);
});

test('categoriasVendidas usa o catálogo como fonte da categoria', () => {
  const catalogo = [
    { id_produto: 'a', nome_produto: 'A', nome_categoria: 'Biscoitos', ativo: true },
    { id_produto: 'b', nome_produto: 'B', nome_categoria: 'Bolos', ativo: true },
    { id_produto: 'c', nome_produto: 'C', nome_categoria: null, ativo: true },
  ];
  const vendidos = [
    { id_produto: 'a', quantidade: 2, receita_centavos: 3000 },
    { id_produto: 'b', quantidade: 1, receita_centavos: 1000 },
    { id_produto: 'c', quantidade: 1, receita_centavos: 1000 },
    { id_produto: 'zzz', quantidade: 1, receita_centavos: 1000 },
  ];
  const categorias = categoriasVendidas(vendidos, catalogo);
  // "Sem categoria" soma o produto sem categoria no catálogo (1000) e o item sem correspondência (1000).
  assert.deepEqual(categorias.map((item) => item.nome), ['Biscoitos', 'Sem categoria', 'Bolos']);
  assert.equal(categorias[0].participacao, 50);
  assert.equal(categorias[1].receita_centavos, 2000);
  assert.equal(categorias.reduce((sum, item) => sum + item.receita_centavos, 0), 6000);
});

test('produtosSemVenda lista apenas produtos ativos sem venda', () => {
  const catalogo = [
    { id_produto: 'a', nome_produto: 'A', ativo: true },
    { id_produto: 'b', nome_produto: 'B', ativo: true },
    { id_produto: 'c', nome_produto: 'C', ativo: false },
  ];
  const vendidos = [{ id_produto: 'a', quantidade: 1, receita_centavos: 100 }];
  assert.deepEqual(produtosSemVenda(catalogo, vendidos), [{ id_produto: 'b', nome_produto: 'B' }]);
});

test('insights são determinísticos e ausentes quando não há base', () => {
  const vazio = buildInsights({
    atual: { faturamento_centavos: 0, pedidos: 0, vendas_confirmadas: 0 },
    anterior: { faturamento_centavos: 0, pedidos: 0, vendas_confirmadas: 0 },
    serie: [],
    maiorFaturamento: null,
    categorias: [],
    semVenda: [],
  });
  assert.deepEqual(vazio, []);

  const comBase = buildInsights({
    atual: { faturamento_centavos: 1124, pedidos: 5, vendas_confirmadas: 2 },
    anterior: { faturamento_centavos: 1000, pedidos: 5, vendas_confirmadas: 2 },
    serie: [
      { dia: '2026-10-05', pedidos: 1 },
      { dia: '2026-10-06', pedidos: 4 },
    ],
    maiorFaturamento: { nome_produto: 'Biscoito X', participacao: 24 },
    categorias: [{ nome: 'Biscoitos', participacao: 80 }, { nome: 'Bolos', participacao: 20 }],
    semVenda: [{ nome_produto: 'P' }, { nome_produto: 'Q' }],
  });
  assert.equal(comBase[0], 'Faturamento cresceu 12,4% em relação ao período anterior.');
  assert.ok(comBase.includes('06/10 foi o dia com maior volume de pedidos (4).'));
  assert.ok(comBase.includes('Biscoito X representa 24,0% do faturamento do período.'));
  assert.ok(comBase.includes('2 produtos ativos não tiveram venda no período.'));
  assert.ok(comBase.every((text) => !/NaN|Infinity|undefined/.test(text)));
});

test('buildDashboardModel sem nenhum dado não produz NaN nem Infinity', () => {
  const model = buildDashboardModel({
    range: dashboardRange('30d', NOW),
    atual: { visao_geral: {}, vendas: { por_dia: [] }, produtos: [], catalogo: {} },
    anterior: { visao_geral: {} },
    catalogoProdutos: [],
  });
  const texts = JSON.stringify(model);
  assert.doesNotMatch(texts, /NaN|Infinity/);
  assert.equal(model.temFaturamento, false);
  assert.equal(model.temPedidos, false);
  assert.equal(model.insights.length, 0);
  assert.equal(model.financeiro.faturamento.base, false);
});

test('admin usa "Dashboard" no lugar de "Visão Geral" e mantém a rota overview', () => {
  const html = readFileSync(new URL('../../admin.html', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../../admin.js', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /Visão Geral/);
  assert.doesNotMatch(js, /Visão Geral/);
  assert.match(html, /data-view="overview"/);
  assert.match(html, /<h1 id="viewTitle">Dashboard<\/h1>/);
  assert.match(js, /overview: \['Painel', 'Dashboard', 'Indicadores e desempenho da operação\.'\]/);
  assert.match(js, /import \{[\s\S]*buildDashboardModel[\s\S]*\} from '\.\/admin-dashboard\.js'/);
});

// ---- Período personalizado, fuso, corrida e estrutura (Fases C-I e P) ----

const DAY_KEY = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

test('presets Hoje, 7 dias, 30 dias e 90 dias usam início 00:00 de São Paulo', () => {
  const expected = { hoje: 0, '7d': 7, '30d': 30, '90d': 90 };
  for (const [id, dias] of Object.entries(expected)) {
    const range = dashboardRange(id, NOW);
    assert.equal(range.dias, dias);
    assert.equal(range.inicio.toISOString().slice(11), '03:00:00.000Z');
    assert.equal(DAY_KEY(range.fim), '2026-10-06');
  }
});

test('personalizado valido: inicio 00:00 e fim 23:59:59,999 de Sao Paulo, inclusivos', () => {
  const range = customDashboardRange('2026-09-10', '2026-09-20');
  assert.equal(range.id, 'personalizado');
  assert.equal(range.dias, 11);
  assert.equal(range.inicio.toISOString(), '2026-09-10T03:00:00.000Z');
  assert.equal(range.fim.toISOString(), '2026-09-21T02:59:59.999Z');
  assert.equal(DAY_KEY(range.fim), '2026-09-20');
});

test('personalizado com inicial = final vale um unico dia', () => {
  const range = customDashboardRange('2026-10-07', '2026-10-07');
  assert.equal(range.dias, 1);
  assert.equal(range.inicio.toISOString(), '2026-10-07T03:00:00.000Z');
  assert.equal(range.fim.toISOString(), '2026-10-08T02:59:59.999Z');
});

test('inicial maior que final e bloqueado com mensagem e nao gera intervalo', () => {
  assert.match(validateCustomPeriod('2026-09-20', '2026-09-10'), /posterior à data final/);
  assert.throws(() => customDashboardRange('2026-09-20', '2026-09-10'), RangeError);
});

test('campos incompletos sao bloqueados', () => {
  assert.match(validateCustomPeriod('', '2026-09-10'), /Informe a data inicial e a data final/);
  assert.match(validateCustomPeriod('2026-09-10', null), /Informe a data inicial e a data final/);
  assert.throws(() => customDashboardRange('', '2026-09-10'), RangeError);
});

test('datas inexistentes sao rejeitadas (31/02 e formato errado)', () => {
  assert.equal(isValidDateKey('2026-02-30'), false);
  assert.equal(isValidDateKey('2026-2-3'), false);
  assert.equal(isValidDateKey('2028-02-29'), true);
  assert.match(validateCustomPeriod('2026-02-30', '2026-03-01'), /Data inválida/);
});

test('data futura nao e bloqueada (API aceita data_fim futura)', () => {
  assert.equal(validateCustomPeriod('2026-10-01', '2026-12-31'), null);
});

test('periodo anterior personalizado: N dias imediatamente anteriores, sem sobreposicao', () => {
  const atual = customDashboardRange('2026-09-10', '2026-09-20');
  const anterior = previousDashboardRange(atual);
  assert.equal(anterior.dias, 11);
  assert.equal(anterior.inicio.toISOString(), '2026-08-30T03:00:00.000Z');
  assert.equal(anterior.fim.toISOString(), '2026-09-10T02:59:59.999Z');
  assert.equal(DAY_KEY(anterior.fim), '2026-09-09');
  assert.ok(anterior.fim.getTime() < atual.inicio.getTime(), 'nao pode sobrepor o periodo atual');
  assert.equal(atual.inicio.getTime() - anterior.fim.getTime(), 1, 'separados por 1 ms');
});

test('fronteira de mes: periodo anterior cruza para o mes anterior', () => {
  const anterior = previousDashboardRange(customDashboardRange('2026-10-01', '2026-10-07'));
  assert.equal(DAY_KEY(anterior.inicio), '2026-09-24');
  assert.equal(DAY_KEY(anterior.fim), '2026-09-30');
});

test('fronteira de ano: periodo anterior cruza para o ano anterior', () => {
  const anterior = previousDashboardRange(customDashboardRange('2027-01-03', '2027-01-05'));
  assert.equal(DAY_KEY(anterior.inicio), '2026-12-31');
  assert.equal(DAY_KEY(anterior.fim), '2027-01-02');
});

test('sem deslocamento por UTC: 07/10 a noite (SP) continua 07/10 na serie', () => {
  // 07/10 22:00 em Sao Paulo = 08/10 01:00 UTC. Antes, a serie criava um dia 08/10 extra.
  const range = dashboardRange('7d', new Date('2026-10-08T01:00:00.000Z'));
  const serie = dailySeries([], range);
  assert.equal(serie.length, 7);
  assert.equal(serie[0].dia, '2026-10-01');
  assert.equal(serie.at(-1).dia, '2026-10-07');
});

test('serie do personalizado nao ganha dia extra pelo fuso', () => {
  const serie = dailySeries([], customDashboardRange('2026-10-07', '2026-10-07'));
  assert.deepEqual(serie.map((row) => row.dia), ['2026-10-07']);
});

test('dados zerados ou vazios nao geram NaN nem Infinity no modelo', () => {
  const model = buildDashboardModel({
    range: customDashboardRange('2026-10-01', '2026-10-01'),
    atual: { visao_geral: {}, vendas: { por_dia: [] }, produtos: [], catalogo: {} },
    anterior: { visao_geral: {} },
    catalogoProdutos: [],
  });
  assert.equal(/NaN|Infinity/.test(JSON.stringify(model)), false);
  assert.equal(model.financeiro.faturamento.percentual, null);
});

test('createLatestGate: resposta antiga que chega depois nao vence o disparo mais recente', async () => {
  const gate = createLatestGate();
  const aplicado = [];
  const carregar = (nome, atraso) => {
    const latest = gate.next();
    return new Promise((resolve) => setTimeout(resolve, atraso)).then(() => {
      if (latest.isLatest()) aplicado.push(nome);
    });
  };
  await Promise.all([carregar('7d', 30), carregar('hoje', 5)]);
  assert.deepEqual(aplicado, ['hoje']);
});

test('admin.js: troca de periodo nao recarrega catalogo e usa Promise.all + gate', () => {
  const js = readFileSync(new URL('../../admin.js', import.meta.url), 'utf8');
  const troca = js.slice(js.indexOf('async function refreshDashboardPeriod'), js.indexOf('// Mantém o foco no controle'));
  assert.equal(troca.includes('loadCatalog'), false, 'troca de periodo nao pode chamar loadCatalog');
  const carga = js.slice(js.indexOf('async function loadDashboard'), js.indexOf('// Período vigente da tela'));
  assert.match(carga, /Promise\.all\(\[/);
  assert.match(carga, /dashboardGate\.next\(\)/);
  assert.match(carga, /latest\.isLatest\(\)/);
});

test('admin.js: campos personalizados consultam apenas no Aplicar (sem request por tecla)', () => {
  const js = readFileSync(new URL('../../admin.js', import.meta.url), 'utf8');
  const form = js.slice(js.indexOf('function dashboardCustomForm'), js.indexOf('function dashSection'));
  assert.match(form, /onInput: onDate\('inicio'\)/);
  assert.doesNotMatch(form, /refreshDashboardPeriod|loadDashboard/);
  assert.match(form, /onSubmit/);
});

test('admin.js: overview so renderiza se ainda estiver ativa (nao sobrescreve outra view)', () => {
  const js = readFileSync(new URL('../../admin.js', import.meta.url), 'utf8');
  assert.match(js, /dashboardAtual && state\.view === 'overview'\) renderOverview\(\)/);
  assert.match(js, /await pending && state\.view === 'overview'\) renderOverview\(\)/);
});
