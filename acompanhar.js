(function () {
  'use strict';

  const Track = window.AmanteigadosOrderTrack;
  const els = {
    form: document.getElementById('trackForm'),
    numero: document.getElementById('trackNumero'),
    phone: document.getElementById('trackPhone'),
    submit: document.getElementById('trackSubmit'),
    message: document.getElementById('trackMessage'),
    card: document.getElementById('trackCard'),
    status: document.getElementById('trackStatus'),
    numberValue: document.getElementById('trackNumberValue'),
    client: document.getElementById('trackClient'),
    items: document.getElementById('trackItems'),
    total: document.getElementById('trackTotal'),
    hint: document.getElementById('trackHint'),
    clear: document.getElementById('trackClear'),
  };

  let pollTimer = null;

  function money(centavos) {
    const value = Number(centavos || 0) / 100;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  }

  function maskWhatsApp(raw) {
    const digits = String(raw || '').replace(/\D/g, '').slice(0, 11);
    if (!digits) return '';
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 7) return `(${digits.slice(0, 2)})${digits.slice(2)}`;
    return `(${digits.slice(0, 2)})${digits.slice(2, 7)} - ${digits.slice(7)}`;
  }

  function showMessage(text, tone) {
    if (!els.message) return;
    els.message.hidden = !text;
    els.message.textContent = text || '';
    els.message.dataset.tone = tone || '';
  }

  function stopPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function renderPedido(payload) {
    const venda = payload?.venda;
    const info = payload?.acompanhamento;
    if (!venda || !els.card) return;

    els.card.hidden = false;
    els.status.textContent = info?.rotulo_status || venda.status_venda;
    els.status.dataset.status = venda.status_venda;
    els.numberValue.textContent = String(venda.numero_pedido ?? '—');
    els.client.textContent = venda.nome_cliente ? `Cliente: ${venda.nome_cliente}` : '';
    els.total.textContent = money(venda.valor_total_centavos);
    els.items.replaceChildren();
    (venda.itens || []).forEach((item) => {
      const li = document.createElement('li');
      li.textContent = `${item.quantidade}x ${item.nome_produto} — ${money(item.valor_total_centavos)}`;
      els.items.appendChild(li);
    });

    const finalizado = Boolean(info?.finalizado);
    els.hint.textContent = finalizado
      ? 'Pedido finalizado pelo estabelecimento.'
      : 'Atualizamos automaticamente até o estabelecimento finalizar.';
    if (els.clear) els.clear.hidden = false;

    Track?.write({
      id_venda: venda.id_venda,
      numero_pedido: venda.numero_pedido,
      telefone: venda.telefone_cliente,
      nome: venda.nome_cliente,
      status_venda: venda.status_venda,
    });

    if (finalizado) stopPoll();
  }

  async function fetchPedido(numero, telefone) {
    const url = `/api/pedido?numero=${encodeURIComponent(numero)}&telefone=${encodeURIComponent(telefone)}`;
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.message || 'Não foi possível consultar o pedido.');
    }
    return data;
  }

  async function consultar({ numero, telefone, silent = false }) {
    if (!silent) showMessage('Consultando pedido…', '');
    try {
      const data = await fetchPedido(numero, telefone);
      renderPedido(data);
      showMessage('', '');
      stopPoll();
      if (data?.acompanhamento?.ativo) {
        pollTimer = setInterval(() => {
          consultar({ numero, telefone, silent: true }).catch(() => {});
        }, 12000);
      }
      return data;
    } catch (error) {
      if (!silent) {
        els.card.hidden = true;
        showMessage(error.message || 'Pedido não encontrado.', 'error');
      }
      throw error;
    }
  }

  els.phone?.addEventListener('input', () => {
    els.phone.value = maskWhatsApp(els.phone.value);
  });

  els.numero?.addEventListener('input', () => {
    els.numero.value = String(els.numero.value || '').replace(/\D/g, '').slice(0, 12);
  });

  els.form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const numero = String(els.numero.value || '').replace(/\D/g, '');
    const telefone = String(els.phone.value || '').replace(/\D/g, '');
    if (!numero || telefone.length < 10) {
      showMessage('Informe o número do pedido e o WhatsApp usado na compra.', 'error');
      return;
    }
    consultar({ numero, telefone }).catch(() => {});
  });

  els.clear?.addEventListener('click', () => {
    Track?.clear();
    stopPoll();
    els.card.hidden = true;
    els.form?.reset();
    showMessage('Acompanhamento limpo neste aparelho.', 'ok');
  });

  function boot() {
    const params = new URLSearchParams(window.location.search);
    const saved = Track?.read?.();
    const numero = params.get('numero') || (saved?.numero_pedido != null ? String(saved.numero_pedido) : '');
    const telefone = params.get('telefone') || saved?.telefone || '';
    if (els.numero && numero) els.numero.value = String(numero).replace(/\D/g, '');
    if (els.phone && telefone) els.phone.value = maskWhatsApp(telefone);
    if (numero && telefone) {
      consultar({ numero, telefone }).catch(() => {});
    }
    Track?.syncUi?.();
  }

  boot();
  window.addEventListener('beforeunload', stopPoll);
})();
