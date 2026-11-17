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
    historyTitle: document.querySelector('#trackHistory .track-history__title'),
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

  function toLocalPhoneDigits(raw) {
    let digits = String(raw || '').replace(/\D/g, '');
    if (digits.startsWith('55') && digits.length >= 12) {
      digits = digits.slice(2);
    }
    return digits.slice(0, 11);
  }

  function maskWhatsApp(raw) {
    const digits = toLocalPhoneDigits(raw);
    if (!digits) return '';
    if (digits.length <= 2) return `(${digits}`;
    if (digits.length <= 7) return `(${digits.slice(0, 2)})${digits.slice(2)}`;
    return `(${digits.slice(0, 2)})${digits.slice(2, 7)} - ${digits.slice(7)}`;
  }

  function fillLookupFields({ numero, telefone, clearNumero = false } = {}) {
    if (els.numero) {
      if (clearNumero) {
        els.numero.value = '';
      } else if (numero != null && numero !== '') {
        els.numero.value = String(numero).replace(/\D/g, '').slice(0, 12);
      }
    }
    if (els.phone && telefone) {
      els.phone.value = maskWhatsApp(telefone);
    }
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
    }
    pollTimer = null;
  }

  function renderPedidoCard(entry, { phoneOnly = false } = {}) {
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

    // Em busca só por telefone, mantém o campo número vazio para não misturar o filtro.
    fillLookupFields({
      numero: phoneOnly ? '' : venda.numero_pedido,
      telefone: venda.telefone_cliente,
      clearNumero: phoneOnly,
    });

    const finalizado = Boolean(info?.finalizado);
    els.hint.textContent = finalizado
      ? 'Pedido finalizado pelo estabelecimento.'
      : 'Atualizamos automaticamente até o estabelecimento finalizar.';
    if (els.clear) els.clear.hidden = false;

    Track?.write({
      id_venda: venda.id_venda,
      numero_pedido: venda.numero_pedido,
      telefone: toLocalPhoneDigits(venda.telefone_cliente),
      nome: venda.nome_cliente,
      status_venda: venda.status_venda,
    });
  }

  function pedidoInstant(venda) {
    const raw = venda?.data_venda || venda?.data_atualizacao;
    const date = raw ? new Date(raw) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
  }

  function saoPauloParts(date) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const get = (type) => parts.find((part) => part.type === type)?.value || '';
    return {
      year: get('year'),
      month: get('month'),
      day: get('day'),
      hour: get('hour'),
      minute: get('minute'),
    };
  }

  function dayKey(date) {
    if (!date) return 'sem-data';
    const { year, month, day } = saoPauloParts(date);
    return `${year}-${month}-${day}`;
  }

  function formatDayLabel(date) {
    if (!date) return 'Data não informada';
    const todayKey = dayKey(new Date());
    const key = dayKey(date);
    if (key === todayKey) return 'Hoje';
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (key === dayKey(yesterday)) return 'Ontem';
    const label = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(date);
    return label.replace(/^./u, (char) => char.toUpperCase());
  }

  function formatOrderTime(date) {
    if (!date) return '';
    const { hour, minute } = saoPauloParts(date);
    return `${hour}:${minute}`;
  }

  function groupPedidosByDay(pedidos) {
    const sorted = [...pedidos].sort((a, b) => {
      const dateA = pedidoInstant(a.venda)?.getTime() || 0;
      const dateB = pedidoInstant(b.venda)?.getTime() || 0;
      if (dateB !== dateA) return dateB - dateA;
      return Number(b.venda?.numero_pedido || 0) - Number(a.venda?.numero_pedido || 0);
    });

    const groups = [];
    const indexByKey = new Map();
    sorted.forEach((entry) => {
      const instant = pedidoInstant(entry.venda);
      const key = dayKey(instant);
      if (!indexByKey.has(key)) {
        indexByKey.set(key, groups.length);
        groups.push({ key, label: formatDayLabel(instant), items: [] });
      }
      groups[indexByKey.get(key)].items.push(entry);
    });
    return groups;
  }

  function renderHistorico(payload, selectedNumero, { phoneOnly = false } = {}) {
    const pedidos = Array.isArray(payload?.pedidos) ? payload.pedidos : [];
    if (!els.history || !els.historyList) return;

    if (!pedidos.length) {
      els.history.hidden = true;
      els.historyList.replaceChildren();
      return;
    }

    els.history.hidden = false;
    els.historyList.replaceChildren();

    if (els.historyTitle) {
      els.historyTitle.textContent = phoneOnly || pedidos.length > 1
        ? `Pedidos deste WhatsApp (${pedidos.length})`
        : 'Histórico de pedidos';
    }

    groupPedidosByDay(pedidos).forEach((group) => {
      const section = document.createElement('section');
      section.className = 'track-history__group';

      const heading = document.createElement('h3');
      heading.className = 'track-history__day';
      heading.textContent = group.label;
      section.appendChild(heading);

      const list = document.createElement('div');
      list.className = 'track-history__day-list';

      group.items.forEach((entry) => {
        const venda = entry.venda;
        const info = entry.acompanhamento;
        const instant = pedidoInstant(venda);
        const timeLabel = formatOrderTime(instant);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'track-history__item';
        if (String(venda.numero_pedido) === String(selectedNumero)) {
          btn.classList.add('is-active');
        }
        btn.innerHTML = `
          <span class="track-history__pedido">Pedido Nº ${venda.numero_pedido}</span>
          <span class="track-history__meta">${timeLabel ? `${timeLabel} · ` : ''}${info?.rotulo_status || venda.status_venda} · ${money(venda.valor_total_centavos)}</span>
        `;
        btn.addEventListener('click', () => {
          renderPedidoCard(entry, { phoneOnly });
          renderHistorico(payload, venda.numero_pedido, { phoneOnly });
          stopPoll();
          if (phoneOnly) {
            lastQuery = {
              numero: '',
              telefone: toLocalPhoneDigits(venda.telefone_cliente || lastQuery.telefone || ''),
            };
          } else {
            lastQuery = {
              numero: String(venda.numero_pedido),
              telefone: toLocalPhoneDigits(venda.telefone_cliente || lastQuery.telefone || ''),
            };
          }
          if (entry.acompanhamento?.ativo || phoneOnly) {
            startPoll();
          }
        });
        list.appendChild(btn);
      });

      section.appendChild(list);
      els.historyList.appendChild(section);
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
    }, 20000);
  }

  async function fetchPedidos({ numero, telefone }) {
    const params = new URLSearchParams();
    if (numero) params.set('numero', numero);
    if (telefone) params.set('telefone', telefone);
    const response = await fetch(`/api/pedido?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.message || 'Não foi possível consultar o pedido.');
    }
    return data;
  }

  async function consultar({ numero = '', telefone = '', silent = false, selectedNumero = '' } = {}) {
    const numeroDigits = String(numero || '').replace(/\D/g, '');
    const telefoneDigits = toLocalPhoneDigits(telefone);
    const phoneOnly = !numeroDigits && telefoneDigits.length >= 10;
    if (!silent) showMessage('Consultando…', '');
    try {
      const data = await fetchPedidos({
        numero: phoneOnly ? '' : numeroDigits,
        telefone: telefoneDigits,
      });
      lastPayload = data;

      const pedidos = Array.isArray(data.pedidos) && data.pedidos.length
        ? data.pedidos
        : (data.venda ? [{ venda: data.venda, acompanhamento: data.acompanhamento }] : []);
      const selected = selectedNumero
        || (phoneOnly
          ? String(pedidos[0]?.venda?.numero_pedido || data.venda?.numero_pedido || '')
          : (numeroDigits || String(data.venda?.numero_pedido || pedidos[0]?.venda?.numero_pedido || '')));
      const entry = pedidos.find((item) => String(item.venda?.numero_pedido) === String(selected))
        || pedidos[0]
        || { venda: data.venda, acompanhamento: data.acompanhamento };

      // Busca só por telefone: mantém filtro só no WhatsApp e lista todos os pedidos.
      lastQuery = phoneOnly
        ? { numero: '', telefone: telefoneDigits }
        : {
            numero: String(entry?.venda?.numero_pedido || numeroDigits || ''),
            telefone: toLocalPhoneDigits(entry?.venda?.telefone_cliente || telefoneDigits || ''),
          };

      renderHistorico({ ...data, pedidos }, entry?.venda?.numero_pedido, { phoneOnly });
      renderPedidoCard(entry, { phoneOnly });
      showMessage(
        phoneOnly
          ? (pedidos.length > 1
            ? `${pedidos.length} pedidos encontrados para este WhatsApp.`
            : (pedidos.length === 1 ? '1 pedido encontrado para este WhatsApp.' : ''))
          : (pedidos.length > 1
            ? `${pedidos.length} pedidos encontrados para este WhatsApp.`
            : ''),
        'ok',
      );

      stopPoll();
      if (phoneOnly || entry?.acompanhamento?.ativo) {
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
    const telefone = toLocalPhoneDigits(els.phone.value);
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
    const numero = params.get('numero')
      || (saved?.numero_pedido != null ? String(saved.numero_pedido) : '');
    const telefone = params.get('telefone')
      || params.get('whatsapp')
      || saved?.telefone
      || '';

    // Prefill imediato a partir do link (WhatsApp) ou do pedido salvo.
    fillLookupFields({ numero, telefone });

    const numeroDigits = String(numero || '').replace(/\D/g, '');
    const telefoneDigits = toLocalPhoneDigits(telefone);
    if (numeroDigits || telefoneDigits.length >= 10) {
      consultar({
        numero: numeroDigits,
        telefone: telefoneDigits,
      }).catch(() => {});
    }
    Track?.syncUi?.();
  }

  boot();
  window.addEventListener('beforeunload', stopPoll);
})();
