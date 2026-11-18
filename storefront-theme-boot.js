/* Aplica tema em cache ANTES do CSS pintar (evita flash da cor Amanteigados em subdomínio). */
(function () {
  'use strict';

  function tenantKey() {
    try {
      var match = String(location.pathname || '').match(/^\/loja\/([a-z0-9-]+)(?:\/|$)/i);
      if (match) return 'slug:' + match[1].toLowerCase();
      var host = String(location.hostname || '').toLowerCase();
      if (host && host !== 'localhost' && host !== '127.0.0.1' && !/\.vercel\.app$/i.test(host)) {
        return 'host:' + host;
      }
      var q = new URLSearchParams(location.search);
      var slug = q.get('empresa') || q.get('slug');
      if (slug) return 'slug:' + String(slug).toLowerCase();
      return 'host:' + host;
    } catch (e) {
      return 'default';
    }
  }

  function isNonDefaultTenant(key) {
    if (!key || key === 'default') return false;
    if (key === 'slug:amanteigados-livia') return false;
    if (key.indexOf('host:') === 0) {
      var host = key.slice(5);
      if (host === 'amanteigadoslivia.vercel.app' || host === 'localhost' || host === '127.0.0.1') return false;
      if (/\.vercel\.app$/i.test(host)) return false;
      return true;
    }
    return key.indexOf('slug:') === 0;
  }

  function applyVars(tema) {
    if (!tema) return;
    var root = document.documentElement;
    if (tema.cor_primaria) root.style.setProperty('--bordo', tema.cor_primaria);
    if (tema.cor_primaria_escura) root.style.setProperty('--bordo-escuro', tema.cor_primaria_escura);
    if (tema.cor_fundo) root.style.setProperty('--creme', tema.cor_fundo);
    if (tema.cor_texto) root.style.setProperty('--texto', tema.cor_texto);
    if (tema.cor_destaque) root.style.setProperty('--dourado', tema.cor_destaque);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta && tema.cor_primaria) meta.setAttribute('content', tema.cor_primaria);
  }

  var key = tenantKey();
  window.__AMANTEIGADOS_THEME_KEY__ = key;

  try {
    var storageKey = 'amanteigados_tema_v1:' + key;
    var raw = sessionStorage.getItem(storageKey) || localStorage.getItem(storageKey);
    if (raw) {
      var data = JSON.parse(raw);
      if (data && data.tema) {
        applyVars(data.tema);
        window.__AMANTEIGADOS_THEME_BOOT__ = data;
        document.documentElement.setAttribute('data-theme-ready', '1');
        return;
      }
    }
  } catch (e) { /* ignore */ }

  if (isNonDefaultTenant(key)) {
    document.documentElement.classList.add('theme-booting');
  }
})();
