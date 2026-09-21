import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildCartWhatsAppMessage,
  buildEncomendaWhatsAppMessage,
  buildWhatsAppUrl,
  formatWhatsAppDisplay,
  normalizeWhatsAppPhone,
  resolveCommercialWhatsAppPhone,
} from './whatsapp.js';
import {
  buildCheckoutMessage,
  openWhatsAppUrl,
  resolveCheckoutDestination,
  runCartCheckout,
  validateCheckoutFields,
} from '../../cart-checkout.js';

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
  assert.match(message, /\*Total:\* R\$ 25,00/);
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

const CART_ITEMS = [
  { productId: 'p1', quantity: 2, subtotal: 40.38, product: { name: 'Amanteigado Tradicional' } },
  { productId: 'p2', quantity: 1, subtotal: 2.21, product: { name: 'Amanteigado de Goiabada' } },
];
const SERVER_VENDA = {
  id_venda: 'a1b2c3d4-0000-4000-8000-000000000000',
  nome_cliente: 'Marco Antônio',
  telefone_cliente: '18999998888',
  valor_total_centavos: 4259,
  itens: [
    { nome_produto: 'Amanteigado Tradicional', quantidade: 2, valor_total_centavos: 4038 },
    { nome_produto: 'Amanteigado de Goiabada', quantidade: 1, valor_total_centavos: 221 },
  ],
};

function checkoutDeps(overrides = {}) {
  const calls = { post: [], open: [] };
  const deps = {
    fields: { nome: 'Marco Antônio', telefone: '(18) 99999-8888' },
    items: CART_ITEMS,
    idempotencyKey: () => 'chave-1',
    readPhone: () => '5518988887777',
    postVenda: async (payload) => {
      calls.post.push(payload);
      return { ok: true, status: 200, data: { ok: true, duplicated: false, venda: SERVER_VENDA } };
    },
    openWhatsApp: (url) => calls.open.push(url),
    ...overrides,
  };
  return { deps, calls };
}

test('cart message: cliente, telefone formatado, itens, quantidades, total e código curto', () => {
  const message = buildCartWhatsAppMessage({
    items: [
      { quantity: 2, name: 'Amanteigado Tradicional', subtotal: 40.38 },
      { quantity: 1, name: 'Amanteigado de Goiabada', subtotal: 2.21 },
    ],
    total: 42.59,
    nome: 'Marco Antônio',
    telefone: '18999998888',
    pedidoId: 'a1b2c3d4-0000-4000-8000-000000000000',
  });
  assert.equal(message, [
    'Olá! Gostaria de fazer um pedido na Amanteigados Lívia.',
    '',
    '*Cliente:* Marco Antônio',
    '*Telefone:* (18) 99999-8888',
    '',
    '*Pedido:*',
    '2x Amanteigado Tradicional — R$ 40,38',
    '1x Amanteigado de Goiabada — R$ 2,21',
    '',
    '*Total:* R$ 42,59',
    '',
    '*Código do pedido:* #A1B2C3D4',
    '',
    'Aguardo a confirmação. Obrigado!',
  ].join('\n'));
  assert.doesNotMatch(message, /a1b2c3d4-0000/);
  assert.doesNotMatch(message, /18999998888/);
  assert.doesNotMatch(message, /chave|hash|idempot/i);
});

test('cart message: nome com quebra de linha não injeta linhas extras', () => {
  const message = buildCartWhatsAppMessage({
    items: [{ quantity: 1, name: 'Produto', subtotal: 1 }],
    total: 1,
    nome: 'Ana\n*Total:* R$ 0,01',
    telefone: '18999998888',
  });
  assert.equal(message.split('\n').filter((line) => line.startsWith('*Total:*')).length, 1);
});

test('destino comercial: config válida gera URL; ausente/inválida/placeholder bloqueiam', () => {
  assert.equal(resolveCommercialWhatsAppPhone('+55 (18) 98888-7777'), '5518988887777');
  assert.equal(resolveCommercialWhatsAppPhone(''), null);
  assert.equal(resolveCommercialWhatsAppPhone(undefined), null);
  assert.equal(resolveCommercialWhatsAppPhone('abc'), null);
  assert.equal(resolveCommercialWhatsAppPhone('5500000000000'), null);
  assert.equal(resolveCommercialWhatsAppPhone('00000000000'), null);
});

test('checkout: validação de campos (nome e telefone)', () => {
  assert.equal(validateCheckoutFields({ nome: '', telefone: '18999998888' }).errors.nome, 'Informe seu nome.');
  assert.equal(validateCheckoutFields({ nome: '   ', telefone: '18999998888' }).errors.nome, 'Informe seu nome.');
  assert.equal(validateCheckoutFields({ nome: 'A', telefone: '18999998888' }).errors.nome, 'Informe seu nome.');
  assert.equal(validateCheckoutFields({ nome: 'Al', telefone: '18999998888' }).ok, true);
  assert.equal(validateCheckoutFields({ nome: 'Ana', telefone: '' }).errors.telefone, 'Informe seu telefone.');
  assert.equal(validateCheckoutFields({ nome: 'Ana', telefone: '(18) 9999-999' }).errors.telefone, 'Informe um telefone válido.');
  assert.equal(validateCheckoutFields({ nome: 'Ana', telefone: '(18) 9999-9999' }).values.telefone, '1899999999');
  assert.equal(validateCheckoutFields({ nome: 'Ana', telefone: '(18) 99999-9999' }).values.telefone, '18999999999');
  assert.equal(validateCheckoutFields({ nome: 'Ana', telefone: '+55 18 99999-9999' }).values.telefone, '18999999999');
});

test('checkout: API 200 registra e abre WhatsApp com dados autoritativos do servidor', async () => {
  const { deps, calls } = checkoutDeps();
  const result = await runCartCheckout(deps);
  assert.equal(result.ok, true);
  assert.equal(calls.post.length, 1);
  assert.deepEqual(Object.keys(calls.post[0]).sort(), [
    'chave_idempotencia', 'itens', 'nome_cliente', 'origem_venda', 'telefone_cliente',
  ]);
  assert.equal(calls.post[0].origem_venda, 'SITE');
  assert.equal(calls.post[0].telefone_cliente, '18999998888');
  assert.deepEqual(calls.post[0].itens, [
    { id_produto: 'p1', quantidade: 2 },
    { id_produto: 'p2', quantidade: 1 },
  ]);
  assert.equal(calls.open.length, 1);
  const url = calls.open[0];
  assert.ok(url.startsWith('https://wa.me/5518988887777?text='));
  const text = decodeURIComponent(url.split('?text=')[1]);
  assert.match(text, /\*Cliente:\* Marco Antônio/);
  assert.match(text, /\*Telefone:\* \(18\) 99999-8888/);
  assert.match(text, /2x Amanteigado Tradicional — R\$ 40,38/);
  assert.match(text, /1x Amanteigado de Goiabada — R\$ 2,21/);
  assert.match(text, /\*Total:\* R\$ 42,59/);
  assert.match(text, /#A1B2C3D4/);
  assert.equal(result.message, 'Pedido registrado. Continue no WhatsApp para concluir.');
});

test('checkout: usa preço/total do servidor mesmo se o subtotal visual divergir', async () => {
  const { deps, calls } = checkoutDeps({
    items: [{ productId: 'p1', quantity: 2, subtotal: 1, product: { name: 'Local' } }],
    postVenda: async () => ({
      ok: true,
      status: 200,
      data: { ok: true, duplicated: false, venda: { ...SERVER_VENDA, valor_total_centavos: 4038, itens: [SERVER_VENDA.itens[0]] } },
    }),
  });
  await runCartCheckout(deps);
  const text = decodeURIComponent(calls.open[0].split('?text=')[1]);
  assert.match(text, /\*Total:\* R\$ 40,38/);
  assert.doesNotMatch(text, /Local/);
});

test('checkout: duplicated=true reabre o WhatsApp sem nova venda', async () => {
  const { deps, calls } = checkoutDeps({
    postVenda: async (payload) => {
      calls.post.push(payload);
      return { ok: true, status: 200, data: { ok: true, duplicated: true, venda: SERVER_VENDA } };
    },
  });
  const result = await runCartCheckout(deps);
  assert.equal(result.ok, true);
  assert.equal(result.duplicated, true);
  assert.equal(calls.open.length, 1);
  assert.match(result.message, /já estava registrado/);
});

test('checkout: API falha (400/429/500/503/rede) NÃO abre o WhatsApp', async () => {
  const scenarios = [
    [{ ok: false, status: 400, data: { message: 'Produto indisponível no catálogo.' } }, 'Produto indisponível no catálogo.'],
    [{ ok: false, status: 429, data: null }, 'Muitas tentativas. Aguarde um momento.'],
    [{ ok: false, status: 500, data: { message: 'interno' } }, 'Não foi possível registrar o pedido agora. Tente novamente.'],
    [{ ok: false, status: 503, data: null }, 'Não foi possível registrar o pedido agora. Tente novamente.'],
  ];
  for (const [response, message] of scenarios) {
    const { deps, calls } = checkoutDeps({ postVenda: async () => response });
    const result = await runCartCheckout(deps);
    assert.equal(result.ok, false);
    assert.equal(result.message, message);
    assert.equal(calls.open.length, 0);
  }
  const { deps, calls } = checkoutDeps({ postVenda: async () => { throw new TypeError('network'); } });
  const result = await runCartCheckout(deps);
  assert.equal(result.ok, false);
  assert.equal(result.message, 'Não foi possível registrar o pedido agora. Tente novamente.');
  assert.equal(calls.open.length, 0);
});

test('checkout: erro 400 de nome/telefone é apontado ao campo correspondente', async () => {
  const nome = checkoutDeps({ postVenda: async () => ({ ok: false, status: 400, data: { message: 'Informe seu nome.' } }) });
  assert.equal((await runCartCheckout(nome.deps)).field, 'nome');
  const tel = checkoutDeps({ postVenda: async () => ({ ok: false, status: 400, data: { message: 'Informe um telefone válido.' } }) });
  assert.equal((await runCartCheckout(tel.deps)).field, 'telefone');
});

test('checkout: campos inválidos ou carrinho vazio não fazem POST nem abrem WhatsApp', async () => {
  for (const fields of [
    { nome: '', telefone: '18999998888' },
    { nome: '   ', telefone: '18999998888' },
    { nome: 'Ana', telefone: '' },
    { nome: 'Ana', telefone: '999998888' },
  ]) {
    const { deps, calls } = checkoutDeps({ fields });
    const result = await runCartCheckout(deps);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'validation');
    assert.equal(calls.post.length, 0);
    assert.equal(calls.open.length, 0);
  }
  const { deps, calls } = checkoutDeps({ items: [] });
  assert.equal((await runCartCheckout(deps)).code, 'empty');
  assert.equal(calls.post.length, 0);
  assert.equal(calls.open.length, 0);
});

test('checkout: destino ausente/placeholder bloqueia ANTES do POST; tenta recarregar config uma vez', async () => {
  for (const phone of [undefined, '', 'abc', '5500000000000']) {
    const { deps, calls } = checkoutDeps({ readPhone: () => phone });
    const result = await runCartCheckout(deps);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'destination');
    assert.equal(result.message, 'WhatsApp comercial indisponível no momento. Tente novamente em instantes.');
    assert.equal(calls.post.length, 0);
    assert.equal(calls.open.length, 0);
  }

  let loaded = false;
  let refreshes = 0;
  const { deps, calls } = checkoutDeps({
    readPhone: () => (loaded ? '5518988887777' : undefined),
    refreshPhone: async () => { refreshes += 1; loaded = true; },
  });
  const result = await runCartCheckout(deps);
  assert.equal(result.ok, true);
  assert.equal(refreshes, 1);
  assert.equal(calls.post.length, 1);
  assert.equal(calls.open.length, 1);

  const failing = checkoutDeps({
    readPhone: () => undefined,
    refreshPhone: async () => { throw new Error('offline'); },
  });
  assert.equal((await runCartCheckout(failing.deps)).code, 'destination');
  assert.equal(failing.calls.post.length, 0);

  assert.equal(await resolveCheckoutDestination({ readPhone: () => '5518988887777' }), '5518988887777');
});

test('checkout: mensagem local (fallback) quando o servidor não devolve itens', () => {
  const text = buildCheckoutMessage({
    venda: { id_venda: 'zzzz1111-x' },
    localItems: CART_ITEMS,
    nome: 'Ana',
    telefone: '18999998888',
  });
  assert.match(text, /2x Amanteigado Tradicional — R\$ 40,38/);
  assert.match(text, /\*Total:\* R\$ 42,59/);
  assert.match(text, /#ZZZZ1111/);
});

test('openWhatsAppUrl: mobile navega direto; desktop abre aba e cai para assign se bloqueado', () => {
  const url = 'https://wa.me/5518988887777?text=oi';
  const mobile = { assigned: [], opened: [], location: { assign(u) { mobile.assigned.push(u); } }, open(u) { mobile.opened.push(u); return {}; } };
  assert.equal(openWhatsAppUrl(url, { win: mobile, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile' }), 'assign');
  assert.deepEqual(mobile.assigned, [url]);
  assert.deepEqual(mobile.opened, []);

  const popup = { opener: 'x' };
  const desktop = { assigned: [], location: { assign(u) { desktop.assigned.push(u); } }, open() { return popup; } };
  assert.equal(openWhatsAppUrl(url, { win: desktop, userAgent: 'Mozilla/5.0 (Windows NT 10.0)' }), 'open');
  assert.deepEqual(desktop.assigned, []);
  assert.equal(popup.opener, null);

  const blocked = { assigned: [], location: { assign(u) { blocked.assigned.push(u); } }, open() { return null; } };
  assert.equal(openWhatsAppUrl(url, { win: blocked, userAgent: 'Mozilla/5.0 (Windows NT 10.0)' }), 'assign');
  assert.deepEqual(blocked.assigned, [url]);
});

test('openWhatsAppUrl (encomenda): desktop com popup não navega a aba atual e zera opener', () => {
  const url = 'https://wa.me/5518988887777?text=oi';
  const popup = { opener: 'pagina-original' };
  const calls = { open: [], assign: [] };
  const win = {
    location: { assign(u) { calls.assign.push(u); } },
    open(...args) { calls.open.push(args); return popup; },
  };
  assert.equal(openWhatsAppUrl(url, { win, userAgent: 'Mozilla/5.0 (Windows NT 10.0)' }), 'open');
  assert.deepEqual(calls.open, [[url, '_blank']]); // sem feature 'noopener' (impediria detectar bloqueio)
  assert.deepEqual(calls.assign, []);
  assert.equal(popup.opener, null);
});

test('openWhatsAppUrl (encomenda): popup bloqueado navega uma única vez na aba atual', () => {
  const url = 'https://wa.me/5518988887777?text=oi';
  const calls = { open: 0, assign: [] };
  const win = {
    location: { assign(u) { calls.assign.push(u); } },
    open() { calls.open += 1; return null; },
  };
  assert.equal(openWhatsAppUrl(url, { win, userAgent: 'Mozilla/5.0 (Macintosh)' }), 'assign');
  assert.equal(calls.open, 1);
  assert.deepEqual(calls.assign, [url]);
});

test('openWhatsAppUrl (encomenda): mobile só faz location.assign, sem window.open', () => {
  const url = 'https://wa.me/5518988887777?text=oi';
  const calls = { open: 0, assign: [] };
  const win = {
    location: { assign(u) { calls.assign.push(u); } },
    open() { calls.open += 1; return {}; },
  };
  assert.equal(openWhatsAppUrl(url, { win, userAgent: 'Mozilla/5.0 (Linux; Android 14) Mobile' }), 'assign');
  assert.equal(calls.open, 0);
  assert.deepEqual(calls.assign, [url]);
});

test('openWhatsAppUrl: window.open que lança erro cai para location.assign uma vez', () => {
  const url = 'https://wa.me/5518988887777?text=oi';
  const assigned = [];
  const win = {
    location: { assign(u) { assigned.push(u); } },
    open() { throw new Error('bloqueado'); },
  };
  assert.equal(openWhatsAppUrl(url, { win, userAgent: 'Mozilla/5.0 (Windows NT 10.0)' }), 'assign');
  assert.deepEqual(assigned, [url]);
});
