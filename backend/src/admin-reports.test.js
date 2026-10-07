import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { getReports, saleDateKeySaoPaulo } from './admin-reports.js';
import { listVendas, periodBounds } from './admin-sales.js';
import {
  endExclusiveOfBoundary,
  isCivilDateKey,
  saoPauloDayStart,
  startOfBoundary,
} from './sao-paulo-time.js';

const NOW_SP = new Date('2026-10-07T15:00:00.000Z'); // 07/10 12:00 SP
const SALES_MODULE_URL = new URL('./admin-sales.js', import.meta.url).href;

// Executa periodBounds num processo filho com outro TZ do sistema operacional.
function boundsSobTimezone(tz, query, nowIso) {
  const script = [
    `import { periodBounds } from ${JSON.stringify(SALES_MODULE_URL)};`,
    `const b = periodBounds(${JSON.stringify(query)}, new Date(${JSON.stringify(nowIso)}));`,
    'console.log(JSON.stringify({ start: b.start.toISOString(), end: b.end.toISOString() }));',
  ].join('\n');
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, TZ: tz },
    encoding: 'utf8',
  });
  return JSON.parse(out);
}

function venda(id, dataVenda, { status = 'CONFIRMADA', valor = 2500 } = {}) {
  return {
    id_venda: id,
    chave_idempotencia: `k-${id}`,
    status_venda: status,
    origem_venda: 'SITE',
    nome_cliente: 'Teste',
    telefone_cliente: null,
    valor_total_centavos: valor,
    data_venda: dataVenda,
    data_atualizacao: dataVenda,
  };
}

function poolWith(vendas) {
  return {
    async query(sql) {
      const text = String(sql);
      if (text.includes('op:list_vendas_itens')) return { rows: [] };
      if (text.includes('op:list_vendas')) return { rows: vendas };
      return { rows: [] };
    },
  };
}

test('saleDateKeySaoPaulo: venda no meio do dia de SP', () => {
  // 2026-10-07 12:00 em São Paulo
  assert.equal(saleDateKeySaoPaulo('2026-10-07T15:00:00.000Z'), '2026-10-07');
});

test('saleDateKeySaoPaulo: venda às 22:00 de SP cai no dia de SP (07/10), não em 08/10 UTC', () => {
  assert.equal(saleDateKeySaoPaulo('2026-10-08T01:00:00.000Z'), '2026-10-07');
});

test('saleDateKeySaoPaulo: timestamp UTC que pertence ao dia anterior em SP', () => {
  // UTC 07/10 01:30 = 06/10 22:30 em São Paulo
  assert.equal(saleDateKeySaoPaulo('2026-10-07T01:30:00.000Z'), '2026-10-06');
});

test('saleDateKeySaoPaulo: transição exata para o próximo dia civil de SP', () => {
  assert.equal(saleDateKeySaoPaulo('2026-10-08T02:59:59.999Z'), '2026-10-07');
  assert.equal(saleDateKeySaoPaulo('2026-10-08T03:00:00.000Z'), '2026-10-08');
});

test('saleDateKeySaoPaulo: datas UTC diferentes no mesmo dia de SP geram a mesma chave', () => {
  assert.equal(saleDateKeySaoPaulo('2026-10-07T03:30:00.000Z'), '2026-10-07'); // UTC 07, SP 07 00:30
  assert.equal(saleDateKeySaoPaulo('2026-10-08T02:30:00.000Z'), '2026-10-07'); // UTC 08, SP 07 23:30
});

test('saleDateKeySaoPaulo: datas em dias diferentes de SP geram chaves diferentes', () => {
  assert.equal(saleDateKeySaoPaulo('2026-10-08T02:30:00.000Z'), '2026-10-07');
  assert.equal(saleDateKeySaoPaulo('2026-10-08T03:30:00.000Z'), '2026-10-08');
});

test('saleDateKeySaoPaulo: null, vazio e inválido retornam null (sem Invalid Date/NaN/undefined)', () => {
  assert.equal(saleDateKeySaoPaulo(null), null);
  assert.equal(saleDateKeySaoPaulo(undefined), null);
  assert.equal(saleDateKeySaoPaulo(''), null);
  assert.equal(saleDateKeySaoPaulo('nao-e-data'), null);
  assert.equal(saleDateKeySaoPaulo(new Date('x')), null);
});

test('getReports: venda noturna (22:00 SP) NÃO desaparece da série diária e fica em 07/10', async () => {
  const reports = await getReports(poolWith([venda('noturna', new Date('2026-10-08T01:00:00.000Z'))]));
  const dias = reports.vendas.por_dia.map((row) => row.dia);
  assert.ok(dias.includes('2026-10-07'), `esperado 2026-10-07 em ${dias.join(',')}`);
  assert.equal(dias.includes('2026-10-08'), false, 'venda 22:00 SP não pode ser classificada como 08/10');
  const row = reports.vendas.por_dia.find((item) => item.dia === '2026-10-07');
  assert.equal(row.pedidos, 1);
  assert.equal(row.confirmadas, 1);
  assert.equal(row.faturamento_centavos, 2500);
});

test('getReports: duas vendas com datas UTC diferentes e mesmo dia de SP somam no mesmo bucket', async () => {
  const reports = await getReports(poolWith([
    venda('a', new Date('2026-10-07T03:30:00.000Z')),
    venda('b', new Date('2026-10-08T02:30:00.000Z')),
  ]));
  assert.equal(reports.vendas.por_dia.length, 1);
  assert.equal(reports.vendas.por_dia[0].dia, '2026-10-07');
  assert.equal(reports.vendas.por_dia[0].pedidos, 2);
});

test('getReports: duas vendas em dias diferentes de SP geram dois buckets', async () => {
  const reports = await getReports(poolWith([
    venda('a', new Date('2026-10-08T02:30:00.000Z')),
    venda('b', new Date('2026-10-08T03:30:00.000Z')),
  ]));
  const dias = reports.vendas.por_dia.map((row) => row.dia).sort();
  assert.deepEqual(dias, ['2026-10-07', '2026-10-08']);
});

test('getReports: KPIs e quantidade de pedidos permanecem iguais; só o bucket diário muda', async () => {
  const vendas = [
    venda('v1', new Date('2026-10-08T01:00:00.000Z'), { valor: 2500 }),
    venda('v2', new Date('2026-10-07T15:00:00.000Z'), { valor: 4000 }),
    venda('v3', new Date('2026-10-08T03:30:00.000Z'), { valor: 1000, status: 'CANCELADA' }),
  ];
  const reports = await getReports(poolWith(vendas));
  assert.equal(reports.visao_geral.pedidos, 3);
  assert.equal(reports.visao_geral.vendas_confirmadas, 2);
  assert.equal(reports.visao_geral.faturamento_centavos, 6500);
  assert.equal(reports.visao_geral.ticket_medio_centavos, 3250);
  assert.equal(reports.dashboard.dias_30.pedidos, 3);
  assert.equal(reports.dashboard.dias_30.faturamento_centavos, 6500);

  const somaPedidos = reports.vendas.por_dia.reduce((sum, row) => sum + row.pedidos, 0);
  const somaFaturamento = reports.vendas.por_dia.reduce((sum, row) => sum + row.faturamento_centavos, 0);
  assert.equal(somaPedidos, reports.visao_geral.pedidos, 'nenhuma venda pode sair da série diária');
  assert.equal(somaFaturamento, reports.visao_geral.faturamento_centavos);
});

test('getReports: data_venda null ou inválida vai para sem-data sem lançar exceção', async () => {
  const reports = await getReports(poolWith([
    venda('nula', null),
    venda('invalida', 'nao-e-data'),
    venda('ok', new Date('2026-10-08T01:00:00.000Z')),
  ]));
  const dias = reports.vendas.por_dia.map((row) => row.dia).sort();
  assert.deepEqual(dias, ['2026-10-07', 'sem-data']);
  const semData = reports.vendas.por_dia.find((row) => row.dia === 'sem-data');
  assert.equal(semData.pedidos, 2);
  for (const row of reports.vendas.por_dia) {
    assert.doesNotMatch(row.dia, /undefined|NaN|Invalid/);
  }
  assert.equal(reports.visao_geral.pedidos, 3);
});

// ---- Normalização temporal dos relatórios (dia civil de São Paulo) ----

// Fake que aplica o mesmo predicado do SQL de listVendas sobre os parâmetros recebidos:
// data_venda >= $1 AND data_venda < $2 (o único predicado de listVendas). Sem $2, não há limite superior.
function vendasPool(vendas, calls = []) {
  return {
    async query(sql, params = []) {
      const text = String(sql);
      if (text.includes('op:list_vendas_itens')) return { rows: [] };
      if (text.includes('op:list_vendas')) {
        calls.push({ sql: text, params });
        const from = new Date(params[0]).getTime();
        const to = params[1] === undefined ? Infinity : new Date(params[1]).getTime();
        const exclusive = text.includes('data_venda < $2');
        const rows = vendas.filter((item) => {
          const time = new Date(item.data_venda).getTime();
          return time >= from && (exclusive ? time < to : time <= to);
        });
        return { rows };
      }
      return { rows: [] };
    },
  };
}

async function idsVendidosNoPeriodo(query, vendas, now = NOW_SP) {
  const rows = await listVendas(vendasPool(vendas), query, { now });
  return rows.map((row) => row.id_venda).sort();
}

test('admin-sales: YYYY-MM-DD não é tratado como UTC (00:00 de SP = 03:00 UTC)', () => {
  assert.equal(startOfBoundary('2026-10-07').toISOString(), '2026-10-07T03:00:00.000Z');
  assert.equal(endExclusiveOfBoundary('2026-10-07').toISOString(), '2026-10-08T03:00:00.000Z');
});

test('admin-sales: data inicial = data final inclui o dia inteiro de SP', async () => {
  const bounds = periodBounds({ data_inicio: '2026-10-07', data_fim: '2026-10-07' }, NOW_SP);
  assert.equal(bounds.start.toISOString(), '2026-10-07T03:00:00.000Z');
  assert.equal(bounds.end.toISOString(), '2026-10-08T03:00:00.000Z');
  const vendas = [
    venda('ini-00h00', '2026-10-07T03:00:00.000Z'), // 07/10 00:00 SP: incluída
    venda('tarde', '2026-10-07T18:00:00.000Z'), // 07/10 15:00 SP: incluída
    venda('anterior', '2026-10-07T02:59:59.999Z'), // 06/10 23:59:59.999 SP: excluída
  ];
  const ids = await idsVendidosNoPeriodo({ periodo: '30d', data_inicio: '2026-10-07', data_fim: '2026-10-07' }, vendas);
  assert.deepEqual(ids, ['ini-00h00', 'tarde']);
});

test('admin-sales: venda 07/10 22:00 SP entra no relatório de 07/10', async () => {
  const vendas = [venda('noite-22h', '2026-10-08T01:00:00.000Z')]; // 07/10 22:00 SP
  assert.deepEqual(await idsVendidosNoPeriodo({ data_inicio: '2026-10-07', data_fim: '2026-10-07' }, vendas), ['noite-22h']);
});

test('admin-sales: 07/10 23:59:59.999 SP entra e 08/10 00:00 SP fica fora do relatório de 07/10', async () => {
  const query = { data_inicio: '2026-10-07', data_fim: '2026-10-07' };
  assert.deepEqual(await idsVendidosNoPeriodo(query, [venda('fim', '2026-10-08T02:59:59.999Z')]), ['fim']);
  assert.deepEqual(await idsVendidosNoPeriodo(query, [venda('proximo', '2026-10-08T03:00:00.000Z')]), []);
});

test('admin-sales: intervalo de múltiplos dias cobre do primeiro ao último dia civil de SP', async () => {
  const vendas = [
    venda('antes', '2026-10-04T02:59:59.999Z'), // 03/10 23:59:59.999 SP: excluída
    venda('primeiro', '2026-10-04T03:00:00.000Z'), // 04/10 00:00 SP: incluída
    venda('ultimo', '2026-10-08T02:30:00.000Z'), // 07/10 23:30 SP: incluída
    venda('depois', '2026-10-08T03:00:00.000Z'), // 08/10 00:00 SP: excluída
  ];
  const ids = await idsVendidosNoPeriodo({ data_inicio: '2026-10-04', data_fim: '2026-10-07' }, vendas);
  assert.deepEqual(ids, ['primeiro', 'ultimo']);
});

test('admin-sales: timestamp ISO completo preserva o instante informado', () => {
  assert.equal(periodBounds({ data_inicio: '2026-10-07T12:34:56.789Z' }, NOW_SP).start.toISOString(), '2026-10-07T12:34:56.789Z');
  // Limite final exclusivo em ms: o instante informado continua incluído.
  assert.equal(periodBounds({ data_inicio: '2026-10-01', data_fim: '2026-10-07T15:00:00.000Z' }, NOW_SP).end.toISOString(), '2026-10-07T15:00:00.001Z');
});

test('admin-sales: timestamp ISO do dashboard mantém o instante final incluído e o seguinte excluído', async () => {
  const vendas = [venda('no-instante', '2026-10-07T15:00:00.000Z'), venda('apos', '2026-10-07T15:00:00.001Z')];
  const ids = await idsVendidosNoPeriodo(
    { periodo: '30d', data_inicio: '2026-10-01T03:00:00.000Z', data_fim: '2026-10-07T15:00:00.000Z' },
    vendas,
  );
  assert.deepEqual(ids, ['no-instante']);
});

test('admin-sales: periodo=hoje usa o dia civil de SP mesmo com o dia UTC já virado', () => {
  // 07/10 09:00 SP
  assert.equal(periodBounds({ periodo: 'hoje' }, new Date('2026-10-07T12:00:00.000Z')).start.toISOString(), '2026-10-07T03:00:00.000Z');
  // 07/10 22:30 SP = 08/10 01:30 UTC
  assert.equal(periodBounds({ periodo: 'hoje' }, new Date('2026-10-08T01:30:00.000Z')).start.toISOString(), '2026-10-07T03:00:00.000Z');
});

test('admin-sales: periodo=hoje é idêntico em processos com TZ do sistema diferente', () => {
  const esperado = { start: '2026-10-07T03:00:00.000Z', end: '2026-10-08T01:30:00.000Z' };
  for (const tz of ['UTC', 'Asia/Tokyo', 'America/Los_Angeles', 'America/Sao_Paulo']) {
    assert.deepEqual(boundsSobTimezone(tz, { periodo: 'hoje' }, '2026-10-08T01:30:00.000Z'), esperado, `TZ=${tz}`);
  }
});

test('admin-sales: periodo=mes começa no dia 1 de SP (mês comum)', () => {
  assert.equal(periodBounds({ periodo: 'mes' }, new Date('2026-10-15T12:00:00.000Z')).start.toISOString(), '2026-10-01T03:00:00.000Z');
});

test('admin-sales: periodo=mes na virada dezembro -> janeiro', () => {
  // 31/12/2026 22:00 SP ainda é dezembro
  assert.equal(periodBounds({ periodo: 'mes' }, new Date('2027-01-01T01:00:00.000Z')).start.toISOString(), '2026-12-01T03:00:00.000Z');
  // 01/01/2027 00:30 SP já é janeiro
  assert.equal(periodBounds({ periodo: 'mes' }, new Date('2027-01-01T03:30:00.000Z')).start.toISOString(), '2027-01-01T03:00:00.000Z');
});

test('admin-sales: periodo=mes em fevereiro (ano comum e bissexto)', () => {
  assert.equal(periodBounds({ periodo: 'mes' }, new Date('2026-02-28T12:00:00.000Z')).start.toISOString(), '2026-02-01T03:00:00.000Z');
  assert.equal(periodBounds({ periodo: 'mes' }, new Date('2028-02-29T12:00:00.000Z')).start.toISOString(), '2028-02-01T03:00:00.000Z');
});

test('sao-paulo-time: offset vem de America/Sao_Paulo, não de -03:00 fixo (horário de verão histórico)', () => {
  // Horário de verão em SP de 2017-10-15 a 2018-02-18: 00:00 local = 02:00 UTC
  assert.equal(saoPauloDayStart('2017-12-01').toISOString(), '2017-12-01T02:00:00.000Z');
  assert.equal(saoPauloDayStart('2026-10-07').toISOString(), '2026-10-07T03:00:00.000Z');
});

test('sao-paulo-time: só AAAA-MM-DD real é dia civil; timestamp e data inválida não são', () => {
  assert.equal(isCivilDateKey('2026-10-07'), true);
  assert.equal(isCivilDateKey('2026-02-30'), false);
  assert.equal(isCivilDateKey('2026-10-07T00:00:00.000Z'), false);
});

test('getReports: KPI de hoje usa o dia civil de SP com "agora" injetado', async () => {
  const vendas = [
    venda('ontem-23h30', '2026-10-07T02:30:00.000Z'), // 06/10 23:30 SP
    venda('hoje-22h', '2026-10-08T01:00:00.000Z'), // 07/10 22:00 SP
  ];
  const now = new Date('2026-10-08T01:30:00.000Z'); // 07/10 22:30 SP
  const reports = await getReports(vendasPool(vendas), { periodo: '30d' }, { now });
  assert.equal(reports.dashboard.hoje.pedidos, 1);
  assert.equal(reports.dashboard.dias_7.pedidos, 2);
  assert.equal(reports.dashboard.dias_30.pedidos, 2);
});

test('getReports: KPIs e buckets diários continuam corretos com o novo intervalo', async () => {
  const vendas = [
    venda('a', '2026-10-08T01:00:00.000Z', { valor: 1000 }), // 07/10 22:00 SP
    venda('b', '2026-10-08T02:59:59.999Z', { valor: 500 }), // 07/10 23:59:59.999 SP
    venda('c', '2026-10-08T03:00:00.000Z', { valor: 700 }), // 08/10 00:00 SP: fora
  ];
  const reports = await getReports(vendasPool(vendas), { data_inicio: '2026-10-07', data_fim: '2026-10-07' }, { now: NOW_SP });
  assert.equal(reports.visao_geral.pedidos, 2);
  assert.equal(reports.visao_geral.faturamento_centavos, 1500);
  assert.deepEqual(reports.vendas.por_dia.map((row) => [row.dia, row.pedidos]), [['2026-10-07', 2]]);
});

test('listVendas: data_fim gera limite exclusivo com dia civil de SP', async () => {
  const calls = [];
  await listVendas(vendasPool([], calls), { data_inicio: '2026-10-07', data_fim: '2026-10-07' }, { now: NOW_SP });
  assert.match(calls[0].sql, /data_venda >= \$1 AND data_venda < \$2/);
  assert.deepEqual(calls[0].params, ['2026-10-07T03:00:00.000Z', '2026-10-08T03:00:00.000Z']);
});

// ---- Contrato temporal uniforme: [início, fim) ----

test('periodBounds: hoje e mês terminam exatamente em "agora", sem tolerância futura', () => {
  assert.equal(periodBounds({ periodo: 'hoje' }, NOW_SP).end.getTime(), NOW_SP.getTime());
  assert.equal(periodBounds({ periodo: 'mes' }, NOW_SP).end.getTime(), NOW_SP.getTime());
  assert.equal(periodBounds({}, NOW_SP).end.getTime(), NOW_SP.getTime());
});

test('listVendas: periodo=hoje usa [start, end) com início inclusivo e fim exclusivo = agora', async () => {
  const vendas = [
    venda('antes-do-dia', '2026-10-07T02:59:59.999Z'), // 06/10 23:59:59.999 SP: fora
    venda('inicio-do-dia', '2026-10-07T03:00:00.000Z'), // 07/10 00:00 SP: dentro (start inclusivo)
    venda('um-ms-antes-agora', '2026-10-07T14:59:59.999Z'), // 07/10 11:59:59.999 SP: dentro
    venda('exatamente-agora', '2026-10-07T15:00:00.000Z'), // agora: fora (end exclusivo)
    venda('futuro-1ms', '2026-10-07T15:00:00.001Z'), // futuro: fora
    venda('futuro-2min', '2026-10-07T15:02:00.000Z'), // futuro: fora (sem tolerância de +2 min)
  ];
  const ids = await idsVendidosNoPeriodo({ periodo: 'hoje' }, vendas);
  assert.deepEqual(ids, ['inicio-do-dia', 'um-ms-antes-agora']);
});

test('listVendas: periodo=mes usa início do mês em SP e não aceita timestamp futuro', async () => {
  const vendas = [
    venda('fim-setembro', '2026-10-01T02:59:59.999Z'), // 30/09 23:59:59.999 SP: fora
    venda('inicio-outubro', '2026-10-01T03:00:00.000Z'), // 01/10 00:00 SP: dentro
    venda('ontem', '2026-10-06T12:00:00.000Z'), // dentro
    venda('agora', '2026-10-07T15:00:00.000Z'), // agora: fora
    venda('futuro', '2026-10-07T15:02:00.000Z'), // futuro: fora
  ];
  const ids = await idsVendidosNoPeriodo({ periodo: 'mes' }, vendas);
  assert.deepEqual(ids, ['inicio-outubro', 'ontem']);
});

test('listVendas: SQL de hoje/mês não contém now() nem tolerância; usa um único $2 = agora', async () => {
  const calls = [];
  await listVendas(vendasPool([], calls), { periodo: 'hoje' }, { now: NOW_SP });
  assert.doesNotMatch(calls[0].sql, /now\(\)/);
  assert.doesNotMatch(calls[0].sql, /interval/i);
  assert.doesNotMatch(calls[0].sql, /2 minutes/);
  assert.match(calls[0].sql, /data_venda >= \$1 AND data_venda < \$2/);
  assert.deepEqual(calls[0].params, ['2026-10-07T03:00:00.000Z', NOW_SP.toISOString()]);
});

test('within() via dashboard.hoje: início inclusivo, fim exclusivo', async () => {
  const vendas = [
    venda('antes', '2026-10-07T02:59:59.999Z'), // fora
    venda('inicio', '2026-10-07T03:00:00.000Z'), // dentro
    venda('um-ms-antes', '2026-10-07T14:59:59.999Z'), // dentro
    venda('agora', '2026-10-07T15:00:00.000Z'), // fora
    venda('depois', '2026-10-07T15:00:00.001Z'), // fora
  ];
  const reports = await getReports(poolWith(vendas), {}, { now: NOW_SP });
  assert.equal(reports.dashboard.hoje.pedidos, 2);
});

test('within() via dashboard.dias_7: início inclusivo (agora - 7d), fim exclusivo (agora)', async () => {
  const inicio7 = new Date(NOW_SP.getTime() - 7 * 24 * 60 * 60 * 1000); // 30/09 12:00 SP
  const vendas = [
    venda('antes', new Date(inicio7.getTime() - 1).toISOString()), // fora
    venda('inicio', inicio7.toISOString()), // dentro
    venda('um-ms-antes-agora', new Date(NOW_SP.getTime() - 1).toISOString()), // dentro
    venda('agora', NOW_SP.toISOString()), // fora
  ];
  const reports = await getReports(poolWith(vendas), {}, { now: NOW_SP });
  assert.equal(reports.dashboard.dias_7.pedidos, 2);
});

test('within() via dashboard: timestamp futuro não entra em hoje nem em dias_7', async () => {
  const vendas = [venda('futuro', '2026-10-07T15:02:00.000Z')];
  const reports = await getReports(poolWith(vendas), {}, { now: NOW_SP });
  assert.equal(reports.dashboard.hoje.pedidos, 0);
  assert.equal(reports.dashboard.dias_7.pedidos, 0);
});
