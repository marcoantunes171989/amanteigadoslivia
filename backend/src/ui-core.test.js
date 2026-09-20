import assert from 'node:assert/strict';
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
