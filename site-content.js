(function () {
  'use strict';

  const SITE_CACHE_KEY = 'amanteigados_conteudo_live_v1';
  let SITE = null;

  function cacheGet() {
    try {
      const raw = localStorage.getItem(SITE_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function cacheSet(payload) {
    try {
      localStorage.setItem(SITE_CACHE_KEY, JSON.stringify({
        payload,
        timestamp: Date.now(),
        revision: payload?.revisao_site || null,
      }));
    } catch {
      // cache visual
    }
  }

  function applyLogos(payload) {
    const logo = payload?.branding?.logo_topo_url || payload?.configuracao?.logo_topo_url;
    const footer = payload?.branding?.logo_rodape_url || payload?.configuracao?.logo_rodape_url;
    document.querySelectorAll('.brand img, .sidebar-brand img, .login-card img').forEach((img) => {
      if (logo) img.src = logo;
    });
    document.querySelectorAll('.footer-brand img, .footer-brand-col img').forEach((img) => {
      if (footer) img.src = footer;
    });
  }

  function firstImage(block) {
    return (block?.imagens || []).find((item) => item.ativo !== false)?.url_imagem || null;
  }

  function setText(selector, value) {
    const node = document.querySelector(selector);
    if (node && value) node.textContent = value;
  }

  function setSrc(selector, url, alt) {
    const node = document.querySelector(selector);
    if (!node || !url) return;
    node.src = url;
    if (alt) node.alt = alt;
  }

  function section(payload, secao, tipo, urlDestino) {
    return (payload?.secoes || []).find((item) => {
      if (item.secao !== secao || item.tipo_conteudo !== tipo) return false;
      if (urlDestino && item.url_destino !== urlDestino) return false;
      return true;
    }) || null;
  }

  function renderGallery(target, block, { lazy = true } = {}) {
    if (!target || !block) return;
    target.replaceChildren();
    const images = (block.imagens || []).filter((item) => item.ativo !== false);
    images.forEach((image, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'gallery-item';
      const img = document.createElement('img');
      img.src = image.url_imagem;
      img.alt = image.texto_alternativo || block.titulo || '';
      img.decoding = 'async';
      if (lazy && index > 0) img.loading = 'lazy';
      button.appendChild(img);
      button.addEventListener('click', () => openLightbox(img.src, img.alt));
      target.appendChild(button);
    });
  }

  function openLightbox(src, alt) {
    let dialog = document.getElementById('siteLightbox');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.id = 'siteLightbox';
      dialog.className = 'site-lightbox';
      dialog.innerHTML = '<form method="dialog"><button type="submit" aria-label="Fechar">&times;</button></form><img alt="">';
      document.body.appendChild(dialog);
    }
    const img = dialog.querySelector('img');
    img.src = src;
    img.alt = alt || '';
    if (typeof dialog.showModal === 'function') dialog.showModal();
  }

  function applyHome(payload) {
    const hero = section(payload, 'HOME', 'CHAMADA');
    const descubra = section(payload, 'HOME', 'DESTAQUE');
    const heroImg = payload?.configuracao?.hero_imagem_url || firstImage(hero);
    const descubraImg = payload?.configuracao?.descubra_imagem_url || firstImage(descubra);
    if (hero) {
      setText('.hero-copy .eyebrow', hero.subtitulo);
      const title = document.querySelector('.hero-copy h1');
      if (title && hero.titulo) title.textContent = hero.titulo;
      setText('.hero-copy .hero-sub', hero.descricao);
      const cta = document.querySelector('.hero-cta .btn-primary');
      if (cta && hero.texto_botao) {
        const label = cta.childNodes[0];
        if (label) label.textContent = `${hero.texto_botao} `;
      }
    }
    setSrc('.hero-photo', heroImg, hero?.imagens?.[0]?.texto_alternativo);
    if (descubra) {
      setText('.catalog-cta-txt h2', descubra.titulo);
      setText('.catalog-cta-txt p', descubra.descricao);
      const cta = document.querySelector('.catalog-cta-txt .btn');
      if (cta && descubra.texto_botao) {
        const label = cta.childNodes[0];
        if (label) label.textContent = `${descubra.texto_botao} `;
      }
    }
    setSrc('.catalog-cta-photo img', descubraImg, descubra?.imagens?.[0]?.texto_alternativo);

    ['Encomendas', 'Festas', 'Personalizados'].forEach((name) => {
      const card = (payload.secoes || []).find((item) => item.secao === 'HOME' && item.tipo_conteudo === 'CARD' && item.titulo === name);
      if (!card) return;
      const article = document.querySelector(`.card h3`) && Array.from(document.querySelectorAll('.moments .card')).find((el) => el.querySelector('h3')?.textContent.trim() === name);
      if (!article) return;
      const p = article.querySelector('.card-txt p');
      if (p && card.descricao) p.textContent = card.descricao;
      const img = article.querySelector('img');
      const src = firstImage(card);
      if (img && src) img.src = src;
    });
  }

  function applyEncomendas(payload) {
    const chamada = section(payload, 'ENCOMENDAS', 'CHAMADA');
    const galeria = section(payload, 'ENCOMENDAS', 'GALERIA');
    if (chamada) {
      setText('#encomendas .section-kicker, #encomendas-block .eyebrow, #encomendasHead .eyebrow', chamada.subtitulo);
      setText('#encomendasHead h2, #encomendas-block h2', chamada.titulo);
      setText('#encomendasHead p, #encomendas-block .section-copy', chamada.descricao);
    }
    renderGallery(document.getElementById('encomendasGallery'), galeria);
  }

  function applyFestas(payload) {
    const chamada = section(payload, 'FESTAS', 'CHAMADA');
    if (chamada) {
      setText('#festas-momentos .eyebrow', chamada.subtitulo);
      setText('#festas-momentos h2', chamada.titulo);
      const p = document.querySelector('#festas-momentos .feature-txt > p:not(.eyebrow)');
      if (p && chamada.descricao) p.textContent = chamada.descricao;
      setSrc('#festas-momentos .feature-photo img', firstImage(chamada), chamada.imagens?.[0]?.texto_alternativo);
    }
    const cards = (payload.secoes || []).filter((item) => item.secao === 'FESTAS' && item.tipo_conteudo === 'CARD');
    const detail = document.getElementById('festaDetail');
    const gallery = document.getElementById('festaGallery');
    const tags = document.getElementById('festaTags');
    if (tags) {
      tags.replaceChildren();
      cards.forEach((card, index) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'feature-tag-btn' + (index === 0 ? ' is-active' : '');
        btn.textContent = card.titulo;
        btn.dataset.key = card.url_destino || card.titulo;
        btn.addEventListener('click', () => {
          tags.querySelectorAll('button').forEach((el) => el.classList.toggle('is-active', el === btn));
          showFesta(card, detail, gallery);
          const tipo = document.getElementById('encomendaTipo');
          if (tipo && card.url_destino) tipo.value = card.url_destino;
        });
        tags.appendChild(btn);
      });
      if (cards[0]) showFesta(cards[0], detail, gallery);
    }
  }

  function showFesta(card, detail, gallery) {
    if (detail) {
      detail.hidden = false;
      detail.replaceChildren();
      const h = document.createElement('h3');
      h.textContent = card.titulo || '';
      const p = document.createElement('p');
      p.textContent = card.descricao || '';
      detail.append(h, p);
      if (card.texto_botao) {
        const a = document.createElement('a');
        a.className = 'btn btn-ghost';
        a.href = '#form-encomenda';
        a.textContent = card.texto_botao;
        detail.append(a);
      }
    }
    renderGallery(gallery, card);
  }

  function applyPersonalizados(payload) {
    const chamada = section(payload, 'PERSONALIZADOS', 'CHAMADA');
    const galeria = section(payload, 'PERSONALIZADOS', 'GALERIA');
    if (chamada) {
      setText('#personalizados-historia .eyebrow', chamada.subtitulo);
      setText('#personalizados-historia h2', chamada.titulo);
      const p = document.querySelector('#personalizados-historia .feature-txt > p:not(.eyebrow)');
      if (p && chamada.descricao) p.textContent = chamada.descricao;
      setSrc('#personalizados-historia .feature-photo img', firstImage(chamada), chamada.imagens?.[0]?.texto_alternativo);
      const cta = document.querySelector('#personalizados-historia .btn');
      if (cta && chamada.texto_botao) cta.textContent = chamada.texto_botao;
      if (cta && chamada.url_destino) cta.setAttribute('href', chamada.url_destino);
    }
    renderGallery(document.getElementById('personalizadosGallery'), galeria);
  }

  function applyWhatsAppLinks(payload) {
    const phone = payload?.configuracao?.whatsapp_telefone;
    if (!phone) return;
    document.querySelectorAll('a[href*="wa.me"]').forEach((link) => {
      if (link.dataset.dynamic === 'keep') return;
      link.href = `https://wa.me/${phone}`;
    });
    window.AmanteigadosWhatsApp = { phone, display: payload.configuracao.whatsapp_exibicao || phone };
  }

  function applyPayload(payload) {
    if (!payload) return;
    SITE = payload;
    applyLogos(payload);
    applyWhatsAppLinks(payload);
    if (document.body.classList.contains('home-page')) {
      applyHome(payload);
      applyEncomendas(payload);
      applyFestas(payload);
      applyPersonalizados(payload);
    }
  }

  async function loadFromApi() {
    const response = await fetch('/api/conteudo-site', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error('content_unavailable');
    const payload = await response.json();
    cacheSet(payload);
    applyPayload(payload);
    window.dispatchEvent(new CustomEvent('amanteigados:site-atualizado', { detail: payload }));
    return payload;
  }

  function hydrateFromCache() {
    const cached = cacheGet();
    if (cached?.payload) applyPayload(cached.payload);
    return cached;
  }

  window.AmanteigadosSite = {
    loadFromApi,
    hydrateFromCache,
    get() { return SITE; },
  };

  hydrateFromCache();
  loadFromApi().catch(() => {});
})();
