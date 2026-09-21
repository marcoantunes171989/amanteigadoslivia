import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AdminError } from './admin-errors.js';
import { createSolicitacaoEncomenda, validateEncomendaPayload } from './encomendas.js';

test('encomenda form validation accepts a complete payload and rejects html', () => {
  const data = validateEncomendaPayload({
    nome: '  Maria <b>Silva</b> ',
    telefone: '+55 (11) 98888-7777',
    email: 'maria@example.com',
    tipo: 'ANIVERSARIO',
    data_evento: '2026-12-01',
    quantidade: 24,
    descricao: 'Biscoitos com o nome da festa',
  });
  assert.equal(data.nome_cliente, 'Maria Silva');
  assert.equal(data.telefone_cliente, '5511988887777');
  assert.equal(data.tipo_solicitacao, 'ANIVERSARIO');
  assert.equal(data.data_evento, '2026-12-01');
});

test('encomenda form validation rejects missing required fields and oversized payload', () => {
  assert.throws(() => validateEncomendaPayload({ telefone: '11988887777', tipo: 'ENCOMENDA', descricao: 'x', quantidade: 1 }), AdminError);
  assert.throws(() => validateEncomendaPayload({ nome: 'Ana', tipo: 'ENCOMENDA', descricao: 'x', quantidade: 1 }), AdminError);
  assert.throws(() => validateEncomendaPayload({ nome: 'Ana', telefone: '11988887777', tipo: 'FOO', descricao: 'x', quantidade: 1 }), AdminError);
  assert.throws(() => validateEncomendaPayload({ nome: 'Ana', telefone: '11988887777', tipo: 'ENCOMENDA', email: 'nao-email', quantidade: 1, descricao: 'x' }), AdminError);
});

test('email invalido bloqueia envio da encomenda', () => {
  assert.throws(
    () => validateEncomendaPayload({
      nome: 'Ana',
      telefone: '18999999999',
      tipo: 'ENCOMENDA',
      email: 'texto-sem-arroba',
      quantidade: 1,
      descricao: 'Pedido',
    }),
    (error) => error instanceof AdminError && error.message === 'E-mail inválido.',
  );
  assert.throws(
    () => validateEncomendaPayload({
      nome: 'Ana',
      telefone: '18999999999',
      tipo: 'ENCOMENDA',
      email: 'ana@dominio',
      quantidade: 1,
      descricao: 'Pedido',
    }),
    AdminError,
  );
});

test('data DD/MM/AAAA e convertida para ISO e data invalida bloqueia', () => {
  const ok = validateEncomendaPayload({
    nome: 'Ana',
    telefone: '18999999999',
    tipo: 'ENCOMENDA',
    data_evento: '25/12/2026',
    quantidade: 1,
    descricao: 'Pedido',
  });
  assert.equal(ok.data_evento, '2026-12-25');
  assert.throws(
    () => validateEncomendaPayload({
      nome: 'Ana',
      telefone: '18999999999',
      tipo: 'ENCOMENDA',
      data_evento: '31/02/2026',
      quantidade: 1,
      descricao: 'Pedido',
    }),
    AdminError,
  );
});

test('backend bloqueia quantidade abaixo do minimo e aceita o minimo exato', () => {
  const minimos = { ANIVERSARIO: 30, ENCOMENDA: 1, PRESENTE: 1, CELEBRACAO: 1, EVENTO: 1, LEMBRANCA: 1, PERSONALIZADO: 1 };
  assert.throws(
    () => validateEncomendaPayload({
      nome: 'Ana',
      telefone: '18999999999',
      tipo: 'ANIVERSARIO',
      quantidade: 20,
      descricao: 'Festa',
    }, { minimos }),
    (error) => error instanceof AdminError && error.message === 'Para Aniversário, a quantidade mínima é 30.',
  );
  const ok = validateEncomendaPayload({
    nome: 'Ana',
    telefone: '18999999999',
    tipo: 'ANIVERSARIO',
    quantidade: 30,
    descricao: 'Festa',
  }, { minimos });
  assert.equal(ok.quantidade_estimada, 30);
});

test('create solicitacao persists NOVA status', async () => {
  const calls = [];
  const queryable = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [] };
    },
  };
  const created = await createSolicitacaoEncomenda(queryable, {
    nome_cliente: 'Ana',
    telefone_cliente: '11999990000',
    tipo_solicitacao: 'ENCOMENDA',
    quantidade_estimada: 1,
    descricao_pedido: 'Caixa de clássicos',
  });
  assert.equal(created.status_solicitacao, 'NOVA');
  assert.equal(calls.some((item) => /INSERT INTO app.tab_solicitacao_encomenda/.test(item.sql)), true);
});
