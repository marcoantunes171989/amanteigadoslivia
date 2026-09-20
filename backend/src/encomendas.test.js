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
});

test('encomenda form validation rejects missing required fields and oversized payload', () => {
  assert.throws(() => validateEncomendaPayload({ telefone: '11988887777', tipo: 'ENCOMENDA', descricao: 'x' }), AdminError);
  assert.throws(() => validateEncomendaPayload({ nome: 'Ana', tipo: 'ENCOMENDA', descricao: 'x' }), AdminError);
  assert.throws(() => validateEncomendaPayload({ nome: 'Ana', telefone: '11988887777', tipo: 'FOO', descricao: 'x' }), AdminError);
  assert.throws(() => validateEncomendaPayload({ nome: 'Ana', telefone: '11988887777', tipo: 'ENCOMENDA', email: 'nao-email' }), AdminError);
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
    descricao_pedido: 'Caixa de clássicos',
  });
  assert.equal(created.status_solicitacao, 'NOVA');
  assert.match(calls[0].sql, /INSERT INTO app.tab_solicitacao_encomenda/);
  assert.equal(calls[0].params[8], undefined);
});
