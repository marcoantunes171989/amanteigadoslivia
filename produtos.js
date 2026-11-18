(function () {
  'use strict';

  const Catalog = window.AmanteigadosCatalog;
  const Cart = window.AmanteigadosCart;
  if (!Catalog || !Cart) return;

  const els = {
    shell: document.getElementById('appShell'),
    rail: document.getElementById('categoryRail'),
    sections: document.getElementById('catalogSections'),
    loading: document.getElementById('catalogLoading'),
    unavailable: document.getElementById('catalogUnavailable'),
    orderBar: document.getElementById('orderBar'),
    orderCount: document.getElementById('orderBarCount'),
    orderTotal: document.getElementById('orderBarTotal'),
    live: document.getElementById('liveRegion'),
    menuToggle: document.getElementById('menuToggle'),
    menuClose: document.getElementById('menuClose'),
    menuSheet: document.getElementById('menuSheet'),
    menuBackdrop: document.getElementById('menuBackdrop'),
  };

  let apiOnline = false;

  let selectedCategory = 'all';

  function announce(text) {
    if (els.live) els.live.textContent = text;
  }

  function isValidProduct(p) {
    return !!p
      && typeof p === 'object'
      && (typeof p.id === 'string' || typeof p.id === 'number')
      && typeof p.name === 'string'
      && p.name.trim() !== ''
      && p.active === true;
  }

  function getActiveProducts() {
    return (Catalog.getProducts() || []).filter(isValidProduct);
  }

  function getAvailableCategories() {
    const active = getActiveProducts();
    return (Catalog.getCategories() || [])
      .filter((c) => c && c.active === true)
      .filter((c) => active.some((p) => p.categoryId === c.id))
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  function weightLabel(product) {
    const parts = [];
    if (product.weight) parts.push(product.weight);
    if (product.unit) parts.push(product.unit);
    return parts.join(' ') || 'un';
  }

  function qtyInCart(productId) {
    const item = Cart.getCartItems().find((entry) => entry.productId === productId);
    return item ? item.quantity : 0;
  }

  function setQuantity(product, nextQty) {
    const current = qtyInCart(product.id);
    if (nextQty <= 0) {
      if (current > 0) Cart.removeItem(product.id);
      announce(`${product.name} removido`);
      return;
    }
    const clamped = Catalog.clampQuantity(product, nextQty);
    if (current === 0) {
      Cart.addItem(product.id, clamped);
    } else {
      Cart.updateItem(product.id, clamped);
    }
    announce(`${product.name}: ${clamped}`);
  }

  function createQtyControl(product) {
    const qty = qtyInCart(product.id);
    if (qty <= 0) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'qty-add';
      btn.setAttribute('aria-label', `Adicionar ${product.name}`);
      btn.textContent = '+';
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        setQuantity(product, Catalog.getQuantityMin(product));
        renderAll();
      });
      return btn;
    }

    const wrap = document.createElement('div');
    wrap.className = 'qty-ctrl';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', `Quantidade de ${product.name}`);

    const minus = document.createElement('button');
    minus.type = 'button';
    minus.className = 'is-minus';
    minus.setAttribute('aria-label', 'Diminuir');
    minus.textContent = '−';
    minus.addEventListener('click', () => {
      setQuantity(product, qty - Catalog.getQuantityStep(product));
      renderAll();
    });

    const value = document.createElement('span');
    value.textContent = String(qty);

    const plus = document.createElement('button');
    plus.type = 'button';
    plus.setAttribute('aria-label', 'Aumentar');
    plus.textContent = '+';
    plus.addEventListener('click', () => {
      const max = Catalog.getQuantityMax(product);
      const step = Catalog.getQuantityStep(product);
      const next = qty + step;
      if (max !== null && next > max) return;
      setQuantity(product, next);
      renderAll();
    });

    wrap.append(minus, value, plus);
    return wrap;
  }

  function createProductCard(product) {
    const article = document.createElement('article');
    article.className = 'product-card';
    article.dataset.productId = String(product.id);

    const media = document.createElement('div');
    media.className = 'product-card__media';
    const img = document.createElement('img');
    img.src = product.image || 'assets/demo-products/tradicional.svg';
    img.alt = product.name;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.width = 160;
    img.height = 160;
    img.sizes = '(min-width: 1024px) 176px, (min-width: 600px) 144px, 30vw';
    media.appendChild(img);

    const name = document.createElement('h3');
    name.className = 'product-card__name';
    name.textContent = product.name;

    const meta = document.createElement('p');
    meta.className = 'product-card__meta';
    meta.textContent = weightLabel(product);

    const row = document.createElement('div');
    row.className = 'product-card__row';
    const price = document.createElement('p');
    price.className = 'product-card__price';
    const effective = Catalog.getEffectivePrice(product);
    price.textContent = Catalog.formatPrice(effective) || '—';
    row.append(price, createQtyControl(product));

    article.append(media, name, meta, row);
    return article;
  }

  function createRail(products) {
    const rail = document.createElement('div');
    rail.className = 'product-rail';
    rail.setAttribute('tabindex', '0');
    rail.setAttribute('role', 'list');
    products.forEach((product) => {
      const card = createProductCard(product);
      card.setAttribute('role', 'listitem');
      rail.appendChild(card);
    });
    return rail;
  }

  function createSection(title, products, options = {}) {
    if (!products.length) return null;
    const section = document.createElement('section');
    section.className = 'section-block';
    if (options.id) section.id = options.id;

    const head = document.createElement('div');
    head.className = 'section-head';
    const h2 = document.createElement('h2');
    h2.textContent = title;
    head.appendChild(h2);

    if (options.onSeeAll) {
      const seeAll = document.createElement('button');
      seeAll.type = 'button';
      seeAll.className = 'linkish';
      seeAll.textContent = 'Ver todos ›';
      seeAll.addEventListener('click', options.onSeeAll);
      head.appendChild(seeAll);
    }

    section.append(head, createRail(products));
    return section;
  }

  function renderCategories() {
    const categories = getAvailableCategories();
    els.rail.replaceChildren();

    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.className = 'cat-chip';
    allBtn.setAttribute('aria-pressed', selectedCategory === 'all' ? 'true' : 'false');
    allBtn.innerHTML = '<svg class="cat-chip__ico" aria-hidden="true"><use href="#i-cookie"/></svg>Todos';
    allBtn.addEventListener('click', () => {
      selectedCategory = 'all';
      renderAll();
    });
    els.rail.appendChild(allBtn);

    categories.forEach((category) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cat-chip';
      btn.setAttribute('aria-pressed', selectedCategory === category.id ? 'true' : 'false');
      btn.textContent = category.name;
      btn.addEventListener('click', () => {
        selectedCategory = category.id;
        renderAll();
        const target = document.getElementById(`section-${category.id}`);
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      els.rail.appendChild(btn);
    });
  }

  function featuredProducts(products) {
    return products
      .filter((p) => p.featured === true || p.destaque === true)
      .concat(products)
      .filter((p, index, list) => list.findIndex((item) => item.id === p.id) === index)
      .slice(0, 8);
  }

  function renderSections() {
    const products = getActiveProducts().slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const categories = getAvailableCategories();
    els.sections.replaceChildren();

    if (!products.length) {
      els.sections.hidden = true;
      els.unavailable.hidden = false;
      els.unavailable.querySelector('h2').textContent = 'Nenhum produto disponível';
      els.unavailable.querySelector('p').textContent = 'Volte em breve — o cardápio está sendo atualizado.';
      return;
    }

    els.unavailable.hidden = true;
    els.sections.hidden = false;

    const frag = document.createDocumentFragment();

    if (selectedCategory === 'all') {
      const featured = createSection('Mais Pedidos', featuredProducts(products));
      if (featured) frag.appendChild(featured);

      categories.forEach((category) => {
        const list = products.filter((p) => p.categoryId === category.id);
        const section = createSection(category.name, list, {
          id: `section-${category.id}`,
          onSeeAll: () => {
            selectedCategory = category.id;
            renderAll();
          },
        });
        if (section) frag.appendChild(section);
      });
    } else {
      const category = categories.find((c) => c.id === selectedCategory);
      const list = products.filter((p) => p.categoryId === selectedCategory);
      const section = createSection(category?.name || 'Produtos', list, {
        id: `section-${selectedCategory}`,
      });
      if (section) frag.appendChild(section);
    }

    els.sections.appendChild(frag);
  }

  function renderOrderBar() {
    const count = Cart.getCartCount();
    const total = Cart.getCartSubtotal();
    if (count <= 0) {
      els.orderBar.hidden = true;
      els.shell.classList.add('is-empty-cart');
      return;
    }
    els.shell.classList.remove('is-empty-cart');
    els.orderBar.hidden = false;
    els.orderCount.textContent = count === 1 ? '1 item' : `${count} itens`;
    els.orderTotal.textContent = Catalog.formatPrice(total) || 'R$ 0,00';
  }

  function renderAll() {
    renderCategories();
    renderSections();
    renderOrderBar();
  }

  function syncShopWhatsAppLink() {
    const phone = String(
      window.AmanteigadosStorefrontConfig?.whatsappPhone
      || window.AmanteigadosWhatsApp?.phone
      || '5518981465499',
    ).replace(/\D/g, '');
    document.querySelectorAll('[data-wa-shop]').forEach((link) => {
      link.href = `https://wa.me/${phone}`;
    });
  }

  function bindMenu() {
    const open = () => {
      if (!els.menuSheet) return;
      els.menuSheet.hidden = false;
      els.menuBackdrop.hidden = false;
      document.body.classList.add('menu-open');
      els.menuToggle?.setAttribute('aria-expanded', 'true');
      requestAnimationFrame(() => els.menuSheet.classList.add('is-open'));
    };
    const close = () => {
      if (!els.menuSheet) return;
      els.menuSheet.classList.remove('is-open');
      document.body.classList.remove('menu-open');
      els.menuToggle?.setAttribute('aria-expanded', 'false');
      window.setTimeout(() => {
        els.menuSheet.hidden = true;
        if (els.menuBackdrop) els.menuBackdrop.hidden = true;
      }, 180);
    };
    els.menuToggle?.addEventListener('click', () => {
      if (els.menuSheet.hidden) open();
      else close();
    });
    els.menuClose?.addEventListener('click', close);
    els.menuBackdrop?.addEventListener('click', close);
    els.menuSheet?.querySelectorAll('a').forEach((link) => link.addEventListener('click', close));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !els.menuSheet?.hidden) close();
    });
    syncShopWhatsAppLink();
  }

  async function boot() {
    bindMenu();
    Cart.loadCart();
    Catalog.hydrateFromCache?.();
    // Só pinta cedo com cache live da própria loja — nunca o demo Amanteigados.
    if (Catalog.getMode() === 'live' && Catalog.getProducts()?.length) {
      els.loading.hidden = true;
      els.unavailable.hidden = true;
      renderAll();
    }

    try {
      await Catalog.loadFromApi();
      apiOnline = Catalog.getMode() === 'live';
      els.loading.hidden = true;
      els.unavailable.hidden = true;
      renderAll();
    } catch {
      apiOnline = false;
      els.loading.hidden = true;
      if (Catalog.getMode() === 'live' && Catalog.getProducts()?.length) {
        els.unavailable.hidden = true;
        renderAll();
      } else {
        els.unavailable.hidden = false;
        els.sections.hidden = true;
      }
    }
  }

  window.addEventListener('amanteigados:catalogo-atualizado', renderAll);
  window.addEventListener('amanteigados:carrinho-atualizado', () => {
    renderOrderBar();
    // Atualiza controles de quantidade sem perder scroll das rails
    document.querySelectorAll('.product-card').forEach((card) => {
      const id = card.dataset.productId;
      const product = Catalog.getProductById(id) || Catalog.getProductById(Number(id));
      if (!product) return;
      const row = card.querySelector('.product-card__row');
      if (!row) return;
      const price = row.querySelector('.product-card__price');
      row.replaceChildren(price, createQtyControl(product));
    });
  });

  boot();
})();
