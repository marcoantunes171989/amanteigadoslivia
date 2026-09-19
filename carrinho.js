// ===================== CARRINHO — UI (FASE 4A.2) =====================
// Responsável exclusivamente pela interface de /carrinho. Consome
// window.AmanteigadosCatalog (catalog-core.js) e window.AmanteigadosCart
// (cart.js) — nunca reimplementa preço/promoção/quantidade e nunca toca
// sessionStorage diretamente. Contrato completo em docs/cart-spec.md.
//
// Ainda sem checkout: nesta fase o carrinho é puramente demonstrativo —
// sem dados pessoais, entrega, retirada, pagamento ou pedido real.
(function () {
  const Catalog = window.AmanteigadosCatalog;
  const Cart = window.AmanteigadosCart;

  const els = {
    demoNotice: document.getElementById('cartDemoNotice'),
    unavailableState: document.getElementById('cartUnavailableState'),
    emptyState: document.getElementById('cartEmptyState'),
    emptyTitle: document.getElementById('cartEmptyTitle'),
    layout: document.getElementById('cartLayout'),
    itemsList: document.getElementById('cartItemsList'),
    subtotalValue: document.getElementById('cartSubtotalValue'),
    clearBtn: document.getElementById('clearCartBtn'),
    liveRegion: document.getElementById('cartLiveRegion'),
  };

  if (!els.itemsList) {
    // Defensivo, mesmo padrão de produtos.js — sai cedo se a estrutura
    // esperada da página não existir.
    return;
  }

  // ===================== HELPERS DE RENDERIZAÇÃO SEGURA =====================
  // Nunca innerHTML com dados de produto/storage — sempre DOM API (mesmo
  // padrão de segurança já em uso em produtos.js desde a Fase 3).
  function clearChildren(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
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
    // Ilustração demonstrativa nunca é descrita como se fosse fotografia
    // real do produto — mesmo padrão de /produtos (Fase 3.3).
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

  // Combina peso e unidade sem duplicar nem inventar dado ausente (mesma
  // lógica de produtos.js — pequena duplicação aceita conforme
  // docs/cart-spec.md, seção 78: não extrair UI compartilhada nesta fase).
  function getWeightUnitLabel(product, separator) {
    const parts = [];
    if (product.weight) parts.push(product.weight);
    if (product.unit) parts.push(product.unit);
    return parts.length ? parts.join(separator) : null;
  }

  // Preço/promoção: a REGRA de validade (promotionalPrice < price) mora
  // exclusivamente em Catalog.getEffectivePrice() — aqui só inferimos
  // visualmente se há promoção comparando o effectivePrice já resolvido
  // pelo core contra product.price, nunca reimplementando a comparação
  // (docs/cart-spec.md, seção 11/42-43).
  function appendPriceMarkup(container, product, effectivePrice) {
    const hasBase = Catalog.isValidPrice(product.price);
    const hasPromo = hasBase && effectivePrice !== product.price;
    if (hasPromo) {
      const baseEl = document.createElement('span');
      baseEl.className = 'cart-item-price-strike';
      baseEl.textContent = Catalog.formatPrice(product.price);
      container.appendChild(baseEl);
    }
    const priceEl = document.createElement('span');
    priceEl.className = hasPromo ? 'cart-item-price-promo' : 'cart-item-price';
    priceEl.textContent = Catalog.formatPrice(effectivePrice);
    container.appendChild(priceEl);
  }

  function getCategoryName(product) {
    if (!product.categoryId) return null;
    const category = Catalog.getCategories().find((c) => c && c.id === product.categoryId && c.active === true);
    return category ? category.name : null;
  }

  // ===================== BADGE (mesmo padrão de produtos.js) =====================
  function updateCartBadges() {
    const count = Cart.getCartCount();
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

  function announce(message) {
    if (!els.liveRegion) return;
    els.liveRegion.textContent = '';
    window.setTimeout(() => {
      els.liveRegion.textContent = message;
    }, 30);
  }

  // ===================== ITEM DO CARRINHO =====================
  function createCartItemEl(item) {
    const { productId, quantity, product, effectivePrice, subtotal } = item;

    const article = document.createElement('article');
    article.className = 'cart-item';

    const imgWrap = document.createElement('div');
    imgWrap.className = 'cart-item-image';
    renderProductImage(imgWrap, product);
    article.appendChild(imgWrap);

    const body = document.createElement('div');
    body.className = 'cart-item-body';

    const categoryName = getCategoryName(product);
    if (categoryName) {
      const catEl = document.createElement('p');
      catEl.className = 'cart-item-category';
      catEl.textContent = categoryName;
      body.appendChild(catEl);
    }

    const nameEl = document.createElement('h3');
    nameEl.className = 'cart-item-name';
    nameEl.textContent = product.name;
    body.appendChild(nameEl);

    const weightUnit = getWeightUnitLabel(product, ' · ');
    if (weightUnit) {
      const weightEl = document.createElement('p');
      weightEl.className = 'cart-item-weight';
      weightEl.textContent = weightUnit;
      body.appendChild(weightEl);
    }

    const pricingEl = document.createElement('div');
    pricingEl.className = 'cart-item-pricing';
    appendPriceMarkup(pricingEl, product, effectivePrice);
    body.appendChild(pricingEl);

    article.appendChild(body);

    const controls = document.createElement('div');
    controls.className = 'cart-item-controls';

    const min = Catalog.getQuantityMin(product);
    const step = Catalog.getQuantityStep(product);
    const max = Catalog.getQuantityMax(product);

    const stepper = document.createElement('div');
    stepper.className = 'qty-stepper';

    const minusBtn = document.createElement('button');
    minusBtn.type = 'button';
    minusBtn.className = 'qty-btn';
    minusBtn.textContent = '−';
    minusBtn.setAttribute('aria-label', `Diminuir quantidade de ${product.name}`);
    minusBtn.disabled = quantity <= min;
    minusBtn.addEventListener('click', () => {
      const candidate = quantity - step;
      if (candidate < min) return; // botão já fica disabled ao atingir min
      const result = Cart.updateItem(productId, candidate);
      if (result.ok) {
        updateCartBadges();
        renderCart();
        announce('Quantidade atualizada.');
      }
    });
    stepper.appendChild(minusBtn);

    const valueEl = document.createElement('span');
    valueEl.className = 'qty-value';
    valueEl.textContent = String(quantity);
    stepper.appendChild(valueEl);

    const plusBtn = document.createElement('button');
    plusBtn.type = 'button';
    plusBtn.className = 'qty-btn';
    plusBtn.textContent = '+';
    plusBtn.setAttribute('aria-label', `Aumentar quantidade de ${product.name}`);
    plusBtn.disabled = max !== null && quantity >= max;
    plusBtn.addEventListener('click', () => {
      const candidate = quantity + step;
      if (max !== null && candidate > max) return; // botão já fica disabled ao atingir max
      const result = Cart.updateItem(productId, candidate);
      if (result.ok) {
        updateCartBadges();
        renderCart();
        announce('Quantidade atualizada.');
      }
    });
    stepper.appendChild(plusBtn);

    controls.appendChild(stepper);

    const subtotalEl = document.createElement('p');
    subtotalEl.className = 'cart-item-subtotal';
    subtotalEl.textContent = Catalog.formatPrice(subtotal) || '';
    controls.appendChild(subtotalEl);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'cart-item-remove';
    removeBtn.setAttribute('aria-label', `Remover ${product.name} do carrinho`);
    removeBtn.textContent = 'Remover';
    removeBtn.addEventListener('click', () => {
      Cart.removeItem(productId);
      updateCartBadges();
      renderCart();
      announce('Produto removido do carrinho.');
    });
    controls.appendChild(removeBtn);

    article.appendChild(controls);
    return article;
  }

  // ===================== RENDER PRINCIPAL =====================
  function renderCart() {
    const items = Cart.getCartItems();

    if (items.length === 0) {
      els.emptyState.hidden = false;
      els.layout.hidden = true;
      clearChildren(els.itemsList);
      return;
    }

    els.emptyState.hidden = true;
    els.layout.hidden = false;

    clearChildren(els.itemsList);
    const frag = document.createDocumentFragment();
    items.forEach((item) => frag.appendChild(createCartItemEl(item)));
    els.itemsList.appendChild(frag);

    els.subtotalValue.textContent = Catalog.formatPrice(Cart.getCartSubtotal()) || Catalog.formatPrice(0);
  }

  // ===================== LIMPAR CARRINHO =====================
  // window.confirm() existe somente aqui — cart.js nunca confirma nada
  // sozinho (docs/cart-spec.md, seção 15/52).
  els.clearBtn?.addEventListener('click', () => {
    const confirmed = window.confirm('Deseja remover todos os itens do carrinho?');
    if (!confirmed) return;
    Cart.clearCart();
    updateCartBadges();
    renderCart();
    announce('Carrinho limpo.');
    // Evita foco perdido no body: o botão "Limpar carrinho" some do DOM
    // quando o estado vazio aparece — move o foco para o título do
    // estado vazio (tabindex="-1" no HTML).
    els.emptyTitle?.focus();
  });

  // ===================== INICIALIZAÇÃO =====================
  Cart.loadCart();
  updateCartBadges();

  async function bootCart() {
    try {
      await Catalog.loadFromApi();
    } catch {
      if (els.unavailableState) els.unavailableState.hidden = false;
      if (els.emptyState) els.emptyState.hidden = true;
      if (els.layout) els.layout.hidden = true;
      return;
    }
    if (els.demoNotice) {
      els.demoNotice.hidden = Catalog.getMode() !== 'demo';
    }
    renderCart();
  }

  bootCart();
})();
