import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  computeProdutoAlteracaoDelta,
  createProduto,
  getAdminCatalog,
  updateProduto,
} from './admin-catalog.js';
import { AdminError } from './admin-errors.js';
import {
  cancelScheduledChange,
  listScheduledChanges,
  parseSaoPauloDateTime,
  processDueScheduledChanges,
  scheduleChange,
} from './admin-schedule.js';

function op(sql) {
  const match = String(sql).match(/-- op:([a-z_]+)/);
  return match ? match[1] : String(sql).trim().split(/\s+/)[0].toUpperCase();
}

function createMemoryPool() {
  const data = {
    categorias: [{ id_categoria: 'c1', nome_categoria: 'Bolos', slug_categoria: 'bolos', descricao_categoria: '', ordem_exibicao: 0, ativo: true }],
    produtos: [],
    imagens: [],
    precos: [],
    alteracoes: [],
  };
  let clock = 0;
  function nextTime() {
    clock += 1;
    return new Date(1_700_000_000_000 + clock);
  }

  function exec(sql, params = []) {
    const name = op(sql);
    if (name === 'BEGIN' || name === 'COMMIT' || name === 'ROLLBACK') return { rows: [] };
    switch (name) {
      case 'list_categorias':
        return { rows: data.categorias.slice() };
      case 'list_produtos':
        return { rows: data.produtos.slice() };
      case 'list_imagens':
        return { rows: data.imagens.slice() };
      case 'list_precos':
        return { rows: data.precos.slice() };
      case 'get_categoria': {
        const row = data.categorias.find((item) => item.id_categoria === params[0]);
        return { rows: row ? [row] : [] };
      }
      case 'get_produto': {
        const row = data.produtos.find((item) => item.id_produto === params[0]);
        return { rows: row ? [row] : [] };
      }
      case 'insert_produto': {
        const row = {
          id_produto: params[0],
          id_categoria: params[1],
          nome_produto: params[2],
          slug_produto: params[3],
          descricao_produto: params[4],
          ativo: params[5],
          destaque: params[6],
          ordem_exibicao: params[7],
        };
        data.produtos.push(row);
        return { rows: [row] };
      }
      case 'update_produto': {
        const row = data.produtos.find((item) => item.id_produto === params[0]);
        if (!row) return { rows: [] };
        row.id_categoria = params[1];
        row.nome_produto = params[2];
        row.slug_produto = params[3];
        row.descricao_produto = params[4];
        row.ativo = params[5];
        row.destaque = params[6];
        row.ordem_exibicao = params[7];
        return { rows: [row] };
      }
      case 'list_precos_produto':
        return {
          rows: data.precos
            .filter((item) => item.id_produto === params[0])
            .slice()
            .sort((a, b) => b.data_criacao - a.data_criacao),
        };
      case 'deactivate_precos': {
        for (const row of data.precos) {
          if (row.id_produto === params[0] && row.promocional === params[1] && row.ativo === true) row.ativo = false;
        }
        return { rows: [] };
      }
      case 'insert_preco': {
        const row = {
          id_preco: params[0],
          id_produto: params[1],
          valor_centavos: params[2],
          codigo_moeda: 'BRL',
          promocional: params[3],
          ativo: true,
          inicio_vigencia: null,
          fim_vigencia: null,
          data_criacao: nextTime(),
        };
        data.precos.push(row);
        return { rows: [row] };
      }
      case 'list_imagens_produto':
        return { rows: data.imagens.filter((item) => item.id_produto === params[0]) };
      case 'clear_principal':
        return { rows: [] };
      case 'insert_imagem': {
        const row = { id_imagem: params[0], id_produto: params[1], url_imagem: params[2], texto_alternativo: params[3], ordem_exibicao: 0, principal: true, data_criacao: nextTime() };
        data.imagens.push(row);
        return { rows: [row] };
      }
      case 'insert_alteracao': {
        const row = {
          id_alteracao_agendada: params[0],
          id_usuario_admin: params[1],
          tipo_entidade: params[2],
          id_registro: params[3],
          dados_alteracao: params[4],
          data_vigencia: params[5],
          status_alteracao: 'AGENDADA',
          data_criacao: nextTime(),
          data_aplicacao: null,
          data_cancelamento: null,
          mensagem_erro: null,
        };
        data.alteracoes.push(row);
        return { rows: [row] };
      }
      case 'list_alteracoes':
        return { rows: data.alteracoes.slice() };
      case 'list_alteracoes_devidas': {
        const now = new Date(params[0]).getTime();
        return {
          rows: data.alteracoes.filter((row) => row.status_alteracao === 'AGENDADA' && new Date(row.data_vigencia).getTime() <= now),
        };
      }
      case 'claim_alteracao': {
        const row = data.alteracoes.find((item) => item.id_alteracao_agendada === params[0] && item.status_alteracao === 'AGENDADA' && item.mensagem_erro == null);
        if (!row) return { rows: [] };
        row.mensagem_erro = 'APLICANDO';
        return { rows: [row] };
      }
      case 'mark_alteracao_aplicada': {
        const row = data.alteracoes.find((item) => item.id_alteracao_agendada === params[0]);
        if (row) {
          row.status_alteracao = 'APLICADA';
          row.data_aplicacao = nextTime();
          row.mensagem_erro = null;
        }
        return { rows: [] };
      }
      case 'mark_alteracao_erro':
      case 'mark_alteracao_erro_claimed': {
        const row = data.alteracoes.find((item) => item.id_alteracao_agendada === params[0]);
        if (row) {
          row.status_alteracao = 'ERRO';
          row.mensagem_erro = params[1];
        }
        return { rows: [] };
      }
      case 'cancel_alteracao': {
        const row = data.alteracoes.find((item) => item.id_alteracao_agendada === params[0] && item.status_alteracao === 'AGENDADA');
        if (!row) return { rows: [] };
        row.status_alteracao = 'CANCELADA';
        row.data_cancelamento = nextTime();
        return { rows: [row] };
      }
      default:
        throw new Error(`unhandled sql op: ${name}`);
    }
  }

  return {
    data,
    query: async (sql, params) => exec(sql, params),
    connect: async () => ({ query: async (sql, params) => exec(sql, params), release() {} }),
  };
}

const FIXED_NOW = new Date('2026-10-07T14:15:00.000Z'); // 2026-10-07 11:15 em São Paulo (UTC-3)

test('parseSaoPauloDateTime: data passada é rejeitada', () => {
  assert.throws(() => parseSaoPauloDateTime('2026-10-06', '23:59', FIXED_NOW), (error) => error instanceof AdminError);
});

test('parseSaoPauloDateTime: hoje com hora já passada é rejeitada', () => {
  assert.throws(() => parseSaoPauloDateTime('2026-10-07', '11:14', FIXED_NOW), (error) => error instanceof AdminError);
});

test('parseSaoPauloDateTime: hoje com hora exatamente igual ao agora é rejeitada', () => {
  assert.throws(() => parseSaoPauloDateTime('2026-10-07', '11:15', FIXED_NOW), (error) => error instanceof AdminError);
});

test('parseSaoPauloDateTime: hoje com hora futura é aceita', () => {
  const result = parseSaoPauloDateTime('2026-10-07', '11:16', FIXED_NOW);
  assert.ok(result instanceof Date);
  assert.ok(result.getTime() > FIXED_NOW.getTime());
});

test('parseSaoPauloDateTime: amanhã 00:00 é aceito mesmo logo após virar o dia', () => {
  const result = parseSaoPauloDateTime('2026-10-08', '00:00', FIXED_NOW);
  assert.ok(result.getTime() > FIXED_NOW.getTime());
});

test('parseSaoPauloDateTime: virada de mês é aceita', () => {
  const now = new Date('2026-10-31T23:50:00.000Z'); // 2026-10-31 20:50 em São Paulo
  const result = parseSaoPauloDateTime('2026-11-01', '00:05', now);
  assert.ok(result.getTime() > now.getTime());
});

test('parseSaoPauloDateTime: virada de ano é aceita', () => {
  const now = new Date('2026-12-31T23:50:00.000Z'); // 2026-12-31 20:50 em São Paulo
  const result = parseSaoPauloDateTime('2027-01-01', '00:05', now);
  assert.ok(result.getTime() > now.getTime());
});

test('parseSaoPauloDateTime: fevereiro (ano não bissexto) aceita 28 e rejeita 29', () => {
  const now = new Date('2026-02-01T12:00:00.000Z');
  const ok = parseSaoPauloDateTime('2026-02-28', '10:00', now);
  assert.ok(ok instanceof Date);
  assert.throws(() => parseSaoPauloDateTime('2026-02-29', '10:00', now), (error) => error instanceof AdminError);
});

test('parseSaoPauloDateTime: independe do TZ do processo (compara sempre em America/Sao_Paulo)', () => {
  const originalTz = process.env.TZ;
  try {
    process.env.TZ = 'UTC';
    const a = parseSaoPauloDateTime('2026-10-07', '11:16', FIXED_NOW);
    process.env.TZ = 'America/Los_Angeles';
    const b = parseSaoPauloDateTime('2026-10-07', '11:16', FIXED_NOW);
    assert.equal(a.getTime(), b.getTime());
  } finally {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  }
});

test('parseSaoPauloDateTime: data ausente é rejeitada', () => {
  assert.throws(() => parseSaoPauloDateTime('', '11:16', FIXED_NOW), (error) => error instanceof AdminError);
  assert.throws(() => parseSaoPauloDateTime(undefined, '11:16', FIXED_NOW), (error) => error instanceof AdminError);
});

test('parseSaoPauloDateTime: hora ausente é rejeitada', () => {
  assert.throws(() => parseSaoPauloDateTime('2026-10-08', '', FIXED_NOW), (error) => error instanceof AdminError);
});

test('parseSaoPauloDateTime: formato inválido é rejeitado', () => {
  assert.throws(() => parseSaoPauloDateTime('07/10/2026', '11:16', FIXED_NOW), (error) => error instanceof AdminError);
  assert.throws(() => parseSaoPauloDateTime('2026-10-07', '11h16', FIXED_NOW), (error) => error instanceof AdminError);
  assert.throws(() => parseSaoPauloDateTime('2026-13-01', '11:16', FIXED_NOW), (error) => error instanceof AdminError);
});

test('computeProdutoAlteracaoDelta: campos não tocados pelo admin não entram no agendamento', () => {
  const produtoAtual = {
    id_produto: 'p1',
    id_categoria: 'c1',
    nome_produto: 'Bolo de cenoura',
    descricao_produto: 'Com cobertura',
    ativo: true,
    destaque: false,
    ordem_exibicao: 3,
    url_imagem_principal: 'https://img/bolo.png',
    preco_normal_centavos: 1990,
    promocao_ativa: false,
    preco_promocional_centavos: null,
  };
  const dadosSubmetidos = {
    id_categoria: 'c1',
    nome: 'Bolo de cenoura',
    descricao: 'Com cobertura',
    ativo: true,
    destaque: false,
    ordem: 3,
    url_imagem_principal: 'https://img/bolo.png',
    preco_normal: '17,99',
    promocao_ativa: false,
  };
  const delta = computeProdutoAlteracaoDelta(produtoAtual, dadosSubmetidos);
  assert.deepEqual(Object.keys(delta), ['preco_normal']);
  assert.equal(delta.preco_normal, '17,99');
});

test('computeProdutoAlteracaoDelta: ativar promoção inclui preço e flag', () => {
  const produtoAtual = {
    id_produto: 'p1', id_categoria: 'c1', nome_produto: 'Bolo', descricao_produto: '', ativo: true, destaque: false,
    ordem_exibicao: 0, url_imagem_principal: '', preco_normal_centavos: 1990, promocao_ativa: false, preco_promocional_centavos: null,
  };
  const dadosSubmetidos = {
    id_categoria: 'c1', nome: 'Bolo', descricao: '', ativo: true, destaque: false, ordem: 0, url_imagem_principal: '',
    preco_normal: '19,90', promocao_ativa: true, preco_promocional: '15,90',
  };
  const delta = computeProdutoAlteracaoDelta(produtoAtual, dadosSubmetidos);
  assert.equal(delta.promocao_ativa, true);
  assert.equal(delta.preco_promocional, '15,90');
  assert.equal(delta.preco_normal, undefined);
});

test('fluxo completo: agendamento aplica somente o campo agendado e preserva edição manual intermediária de outro campo', async () => {
  const pool = createMemoryPool();
  const produto = await createProduto(pool, {
    id_categoria: 'c1', nome: 'Bolo de cenoura', descricao: 'Original', ordem: 1, ativo: true, destaque: false, preco_normal: '19,90',
  });

  // T1: agendamento troca somente o preço.
  const catalogoT1 = await getAdminCatalog(pool);
  const produtoAtualT1 = catalogoT1.produtos.find((item) => item.id_produto === produto.id_produto);
  const delta = computeProdutoAlteracaoDelta(produtoAtualT1, {
    id_categoria: 'c1', nome: 'Bolo de cenoura', descricao: 'Original', ordem: 1, ativo: true, destaque: false, preco_normal: '17,99', promocao_ativa: false,
  });
  const agendado = await scheduleChange(pool, {
    id_usuario_admin: 'u1', tipo_entidade: 'PRODUTO', id_registro: produto.id_produto,
    data_vigencia: new Date(Date.now() + 60_000), dados_alteracao: { ...delta, recurso: 'produto', acao: 'editar', id: produto.id_produto },
  });

  // T2: alguém altera manualmente a descrição antes do horário vencer.
  await updateProduto(pool, produto.id_produto, { descricao: 'Alterado manualmente antes do agendamento' });
  const antesDoVencimento = pool.data.produtos.find((item) => item.id_produto === produto.id_produto);
  assert.equal(antesDoVencimento.descricao_produto, 'Alterado manualmente antes do agendamento');

  // T3: o job processa o agendamento vencido.
  const resultados = await processDueScheduledChanges(pool, new Date(agendado.data_vigencia.getTime ? agendado.data_vigencia.getTime() + 1000 : Date.now() + 61_000));
  assert.equal(resultados[0].status, 'APLICADA');

  const precos = pool.data.precos.filter((item) => item.id_produto === produto.id_produto && item.ativo && !item.promocional);
  assert.equal(precos[0].valor_centavos, 1799);

  const depois = pool.data.produtos.find((item) => item.id_produto === produto.id_produto);
  assert.equal(depois.descricao_produto, 'Alterado manualmente antes do agendamento', 'campo não agendado não deve ser revertido');
});

test('idempotência: um agendamento vencido não é aplicado duas vezes mesmo com chamadas concorrentes', async () => {
  const pool = createMemoryPool();
  const produto = await createProduto(pool, { id_categoria: 'c1', nome: 'Torta', descricao: '', ordem: 0, ativo: true, destaque: false, preco_normal: '10,00' });
  await scheduleChange(pool, {
    id_usuario_admin: 'u1', tipo_entidade: 'PRODUTO', id_registro: produto.id_produto,
    data_vigencia: new Date(Date.now() + 1000), dados_alteracao: { preco_normal: '12,00', recurso: 'produto', acao: 'editar', id: produto.id_produto },
  });
  const now = new Date(Date.now() + 2000);
  const [a, b] = await Promise.all([
    processDueScheduledChanges(pool, now),
    processDueScheduledChanges(pool, now),
  ]);
  const aplicadas = [...a, ...b].filter((item) => item.status === 'APLICADA');
  assert.equal(aplicadas.length, 1);
  const precos = pool.data.precos.filter((item) => item.id_produto === produto.id_produto && item.ativo && !item.promocional);
  assert.equal(precos.length, 1);
  assert.equal(precos[0].valor_centavos, 1200);
});

test('produto não muda antes do horário agendado e muda quando o job vence', async () => {
  const pool = createMemoryPool();
  const produto = await createProduto(pool, { id_categoria: 'c1', nome: 'Pudim', descricao: '', ordem: 0, ativo: true, destaque: false, preco_normal: '8,00' });
  await scheduleChange(pool, {
    id_usuario_admin: 'u1', tipo_entidade: 'PRODUTO', id_registro: produto.id_produto,
    data_vigencia: new Date(Date.now() + 5000), dados_alteracao: { preco_normal: '9,50', recurso: 'produto', acao: 'editar', id: produto.id_produto },
  });

  const antesResultados = await processDueScheduledChanges(pool, new Date());
  assert.equal(antesResultados.length, 0);
  const precoAntes = pool.data.precos.filter((item) => item.id_produto === produto.id_produto && item.ativo && !item.promocional);
  assert.equal(precoAntes[0].valor_centavos, 800);

  const depoisResultados = await processDueScheduledChanges(pool, new Date(Date.now() + 6000));
  assert.equal(depoisResultados[0].status, 'APLICADA');
  const precoDepois = pool.data.precos.filter((item) => item.id_produto === produto.id_produto && item.ativo && !item.promocional);
  assert.equal(precoDepois[0].valor_centavos, 950);
});

test('cancelar agendamento impede aplicação futura', async () => {
  const pool = createMemoryPool();
  const produto = await createProduto(pool, { id_categoria: 'c1', nome: 'Brigadeiro', descricao: '', ordem: 0, ativo: true, destaque: false, preco_normal: '5,00' });
  const agendado = await scheduleChange(pool, {
    id_usuario_admin: 'u1', tipo_entidade: 'PRODUTO', id_registro: produto.id_produto,
    data_vigencia: new Date(Date.now() + 1000), dados_alteracao: { preco_normal: '6,00', recurso: 'produto', acao: 'editar', id: produto.id_produto },
  });
  await cancelScheduledChange(pool, agendado.id_alteracao_agendada);
  const resultados = await processDueScheduledChanges(pool, new Date(Date.now() + 2000));
  assert.equal(resultados.length, 0);
  const lista = await listScheduledChanges(pool, {});
  assert.equal(lista[0].status_alteracao, 'CANCELADA');
});
