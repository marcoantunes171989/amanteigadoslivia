import { readSidebarCollapsed, writeSidebarCollapsed, ENCOMENDA_TIPO_LABELS, QUANTIDADE_MINIMA_DEFAULT, QUANTIDADE_MINIMA_KEY, formatIsoToBrDate, formatWhatsAppMaskDisplay, normalizeQuantidadeMinimaMap } from './ui-core.js';
import {
  DATA_LOAD_ERROR_MESSAGE,
  DIALOG_CLOSE_LABEL,
  PROD_PUBLISH_CONFIRMATION,
  canAccessUsuarios,
  canEnableProductionUpdateButton,
  creatablePerfisFor,
  decideSessionErrorAction,
  perfilBadgeLabel,
  perfilFormLabel,
  publicationBadgeClass,
  publicationStatusLabel,
  releaseCheckTone,
  requestStatusBadgeClass,
  requestStatusLabel,
  saleStatusBadgeClass,
  saleStatusLabel,
  sessionDisplayName,
  shouldCloseDialogOnBackdrop,
} from './admin-session-ui.js';

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
    publications: ['Gestão', 'Publicações', 'Controle a validação e a promoção das versões homologadas para produção.'],
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
    promotionDryRun: null,
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
    auditPage: 1,
    auditPagination: { pagina: 1, limite: 10, total: 0, total_paginas: 1 },
    slugManual: false,
    pendingFile: null,
    sessao: null,
    formDirty: false,
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

  function svgIcon(d) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.8');
    path.setAttribute('stroke-linecap', 'round');
    svg.append(path);
    return svg;
  }

  function closeIconBtn(onClose) {
    return el('button', {
      type: 'button',
      className: 'dialog-close',
      'aria-label': DIALOG_CLOSE_LABEL,
      onClick: onClose,
    }, [svgIcon('M6 6l12 12M18 6 6 18')]);
  }

  function dialogFrame({ eyebrow, title, description, children, cancelLabel = 'Cancelar', submitLabel = 'Salvar', onClose, size = 'medium' }) {
    const close = onClose || (() => formDialog.close());
    formDialog.className = `admin-dialog is-${size}`;
    return el('div', { className: 'dialog-body' }, [
      el('header', { className: 'dialog-header' }, [
        el('div', { className: 'dialog-heading' }, [
          eyebrow ? el('p', { className: 'eyebrow', text: eyebrow }) : null,
          el('h2', { text: title }),
          description ? el('p', { className: 'dialog-description', text: description }) : null,
        ]),
        closeIconBtn(close),
      ]),
      el('div', { className: 'dialog-fields' }, [
        ...(Array.isArray(children) ? children : [children]),
        el('p', { id: 'formError', className: 'form-error', hidden: true }),
      ]),
      el('footer', { className: 'dialog-actions' }, [
        el('button', { className: 'btn btn-ghost', type: 'button', text: cancelLabel, onClick: close }),
        el('button', { className: 'btn btn-primary', type: 'submit', text: submitLabel }),
      ]),
    ]);
  }

  function createBtn(label, onClick) {
    return el('button', { className: 'btn btn-primary btn-create', type: 'button', onClick }, [
      svgIcon('M12 5v14M5 12h14'),
      el('span', { text: label }),
    ]);
  }

  function editBtn(onClick, label = 'Editar') {
    return el('button', { className: 'btn btn-ghost btn-small btn-edit', type: 'button', onClick }, [
      svgIcon('M4 20h4L18 10l-4-4L4 16v4Zm11-13 4 4'),
      el('span', { text: label }),
    ]);
  }

  function pageHeading(view, actions = []) {
    const titles = TITLES[view] || TITLES.overview;
    return el('div', { className: 'page-heading' }, [
      el('div', { className: 'page-heading-copy' }, [
        el('p', { className: 'eyebrow', text: titles[0] }),
        el('h2', { text: titles[1] }),
        el('p', { className: 'muted', text: titles[2] || '' }),
      ]),
      actions.filter(Boolean).length ? el('div', { className: 'page-heading-actions' }, actions.filter(Boolean)) : null,
    ]);
  }

  function markFormPristine() {
    state.formDirty = false;
  }

  function bindFormDirty() {
    markFormPristine();
  }

  function askTypedConfirm({ title, description, confirmPhrase, confirmLabel = 'Confirmar' }) {
    const dialog = document.getElementById('confirmDialog');
    const form = document.getElementById('confirmForm');
    if (!dialog || !form) return Promise.resolve(false);
    dialog.className = 'admin-dialog is-small';
    return new Promise((resolve) => {
      const finish = (value) => {
        dialog.close();
        resolve(value);
      };
      const typedInput = el('input', {
        id: 'typedConfirm',
        name: 'typed_confirm',
        type: 'text',
        autocomplete: 'off',
        spellcheck: 'false',
        required: true,
      });
      const submitBtn = el('button', { className: 'btn btn-primary', type: 'submit', text: confirmLabel, disabled: true });
      typedInput.addEventListener('input', () => {
        submitBtn.disabled = typedInput.value !== confirmPhrase;
      });
      form.replaceChildren(el('div', { className: 'dialog-body' }, [
        el('div', { className: 'dialog-header' }, [
          el('div', { className: 'dialog-heading' }, [
            el('p', { className: 'eyebrow', text: 'Confirmação de alto risco' }),
            el('h2', { text: title }),
            description ? el('p', { className: 'dialog-description', text: description }) : null,
          ]),
          closeIconBtn(() => finish(false)),
        ]),
        el('div', { className: 'dialog-fields' }, [
          field('typed_confirm', `Digite ${confirmPhrase}`, typedInput),
        ]),
        el('div', { className: 'dialog-actions' }, [
          el('button', { className: 'btn btn-ghost', type: 'button', text: 'Cancelar', onClick: () => finish(false) }),
          submitBtn,
        ]),
      ]));
      const onSubmit = (event) => {
        event.preventDefault();
        if (typedInput.value !== confirmPhrase) return;
        form.removeEventListener('submit', onSubmit);
        finish(true);
      };
      form.addEventListener('submit', onSubmit);
      dialog.showModal();
      typedInput.focus();
    });
  }

  function askConfirm({ title, description, confirmLabel = 'Confirmar', danger = false }) {
    const dialog = document.getElementById('confirmDialog');
    const form = document.getElementById('confirmForm');
    if (!dialog || !form) return Promise.resolve(false);
    dialog.className = 'admin-dialog is-small';
    return new Promise((resolve) => {
      const finish = (value) => {
        dialog.close();
        resolve(value);
      };
      form.replaceChildren(el('div', { className: 'dialog-body' }, [
        el('div', { className: 'dialog-header' }, [
          el('div', { className: 'dialog-heading' }, [
            el('p', { className: 'eyebrow', text: 'Confirmação' }),
            el('h2', { text: title }),
            description ? el('p', { className: 'dialog-description', text: description }) : null,
          ]),
          closeIconBtn(() => finish(false)),
        ]),
        el('div', { className: 'dialog-fields' }),
        el('div', { className: 'dialog-actions' }, [
          el('button', { className: 'btn btn-ghost', type: 'button', value: 'cancel', text: 'Cancelar', onClick: () => finish(false) }),
          el('button', { className: danger ? 'btn btn-danger' : 'btn btn-primary', type: 'submit', value: 'confirm', text: confirmLabel }),
        ]),
      ]));
      const onSubmit = (event) => {
        event.preventDefault();
        form.removeEventListener('submit', onSubmit);
        finish(true);
      };
      form.addEventListener('submit', onSubmit);
      dialog.showModal();
    });
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

  function formatDateOnly(value) {
    if (!value) return '—';
    return formatIsoToBrDate(value) || '—';
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
      const action = decideSessionErrorAction(response.status);
      if (action === 'login' && !String(url).includes('/api/admin/login')) {
        showLogin();
      }
      throw error;
    }
    return payload;
  }

  function hideDataError() {
    document.getElementById('dataErrorBanner')?.classList.add('hidden');
  }

  function showDataError() {
    document.getElementById('dataErrorBanner')?.classList.remove('hidden');
  }

  function applySessionChrome() {
    const usersNav = document.getElementById('navUsers');
    const allowed = canAccessUsuarios(currentSession());
    usersNav?.classList.toggle('hidden', !allowed);
    if (!allowed && state.view === 'users') {
      state.view = 'overview';
    }
    renderAdminUser();
  }

  async function logout() {
    closeUserSheet();
    try { await request('/api/admin/logout', { method: 'POST' }); } catch { /* still return */ }
    showLogin();
  }

  function closeUserSheet(options = {}) {
    const sheet = document.getElementById('adminUserMenu');
    const trigger = document.getElementById('adminUserTrigger');
    if (sheet) sheet.hidden = true;
    trigger?.setAttribute('aria-expanded', 'false');
    if (options.restoreFocus) trigger?.focus();
  }

  function isPhoneAdmin() {
    return window.matchMedia('(max-width: 720px)').matches;
  }

  function renderAdminUser() {
    const mount = document.getElementById('adminUser');
    if (!mount) return;
    const session = currentSession();
    if (!session.id_usuario_admin && !session.email) {
      mount.hidden = true;
      mount.replaceChildren();
      return;
    }
    mount.hidden = false;
    const name = sessionDisplayName(session);
    const menu = document.getElementById('adminUserMenu');
    const wasOpen = Boolean(menu && !menu.hidden);
    mount.replaceChildren(
      el('button', {
        type: 'button',
        className: 'admin-user-trigger',
        id: 'adminUserTrigger',
        'aria-haspopup': 'menu',
        'aria-expanded': wasOpen ? 'true' : 'false',
        'aria-controls': 'adminUserMenu',
        'aria-label': `Conta de ${name}`,
        onClick: (event) => {
          event.stopPropagation();
          const sheet = document.getElementById('adminUserMenu');
          const trigger = document.getElementById('adminUserTrigger');
          const willOpen = Boolean(sheet?.hidden);
          if (sheet) sheet.hidden = !willOpen;
          trigger?.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        },
      }, [
        el('span', { className: 'admin-user-name', text: name }),
        el('span', { className: 'admin-user-chevron', 'aria-hidden': 'true' }, [svgIcon('M6 9l6 6 6-6')]),
      ]),
      el('div', {
        className: 'admin-user-sheet',
        id: 'adminUserMenu',
        hidden: !wasOpen,
        role: 'menu',
        'aria-label': 'Menu da conta',
        onClick: (event) => event.stopPropagation(),
      }, [
        el('button', {
          className: 'admin-user-logout',
          type: 'button',
          role: 'menuitem',
          onClick: logout,
        }, [
          svgIcon('M15 5h4v14h-4M10 12h9M12 8l4 4-4 4'),
          el('span', { text: 'Sair' }),
        ]),
      ]),
    );
  }

  function closeDrawer() {
    adminSidebar.classList.remove('is-open');
    sidebarBackdrop.classList.add('hidden');
    document.body.classList.remove('drawer-locked');
    menuToggle?.setAttribute('aria-expanded', 'false');
  }

  function openDrawer() {
    closeUserSheet();
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
    closeUserSheet();
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
    if (state.catalog?.sessao) {
      applySessaoPayload({
        usuario: {
          ...currentSession(),
          ...state.catalog.sessao,
        },
      });
    }
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
    params.set('pagina', String(state.auditPage || 1));
    params.set('limite', '10');
    const payload = await request(`/api/admin/auditoria?${params}`);
    state.auditoria = payload.eventos || [];
    state.auditPagination = payload.paginacao || { pagina: 1, limite: 10, total: 0, total_paginas: 1 };
  }

  async function loadPublications() {
    state.publicacoes = await request('/api/admin/publicacoes');
  }

  async function loadContent() {
    state.conteudo = await request('/api/admin/conteudo');
  }

  async function loadRequests() {
    const payload = await request('/api/admin/solicitacoes');
    state.solicitacoes = payload.solicitacoes || [];
  }

  function filteredRequests() {
    if (!state.requestStatus) return state.solicitacoes;
    return state.solicitacoes.filter((item) => item.status_solicitacao === state.requestStatus);
  }

  async function refreshView() {
    hideDataError();
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
      const action = decideSessionErrorAction(error.status);
      if (action === 'login') {
        showLogin();
        return;
      }
      if (action === 'retry') {
        showDataError();
        toast(DATA_LOAD_ERROR_MESSAGE, false);
        return;
      }
      if (action === 'forbidden') {
        toast(error.message || 'Sem permissão para esta ação.', false);
        return;
      }
      if (action === 'rate_limit') {
        toast(error.message || 'Muitas tentativas. Tente novamente em instantes.', false);
        return;
      }
      toast(error.message || DATA_LOAD_ERROR_MESSAGE, false);
    }
  }

  function renderOverview() {
    const dash = state.reports?.dashboard || {};
    const hoje = dash.hoje || {};
    const catalogo = state.reports?.catalogo || {};
    views.overview.replaceChildren(
      pageHeading('overview'),
      el('section', { className: 'overview-section' }, [
        el('h3', { text: 'Indicadores' }),
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
      ]),
      el('section', { className: 'overview-section' }, [
        el('h3', { text: 'Atividade e pedidos' }),
        el('div', { className: 'cards' }, [
          metric('Pedidos 7 dias', dash.dias_7?.pedidos),
          metric('Faturamento 7 dias', money(dash.dias_7?.faturamento_centavos)),
          metric('Pedidos 30 dias', dash.dias_30?.pedidos),
          metric('Faturamento 30 dias', money(dash.dias_30?.faturamento_centavos)),
        ]),
        el('div', { className: 'env-grid' }, [
          el('article', { className: 'card' }, [
            el('span', { text: 'Vendas por dia' }),
            chart(state.reports?.vendas?.por_dia || [], 'pedidos'),
          ]),
          el('article', { className: 'card' }, [
            el('span', { text: 'Faturamento por dia' }),
            chart(state.reports?.vendas?.por_dia || [], 'faturamento_centavos'),
          ]),
        ]),
        el('article', { className: 'card' }, [
          el('span', { text: 'Produtos mais vendidos' }),
          (state.reports?.produtos || []).length
            ? el('div', { className: 'table-wrap' }, [simpleTable(['Produto', 'Qtd', 'Receita'], (state.reports.produtos || []).slice(0, 8).map((item) => [item.nome_produto, item.quantidade, money(item.receita_centavos)]))])
            : emptyState('Nenhuma venda encontrada para este período.'),
        ]),
      ]),
      el('section', { className: 'overview-section' }, [
        el('h3', { text: 'Atalhos' }),
        el('div', { className: 'cards' }, [
          el('article', { className: 'card' }, [
            el('span', { text: 'Catálogo' }),
            el('div', { className: 'actions' }, [
              el('button', { className: 'btn btn-ghost btn-small', type: 'button', text: 'Categorias', onClick: () => setView('categories') }),
              el('button', { className: 'btn btn-ghost btn-small', type: 'button', text: 'Produtos', onClick: () => setView('products') }),
            ]),
          ]),
          el('article', { className: 'card' }, [
            el('span', { text: 'Operação' }),
            el('div', { className: 'actions' }, [
              el('button', { className: 'btn btn-ghost btn-small', type: 'button', text: 'Solicitações', onClick: () => setView('requests') }),
              el('button', { className: 'btn btn-ghost btn-small', type: 'button', text: 'Relatórios', onClick: () => setView('reports') }),
            ]),
          ]),
        ]),
      ]),
      el('section', { className: 'overview-section' }, [
        el('h3', { text: 'Estado do sistema' }),
        el('div', { className: 'cards' }, [
          metric('Ativos no catálogo', catalogo.produtos_ativos ?? dash.produtos_ativos),
          metric('Sem imagem', catalogo.sem_imagem),
          metric('Sem preço vigente', catalogo.sem_preco_vigente),
          metric('Promoções ativas', catalogo.promocoes_ativas ?? dash.promocoes_ativas),
        ]),
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
      pageHeading('categories', [
        createBtn('+ Nova categoria', () => openCategoryForm()),
      ]),
      el('div', { className: 'toolbar' }, [
        el('p', { className: 'muted', text: `${rows.length} categoria(s)` }),
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
      editBtn(() => openCategoryForm(category)),
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
      pageHeading('products', [
        createBtn('+ Novo produto', () => openProductForm()),
      ]),
      el('div', { className: 'toolbar' }, [
        el('input', { className: 'search-input', type: 'search', placeholder: 'Buscar por nome', value: state.productQuery, onInput: (event) => { state.productQuery = event.target.value; renderProducts(); } }),
        el('div', { className: 'filters' }, ['todos', 'ativos', 'inativos', 'destaques'].map((filter) => (
          el('button', { className: `chip${state.productFilter === filter ? ' is-active' : ''}`, type: 'button', text: filter[0].toUpperCase() + filter.slice(1), onClick: () => { state.productFilter = filter; renderProducts(); } })
        ))),
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
      editBtn(() => openProductForm(product)),
      el('button', { className: 'btn btn-ghost btn-small', type: 'button', text: product.ativo ? 'Desativar' : 'Ativar', onClick: () => mutate('produto', product.ativo ? 'desativar' : 'ativar', product.id_produto) }),
    ]);
  }

  function configValue(chave) {
    return (state.conteudo.configuracoes || []).find((item) => item.chave_configuracao === chave)?.valor_texto || '';
  }

  function configJson(chave) {
    return (state.conteudo.configuracoes || []).find((item) => item.chave_configuracao === chave)?.valor_json || null;
  }

  function contentsFor(secao, tipo) {
    return (state.conteudo.conteudos || []).filter((item) => item.secao === secao && (!tipo || item.tipo_conteudo === tipo));
  }

  function contentCard(item) {
    const principal = item.imagem_principal || (item.imagens || []).find((image) => image.principal === true) || null;
    const excerpt = String(item.descricao || item.subtitulo || '').slice(0, 140);
    return el('article', { className: 'card content-admin-card' }, [
      el('div', { className: 'content-preview' }, [
        principal
          ? el('img', { src: principal.url_imagem, alt: principal.texto_alternativo || item.titulo || '' })
          : el('span', { className: 'muted', text: 'Sem imagem' }),
      ]),
      el('div', { className: 'card-copy' }, [
        el('span', { className: 'eyebrow', text: item.tipo_conteudo }),
        el('strong', { text: item.titulo || item.tipo_conteudo }),
        excerpt ? el('p', { text: excerpt }) : null,
        badge(item.ativo !== false),
      ]),
      el('div', { className: 'actions' }, [
        editBtn(() => openContentForm(item)),
      ]),
    ]);
  }

  function renderContentView() {
    const view = state.view;
    const target = views[view];
    if (!target) return;
    if (view === 'branding') {
      target.replaceChildren(
        pageHeading('branding'),
        el('div', { className: 'content-admin-grid' }, [
          brandingEditor('logo_topo_url', 'Logo do topo', configValue('logo_topo_url'), true, 'round'),
          brandingEditor('logo_rodape_url', 'Logo do rodapé', configValue('logo_rodape_url'), true, 'wide'),
          brandingEditor('whatsapp_telefone', 'WhatsApp comercial', configValue('whatsapp_telefone'), false),
        ]),
      );
      return;
    }
    const secao = view === 'homeContent' ? 'HOME' : view === 'encomendasContent' ? 'ENCOMENDAS' : view === 'festasContent' ? 'FESTAS' : 'PERSONALIZADOS';
    const items = contentsFor(secao);
    if (view === 'encomendasContent') {
      const chamada = items.find((item) => item.tipo_conteudo === 'CHAMADA') || items[0];
      const galeria = items.find((item) => item.tipo_conteudo === 'GALERIA');
      target.replaceChildren(
        pageHeading(view, [createBtn('+ Novo conteúdo', () => openContentForm({ secao, tipo_conteudo: 'CHAMADA' }))]),
        el('div', { className: 'content-admin-grid' }, [
          chamada ? contentCard(chamada) : emptyState('Nenhum conteúdo nesta seção.'),
          chamada ? imageSlotCard('Imagem principal', chamada) : null,
          galeria ? gallerySlotCard(galeria) : null,
          minimaCard(),
        ].filter(Boolean)),
      );
      return;
    }
    const homeImages = view === 'homeContent'
      ? [
        brandingEditor('hero_imagem_url', 'Imagem do hero', configValue('hero_imagem_url'), true, 'wide'),
        brandingEditor('descubra_imagem_url', 'Imagem de “Descubra nossos amanteigados”', configValue('descubra_imagem_url'), true, 'wide'),
      ]
      : [];
    target.replaceChildren(
      pageHeading(view, [
        createBtn('+ Novo conteúdo', () => openContentForm({ secao, tipo_conteudo: secao === 'FESTAS' ? 'CARD' : 'CHAMADA' })),
      ]),
      el('div', { className: 'content-admin-grid' }, homeImages.concat(items.length ? items.map(contentCard) : [emptyState('Nenhum conteúdo nesta seção.')])),
    );
  }

  function imageSlotCard(title, item) {
    const principal = item.imagem_principal || (item.imagens || []).find((image) => image.principal === true) || null;
    return el('article', { className: 'card content-admin-card' }, [
      el('strong', { text: title }),
      el('div', { className: 'content-preview' }, [
        principal ? el('img', { src: principal.url_imagem, alt: principal.texto_alternativo || title }) : el('span', { className: 'muted', text: 'Sem imagem no slot' }),
      ]),
      el('div', { className: 'actions' }, [
        editBtn(() => openPrincipalImageForm(item, principal), 'Editar imagem'),
      ]),
    ]);
  }

  function gallerySlotCard(item) {
    const galeria = item.galeria || (item.imagens || []).filter((image) => image.principal !== true);
    return el('article', { className: 'card content-admin-card' }, [
      el('strong', { text: 'Galeria' }),
      el('span', { className: 'muted', text: item.titulo || 'Galeria da seção' }),
      galeria.length
        ? el('div', { className: 'thumbs' }, galeria.slice(0, 6).map((image) => thumb(image.url_imagem, image.texto_alternativo)))
        : el('span', { className: 'muted', text: 'Nenhuma imagem extra' }),
      el('div', { className: 'actions' }, [
        editBtn(() => openContentForm(item)),
        el('button', { className: 'btn btn-ghost btn-small', type: 'button', text: '+ Adicionar à galeria', onClick: () => openGalleryAddForm(item) }),
      ]),
    ]);
  }

  function minimaCard() {
    const current = normalizeQuantidadeMinimaMap(configJson(QUANTIDADE_MINIMA_KEY) || QUANTIDADE_MINIMA_DEFAULT);
    const fields = Object.entries(ENCOMENDA_TIPO_LABELS).map(([tipo, label]) => field(`minima_${tipo}`, label, el('input', {
      id: `minima_${tipo}`,
      type: 'number',
      min: '1',
      max: '10000',
      step: '1',
      value: String(current[tipo] || 1),
    })));
    return el('article', { className: 'card' }, [
      el('strong', { text: 'Quantidades mínimas' }),
      el('p', { className: 'muted', text: 'Defina o mínimo por tipo de solicitação.' }),
      el('div', { className: 'minima-grid' }, fields),
      el('button', { className: 'btn btn-primary', type: 'button', text: 'Salvar quantidades mínimas', onClick: saveMinima }),
    ]);
  }

  async function saveMinima() {
    const valor_json = {};
    for (const tipo of Object.keys(ENCOMENDA_TIPO_LABELS)) {
      const parsed = Number.parseInt(document.getElementById(`minima_${tipo}`)?.value || '1', 10);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10000) {
        toast('Informe um inteiro entre 1 e 10000.', false);
        return;
      }
      valor_json[tipo] = parsed;
    }
    await request('/api/admin/conteudo', {
      method: 'POST',
      body: JSON.stringify({
        acao: 'salvar_configuracao',
        dados: { chave_configuracao: QUANTIDADE_MINIMA_KEY, valor_json },
      }),
    });
    toast('Quantidades mínimas salvas.');
    await refreshView();
  }

  function brandingEditor(chave, label, value, isImage = true, shape = 'wide') {
    return el('article', { className: 'card content-admin-card' }, [
      el('strong', { text: label }),
      isImage ? el('div', { className: `brand-preview-shell ${shape === 'round' ? 'is-round' : 'is-wide'}` }, [
        value ? el('img', { src: value, alt: label }) : el('span', { className: 'muted', text: 'Sem imagem' }),
      ]) : null,
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
    resourceForm.replaceChildren(dialogFrame({
      eyebrow: 'Conteúdo',
      title: item.id_conteudo_site ? 'Editar conteúdo' : 'Novo conteúdo',
      description: 'Atualize textos, ordem e destino do bloco.',
      submitLabel: item.id_conteudo_site ? 'Atualizar conteúdo' : 'Salvar conteúdo',
      size: 'medium',
      children: [
        field('secao', 'Seção', el('select', { id: 'secao' }, ['HOME', 'ENCOMENDAS', 'FESTAS', 'PERSONALIZADOS'].map((value) => el('option', { value, text: value, selected: (item.secao || '') === value })))),
        field('tipo_conteudo', 'Tipo', el('select', { id: 'tipo_conteudo' }, ['CHAMADA', 'DESTAQUE', 'GALERIA', 'CARD'].map((value) => el('option', { value, text: value, selected: (item.tipo_conteudo || '') === value })))),
        field('titulo', 'Título', input('titulo', { value: item.titulo || '' })),
        field('subtitulo', 'Subtítulo', input('subtitulo', { value: item.subtitulo || '' })),
        field('descricao', 'Descrição', el('textarea', { id: 'descricao', name: 'descricao', text: item.descricao || '' })),
        field('texto_botao', 'Texto do botão', input('texto_botao', { value: item.texto_botao || '' })),
        field('url_destino', 'Destino / chave', input('url_destino', { value: item.url_destino || '' })),
        field('ordem_exibicao', 'Ordem', input('ordem_exibicao', { type: 'number', value: String(item.ordem_exibicao ?? 0) })),
      ],
    }));
    resourceForm.dataset.kind = 'conteudo';
    resourceForm.dataset.id = item.id_conteudo_site || '';
    bindFormDirty(resourceForm);
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
    resourceForm.replaceChildren(dialogFrame({
      eyebrow: 'Conteúdo',
      title,
      description: 'Envie um arquivo local ou informe uma URL segura.',
      submitLabel,
      size: 'medium',
      children: [
        field('url_imagem', 'URL da imagem', input('url_imagem', { value: url || '' })),
        field('arquivo_imagem', 'Upload local', el('input', { id: 'arquivo_imagem', type: 'file', accept: 'image/jpeg,image/png,image/webp' })),
        field('texto_alternativo', 'Texto alternativo', input('texto_alternativo', { value: alt || '' })),
        el('img', { id: 'imagePreview', className: 'preview hidden', alt: '' }),
        el('input', { type: 'hidden', id: 'origem_imagem', value: 'url' }),
      ],
    }));
    resourceForm.dataset.kind = kind;
    resourceForm.dataset.id = item.id_conteudo_site;
    state.pendingFile = null;
    bindImagePreview();
    bindFormDirty(resourceForm);
    formDialog.showModal();
  }

  function openGalleryForm(item) {
    openPrincipalImageForm(item, item.imagem_principal || item.imagens?.[0]);
  }

  function requestActions(item, statuses) {
    return el('div', { className: 'actions' }, statuses.map((status) => el('button', {
      className: 'btn btn-ghost btn-small',
      type: 'button',
      text: requestStatusLabel(status),
      onClick: async () => {
        await request('/api/admin/solicitacoes', { method: 'POST', body: JSON.stringify({ id_solicitacao_encomenda: item.id_solicitacao_encomenda, status_solicitacao: status }) });
        toast('Status atualizado.');
        refreshView();
      },
    })));
  }

  function renderRequests() {
    const statuses = ['NOVA', 'EM_ATENDIMENTO', 'CONCLUIDA', 'CANCELADA'];
    const rows = filteredRequests();
    const counts = Object.fromEntries(statuses.map((status) => [
      status,
      state.solicitacoes.filter((item) => item.status_solicitacao === status).length,
    ]));
    views.requests.replaceChildren(
      pageHeading('requests'),
      el('div', { className: 'request-kpis' }, statuses.map((status) => el('article', {
        className: `card${state.requestStatus === status ? ' is-active' : ''}`,
        onClick: () => { state.requestStatus = status; renderRequests(); },
      }, [
        el('span', { text: requestStatusLabel(status) }),
        el('strong', { text: String(counts[status] || 0) }),
      ]))),
      el('div', { className: 'filters' }, statuses.map((status) => el('button', {
        className: `chip${state.requestStatus === status ? ' is-active' : ''}`,
        type: 'button',
        text: requestStatusLabel(status),
        onClick: () => { state.requestStatus = status; renderRequests(); },
      }))),
      el('div', { className: 'table-wrap' }, [
        rows.length
          ? el('table', {}, [
            el('thead', {}, [el('tr', {}, ['Cliente', 'Tipo', 'Data', 'Quantidade', 'Status', 'Ação'].map((h) => el('th', { text: h })))]),
            el('tbody', {}, rows.map((item) => el('tr', {}, [
              el('td', { text: item.nome_cliente }),
              el('td', { text: ENCOMENDA_TIPO_LABELS[item.tipo_solicitacao] || item.tipo_solicitacao }),
              el('td', { text: formatDateOnly(item.data_evento || item.data_criacao) }),
              el('td', { text: String(item.quantidade_estimada || '—') }),
              el('td', {}, [el('span', { className: `badge ${requestStatusBadgeClass(item.status_solicitacao)}`, text: requestStatusLabel(item.status_solicitacao) })]),
              el('td', {}, [
                el('div', { className: 'actions' }, [
                  editBtn(() => openRequestDetail(item), 'Abrir'),
                ]),
              ]),
            ]))),
          ])
          : emptyState('Nenhuma solicitação neste filtro.'),
        rows.length ? el('div', { className: 'request-cards' }, rows.map((item) => el('article', { className: 'mobile-card' }, [
          el('strong', { text: item.nome_cliente }),
          el('span', { className: 'muted', text: `${ENCOMENDA_TIPO_LABELS[item.tipo_solicitacao] || item.tipo_solicitacao} · ${formatDateOnly(item.data_evento || item.data_criacao)}` }),
          el('span', { text: `Qtd: ${item.quantidade_estimada || '—'}` }),
          el('span', { className: `badge ${requestStatusBadgeClass(item.status_solicitacao)}`, text: requestStatusLabel(item.status_solicitacao) }),
          editBtn(() => openRequestDetail(item), 'Abrir'),
        ]))) : null,
      ]),
    );
  }

  function openRequestDetail(item) {
    const statuses = ['NOVA', 'EM_ATENDIMENTO', 'CONCLUIDA', 'CANCELADA'];
    resourceForm.replaceChildren(dialogFrame({
      eyebrow: 'Operação',
      title: 'Detalhe da solicitação',
      description: ENCOMENDA_TIPO_LABELS[item.tipo_solicitacao] || item.tipo_solicitacao,
      submitLabel: 'Atualizar status',
      size: 'medium',
      children: [
        el('input', { type: 'hidden', id: 'id_solicitacao_encomenda', value: item.id_solicitacao_encomenda }),
        field('detalhe_nome', 'Nome', el('input', { id: 'detalhe_nome', value: item.nome_cliente || '', disabled: true })),
        field('detalhe_whatsapp', 'WhatsApp', el('input', { id: 'detalhe_whatsapp', value: formatWhatsAppMaskDisplay(item.telefone_cliente) || item.telefone_cliente || '', disabled: true })),
        field('detalhe_email', 'E-mail', el('input', { id: 'detalhe_email', value: item.email_cliente || '—', disabled: true })),
        field('detalhe_tipo', 'Tipo', el('input', { id: 'detalhe_tipo', value: ENCOMENDA_TIPO_LABELS[item.tipo_solicitacao] || item.tipo_solicitacao, disabled: true })),
        field('detalhe_data', 'Data', el('input', { id: 'detalhe_data', value: formatDateOnly(item.data_evento), disabled: true })),
        field('detalhe_qtd', 'Quantidade', el('input', { id: 'detalhe_qtd', value: String(item.quantidade_estimada || '—'), disabled: true })),
        field('detalhe_desc', 'Descrição', el('textarea', { id: 'detalhe_desc', disabled: true, text: item.descricao_pedido || '' })),
        field('status_solicitacao', 'Status', el('select', { id: 'status_solicitacao' }, statuses.map((status) => el('option', {
          value: status,
          text: requestStatusLabel(status),
          selected: item.status_solicitacao === status,
        })))),
        field('detalhe_criada', 'Criada em', el('input', { id: 'detalhe_criada', value: formatDate(item.data_criacao), disabled: true })),
      ],
    }));
    resourceForm.dataset.kind = 'solicitacao';
    resourceForm.dataset.id = item.id_solicitacao_encomenda;
    bindFormDirty(resourceForm);
    formDialog.showModal();
  }

  function renderSales() {
    views.sales.replaceChildren(
      pageHeading('sales'),
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
          text: status === 'todos' ? 'Todos' : saleStatusLabel(status),
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
            el('td', {}, [el('span', { className: `badge ${saleStatusBadgeClass(venda.status_venda)}`, text: saleStatusLabel(venda.status_venda) })]),
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
          el('span', { className: `badge ${saleStatusBadgeClass(venda.status_venda)}`, text: saleStatusLabel(venda.status_venda) }),
          venda.status_venda === 'PENDENTE' ? el('div', { className: 'actions' }, [
            el('button', { className: 'btn btn-primary btn-small', type: 'button', text: 'Confirmar', onClick: () => changeSale(venda.id_venda, 'CONFIRMADA') }),
            el('button', { className: 'btn btn-danger btn-small', type: 'button', text: 'Cancelar', onClick: () => changeSale(venda.id_venda, 'CANCELADA') }),
          ]) : null,
        ]))) : null,
      ]),
    );
  }

  async function changeSale(id, status) {
    const confirmed = await askConfirm({
      title: status === 'CONFIRMADA' ? 'Confirmar esta venda?' : 'Cancelar esta venda?',
      description: status === 'CONFIRMADA' ? 'O pedido passará para Confirmada.' : 'O pedido será marcado como Cancelada.',
      confirmLabel: status === 'CONFIRMADA' ? 'Confirmar venda' : 'Cancelar venda',
      danger: status !== 'CONFIRMADA',
    });
    if (!confirmed) return;
    await request('/api/admin/vendas', { method: 'POST', body: JSON.stringify({ id_venda: id, status_venda: status }) });
    toast('Venda atualizada.');
    refreshView();
  }

  function renderReports() {
    const reports = state.reports || {};
    const tabs = [
      ['visao', 'Resumo'],
      ['vendas', 'Vendas'],
      ['produtos', 'Produtos'],
      ['auditoria', 'Auditoria'],
    ];
    views.reports.replaceChildren(
      pageHeading('reports'),
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
      el('div', { className: 'report-panel' }, [reportBody(reports)]),
    );
  }

  function reportBody(reports) {
    if (state.reportTab === 'visao') {
      return el('div', { className: 'cards' }, [
        metric('Pedidos', reports.visao_geral?.pedidos),
        metric('Vendas confirmadas', reports.visao_geral?.vendas_confirmadas),
        metric('Faturamento', money(reports.visao_geral?.faturamento_centavos)),
        metric('Ticket médio', money(reports.visao_geral?.ticket_medio_centavos)),
        metric('Produtos ativos', reports.catalogo?.produtos_ativos),
        metric('Promoções ativas', reports.catalogo?.promocoes_ativas),
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

  function publicationResumo(item) {
    const raw = item?.resumo_json;
    if (raw && typeof raw === 'object') return raw;
    if (typeof raw === 'string' && raw) {
      try { return JSON.parse(raw); } catch { return {}; }
    }
    return {};
  }

  function shaCopyRow(sha, label = 'SHA') {
    const value = String(sha || '').trim();
    if (!value) return el('p', { text: `${label}: —` });
    return el('div', { className: 'release-sha-row' }, [
      el('p', {}, [
        el('span', { text: `${label}: ` }),
        el('code', { className: 'release-sha', text: value }),
      ]),
      el('button', {
        className: 'btn btn-ghost btn-small',
        type: 'button',
        text: 'Copiar',
        onClick: async () => {
          try {
            await navigator.clipboard.writeText(value);
            toast('SHA copiado.');
          } catch {
            toast('Não foi possível copiar o SHA.', false);
          }
        },
      }),
    ]);
  }

  function renderReleaseChecks(checks) {
    if (!Array.isArray(checks) || !checks.length) return null;
    return el('ul', { className: 'release-checks' }, checks.map((item) => el('li', {
      className: `release-check is-${releaseCheckTone(item.status)}`,
    }, [
      el('span', { className: `badge badge-${releaseCheckTone(item.status) === 'pass' ? 'ok' : releaseCheckTone(item.status) === 'warn' ? 'warn' : 'off'}`, text: item.status }),
      el('strong', { text: item.id }),
      el('span', { text: item.mensagem }),
    ])));
  }

  function renderPublications() {
    const data = state.publicacoes || {};
    const homolog = data.homolog || {};
    const producao = data.producao || {};
    const homologOnline = Boolean(homolog.database_status || homolog.git_sha);
    const prodOnline = producao.pronta === true;
    const canUpdate = canEnableProductionUpdateButton({
      session: currentSession(),
      producao,
      dryRunStatus: state.promotionDryRun?.status,
    });
    const blockedTitle = 'Produção ainda não está habilitada para promoção.';
    views.publications.replaceChildren(
      pageHeading('publications'),
      el('div', { className: 'release-flow' }, [
        el('article', { className: 'card release-card' }, [
          el('div', { className: 'env-status' }, [
            el('span', { className: `status-dot ${homologOnline ? 'is-online' : 'is-offline'}`, 'aria-hidden': 'true' }),
            el('strong', { text: 'HOMOLOGAÇÃO' }),
            el('span', { className: homologOnline ? 'badge badge-ok' : 'badge badge-off', text: homologOnline ? 'Online' : 'Indisponível' }),
          ]),
          el('p', { className: 'release-version', text: `Versão homologada: ${homolog.git_sha || '—'}` }),
          shaCopyRow(homolog.git_sha),
          el('p', { text: `Vercel: ${homolog.vercel_status || '—'}` }),
          el('p', { text: `Database: ${homolog.database_status || '—'}` }),
          el('p', { text: `Migrations: ${(homolog.migrations || []).join(', ') || '—'}` }),
          el('p', { text: `Categorias ativas: ${homolog.categorias_ativas ?? 0}` }),
          el('p', { text: `Produtos ativos: ${homolog.produtos_ativos ?? 0}` }),
          el('p', { text: `Última alteração: ${formatDate(homolog.ultima_alteracao_catalogo)}` }),
        ]),
        el('div', { className: 'release-arrow', 'aria-hidden': 'true', text: '→' }),
        el('article', { className: 'card release-card' }, [
          el('div', { className: 'env-status' }, [
            el('span', { className: `status-dot ${prodOnline ? 'is-online' : 'is-offline'}`, 'aria-hidden': 'true' }),
            el('strong', { text: 'PRODUÇÃO' }),
            el('span', { className: prodOnline ? 'badge badge-ok' : 'badge badge-off', text: producao.badge || 'BLOQUEADA' }),
          ]),
          el('p', { text: `Status: ${producao.status || 'Produção não habilitada'}` }),
          shaCopyRow(producao.git_sha),
          el('p', { className: 'muted', text: producao.mensagem || 'Prepare o ambiente de produção antes de liberar a promoção.' }),
          (producao.bloqueios || []).length
            ? el('ul', { className: 'release-blocks' }, producao.bloqueios.map((item) => el('li', { text: item })))
            : null,
        ]),
      ]),
      el('div', { className: 'toolbar release-actions' }, [
        el('button', { className: 'btn btn-ghost', type: 'button', text: 'Validar promoção', onClick: validatePromo }),
        el('button', {
          className: 'btn btn-primary',
          type: 'button',
          text: 'Atualizar produção',
          disabled: !canUpdate,
          title: canUpdate ? 'Atualizar produção com o SHA homologado' : blockedTitle,
          onClick: updateProduction,
        }),
      ]),
      el('p', { className: 'muted', text: 'Agendamento disponível após habilitar produção.' }),
      state.promotionDryRun
        ? el('article', { className: 'card' }, [
          el('span', { text: 'Validação da promoção' }),
          el('p', {}, [
            el('span', { className: `badge ${state.promotionDryRun.status === 'VALIDADA' ? 'badge-ok' : 'badge-off'}`, text: state.promotionDryRun.status }),
          ]),
          renderReleaseChecks(state.promotionDryRun.checks),
        ])
        : null,
      el('article', { className: 'card' }, [
        el('span', { text: 'Histórico' }),
        el('p', { className: 'muted', text: 'Validada → Agendada → Em execução → Publicada / Bloqueada / Erro' }),
        (data.publicacoes || []).length
          ? el('div', { className: 'pub-timeline' }, data.publicacoes.map((item) => {
            const resumo = publicationResumo(item);
            return el('article', { className: 'pub-timeline-item' }, [
              el('div', { className: 'pub-timeline-head' }, [
                el('span', { className: `badge ${publicationBadgeClass(item.status_publicacao)}`, text: publicationStatusLabel(item.status_publicacao) }),
                el('strong', { text: item.tipo_publicacao || resumo.acao || 'Publicação' }),
              ]),
              el('p', { text: formatDate(item.data_criacao || item.data_agendada) }),
              el('p', { text: `Usuário: ${resumo.nome_usuario || item.id_usuario_admin || '—'}` }),
              el('p', { text: `SHA: ${item.git_sha || '—'}` }),
              el('p', { className: 'muted', text: item.mensagem_erro || 'Sem mensagem adicional.' }),
            ]);
          }))
          : emptyState('Nenhuma publicação registrada.'),
      ]),
    );
  }

  async function validatePromo() {
    const homologSha = state.publicacoes?.homolog?.git_sha || null;
    const result = await request('/api/admin/publicacoes', {
      method: 'POST',
      body: JSON.stringify({ acao: 'validar', git_sha: homologSha }),
    });
    state.promotionDryRun = result;
    toast(result.motivo || result.status, result.status === 'VALIDADA');
    renderPublications();
  }

  async function updateProduction() {
    const producao = state.publicacoes?.producao || {};
    if (!canEnableProductionUpdateButton({
      session: currentSession(),
      producao,
      dryRunStatus: state.promotionDryRun?.status,
    })) {
      toast('Produção ainda não está habilitada para promoção.', false);
      return;
    }
    const sha = state.publicacoes?.homolog?.git_sha;
    const confirmed = await askTypedConfirm({
      title: 'Atualizar produção?',
      description: `Origem: HOMOLOGAÇÃO\nDestino: PRODUÇÃO\nSHA: ${sha || '—'}`,
      confirmPhrase: PROD_PUBLISH_CONFIRMATION,
      confirmLabel: 'Atualizar produção',
    });
    if (!confirmed) return;
    try {
      await request('/api/admin/publicacoes', {
        method: 'POST',
        body: JSON.stringify({
          acao: 'publicar',
          tipo_publicacao: 'CATALOGO',
          git_sha: sha,
          confirmacao: PROD_PUBLISH_CONFIRMATION,
        }),
      });
      toast('Promoção registrada.');
      await refreshView();
    } catch (error) {
      toast(error.payload?.message || error.payload?.error || 'Produção ainda não habilitada.', false);
      if (error.payload?.checks) {
        state.promotionDryRun = error.payload;
        renderPublications();
      }
    }
  }

  function auditQuery(extra = {}) {
    const params = new URLSearchParams();
    if (state.auditPeriod) params.set('periodo', state.auditPeriod);
    if (state.auditUser) params.set('usuario', state.auditUser);
    if (state.auditAction) params.set('acao', state.auditAction);
    if (state.auditEntity) params.set('entidade', state.auditEntity);
    if (state.auditResult) params.set('sucesso', state.auditResult);
    Object.entries(extra).forEach(([key, value]) => {
      if (value != null && value !== '') params.set(key, String(value));
    });
    return params;
  }

  function renderAudit() {
    const page = state.auditPagination || { pagina: 1, limite: 10, total: 0, total_paginas: 1 };
    const setFilter = (mutate) => {
      mutate();
      state.auditPage = 1;
      refreshView();
    };
    views.audit.replaceChildren(
      pageHeading('audit'),
      el('div', { className: 'audit-filters' }, [
        field('auditPeriod', 'Período', el('select', {
          id: 'auditPeriod', value: state.auditPeriod,
          onChange: (event) => setFilter(() => { state.auditPeriod = event.target.value; }),
        }, [
          el('option', { value: '', text: 'Todos' }),
          el('option', { value: 'hoje', text: 'Hoje', selected: state.auditPeriod === 'hoje' }),
          el('option', { value: '7d', text: '7 dias', selected: state.auditPeriod === '7d' }),
          el('option', { value: '30d', text: '30 dias', selected: state.auditPeriod === '30d' }),
          el('option', { value: 'mes', text: 'Este mês', selected: state.auditPeriod === 'mes' }),
        ])),
        field('auditUser', 'Usuário', el('input', {
          id: 'auditUser', type: 'search', placeholder: 'Nome ou e-mail', value: state.auditUser,
          onChange: (event) => setFilter(() => { state.auditUser = event.target.value; }),
        })),
        field('auditAction', 'Ação', el('input', {
          id: 'auditAction', type: 'search', placeholder: 'LOGIN_SUCESSO', value: state.auditAction,
          onChange: (event) => setFilter(() => { state.auditAction = event.target.value; }),
        })),
        field('auditEntity', 'Entidade', el('input', {
          id: 'auditEntity', type: 'search', placeholder: 'produto', value: state.auditEntity,
          onChange: (event) => setFilter(() => { state.auditEntity = event.target.value; }),
        })),
        field('auditResult', 'Resultado', el('select', {
          id: 'auditResult',
          onChange: (event) => setFilter(() => { state.auditResult = event.target.value; }),
        }, [
          el('option', { value: '', text: 'Todos' }),
          el('option', { value: 'true', text: 'Sucesso', selected: state.auditResult === 'true' }),
          el('option', { value: 'false', text: 'Falha', selected: state.auditResult === 'false' }),
        ])),
      ]),
      el('div', { className: 'toolbar' }, [
        el('button', { className: 'btn btn-ghost', type: 'button', text: 'Exportar CSV', onClick: () => { window.location.href = `/api/admin/auditoria?${auditQuery({ formato: 'csv' })}`; } }),
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
        el('div', { className: 'pagination' }, [
          el('button', {
            className: 'btn btn-ghost btn-small',
            type: 'button',
            text: '← Anterior',
            disabled: page.pagina <= 1,
            onClick: () => { if (page.pagina > 1) { state.auditPage = page.pagina - 1; refreshView(); } },
          }),
          el('span', { text: `Página ${page.pagina} de ${page.total_paginas}` }),
          el('button', {
            className: 'btn btn-ghost btn-small',
            type: 'button',
            text: 'Próxima →',
            disabled: page.pagina >= page.total_paginas,
            onClick: () => { if (page.pagina < page.total_paginas) { state.auditPage = page.pagina + 1; refreshView(); } },
          }),
        ]),
      ]),
    );
  }

  function renderUsers() {
    const canCreate = creatablePerfisFor(currentSession()).length > 0;
    views.users.replaceChildren(
      pageHeading('users', [
        canCreate
          ? el('button', { className: 'btn btn-primary btn-create', type: 'button', onClick: () => openUserForm() }, [
            svgIcon('M12 5v14M5 12h14'),
            el('span', { text: '+ Novo usuário' }),
          ])
          : null,
      ]),
      el('div', { className: 'table-wrap' }, [
        state.usuarios.length ? el('table', {}, [
          el('thead', {}, [el('tr', {}, ['Nome', 'E-mail', 'Perfil', 'Status', 'Protegido', 'Último login', 'Ações'].map((h) => el('th', { text: h })))]),
          el('tbody', {}, state.usuarios.map((user) => el('tr', {}, [
            el('td', {}, [
              el('span', { text: user.nome_usuario }),
              isSelfUser(user) ? el('span', { className: 'badge badge-you', text: 'Você' }) : null,
            ]),
            el('td', { text: user.email_usuario }),
            el('td', {}, [userBadges(user)]),
            el('td', {}, [badge(user.ativo)]),
            el('td', { text: user.protegido ? 'Sim' : 'Não' }),
            el('td', { text: formatDate(user.data_ultimo_login) }),
            el('td', {}, [userActions(user)]),
          ]))),
        ]) : emptyState('Nenhum usuário cadastrado.'),
        state.usuarios.length ? el('div', { className: 'user-cards' }, state.usuarios.map((user) => el('article', { className: 'mobile-card' }, [
          el('strong', { text: user.nome_usuario }),
          isSelfUser(user) ? el('span', { className: 'badge badge-you', text: 'Você' }) : null,
          el('span', { text: user.email_usuario }),
          userBadges(user),
          badge(user.ativo),
          el('span', { text: user.protegido ? 'Protegido: sim' : 'Protegido: não' }),
          el('span', { text: `Último login: ${formatDate(user.data_ultimo_login)}` }),
          userActions(user),
        ]))) : null,
      ]),
    );
  }

  function userActions(user) {
    const nodes = [];
    if (canEditUser(user)) {
      nodes.push(editBtn(() => openUserForm(user)));
    }
    if (canResetUserPassword(user)) {
      nodes.push(el('button', { className: 'btn btn-ghost btn-small', type: 'button', text: 'Redefinir senha', onClick: () => openPasswordResetForm(user) }));
    }
    return el('div', { className: 'actions' }, nodes);
  }

  function canEditUser(user) {
    const session = currentSession();
    if (user?.protegido) return isSelfUser(user) && session.perfil === 'SUPER_ADMIN';
    if (isRootSuperAdminSession(session)) return true;
    if (session.perfil === 'SUPER_ADMIN') return user?.perfil_usuario !== 'SUPER_ADMIN';
    if (session.perfil === 'ADMIN') return user?.perfil_usuario === 'GESTOR';
    return false;
  }

  function canResetUserPassword(user) {
    if (user?.protegido) return canResetProtectedPassword(user);
    return canEditUser(user);
  }

  function userBadges(user) {
    const nodes = [
      el('span', {
        className: `badge ${user.perfil_usuario === 'SUPER_ADMIN' ? 'badge-root' : user.perfil_usuario === 'ADMIN' ? 'badge-ok' : 'badge-warn'}`,
        text: perfilBadgeLabel(user.perfil_usuario),
      }),
    ];
    if (user.protegido) nodes.push(el('span', { className: 'badge badge-ok', text: 'PROTEGIDO' }));
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
    resourceForm.replaceChildren(dialogFrame({
      eyebrow: 'Catálogo',
      title: category ? 'Editar categoria' : 'Nova categoria',
      description: category ? 'Atualize os dados da categoria do cardápio.' : 'Crie uma categoria para organizar o cardápio.',
      submitLabel: category ? 'Atualizar categoria' : 'Salvar categoria',
      size: 'medium',
      children: [
        el('input', { type: 'hidden', name: 'id_categoria', value: category?.id_categoria || '' }),
        field('nome', 'Nome *', input('nome', { required: true, value: category?.nome_categoria || '' })),
        field('slug', 'Slug *', input('slug', { required: true, value: category?.slug_categoria || '' })),
        field('descricao', 'Descrição', el('textarea', { id: 'descricao', name: 'descricao', rows: '3' })),
        field('ordem', 'Ordem', input('ordem', { type: 'number', min: '0', value: String(category?.ordem_exibicao ?? 0) })),
        checkbox('ativo', 'Ativo', category ? category.ativo : true),
        category ? scheduleFields() : null,
      ],
    }));
    resourceForm.descricao.value = category?.descricao_categoria || '';
    bindSlugSync(resourceForm.nome, resourceForm.slug);
    bindFormDirty(resourceForm);
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
    resourceForm.replaceChildren(dialogFrame({
      eyebrow: 'Catálogo',
      title: product ? 'Editar produto' : 'Novo produto',
      description: product ? 'Atualize informações, imagem, preço e disponibilidade.' : 'Cadastre um produto do cardápio.',
      submitLabel: product ? 'Atualizar produto' : 'Salvar produto',
      size: 'large',
      children: [
        el('input', { type: 'hidden', name: 'id_produto', value: product?.id_produto || '' }),
        el('section', { className: 'form-section' }, [
          el('h3', { text: 'Informações' }),
          el('div', { className: 'form-grid' }, [
            field('nome', 'Nome *', input('nome', { required: true, value: product?.nome_produto || '' }), true),
            field('slug', 'Slug *', input('slug', { required: true, value: product?.slug_produto || '' })),
            field('descricao', 'Descrição', el('textarea', { id: 'descricao', name: 'descricao', rows: '3' }), true),
          ]),
        ]),
        el('section', { className: 'form-section' }, [
          el('h3', { text: 'Comercial' }),
          el('div', { className: 'form-grid' }, [
            field('id_categoria', 'Categoria *', el('select', { id: 'id_categoria', name: 'id_categoria', required: true }, [el('option', { value: '', text: 'Selecione' }), ...options])),
            field('ordem', 'Ordem de exibição', input('ordem', { type: 'number', min: '0', value: String(product?.ordem_exibicao ?? 0) })),
          ]),
        ]),
        el('section', { className: 'form-section' }, [
          el('h3', { text: 'Imagem' }),
          field('origem_imagem', 'Origem', el('select', { id: 'origem_imagem', name: 'origem_imagem' }, [
            el('option', { value: 'url', text: 'Informar URL' }),
            el('option', { value: 'arquivo', text: 'Enviar arquivo' }),
          ])),
          field('url_imagem', 'URL da imagem', input('url_imagem', { placeholder: 'https://... ou assets/...', value: product?.url_imagem_principal || '' })),
          field('arquivo_imagem', 'Selecionar imagem do computador', input('arquivo_imagem', { type: 'file', accept: 'image/jpeg,image/png,image/webp' })),
          el('img', { id: 'imagePreview', className: 'preview hidden', alt: 'Pré-visualização da imagem' }),
        ]),
        el('section', { className: 'form-section' }, [
          el('h3', { text: 'Preço' }),
          el('div', { className: 'form-grid' }, [
            field('preco_normal', 'Preço normal *', input('preco_normal', { required: true, inputmode: 'decimal', placeholder: '24,90', value: product?.preco_normal || '' })),
          ]),
        ]),
        el('section', { className: 'form-section' }, [
          el('h3', { text: 'Promoção' }),
          el('div', { className: 'form-grid' }, [
            field('preco_promocional', 'Preço promocional', input('preco_promocional', { inputmode: 'decimal', placeholder: '21,90', value: product?.preco_promocional || '' })),
          ]),
          el('div', { className: 'checkboxes' }, [
            checkbox('promocao_ativa', 'Promoção ativa', Boolean(product?.promocao_ativa)),
          ]),
        ]),
        el('section', { className: 'form-section' }, [
          el('h3', { text: 'Disponibilidade' }),
          el('div', { className: 'checkboxes' }, [
            checkbox('destaque', 'Destaque', Boolean(product?.destaque)),
            checkbox('ativo', 'Ativo', product ? product.ativo : true),
          ]),
        ]),
        product ? scheduleFields() : null,
      ],
    }));
    resourceForm.descricao.value = product?.descricao_produto || '';
    bindSlugSync(resourceForm.nome, resourceForm.slug);
    bindImagePreview();
    bindFormDirty(resourceForm);
    resourceForm.dataset.kind = 'produto';
    formDialog.showModal();
  }

  function openUserForm(user) {
    const protectedUser = user?.protegido === true;
    const session = currentSession();
    const createPerfis = user ? [] : creatablePerfisFor(session);
    const editPerfis = protectedUser
      ? ['SUPER_ADMIN']
      : (isRootSuperAdminSession(session) ? ['SUPER_ADMIN', 'ADMIN', 'GESTOR'] : creatablePerfisFor(session));
    const perfis = user ? editPerfis : createPerfis;
    resourceForm.replaceChildren(dialogFrame({
      eyebrow: 'Gestão',
      title: user ? 'Editar usuário' : 'Novo usuário',
      description: user ? 'Atualize os dados de acesso.' : 'Crie um acesso para o painel.',
      submitLabel: user ? 'Atualizar usuário' : 'Salvar usuário',
      size: 'small',
      children: [
        el('input', { type: 'hidden', name: 'id_usuario_admin', value: user?.id_usuario_admin || '' }),
        field('nome', 'Nome *', input('nome', { required: true, value: user?.nome_usuario || '' })),
        field('email', 'E-mail *', input('email', { type: 'email', required: true, value: user?.email_usuario || '' })),
        protectedUser
          ? el('p', { className: 'muted', text: 'SUPER ADMIN protegido. Perfil, proteção e status não podem ser alterados.' })
          : field('perfil', 'Perfil *', el('select', { id: 'perfil', name: 'perfil', required: true }, perfis.map((perfil) => el('option', {
            value: perfil,
            text: perfilFormLabel(perfil),
            selected: (user?.perfil_usuario || perfis[0]) === perfil,
          })))),
        user
          ? null
          : field('senha', 'Senha *', input('senha', { type: 'password', required: true, minlength: '10', autocomplete: 'new-password' })),
        user
          ? null
          : field('senha_confirmacao', 'Confirmar senha *', input('senha_confirmacao', { type: 'password', required: true, minlength: '10', autocomplete: 'new-password' })),
        protectedUser ? null : checkbox('ativo', 'Status ativo', user ? user.ativo : true),
      ],
    }));
    resourceForm.dataset.kind = 'usuario';
    bindFormDirty(resourceForm);
    formDialog.showModal();
  }

  function isRootSuperAdminSession(session) {
    return session?.perfil === 'SUPER_ADMIN' && session?.protegido === true;
  }

  function openPasswordResetForm(user) {
    resourceForm.replaceChildren(dialogFrame({
      eyebrow: 'Gestão',
      title: 'Redefinir senha',
      description: user?.email_usuario || '',
      submitLabel: 'Salvar senha',
      size: 'small',
      children: [
        el('input', { type: 'hidden', name: 'id_usuario_admin', value: user?.id_usuario_admin || '' }),
        field('senha', 'Nova senha *', input('senha', { type: 'password', required: true, minlength: '10', autocomplete: 'new-password' })),
        field('senha_confirmacao', 'Confirmar senha *', input('senha_confirmacao', { type: 'password', required: true, minlength: '10', autocomplete: 'new-password' })),
      ],
    }));
    resourceForm.dataset.kind = 'reset-senha';
    bindFormDirty(resourceForm);
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
      const action = decideSessionErrorAction(error.status);
      if (action === 'login') showLogin();
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

  resourceForm.addEventListener('input', () => { state.formDirty = true; });
  resourceForm.addEventListener('change', () => { state.formDirty = true; });
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
        const senha = String(data.get('senha') || '');
        const senhaConfirmacao = String(data.get('senha_confirmacao') || '');
        if (!id && senha !== senhaConfirmacao) {
          formError('A confirmação da senha não confere.');
          return;
        }
        const payload = {
          nome: String(data.get('nome') || ''),
          email: String(data.get('email') || ''),
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
          toast('Usuário atualizado.');
        } else {
          payload.senha = senha;
          const created = await request('/api/admin/usuarios', { method: 'POST', body: JSON.stringify({ acao: 'criar', dados: payload }) });
          if (created?.usuario?.senha || created?.senha) {
            throw new Error('Resposta inválida do servidor.');
          }
          toast('Usuário criado.');
        }
        await refreshView();
      } else if (kind === 'reset-senha') {
        const id = data.get('id_usuario_admin');
        const senha = String(data.get('senha') || '');
        const senhaConfirmacao = String(data.get('senha_confirmacao') || '');
        if (senha !== senhaConfirmacao) {
          formError('A confirmação da senha não confere.');
          return;
        }
        const result = await request('/api/admin/usuarios', { method: 'POST', body: JSON.stringify({ acao: 'redefinir_senha', id, senha }) });
        if (result?.senha || result?.usuario?.senha) {
          throw new Error('Resposta inválida do servidor.');
        }
        toast('Senha atualizada.');
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
      } else if (kind === 'solicitacao') {
        const id = resourceForm.dataset.id;
        const status = document.getElementById('status_solicitacao')?.value;
        await request('/api/admin/solicitacoes', {
          method: 'POST',
          body: JSON.stringify({ id_solicitacao_encomenda: id, status_solicitacao: status }),
        });
        toast('Status atualizado.');
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
      markFormPristine();
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
      const payload = await request('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({
          email: document.getElementById('adminEmail').value,
          senha: document.getElementById('adminPassword').value,
        }),
      });
      loginForm.reset();
      if (payload?.usuario) {
        state.sessao = {
          id_usuario_admin: payload.usuario.id_usuario_admin,
          email: payload.usuario.email_usuario,
          perfil: payload.usuario.perfil_usuario,
          protegido: payload.usuario.protegido === true,
          nome_usuario: payload.usuario.nome_usuario,
        };
      }
      await showApp();
    } catch (error) {
      loginError.hidden = false;
      loginError.textContent = error.status === 401 ? 'E-mail ou senha inválidos.' : 'Não foi possível entrar. Tente novamente.';
    } finally {
      loginButton.disabled = false;
      loginButton.textContent = 'Entrar';
    }
  });

  logoutButton?.addEventListener('click', logout);

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
    if (event.key === 'Escape') closeUserSheet({ restoreFocus: true });
  });
  document.addEventListener('click', (event) => {
    const trigger = document.getElementById('adminUserTrigger');
    const menu = document.getElementById('adminUserMenu');
    const insideTrigger = Boolean(trigger && trigger.contains(event.target));
    const insideMenu = Boolean(menu && menu.contains(event.target));
    if (!insideTrigger && !insideMenu) closeUserSheet();
  });
  formDialog.addEventListener('click', (event) => {
    if (event.target !== formDialog) return;
    if (!shouldCloseDialogOnBackdrop(state.formDirty)) return;
    formDialog.close();
  });
  document.getElementById('sidebarCollapse')?.addEventListener('click', () => {
    const collapsed = !document.getElementById('appView').classList.contains('is-collapsed');
    applySidebarCollapsed(collapsed);
    writeSidebarCollapsed(window.localStorage, collapsed);
  });

  function showLogin() {
    appView.classList.add('hidden');
    loginView.classList.remove('hidden');
    hideDataError();
  }

  async function showApp() {
    loginView.classList.add('hidden');
    appView.classList.remove('hidden');
    applySidebarCollapsed(readSidebarCollapsed(window.localStorage));
    applySessionChrome();
    setView(state.view);
  }

  function applySessaoPayload(payload) {
    const usuario = payload?.usuario || payload;
    if (!usuario) return;
    state.sessao = {
      id_usuario_admin: usuario.id_usuario_admin,
      email: usuario.email || usuario.email_usuario,
      perfil: usuario.perfil || usuario.perfil_usuario,
      protegido: usuario.protegido === true,
      nome_usuario: usuario.nome_usuario || state.sessao?.nome_usuario || null,
    };
    renderAdminUser();
  }

  async function boot() {
    try {
      const sessao = await request('/api/admin/sessao');
      applySessaoPayload(sessao);
      await showApp();
    } catch (error) {
      if (decideSessionErrorAction(error.status) === 'login') {
        showLogin();
        return;
      }
      await showApp();
      showDataError();
      toast(DATA_LOAD_ERROR_MESSAGE, false);
    }
  }

  document.getElementById('dataErrorRetry')?.addEventListener('click', () => {
    refreshView();
  });

  boot();
