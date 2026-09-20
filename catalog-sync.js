import {
  catalogItemsSignature,
  createRefreshGate,
  isDevHost,
  shouldApplyRevision,
} from './ui-core.js';

(function () {
  'use strict';

  const Catalog = window.AmanteigadosCatalog;
  if (!Catalog) return;

  const gate = createRefreshGate({ minIntervalMs: 280 });
  let lastRevision = null;
  let fallbackTimer = null;
  let dueTimer = null;
  window.AmanteigadosSync = {
    mechanism: 'FALLBACK',
    subscribed: false,
    lastSignature: '',
  };

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

  function devLog(...args) {
    if (!isDevHost(window.location.hostname)) return;
    console.info('[catalog-sync]', ...args);
  }

  async function refreshCatalog(source) {
    return gate.run(async () => {
      const previous = pricesSnapshot();
      const before = catalogItemsSignature(Catalog.getProducts());
      await Catalog.loadFromApi();
      const after = catalogItemsSignature(Catalog.getProducts());
      window.AmanteigadosSync.lastSignature = after;
      warnCartIfPricesChanged(previous);
      if (before === after) {
        devLog('refresh skipped, signature unchanged', source);
      } else {
        devLog('catalog refreshed', source);
      }
    });
  }

  function scheduleNext(proxima) {
    if (dueTimer) clearTimeout(dueTimer);
    if (!proxima) return;
    const wait = new Date(proxima).getTime() - Date.now();
    if (wait <= 0 || wait > 24 * 60 * 60 * 1000) return;
    dueTimer = setTimeout(() => {
      refreshCatalog('schedule').catch(() => {});
    }, wait + 400);
  }

  async function pollRevision() {
    try {
      const response = await fetch('/api/catalogo/revisao', { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) return;
      const payload = await response.json();
      if (shouldApplyRevision(lastRevision, payload.revisao)) {
        if (lastRevision) await refreshCatalog('fallback');
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
      const mod = await import('https://esm.sh/@supabase/supabase-js@2.57.4');
      const client = mod.createClient(config.url, config.anon_key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const channel = client.channel(config.channel, {
        config: { broadcast: { ack: true } },
      });
      channel.on('broadcast', { event: config.event }, () => {
        window.AmanteigadosSync.mechanism = 'REALTIME';
        devLog('broadcast received', config.channel, config.event);
        refreshCatalog('realtime').catch(() => {});
      });
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('TIMED_OUT')), 4000);
        channel.subscribe((status) => {
          devLog('subscription', status);
          window.AmanteigadosSync.subscribed = status === 'SUBSCRIBED';
          if (status === 'SUBSCRIBED') {
            clearTimeout(timeout);
            resolve();
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            clearTimeout(timeout);
            reject(new Error(status));
          }
        });
      });
      return true;
    } catch (error) {
      window.AmanteigadosSync.subscribed = false;
      devLog('realtime unavailable', error?.message || error);
      return false;
    }
  }

  async function start() {
    const payload = await pollRevision();
    const realtime = payload?.realtime;
    if (realtime?.url && realtime?.anon_key && realtime?.channel && realtime?.event) {
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
