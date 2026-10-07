import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  VIEW_CACHE_TTL_MS,
  VIEW_RESOURCES,
  createDirtyViews,
  createViewCache,
  createViewNavigator,
  isFormField,
} from '../../admin-view-cache.js';

// Respostas controladas pelo teste: cada request fica pendente até respond() ser chamado.
function setup(initialView) {
  let view = initialView;
  const clock = { t: 0 };
  const cache = createViewCache({ now: () => clock.t });
  const dirty = createDirtyViews();
  const calls = [];
  const paints = [];
  const skeletons = [];
  const errors = [];
  const applied = [];
  const nav = createViewNavigator({
    cache,
    dirty,
    currentView: () => view,
    keyOf: () => 'default',
    load: (name, isCurrent) => new Promise((resolve, reject) => {
      calls.push({ name, isCurrent, resolve, reject, done: false });
    }),
    paint: (name) => paints.push(name),
    skeleton: (name) => skeletons.push(name),
    onError: (error, info) => errors.push({ ...info, status: error.status }),
  });
  // Simula o loader real: só aplica (e marca o cache) se a resposta ainda for a atual.
  function respond(name, { fail = null } = {}) {
    const call = calls.find((item) => item.name === name && !item.done);
    assert.ok(call, `sem request pendente para ${name}`);
    call.done = true;
    if (fail) return call.reject(fail);
    if (!call.isCurrent()) return call.resolve(false);
    cache.mark(name, 'default');
    applied.push(name);
    return call.resolve(true);
  }
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  return { nav, cache, dirty, clock, calls, paints, skeletons, errors, applied, respond, flush, setView: (next) => { view = next; } };
}

test('clique muda a view na mesma task: sem cache, esqueleto é síncrono e o fetch não bloqueia', async () => {
  const t = setup('overview');
  t.setView('categories');
  const pending = t.nav.enter('categories');
  assert.deepEqual(t.skeletons, ['categories'], 'estrutura aparece antes de qualquer resposta');
  assert.deepEqual(t.paints, [], 'nada renderizado com dados antes do fetch');
  assert.equal(t.calls.length, 1, 'fetch iniciado sem esperar render');
  t.respond('catalog');
  await pending;
  assert.deepEqual(t.paints, ['categories']);
});

test('dados em cache aparecem antes da revalidação (stale-while-revalidate)', async () => {
  const t = setup('overview');
  t.cache.mark('catalog', 'default');
  t.clock.t = VIEW_CACHE_TTL_MS.catalog + 1;
  t.setView('categories');
  const pending = t.nav.enter('categories');
  assert.deepEqual(t.paints, ['categories'], 'renderiza o último conhecido na hora');
  assert.deepEqual(t.skeletons, [], 'não apaga a tela com esqueleto');
  assert.equal(t.calls.length, 1, 'revalida em background');
  t.respond('catalog');
  await pending;
  assert.deepEqual(t.paints, ['categories', 'categories'], 'nova resposta substitui o conteúdo');
});

test('recurso dentro da janela de frescor não gera request ao reentrar', async () => {
  const t = setup('overview');
  t.cache.mark('catalog', 'default');
  t.clock.t = 1000;
  t.setView('products');
  await t.nav.enter('products');
  assert.equal(t.calls.length, 0, 'catálogo reaproveitado entre Categorias e Produtos');
  assert.deepEqual(t.paints, ['products']);
});

test('resposta obsoleta não sobrescreve a view atual (latest-view-wins)', async () => {
  const t = setup('overview');
  t.setView('categories');
  const a = t.nav.enter('categories');
  t.setView('sales');
  const b = t.nav.enter('sales');
  t.respond('catalog');
  await a;
  assert.deepEqual(t.paints, [], 'resposta de Categorias não pinta depois de Vendas');
  assert.equal(t.applied.includes('catalog'), false, 'resposta obsoleta não grava estado');
  t.respond('sales');
  await b;
  assert.deepEqual(t.paints, ['sales'], 'a view atual (Vendas) é a única renderizada');
});

test('navegação rápida A -> B preserva B mesmo quando A responde depois', async () => {
  const t = setup('overview');
  t.cache.mark('catalog', 'default');
  t.clock.t = VIEW_CACHE_TTL_MS.catalog + 1;
  t.setView('products');
  const a = t.nav.enter('products');
  t.setView('users');
  const b = t.nav.enter('users');
  t.respond('catalog');
  await a;
  t.respond('users');
  await b;
  assert.deepEqual(t.paints.at(-1), 'users');
  assert.equal(t.paints.filter((name) => name === 'products').length, 1, 'Produtos pintou só no clique original (cache), nunca após B');
});

test('erro de atualização mantém os dados anteriores quando existirem', async () => {
  const t = setup('overview');
  t.cache.mark('catalog', 'default');
  t.clock.t = VIEW_CACHE_TTL_MS.catalog + 1;
  t.setView('categories');
  const pending = t.nav.enter('categories');
  t.respond('catalog', { fail: Object.assign(new Error('falhou'), { status: 500 }) });
  await pending;
  assert.deepEqual(t.paints, ['categories'], 'sem nova pintura de erro: continua o conteúdo anterior');
  assert.deepEqual(t.errors, [{ view: 'categories', hasData: true, status: 500 }]);
});

test('primeiro acesso com erro informa que não há dados (sem tela em branco silenciosa)', async () => {
  const t = setup('overview');
  t.setView('users');
  const pending = t.nav.enter('users');
  assert.deepEqual(t.skeletons, ['users'], 'loading coerente enquanto carrega');
  t.respond('users', { fail: Object.assign(new Error('x'), { status: 500 }) });
  await pending;
  assert.deepEqual(t.errors, [{ view: 'users', hasData: false, status: 500 }]);
  assert.deepEqual(t.paints, []);
});

test('edição não salva: entrar na view não a substitui nem dispara request', async () => {
  const t = setup('overview');
  t.cache.mark('catalog', 'default');
  t.setView('categories');
  t.dirty.mark('categories');
  await t.nav.enter('categories');
  assert.deepEqual(t.paints, [], 'não repinta o formulário editado');
  assert.deepEqual(t.skeletons, []);
  assert.equal(t.calls.length, 0, 'sem revalidação enquanto há edição');
});

test('edição iniciada durante a revalidação: a resposta em background não sobrescreve os campos', async () => {
  const t = setup('overview');
  t.cache.mark('catalog', 'default');
  t.clock.t = VIEW_CACHE_TTL_MS.catalog + 1;
  t.setView('categories');
  const pending = t.nav.enter('categories');
  t.dirty.mark('categories');
  t.respond('catalog');
  await pending;
  assert.deepEqual(t.paints, ['categories'], 'só a pintura do cache do clique; a resposta não repinta');
});

test('recarga explícita (ação do usuário) renderiza mesmo com a view marcada como editada', async () => {
  const t = setup('overview');
  t.cache.mark('catalog', 'default');
  t.setView('categories');
  t.dirty.mark('categories');
  const pending = t.nav.refresh('categories');
  t.respond('catalog');
  await pending;
  assert.deepEqual(t.paints, ['categories']);
  assert.equal(t.dirty.isDirty('categories'), false, 'a recarga conclui a edição');
});

test('escrita invalida o frescor: o cache é pintado e a view é revalidada', async () => {
  const t = setup('overview');
  t.cache.mark('catalog', 'default');
  t.cache.invalidateAll();
  t.setView('categories');
  const pending = t.nav.enter('categories');
  assert.deepEqual(t.paints, ['categories']);
  assert.equal(t.calls.length, 1);
  t.respond('catalog');
  await pending;
});

test('Dashboard: catálogo fresco é reaproveitado e só o período é revalidado', async () => {
  assert.deepEqual(VIEW_RESOURCES.overview, ['catalog', 'dashboard']);
  const t = setup('categories');
  t.cache.mark('catalog', 'default');
  t.cache.mark('dashboard', 'default');
  t.setView('overview');
  const pending = t.nav.enter('overview');
  assert.deepEqual(t.paints, ['overview'], 'Dashboard aparece com o último conhecido');
  assert.deepEqual(t.calls.map((call) => call.name), ['dashboard'], 'catálogo não é buscado de novo');
  t.respond('dashboard');
  await pending;
  assert.deepEqual(t.paints, ['overview', 'overview']);
});

test('createViewCache: chave diferente não reaproveita dados de outro filtro', () => {
  const cache = createViewCache({ now: () => 0 });
  cache.mark('sales', 'hoje|todos');
  assert.equal(cache.has('sales', 'hoje|todos'), true);
  assert.equal(cache.has('sales', '7d|todos'), false);
  assert.equal(cache.isFresh('sales', 'hoje|todos'), false, 'vendas revalidam sempre (ttl 0)');
});

test('createViewCache: janela de frescor expira e invalidateAll mantém dados mas vence todos', () => {
  const clock = { t: 0 };
  const cache = createViewCache({ now: () => clock.t, ttl: { catalog: 100 } });
  cache.mark('catalog', 'default');
  clock.t = 99;
  assert.equal(cache.isFresh('catalog', 'default'), true);
  clock.t = 100;
  assert.equal(cache.isFresh('catalog', 'default'), false);
  cache.mark('catalog', 'default');
  cache.invalidateAll();
  assert.equal(cache.has('catalog', 'default'), true);
  assert.equal(cache.isFresh('catalog', 'default'), false);
  cache.clear();
  assert.equal(cache.has('catalog', 'default'), false);
});

test('isFormField: campos editáveis contam; busca e botões não', () => {
  assert.equal(isFormField({ tagName: 'INPUT', type: 'text' }), true);
  assert.equal(isFormField({ tagName: 'TEXTAREA' }), true);
  assert.equal(isFormField({ tagName: 'SELECT' }), true);
  assert.equal(isFormField({ tagName: 'INPUT', type: 'search' }), false);
  assert.equal(isFormField({ tagName: 'BUTTON' }), false);
  assert.equal(isFormField(null), false);
});

test('admin.js: clique usa enterView (sem await) e setView mantém o contrato de view/grupo', () => {
  const js = readFileSync(new URL('../../admin.js', import.meta.url), 'utf8');
  const setViewBody = js.slice(js.indexOf('function setView(view) {'), js.indexOf('function badge(active)'));
  assert.match(setViewBody, /enterView\(view\);/);
  assert.doesNotMatch(setViewBody, /await/, 'setView nunca espera fetch');
  assert.match(setViewBody, /updateNavGroups\(activeNavGroup\(\)\)/);
});

test('admin.js: primeiro acesso troca só o conteúdo da view, sem recriar shell ou sidebar', () => {
  const js = readFileSync(new URL('../../admin.js', import.meta.url), 'utf8');
  const skeleton = js.slice(js.indexOf('function renderViewSkeleton(view)'), js.indexOf('function renderViewLoadError'));
  assert.match(skeleton, /views\[view\]\.replaceChildren\(/);
  assert.doesNotMatch(skeleton, /appView|adminSidebar|document\.body|overlay/i);
});

test('admin.js: loaders não sobrescrevem state com resposta obsoleta', () => {
  const js = readFileSync(new URL('../../admin.js', import.meta.url), 'utf8');
  for (const name of ['loadCatalog', 'loadSales', 'loadContent', 'loadRequests', 'loadReports', 'loadPublications', 'loadAudit', 'loadUsers']) {
    const body = js.slice(js.indexOf(`async function ${name}(`), js.indexOf(`async function ${name}(`) + 400);
    assert.match(body, /if \(!isCurrent\(\)\) return false;/, `${name} precisa checar isCurrent antes de gravar`);
  }
});

test('admin.js: escrita (não GET) invalida o cache em memória; logout limpa dados', () => {
  const js = readFileSync(new URL('../../admin.js', import.meta.url), 'utf8');
  const requestBody = js.slice(js.indexOf('async function request(url'), js.indexOf('const response = await fetch(url'));
  assert.match(requestBody, /options\.method && options\.method !== 'GET'\) viewCache\.invalidateAll\(\)/);
  const loginBody = js.slice(js.indexOf('function showLogin() {'), js.indexOf('function renderAmbiente'));
  assert.match(loginBody, /clearAdminData\(\);/);
});

test('admin.js: cache não usa localStorage nem sessionStorage', () => {
  const js = readFileSync(new URL('../../admin.js', import.meta.url), 'utf8');
  const cacheModule = readFileSync(new URL('../../admin-view-cache.js', import.meta.url), 'utf8');
  assert.doesNotMatch(cacheModule, /localStorage|sessionStorage/);
  const start = js.indexOf('// Cache só em memória');
  assert.ok(start > 0, 'bloco do cache precisa existir');
  assert.doesNotMatch(js.slice(start, start + 400), /localStorage|sessionStorage/);
});

test('admin.css: skeleton de primeiro acesso existe e o movimento segue prefers-reduced-motion', () => {
  const css = readFileSync(new URL('../../admin.css', import.meta.url), 'utf8');
  assert.match(css, /\.view-skeleton \{/);
  const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(reduced, /\.skeleton,/);
});
