(function () {
  'use strict';

  const Track = window.AmanteigadosOrderTrack;
  const els = {
    form: document.getElementById('trackForm'),
    numero: document.getElementById('trackNumero'),
    phone: document.getElementById('trackPhone'),
    submit: document.getElementById('trackSubmit'),
    message: document.getElementById('trackMessage'),
    history: document.getElementById('trackHistory'),
    historyList: document.getElementById('trackHistoryList'),
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
  let lastQuery = { numero: '', telefone: '' };
  let lastPayload = null;

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

  function renderPedidoCard(entry) {
    const venda = entry?.venda;
    const info = entry?.acompanhamento;
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
  }

  function renderHistorico(payload, selectedNumero) {
    const pedidos = Array.isArray(payload?.pedidos) ? payload.pedidos : [];
    if (!els.history || !els.historyList) return;

    if (pedidos.length <= 1) {
      els.history.hidden = true;
      els.historyList.replaceChildren();
      return;
    }

    els.history.hidden = false;
    els.historyList.replaceChildren();
    pedidos.forEach((entry) => {
      const venda = entry.venda;
      const info = entry.acompanhamento;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'track-history__item';
      if (String(venda.numero_pedido) === String(selectedNumero)) {
        btn.classList.add('is-active');
      }
      btn.innerHTML = `
        <span class="track-history__pedido">Pedido Nº ${venda.numero_pedido}</span>
        <span class="track-history__meta">${info?.rotulo_status || venda.status_venda} · ${money(venda.valor_total_centavos)}</span>
      `;
      btn.addEventListener('click', () => {
        renderPedidoCard(entry);
        renderHistorico(payload, venda.numero_pedido);
        stopPoll();
        if (entry.acompanhamento?.ativo) {
          lastQuery = {
            numero: String(venda.numero_pedido),
            telefone: String(venda.telefone_cliente || lastQuery.telefone || '').replace(/\D/g, ''),
          };
          startPoll();
        }
      });
      els.historyList.appendChild(btn);
    });
  }

  function startPoll() {
    stopPoll();
    if (!lastQuery.numero && !lastQuery.telefone) return;
    pollTimer = setInterval(() => {
      consultar({
        numero: lastQuery.numero,
        telefone: lastQuery.telefone,
        silent: true,
        selectedNumero: lastQuery.numero,
      }).catch(() => {});
    }, 12000);
  }

  async function fetchPedidos({ numero, telefone }) {
    const params = new URLSearchParams();
    if (numero) params.set('numero', numero);
    if (telefone) params.set('telefone', telefone);
    const response = await fetch(`/api/pedido?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.message || 'Não foi possível consultar o pedido.');
    }
    return data;
  }

  async function consultar({ numero = '', telefone = '', silent = false, selectedNumero = '' } = {}) {
    if (!silent) showMessage('Consultando…', '');
    try {
      const data = await fetchPedidos({ numero, telefone });
      lastPayload = data;
      lastQuery = { numero, telefone };

      const pedidos = Array.isArray(data.pedidos) && data.pedidos.length
        ? data.pedidos
        : (data.venda ? [{ venda: data.venda, acompanhamento: data.acompanhamento }] : []);
      const selected = selectedNumero
        || (numero || String(data.venda?.numero_pedido || pedidos[0]?.venda?.numero_pedido || ''));
      const entry = pedidos.find((item) => String(item.venda?.numero_pedido) === String(selected))
        || pedidos[0]
        || { venda: data.venda, acompanhamento: data.acompanhamento };

      renderHistorico({ ...data, pedidos }, entry?.venda?.numero_pedido);
      renderPedidoCard(entry);
      showMessage(
        pedidos.length > 1
          ? `${pedidos.length} pedidos encontrados para este WhatsApp.`
          : '',
        'ok',
      );

      stopPoll();
      if (entry?.acompanhamento?.ativo) {
        lastQuery.numero = String(entry.venda.numero_pedido || numero || '');
        lastQuery.telefone = String(entry.venda.telefone_cliente || telefone || '').replace(/\D/g, '');
        startPoll();
      }
      return data;
    } catch (error) {
      if (!silent) {
        if (els.card) els.card.hidden = true;
        if (els.history) els.history.hidden = true;
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
    if (!numero && telefone.length < 10) {
      showMessage('Informe o número do pedido ou o WhatsApp da compra.', 'error');
      return;
    }
    if (telefone && telefone.length < 10) {
      showMessage('Informe um WhatsApp válido com DDD.', 'error');
      return;
    }
    consultar({ numero, telefone }).catch(() => {});
  });

  els.clear?.addEventListener('click', () => {
    Track?.clear();
    stopPoll();
    if (els.card) els.card.hidden = true;
    if (els.history) els.history.hidden = true;
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
    if (numero || (telefone && String(telefone).replace(/\D/g, '').length >= 10)) {
      consultar({
        numero: String(numero || '').replace(/\D/g, ''),
        telefone: String(telefone || '').replace(/\D/g, ''),
      }).catch(() => {});
    }
    Track?.syncUi?.();
  }

  boot();
  window.addEventListener('beforeunload', stopPoll);
})();
