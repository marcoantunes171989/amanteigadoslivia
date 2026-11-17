(function () {
  'use strict';

  const STORAGE_KEY = 'amanteigados_pedido_ativo_v1';

  function read() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.numero_pedido || !parsed.telefone) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function write(order) {
    if (!order?.numero_pedido || !order?.telefone) return null;
    const payload = {
      id_venda: order.id_venda || null,
      numero_pedido: Number(order.numero_pedido),
      telefone: String(order.telefone).replace(/\D/g, ''),
      nome: order.nome || null,
      status_venda: order.status_venda || 'PENDENTE',
      saved_at: Date.now(),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch { /* ignore */ }
    syncUi(payload);
    return payload;
  }

  function clear() {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    syncUi(null);
  }

  function isActive(order = read()) {
    if (!order) return false;
    return order.status_venda === 'PENDENTE';
  }

  function syncUi(order = read()) {
    const active = isActive(order);
    document.querySelectorAll('[data-order-track]').forEach((el) => {
      // Ícone sempre visível para o cliente consultar/acompanhar.
      el.hidden = false;
      if (order?.numero_pedido) {
        const params = new URLSearchParams({ numero: String(order.numero_pedido) });
        if (order.telefone) params.set('telefone', String(order.telefone).replace(/\D/g, ''));
        el.setAttribute('href', `/acompanhar?${params.toString()}`);
        el.setAttribute(
          'aria-label',
          active
            ? `Acompanhar pedido ${order.numero_pedido}`
            : `Ver pedido ${order.numero_pedido}`,
        );
      } else {
        el.setAttribute('href', '/acompanhar');
        el.setAttribute('aria-label', 'Acompanhar pedido');
      }
    });
    document.querySelectorAll('[data-order-track-badge]').forEach((badge) => {
      badge.hidden = !active;
      badge.textContent = active ? String(order.numero_pedido || '1') : '';
    });
  }

  window.AmanteigadosOrderTrack = {
    read,
    write,
    clear,
    isActive,
    syncUi,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => syncUi());
  } else {
    syncUi();
  }
})();
