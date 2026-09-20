(function () {
  'use strict';

  const CART_VERSION = 1;
  const STORAGE_KEY = 'amanteigados_carrinho_v1';
  const LEGACY_KEY = 'amanteigadosLivia.demoCart.v1';

  let memoryCart = { version: CART_VERSION, items: [] };
  let storageDisabled = false;

  function emptyCart() {
    return { version: CART_VERSION, items: [] };
  }

  function cloneCart(cart) {
    return {
      version: CART_VERSION,
      items: (cart.items || []).map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        name: item.name || null,
        image: item.image || null,
        unitPrice: item.unitPrice ?? null,
      })),
    };
  }

  function isValidId(productId) {
    if (typeof productId === 'string') return productId.trim() !== '';
    if (typeof productId === 'number') return Number.isFinite(productId);
    return false;
  }

  function isValidQty(quantity) {
    return Number.isInteger(quantity) && quantity > 0;
  }

  function migrate(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.items)) return emptyCart();
    const seen = new Set();
    const items = [];
    for (const rawItem of raw.items) {
      if (!rawItem || typeof rawItem !== 'object') continue;
      const productId = rawItem.productId ?? rawItem.id_produto ?? rawItem.id;
      const quantity = rawItem.quantity ?? rawItem.quantidade;
      if (!isValidId(productId) || !isValidQty(quantity) || seen.has(productId)) continue;
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

  function readStore(store, key) {
    if (storageDisabled || !store) return undefined;
    try { return store.getItem(key); } catch { storageDisabled = true; return undefined; }
  }

  function writeStore(store, key, value) {
    if (storageDisabled || !store) return;
    try { store.setItem(key, JSON.stringify(value)); } catch { storageDisabled = true; }
  }

  function removeStore(store, key) {
    if (storageDisabled || !store) return;
    try { store.removeItem(key); } catch { storageDisabled = true; }
  }

  function updateBadges() {
    const count = memoryCart.items.reduce((sum, item) => sum + item.quantity, 0);
    document.querySelectorAll('.js-cart-count').forEach((badge) => {
      badge.hidden = count <= 0;
      badge.textContent = String(count);
    });
    document.querySelectorAll('.cart-shortcut').forEach((el) => {
      el.setAttribute('aria-label', count === 1 ? 'Carrinho, 1 item' : `Carrinho, ${count} itens`);
    });
  }

  function persist(cart) {
    memoryCart = cloneCart(cart);
    writeStore(window.localStorage, STORAGE_KEY, memoryCart);
    emit();
    return cloneCart(memoryCart);
  }

  function loadCart() {
    const current = readStore(window.localStorage, STORAGE_KEY);
    if (typeof current === 'string' && current) {
      try {
        memoryCart = migrate(JSON.parse(current));
        return cloneCart(memoryCart);
      } catch {
        removeStore(window.localStorage, STORAGE_KEY);
      }
    }
    const legacy = readStore(window.sessionStorage, LEGACY_KEY);
    if (typeof legacy === 'string' && legacy) {
      try {
        memoryCart = migrate(JSON.parse(legacy));
        persist(memoryCart);
        removeStore(window.sessionStorage, LEGACY_KEY);
        return cloneCart(memoryCart);
      } catch {
        removeStore(window.sessionStorage, LEGACY_KEY);
      }
    }
    memoryCart = migrate(memoryCart);
    return cloneCart(memoryCart);
  }

  function catalog() {
    return window.AmanteigadosCatalog || null;
  }

  function snapshot(productId) {
    const Catalog = catalog();
    const product = Catalog?.getProductById?.(productId) || null;
    if (!product) return null;
    const unitPrice = Catalog.getEffectivePrice?.(product);
    return {
      name: product.name || null,
      image: product.image || null,
      unitPrice: Number.isFinite(unitPrice) ? unitPrice : null,
      product,
    };
  }

  function getCartItems() {
    return loadCart().items.map((item) => {
      const snap = snapshot(item.productId);
      const currentPrice = snap?.unitPrice;
      const unitPrice = Number.isFinite(currentPrice) ? currentPrice : (item.unitPrice ?? 0);
      return {
        productId: item.productId,
        quantity: item.quantity,
        name: snap?.name || item.name || 'Produto',
        image: snap?.image || item.image || null,
        unitPrice,
        effectivePrice: unitPrice,
        subtotal: unitPrice * item.quantity,
        priceChanged: Number.isFinite(item.unitPrice) && Number.isFinite(currentPrice) && item.unitPrice !== currentPrice,
        product: snap?.product || {
          id: item.productId,
          name: item.name || 'Produto',
          image: item.image,
          price: item.unitPrice,
          demo: false,
        },
      };
    });
  }

  function publicCart() {
    const items = getCartItems();
    const total = items.reduce((sum, item) => sum + item.subtotal, 0);
    return { items, count: items.reduce((sum, item) => sum + item.quantity, 0), total, subtotal: total };
  }

  function addItem(productId, quantity) {
    if (!isValidId(productId)) return { ok: false, reason: 'invalid-product' };
    if (!isValidQty(quantity)) return { ok: false, reason: 'invalid-quantity' };
    const Catalog = catalog();
    const snap = snapshot(productId);
    if (Catalog?.isUsableProduct && snap?.product && !Catalog.isUsableProduct(snap.product)) {
      return { ok: false, reason: 'invalid-product' };
    }
    const cart = loadCart();
    const existing = cart.items.find((item) => item.productId === productId);
    if (existing) {
      existing.quantity += quantity;
      if (snap) {
        existing.name = snap.name;
        existing.image = snap.image;
        existing.unitPrice = snap.unitPrice;
      }
    } else {
      cart.items.push({
        productId,
        quantity,
        name: snap?.name || null,
        image: snap?.image || null,
        unitPrice: snap?.unitPrice ?? null,
      });
    }
    persist(cart);
    return { ok: true, cart: publicCart() };
  }

  function updateItem(productId, quantity) {
    if (!isValidQty(quantity)) return { ok: false, reason: 'invalid-quantity' };
    const cart = loadCart();
    const existing = cart.items.find((item) => item.productId === productId);
    if (!existing) return { ok: false, reason: 'item-not-found' };
    existing.quantity = quantity;
    persist(cart);
    return { ok: true, cart: publicCart() };
  }

  function removeItem(productId) {
    const cart = loadCart();
    cart.items = cart.items.filter((item) => item.productId !== productId);
    persist(cart);
    return { ok: true, cart: publicCart() };
  }

  function clearCart() {
    persist(emptyCart());
    return { ok: true, cart: publicCart() };
  }

  function emit() {
    if (typeof window === 'undefined') return;
    updateBadges();
    window.dispatchEvent(new CustomEvent('amanteigados:carrinho-atualizado', { detail: publicCart() }));
  }

  const api = {
    loadCart,
    getCartItems,
    addItem,
    updateItem,
    updateQuantity: updateItem,
    removeItem,
    clearCart,
    clear: clearCart,
    getCartCount() { return publicCart().count; },
    getCount() { return publicCart().count; },
    getCartSubtotal() { return publicCart().total; },
    getTotal() { return publicCart().total; },
    getItems: getCartItems,
  };

  window.AmanteigadosCart = Object.freeze(api);
  window.CartStore = window.AmanteigadosCart;
  loadCart();
  updateBadges();
})();
