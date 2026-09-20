(function () {
  'use strict';

  const Catalog = window.AmanteigadosCatalog;
  if (!Catalog) return;

  let lastRevision = null;
  let fallbackTimer = null;
  let dueTimer = null;
  window.AmanteigadosSync = { mechanism: 'FALLBACK' };

  function pricesSnapshot() {
    return (Catalog.getProducts() || []).map((product) => ({
      id: product.id,
      price: Catalog.getEffectivePrice(product),
    }));
  }

  function warnCartIfPricesChanged(previous) {
    const Cart = window.AmanteigadosCart;
    if (!Cart) return;
    const next = new Map(pricesSnapshot().map((item) => [item.id, item.price]));
    let changed = false;
    for (const item of previous) {
      if (next.has(item.id) && next.get(item.id) !== item.price) {
        changed = true;
        break;
      }
    }
    if (changed) {
      Cart.loadCart();
      const region = document.getElementById('cartLiveRegion');
      if (region) region.textContent = 'Os preços do seu carrinho foram atualizados.';
    }
  }

  async function refreshCatalog() {
    const previous = pricesSnapshot();
    await Catalog.loadFromApi();
    warnCartIfPricesChanged(previous);
  }

  function scheduleNext(proxima) {
    if (dueTimer) clearTimeout(dueTimer);
    if (!proxima) return;
    const wait = new Date(proxima).getTime() - Date.now();
    if (wait <= 0 || wait > 24 * 60 * 60 * 1000) return;
    dueTimer = setTimeout(() => {
      refreshCatalog().catch(() => {});
    }, wait + 400);
  }

  async function pollRevision() {
    try {
      const response = await fetch('/api/catalogo/revisao', { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) return;
      const payload = await response.json();
      if (lastRevision && payload.revisao && payload.revisao !== lastRevision) {
        await refreshCatalog();
      }
      lastRevision = payload.revisao || lastRevision;
      scheduleNext(payload.proxima_atualizacao);
      return payload;
    } catch {
      return null;
    }
  }

  async function connectRealtime(config) {
    try {
      const mod = await import('https://esm.sh/@supabase/supabase-js@2');
      const client = mod.createClient(config.url, config.anon_key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const channel = client.channel(config.channel);
      channel.on('broadcast', { event: config.event }, () => {
        window.AmanteigadosSync.mechanism = 'REALTIME';
        refreshCatalog().catch(() => {});
      });
      await new Promise((resolve, reject) => {
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') resolve();
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(status));
        });
      });
      window.AmanteigadosSync.mechanism = 'REALTIME';
      return true;
    } catch {
      return false;
    }
  }

  async function start() {
    const payload = await pollRevision();
    const realtime = payload?.realtime;
    if (realtime?.url && realtime?.anon_key) {
      const ok = await connectRealtime(realtime);
      if (!ok) window.AmanteigadosSync.mechanism = 'FALLBACK';
    }
    fallbackTimer = setInterval(() => {
      pollRevision().catch(() => {});
    }, 10000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
