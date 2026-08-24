// ===================== CATÁLOGO — FONTE DE DADOS =====================
// Arquitetura definida em docs/catalog-spec.md (Fase 2.2/2.2.1). Desde a
// Fase 4A.1, os dados e as regras puras do catálogo (preço, quantidade,
// resolução de produto) vivem em catalog-core.js (window.AmanteigadosCatalog),
// carregado antes deste arquivo junto com catalog-demo-data.js (ver
// produtos.html). produtos.js consome essa API em vez de duplicar essas
// regras — ver docs/cart-spec.md para o contrato completo compartilhado
// com o futuro carrinho (cart.js). catalog-core.js já cai com segurança
// para categorias/produtos vazios quando a fonte estiver ausente ou
// malformada (nenhum ReferenceError fatal) — o estado "Nosso cardápio
// está sendo atualizado" continua sendo o comportamento testado nesse
// caso.
const {
  getMode: getCatalogMode,
  getCategories,
  getProducts,
  isValidPrice,
  formatPrice,
  getEffectivePrice,
  getQuantityMin,
  getQuantityStep,
  getQuantityMax,
  clampQuantity,
} = window.AmanteigadosCatalog;

const CATALOG_MODE = getCatalogMode();
const CATEGORIES = getCategories();
const PRODUCTS = getProducts();

// ===================== NORMALIZAÇÃO DE BUSCA =====================
// Nativo, sem biblioteca externa — case-insensitive e accent-insensitive.
function normalizeSearch(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

// Combina peso e unidade sem duplicar nem inventar dado ausente.
function getWeightUnitLabel(product, separator) {
  const parts = [];
  if (product.weight) parts.push(product.weight);
  if (product.unit) parts.push(product.unit);
  return parts.length ? parts.join(separator) : null;
}

// ===================== VALIDAÇÃO / SELEÇÃO DE DADOS =====================
// Produto malformado nunca deve quebrar a página — exige o mínimo (id,
// nome, active) para ser considerado renderizável.
function isValidProduct(p) {
  return !!p && typeof p === 'object'
    && (typeof p.id === 'string' || typeof p.id === 'number')
    && typeof p.name === 'string' && p.name.trim() !== ''
    && p.active === true;
}

function getActiveProducts() {
  return PRODUCTS.filter(isValidProduct);
}

function getCategoryById(categoryId) {
  if (!categoryId) return null;
  return CATEGORIES.find((c) => c && c.id === categoryId && c.active === true) || null;
}

// Só categorias ativas e com pelo menos um produto ativo associado —
// nunca expõe uma categoria "vazia" ou não homologada.
function getAvailableCategories() {
  const active = getActiveProducts();
  return CATEGORIES
    .filter((c) => c && c.active === true)
    .filter((c) => active.some((p) => p.categoryId === c.id))
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

// ===================== FILTROS / ORDENAÇÃO =====================
// Pipeline obrigatório: ativos -> categoria -> busca -> ordenação -> render.
function filterByCategory(list, categoryId) {
  if (categoryId === 'all') return list;
  return list.filter((p) => p.categoryId === categoryId);
}

function filterBySearch(list, query) {
  const q = normalizeSearch(query);
  if (!q) return list;
  return list.filter((p) => {
    const category = getCategoryById(p.categoryId);
    const haystacks = [p.name, p.shortDescription, p.description, category ? category.name : ''];
    return haystacks.some((text) => text && normalizeSearch(text).includes(q));
  });
}

// Ordenação por preço só é oferecida quando TODOS os produtos considerados
// têm price-base válido — evita UX inconsistente em catálogo parcialmente
// precificado (um "Menor preço" que não pode realmente comparar todo mundo).
function hasCompleteValidPrices(list) {
  return list.length > 0 && list.every((p) => isValidPrice(p.price));
}

function getSortOptions(activeList) {
  const options = [
    { value: 'name-asc', label: 'Nome A–Z' },
    { value: 'name-desc', label: 'Nome Z–A' },
  ];
  // "Mais vendidos" não existe (sem dado real de vendas). Preço só entra
  // quando 100% dos produtos ativos têm price-base homologado.
  if (hasCompleteValidPrices(activeList)) {
    options.push({ value: 'price-asc', label: 'Menor preço' });
    options.push({ value: 'price-desc', label: 'Maior preço' });
  }
  return options;
}

function sortProducts(list, sort) {
  const sorted = list.slice();
  switch (sort) {
    case 'name-desc':
      sorted.sort((a, b) => b.name.localeCompare(a.name, 'pt-BR'));
      break;
    case 'price-asc': {
      // Compara pelo preço efetivamente oferecido (promocional válido,
      // senão o preço-base) — disponibilidade continua controlada à parte
      // por hasCompleteValidPrices(), baseada em price. Fallback defensivo
      // para Infinity caso algum item chegue aqui sem preço efetivo válido.
      sorted.sort((a, b) => {
        const priceA = getEffectivePrice(a);
        const priceB = getEffectivePrice(b);
        return (isValidPrice(priceA) ? priceA : Infinity) - (isValidPrice(priceB) ? priceB : Infinity);
      });
      break;
    }
    case 'price-desc': {
      sorted.sort((a, b) => {
        const priceA = getEffectivePrice(a);
        const priceB = getEffectivePrice(b);
        return (isValidPrice(priceB) ? priceB : -Infinity) - (isValidPrice(priceA) ? priceA : -Infinity);
      });
      break;
    }
    default:
      sorted.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }
  return sorted;
}

function getVisibleProducts() {
  let list = getActiveProducts();
  list = filterByCategory(list, state.category);
  list = filterBySearch(list, state.query);
  list = sortProducts(list, state.sort);
  return list;
}

// ===================== ESTADO =====================
const state = {
  query: '',
  category: 'all',
  sort: 'name-asc',
  selectedProductId: null,
  quantity: 1,
};

// ===================== ELEMENTOS =====================
const els = {
  searchInput: document.getElementById('searchInput'),
  clearSearchBtn: document.getElementById('clearSearchBtn'),
  categoriesBar: document.getElementById('categoriesBar'),
  sortWrap: document.getElementById('sortWrap'),
  sortSelect: document.getElementById('sortSelect'),
  resultsStatus: document.getElementById('resultsStatus'),
  grid: document.getElementById('productsGrid'),
  stateNoData: document.getElementById('stateNoData'),
  stateCategoryEmpty: document.getElementById('stateCategoryEmpty'),
  stateSearchEmpty: document.getElementById('stateSearchEmpty'),
  searchEmptyTitle: document.getElementById('searchEmptyTitle'),
  viewAllBtn: document.getElementById('viewAllBtn'),
  clearSearchEmptyBtn: document.getElementById('clearSearchEmptyBtn'),
  dialog: document.getElementById('productDialog'),
  dialogClose: document.getElementById('dialogClose'),
  dialogTitle: document.getElementById('dialogTitle'),
  dialogImageWrap: document.getElementById('dialogImageWrap'),
  dialogCategory: document.getElementById('dialogCategory'),
  dialogDesc: document.getElementById('dialogDesc'),
  dialogMeta: document.getElementById('dialogMeta'),
  dialogCustomizable: document.getElementById('dialogCustomizable'),
  dialogProductionTime: document.getElementById('dialogProductionTime'),
  dialogPriceRow: document.getElementById('dialogPriceRow'),
  qtyRow: document.getElementById('qtyRow'),
  qtyMinus: document.getElementById('qtyMinus'),
  qtyPlus: document.getElementById('qtyPlus'),
  qtyValue: document.getElementById('qtyValue'),
  qtyTotalRow: document.getElementById('qtyTotalRow'),
  dialogCartActions: document.getElementById('dialogCartActions'),
  addToCartBtn: document.getElementById('addToCartBtn'),
  cartToast: document.getElementById('cartToast'),
  cartToastText: document.getElementById('cartToastText'),
  cartLiveRegion: document.getElementById('cartLiveRegion'),
};

// ===================== CARRINHO — BADGE (Fase 4A.2) =====================
// Consome exclusivamente window.AmanteigadosCart (nunca sessionStorage
// diretamente aqui — ver docs/cart-spec.md). Atualiza todo indicador de
// carrinho presente na página (hoje só o do header; querySelectorAll
// cobre também um cenário futuro com mais de um indicador, sem duplicar
// lógica). Contador = soma das quantidades, nunca número de linhas.
function updateCartBadges() {
  const count = window.AmanteigadosCart.getCartCount();
  document.querySelectorAll('.js-cart-count').forEach((badge) => {
    if (count > 0) {
      badge.hidden = false;
      badge.textContent = String(count);
    } else {
      badge.hidden = true;
      badge.textContent = '0';
    }
  });
  document.querySelectorAll('.cart-shortcut').forEach((el) => {
    el.setAttribute('aria-label', count === 1 ? 'Carrinho, 1 item' : `Carrinho, ${count} itens`);
  });
}

// Anuncia para leitores de tela mesmo quando a mensagem repete a anterior
// (limpa antes de definir, para o AT perceber a mudança de conteúdo).
function announceCartMessage(message) {
  if (!els.cartLiveRegion) return;
  els.cartLiveRegion.textContent = '';
  window.setTimeout(() => {
    els.cartLiveRegion.textContent = message;
  }, 30);
}

let cartToastTimer = null;
function showCartToast(message) {
  if (!els.cartToast || !els.cartToastText) return;
  els.cartToastText.textContent = message;
  els.cartToast.hidden = false;
  els.cartToast.classList.add('visible');
  if (cartToastTimer) window.clearTimeout(cartToastTimer);
  cartToastTimer = window.setTimeout(() => {
    els.cartToast.classList.remove('visible');
    window.setTimeout(() => {
      els.cartToast.hidden = true;
    }, 250);
  }, 2600);
}

// Carrega o carrinho persistido (se houver) e atualiza o badge do header
// já na inicialização — independente de a página ter o catálogo completo.
window.AmanteigadosCart.loadCart();
updateCartBadges();

// Página pode não ter todos os elementos (defensivo) — sai cedo se o
// contêiner principal do catálogo não existir.
if (els.grid) {

  // ===================== HELPERS DE RENDERIZAÇÃO SEGURA =====================
  // Nunca innerHTML com dados de produto/URL/busca — sempre DOM API.
  function clearChildren(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function setFieldText(el, value) {
    if (!el) return;
    if (value === null || value === undefined || value === '') {
      el.hidden = true;
      el.textContent = '';
    } else {
      el.hidden = false;
      el.textContent = String(value);
    }
  }

  function renderImagePlaceholder(container) {
    clearChildren(container);
    const ph = document.createElement('div');
    ph.className = 'product-image-placeholder';
    const orn = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    orn.setAttribute('viewBox', '0 0 40 24');
    orn.setAttribute('class', 'placeholder-ornament');
    orn.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#i-leaf');
    orn.appendChild(use);
    const label = document.createElement('span');
    label.textContent = 'Imagem em atualização';
    ph.appendChild(orn);
    ph.appendChild(label);
    container.appendChild(ph);
  }

  function renderProductImage(container, product) {
    clearChildren(container);
    if (!product.image) {
      renderImagePlaceholder(container);
      return;
    }
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    // Ilustração demonstrativa (Fase 3.3) nunca é descrita como se fosse
    // fotografia real do produto — alt e legenda deixam a natureza clara.
    img.alt = product.demo === true ? `Ilustração demonstrativa de ${product.name}` : product.name;
    img.addEventListener('error', () => renderImagePlaceholder(container), { once: true });
    img.src = product.image;
    container.appendChild(img);
    if (product.demo === true) {
      const tag = document.createElement('span');
      tag.className = 'demo-image-tag';
      tag.textContent = 'Imagem ilustrativa';
      container.appendChild(tag);
    }
  }

  // Preço/promoção — regra única (getEffectivePrice) reaproveitada pelo
  // card e pelo dialog para nunca duplicar a lógica de validade de
  // promoção. Retorna false quando o produto não tem preço válido algum
  // (nenhum elemento é adicionado, e o chamador deve ocultar a linha).
  function appendPriceMarkup(container, product, classNames) {
    const effective = getEffectivePrice(product);
    if (!isValidPrice(effective)) return false;
    const hasPromo = isValidPrice(product.price) && effective < product.price;
    if (hasPromo) {
      const baseEl = document.createElement('span');
      baseEl.className = classNames.strike;
      baseEl.textContent = formatPrice(product.price);
      container.appendChild(baseEl);
    }
    const priceEl = document.createElement('span');
    priceEl.className = hasPromo ? classNames.promo : classNames.price;
    priceEl.textContent = formatPrice(effective);
    container.appendChild(priceEl);
    return true;
  }

  // ===================== CATEGORIAS =====================
  function renderCategories() {
    clearChildren(els.categoriesBar);
    const available = getAvailableCategories();

    if (available.length === 0) {
      els.categoriesBar.hidden = true;
      return;
    }
    els.categoriesBar.hidden = false;

    const makeChip = (id, label) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'category-chip';
      btn.textContent = label;
      btn.dataset.categoryId = id;
      if (state.category === id) {
        btn.classList.add('active');
        btn.setAttribute('aria-pressed', 'true');
      } else {
        btn.setAttribute('aria-pressed', 'false');
      }
      btn.addEventListener('click', () => {
        state.category = id;
        renderCategories();
        renderCatalog();
      });
      return btn;
    };

    els.categoriesBar.appendChild(makeChip('all', 'Todos'));
    available.forEach((c) => els.categoriesBar.appendChild(makeChip(c.id, c.name)));
  }

  // ===================== CONTADOR (status curto e objetivo) =====================
  function renderResultsStatus(count, activeCount) {
    if (activeCount === 0) {
      els.resultsStatus.textContent = '';
      return;
    }
    els.resultsStatus.textContent = count === 1 ? '1 produto' : `${count} produtos`;
  }

  // ===================== ORDENAÇÃO (select) =====================
  function renderSortOptions(activeList) {
    if (activeList.length === 0) {
      els.sortWrap.hidden = true;
      return;
    }
    els.sortWrap.hidden = false;
    const options = getSortOptions(activeList);
    clearChildren(els.sortSelect);
    options.forEach((opt) => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      els.sortSelect.appendChild(option);
    });
    if (!options.some((o) => o.value === state.sort)) {
      state.sort = options[0].value;
    }
    els.sortSelect.value = state.sort;
  }

  // ===================== CARD =====================
  function createProductCard(product) {
    const article = document.createElement('article');
    article.className = 'card product-card';

    const imgWrap = document.createElement('div');
    imgWrap.className = 'card-img';
    renderProductImage(imgWrap, product);
    article.appendChild(imgWrap);

    const foot = document.createElement('div');
    foot.className = 'card-foot';

    const info = document.createElement('div');
    info.className = 'product-info';

    const category = getCategoryById(product.categoryId);
    const categoryEl = document.createElement('p');
    categoryEl.className = 'product-category';
    setFieldText(categoryEl, category ? category.name : null);
    info.appendChild(categoryEl);

    const nameEl = document.createElement('h3');
    nameEl.className = 'product-name';
    nameEl.textContent = product.name;
    info.appendChild(nameEl);

    const descEl = document.createElement('p');
    descEl.className = 'product-desc';
    setFieldText(descEl, product.shortDescription);
    info.appendChild(descEl);

    const metaEl = document.createElement('div');
    metaEl.className = 'product-meta';
    appendPriceMarkup(metaEl, product, {
      price: 'product-price',
      strike: 'product-price-strike',
      promo: 'product-price-promo',
    });
    const weightUnitLabel = getWeightUnitLabel(product, ' · ');
    if (weightUnitLabel) {
      const weightEl = document.createElement('span');
      weightEl.className = 'product-weight';
      weightEl.textContent = weightUnitLabel;
      metaEl.appendChild(weightEl);
    }
    if (metaEl.childNodes.length) info.appendChild(metaEl);

    if (product.customizable === true) {
      const badge = document.createElement('span');
      badge.className = 'badge-customizable';
      badge.textContent = 'Personalizável';
      info.appendChild(badge);
    }

    foot.appendChild(info);

    const ctaBtn = document.createElement('button');
    ctaBtn.type = 'button';
    ctaBtn.className = 'btn btn-primary product-cta';
    ctaBtn.setAttribute('aria-label', `Ver detalhes de ${product.name}`);
    ctaBtn.textContent = 'Ver detalhes ';
    const arrowSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arrowSvg.setAttribute('class', 'ico');
    const arrowUse = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    arrowUse.setAttribute('href', '#i-arrow');
    arrowSvg.appendChild(arrowUse);
    ctaBtn.appendChild(arrowSvg);
    ctaBtn.addEventListener('click', () => openProductDetails(product, ctaBtn));
    foot.appendChild(ctaBtn);

    article.appendChild(foot);
    return article;
  }

  // ===================== ESTADOS VAZIOS =====================
  function hideAllStates() {
    els.stateNoData.hidden = true;
    els.stateCategoryEmpty.hidden = true;
    els.stateSearchEmpty.hidden = true;
  }

  function renderEmptyState(activeList, categoryFiltered, visibleList) {
    hideAllStates();
    if (activeList.length === 0) {
      els.stateNoData.hidden = false;
      return;
    }
    if (categoryFiltered.length === 0) {
      els.stateCategoryEmpty.hidden = false;
      return;
    }
    if (visibleList.length === 0) {
      els.searchEmptyTitle.replaceChildren(
        'Nenhum amanteigado encontrado para “',
        document.createTextNode(state.query),
        '”'
      );
      els.stateSearchEmpty.hidden = false;
    }
  }

  // ===================== RENDER PRINCIPAL =====================
  function renderCatalog() {
    const activeList = getActiveProducts();
    const categoryFiltered = filterByCategory(activeList, state.category);
    const visibleList = sortProducts(filterBySearch(categoryFiltered, state.query), state.sort);

    renderSortOptions(activeList);
    renderResultsStatus(visibleList.length, activeList.length);

    clearChildren(els.grid);
    if (visibleList.length === 0) {
      els.grid.hidden = true;
      renderEmptyState(activeList, categoryFiltered, visibleList);
      return;
    }
    els.grid.hidden = false;
    hideAllStates();
    const frag = document.createDocumentFragment();
    visibleList.forEach((p) => frag.appendChild(createProductCard(p)));
    els.grid.appendChild(frag);
  }

  // ===================== BUSCA =====================
  function updateClearButton() {
    els.clearSearchBtn.hidden = state.query.trim() === '';
  }

  els.searchInput.addEventListener('input', () => {
    state.query = els.searchInput.value;
    updateClearButton();
    renderCatalog();
  });

  els.clearSearchBtn.addEventListener('click', () => {
    state.query = '';
    els.searchInput.value = '';
    updateClearButton();
    renderCatalog();
    els.searchInput.focus();
  });

  els.clearSearchEmptyBtn?.addEventListener('click', () => {
    state.query = '';
    els.searchInput.value = '';
    updateClearButton();
    renderCatalog();
  });

  els.viewAllBtn?.addEventListener('click', () => {
    state.category = 'all';
    renderCategories();
    renderCatalog();
  });

  els.sortSelect.addEventListener('change', () => {
    state.sort = els.sortSelect.value;
    renderCatalog();
  });

  // ===================== DIALOG DE DETALHES =====================
  let lastTrigger = null;

  function renderQuantityUI(product) {
    const min = getQuantityMin(product);
    const max = getQuantityMax(product);
    els.qtyValue.textContent = String(state.quantity);
    els.qtyMinus.disabled = state.quantity <= min;
    els.qtyPlus.disabled = max !== null && state.quantity >= max;

    const effectivePrice = getEffectivePrice(product);
    const effectivePriceText = formatPrice(effectivePrice);
    if (effectivePriceText) {
      const total = effectivePrice * state.quantity;
      clearChildren(els.qtyTotalRow);
      const line = document.createElement('p');
      line.className = 'qty-line';
      line.textContent = `${effectivePriceText} × ${state.quantity}`;
      const totalLine = document.createElement('p');
      totalLine.className = 'qty-total';
      const totalLabel = document.createElement('span');
      totalLabel.textContent = 'Total';
      const totalValue = document.createElement('strong');
      totalValue.textContent = formatPrice(total) || '';
      totalLine.appendChild(totalLabel);
      totalLine.appendChild(totalValue);
      els.qtyTotalRow.appendChild(line);
      els.qtyTotalRow.appendChild(totalLine);
      els.qtyTotalRow.hidden = false;
    } else {
      clearChildren(els.qtyTotalRow);
      els.qtyTotalRow.hidden = true;
    }
  }

  function renderProductDetails(product) {
    els.dialogTitle.textContent = product.name;
    renderProductImage(els.dialogImageWrap, product);

    const category = getCategoryById(product.categoryId);
    setFieldText(els.dialogCategory, category ? category.name : null);
    setFieldText(els.dialogDesc, product.description || product.shortDescription || null);

    setFieldText(els.dialogMeta, getWeightUnitLabel(product, ' — '));

    els.dialogCustomizable.hidden = product.customizable !== true;
    setFieldText(els.dialogProductionTime, product.productionTime);

    clearChildren(els.dialogPriceRow);
    const hasPrice = appendPriceMarkup(els.dialogPriceRow, product, {
      price: 'dialog-price',
      strike: 'dialog-price-strike',
      promo: 'dialog-price-promo',
    });
    els.dialogPriceRow.hidden = !hasPrice;

    state.quantity = getQuantityMin(product);
    els.qtyRow.hidden = false;
    renderQuantityUI(product);

    // "Adicionar ao carrinho" só aparece quando o produto é utilizável
    // pelo carrinho (window.AmanteigadosCatalog.isUsableProduct) — nunca
    // inventa "Consultar preço"/"Sob orçamento" para o caso contrário
    // (docs/cart-spec.md, seção 10/24). "Ver carrinho" é só navegação e
    // permanece sempre disponível.
    if (els.addToCartBtn) {
      els.addToCartBtn.hidden = !window.AmanteigadosCatalog.isUsableProduct(product);
    }
    if (els.cartToast) {
      els.cartToast.hidden = true;
      els.cartToast.classList.remove('visible');
    }
  }

  function openProductDetails(product, triggerEl) {
    state.selectedProductId = product.id;
    lastTrigger = triggerEl || document.activeElement;
    renderProductDetails(product);
    if (typeof els.dialog.showModal === 'function') {
      els.dialog.showModal();
    } else {
      els.dialog.setAttribute('open', '');
    }
    els.dialogClose.focus();
  }

  function closeProductDetails() {
    if (typeof els.dialog.close === 'function' && els.dialog.open) {
      els.dialog.close();
    } else {
      els.dialog.removeAttribute('open');
    }
  }

  els.dialog.addEventListener('close', () => {
    state.selectedProductId = null;
    state.quantity = 1;
    if (lastTrigger && typeof lastTrigger.focus === 'function') lastTrigger.focus();
    lastTrigger = null;
  });

  // Fecha ao clicar no backdrop (fora do painel de conteúdo)
  els.dialog.addEventListener('click', (e) => {
    if (e.target === els.dialog) closeProductDetails();
  });

  els.dialogClose.addEventListener('click', () => closeProductDetails());

  // showModal() torna o restante da página inert (não clicável/focável),
  // mas o Tab a partir do último controle nem sempre volta a ciclar dentro
  // do dialog nesta engine — reforça manualmente só esse ciclo (ESC e o
  // resto do comportamento continuam 100% nativos).
  els.dialog.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const focusable = Array.from(
      els.dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ).filter((el) => !el.disabled && el.getClientRects().length > 0);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  els.qtyMinus.addEventListener('click', () => {
    const product = getActiveProducts().find((p) => p.id === state.selectedProductId);
    if (!product) return;
    state.quantity = clampQuantity(product, state.quantity - getQuantityStep(product));
    renderQuantityUI(product);
  });

  els.qtyPlus.addEventListener('click', () => {
    const product = getActiveProducts().find((p) => p.id === state.selectedProductId);
    if (!product) return;
    state.quantity = clampQuantity(product, state.quantity + getQuantityStep(product));
    renderQuantityUI(product);
  });

  // ===================== ADICIONAR AO CARRINHO =====================
  // Usa product.id + state.quantity atuais; nunca toca sessionStorage
  // diretamente — toda interação passa por window.AmanteigadosCart.
  // Dialog permanece aberto após adicionar (seção 25 do prompt) — o
  // visitante decide entre continuar escolhendo ou "Ver carrinho".
  els.addToCartBtn?.addEventListener('click', () => {
    const product = getActiveProducts().find((p) => p.id === state.selectedProductId);
    if (!product) return;
    if (!window.AmanteigadosCatalog.isUsableProduct(product)) return;

    const result = window.AmanteigadosCart.addItem(product.id, state.quantity);
    updateCartBadges();

    if (result.ok) {
      const message = 'Produto adicionado ao carrinho.';
      announceCartMessage(message);
      showCartToast(message);
    } else {
      // Nunca expõe o "reason" técnico (invalid-product/invalid-quantity)
      // na interface — apenas uma mensagem humana genérica.
      const message = 'Não foi possível adicionar este item ao carrinho.';
      announceCartMessage(message);
      showCartToast(message);
    }
  });

  // ===================== URL (?q= e ?categoria=) =====================
  function syncFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    if (q) {
      state.query = q;
      els.searchInput.value = q;
      updateClearButton();
    }
    const categoria = params.get('categoria');
    if (categoria) {
      const match = getAvailableCategories().find((c) => c.slug === categoria || c.id === categoria);
      if (match) state.category = match.id;
    }
  }

  // ===================== INICIALIZAÇÃO =====================
  syncFromUrl();
  renderCategories();
  renderCatalog();
}
