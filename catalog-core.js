// ===================== CATALOG CORE (FASE 4A.1) =====================
// Camada de regras puras do catálogo — SEM DOM. Responsabilidade única:
// resolver a fonte de dados atual (hoje catalog-demo-data.js, futuramente
// API/banco) e expor preço/quantidade/lookup de produto como funções
// puras, para que produtos.js e o futuro cart.js nunca dupliquem essas
// regras (ver docs/cart-spec.md, seções 24-26).
//
// Nunca deve conter: document, createElement, querySelector,
// getElementById, innerHTML, textContent, replaceChildren,
// addEventListener, classes CSS, toast, badge ou qualquer renderização.
//
// Carregar este script ANTES de cart.js e produtos.js, e DEPOIS de
// catalog-demo-data.js (ver produtos.html).
(function () {
  'use strict';

  // ---- Fonte de dados: resolvida uma única vez na inicialização ----
  // Preserva exatamente o comportamento de loadCatalogSource() (Fase 3.3):
  // nunca confia cegamente em window.CATALOG_DATA — se ausente ou
  // malformada, cai com segurança para arrays vazios.
  function loadCatalogSource() {
    const source = (typeof window !== 'undefined' && window.CATALOG_DATA) || null;
    if (!source || typeof source !== 'object') {
      return { mode: null, categories: [], products: [] };
    }
    return {
      mode: typeof source.mode === 'string' ? source.mode : null,
      categories: Array.isArray(source.categories) ? source.categories : [],
      products: Array.isArray(source.products) ? source.products : [],
    };
  }

  const CATALOG_SOURCE = loadCatalogSource();

  function getMode() {
    return CATALOG_SOURCE.mode;
  }
  function getCategories() {
    return CATALOG_SOURCE.categories;
  }
  function getProducts() {
    return CATALOG_SOURCE.products;
  }
  function getProductById(productId) {
    if (productId === null || productId === undefined) return null;
    return CATALOG_SOURCE.products.find((p) => p && p.id === productId) || null;
  }

  // ---- Preço ----
  const priceFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  // 0 é preço válido — nunca tratar como "sem preço".
  function isValidPrice(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
  }

  function formatPrice(value) {
    return isValidPrice(value) ? priceFormatter.format(value) : null;
  }

  // Preço efetivamente cobrado: o promocional só é válido quando existe um
  // preço-base válido E o promocional é estritamente menor que ele — nunca
  // interpreta promotionalPrice isolado (sem price) como promoção real.
  function getEffectivePrice(product) {
    const regular = product.price;
    const promo = product.promotionalPrice;
    if (isValidPrice(regular) && isValidPrice(promo) && promo < regular) {
      return promo;
    }
    if (isValidPrice(regular)) {
      return regular;
    }
    return null;
  }

  // ---- Quantidade — helpers básicos (defaults técnicos, sem validar comercialmente) ----
  function getQuantityMin(product) {
    return Number.isInteger(product?.minQuantity) && product.minQuantity > 0 ? product.minQuantity : 1;
  }
  function getQuantityStep(product) {
    return Number.isInteger(product?.quantityStep) && product.quantityStep > 0 ? product.quantityStep : 1;
  }
  function getQuantityMax(product) {
    return Number.isInteger(product?.maxQuantity) && product.maxQuantity > 0 ? product.maxQuantity : null;
  }
  function clampQuantity(product, value) {
    const min = getQuantityMin(product);
    const max = getQuantityMax(product);
    let v = value;
    if (v < min) v = min;
    if (max !== null && v > max) v = max;
    return v;
  }

  // ---- Consistência comercial de quantidade (Fase 4A.0.2 / 4A.1) ----
  // Diferente de getQuantityMin/Step/Max acima (que sempre caem para um
  // default técnico quando o campo está ausente/inválido): aqui um campo
  // EXPLICITAMENTE preenchido porém inválido reprova o produto, em vez de
  // ser mascarado silenciosamente pelo default.
  function isConsistentQuantityRange(product) {
    const rawMin = product?.minQuantity;
    const rawStep = product?.quantityStep;
    const rawMax = product?.maxQuantity;

    if (rawMin !== null && rawMin !== undefined) {
      if (!Number.isInteger(rawMin) || rawMin <= 0) return false;
    }
    if (rawStep !== null && rawStep !== undefined) {
      if (!Number.isInteger(rawStep) || rawStep <= 0) return false;
    }

    const min = getQuantityMin(product);
    const step = getQuantityStep(product);

    if (rawMax !== null && rawMax !== undefined) {
      if (!Number.isInteger(rawMax) || rawMax < min) return false;
      if ((rawMax - min) % step !== 0) return false;
    }
    return true;
  }

  // Uma quantidade só está "na grade" quando é um inteiro positivo válido
  // E o produto tem configuração de quantidade comercialmente consistente
  // E ela pertence exatamente a min + n*step (dentro de max, se existir).
  function isQuantityOnGrid(product, quantity) {
    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity <= 0) {
      return false;
    }
    if (!isConsistentQuantityRange(product)) return false;
    const min = getQuantityMin(product);
    const step = getQuantityStep(product);
    const max = getQuantityMax(product);
    if (quantity < min) return false;
    if ((quantity - min) % step !== 0) return false;
    if (max !== null && quantity > max) return false;
    return true;
  }

  // Normalização para OPERAÇÕES INTERNAS CONTROLADAS apenas (addItem,
  // updateItem, merge) — nunca para "consertar" um valor lido do storage
  // (ver docs/cart-spec.md, seção 13: sanitizeCart() valida e remove,
  // nunca normaliza). Convenção de arredondamento: Math.round() nativo do
  // JS (.5 arredonda para cima).
  function normalizeQuantityToGrid(product, rawQuantity) {
    if (
      typeof rawQuantity !== 'number' ||
      !Number.isFinite(rawQuantity) ||
      !Number.isInteger(rawQuantity) ||
      rawQuantity <= 0
    ) {
      return null;
    }
    if (!isConsistentQuantityRange(product)) return null;

    const min = getQuantityMin(product);
    const step = getQuantityStep(product);
    const max = getQuantityMax(product);

    let n = Math.round((rawQuantity - min) / step);
    if (n < 0) n = 0;
    let normalized = min + n * step;
    if (max !== null && normalized > max) normalized = max;

    // Falha defensiva: o resultado precisa pertencer à grade antes de
    // ser devolvido (nunca inventar uma quantidade fora dela).
    return isQuantityOnGrid(product, normalized) ? normalized : null;
  }

  // ---- Produto utilizável pelo carrinho (docs/cart-spec.md, seção 9) ----
  // Não exige pricingMode (não implementado). Mesmo princípio de id válido
  // já usado por isValidProduct() em produtos.js: string ou number.
  function isUsableProduct(product) {
    if (!product || typeof product !== 'object') return false;
    if (typeof product.id !== 'string' && typeof product.id !== 'number') return false;
    if (product.active !== true) return false;
    if (!isValidPrice(getEffectivePrice(product))) return false;
    if (!isConsistentQuantityRange(product)) return false;
    return true;
  }

  const AmanteigadosCatalog = {
    getMode,
    getCategories,
    getProducts,
    getProductById,

    isValidPrice,
    formatPrice,
    getEffectivePrice,

    getQuantityMin,
    getQuantityStep,
    getQuantityMax,
    clampQuantity,

    isConsistentQuantityRange,
    isQuantityOnGrid,
    normalizeQuantityToGrid,
    isUsableProduct,
  };

  window.AmanteigadosCatalog = Object.freeze(AmanteigadosCatalog);
})();
