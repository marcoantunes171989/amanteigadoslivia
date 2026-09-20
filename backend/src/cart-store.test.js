import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CART_STORAGE_KEY,
  cartTotal,
  createCartStore,
  LEGACY_SESSION_KEY,
  lineSubtotal,
  migrateLegacyCart,
} from './cart-store.js';

function memoryStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
    _store: store,
  };
}

test('migrates legacy session cart without dropping items', () => {
  const migrated = migrateLegacyCart({
    version: 1,
    items: [
      { productId: 'p1', quantity: 2 },
      { productId: 'p1', quantity: 9 },
      { productId: 'p2', quantity: 1 },
    ],
  });
  assert.equal(migrated.items.length, 2);
  assert.equal(migrated.items[0].quantity, 2);
  assert.equal(migrated.items[1].productId, 'p2');
});

test('CartStore persists across reload using the canonical key', () => {
  const local = memoryStorage();
  const store = createCartStore({ localStorage: local, getCatalog: () => null });
  store.addItem('prod-a', 1);
  store.addItem('prod-b', 2);
  const reloaded = createCartStore({ localStorage: local, getCatalog: () => null });
  const items = reloaded.getItems();
  assert.equal(items.length, 2);
  assert.equal(items.find((item) => item.productId === 'prod-b').quantity, 2);
  assert.ok(local._store.has(CART_STORAGE_KEY));
});

test('legacy sessionStorage is migrated then abandoned', () => {
  const local = memoryStorage();
  const session = memoryStorage({
    [LEGACY_SESSION_KEY]: JSON.stringify({ version: 1, items: [{ productId: 'old', quantity: 3 }] }),
  });
  const store = createCartStore({ localStorage: local, sessionStorage: session, getCatalog: () => null });
  assert.equal(store.getItems()[0].productId, 'old');
  assert.equal(session.getItem(LEGACY_SESSION_KEY), null);
  assert.ok(local.getItem(CART_STORAGE_KEY));
});

test('subtotal and total use current unit prices', () => {
  assert.equal(lineSubtotal(12.5, 2), 25);
  assert.equal(cartTotal([{ unitPrice: 10, quantity: 1 }, { unitPrice: 7.5, quantity: 2 }]), 25);
});

test('does not require catalog to keep items after add', () => {
  const local = memoryStorage();
  const store = createCartStore({ localStorage: local, getCatalog: () => null });
  store.addItem('keep-me', 1);
  const later = createCartStore({ localStorage: local, getCatalog: () => ({ getProductById() { return null; } }) });
  assert.equal(later.getItems().length, 1);
  assert.equal(later.getItems()[0].productId, 'keep-me');
});
