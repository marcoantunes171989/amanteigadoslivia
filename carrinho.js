(function () {
  'use strict';

  const Catalog = window.AmanteigadosCatalog;
  const Cart = window.AmanteigadosCart;
  if (!Catalog || !Cart) return;

  const els = {
    title: document.getElementById('pedidoTitle'),
    unavailable: document.getElementById('cartUnavailableState'),
    empty: document.getElementById('cartEmptyState'),
    layout: document.getElementById('cartLayout'),
    list: document.getElementById('cartItemsList'),
    subtotalLabel: document.getElementById('subtotalLabel'),
    subtotal: document.getElementById('cartSubtotalValue'),
    total: document.getElementById('cartTotalValue'),
    form: document.getElementById('checkoutForm'),
    name: document.getElementById('checkoutName'),
    phone: document.getElementById('checkoutPhone'),
    modality: document.getElementById('checkoutModality'),
    addressField: document.getElementById('addressField'),
    address: document.getElementById('checkoutAddress'),
    submit: document.getElementById('checkoutBtn'),
    message: document.getElementById('checkoutMessage'),
    live: document.getElementById('cartLiveRegion'),
  };

  let submitting = false;
  let lastWhatsAppUrl = null;

  function announce(text) {
    if (els.live) els.live.textContent = text;
  }

  function showMessage(text, tone) {
    if (!els.message) return;
    els.message.hidden = !text;
    els.message.textContent = text || '';
    els.message.dataset.tone = tone || '';
  }

  function weightLabel(product) {
    if (!product) return '';
    const parts = [];
    if (product.weight) parts.push(product.weight);
    if (product.unit) parts.push(product.unit);
    return parts.join(' ');
  }

  function formatPedidoNumber(venda) {
    if (venda?.numero_pedido != null && Number.isFinite(Number(venda.numero_pedido))) {
      return String(Number(venda.numero_pedido));
    }
    return null;
  }

  function statusPedidoUrl(venda, telefoneDigits) {
    const base = `${window.location.origin}/acompanhar`;
    const params = new URLSearchParams();
    const numero = formatPedidoNumber(venda);
    if (numero) params.set('numero', numero);
    let phone = String(telefoneDigits || venda?.telefone_cliente || '').replace(/\D/g, '');
    if (phone.startsWith('55') && phone.length >= 12) phone = phone.slice(2);
    if (phone) params.set('telefone', phone);
    const query = params.toString();
    return query ? `${base}?${query}` : base;
  }

  function buildWhatsAppMessage({ venda, items, total, nome, modalidade, endereco, telefoneDigits }) {
    const pedido = formatPedidoNumber(venda) || '—';
    const statusUrl = statusPedidoUrl(venda, telefoneDigits);
    const lines = [
      `🍪 *${window.AmanteigadosStorefrontTheme?.nomeExibicao || window.AmanteigadosStorefrontConfig?.nomeExibicao || 'Amanteigados Lívia'}*`,
      '',
      `Olá${nome ? `, *${nome}*` : ''}! Seu pedido está *EM PREPARAÇÃO!* ⏳`,
      '',
      `📦 *Pedido Nº ${pedido}*`,
      '',
      '🛒 *Itens:*',
    ];

    items.forEach((item) => {
      const name = item.product?.name || item.name || 'Produto';
      const weight = weightLabel(item.product) || item.product?.unit || '';
      const sub = Catalog.formatPrice(item.subtotal) || '';
      lines.push(`• ${item.quantity}x ${name}${weight ? ` (${weight})` : ''} — ${sub}`);
    });

    lines.push('');
    lines.push(`💰 *Total: ${Catalog.formatPrice(total) || 'R$ 0,00'}*`);
    if (modalidade === 'entrega') {
      lines.push(`🚚 Entrega: A combinar${endereco ? ` — ${endereco}` : ''}`);
    } else {
      lines.push('🏪 Retirada');
    }
    lines.push('');
    lines.push('🔗 *Status do pedido:*');
    lines.push(statusUrl);
    lines.push('');
    lines.push('🙏 Obrigado pela preferência, se precisar de algo é só chamar.');
    return lines.join('\n');
  }

  function toWhatsAppMePhone(digits) {
    const d = String(digits || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.startsWith('55')) return d;
    if (d.length === 10 || d.length === 11) return `55${d}`;
    return d;
  }

  function shopWhatsAppPhone() {
    const configured = window.AmanteigadosStorefrontTheme?.whatsappPhone
      || window.AmanteigadosStorefrontConfig?.whatsappPhone
      || window.AmanteigadosWhatsApp?.phone
      || window.AmanteigadosSite?.get?.()?.configuracao?.whatsapp_telefone
      || '5518981465499';
    return String(configured).replace(/\D/g, '') || '5518981465499';
  }

  function maskWhatsApp(raw) {
    const digits = String(raw || '').replace(/\D/g, '').slice(0, 11);
    if (!digits) return '';
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 7) return `(${digits.slice(0, 2)})${digits.slice(2)}`;
    return `(${digits.slice(0, 2)})${digits.slice(2, 7)} - ${digits.slice(7)}`;
  }

  function bindFieldMasks() {
    els.name?.addEventListener('input', () => {
      const start = els.name.selectionStart;
      const end = els.name.selectionEnd;
      els.name.value = String(els.name.value || '').toLocaleUpperCase('pt-BR');
      try { els.name.setSelectionRange(start, end); } catch { /* ignore */ }
    });

    els.phone?.addEventListener('input', () => {
      els.phone.value = maskWhatsApp(els.phone.value);
    });
  }

  function createQtyControl(item) {
    const product = item.product;
    const wrap = document.createElement('div');
    wrap.className = 'qty-ctrl';

    const minus = document.createElement('button');
    minus.type = 'button';
    minus.className = 'is-minus';
    minus.setAttribute('aria-label', `Diminuir ${item.name}`);
    minus.textContent = '−';
    minus.addEventListener('click', () => {
      const step = Catalog.getQuantityStep(product) || 1;
      const next = item.quantity - step;
      if (next <= 0) Cart.removeItem(item.productId);
      else Cart.updateItem(item.productId, next);
      renderCart();
    });

    const value = document.createElement('span');
    value.textContent = String(item.quantity);

    const plus = document.createElement('button');
    plus.type = 'button';
    plus.setAttribute('aria-label', `Aumentar ${item.name}`);
    plus.textContent = '+';
    plus.addEventListener('click', () => {
      const step = Catalog.getQuantityStep(product) || 1;
      const max = Catalog.getQuantityMax(product);
      const next = item.quantity + step;
      if (max !== null && next > max) return;
      Cart.updateItem(item.productId, next);
      renderCart();
    });

    wrap.append(minus, value, plus);
    return wrap;
  }

  function createCartItem(item) {
    const row = document.createElement('article');
    row.className = 'pedido-item';

    const media = document.createElement('div');
    media.className = 'pedido-item__media';
    const img = document.createElement('img');
    img.src = item.image || item.product?.image || 'assets/demo-products/tradicional.svg';
    img.alt = item.name;
    img.loading = 'lazy';
    media.appendChild(img);

    const info = document.createElement('div');
    const name = document.createElement('h2');
    name.className = 'pedido-item__name';
    name.textContent = item.name;
    const meta = document.createElement('p');
    meta.className = 'pedido-item__meta';
    meta.textContent = weightLabel(item.product) || 'un';
    const price = document.createElement('p');
    price.className = 'pedido-item__price';
    price.textContent = Catalog.formatPrice(item.unitPrice) || '—';
    info.append(name, meta, price);

    const actions = document.createElement('div');
    actions.className = 'pedido-item__actions';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'pedido-item__remove';
    remove.setAttribute('aria-label', `Remover ${item.name}`);
    remove.innerHTML = '<svg class="app-ico" aria-hidden="true"><use href="#i-trash"/></svg>';
    remove.addEventListener('click', () => {
      Cart.removeItem(item.productId);
      announce('Produto removido');
      renderCart();
    });
    actions.append(createQtyControl(item), remove);

    row.append(media, info, actions);
    return row;
  }

  function renderCart() {
    const items = Cart.getCartItems();
    const count = Cart.getCartCount();
    const total = Cart.getCartSubtotal();

    const titleText = els.title?.querySelector('span');
    if (titleText) {
      titleText.textContent = count > 0 ? `Meu Pedido (${count} ${count === 1 ? 'item' : 'itens'})` : 'Meu Pedido';
    }

    if (!items.length) {
      els.empty.hidden = false;
      els.layout.hidden = true;
      els.list.replaceChildren();
      return;
    }

    els.empty.hidden = true;
    els.layout.hidden = false;
    els.list.replaceChildren();
    const frag = document.createDocumentFragment();
    items.forEach((item) => frag.appendChild(createCartItem(item)));
    els.list.appendChild(frag);

    if (els.subtotalLabel) {
      els.subtotalLabel.textContent = `Subtotal (${count} ${count === 1 ? 'item' : 'itens'})`;
    }
    const money = Catalog.formatPrice(total) || 'R$ 0,00';
    if (els.subtotal) els.subtotal.textContent = money;
    if (els.total) els.total.textContent = money;
  }

  function cartIdempotencyKey() {
    const items = Cart.getCartItems().map((item) => `${item.productId}:${item.quantity}`).join('|');
    const storageKey = `amanteigadosLivia.orderKey.${items}`;
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

  function validateForm() {
    const nome = String(els.name?.value || '').trim().toLocaleUpperCase('pt-BR');
    const telefoneMasked = els.phone?.value?.trim() || '';
    if (!nome) {
      showMessage('Informe seu nome.', 'error');
      els.name?.focus();
      return null;
    }
    const digits = telefoneMasked.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 11) {
      showMessage('Informe um WhatsApp válido com DDD.', 'error');
      els.phone?.focus();
      return null;
    }
    const modalidade = els.modality?.value || 'retirada';
    const endereco = els.address?.value?.trim() || '';
    if (modalidade === 'entrega' && !endereco) {
      showMessage('Informe o endereço para entrega.', 'error');
      els.address?.focus();
      return null;
    }
    return { nome, telefone: telefoneMasked, telefoneDigits: digits, modalidade, endereco };
  }

  async function submitOrder(event) {
    event.preventDefault();
    if (submitting) return;

    const items = Cart.getCartItems();
    if (!items.length) return;

    const formData = validateForm();
    if (!formData) return;

    if (lastWhatsAppUrl && els.submit?.dataset.retry === '1') {
      window.open(lastWhatsAppUrl, '_blank', 'noopener');
      showMessage('Abrimos o WhatsApp novamente. Seu pedido já estava registrado.', 'ok');
      return;
    }

    submitting = true;
    els.submit.disabled = true;
    showMessage('Registrando pedido…', '');

    try {
      const payload = {
        chave_idempotencia: cartIdempotencyKey(),
        nome_cliente: formData.nome,
        telefone_cliente: formData.telefoneDigits,
        modalidade: formData.modalidade,
        endereco_entrega: formData.endereco || null,
        itens: items.map((item) => ({
          id_produto: item.productId,
          quantidade: item.quantity,
        })),
      };

      let data = null;
      let registered = false;
      try {
        const response = await fetch('/api/vendas', {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(data?.message || 'Não foi possível registrar o pedido no servidor.');
        }
        registered = true;
      } catch (serverError) {
        // Fallback de validação visual: abre WhatsApp sem numeração oficial quando a API/DB estiver fora.
        console.warn('[carrinho] registro no servidor indisponível', serverError);
        data = { venda: null, duplicated: false, degraded: true };
      }

      const total = Cart.getCartSubtotal();
      const message = buildWhatsAppMessage({
        venda: data?.venda,
        items,
        total,
        nome: formData.nome,
        modalidade: formData.modalidade,
        endereco: formData.endereco,
        telefoneDigits: formData.telefoneDigits,
      });

      // Mensagem de acompanhamento vai para o WhatsApp do cliente informado no formulário.
      const phone = toWhatsAppMePhone(formData.telefoneDigits) || shopWhatsAppPhone();
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
      lastWhatsAppUrl = url;

      if (data?.venda?.numero_pedido != null) {
        window.AmanteigadosOrderTrack?.write({
          id_venda: data.venda.id_venda,
          numero_pedido: data.venda.numero_pedido,
          telefone: formData.telefoneDigits,
          nome: formData.nome,
          status_venda: data.venda.status_venda || 'PENDENTE',
        });
      } else {
        window.AmanteigadosOrderTrack?.syncUi?.();
      }

      const opened = window.open(url, '_blank', 'noopener');

      Cart.clearCart();
      lastWhatsAppUrl = null;
      if (els.form) els.form.reset();
      if (els.addressField) els.addressField.hidden = true;
      renderCart();

      const numero = formatPedidoNumber(data?.venda);
      const okText = registered && numero
        ? `Pedido ${numero} registrado. Acompanhe em Acompanhar pedido.`
        : registered
          ? 'Pedido registrado. WhatsApp aberto e carrinho limpo.'
          : 'WhatsApp aberto com o pedido. Carrinho limpo.';
      const emptyCopy = els.empty?.querySelector('p');
      if (emptyCopy) {
        emptyCopy.textContent = okText;
        els.empty.querySelectorAll('a[data-track-cta]').forEach((node) => node.remove());
        if (numero) {
          const trackParams = new URLSearchParams({ numero });
          const phoneDigits = String(formData.telefoneDigits || '').replace(/\D/g, '');
          if (phoneDigits) trackParams.set('telefone', phoneDigits);
          const link = document.createElement('a');
          link.href = `/acompanhar?${trackParams.toString()}`;
          link.className = 'cat-chip empty-pedido__cta';
          link.dataset.trackCta = '1';
          link.textContent = 'Acompanhar pedido';
          emptyCopy.insertAdjacentElement('afterend', link);
        }
      }
      announce(okText);

      if (!opened) {
        window.location.href = url;
        return;
      }
    } catch (error) {
      lastWhatsAppUrl = null;
      showMessage(error.message || 'Não foi possível registrar o pedido. Seu carrinho foi mantido.', 'error');
    } finally {
      submitting = false;
      els.submit.disabled = false;
    }
  }

  els.modality?.addEventListener('change', () => {
    const delivery = els.modality.value === 'entrega';
    if (els.addressField) els.addressField.hidden = !delivery;
  });

  bindFieldMasks();
  els.form?.addEventListener('submit', submitOrder);

  Cart.loadCart();
  Catalog.hydrateFromCache?.();
  renderCart();

  async function boot() {
    try {
      await Catalog.loadFromApi();
      await window.AmanteigadosSite?.loadFromApi?.().catch(() => {});
    } catch {
      if (!Catalog.getProducts()?.length && !Cart.getCartItems().length) {
        els.unavailable.hidden = false;
        els.empty.hidden = true;
        els.layout.hidden = true;
        return;
      }
    }
    renderCart();
  }

  boot();

  window.addEventListener('amanteigados:catalogo-atualizado', renderCart);
  window.addEventListener('amanteigados:carrinho-atualizado', renderCart);
})();
