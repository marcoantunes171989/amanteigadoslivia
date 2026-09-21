import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  SIDEBAR_STORAGE_KEY,
  readSidebarCollapsed,
  writeSidebarCollapsed,
  createRefreshGate,
  shouldApplyRevision,
  catalogItemsSignature,
  preserveCatalogFilters,
  buildRealtimeBroadcastBody,
  realtimeBroadcastUrl,
  appBottomNavItems,
  appMoreMenuItems,
  activeAppNavId,
  isAppShellViewport,
  isPhoneViewport,
} from '../../ui-core.js';

test('sidebar collapsed preference uses a visual-only localStorage key', () => {
  const store = new Map();
  const storage = {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
  };

  assert.equal(SIDEBAR_STORAGE_KEY, 'admin_sidebar_collapsed');
  assert.equal(readSidebarCollapsed(storage), false);
  assert.equal(writeSidebarCollapsed(storage, true), true);
  assert.equal(readSidebarCollapsed(storage), true);
  assert.equal(store.get(SIDEBAR_STORAGE_KEY), 'true');
  assert.equal(store.has('admin_session'), false);
});

test('refresh gate deduplicates overlapping realtime and fallback calls', async () => {
  const gate = createRefreshGate({ minIntervalMs: 0 });
  let runs = 0;
  let release;
  const first = new Promise((resolve) => { release = resolve; });

  const task = async () => {
    runs += 1;
    if (runs === 1) await first;
  };

  const a = gate.run(task);
  const b = gate.run(task);
  assert.equal(gate.isBusy(), true);
  release();
  await Promise.all([a, b]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(runs, 2);
});

test('revision helper skips duplicate catalog snapshots', () => {
  assert.equal(shouldApplyRevision(null, 'rev-1'), true);
  assert.equal(shouldApplyRevision('rev-1', 'rev-1'), false);
  assert.equal(shouldApplyRevision('rev-1', 'rev-2'), true);
});

test('catalog refresh keeps search and category while updating product signature', () => {
  const state = preserveCatalogFilters(
    { query: 'chocolate', category: 'classicos', sort: 'name-asc' },
    { query: 'chocolate', category: 'classicos' },
  );
  assert.equal(state.query, 'chocolate');
  assert.equal(state.category, 'classicos');
  assert.notEqual(
    catalogItemsSignature([{ id: '1', name: 'A', price: 10 }]),
    catalogItemsSignature([{ id: '1', name: 'A', price: 12 }]),
  );
});

test('realtime broadcast payload targets catalogo-homolog', () => {
  const body = buildRealtimeBroadcastBody('catalogo-homolog', 'catalogo_atualizado', { revisao: 'abc' });
  assert.equal(body.messages[0].topic, 'catalogo-homolog');
  assert.equal(body.messages[0].event, 'catalogo_atualizado');
  assert.equal(
    realtimeBroadcastUrl('https://example.supabase.co/'),
    'https://example.supabase.co/realtime/v1/api/broadcast',
  );
});

test('public header menu is uniform and includes all expected links', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const nav = html.match(/<nav class="nav"[\s\S]*?<\/nav>/)?.[0] || '';
  for (const label of ['Início', 'Cardápio', 'Encomendas', 'Festas', 'Personalizados', 'Painel Administrativo']) {
    assert.match(nav, new RegExp(label));
  }
  assert.match(nav, /href="\/admin"/);
  assert.doesNotMatch(nav, /btn-primary|order-btn|admin-link/);
});

test('public header and footer use official branding alt text', () => {
  for (const file of ['index.html', 'produtos.html', 'carrinho.html']) {
    const html = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.match(html, /class="brand"[\s\S]*alt="Amanteigados Lívia"/);
    assert.match(html, /class="footer-brand"[\s\S]*alt="Amanteigados Lívia — Feitos com Amor"/);
    assert.match(html, /href="https:\/\/www\.instagram\.com\/amanteigadoslivia\/"/);
    assert.match(html, /href="https:\/\/wa\.me\//);
  }
});

test('app shell navigation exposes phone items and more menu', () => {
  const items = appBottomNavItems();
  const more = appMoreMenuItems();
  assert.deepEqual(items.map((item) => item.id), ['inicio', 'cardapio', 'encomendas', 'carrinho', 'mais']);
  assert.equal(items.every((item) => item.label.length <= 12), true);
  assert.equal(more.some((item) => item.href === '/#festas-momentos'), true);
  assert.equal(more.some((item) => item.href === '/admin'), true);
  assert.equal(activeAppNavId('/produtos'), 'cardapio');
  assert.equal(activeAppNavId('/carrinho'), 'carrinho');
  assert.equal(activeAppNavId('/', '#encomendas'), 'encomendas');
  assert.equal(activeAppNavId('/', ''), 'inicio');
  assert.equal(isAppShellViewport(1024), true);
  assert.equal(isAppShellViewport(1025), false);
  assert.equal(isPhoneViewport(430), true);
  assert.equal(isPhoneViewport(820), false);
  for (const file of ['index.html', 'produtos.html', 'carrinho.html']) {
    const html = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.match(html, /id="appBottomNav"/);
    assert.match(html, /id="appMoreSheet"/);
    assert.match(html, /Painel Administrativo/);
    assert.match(html, /viewport-fit=cover/);
  }
});

test('mobile cart summary stays in document flow and desktop sticky is preserved', () => {
  const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
  assert.match(css, /@media \(min-width:\s*900px\)\{[\s\S]{0,280}?\.cart-summary\{[^}]*position:\s*sticky/);
  assert.match(css, /\.cart-summary \{\s*position: static;/);
  assert.doesNotMatch(css, /position:\s*sticky;\s*bottom:\s*calc\(64px/);
  assert.match(css, /app-bottom-nav[\s\S]{0,800}?safe-area-inset-bottom/);
});

test('admin header user mount and dialog close contract exist', () => {
  const html = readFileSync(new URL('../../admin.html', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../../admin.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../admin.css', import.meta.url), 'utf8');
  assert.match(html, /id="adminUser"/);
  assert.match(html, /class="admin-user"/);
  assert.match(html, /id="confirmDialog"/);
  assert.match(js, /className: 'dialog-close'/);
  assert.match(js, /'aria-label': DIALOG_CLOSE_LABEL/);
  assert.match(js, /type: 'button'/);
  assert.match(js, /shouldCloseDialogOnBackdrop/);
  assert.match(css, /\.dialog-close\s*\{/);
  assert.match(css, /width:\s*44px/);
  assert.match(css, /--bordo:\s*#7A3E48/);
  assert.match(css, /--serif:\s*"Fraunces"/);
  assert.match(css, /--sans:\s*"Inter"/);
});
