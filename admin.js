import { readSidebarCollapsed, writeSidebarCollapsed } from './ui-core.js';

  const loginView = document.getElementById('loginView');
  const appView = document.getElementById('appView');
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const loginButton = document.getElementById('loginButton');
  const logoutButton = document.getElementById('logoutButton');
  const menuToggle = document.getElementById('menuToggle');
  const adminSidebar = document.getElementById('adminSidebar');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');
  const toastRegion = document.getElementById('toastRegion');
  const formDialog = document.getElementById('formDialog');
  const resourceForm = document.getElementById('resourceForm');
  const views = {
    overview: document.getElementById('overviewView'),
    categories: document.getElementById('categoriesView'),
    products: document.getElementById('productsView'),
    branding: document.getElementById('brandingView'),
    homeContent: document.getElementById('homeContentView'),
    encomendasContent: document.getElementById('encomendasContentView'),
    festasContent: document.getElementById('festasContentView'),
    personalizadosContent: document.getElementById('personalizadosContentView'),
    sales: document.getElementById('salesView'),
    requests: document.getElementById('requestsView'),
    reports: document.getElementById('reportsView'),
    publications: document.getElementById('publicationsView'),
    audit: document.getElementById('auditView'),
    users: document.getElementById('usersView'),
  };

  const TITLES = {
    overview: ['Painel', 'Visão Geral', 'Acompanhe o painel da loja em homologação.'],
    categories: ['Catálogo', 'Categorias', 'Organize as categorias ativas do cardápio.'],
    products: ['Catálogo', 'Produtos', 'Gerencie nomes, preços, imagens e disponibilidade.'],
    branding: ['Conteúdo', 'Branding', 'Logos e WhatsApp comercial do site.'],
    homeContent: ['Conteúdo', 'Página Inicial', 'Hero, destaques e chamadas da home.'],
    encomendasContent: ['Conteúdo', 'Encomendas', 'Chamada, galeria e textos da seção.'],
    festasContent: ['Conteúdo', 'Festas', 'Aniversário, presente, celebrações, eventos e lembranças.'],
    personalizadosContent: ['Conteúdo', 'Personalizados', 'Descrição, CTA e galeria de trabalhos.'],
    sales: ['Operação', 'Vendas', 'Acompanhe pedidos e o status de cada venda.'],
    requests: ['Operação', 'Solicitações', 'Pedidos de encomenda, festas e personalizados.'],
    reports: ['Análise', 'Relatórios', 'Acompanhe o desempenho do negócio.'],
    publications: ['Gestão', 'Publicações', 'Homologação ativa. Produção permanece bloqueada.'],
    audit: ['Gestão', 'Auditoria', 'Consulte o histórico de ações administrativas.'],
    users: ['Gestão', 'Usuários', 'Gerencie acessos do painel.'],
  };

  const state = {
    view: 'overview',
    catalog: { resumo: {}, categorias: [], produtos: [] },
    reports: null,
    vendas: [],
    solicitacoes: [],
    requestStatus: 'NOVA',
    conteudo: { configuracoes: [], conteudos: [] },
    usuarios: [],
    auditoria: [],
    publicacoes: null,
    productQuery: '',
    productFilter: 'todos',
    salesPeriod: 'hoje',
    salesStatus: 'todos',
    reportTab: 'visao',
    reportPeriod: '30d',
    reportStart: '',
    reportEnd: '',
    auditPeriod: '',
    auditUser: '',
    auditAction: '',
    auditEntity: '',
    auditResult: '',
    slugManual: false,
    pendingFile: null,
    sessao: null,
  };

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === 'className') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'htmlFor') node.htmlFor = value;
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
      else node.setAttribute(key, value === true ? '' : String(value));
    }
    for (const child of children) {
      if (child) node.append(child);
    }
    return node;
  }

  function toast(message, success = true) {
    const variant = success === 'warning' ? ' is-warning' : success ? ' is-success' : ' is-error';
    const node = el('div', { className: `toast${variant}`, text: message });
    toastRegion.append(node);
    setTimeout(() => node.remove(), 4200);
  }

  function money(centavos) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((Number(centavos) || 0) / 100);
  }

  function formatDate(value) {
    if (!value) return '—';
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  }

  function slugFromName(name) {
    return String(name || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function isSafeImageUrl(url) {
    if (!url) return false;
    if (url.startsWith('assets/') || url.startsWith('/')) return true;
    try {
      const parsed = new URL(url, window.location.origin);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  function thumb(url, alt) {
    if (isSafeImageUrl(url)) return el('img', { className: 'thumb', src: url, alt: alt || '' });
    return el('div', { className: 'thumb placeholder', text: 'Sem imagem' });
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
      ...options,
    });
    const contentType = response.headers.get('content-type') || '';
    let payload = null;
    if (contentType.includes('application/json')) {
      try { payload = await response.json(); } catch { payload = null; }
    } else {
      payload = await response.text();
    }
    if (!response.ok) {
      const error = new Error(payload?.message || payload?.error || 'request_failed');
      error.status = response.status;
      error.code = payload?.error || 'request_failed';
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  function closeDrawer() {
    adminSidebar.classList.remove('is-open');
    sidebarBackdrop.classList.add('hidden');
    document.body.classList.remove('drawer-locked');
    menuToggle?.setAttribute('aria-expanded', 'false');
  }

  function openDrawer() {
    adminSidebar.classList.add('is-open');
    sidebarBackdrop.classList.remove('hidden');
    document.body.classList.add('drawer-locked');
    menuToggle?.setAttribute('aria-expanded', 'true');
  }

  function applySidebarCollapsed(collapsed) {
    document.getElementById('appView')?.classList.toggle('is-collapsed', collapsed);
    const button = document.getElementById('sidebarCollapse');
    if (button) {
      button.setAttribute('aria-pressed', collapsed ? 'true' : 'false');
      button.setAttribute('data-tooltip', collapsed ? 'Expandir menu' : 'Recolher menu');
      const label = button.querySelector('span');
      if (label) label.textContent = collapsed ? 'Expandir menu' : 'Recolher menu';
    }
  }

  function setView(view) {
    state.view = view;
    document.querySelectorAll('.nav-btn[data-view]').forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    Object.entries(views).forEach(([name, node]) => {
      node.classList.toggle('hidden', name !== view);
    });
    const titles = TITLES[view];
    document.getElementById('viewEyebrow').textContent = titles[0];
    document.getElementById('viewTitle').textContent = titles[1];
    const subtitle = document.getElementById('viewSubtitle');
    if (subtitle) subtitle.textContent = titles[2] || '';
    document.getElementById('viewBreadcrumb').textContent = `Início / ${titles[0]} / ${titles[1]}`;
    closeDrawer();
    refreshView();
  }

  function badge(active) {
    return el('span', { className: active ? 'badge badge-ok' : 'badge badge-off', text: active ? 'Ativo' : 'Inativo' });
  }

  function metric(label, value) {
    return el('article', { className: 'card' }, [
      el('span', { text: label }),
      el('strong', { text: String(value ?? 0) }),
    ]);
  }

  function emptyState(text) {
    return el('p', { className: 'empty', text });
  }

  function periodQuery() {
    const params = new URLSearchParams({ periodo: state.reportPeriod === 'personalizado' ? '30d' : state.reportPeriod });
    if (state.reportPeriod === 'personalizado') {
      if (state.reportStart) params.set('data_inicio', state.reportStart);
      if (state.reportEnd) params.set('data_fim', state.reportEnd);
    }
    return params;
  }

  function periodFilters(onChange) {
    const options = [
      ['hoje', 'Hoje'],
      ['7d', '7 dias'],
      ['30d', '30 dias'],
      ['mes', 'Este mês'],
      ['personalizado', 'Personalizado'],
    ];
    return el('div', { className: 'period-filters' }, [
      ...options.map(([id, label]) => el('button', {
        className: `chip${state.reportPeriod === id ? ' is-active' : ''}`,
        type: 'button',
        text: label,
        onClick: () => { state.reportPeriod = id; onChange(); },
      })),
      state.reportPeriod === 'personalizado' ? el('div', { className: 'period-custom' }, [
        field('reportStart', 'Data inicial', el('input', {
          id: 'reportStart', type: 'date', value: state.reportStart,
          onChange: (event) => { state.reportStart = event.target.value; onChange(); },
        })),
        field('reportEnd', 'Data final', el('input', {
          id: 'reportEnd', type: 'date', value: state.reportEnd,
          onChange: (event) => { state.reportEnd = event.target.value; onChange(); },
        })),
      ]) : null,
    ]);
  }

  function chart(rows, key) {
    const max = Math.max(1, ...rows.map((row) => Number(row[key] || 0)));
    if (!rows.length) return emptyState('Nenhuma venda encontrada para este período.');
    return el('div', { className: 'chart' }, rows.map((row) => el('div', {
      className: `chart-bar${key.includes('faturamento') ? ' is-alt' : ''}`,
      title: `${row.dia}: ${row[key]}`,
      style: `height:${Math.max(8, (Number(row[key] || 0) / max) * 132)}px`,
    })));
  }

  async function loadCatalog() {
    state.catalog = await request('/api/admin/catalogo');
    if (state.catalog?.sessao) state.sessao = state.catalog.sessao;
  }

  function currentSession() {
    return state.sessao || {};
  }

  function isSelfUser(user) {
    return Boolean(user?.id_usuario_admin && String(currentSession().id_usuario_admin) === String(user.id_usuario_admin));
  }

  function canResetProtectedPassword(user) {
    return user?.protegido === true
      && isSelfUser(user)
      && currentSession().perfil === 'SUPER_ADMIN';
  }

  async function loadReports() {
    state.reports = await request(`/api/admin/relatorios?${periodQuery()}`);
  }

  async function loadSales() {
    const payload = await request(`/api/admin/vendas?periodo=${encodeURIComponent(state.salesPeriod)}&status=${encodeURIComponent(state.salesStatus)}`);
    state.vendas = payload.vendas || [];
  }

  async function loadUsers() {
    const payload = await request('/api/admin/usuarios');
    state.usuarios = payload.usuarios || [];
  }

  async function loadAudit() {
    const params = new URLSearchParams();
    if (state.auditPeriod) params.set('periodo', state.auditPeriod);
    if (state.auditUser) params.set('usuario', state.auditUser);
    if (state.auditAction) params.set('acao', state.auditAction);
    if (state.auditEntity) params.set('entidade', state.auditEntity);
    if (state.auditResult) params.set('sucesso', state.auditResult);
    const payload = await request(`/api/admin/auditoria?${params}`);
    state.auditoria = payload.eventos || [];
  }

  async function loadPublications() {
    state.publicacoes = await request('/api/admin/publicacoes');
  }

  async function loadContent() {
    state.conteudo = await request('/api/admin/conteudo');
  }

  async function loadRequests() {
    const params = new URLSearchParams();
    if (state.requestStatus) params.set('status_solicitacao', state.requestStatus);
    const payload = await request(`/api/admin/solicitacoes?${params}`);
    state.solicitacoes = payload.solicitacoes || [];
  }

  async function refreshView() {
    try {
      if (state.view === 'overview') {
        await Promise.all([loadCatalog(), loadReports()]);
        renderOverview();
      } else if (state.view === 'categories' || state.view === 'products') {
        await loadCatalog();
        renderCategories();
        renderProducts();
      } else if (state.view === 'sales') {
        await loadSales();
        renderSales();
      } else if (['branding', 'homeContent', 'encomendasContent', 'festasContent', 'personalizadosContent'].includes(state.view)) {
        await loadContent();
        renderContentView();
      } else if (state.view === 'requests') {
        await loadRequests();
        renderRequests();
      } else if (state.view === 'reports') {
        await loadReports();
        renderReports();
      } else if (state.view === 'publications') {
        await loadPublications();
        renderPublications();
      } else if (state.view === 'audit') {
        await loadAudit();
        renderAudit();
      } else if (state.view === 'users') {
        await loadUsers();
        renderUsers();
      }
    } catch (error) {
      if (error.status === 401) {
        showLogin();
        return;
      }
      toast(error.message || 'Não foi possível carregar os dados.', false);
    }
  }

  function renderOverview() {
    const dash = state.reports?.dashboard || {};
    const hoje = dash.hoje || {};
    views.overview.replaceChildren(
      el('div', { className: 'kpi-grid' }, [
        metric('Produtos ativos', dash.produtos_ativos),
        metric('Categorias ativas', dash.categorias_ativas),
        metric('Produtos em destaque', dash.destaques),
        metric('Promoções ativas', dash.promocoes_ativas),
        metric('Pedidos hoje', hoje.pedidos),
        metric('Vendas confirmadas hoje', hoje.vendas_confirmadas),
        metric('Faturamento hoje', money(hoje.faturamento_centavos)),
        metric('Ticket médio hoje', money(hoje.ticket_medio_centavos)),
      ]),
      el('div', { className: 'cards', style: 'margin-top:16px' }, [
        metric('Pedidos 7 dias', dash.dias_7?.pedidos),
        metric('Faturamento 7 dias', money(dash.dias_7?.faturamento_centavos)),
        metric('Pedidos 30 dias', dash.dias_30?.pedidos),
        metric('Faturamento 30 dias', money(dash.dias_30?.faturamento_centavos)),
      ]),
      el('div', { className: 'env-grid', style: 'margin-top:16px' }, [
        el('article', { className: 'card' }, [
          el('span', { text: 'Vendas por dia' }),
          chart(state.reports?.vendas?.por_dia || [], 'pedidos'),
        ]),
        el('article', { className: 'card' }, [
          el('span', { text: 'Faturamento por dia' }),
          chart(state.reports?.vendas?.por_dia || [], 'faturamento_centavos'),
        ]),
      ]),
      el('article', { className: 'card', style: 'margin-top:16px' }, [
        el('span', { text: 'Produtos mais vendidos' }),
        (state.reports?.produtos || []).length
          ? el('div', { className: 'table-wrap' }, [simpleTable(['Produto', 'Qtd', 'Receita'], (state.reports.produtos || []).slice(0, 8).map((item) => [item.nome_produto, item.quantidade, money(item.receita_centavos)]))])
          : emptyState('Nenhuma venda encontrada para este período.'),
      ]),
    );
  }

  function simpleTable(headers, rows) {
    return el('table', {}, [
      el('thead', {}, [el('tr', {}, headers.map((h) => el('th', { text: h })))]),
      el('tbody', {}, rows.map((row) => el('tr', {}, row.map((cell) => el('td', { text: String(cell ?? '—') }))))),
    ]);
  }

  function renderCategories() {
    const rows = state.catalog.categorias || [];
    views.categories.replaceChildren(
      el('div', { className: 'toolbar' }, [
        el('p', { text: `${rows.length} categoria(s)` }),
        el('button', { className: 'btn btn-primary', type: 'button', text: '+ Nova categoria', onClick: () => openCategoryForm() }),
      ]),
      el('div', { className: 'table-wrap' }, [
        rows.length ? simpleTable(['Nome', 'Slug', 'Ordem', 'Ativo'], rows.map((item) => [item.nome_categoria, item.slug_categoria, item.ordem_exibicao, item.ativo ? 'Ativo' : 'Inativo'])) : emptyState('Nenhuma categoria cadastrada.'),
        rows.length ? el('div', { className: 'category-cards' }, rows.map((category) => el('article', { className: 'mobile-card' }, [
          el('strong', { text: category.nome_categoria }),
          badge(category.ativo),
          categoryActions(category),
        ]))) : null,
      ]),
    );
    if (rows.length) {
      const tbody = views.categories.querySelector('tbody');
      [...tbody.children].forEach((tr, index) => {
        tr.lastChild.replaceWith(el('td', {}, [categoryActions(rows[index])]));
      });
    }
  }

  function categoryActions(category) {
    return el('div', { className: 'actions' }, [
      el('button', { className: 'btn btn-ghost btn-small', type: 'button', text: 'Editar', onClick: () => openCategoryForm(category) }),
      el('button', { className: 'btn btn-ghost btn-small', type: 'button', text: category.ativo ? 'Desativar' : 'Ativar', onClick: () => mutate('categoria', category.ativo ? 'desativar' : 'ativar', category.id_categoria) }),
    ]);
  }

  function filteredProducts() {
    const query = state.productQuery.trim().toLowerCase();
    return (state.catalog.produtos || []).filter((product) => {
      if (state.productFilter === 'ativos' && !product.ativo) return false;
      if (state.productFilter === 'inativos' && product.ativo) return false;
      if (state.productFilter === 'destaques' && !product.destaque) return false;
      if (query && !String(product.nome_produto || '').toLowerCase().includes(query)) return false;
      return true;
    });
  }

  function renderProducts() {
    const rows = filteredProducts();
    views.products.replaceChildren(
      el('div', { className: 'toolbar' }, [
        el('input', { className: 'search-input', type: 'search', placeholder: 'Buscar por nome', value: state.productQuery, onInput: (event) => { state.productQuery = event.target.value; renderProducts(); } }),
        el('div', { className: 'filters' }, ['todos', 'ativos', 'inativos', 'destaques'].map((filter) => (
          el('button', { className: `chip${state.productFilter === filter ? ' is-active' : ''}`, type: 'button', text: filter[0].toUpperCase() + filter.slice(1), onClick: () => { state.productFilter = filter; renderProducts(); } })
        ))),
        el('button', { className: 'btn btn-primary', type: 'button', text: '+ Novo produto', onClick: () => openProductForm() }),
      ]),
      el('div', { className: 'table-wrap' }, [
        rows.length ? el('table', {}, [
          el('thead', {}, [el('tr', {}, ['Imagem', 'Produto', 'Categoria', 'Preço', 'Status', 'Ações'].map((h) => el('th', { text: h })))]),
          el('tbody', {}, rows.map((product) => el('tr', {}, [
            el('td', {}, [thumb(product.url_imagem_principal, product.nome_produto)]),
            el('td', { text: product.nome_produto }),
            el('td', { text: product.nome_categoria || '—' }),
            el('td', { text: product.preco_normal ? `R$ ${product.preco_normal}` : '—' }),
            el('td', {}, [badge(product.ativo)]),
            el('td', {}, [productActions(product)]),
          ]))),
        ]) : emptyState('Nenhum produto encontrado.'),
        rows.length ? el('div', { className: 'product-cards' }, rows.map((product) => el('article', { className: 'mobile-card' }, [
          el('strong', { text: product.nome_produto }),
          el('span', { className: 'muted', text: product.nome_categoria || '—' }),
          el('span', { text: product.preco_normal ? `R$ ${product.preco_normal}` : '—' }),
          badge(product.ativo),
          productActions(product),
        ]))) : null,
      ]),
    );
  }

  function productActions(product) {
    return el('div', { className: 'actions' }, [
      el('button', { className: 'btn btn-ghost btn-small', type: 'button', text: 'Editar', onClick: () => openProductForm(product) }),
      el('button', { className: 'btn btn-ghost btn-small', type: 'button', text: product.ativo ? 'Desativar' : 'Ativar', onClick: () => mutate('produto', product.ativo ? 'desativar' : 'ativar', product.id_produto) }),
    ]);
  }

  function configValue(chave) {
    return (state.conteudo.configuracoes || []).find((item) => item.chave_configuracao === chave)?.valor_texto || '';
  }

  function contentsFor(secao, tipo) {
    return (state.conteudo.conteudos || []).filter((item) => item.secao === secao && (!tipo || item.tipo_conteudo === tipo));
  }

  function contentCard(item) {
    const principal = item.imagem_principal || (item.imagens || []).find((image) => image.principal === true) || null;
    const galeria = item.galeria || (item.imagens || []).filter((image) => image.principal !== true);
    return el('article', { className: 'card' }, [
      el('strong', { text: item.titulo || item.tipo_conteudo }),
      el('span', { className: 'muted', text: `${item.secao} · ${item.tipo_conteudo}` }),
      item.descricao ? el('p', { text: item.descricao }) : null,
      el('div', { className: 'image-slot' }, [
        el('span', { className: 'muted', text: 'Imagem principal' }),
        principal ? thumb(principal.url_imagem, principal.texto_alternativo) : el('span', { className: 'muted', text: 'Sem imagem no slot' }),
        el('button', { className: 'btn btn-ghost btn-small', type: 'button', text: 'Substituir imagem', onClick: () => openPrincipalImageForm(item, principal) }),
      ]),
      item.tipo_conteudo === 'GALERIA' ? el('div', { className: 'image-slot' }, [
        el('span', { className: 'muted', text: 'Galeria' }),
        galeria.length ? el('div', { className: 'thumbs' }, galeria.slice(0, 6).map((image) => thumb(image.url_imagem, image.texto_alternativo))) : el('span', { className: 'muted', text: 'Nenhuma imagem extra' }),
        el('button', { className: 'btn btn-ghost btn-small', type: 'button', text: '+ Adicionar à galeria', onClick: () => openGalleryAddForm(item) }),
      ]) : null,
      el('div', { className: 'actions' }, [
        el('button', { className: 'btn btn-ghost btn-small', type: 'button', text: 'Editar', onClick: () => openContentForm(item) }),
      ]),
    ]);
  }

  function renderContentView() {
    const view = state.view;
    const target = views[view];
    if (!target) return;
    if (view === 'branding') {
      target.replaceChildren(
        el('div', { className: 'cards' }, [
          brandingEditor('logo_topo_url', 'Logo do topo', configValue('logo_topo_url')),
          brandingEditor('logo_rodape_url', 'Logo do rodapé', configValue('logo_rodape_url')),
          brandingEditor('whatsapp_telefone', 'WhatsApp comercial', configValue('whatsapp_telefone'), false),
        ]),
      );
      return;
    }
    const secao = view === 'homeContent' ? 'HOME' : view === 'encomendasContent' ? 'ENCOMENDAS' : view === 'festasContent' ? 'FESTAS' : 'PERSONALIZADOS';
    const items = contentsFor(secao);
    const homeImages = view === 'homeContent'
      ? [
        brandingEditor('hero_imagem_url', 'Imagem do hero', configValue('hero_imagem_url')),
        brandingEditor('descubra_imagem_url', 'Imagem de “Descubra nossos amanteigados”', configValue('descubra_imagem_url')),
      ]
      : [];
    target.replaceChildren(
      el('div', { className: 'toolbar' }, [
        el('button', { className: 'btn btn-primary', type: 'button', text: 'Novo bloco', onClick: () => openContentForm({ secao, tipo_conteudo: secao === 'FESTAS' ? 'CARD' : 'CHAMADA' }) }),
      ]),
      el('div', { className: 'cards' }, homeImages.concat(items.length ? items.map(contentCard) : [emptyState('Nenhum conteúdo nesta seção.')])),
    );
  }

  function brandingEditor(chave, label, value, isImage = true) {
    return el('article', { className: 'card' }, [
      el('strong', { text: label }),
      isImage && value ? el('img', { className: 'thumb', src: value, alt: label }) : null,
      field(chave, isImage ? 'URL da imagem' : 'Telefone com DDI', el('input', { id: chave, name: chave, value, type: 'text' })),
      isImage ? el('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', onChange: async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        state.pendingFile = file;
        try {
          const url = await uploadSelectedImage(chave === 'logo_topo_url' || chave === 'logo_rodape_url' ? 'site/branding' : 'site');
          state.pendingFile = null;
          await saveConfig(chave, url);
        } catch (error) {
          toast(error.message || 'Falha no upload.', false);
        }
      } }) : null,
      el('button', { className: 'btn btn-primary', type: 'button', text: 'Salvar', onClick: async () => {
        await saveConfig(chave, document.getElementById(chave).value);
      } }),
    ]);
  }

  async function saveConfig(chave, valor) {
    await request('/api/admin/conteudo', {
      method: 'POST',
      body: JSON.stringify({
        acao: chave.includes('logo') ? 'alterar_branding' : chave.endsWith('_url') ? 'alterar_branding' : 'salvar_configuracao',
        dados: { chave_configuracao: chave, valor_texto: valor },
      }),
    });
    toast('Configuração salva.');
    await refreshView();
  }

  function openContentForm(item = {}) {
    resourceForm.replaceChildren(el('div', { className: 'dialog-body' }, [
      el('div', { className: 'dialog-header' }, [el('h2', { text: item.id_conteudo_site ? 'Editar conteúdo' : 'Novo conteúdo' }), el('button', { className: 'btn btn-ghost btn-small', type: 'button', text: 'Fechar', onClick: () => formDialog.close() })]),
      field('secao', 'Seção', el('select', { id: 'secao' }, ['HOME', 'ENCOMENDAS', 'FESTAS', 'PERSONALIZADOS'].map((value) => el('option', { value, text: value, selected: (item.secao || '') === value })))),
      field('tipo_conteudo', 'Tipo', el('select', { id: 'tipo_conteudo' }, ['CHAMADA', 'DESTAQUE', 'GALERIA', 'CARD'].map((value) => el('option', { value, text: value, selected: (item.tipo_conteudo || '') === value })))),
      field('titulo', 'Título', input('titulo', { value: item.titulo || '' })),
      field('subtitulo', 'Subtítulo', input('subtitulo', { value: item.subtitulo || '' })),
      field('descricao', 'Descrição', el('textarea', { id: 'descricao', name: 'descricao', text: item.descricao || '' })),
      field('texto_botao', 'Texto do botão', input('texto_botao', { value: item.texto_botao || '' })),
      field('url_destino', 'Destino / chave', input('url_destino', { value: item.url_destino || '' })),
      field('ordem_exibicao', 'Ordem', input('ordem_exibicao', { type: 'number', value: String(item.ordem_exibicao ?? 0) })),
      el('p', { id: 'formError', className: 'form-error', hidden: true }),
      el('div', { className: 'dialog-actions' }, [
        el('button', { className: 'btn btn-ghost', type: 'button', text: 'Cancelar', onClick: () => formDialog.close() }),
        el('button', { className: 'btn btn-primary', type: 'submit', text: 'Salvar' }),
      ]),
    ]));
    resourceForm.dataset.kind = 'conteudo';
    resourceForm.dataset.id = item.id_conteudo_site || '';
    formDialog.showModal();
  }

  function openPrincipalImageForm(item, principal) {
    openImageForm({
      title: 'Imagem principal',
      kind: 'imagem-principal',
      item,
      url: principal?.url_imagem || '',
      alt: principal?.texto_alternativo || '',
      submitLabel: 'Substituir imagem',
    });
  }

  function openGalleryAddForm(item) {
    openImageForm({
      title: 'Adicionar à galeria',
      kind: 'galeria-add',
      item,
      url: '',
      alt: '',
      submitLabel: '+ Adicionar à galeria',
    });
  }

  function openImageForm({ title, kind, item, url, alt, submitLabel }) {
    resourceForm.replaceChildren(el('div', { className: 'dialog-body' }, [
      el('div', { className: 'dialog-header' }, [el('h2', { text: title }), el('button', { className: 'btn btn-ghost btn-small', type: 'button', text: 'Fechar', onClick: () => formDialog.close() })]),
      field('url_imagem', 'URL da imagem', input('url_imagem', { value: url || '' })),
      field('arquivo_imagem', 'Upload local', el('input', { id: 'arquivo_imagem', type: 'file', accept: 'image/jpeg,image/png,image/webp' })),
      field('texto_alternativo', 'Texto alternativo', input('texto_alternativo', { value: alt || '' })),
      el('img', { id: 'imagePreview', className: 'thumb hidden', alt: '' }),
      el('input', { type: 'hidden', id: 'origem_imagem', value: 'url' }),
      el('p', { id: 'formError', className: 'form-error', hidden: true }),
      el('div', { className: 'dialog-actions' }, [
        el('button', { className: 'btn btn-ghost', type: 'button', text: 'Cancelar', onClick: () => formDialog.close() }),
        el('button', { className: 'btn btn-primary', type: 'submit', text: submitLabel }),
      ]),
    ]));
    resourceForm.dataset.kind = kind;
    resourceForm.dataset.id = item.id_conteudo_site;
    state.pendingFile = null;
    bindImagePreview();
    formDialog.showModal();
  }

  function openGalleryForm(item) {
    openPrincipalImageForm(item, item.imagem_principal || item.imagens?.[0]);
  }

  function renderRequests() {
    const statuses = ['NOVA', 'EM_ATENDIMENTO', 'CONCLUIDA', 'CANCELADA'];
    views.requests.replaceChildren(
      el('div', { className: 'filters' }, statuses.map((status) => el('button', {
        className: `chip${state.requestStatus === status ? ' is-active' : ''}`,
        type: 'button',
        text: status.replace('_', ' '),
        onClick: () => { state.requestStatus = status; refreshView(); },
      }))),
      el('div', { className: 'table-wrap' }, [
        state.solicitacoes.length
          ? simpleTable(['Data', 'Cliente', 'Telefone', 'Tipo', 'Data do evento', 'Resumo', 'Status'], state.solicitacoes.map((item) => [
            formatDate(item.data_criacao),
            item.nome_cliente,
            item.telefone_cliente,
            item.tipo_solicitacao,
            item.data_evento || '—',
            String(item.descricao_pedido || '').slice(0, 48),
            item.status_solicitacao,
          ]))
          : emptyState('Nenhuma solicitação neste filtro.'),
      ]),
      el('div', { className: 'cards' }, state.solicitacoes.map((item) => el('article', { className: 'card' }, [
        el('strong', { text: item.nome_cliente }),
        el('span', { className: 'muted', text: `${item.tipo_solicitacao} · ${item.telefone_cliente}` }),
        el('p', { text: item.descricao_pedido }),
        el('div', { className: 'actions' }, statuses.map((status) => el('button', {
          className: 'btn btn-ghost btn-small',
          type: 'button',
          text: status.replace('_', ' '),
          onClick: async () => {
            await request('/api/admin/solicitacoes', { method: 'POST', body: JSON.stringify({ id_solicitacao_encomenda: item.id_solicitacao_encomenda, status_solicitacao: status }) });
            toast('Status atualizado.');
            refreshView();
          },
        }))),
      ]))),
    );
  }

  function renderSales() {
    views.sales.replaceChildren(
      el('div', { className: 'toolbar' }, [
        el('div', { className: 'filters' }, ['hoje', '7d', '30d'].map((period) => el('button', {
          className: `chip${state.salesPeriod === period ? ' is-active' : ''}`,
          type: 'button',
          text: period === 'hoje' ? 'Hoje' : period === '7d' ? '7 dias' : '30 dias',
          onClick: () => { state.salesPeriod = period; refreshView(); },
        }))),
        el('div', { className: 'filters' }, ['todos', 'PENDENTE', 'CONFIRMADA', 'CANCELADA'].map((status) => el('button', {
          className: `chip${state.salesStatus === status ? ' is-active' : ''}`,
          type: 'button',
          text: status[0] + status.slice(1).toLowerCase(),
          onClick: () => { state.salesStatus = status; refreshView(); },
        }))),
      ]),
      el('div', { className: 'table-wrap' }, [
        state.vendas.length ? el('table', {}, [
          el('thead', {}, [el('tr', {}, ['ID', 'Data', 'Cliente', 'Itens', 'Total', 'Status', 'Ações'].map((h) => el('th', { text: h })))]),
          el('tbody', {}, state.vendas.map((venda) => el('tr', {}, [
            el('td', { text: String(venda.id_venda).slice(0, 8) }),
            el('td', { text: formatDate(venda.data_venda) }),
            el('td', { text: venda.nome_cliente || '—' }),
            el('td', { text: String(venda.quantidade_itens || 0) }),
            el('td', { text: money(venda.valor_total_centavos) }),
            el('td', { text: venda.status_venda }),
            el('td', {}, venda.status_venda === 'PENDENTE' ? [
              el('button', { className: 'btn btn-primary btn-small', type: 'button', text: 'Confirmar', onClick: () => changeSale(venda.id_venda, 'CONFIRMADA') }),
              el('button', { className: 'btn btn-danger btn-small', type: 'button', text: 'Cancelar', onClick: () => changeSale(venda.id_venda, 'CANCELADA') }),
            ] : [el('span', { className: 'muted', text: '—' })]),
          ]))),
        ]) : emptyState('Nenhuma venda encontrada para este período.'),
        state.vendas.length ? el('div', { className: 'sales-cards' }, state.vendas.map((venda) => el('article', { className: 'mobile-card' }, [
          el('strong', { text: venda.nome_cliente || String(venda.id_venda).slice(0, 8) }),
          el('span', { text: formatDate(venda.data_venda) }),
          el('span', { text: money(venda.valor_total_centavos) }),
          el('span', { className: 'muted', text: venda.status_venda }),
          venda.status_venda === 'PENDENTE' ? el('div', { className: 'actions' }, [
            el('button', { className: 'btn btn-primary btn-small', type: 'button', text: 'Confirmar', onClick: () => changeSale(venda.id_venda, 'CONFIRMADA') }),
            el('button', { className: 'btn btn-danger btn-small', type: 'button', text: 'Cancelar', onClick: () => changeSale(venda.id_venda, 'CANCELADA') }),
          ]) : null,
        ]))) : null,
      ]),
    );
  }

  async function changeSale(id, status) {
    if (!window.confirm(status === 'CONFIRMADA' ? 'Confirmar esta venda?' : 'Cancelar esta venda?')) return;
    await request('/api/admin/vendas', { method: 'POST', body: JSON.stringify({ id_venda: id, status_venda: status }) });
    toast('Venda atualizada.');
    refreshView();
  }

  function renderReports() {
    const reports = state.reports || {};
    const tabs = [
      ['visao', 'Visão Geral'],
      ['vendas', 'Vendas'],
      ['produtos', 'Produtos'],
      ['catalogo', 'Catálogo'],
      ['alteracoes', 'Alterações'],
      ['auditoria', 'Auditoria'],
    ];
    views.reports.replaceChildren(
      periodFilters(() => refreshView()),
      el('div', { className: 'toolbar' }, [
        el('div', { className: 'tabs', role: 'tablist', 'aria-label': 'Seções de relatórios' }, tabs.map(([id, label]) => el('button', {
          className: `chip${state.reportTab === id ? ' is-active' : ''}`,
          type: 'button',
          role: 'tab',
          'aria-selected': state.reportTab === id ? 'true' : 'false',
          text: label,
          onClick: () => { state.reportTab = id; renderReports(); },
        }))),
        el('button', { className: 'btn btn-ghost', type: 'button', text: 'Exportar CSV', onClick: () => {
          window.location.href = `/api/admin/relatorios?formato=csv&secao=${state.reportTab === 'produtos' ? 'produtos' : state.reportTab === 'auditoria' ? 'auditoria' : 'vendas'}&${periodQuery()}`;
        } }),
      ]),
      reportBody(reports),
    );
  }

  function reportBody(reports) {
    if (state.reportTab === 'visao') {
      return el('div', { className: 'cards' }, [
        metric('Pedidos', reports.visao_geral?.pedidos),
        metric('Vendas confirmadas', reports.visao_geral?.vendas_confirmadas),
        metric('Faturamento', money(reports.visao_geral?.faturamento_centavos)),
        metric('Ticket médio', money(reports.visao_geral?.ticket_medio_centavos)),
      ]);
    }
    if (state.reportTab === 'vendas') {
      return el('article', { className: 'card' }, [chart(reports.vendas?.por_dia || [], 'faturamento_centavos')]);
    }
    if (state.reportTab === 'produtos') {
      return (reports.produtos || []).length
        ? el('div', { className: 'table-wrap' }, [simpleTable(['Produto', 'Quantidade', 'Receita'], reports.produtos.map((item) => [item.nome_produto, item.quantidade, money(item.receita_centavos)]))])
        : emptyState('Nenhuma venda encontrada para este período.');
    }
    if (state.reportTab === 'catalogo') {
      const c = reports.catalogo || {};
      return el('div', { className: 'cards' }, [
        metric('Ativos', c.produtos_ativos),
        metric('Inativos', c.produtos_inativos),
        metric('Destaques', c.destaques),
        metric('Promoções ativas', c.promocoes_ativas),
        metric('Sem imagem', c.sem_imagem),
        metric('Sem preço vigente', c.sem_preco_vigente),
      ]);
    }
    if (state.reportTab === 'alteracoes') {
      const a = reports.alteracoes || {};
      return el('div', { className: 'cards' }, [
        metric('Agendadas', a.agendadas),
        metric('Aplicadas', a.aplicadas),
        metric('Canceladas', a.canceladas),
        metric('Com erro', a.erro),
      ]);
    }
    return el('div', { className: 'table-wrap' }, [
      (reports.auditoria || []).length
        ? simpleTable(['Data', 'Ação', 'Entidade', 'Sucesso'], reports.auditoria.map((item) => [formatDate(item.data_evento), item.acao, item.entidade || '—', item.sucesso ? 'Sim' : 'Não']))
        : emptyState('Nenhum evento de auditoria no período.'),
    ]);
  }

  function renderPublications() {
    const data = state.publicacoes || {};
    const homologOnline = Boolean(data.homolog?.database_status || data.homolog?.git_sha);
    views.publications.replaceChildren(
      el('div', { className: 'env-grid' }, [
        el('article', { className: 'card' }, [
          el('div', { className: 'env-status' }, [
            el('span', { className: `status-dot ${homologOnline ? 'is-online' : 'is-offline'}`, 'aria-hidden': 'true' }),
            el('strong', { text: 'HOMOLOG' }),
            el('span', { text: homologOnline ? 'Online' : 'Indisponível' }),
          ]),
          el('p', { className: 'muted', text: 'Ambiente ativo para testes.' }),
          el('p', { text: `Git SHA: ${data.homolog?.git_sha || '—'}` }),
          el('p', { text: `Vercel: ${data.homolog?.vercel_status || '—'}` }),
          el('p', { text: `Database: ${data.homolog?.database_status || '—'}` }),
          el('p', { text: `Migrations: ${(data.homolog?.migrations || []).join(', ') || '—'}` }),
          el('p', { text: `Categorias ativas: ${data.homolog?.categorias_ativas ?? 0}` }),
          el('p', { text: `Produtos ativos: ${data.homolog?.produtos_ativos ?? 0}` }),
        ]),
        el('article', { className: 'card' }, [
          el('div', { className: 'env-status' }, [
            el('span', { className: 'status-dot is-offline', 'aria-hidden': 'true' }),
            el('strong', { text: 'PRODUÇÃO' }),
            el('span', { text: 'Não configurada' }),
          ]),
          el('p', { className: 'muted', text: 'Aguardando configuração. Publicação permanece bloqueada.' }),
          el('strong', { text: data.producao?.status || 'Aguardando configuração de produção' }),
        ]),
      ]),
      el('div', { className: 'toolbar', style: 'margin-top:16px' }, [
        el('button', { className: 'btn btn-ghost', type: 'button', text: 'Validar promoção', onClick: validatePromo }),
        el('button', { className: 'btn btn-primary', type: 'button', text: 'Publicar agora', disabled: true, title: 'Produção ainda não habilitada' }),
        el('button', { className: 'btn btn-ghost', type: 'button', text: 'Agendar publicação', onClick: schedulePublish }),
      ]),
      el('article', { className: 'card' }, [
        el('span', { text: 'Timeline' }),
        el('p', { className: 'muted', text: 'Criada → Validada → Agendada → Em execução → Publicada/Erro/Bloqueada' }),
        (data.publicacoes || []).length
          ? simpleTable(['Tipo', 'Status', 'Agendada', 'Erro'], data.publicacoes.map((item) => [item.tipo_publicacao, item.status_publicacao, formatDate(item.data_agendada), item.mensagem_erro || '—']))
          : emptyState('Nenhuma publicação registrada.'),
      ]),
    );
  }

  async function validatePromo() {
    const result = await request('/api/admin/publicacoes', { method: 'POST', body: JSON.stringify({ acao: 'validar' }) });
    toast(result.motivo || result.status, result.status !== 'ERRO');
  }

  async function publishNow() {
    if (!window.confirm('Produção ainda não habilitada. Configure e aprove o ambiente antes de publicar.')) return;
    try {
      await request('/api/admin/publicacoes', { method: 'POST', body: JSON.stringify({ acao: 'publicar', tipo_publicacao: 'CATALOGO' }) });
    } catch (error) {
      toast(error.payload?.message || 'Produção ainda não habilitada.', false);
    }
  }

  async function schedulePublish() {
    resourceForm.replaceChildren(el('div', { className: 'dialog-body' }, [
      el('div', { className: 'dialog-header' }, [el('h2', { text: 'Agendar publicação' }), el('button', { className: 'btn btn-ghost btn-small', type: 'button', text: 'Fechar', onClick: () => formDialog.close() })]),
      field('data_agendada', 'Data', input('data_agendada', { type: 'date', required: true })),
      field('hora_agendada', 'Hora', input('hora_agendada', { type: 'time', required: true })),
      el('p', { className: 'muted', text: 'A publicação em produção permanece bloqueada até a configuração do ambiente.' }),
      el('p', { id: 'formError', className: 'form-error', hidden: true }),
      el('div', { className: 'dialog-actions' }, [
        el('button', { className: 'btn btn-ghost', type: 'button', text: 'Cancelar', onClick: () => formDialog.close() }),
        el('button', { className: 'btn btn-primary', type: 'submit', text: 'Agendar' }),
      ]),
    ]));
    resourceForm.dataset.kind = 'publicacao';
    formDialog.showModal();
  }

  function renderAudit() {
    views.audit.replaceChildren(
      el('div', { className: 'audit-filters' }, [
        field('auditPeriod', 'Período', el('select', {
          id: 'auditPeriod', value: state.auditPeriod,
          onChange: (event) => { state.auditPeriod = event.target.value; refreshView(); },
        }, [
          el('option', { value: '', text: 'Todos' }),
          el('option', { value: 'hoje', text: 'Hoje', selected: state.auditPeriod === 'hoje' }),
          el('option', { value: '7d', text: '7 dias', selected: state.auditPeriod === '7d' }),
          el('option', { value: '30d', text: '30 dias', selected: state.auditPeriod === '30d' }),
          el('option', { value: 'mes', text: 'Este mês', selected: state.auditPeriod === 'mes' }),
        ])),
        field('auditUser', 'Usuário', el('input', {
          id: 'auditUser', type: 'search', placeholder: 'Nome ou e-mail', value: state.auditUser,
          onChange: (event) => { state.auditUser = event.target.value; refreshView(); },
        })),
        field('auditAction', 'Ação', el('input', {
          id: 'auditAction', type: 'search', placeholder: 'LOGIN_SUCESSO', value: state.auditAction,
          onChange: (event) => { state.auditAction = event.target.value; refreshView(); },
        })),
        field('auditEntity', 'Entidade', el('input', {
          id: 'auditEntity', type: 'search', placeholder: 'produto', value: state.auditEntity,
          onChange: (event) => { state.auditEntity = event.target.value; refreshView(); },
        })),
        field('auditResult', 'Resultado', el('select', {
          id: 'auditResult',
          onChange: (event) => { state.auditResult = event.target.value; refreshView(); },
        }, [
          el('option', { value: '', text: 'Todos' }),
          el('option', { value: 'true', text: 'Sucesso', selected: state.auditResult === 'true' }),
          el('option', { value: 'false', text: 'Falha', selected: state.auditResult === 'false' }),
        ])),
      ]),
      el('div', { className: 'toolbar' }, [
        el('button', { className: 'btn btn-ghost', type: 'button', text: 'Exportar CSV', onClick: () => { window.location.href = '/api/admin/auditoria?formato=csv'; } }),
      ]),
      el('div', { className: 'table-wrap' }, [
        state.auditoria.length
          ? simpleTable(['Data', 'Usuário', 'Ação', 'Entidade', 'Registro', 'Resultado', 'Descrição'], state.auditoria.map((item) => [
            formatDate(item.data_evento),
            item.email_usuario || '—',
            item.acao,
            item.entidade || '—',
            item.id_registro ? String(item.id_registro).slice(0, 8) : '—',
            item.sucesso ? 'Sucesso' : 'Falha',
            item.descricao_evento || '—',
          ]))
          : emptyState('Nenhum evento de auditoria encontrado para estes filtros.'),
        state.auditoria.length ? el('div', { className: 'audit-cards' }, state.auditoria.map((item) => el('article', { className: 'mobile-card' }, [
          el('strong', { text: item.acao }),
          el('span', { text: item.email_usuario || '—' }),
          el('span', { className: 'muted', text: formatDate(item.data_evento) }),
          el('span', { text: item.sucesso ? 'Sucesso' : 'Falha' }),
          el('p', { text: item.descricao_evento || '—' }),
        ]))) : null,
      ]),
    );
  }

  function renderUsers() {
    views.users.replaceChildren(
      el('div', { className: 'toolbar' }, [
        el('button', { className: 'btn btn-primary', type: 'button', text: '+ Novo usuário', onClick: () => openUserForm() }),
      ]),
      el('div', { className: 'table-wrap' }, [
        state.usuarios.length ? el('table', {}, [
          el('thead', {}, [el('tr', {}, ['Nome', 'E-mail', 'Perfil', 'Status', 'Último login', 'Ações'].map((h) => el('th', { text: h })))]),
          el('tbody', {}, state.usuarios.map((user) => el('tr', {}, [
            el('td', { text: user.nome_usuario }),
            el('td', { text: user.email_usuario }),
            el('td', {}, [userBadges(user)]),
            el('td', {}, [badge(user.ativo)]),
            el('td', { text: formatDate(user.data_ultimo_login) }),
            el('td', {}, [
              el('button', { className: 'btn btn-ghost btn-small', type: 'button', text: 'Editar', onClick: () => openUserForm(user) }),
            ]),
          ]))),
        ]) : emptyState('Nenhum usuário cadastrado.'),
        state.usuarios.length ? el('div', { className: 'user-cards' }, state.usuarios.map((user) => el('article', { className: 'mobile-card' }, [
          el('strong', { text: user.nome_usuario }),
          el('span', { text: user.email_usuario }),
          userBadges(user),
          badge(user.ativo),
          el('span', { text: `Último login: ${formatDate(user.data_ultimo_login)}` }),
          el('button', { className: 'btn btn-ghost btn-small', type: 'button', text: 'Editar', onClick: () => openUserForm(user) }),
        ]))) : null,
      ]),
    );
  }

  function userBadges(user) {
    const nodes = [el('span', { className: 'muted', text: user.perfil_usuario === 'SUPER_ADMIN' ? 'SUPER ADMIN' : user.perfil_usuario })];
    if (user.protegido) nodes.push(el('span', { className: 'badge badge-ok', text: 'Protegido' }));
    return el('div', { className: 'user-flags' }, nodes);
  }

  function field(id, label, control, full = false) {
    return el('div', { className: full ? 'field full' : 'field' }, [el('label', { htmlFor: id, text: label }), control]);
  }
  function input(id, attrs = {}) { return el('input', { id, name: id, ...attrs }); }
  function checkbox(name, label, checked) {
    return el('label', {}, [el('input', { type: 'checkbox', name, checked }), document.createTextNode(label)]);
  }

  function scheduleFields() {
    return el('div', { className: 'form-grid' }, [
      field('aplicar', 'Aplicar alteração', el('select', { id: 'aplicar', name: 'aplicar' }, [
        el('option', { value: 'agora', text: 'Agora' }),
        el('option', { value: 'agendar', text: 'Agendar' }),
      ])),
      field('data_agendada', 'Data', input('data_agendada', { type: 'date' })),
      field('hora_agendada', 'Hora', input('hora_agendada', { type: 'time' })),
    ]);
  }

  function openCategoryForm(category) {
    state.slugManual = Boolean(category?.slug_categoria);
    resourceForm.replaceChildren(el('div', { className: 'dialog-body' }, [
      el('div', { className: 'dialog-header' }, [el('h2', { text: category ? 'Editar categoria' : 'Nova categoria' }), el('button', { className: 'btn btn-ghost btn-small', type: 'button', text: 'Fechar', onClick: () => formDialog.close() })]),
      el('input', { type: 'hidden', name: 'id_categoria', value: category?.id_categoria || '' }),
      field('nome', 'Nome *', input('nome', { required: true, value: category?.nome_categoria || '' })),
      field('slug', 'Slug *', input('slug', { required: true, value: category?.slug_categoria || '' })),
      field('descricao', 'Descrição', el('textarea', { id: 'descricao', name: 'descricao', rows: '3' })),
      field('ordem', 'Ordem', input('ordem', { type: 'number', min: '0', value: String(category?.ordem_exibicao ?? 0) })),
      checkbox('ativo', 'Ativo', category ? category.ativo : true),
      category ? scheduleFields() : null,
      el('p', { id: 'formError', className: 'form-error', hidden: true }),
      el('div', { className: 'dialog-actions' }, [
        el('button', { className: 'btn btn-ghost', type: 'button', text: 'Cancelar', onClick: () => formDialog.close() }),
        el('button', { className: 'btn btn-primary', type: 'submit', text: 'Salvar' }),
      ]),
    ]));
    resourceForm.descricao.value = category?.descricao_categoria || '';
    bindSlugSync(resourceForm.nome, resourceForm.slug);
    resourceForm.dataset.kind = 'categoria';
    formDialog.showModal();
  }

  function openProductForm(product) {
    state.slugManual = Boolean(product?.slug_produto);
    state.pendingFile = null;
    const options = (state.catalog.categorias || []).map((category) => el('option', {
      value: category.id_categoria,
      text: category.nome_categoria,
      selected: product?.id_categoria === category.id_categoria,
    }));
    resourceForm.replaceChildren(el('div', { className: 'dialog-body' }, [
      el('div', { className: 'dialog-header' }, [el('h2', { text: product ? 'Editar produto' : 'Novo produto' }), el('button', { className: 'btn btn-ghost btn-small', type: 'button', text: 'Fechar', onClick: () => formDialog.close() })]),
      el('input', { type: 'hidden', name: 'id_produto', value: product?.id_produto || '' }),
      el('div', { className: 'form-grid' }, [
        field('id_categoria', 'Categoria *', el('select', { id: 'id_categoria', name: 'id_categoria', required: true }, [el('option', { value: '', text: 'Selecione' }), ...options]), true),
        field('nome', 'Nome *', input('nome', { required: true, value: product?.nome_produto || '' }), true),
        field('slug', 'Slug *', input('slug', { required: true, value: product?.slug_produto || '' })),
        field('ordem', 'Ordem de exibição', input('ordem', { type: 'number', min: '0', value: String(product?.ordem_exibicao ?? 0) })),
        field('descricao', 'Descrição', el('textarea', { id: 'descricao', name: 'descricao', rows: '3' }), true),
        field('preco_normal', 'Preço normal *', input('preco_normal', { required: true, inputmode: 'decimal', placeholder: '24,90', value: product?.preco_normal || '' })),
        field('preco_promocional', 'Preço promocional', input('preco_promocional', { inputmode: 'decimal', placeholder: '21,90', value: product?.preco_promocional || '' })),
        field('origem_imagem', 'Imagem', el('select', { id: 'origem_imagem', name: 'origem_imagem' }, [
          el('option', { value: 'url', text: 'Informar URL' }),
          el('option', { value: 'arquivo', text: 'Enviar arquivo' }),
        ]), true),
        field('url_imagem', 'URL da imagem', input('url_imagem', { placeholder: 'https://... ou assets/...', value: product?.url_imagem_principal || '' }), true),
        field('arquivo_imagem', 'Selecionar imagem do computador', input('arquivo_imagem', { type: 'file', accept: 'image/jpeg,image/png,image/webp' }), true),
      ]),
      el('img', { id: 'imagePreview', className: 'preview hidden', alt: 'Pré-visualização da imagem' }),
      el('div', { className: 'checkboxes' }, [
        checkbox('promocao_ativa', 'Promoção ativa', Boolean(product?.promocao_ativa)),
        checkbox('destaque', 'Destaque', Boolean(product?.destaque)),
        checkbox('ativo', 'Ativo', product ? product.ativo : true),
      ]),
      product ? scheduleFields() : null,
      el('p', { id: 'formError', className: 'form-error', hidden: true }),
      el('div', { className: 'dialog-actions' }, [
        el('button', { className: 'btn btn-ghost', type: 'button', text: 'Cancelar', onClick: () => formDialog.close() }),
        el('button', { className: 'btn btn-primary', type: 'submit', text: 'Salvar' }),
      ]),
    ]));
    resourceForm.descricao.value = product?.descricao_produto || '';
    bindSlugSync(resourceForm.nome, resourceForm.slug);
    bindImagePreview();
    resourceForm.dataset.kind = 'produto';
    formDialog.showModal();
  }

  function openUserForm(user) {
    const protectedUser = user?.protegido === true;
    const canReset = !user || !protectedUser || canResetProtectedPassword(user);
    resourceForm.replaceChildren(el('div', { className: 'dialog-body' }, [
      el('div', { className: 'dialog-header' }, [el('h2', { text: user ? 'Editar usuário' : 'Novo usuário' }), el('button', { className: 'btn btn-ghost btn-small', type: 'button', text: 'Fechar', onClick: () => formDialog.close() })]),
      el('input', { type: 'hidden', name: 'id_usuario_admin', value: user?.id_usuario_admin || '' }),
      field('nome', 'Nome *', input('nome', { required: true, value: user?.nome_usuario || '' })),
      field('email', 'E-mail *', input('email', { type: 'email', required: true, value: user?.email_usuario || '' })),
      protectedUser
        ? el('p', { className: 'muted', text: 'SUPER ADMIN protegido. Perfil, proteção e status não podem ser alterados.' })
        : field('perfil', 'Perfil', el('select', { id: 'perfil', name: 'perfil' }, [
          el('option', { value: 'ADMIN', text: 'ADMIN', selected: user?.perfil_usuario !== 'GESTOR' }),
          el('option', { value: 'GESTOR', text: 'GESTOR', selected: user?.perfil_usuario === 'GESTOR' }),
        ])),
      canReset
        ? field('senha', user ? 'Nova senha (opcional)' : 'Senha *', input('senha', { type: 'password', required: !user, minlength: '8' }))
        : el('p', { className: 'muted', text: 'A senha deste usuário protegido só pode ser redefinida pelo próprio Super Admin.' }),
      protectedUser ? null : checkbox('ativo', 'Ativo', user ? user.ativo : true),
      el('p', { id: 'formError', className: 'form-error', hidden: true }),
      el('div', { className: 'dialog-actions' }, [
        el('button', { className: 'btn btn-ghost', type: 'button', text: 'Cancelar', onClick: () => formDialog.close() }),
        el('button', { className: 'btn btn-primary', type: 'submit', text: 'Salvar' }),
      ]),
    ]));
    resourceForm.dataset.kind = 'usuario';
    formDialog.showModal();
  }

  function bindSlugSync(nameInput, slugInput) {
    nameInput.addEventListener('input', () => { if (!state.slugManual) slugInput.value = slugFromName(nameInput.value); });
    slugInput.addEventListener('input', () => { state.slugManual = true; });
  }

  function bindImagePreview() {
    const urlInput = resourceForm.url_imagem;
    const fileInput = resourceForm.arquivo_imagem;
    const preview = document.getElementById('imagePreview');
    const updateUrl = () => {
      const url = urlInput.value.trim();
      if (isSafeImageUrl(url)) {
        preview.src = url;
        preview.classList.remove('hidden');
      } else if (!state.pendingFile) {
        preview.removeAttribute('src');
        preview.classList.add('hidden');
      }
    };
    urlInput.addEventListener('input', updateUrl);
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        formError('Tipo de arquivo não permitido. Use JPEG, PNG ou WebP.');
        fileInput.value = '';
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        formError('A imagem deve ter no máximo 2 MB.');
        fileInput.value = '';
        return;
      }
      state.pendingFile = file;
      preview.src = URL.createObjectURL(file);
      preview.classList.remove('hidden');
      resourceForm.origem_imagem.value = 'arquivo';
    });
    updateUrl();
  }

  function formError(message) {
    const node = document.getElementById('formError');
    if (!node) return;
    node.hidden = !message;
    node.textContent = message || '';
  }

  async function mutate(recurso, acao, id, dados) {
    try {
      const result = await request('/api/admin/catalogo', { method: 'POST', body: JSON.stringify({ recurso, acao, id, dados }) });
      if (result.agendada) toast('Alteração agendada.');
      else if (recurso === 'produto') toast('Produto salvo.');
      else toast('Alteração salva com sucesso.');
      await refreshView();
    } catch (error) {
      toast(error.message || 'Não foi possível salvar.', false);
      throw error;
    }
  }

  async function uploadSelectedImage(pasta) {
    const file = state.pendingFile;
    if (!file) return resourceForm.url_imagem?.value?.trim() || '';
    const signed = await request('/api/admin/imagens/upload-url', {
      method: 'POST',
      body: JSON.stringify({ nome_arquivo: file.name, tipo_mime: file.type, tamanho_bytes: file.size, pasta }),
    });
    const put = await fetch(signed.signed_upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': file.type, 'x-upsert': 'true' },
      body: file,
    });
    if (!put.ok) throw new Error('Falha no envio da imagem.');
    toast('Imagem enviada.');
    return signed.public_url;
  }

  resourceForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    formError('');
    const kind = resourceForm.dataset.kind;
    const data = new FormData(resourceForm);
    const submitBtn = resourceForm.querySelector('[type="submit"]');
    const originalLabel = submitBtn?.textContent;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Salvando...';
    }
    try {
      if (kind === 'categoria') {
        await mutate('categoria', data.get('id_categoria') ? 'editar' : 'criar', data.get('id_categoria') || undefined, {
          nome: String(data.get('nome') || ''),
          slug: String(data.get('slug') || ''),
          descricao: String(data.get('descricao') || ''),
          ordem: data.get('ordem'),
          ativo: resourceForm.ativo.checked,
          aplicar: data.get('aplicar') || 'agora',
          data_agendada: data.get('data_agendada'),
          hora_agendada: data.get('hora_agendada'),
        });
      } else if (kind === 'produto') {
        const url = await uploadSelectedImage();
        await mutate('produto', data.get('id_produto') ? 'editar' : 'criar', data.get('id_produto') || undefined, {
          id_categoria: String(data.get('id_categoria') || ''),
          nome: String(data.get('nome') || ''),
          slug: String(data.get('slug') || ''),
          descricao: String(data.get('descricao') || ''),
          preco_normal: String(data.get('preco_normal') || ''),
          preco_promocional: String(data.get('preco_promocional') || ''),
          promocao_ativa: resourceForm.promocao_ativa.checked,
          url_imagem_principal: url,
          destaque: resourceForm.destaque.checked,
          ativo: resourceForm.ativo.checked,
          ordem: data.get('ordem'),
          aplicar: data.get('aplicar') || 'agora',
          data_agendada: data.get('data_agendada'),
          hora_agendada: data.get('hora_agendada'),
        });
      } else if (kind === 'usuario') {
        const id = data.get('id_usuario_admin');
        const payload = {
          nome: String(data.get('nome') || ''),
          email: String(data.get('email') || ''),
          senha: String(data.get('senha') || ''),
        };
        const current = state.usuarios.find((item) => String(item.id_usuario_admin) === String(id));
        if (current?.protegido) {
          payload.perfil = 'SUPER_ADMIN';
          payload.ativo = true;
        } else {
          payload.perfil = String(data.get('perfil') || 'ADMIN');
          payload.ativo = resourceForm.ativo ? resourceForm.ativo.checked : true;
        }
        if (id) {
          await request('/api/admin/usuarios', { method: 'POST', body: JSON.stringify({ acao: 'editar', id, dados: payload }) });
          if (payload.senha) {
            await request('/api/admin/usuarios', { method: 'POST', body: JSON.stringify({ acao: 'redefinir_senha', id, senha: payload.senha }) });
          }
        } else {
          await request('/api/admin/usuarios', { method: 'POST', body: JSON.stringify({ acao: 'criar', dados: payload }) });
        }
        toast('Usuário atualizado.');
        await refreshView();
      } else if (kind === 'publicacao') {
        const dataAgendada = String(data.get('data_agendada') || '');
        const horaAgendada = String(data.get('hora_agendada') || '');
        await request('/api/admin/publicacoes', {
          method: 'POST',
          body: JSON.stringify({
            acao: 'agendar',
            tipo_publicacao: 'CATALOGO',
            data_agendada: `${dataAgendada}T${horaAgendada}:00-03:00`,
            observacao: 'Agendamento HML',
          }),
        });
        toast('Publicação agendada.');
        await refreshView();
      } else if (kind === 'conteudo') {
        await request('/api/admin/conteudo', {
          method: 'POST',
          body: JSON.stringify({
            acao: 'salvar_conteudo',
            dados: {
              id_conteudo_site: resourceForm.dataset.id || undefined,
              secao: document.getElementById('secao').value,
              tipo_conteudo: document.getElementById('tipo_conteudo').value,
              titulo: document.getElementById('titulo').value,
              subtitulo: document.getElementById('subtitulo').value,
              descricao: document.getElementById('descricao').value,
              texto_botao: document.getElementById('texto_botao').value,
              url_destino: document.getElementById('url_destino').value,
              ordem_exibicao: Number(document.getElementById('ordem_exibicao').value || 0),
              ativo: true,
            },
          }),
        });
        toast('Conteúdo salvo.');
        await refreshView();
      } else if (kind === 'imagem-principal' || kind === 'galeria' || kind === 'galeria-add') {
        const url = await uploadSelectedImage('site');
        await request('/api/admin/conteudo', {
          method: 'POST',
          body: JSON.stringify({
            acao: kind === 'galeria-add' ? 'adicionar_galeria' : 'substituir_imagem_principal',
            dados: {
              id_conteudo_site: resourceForm.dataset.id,
              url_imagem: url,
              texto_alternativo: document.getElementById('texto_alternativo').value,
              ativo: true,
            },
          }),
        });
        toast(kind === 'galeria-add' ? 'Imagem adicionada à galeria.' : 'Imagem principal substituída.');
        await refreshView();
      }
      formDialog.close();
    } catch (error) {
      formError(error.message || 'Não foi possível salvar.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel || 'Salvar';
      }
    }
  });

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    loginError.hidden = true;
    loginButton.disabled = true;
    loginButton.textContent = 'Entrando...';
    try {
      await request('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({
          email: document.getElementById('adminEmail').value,
          senha: document.getElementById('adminPassword').value,
        }),
      });
      loginForm.reset();
      await showApp();
    } catch (error) {
      loginError.hidden = false;
      loginError.textContent = error.status === 401 ? 'E-mail ou senha inválidos.' : 'Não foi possível entrar. Tente novamente.';
    } finally {
      loginButton.disabled = false;
      loginButton.textContent = 'Entrar';
    }
  });

  logoutButton.addEventListener('click', async () => {
    try { await request('/api/admin/logout', { method: 'POST' }); } catch { /* still return */ }
    showLogin();
  });

  document.querySelectorAll('.nav-btn[data-view]').forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.view));
  });
  menuToggle?.addEventListener('click', () => {
    if (adminSidebar.classList.contains('is-open')) closeDrawer();
    else openDrawer();
  });
  document.getElementById('sidebarClose')?.addEventListener('click', closeDrawer);
  sidebarBackdrop?.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && adminSidebar.classList.contains('is-open')) closeDrawer();
  });
  document.getElementById('sidebarCollapse')?.addEventListener('click', () => {
    const collapsed = !document.getElementById('appView').classList.contains('is-collapsed');
    applySidebarCollapsed(collapsed);
    writeSidebarCollapsed(window.localStorage, collapsed);
  });

  function showLogin() {
    appView.classList.add('hidden');
    loginView.classList.remove('hidden');
  }

  async function showApp() {
    loginView.classList.add('hidden');
    appView.classList.remove('hidden');
    applySidebarCollapsed(readSidebarCollapsed(window.localStorage));
    setView(state.view);
  }

  async function boot() {
    try {
      await request('/api/admin/catalogo');
      await showApp();
    } catch (error) {
      showLogin();
      if (error.status && error.status !== 401) {
        loginError.hidden = false;
        loginError.textContent = 'Não foi possível carregar o painel.';
      }
    }
  }

  boot();
