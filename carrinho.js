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
    if (venda?.numero_pedido != null) {
      return `#${String(venda.numero_pedido).padStart(6, '0')}`;
    }
    if (venda?.id_venda) {
      return `#${String(venda.id_venda).replace(/-/g, '').slice(0, 6).toUpperCase()}`;
    }
    return null;
  }

  function buildWhatsAppMessage({ venda, items, total, nome, telefone, modalidade, endereco }) {
    const pedido = formatPedidoNumber(venda);
    const lines = [
      '*NOVO PEDIDO — AMANTEIGADOS LÍVIA*',
      '',
    ];
    if (pedido) lines.push(`Pedido: ${pedido}`);
    lines.push(`Cliente: ${nome}`);
    lines.push(`WhatsApp: ${telefone}`);
    lines.push('');
    lines.push('*PRODUTOS*');
    lines.push('');

    items.forEach((item) => {
      const name = item.product?.name || item.name || 'Produto';
      const weight = weightLabel(item.product) || item.product?.unit || '';
      const unit = Catalog.formatPrice(item.unitPrice) || '';
      const sub = Catalog.formatPrice(item.subtotal) || '';
      if (item.quantity === 1) {
        lines.push(`1x ${name}${weight ? ` — ${weight}` : ''}`);
        lines.push(`Valor: ${sub}`);
      } else {
        lines.push(`${item.quantity}x ${name}${weight ? ` — ${weight}` : ''}`);
        lines.push(`Valor unitário: ${unit}`);
        lines.push(`Subtotal: ${sub}`);
      }
      lines.push('');
    });

    lines.push(`*TOTAL DOS PRODUTOS: ${Catalog.formatPrice(total) || 'R$ 0,00'}*`);
    if (modalidade === 'entrega') {
      lines.push(`Entrega: A combinar${endereco ? ` — ${endereco}` : ''}`);
    } else {
      lines.push('Retirada');
    }
    lines.push('Aguardando confirmação do atendimento.');
    return lines.join('\n');
  }

  function shopWhatsAppPhone() {
    return window.AmanteigadosWhatsApp?.phone
      || window.AmanteigadosSite?.get?.()?.configuracao?.whatsapp_telefone
      || null;
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
    const nome = els.name?.value?.trim() || '';
    const telefone = els.phone?.value?.trim() || '';
    if (!nome) {
      showMessage('Informe seu nome.', 'error');
      els.name?.focus();
      return null;
    }
    const digits = telefone.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 13) {
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
    return { nome, telefone, modalidade, endereco };
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
        telefone_cliente: formData.telefone,
        modalidade: formData.modalidade,
        endereco_entrega: formData.endereco || null,
        itens: items.map((item) => ({
          id_produto: item.productId,
          quantidade: item.quantity,
        })),
      };

      const response = await fetch('/api/vendas', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.message || 'Não foi possível registrar o pedido.');
      }

      const total = Cart.getCartSubtotal();
      const message = buildWhatsAppMessage({
        venda: data?.venda,
        items,
        total,
        nome: formData.nome,
        telefone: formData.telefone,
        modalidade: formData.modalidade,
        endereco: formData.endereco,
      });

      const phone = shopWhatsAppPhone();
      if (!phone) {
        showMessage('Pedido registrado, mas o WhatsApp da loja ainda não está configurado no painel.', 'error');
        announce('Pedido registrado sem WhatsApp configurado.');
        return;
      }

      const url = `https://wa.me/${String(phone).replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
      lastWhatsAppUrl = url;
      els.submit.dataset.retry = '1';
      els.submit.innerHTML = '<svg width="18" height="18" aria-hidden="true"><use href="#i-whatsapp"/></svg> Abrir WhatsApp novamente';

      window.open(url, '_blank', 'noopener');
      showMessage(
        data?.duplicated
          ? 'Este pedido já havia sido registrado. O WhatsApp foi aberto novamente.'
          : 'Pedido registrado. Continue a conversa no WhatsApp — o envio não é automático.',
        'ok',
      );
      announce('Pedido registrado.');
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
