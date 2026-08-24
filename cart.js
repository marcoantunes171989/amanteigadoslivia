// ===================== CART SERVICE (FASE 4A.1) =====================
// Serviço de estado do carrinho demonstrativo — SEM DOM, sem UI. Nunca
// contém: document, createElement, querySelector, getElementById,
// innerHTML, textContent, replaceChildren, event listener de UI, toast,
// badge, alert, confirm (a futura carrinho.js fará window.confirm() antes
// de chamar clearCart() — este arquivo nunca confirma nada sozinho).
//
// Consome exclusivamente window.AmanteigadosCatalog (catalog-core.js) —
// nunca reimplementa getEffectivePrice/isValidPrice/formatPrice/regras de
// quantidade. Contrato completo em docs/cart-spec.md.
//
// Carregar depois de catalog-demo-data.js e catalog-core.js, antes de
// produtos.js (ver produtos.html). Ainda sem consumidor visual nesta fase
// (Fase 4A.2 criará carrinho.js e o botão "Adicionar ao carrinho").
(function () {
  'use strict';

  const Catalog = window.AmanteigadosCatalog;

  const CART_VERSION = 1;
  const STORAGE_KEY = 'amanteigadosLivia.demoCart.v1';

  // Estado em memória — fonte de verdade da página atual quando o
  // sessionStorage está indisponível ou falha em qualquer operação.
  let memoryCart = { version: CART_VERSION, items: [] };

  // Modo degradado (Fase 4A.1.1): uma vez que QUALQUER operação de
  // storage (getItem/setItem/removeItem) lança, o serviço para de
  // confiar em sessionStorage pelo resto da página — nunca volta a
  // consultá-lo. Sem isso, uma leitura futura bem-sucedida (mas de um
  // valor antigo/vazio, já que a escrita anterior falhou) sobrescreveria
  // memoryCart e apagaria o estado correto que só existia em memória.
  // Nunca acessa sessionStorage no carregamento do script — só reage a
  // uma falha real de operação.
  let storageDisabled = false;

  function emptyCart() {
    return { version: CART_VERSION, items: [] };
  }

  // Nunca expõe a referência interna de memoryCart/seus itens — sempre
  // devolve uma estrutura nova, com itens novos (Fase 4A.1.1, correção 3).
  function cloneStoredCart(cart) {
    return {
      version: CART_VERSION,
      items: cart.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
    };
  }

  function isStructurallyValidQuantity(quantity) {
    return (
      typeof quantity === 'number' &&
      Number.isFinite(quantity) &&
      Number.isInteger(quantity) &&
      quantity > 0
    );
  }

  // ---- Storage — acesso sempre defensivo (seção 37 do prompt: getItem,
  // setItem e removeItem podem todos lançar) ----
  // Uma vez degradado, nenhuma das três funções abaixo volta a tocar
  // sessionStorage — evita reler um valor antigo/vazio depois de uma
  // escrita que falhou silenciosamente (ver storageDisabled acima).
  function readStorage() {
    if (storageDisabled) return undefined;
    try {
      return sessionStorage.getItem(STORAGE_KEY);
    } catch (e) {
      storageDisabled = true;
      return undefined; // indisponível — undefined distingue de "ausente" (null)
    }
  }

  function writeStorage(cart) {
    if (storageDisabled) return;
    const persisted = {
      version: CART_VERSION,
      items: cart.items.map((it) => ({ productId: it.productId, quantity: it.quantity })),
    };
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    } catch (e) {
      // Falha ao persistir (storage indisponível/cota excedida): a
      // memória continua sendo a fonte de verdade desta página — nunca
      // mais tentamos sessionStorage pelo resto da execução.
      storageDisabled = true;
    }
  }

  function clearStorageKey() {
    if (storageDisabled) return;
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      // Sem storage disponível — nada a limpar; memória segue válida.
      storageDisabled = true;
    }
  }

  // ---- Sanitização — VALIDA e REMOVE, nunca normaliza estado do storage
  // (docs/cart-spec.md, seção 13) ----
  function sanitizeCart(rawCart) {
    if (
      !rawCart ||
      typeof rawCart !== 'object' ||
      rawCart.version !== CART_VERSION ||
      !Array.isArray(rawCart.items)
    ) {
      return emptyCart();
    }

    // Duplicidade de productId no storage não confiável: mantém apenas a
    // PRIMEIRA ocorrência VÁLIDA de cada productId; nunca soma quantidades
    // de linhas duplicadas (seção 42 do prompt).
    const acceptedIds = new Set();
    const items = [];

    for (const raw of rawCart.items) {
      if (!raw || typeof raw !== 'object') continue;
      const productId = raw.productId;
      const quantity = raw.quantity;

      if (!Catalog.isValidProductId(productId)) continue;
      if (!isStructurallyValidQuantity(quantity)) continue;

      const product = Catalog.getProductById(productId);
      if (!Catalog.isUsableProduct(product)) continue;
      if (!Catalog.isQuantityOnGrid(product, quantity)) continue;

      if (acceptedIds.has(productId)) continue; // ocorrência subsequente — descartada
      acceptedIds.add(productId);
      items.push({ productId, quantity });
    }

    return { version: CART_VERSION, items };
  }

  // ---- Load / Save ----
  // Ambas retornam sempre uma cópia (cloneStoredCart) — nunca a referência
  // interna de memoryCart. Mutar o objeto retornado nunca afeta o serviço.
  function loadCart() {
    const raw = readStorage();

    if (raw === undefined) {
      // Storage indisponível/degradado — opera inteiramente em memória,
      // sem tentar sessionStorage de novo.
      memoryCart = sanitizeCart(memoryCart);
      return cloneStoredCart(memoryCart);
    }
    if (raw === null) {
      memoryCart = emptyCart();
      return cloneStoredCart(memoryCart);
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      // JSON corrompido — carrinho vazio, 0 exceção propagada. Limpa a
      // chave corrompida best-effort.
      clearStorageKey();
      memoryCart = emptyCart();
      return cloneStoredCart(memoryCart);
    }

    const sanitized = sanitizeCart(parsed);
    const rawItemCount = Array.isArray(parsed?.items) ? parsed.items.length : 0;
    if (sanitized.items.length !== rawItemCount) {
      // Sanitização removeu algo (item inválido/fora da grade/duplicado) —
      // repersiste a versão limpa best-effort para não reprocessar o
      // mesmo lixo na próxima leitura.
      writeStorage(sanitized);
    }

    memoryCart = sanitized;
    return cloneStoredCart(memoryCart);
  }

  function saveCart(cart) {
    const sanitized = sanitizeCart(cart);
    memoryCart = sanitized;
    writeStorage(sanitized);
    return cloneStoredCart(memoryCart);
  }

  // ---- Leitura enriquecida (nunca persistida) ----
  function getCartItems() {
    const cart = sanitizeCart(memoryCart);
    return cart.items.map((it) => {
      const product = Catalog.getProductById(it.productId);
      const effectivePrice = Catalog.getEffectivePrice(product);
      return {
        productId: it.productId,
        quantity: it.quantity,
        product,
        effectivePrice,
        subtotal: effectivePrice * it.quantity,
      };
    });
  }

  function getCartCount() {
    return getCartItems().reduce((sum, it) => sum + it.quantity, 0);
  }

  function getCartSubtotal() {
    return getCartItems().reduce((sum, it) => sum + it.subtotal, 0);
  }

  // Estrutura de retorno auxiliar para addItem/updateItem/removeItem/
  // clearCart — nunca persistida, só devolvida para um futuro consumidor
  // de UI decidir o que renderizar sem precisar de uma segunda chamada.
  function buildPublicCart() {
    const items = getCartItems();
    return {
      items,
      count: items.reduce((sum, it) => sum + it.quantity, 0),
      subtotal: items.reduce((sum, it) => sum + it.subtotal, 0),
    };
  }

  // ---- Mutações ----
  function addItem(productId, quantity) {
    const product = Catalog.getProductById(productId);
    if (!Catalog.isUsableProduct(product)) {
      return { ok: false, reason: 'invalid-product' };
    }
    if (!isStructurallyValidQuantity(quantity)) {
      return { ok: false, reason: 'invalid-quantity' };
    }

    const cart = sanitizeCart(loadCart());
    const existing = cart.items.find((it) => it.productId === productId);

    if (existing) {
      const rawTotal = existing.quantity + quantity;
      const normalized = Catalog.normalizeQuantityToGrid(product, rawTotal);
      if (normalized === null) {
        return { ok: false, reason: 'invalid-quantity' };
      }
      existing.quantity = normalized;
    } else {
      const normalized = Catalog.normalizeQuantityToGrid(product, quantity);
      if (normalized === null) {
        return { ok: false, reason: 'invalid-quantity' };
      }
      cart.items.push({ productId, quantity: normalized });
    }

    saveCart(cart);
    return { ok: true, cart: buildPublicCart() };
  }

  function updateItem(productId, quantity) {
    const product = Catalog.getProductById(productId);
    if (!Catalog.isUsableProduct(product)) {
      return { ok: false, reason: 'invalid-product' };
    }
    if (!isStructurallyValidQuantity(quantity)) {
      return { ok: false, reason: 'invalid-quantity' };
    }

    const cart = sanitizeCart(loadCart());
    const existing = cart.items.find((it) => it.productId === productId);
    if (!existing) {
      return { ok: false, reason: 'item-not-found' };
    }

    const normalized = Catalog.normalizeQuantityToGrid(product, quantity);
    if (normalized === null) {
      return { ok: false, reason: 'invalid-quantity' };
    }
    existing.quantity = normalized;

    saveCart(cart);
    return { ok: true, cart: buildPublicCart() };
  }

  function removeItem(productId) {
    const cart = sanitizeCart(loadCart());
    cart.items = cart.items.filter((it) => it.productId !== productId);
    saveCart(cart);
    return { ok: true, cart: buildPublicCart() };
  }

  // Sem window.confirm aqui — a futura carrinho.js confirma antes de chamar.
  function clearCart() {
    saveCart(emptyCart());
    return { ok: true, cart: buildPublicCart() };
  }

  const AmanteigadosCart = {
    loadCart,
    saveCart,
    sanitizeCart,
    getCartItems,
    addItem,
    updateItem,
    removeItem,
    clearCart,
    getCartCount,
    getCartSubtotal,
  };

  window.AmanteigadosCart = Object.freeze(AmanteigadosCart);
})();
