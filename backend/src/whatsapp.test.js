import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildCartWhatsAppMessage,
  buildEncomendaWhatsAppMessage,
  buildWhatsAppUrl,
  formatWhatsAppDisplay,
  normalizeWhatsAppPhone,
} from './whatsapp.js';

test('normalizes and displays international whatsapp numbers', () => {
  assert.equal(normalizeWhatsAppPhone('+55 (11) 99999-0000'), '5511999990000');
  assert.equal(formatWhatsAppDisplay('5511999990000'), '+55 11 99999-0000');
  assert.equal(normalizeWhatsAppPhone('123'), null);
});

test('builds encoded cart whatsapp URL with items and total', () => {
  const message = buildCartWhatsAppMessage({
    items: [
      { quantity: 1, name: 'Produto A', unitPrice: 10 },
      { quantity: 2, name: 'Produto B', unitPrice: 7.5 },
    ],
    total: 25,
    nome: 'Marco',
  });
  assert.match(message, /1x Produto A/);
  assert.match(message, /2x Produto B/);
  assert.match(message, /Total: R\$\s?25,00/);
  const url = buildWhatsAppUrl('5511999990000', message);
  assert.ok(url.startsWith('https://wa.me/5511999990000?text='));
  assert.ok(url.includes(encodeURIComponent('Produto A')));
});

test('builds encomenda follow-up message', () => {
  const message = buildEncomendaWhatsAppMessage({
    nome: 'Maria Silva',
    tipo: 'ANIVERSARIO',
    telefone: '(18) 99999-9999',
    email: 'exemplo@email.com',
    dataEvento: '2026-12-25',
    quantidade: '50',
    descricao: 'Texto informado pelo cliente.',
    solicitacaoId: 'abc-123',
  });
  assert.match(message, /Olá! Gostaria de solicitar uma encomenda na Amanteigados Lívia\./);
  assert.match(message, /\*Tipo:\* Aniversário/);
  assert.match(message, /\*Nome:\* Maria Silva/);
  assert.match(message, /\*WhatsApp:\* \(18\) 99999-9999/);
  assert.match(message, /\*E-mail:\* exemplo@email.com/);
  assert.match(message, /\*Data:\* 25\/12\/2026/);
  assert.match(message, /\*Quantidade estimada:\* 50/);
  assert.match(message, /\*Detalhes do pedido:\*/);
  assert.match(message, /Texto informado pelo cliente\./);
  assert.match(message, /\*Solicitação:\* abc-123/);
  assert.equal(message.includes('\n'), true);
});

test('omits empty optional fields from encomenda whatsapp message', () => {
  const message = buildEncomendaWhatsAppMessage({
    nome: 'Ana',
    tipo: 'ENCOMENDA',
    telefone: '(18) 99999-0000',
    descricao: 'Caixa clássica',
  });
  assert.doesNotMatch(message, /E-mail/);
  assert.doesNotMatch(message, /Data:/);
  assert.doesNotMatch(message, /Quantidade estimada/);
  assert.doesNotMatch(message, /Solicitação:/);
});
