(function () {
  'use strict';

  const FALLBACK = Object.freeze({
    empresa: {
      id_empresa: 'a0000000-0000-4000-8000-000000000001',
      slug: 'amanteigados-livia',
      nome_fantasia: 'Amanteigados Lívia',
    },
    tema: {
      nome_exibicao: 'Amanteigados Lívia',
      cor_primaria: '#800020',
      cor_primaria_escura: '#650019',
      cor_fundo: '#fff8f1',
      cor_texto: '#2d2020',
      cor_destaque: '#d8a44d',
      logo_topo_url: 'assets/brand/logo-topo.jpeg',
      logo_favicon_url: 'assets/brand/logo-topo.jpeg',
      whatsapp_telefone: '5518981465499',
      fonte_titulo: 'Nunito',
      fonte_corpo: 'Nunito',
    },
  });

  function readSlugFromPage() {
    try {
      const params = new URLSearchParams(window.location.search);
      const fromQuery = params.get('empresa') || params.get('slug') || '';
      if (fromQuery) return fromQuery;
      const match = String(window.location.pathname || '').match(/^\/loja\/([a-z0-9-]+)(?:\/|$)/i);
      return match ? match[1] : '';
    } catch {
      return '';
    }
  }

  function tenantCacheKey() {
    return window.__AMANTEIGADOS_THEME_KEY__ || (() => {
      const slug = readSlugFromPage();
      if (slug) return `slug:${slug}`;
      return `host:${String(location.hostname || '').toLowerCase()}`;
    })();
  }

  function isPlatformDefaultContext() {
    const slug = readSlugFromPage();
    if (slug && slug !== 'amanteigados-livia') return false;
    const host = String(location.hostname || '').toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1') return !slug || slug === 'amanteigados-livia';
    if (/amanteigadoslivia\.vercel\.app$/i.test(host)) return !slug || slug === 'amanteigados-livia';
    if (/\.vercel\.app$/i.test(host)) return !slug || slug === 'amanteigados-livia';
    // Subdomínio / domínio próprio: nunca pintar Amanteigados primeiro.
    return false;
  }

  function persistTheme(payload) {
    try {
      if (!payload?.tema) return;
      const raw = JSON.stringify({
        empresa: payload.empresa || null,
        tema: payload.tema,
        savedAt: Date.now(),
      });
      const key = `amanteigados_tema_v1:${tenantCacheKey()}`;
      sessionStorage.setItem(key, raw);
      localStorage.setItem(key, raw);
    } catch {
      // ignore
    }
  }

  function googleFontsHref(titulo, corpo) {
    const families = [...new Set([titulo, corpo].filter(Boolean).map((name) => String(name).trim()))];
    if (!families.length) return '';
    const query = families.map((name) => `family=${encodeURIComponent(name)}:wght@500;600;700;800`).join('&');
    return `https://fonts.googleapis.com/css2?${query}&display=swap`;
  }

  function applyFonts(tema) {
    const titulo = tema.fonte_titulo || 'Nunito';
    const corpo = tema.fonte_corpo || 'Nunito';
    const root = document.documentElement;
    root.style.setProperty('--sans', `"${corpo}", system-ui, -apple-system, "Segoe UI", sans-serif`);
    root.style.setProperty('--font-title', `"${titulo}", system-ui, -apple-system, "Segoe UI", sans-serif`);
    let link = document.getElementById('empresa-fonts');
    const href = googleFontsHref(titulo, corpo);
    if (!href) return;
    if (!link) {
      link = document.createElement('link');
      link.id = 'empresa-fonts';
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    link.href = href;
  }

  function absoluteAsset(url, allowFallback = true) {
    const value = String(url || '').trim();
    if (!value) return allowFallback ? `/${FALLBACK.tema.logo_topo_url}` : '';
    if (/^https?:\/\//i.test(value) || value.startsWith('/')) return value;
    return `/${value.replace(/^\.\//, '')}`;
  }

  function markThemeReady() {
    const root = document.documentElement;
    root.classList.remove('theme-booting');
    root.setAttribute('data-theme-ready', '1');
  }

  function applyTheme(payload) {
    const useFallback = isPlatformDefaultContext();
    const empresa = payload?.empresa || (useFallback ? FALLBACK.empresa : {});
    const tema = useFallback
      ? { ...FALLBACK.tema, ...(payload?.tema || {}) }
      : { ...(payload?.tema || {}) };
    const root = document.documentElement;

    if (tema.cor_primaria) root.style.setProperty('--bordo', tema.cor_primaria);
    if (tema.cor_primaria_escura) root.style.setProperty('--bordo-escuro', tema.cor_primaria_escura);
    if (tema.cor_fundo) root.style.setProperty('--creme', tema.cor_fundo);
    if (tema.cor_texto) root.style.setProperty('--texto', tema.cor_texto);
    if (tema.cor_destaque) root.style.setProperty('--dourado', tema.cor_destaque);
    applyFonts(tema);

    const nome = tema.nome_exibicao || empresa.nome_fantasia || (useFallback ? FALLBACK.tema.nome_exibicao : 'Cardápio');
    const logo = absoluteAsset(tema.logo_topo_url, useFallback);
    const favicon = absoluteAsset(tema.logo_favicon_url || tema.logo_topo_url, useFallback);

    if (tema.cor_primaria) {
      document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
        meta.setAttribute('content', tema.cor_primaria);
      });
    }

    if (favicon) {
      document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]').forEach((link) => {
        link.setAttribute('href', favicon);
      });
    }

    if (logo) {
      document.querySelectorAll('.app-header__logo img, .sheet-panel__brand img').forEach((img) => {
        img.src = logo;
        img.alt = nome;
      });
    }

    const page = document.body?.classList?.contains('pedido-page')
      ? 'Acompanhar Pedido'
      : (document.getElementById('pedidoTitle') ? 'Meu Pedido' : 'Cardápio');
    document.title = `${nome} | ${page}`;
    document.querySelectorAll('.sheet-panel__brand strong').forEach((el) => {
      el.textContent = nome;
    });

    const slug = empresa.slug || (useFallback ? FALLBACK.empresa.slug : '');
    const onLojaPath = String(window.location.pathname || '').startsWith('/loja/');
    const base = onLojaPath ? `/loja/${slug}` : '';
    window.AmanteigadosStorefrontTheme = Object.freeze({
      empresa,
      tema,
      nomeExibicao: nome,
      whatsappPhone: String(tema.whatsapp_telefone || FALLBACK.tema.whatsapp_telefone).replace(/\D/g, ''),
      logoTopoUrl: logo,
      empresaSlug: slug,
      dominio: empresa.dominio || null,
      urlPath: empresa.url_path || `/loja/${slug}`,
      urlAcesso: empresa.url_acesso || empresa.url_path || `/loja/${slug}`,
    });

    document.querySelectorAll('.app-header__logo').forEach((el) => {
      el.setAttribute('aria-label', nome);
      el.setAttribute('href', onLojaPath ? `${base}/produtos` : '/produtos');
    });

    if (onLojaPath) {
      document.querySelectorAll('a[href="/produtos"], a[href="/carrinho"], a[href="/acompanhar"]').forEach((anchor) => {
        const href = anchor.getAttribute('href');
        if (href === '/produtos') anchor.setAttribute('href', `${base}/produtos`);
        if (href === '/carrinho') anchor.setAttribute('href', `${base}/carrinho`);
        if (href === '/acompanhar') anchor.setAttribute('href', `${base}/acompanhar`);
      });
      document.querySelectorAll('[data-order-track]').forEach((el) => {
        const current = el.getAttribute('href') || '/acompanhar';
        if (current.startsWith('/acompanhar')) {
          el.setAttribute('href', current.replace('/acompanhar', `${base}/acompanhar`));
        }
      });
      document.querySelectorAll('#orderBarCta, a.order-bar__cta').forEach((el) => {
        if ((el.getAttribute('href') || '') === '/carrinho' || el.id === 'orderBarCta') {
          el.setAttribute('href', `${base}/carrinho`);
        }
      });
    }

    if (window.AmanteigadosStorefrontConfig) {
      try {
        Object.defineProperty(window.AmanteigadosStorefrontConfig, 'whatsappPhone', {
          value: window.AmanteigadosStorefrontTheme.whatsappPhone,
          writable: false,
          configurable: true,
        });
        Object.defineProperty(window.AmanteigadosStorefrontConfig, 'nomeExibicao', {
          value: nome,
          writable: false,
          configurable: true,
        });
      } catch {
        window.AmanteigadosStorefrontConfig.whatsappPhone = window.AmanteigadosStorefrontTheme.whatsappPhone;
      }
    }

    window.AmanteigadosWhatsApp = window.AmanteigadosWhatsApp || {};
    window.AmanteigadosWhatsApp.phone = window.AmanteigadosStorefrontTheme.whatsappPhone;

    markThemeReady();
    document.dispatchEvent(new CustomEvent('amanteigados:theme-ready', {
      detail: window.AmanteigadosStorefrontTheme,
    }));
  }

  async function loadTheme() {
    const boot = window.__AMANTEIGADOS_THEME_BOOT__;
    if (boot?.tema) {
      applyTheme(boot);
    } else if (isPlatformDefaultContext()) {
      applyTheme(FALLBACK);
    }
    // Em subdomínio/tenant: não aplicar FALLBACK (evita flash bordô).

    const slug = readSlugFromPage();
    const url = slug ? `/api/empresa?empresa=${encodeURIComponent(slug)}` : '/api/empresa';
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      const data = await response.json().catch(() => null);
      if (response.ok && data?.tema) {
        persistTheme(data);
        applyTheme(data);
        return;
      }
    } catch {
      // ignore
    }

    if (!window.AmanteigadosStorefrontTheme) {
      if (isPlatformDefaultContext()) applyTheme(FALLBACK);
      else markThemeReady();
    }
  }

  window.AmanteigadosTheme = {
    load: loadTheme,
    apply: applyTheme,
    fallback: FALLBACK,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      loadTheme().catch(() => {});
    });
  } else {
    loadTheme().catch(() => {});
  }
})();
