export const CART_STORAGE_KEY = 'amanteigados_carrinho_v1';
export const CART_VERSION = 1;
export const LEGACY_SESSION_KEY = 'amanteigadosLivia.demoCart.v1';
export const CART_EVENT = 'amanteigados:carrinho-atualizado';

function emptyCart() {
  return { version: CART_VERSION, items: [] };
}

function cloneCart(cart) {
  return {
    version: CART_VERSION,
    items: (cart?.items || []).map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      name: item.name || null,
      image: item.image || null,
      unitPrice: item.unitPrice ?? null,
    })),
  };
}

export function isStructurallyValidQuantity(quantity) {
  return Number.isInteger(quantity) && quantity > 0;
}

export function isStructurallyValidProductId(productId) {
  if (typeof productId === 'string') return productId.trim() !== '';
  if (typeof productId === 'number') return Number.isFinite(productId);
  return false;
}

export function migrateLegacyCart(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.items)) {
    return emptyCart();
  }
  const items = [];
  const seen = new Set();
  for (const rawItem of raw.items) {
    if (!rawItem || typeof rawItem !== 'object') continue;
    const productId = rawItem.productId ?? rawItem.id_produto ?? rawItem.id;
    const quantity = rawItem.quantity ?? rawItem.quantidade;
    if (!isStructurallyValidProductId(productId)) continue;
    if (!isStructurallyValidQuantity(quantity)) continue;
    if (seen.has(productId)) continue;
    seen.add(productId);
    items.push({
      productId,
      quantity,
      name: typeof rawItem.name === 'string' ? rawItem.name : null,
      image: typeof rawItem.image === 'string' ? rawItem.image : null,
      unitPrice: Number.isFinite(rawItem.unitPrice) ? rawItem.unitPrice : null,
    });
  }
  return { version: CART_VERSION, items };
}

export function sanitizeStoredCart(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.items)) {
    return emptyCart();
  }
  if (raw.version !== CART_VERSION && raw.version !== 1) {
    return migrateLegacyCart(raw);
  }
  return migrateLegacyCart(raw);
}

export function lineSubtotal(unitPrice, quantity) {
  const price = Number(unitPrice);
  const qty = Number(quantity);
  if (!Number.isFinite(price) || !Number.isFinite(qty)) return 0;
  return price * qty;
}

export function cartTotal(items) {
  return (items || []).reduce((sum, item) => sum + lineSubtotal(item.unitPrice, item.quantity), 0);
}

function readJson(storage, key) {
  if (!storage) return undefined;
  try {
    return storage.getItem(key);
  } catch {
    return undefined;
  }
}

function writeJson(storage, key, value) {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function removeKey(storage, key) {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    // best-effort
  }
}

function snapshotFromCatalog(catalog, productId) {
  const product = catalog?.getProductById?.(productId) || null;
  if (!product) return null;
  const unitPrice = catalog.getEffectivePrice?.(product);
  return {
    name: product.name || null,
    image: product.image || null,
    unitPrice: Number.isFinite(unitPrice) ? unitPrice : null,
    product,
  };
}

export function createCartStore({
  localStorage: localStore = null,
  sessionStorage: sessionStore = null,
  getCatalog = () => null,
  now = () => Date.now(),
} = {}) {
  let memory = emptyCart();
  let storageDisabled = false;

  function persist(cart) {
    memory = cloneCart(cart);
    if (!storageDisabled && localStore) {
      const ok = writeJson(localStore, CART_STORAGE_KEY, memory);
      if (!ok) storageDisabled = true;
    }
    return cloneCart(memory);
  }

  function load() {
    if (!storageDisabled) {
      const current = readJson(localStore, CART_STORAGE_KEY);
      if (typeof current === 'string' && current) {
        try {
          memory = sanitizeStoredCart(JSON.parse(current));
          return cloneCart(memory);
        } catch {
          removeKey(localStore, CART_STORAGE_KEY);
        }
      }
      const legacy = readJson(sessionStore, LEGACY_SESSION_KEY);
      if (typeof legacy === 'string' && legacy) {
        try {
          memory = migrateLegacyCart(JSON.parse(legacy));
          persist(memory);
          removeKey(sessionStore, LEGACY_SESSION_KEY);
          return cloneCart(memory);
        } catch {
          removeKey(sessionStore, LEGACY_SESSION_KEY);
        }
      }
    }
    memory = sanitizeStoredCart(memory);
    return cloneCart(memory);
  }

  function enrichItems(items) {
    const catalog = typeof getCatalog === 'function' ? getCatalog() : null;
    return items.map((item) => {
      const snapshot = catalog ? snapshotFromCatalog(catalog, item.productId) : null;
      const currentPrice = snapshot?.unitPrice;
      const unitPrice = Number.isFinite(currentPrice) ? currentPrice : item.unitPrice;
      const priceChanged = Number.isFinite(item.unitPrice)
        && Number.isFinite(currentPrice)
        && item.unitPrice !== currentPrice;
      return {
        productId: item.productId,
        quantity: item.quantity,
        name: snapshot?.name || item.name || 'Produto',
        image: snapshot?.image || item.image || null,
        unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
        subtotal: lineSubtotal(Number.isFinite(unitPrice) ? unitPrice : 0, item.quantity),
        priceChanged: priceChanged === true,
        product: snapshot?.product || null,
      };
    });
  }

  function getItems() {
    return enrichItems(load().items);
  }

  function getCount() {
    return getItems().reduce((sum, item) => sum + item.quantity, 0);
  }

  function getTotal() {
    return cartTotal(getItems());
  }

  function publicCart() {
    const items = getItems();
    return {
      items,
      count: items.reduce((sum, item) => sum + item.quantity, 0),
      total: cartTotal(items),
      subtotal: cartTotal(items),
    };
  }

  function addItem(productId, quantity) {
    if (!isStructurallyValidProductId(productId)) {
      return { ok: false, reason: 'invalid-product' };
    }
    if (!isStructurallyValidQuantity(quantity)) {
      return { ok: false, reason: 'invalid-quantity' };
    }
    const catalog = typeof getCatalog === 'function' ? getCatalog() : null;
    const snapshot = catalog ? snapshotFromCatalog(catalog, productId) : null;
    if (catalog?.isUsableProduct && snapshot?.product && !catalog.isUsableProduct(snapshot.product)) {
      return { ok: false, reason: 'invalid-product' };
    }
    const cart = load();
    const existing = cart.items.find((item) => item.productId === productId);
    if (existing) {
      existing.quantity += quantity;
      if (snapshot) {
        existing.name = snapshot.name;
        existing.image = snapshot.image;
        existing.unitPrice = snapshot.unitPrice;
      }
    } else {
      cart.items.push({
        productId,
        quantity,
        name: snapshot?.name || null,
        image: snapshot?.image || null,
        unitPrice: snapshot?.unitPrice ?? null,
      });
    }
    persist(cart);
    return { ok: true, cart: publicCart() };
  }

  function updateQuantity(productId, quantity) {
    if (!isStructurallyValidQuantity(quantity)) {
      return { ok: false, reason: 'invalid-quantity' };
    }
    const cart = load();
    const existing = cart.items.find((item) => item.productId === productId);
    if (!existing) return { ok: false, reason: 'item-not-found' };
    existing.quantity = quantity;
    persist(cart);
    return { ok: true, cart: publicCart() };
  }

  function removeItem(productId) {
    const cart = load();
    cart.items = cart.items.filter((item) => item.productId !== productId);
    persist(cart);
    return { ok: true, cart: publicCart() };
  }

  function clear() {
    persist(emptyCart());
    return { ok: true, cart: publicCart() };
  }

  load();
  now();

  return {
    getItems,
    addItem,
    updateQuantity,
    removeItem,
    clear,
    getTotal,
    getCount,
    loadCart: load,
    getCartItems: getItems,
    updateItem: updateQuantity,
    clearCart: clear,
    getCartCount: getCount,
    getCartSubtotal: getTotal,
  };
}
