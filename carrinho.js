// ===================== CARRINHO — UI (FASE 4A.2) =====================
// Responsável exclusivamente pela interface de /carrinho. Consome
// window.AmanteigadosCatalog (catalog-core.js) e window.AmanteigadosCart
// (cart.js) — nunca reimplementa preço/promoção/quantidade e nunca toca
// sessionStorage diretamente. Contrato completo em docs/cart-spec.md.
//
// Checkout (V10): Nome e Telefone obrigatórios; o botão principal valida,
// registra o pedido em /api/vendas e só então abre o WhatsApp comercial
// (fluxo em cart-checkout.js). Sem pagamento/entrega nesta fase.
import { applyPhoneMaskEdit } from './ui-core.js';
import { openWhatsAppUrl, runCartCheckout } from './cart-checkout.js';

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
    checkoutBtn: document.getElementById('checkoutBtn'),
    checkoutForm: document.getElementById('checkoutForm'),
    checkoutName: document.getElementById('checkoutName'),
    checkoutPhone: document.getElementById('checkoutPhone'),
    checkoutNameError: document.getElementById('checkoutNameError'),
    checkoutPhoneError: document.getElementById('checkoutPhoneError'),
    checkoutMessage: document.getElementById('checkoutMessage'),
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
    if (item.priceChanged) {
      const warn = document.createElement('p');
      warn.className = 'cart-price-updated';
      warn.textContent = 'O preço deste item foi atualizado.';
      body.appendChild(warn);
    }

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

  // Mesma compra + mesmo cliente = mesma chave (clique duplo / reabrir o
  // WhatsApp não cria outra venda). Cliente diferente = venda diferente.
  function cartIdempotencyKey({ nome, telefone }) {
    const items = Cart.getCartItems().map((item) => `${item.productId}:${item.quantity}`).join('|');
    const storageKey = 'amanteigadosLivia.orderKey.' + items + '|' + nome.toLowerCase() + '|' + telefone;
    try {
      const existing = sessionStorage.getItem(storageKey);
      if (existing) return existing;
      const created = crypto.randomUUID();
      sessionStorage.setItem(storageKey, created);
      return created;
    } catch {
      return crypto.randomUUID();
    }
  }

  // ===================== CAMPOS OBRIGATÓRIOS (erro inline acessível) =====================
  const fieldRefs = {
    nome: { input: els.checkoutName, error: els.checkoutNameError },
    telefone: { input: els.checkoutPhone, error: els.checkoutPhoneError },
  };

  function setFieldError(name, message) {
    const { input, error } = fieldRefs[name] || {};
    if (!input || !error) return;
    if (message) {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', error.id);
      error.textContent = message;
      error.hidden = false;
    } else {
      input.removeAttribute('aria-invalid');
      input.removeAttribute('aria-describedby');
      error.textContent = '';
      error.hidden = true;
    }
  }

  function clearFieldErrors() {
    setFieldError('nome', '');
    setFieldError('telefone', '');
  }

  function showCheckoutMessage(message, { error = false } = {}) {
    if (!els.checkoutMessage) return;
    els.checkoutMessage.classList.toggle('is-error', error);
    els.checkoutMessage.setAttribute('role', error ? 'alert' : 'status');
    els.checkoutMessage.textContent = message;
    els.checkoutMessage.hidden = false;
  }

  function hideCheckoutMessage() {
    if (!els.checkoutMessage) return;
    els.checkoutMessage.hidden = true;
    els.checkoutMessage.textContent = '';
  }

  // Ao corrigir, o erro do campo some sem esperar novo clique.
  els.checkoutName?.addEventListener('input', () => {
    if (els.checkoutName.getAttribute('aria-invalid') === 'true'
      && els.checkoutName.value.trim().length >= 2) {
      setFieldError('nome', '');
    }
  });

  let lastPhoneValue = '';
  els.checkoutPhone?.addEventListener('input', (event) => {
    const input = els.checkoutPhone;
    const edit = applyPhoneMaskEdit({
      previous: lastPhoneValue,
      next: input.value,
      caret: input.selectionStart,
      inputType: event.inputType || '',
    });
    input.value = edit.value;
    lastPhoneValue = edit.value;
    try {
      input.setSelectionRange(edit.caret, edit.caret);
    } catch {
      // alguns tipos de input não expõem seleção
    }
    if (input.getAttribute('aria-invalid') === 'true'
      && (edit.value.replace(/D/g, '').length === 10 || edit.value.replace(/D/g, '').length === 11)) {
      setFieldError('telefone', '');
    }
  });

  function readCommercialPhone() {
    return window.AmanteigadosWhatsApp?.phone
      || window.AmanteigadosSite?.get?.()?.configuracao?.whatsapp_telefone;
  }

  async function postVenda(payload) {
    const response = await fetch('/api/vendas', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => null);
    return { ok: response.ok, status: response.status, data };
  }

  let checkoutBusy = false;

  // Único CTA: valida → registra → abre o WhatsApp. O listener é do submit do
  // formulário (clique no botão e Enter nos campos passam pelo mesmo caminho).
  async function handleCheckout(event) {
    event.preventDefault();
    if (checkoutBusy) return;
    checkoutBusy = true;
    const button = els.checkoutBtn;
    const idleLabel = button?.textContent || 'Finalizar pelo WhatsApp';
    hideCheckoutMessage();
    clearFieldErrors();
    if (button) {
      button.disabled = true;
      button.textContent = 'Enviando...';
    }
    announce('Enviando...');
    try {
      const result = await runCartCheckout({
        fields: { nome: els.checkoutName?.value, telefone: els.checkoutPhone?.value },
        items: Cart.getCartItems(),
        idempotencyKey: cartIdempotencyKey,
        readPhone: readCommercialPhone,
        refreshPhone: () => window.AmanteigadosSite?.loadFromApi?.(),
        postVenda,
        openWhatsApp: (url) => openWhatsAppUrl(url, {
          win: window,
          userAgent: navigator.userAgent,
        }),
      });
      if (result.ok) {
        showCheckoutMessage(result.message);
        announce(result.message);
        return;
      }
      if (result.code === 'empty') return;
      if (result.code === 'validation') {
        Object.entries(result.errors).forEach(([name, message]) => setFieldError(name, message));
        const first = result.errors.nome ? els.checkoutName : els.checkoutPhone;
        first?.focus();
        announce(Object.values(result.errors)[0]);
        return;
      }
      if (result.field && fieldRefs[result.field]) {
        setFieldError(result.field, result.message);
        fieldRefs[result.field].input?.focus();
      } else {
        showCheckoutMessage(result.message, { error: true });
      }
      announce(result.message);
    } finally {
      checkoutBusy = false;
      if (button) {
        button.disabled = false;
        button.textContent = idleLabel;
      }
    }
  }

  els.checkoutForm?.addEventListener('submit', handleCheckout);

  // ===================== INICIALIZAÇÃO =====================
  Cart.loadCart();
  updateCartBadges();
  Catalog.hydrateFromCache?.();
  renderCart();

  async function bootCart() {
    try {
      await Catalog.loadFromApi();
    } catch {
      if (!Catalog.getProducts()?.length && !Cart.getCartItems().length) {
        if (els.unavailableState) els.unavailableState.hidden = false;
        if (els.emptyState) els.emptyState.hidden = true;
        if (els.layout) els.layout.hidden = true;
        return;
      }
    }
    if (els.demoNotice) {
      els.demoNotice.hidden = Catalog.getMode() !== 'demo';
    }
    renderCart();
  }

  bootCart();

  window.addEventListener('amanteigados:catalogo-atualizado', () => {
    renderCart();
    updateCartBadges();
  });
  window.addEventListener('amanteigados:carrinho-atualizado', () => {
    updateCartBadges();
  });
})();
