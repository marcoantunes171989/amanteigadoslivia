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
    nome: 'Lívia',
    tipo: 'Festa',
    dataEvento: '12/12/2026',
    quantidade: '30',
    descricao: 'Personalizados com iniciais',
  });
  assert.match(message, /Nome: Lívia/);
  assert.match(message, /Tipo: Festa/);
  assert.match(message, /Personalizados com iniciais/);
});
