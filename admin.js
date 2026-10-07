import { readSidebarCollapsed, writeSidebarCollapsed, ENCOMENDA_TIPO_LABELS, QUANTIDADE_MINIMA_DEFAULT, QUANTIDADE_MINIMA_KEY, formatIsoToBrDate, formatWhatsAppMaskDisplay, normalizeQuantidadeMinimaMap, isAgendamentoFuturo, saoPauloDateTimeParts } from './ui-core.js';
import {
  DATA_LOAD_ERROR_MESSAGE,
  DIALOG_CLOSE_LABEL,
  PROD_PUBLISH_CONFIRMATION,
  ambienteLabel,
  canAccessGestao,
  canAccessReportTab,
  canEnableProductionUpdateButton,
  creatablePerfisFor,
  decideSessionErrorAction,
  PIN_HINT,
  SENHA_HINT,
  isPerfilComPin,
  perfilBadgeLabel,
  perfilFormLabel,
  pinValidationMessage,
  publicationBadgeClass,
  publicationStatusLabel,
  releaseCheckTone,
  requestStatusBadgeClass,
  requestStatusLabel,
  resolveAllowedReportTab,
  resolveAllowedView,
  saleStatusBadgeClass,
  saleStatusLabel,
  sessionDisplayName,
  shouldCloseDialogOnBackdrop,
} from './admin-session-ui.js';
import {
  DASHBOARD_CUSTOM_ID,
  DASHBOARD_EMPTY_INSIGHTS,
  DASHBOARD_PERIODS,
  DASHBOARD_PERIOD_DEFAULT,
  buildDashboardModel,
  createLatestGate,
  customDashboardRange,
  dashboardQuery,
  dashboardRange,
  formatAxisBrl,
  formatAxisCount,
  formatBrl,
  formatDayKey,
  formatDeltaText,
  formatPercent,
  formatPeriodLabel,
  niceMax,
  previousDashboardRange,
  validateCustomPeriod,
} from './admin-dashboard.js';
import {
  VIEW_RESOURCES,
  createDirtyViews,
  createViewCache,
  createViewNavigator,
  isFormField,
} from './admin-view-cache.js';

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
    overview: ['Painel', 'Dashboard', 'Indicadores e desempenho da operação.'],
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

  // Última requisição de Dashboard vence: respostas antigas são descartadas (ver createLatestGate).
  const dashboardGate = createLatestGate();
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
    dashboardPeriod: DASHBOARD_PERIOD_DEFAULT,
    dashboard: null,
    dashboardCustom: { inicio: '', fim: '' },
    dashboardCustomRange: null,
    dashboardCustomError: '',
    dashboardLoading: false,
    dashboardError: false,
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

  // Cache só em memória (ver admin-view-cache.js). Limpo no logout para não vazar dados entre sessões.
  const viewCache = createViewCache();
  const viewDirty = createDirtyViews();

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

  function svgEl(tag, attrs = {}, children = []) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    node.append(...children);
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
    // Qualquer escrita torna os dados em memória vencidos: a próxima entrada na tela revalida em background.
    if (options.method && options.method !== 'GET') viewCache.invalidateAll();
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
    const session = currentSession();
    // Gestão só aparece para SUPER_ADMIN confirmado. O padrão no HTML já é oculto, então não há flash.
    document.querySelector('.nav-group[data-nav-group="gestao"]')?.classList.toggle('hidden', !canAccessGestao(session));
    state.view = resolveAllowedView(state.view, session);
    state.reportTab = resolveAllowedReportTab(state.reportTab, session);
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

  function activeNavGroup() {
    return document.querySelector(`.nav-group .nav-btn[data-view="${state.view}"]`)?.closest('.nav-group') ?? null;
  }

  // Accordion exclusivo: no máximo um grupo aberto. openGroup = null recolhe todos.
  function updateNavGroups(openGroup) {
    const activeGroup = activeNavGroup();
    document.querySelectorAll('.nav-group').forEach((group) => {
      const isOpen = group === openGroup;
      group.classList.toggle('is-open', isOpen);
      group.classList.toggle('has-active', group === activeGroup);
      group.querySelector('.nav-group-toggle')?.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
  }

  function setView(view) {
    // Acesso programático a view de Gestão sem SUPER_ADMIN cai no Dashboard (fail closed).
    view = resolveAllowedView(view, currentSession());
    state.view = view;
    document.querySelectorAll('.nav-btn[data-view]').forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    updateNavGroups(activeNavGroup());
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
    // Render imediato a partir do cache (ou esqueleto no 1º acesso); a revalidação não bloqueia o clique.
    enterView(view);
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

  // Loaders: só gravam em state se isCurrent() ainda for verdadeiro (resposta obsoleta não sobrescreve), e retornam se aplicaram.
  async function loadCatalog(isCurrent = () => true) {
    const catalog = await request('/api/admin/catalogo');
    if (!isCurrent()) return false;
    state.catalog = catalog;
    if (state.catalog?.sessao) {
      applySessaoPayload({
        usuario: {
          ...currentSession(),
          ...state.catalog.sessao,
        },
      });
    }
    return true;
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

  async function loadReports(isCurrent = () => true) {
    const reports = await request(`/api/admin/relatorios?${periodQuery()}`);
    if (!isCurrent()) return false;
    state.reports = reports;
    return true;
  }

  // Duas leituras de relatório em paralelo: período atual e anterior equivalente (só intervalo, sem backend novo).
  // O catálogo não depende do período e NÃO é recarregado aqui.
  // Retorna false quando a resposta já ficou obsoleta (o usuário trocou o período no meio).
  async function loadDashboard(range) {
    const latest = dashboardGate.next();
    state.dashboardLoading = true;
    state.dashboardError = false;
    try {
      const [atual, previo] = await Promise.all([
        request(`/api/admin/relatorios?${dashboardQuery(range)}`),
        request(`/api/admin/relatorios?${dashboardQuery(previousDashboardRange(range))}`),
      ]);
      if (!latest.isLatest()) return false;
      state.dashboard = { range, atual, anterior: previo };
      return true;
    } catch (error) {
      // Cancelamento por nova seleção não é erro para o usuário.
      if (!latest.isLatest()) return false;
      state.dashboardError = true;
      throw error;
    } finally {
      if (latest.isLatest()) state.dashboardLoading = false;
    }
  }

  // Período vigente da tela: presets sempre "agora"; personalizado só após "Aplicar".
  function currentDashboardRange() {
    if (state.dashboardPeriod === DASHBOARD_CUSTOM_ID && state.dashboardCustomRange) return state.dashboardCustomRange;
    if (state.dashboardPeriod === DASHBOARD_CUSTOM_ID) state.dashboardPeriod = DASHBOARD_PERIOD_DEFAULT;
    return dashboardRange(state.dashboardPeriod);
  }

  // Clique em preset: feedback visual imediato, depois a consulta. Personalizado só mostra os campos.
  function selectDashboardPeriod(id) {
    state.dashboardPeriod = id;
    state.dashboardCustomError = '';
    if (id === DASHBOARD_CUSTOM_ID) {
      keepDashboardFocus(renderDashboardToolbar);
      return;
    }
    refreshDashboardPeriod(dashboardRange(id));
  }

  function applyCustomDashboardPeriod() {
    const { inicio, fim } = state.dashboardCustom;
    state.dashboardCustomError = validateCustomPeriod(inicio, fim) || '';
    if (state.dashboardCustomError) {
      keepDashboardFocus(renderDashboardToolbar);
      return;
    }
    state.dashboardCustomRange = customDashboardRange(inicio, fim);
    refreshDashboardPeriod(state.dashboardCustomRange);
  }

  async function refreshDashboardPeriod(range) {
    // loadDashboard marca "atualizando" de forma síncrona antes do primeiro await, então o toolbar já reflete o estado.
    const pending = loadDashboard(range);
    keepDashboardFocus(renderDashboardToolbar);
    try {
      if (await pending && state.view === 'overview') renderOverview();
    } catch (error) {
      if (state.view === 'overview') keepDashboardFocus(renderDashboardToolbar);
      if (decideSessionErrorAction(error.status) === 'login') {
        showLogin();
        return;
      }
      toast(error.message || DATA_LOAD_ERROR_MESSAGE, false);
    }
  }

  // Mantém o foco no controle que o usuário usava quando o cabeçalho é reconstruído.
  function keepDashboardFocus(render) {
    const key = document.activeElement?.dataset?.focusKey;
    render();
    if (key) views.overview.querySelector(`[data-focus-key="${key}"]`)?.focus({ preventScroll: true });
  }

  async function loadSales(isCurrent = () => true) {
    const payload = await request(`/api/admin/vendas?periodo=${encodeURIComponent(state.salesPeriod)}&status=${encodeURIComponent(state.salesStatus)}`);
    if (!isCurrent()) return false;
    state.vendas = payload.vendas || [];
    return true;
  }

  async function loadUsers(isCurrent = () => true) {
    const payload = await request('/api/admin/usuarios');
    if (!isCurrent()) return false;
    state.usuarios = payload.usuarios || [];
    return true;
  }

  function auditFetchQuery() {
    const params = new URLSearchParams();
    if (state.auditPeriod) params.set('periodo', state.auditPeriod);
    if (state.auditUser) params.set('usuario', state.auditUser);
    if (state.auditAction) params.set('acao', state.auditAction);
    if (state.auditEntity) params.set('entidade', state.auditEntity);
    if (state.auditResult) params.set('sucesso', state.auditResult);
    params.set('pagina', String(state.auditPage || 1));
    params.set('limite', '10');
    return params;
  }

  async function loadAudit(isCurrent = () => true) {
    const payload = await request(`/api/admin/auditoria?${auditFetchQuery()}`);
    if (!isCurrent()) return false;
    state.auditoria = payload.eventos || [];
    state.auditPagination = payload.paginacao || { pagina: 1, limite: 10, total: 0, total_paginas: 1 };
    return true;
  }

  async function loadPublications(isCurrent = () => true) {
    const publicacoes = await request('/api/admin/publicacoes');
    if (!isCurrent()) return false;
    state.publicacoes = publicacoes;
    return true;
  }

  async function loadContent(isCurrent = () => true) {
    const conteudo = await request('/api/admin/conteudo');
    if (!isCurrent()) return false;
    state.conteudo = conteudo;
    return true;
  }

  async function loadRequests(isCurrent = () => true) {
    const payload = await request('/api/admin/solicitacoes');
    if (!isCurrent()) return false;
    state.solicitacoes = payload.solicitacoes || [];
    return true;
  }

  const RESOURCE_LOADERS = {
    catalog: (isCurrent) => loadCatalog(isCurrent),
    dashboard: () => loadDashboard(currentDashboardRange()),
    content: (isCurrent) => loadContent(isCurrent),
    sales: (isCurrent) => loadSales(isCurrent),
    requests: (isCurrent) => loadRequests(isCurrent),
    reports: (isCurrent) => loadReports(isCurrent),
    publications: (isCurrent) => loadPublications(isCurrent),
    audit: (isCurrent) => loadAudit(isCurrent),
    users: (isCurrent) => loadUsers(isCurrent),
  };

  // Chave do cache: identifica o filtro/período que gerou os dados. Dados de outro filtro não são reaproveitados.
  function cacheKeyOf(resource) {
    switch (resource) {
      case 'sales': return `${state.salesPeriod}|${state.salesStatus}`;
      case 'reports': return periodQuery().toString();
      case 'audit': return auditFetchQuery().toString();
      case 'dashboard': {
        const custom = state.dashboardCustomRange;
        if (state.dashboardPeriod === DASHBOARD_CUSTOM_ID && custom) return `custom|${custom.inicio.getTime()}|${custom.fim.getTime()}`;
        return state.dashboardPeriod;
      }
      default: return 'default';
    }
  }

  async function loadResource(name, isCurrent) {
    const applied = await RESOURCE_LOADERS[name](isCurrent);
    if (applied) viewCache.mark(name, cacheKeyOf(name));
    return applied;
  }

  // Pinta a view a partir de state (já carregado). Só a view ativa é desenhada.
  function renderOverviewIfCurrent(dashboardAtual) {
    if (dashboardAtual && state.view === 'overview') renderOverview();
  }

  function paintView(view) {
    if (view === 'overview') renderOverviewIfCurrent(state.dashboard);
    else if (view === 'categories') renderCategories();
    else if (view === 'products') renderProducts();
    else if (['branding', 'homeContent', 'encomendasContent', 'festasContent', 'personalizadosContent'].includes(view)) renderContentView();
    else if (view === 'sales') renderSales();
    else if (view === 'requests') renderRequests();
    else if (view === 'reports') renderReports();
    else if (view === 'publications') renderPublications();
    else if (view === 'audit') renderAudit();
    else if (view === 'users') renderUsers();
  }

  // Primeiro acesso sem dados: estrutura da tela imediatamente, sem overlay e sem bloquear o menu.
  function renderViewSkeleton(view) {
    views[view].replaceChildren(
      pageHeading(view),
      el('div', { className: 'view-skeleton', role: 'status', 'aria-live': 'polite', 'aria-label': 'Carregando dados' }, [
        el('div', { className: 'skeleton view-skeleton-block' }),
        el('div', { className: 'skeleton view-skeleton-line' }),
        el('div', { className: 'skeleton view-skeleton-line' }),
      ]),
    );
  }

  function renderViewLoadError(view) {
    views[view].replaceChildren(pageHeading(view), emptyState(DATA_LOAD_ERROR_MESSAGE));
  }

  function filteredRequests() {
    if (!state.requestStatus) return state.solicitacoes;
    return state.solicitacoes.filter((item) => item.status_solicitacao === state.requestStatus);
  }

  // Ao reentrar (clique no menu): pinta o que já está em memória e revalida só o vencido. Ver admin-view-cache.js.
  const viewNavigator = createViewNavigator({
    cache: viewCache,
    dirty: viewDirty,
    currentView: () => state.view,
    resourcesFor: (view) => VIEW_RESOURCES[view] || [],
    keyOf: cacheKeyOf,
    load: loadResource,
    paint: paintView,
    skeleton: renderViewSkeleton,
    onError: handleViewError,
  });

  function enterView(view) {
    hideDataError();
    return viewNavigator.enter(view);
  }

  // Recarga explícita (ação do usuário, escrita ou erro "Tentar novamente"): sempre renderiza o resultado.
  function refreshView() {
    hideDataError();
    return viewNavigator.refresh(state.view);
  }

  function handleViewError(error, { view, hasData }) {
    const action = decideSessionErrorAction(error.status);
    if (action === 'login') {
      showLogin();
      return;
    }
    // Com dados anteriores, a tela continua visível; sem dados, mostra o estado de erro no lugar do esqueleto.
    if (!hasData) renderViewLoadError(view);
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

  // Logout/401: nada de dados administrativos em memória para a próxima sessão.
  function clearAdminData() {
    viewCache.clear();
    viewDirty.clearAll();
    state.catalog = { resumo: {}, categorias: [], produtos: [] };
    state.reports = null;
    state.vendas = [];
    state.solicitacoes = [];
    state.conteudo = { configuracoes: [], conteudos: [] };
    state.usuarios = [];
    state.auditoria = [];
    state.publicacoes = null;
    state.dashboard = null;
  }

  function renderOverview() {
    const data = state.dashboard;
    if (!data) return;
    const model = buildDashboardModel({
      range: data.range,
      atual: data.atual,
      anterior: data.anterior,
      catalogoProdutos: state.catalog.produtos || [],
    });
    const fin = model.financeiro;
    const sections = [
      dashSection('Resultado do período', [
        el('div', { className: 'dash-kpis' }, [
          kpiCard('Faturamento', formatBrl(fin.faturamento.atual), fin.faturamento, 'money'),
          kpiCard('Pedidos', String(fin.pedidos.atual), fin.pedidos, 'count'),
          kpiCard('Ticket médio', formatBrl(fin.ticket.atual), fin.ticket, 'money'),
          kpiCard('Vendas confirmadas', String(fin.confirmadas.atual), fin.confirmadas, 'count'),
        ]),
      ]),
      dashSection('Catálogo atual', [
        el('div', { className: 'dash-kpis dash-kpis--compact' }, [
          metric('Produtos ativos', model.catalogo.produtos_ativos),
          metric('Categorias ativas', model.catalogo.categorias_ativas),
          metric('Produtos em destaque', model.catalogo.destaques),
          metric('Promoções ativas', model.catalogo.promocoes_ativas),
        ]),
        el('p', { className: 'dash-note', text: `${model.catalogo.sem_imagem} sem imagem · ${model.catalogo.sem_preco_vigente} sem preço vigente` }),
      ]),
      dashSection('Evolução', [
        el('div', { className: 'dash-grid' }, [
          dashCard('Faturamento por dia', model.temFaturamento
            ? revenueChart(model.serie)
            : dashEmpty('Sem vendas confirmadas no período', 'Os gráficos serão exibidos assim que houver vendas confirmadas.')),
          dashCard('Pedidos por dia', model.temPedidos
            ? orderBars(model.serie)
            : dashEmpty('Sem pedidos no período', 'Os gráficos serão exibidos assim que houver pedidos.')),
        ]),
      ]),
      dashSection('Vendas e produtos', [
        el('div', { className: 'dash-grid' }, [
          dashCard('Produtos mais vendidos', model.topProdutos.length
            ? rankingList(model.topProdutos)
            : dashEmpty('Sem produtos vendidos', 'O ranking aparece quando houver vendas confirmadas.')),
          dashCard('Vendas por categoria', model.categorias.length
            ? categoryList(model.categorias)
            : dashEmpty('Sem categorias vendidas', 'A distribuição aparece quando houver vendas confirmadas.')),
        ]),
      ]),
      dashSection('Insights e desempenho', [
        el('div', { className: 'dash-grid' }, [
          dashCard('Insights', model.insights.length
            ? el('ul', { className: 'dash-insights' }, model.insights.map((text) => el('li', { text })))
            : el('p', { className: 'muted dash-note', text: DASHBOARD_EMPTY_INSIGHTS })),
          dashCard('Desempenho de produtos', performanceList(model)),
        ]),
      ]),
    ];
    keepDashboardFocus(() => views.overview.replaceChildren(dashboardToolbarNode(), ...sections));
    views.overview.setAttribute('aria-busy', String(state.dashboardLoading));
  }

  // Toolbar de período: nó próprio, trocado no lugar (não remonta os cards a cada clique).
  function renderDashboardToolbar() {
    const current = views.overview.querySelector(':scope > .dash-toolbar');
    const next = dashboardToolbarNode();
    if (current) current.replaceWith(next);
    else views.overview.prepend(next);
    views.overview.setAttribute('aria-busy', String(state.dashboardLoading));
  }

  function dashboardToolbarNode() {
    const selected = state.dashboardPeriod;
    const options = [...DASHBOARD_PERIODS, { id: DASHBOARD_CUSTOM_ID, label: 'Personalizado' }];
    const periodo = state.dashboard?.range ? formatPeriodLabel(state.dashboard.range) : '';
    let status = null;
    if (state.dashboardLoading) status = el('span', { className: 'dash-status', role: 'status', text: 'Atualizando...' });
    else if (state.dashboardError) status = el('span', { className: 'dash-status is-error', role: 'alert', text: 'Não foi possível atualizar o período. Selecione o período novamente para tentar outra vez.' });
    return el('div', { className: 'dash-toolbar' }, [
      el('div', { className: 'dash-toolbar-main' }, [
        el('div', { className: 'period-filters', role: 'group', 'aria-label': 'Período do dashboard' }, options.map((option) => el('button', {
          className: `chip${selected === option.id ? ' is-active' : ''}`,
          type: 'button',
          'aria-pressed': selected === option.id ? 'true' : 'false',
          'data-focus-key': `period:${option.id}`,
          text: option.label,
          onClick: () => selectDashboardPeriod(option.id),
        }))),
        dashboardCustomForm(selected === DASHBOARD_CUSTOM_ID),
      ]),
      el('div', { className: 'dash-toolbar-meta' }, [
        el('p', { className: 'dash-period', text: periodo ? `Período: ${periodo}` : '' }),
        status,
      ]),
    ]);
  }

  // Campos compactos do período personalizado. A consulta só roda em "Aplicar" (sem request a cada tecla).
  // Renderizado sempre (ativo ou não) para reservar a altura da linha no desktop/notebook e evitar
  // o "pulo" vertical do restante do dashboard ao alternar entre os períodos. Ver .dash-period-custom.is-inactive.
  function dashboardCustomForm(active) {
    const { inicio, fim } = state.dashboardCustom;
    const erro = active ? state.dashboardCustomError : null;
    const onDate = (field) => (event) => { state.dashboardCustom[field] = event.target.value; };
    return el('form', {
      className: `dash-period-custom${active ? '' : ' is-inactive'}`,
      novalidate: true,
      'aria-label': 'Período personalizado',
      'aria-hidden': active ? null : 'true',
      inert: active ? null : true,
      onSubmit: (event) => { event.preventDefault(); if (active) applyCustomDashboardPeriod(); },
    }, [
      el('label', { className: 'field' }, [
        el('span', { text: 'Data inicial' }),
        el('input', { type: 'date', name: 'inicio', value: inicio, disabled: !active, tabindex: active ? null : '-1', 'data-focus-key': 'custom:inicio', 'aria-invalid': erro ? 'true' : null, onInput: onDate('inicio'), onChange: onDate('inicio') }),
      ]),
      el('label', { className: 'field' }, [
        el('span', { text: 'Data final' }),
        el('input', { type: 'date', name: 'fim', value: fim, disabled: !active, tabindex: active ? null : '-1', 'data-focus-key': 'custom:fim', 'aria-invalid': erro ? 'true' : null, onInput: onDate('fim'), onChange: onDate('fim') }),
      ]),
      el('button', { type: 'submit', className: 'btn btn-primary btn-small', text: 'Aplicar', disabled: !active, tabindex: active ? null : '-1', 'data-focus-key': 'custom:apply' }),
      erro ? el('p', { className: 'dash-error', role: 'alert', text: erro }) : null,
    ]);
  }

  function dashSection(title, children) {
    return el('section', { className: 'dash-section' }, [el('h3', { text: title }), ...children]);
  }

  function dashCard(title, body, note = null) {
    return el('article', { className: 'card dash-card' }, [
      el('div', { className: 'dash-card-head' }, [
        el('h4', { text: title }),
        note ? el('span', { className: 'muted dash-note', text: note }) : null,
      ]),
      body,
    ]);
  }

  function kpiCard(label, value, delta, kind) {
    return el('article', { className: 'card dash-kpi' }, [
      el('span', { text: label }),
      el('strong', { text: value }),
      el('small', {
        className: `dash-delta is-${delta.base ? delta.status : 'none'}`,
        text: formatDeltaText(delta, kind),
      }),
    ]);
  }

  function dashEmpty(title, description) {
    return el('div', { className: 'dash-empty' }, [
      svgIcon('M4 19h16M7 16V9m5 7V5m5 11v-4'),
      el('strong', { text: title }),
      el('span', { text: description }),
    ]);
  }

  // Eixo X com rótulos espaçados (no máximo ~7) para não sobrepor em períodos longos.
  function xAxis(serie) {
    const step = Math.max(1, Math.ceil(serie.length / 7));
    return el('div', { className: 'dash-xaxis', 'aria-hidden': 'true' }, serie.map((row, index) => el('span', {
      text: index % step === 0 ? formatDayKey(row.dia) : '',
    })));
  }

  function chartFrame(max, axisFormat, plot, serie) {
    return el('div', { className: 'dash-chart' }, [
      el('div', { className: 'dash-yaxis', 'aria-hidden': 'true' }, [
        el('span', { text: axisFormat(max) }),
        el('span', { text: axisFormat(max / 2) }),
        el('span', { text: axisFormat(0) }),
      ]),
      el('div', { className: 'dash-plot-wrap' }, [plot, xAxis(serie)]),
    ]);
  }

  // Área/linha em SVG (escala 0-100 esticada) + pontos e colunas transparentes com tooltip nativo.
  function revenueChart(serie) {
    const max = niceMax(Math.max(0, ...serie.map((row) => row.faturamento_centavos)));
    const n = serie.length;
    const points = serie.map((row, index) => ({
      x: ((index + 0.5) / n) * 100,
      y: 100 - (max ? (row.faturamento_centavos / max) * 100 : 0),
    }));
    const line = points.map((p, index) => `${index ? 'L' : 'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
    const area = `${line} L${points[n - 1].x.toFixed(2)},100 L${points[0].x.toFixed(2)},100 Z`;
    const svg = svgEl('svg', { class: 'dash-line', viewBox: '0 0 100 100', preserveAspectRatio: 'none', 'aria-hidden': 'true' }, [
      svgEl('path', { class: 'dash-area', d: area }),
      svgEl('path', { class: 'dash-stroke', d: line }),
    ]);
    const dots = serie.map((row, index) => (row.faturamento_centavos > 0
      ? el('span', { className: 'dash-dot', style: `left:${points[index].x}%;bottom:${100 - points[index].y}%` })
      : null));
    const hits = serie.map((row) => el('div', {
      className: 'dash-col',
      title: `${formatDayKey(row.dia)}: ${formatBrl(row.faturamento_centavos)} (${row.confirmadas} confirmada(s))`,
    }));
    const plot = el('div', { className: 'dash-plot' }, [svg, ...dots, el('div', { className: 'dash-cols' }, hits)]);
    return chartFrame(max, formatAxisBrl, plot, serie);
  }

  function orderBars(serie) {
    const max = niceMax(Math.max(0, ...serie.map((row) => row.pedidos)));
    const cols = serie.map((row) => el('div', {
      className: 'dash-col',
      title: `${formatDayKey(row.dia)}: ${row.pedidos} pedido(s)`,
    }, [el('span', { className: 'dash-col-fill', style: `height:${max ? (row.pedidos / max) * 100 : 0}%` })]));
    const plot = el('div', { className: 'dash-plot' }, [el('div', { className: 'dash-cols' }, cols)]);
    return chartFrame(max, formatAxisCount, plot, serie);
  }

  function rankingList(items) {
    const maxQty = Math.max(1, ...items.map((item) => item.quantidade));
    return el('ol', { className: 'dash-rank' }, items.map((item, index) => el('li', {}, [
      el('span', { className: 'dash-rank-pos', text: String(index + 1), 'aria-hidden': 'true' }),
      el('div', { className: 'dash-rank-main' }, [
        el('strong', { text: item.nome_produto }),
        el('span', { className: 'muted', text: `${item.quantidade} un. · ${formatBrl(item.receita_centavos)} · ${formatPercent(item.participacao)} do faturamento` }),
        el('span', { className: 'dash-bar-track', 'aria-hidden': 'true' }, [
          el('span', { className: 'dash-bar-fill', style: `width:${(item.quantidade / maxQty) * 100}%` }),
        ]),
      ]),
    ])));
  }

  function categoryList(items) {
    return el('ul', { className: 'dash-rank' }, items.map((item) => el('li', {}, [
      el('span', { className: 'dash-rank-pos dash-rank-pos--muted', text: '•', 'aria-hidden': 'true' }),
      el('div', { className: 'dash-rank-main' }, [
        el('strong', { text: item.nome }),
        el('span', { className: 'muted', text: `${formatBrl(item.receita_centavos)} · ${formatPercent(item.participacao)} do faturamento · ${item.quantidade} un.` }),
        el('span', { className: 'dash-bar-track', 'aria-hidden': 'true' }, [
          el('span', { className: 'dash-bar-fill', style: `width:${Math.min(100, item.participacao || 0)}%` }),
        ]),
      ]),
    ])));
  }

  function performanceList(model) {
    if (!model.temFaturamento) {
      return dashEmpty('Sem vendas confirmadas no período', 'O desempenho por produto aparece quando houver vendas confirmadas.');
    }
    const maisVendido = model.topProdutos[0];
    const maiorFat = model.maiorFaturamento;
    const semVenda = model.semVenda;
    const rows = [
      ['Maior faturamento', maiorFat ? `${maiorFat.nome_produto} · ${formatBrl(maiorFat.receita_centavos)}` : '—'],
      ['Maior quantidade', maisVendido ? `${maisVendido.nome_produto} · ${maisVendido.quantidade} un.` : '—'],
      ['Ativos sem venda', String(semVenda.length)],
    ];
    return el('div', { className: 'dash-performance' }, [
      el('ul', { className: 'dash-list' }, rows.map(([label, value]) => el('li', {}, [
        el('span', { className: 'muted', text: label }),
        el('strong', { text: value }),
      ]))),
      semVenda.length
        ? el('p', { className: 'muted dash-note', text: `Sem venda no período: ${semVenda.slice(0, 5).map((item) => item.nome_produto).join(', ')}${semVenda.length > 5 ? ` e mais ${semVenda.length - 5}` : ''}.` })
        : null,
    ]);
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

  // Auditoria (e qualquer sub-aba restrita) nunca é selecionada sem acesso, nem por estado persistido.
  function setReportTab(id) {
    state.reportTab = resolveAllowedReportTab(id, currentSession());
    renderReports();
  }

  function renderReports() {
    const reports = state.reports || {};
    const session = currentSession();
    state.reportTab = resolveAllowedReportTab(state.reportTab, session);
    const tabs = [
      ['visao', 'Resumo'],
      ['vendas', 'Vendas'],
      ['produtos', 'Produtos'],
      ['auditoria', 'Auditoria'],
    ].filter(([id]) => canAccessReportTab(id, session));
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
          onClick: () => setReportTab(id),
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
          el('thead', {}, [el('tr', {}, ['Nome', 'Usuário', 'E-mail', 'Perfil', 'Status', 'Protegido', 'Último login', 'Ações'].map((h) => el('th', { text: h })))]),
          el('tbody', {}, state.usuarios.map((user) => el('tr', {}, [
            el('td', {}, [
              el('span', { text: user.nome_usuario }),
              isSelfUser(user) ? el('span', { className: 'badge badge-you', text: 'Você' }) : null,
            ]),
            el('td', { text: user.login_usuario || '—' }),
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
          el('span', { text: `Usuário: ${user.login_usuario || '—'}` }),
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

  // Controle compacto para "Status ativo": checkbox pequeno alinhado ao texto (ver .status-toggle em admin.css).
  function statusToggle(name, label, checked) {
    return el('label', { className: 'status-toggle' }, [el('input', { type: 'checkbox', name, checked }), el('span', { text: label })]);
  }

  // Mesma regra do backend (backend/src/admin-users.js): 3 a 32 caracteres, a-z, 0-9, ponto, hífen e underline.
  function usuarioValidationMessage(value) {
    if (!value) return 'Usuário é obrigatório.';
    if (value.length < 3 || value.length > 32) return 'Usuário deve ter entre 3 e 32 caracteres.';
    if (!/^[a-z0-9._-]+$/.test(value)) return 'Use somente letras sem acento, números, ponto, hífen ou underline no usuário.';
    return null;
  }

  // Mensagem de agendamento inválido próxima aos campos, com aria-invalid nos
  // inputs e foco no primeiro campo com erro ao tentar salvar (ver validateAgendamento).
  function scheduleFields() {
    const hoje = saoPauloDateTimeParts().data;
    const aplicarSelect = el('select', { id: 'aplicar', name: 'aplicar' }, [
      el('option', { value: 'agora', text: 'Agora' }),
      el('option', { value: 'agendar', text: 'Agendar' }),
    ]);
    const dataInput = input('data_agendada', { type: 'date', min: hoje });
    const horaInput = input('hora_agendada', { type: 'time' });
    const dataField = field('data_agendada', 'Data *', dataInput);
    const horaField = field('hora_agendada', 'Hora *', horaInput);
    const erro = el('p', { className: 'form-error', role: 'alert', hidden: true });

    function limparErro() {
      erro.hidden = true;
      erro.textContent = '';
      dataInput.removeAttribute('aria-invalid');
      horaInput.removeAttribute('aria-invalid');
    }

    function syncVisibility() {
      const agendar = aplicarSelect.value === 'agendar';
      dataField.classList.toggle('hidden', !agendar);
      horaField.classList.toggle('hidden', !agendar);
      erro.classList.toggle('hidden', !agendar);
      if (agendar) {
        dataInput.setAttribute('required', '');
        horaInput.setAttribute('required', '');
      } else {
        dataInput.removeAttribute('required');
        horaInput.removeAttribute('required');
        limparErro();
      }
    }

    aplicarSelect.addEventListener('change', syncVisibility);
    dataInput.addEventListener('input', limparErro);
    horaInput.addEventListener('input', limparErro);
    syncVisibility();

    const group = el('div', { className: 'form-grid' }, [
      field('aplicar', 'Aplicar alteração', aplicarSelect),
      dataField,
      horaField,
      erro,
    ]);
    group.dataset.aplicarSelect = '';
    return group;
  }

  // Valida o agendamento no cliente (UX): obrigatoriedade e instante estritamente
  // futuro em America/Sao_Paulo. O backend revalida tudo de novo (parseSaoPauloDateTime);
  // esta checagem nunca é a autoridade final.
  function validateAgendamento(form) {
    if (!form.aplicar || form.aplicar.value !== 'agendar') return null;
    const erro = form.querySelector('.form-error');
    const dataValor = String(form.data_agendada?.value || '');
    const horaValor = String(form.hora_agendada?.value || '');
    let mensagem = null;
    let campoFoco = null;
    if (!dataValor) {
      mensagem = 'Informe a data do agendamento.';
      campoFoco = form.data_agendada;
    } else if (!horaValor) {
      mensagem = 'Informe a hora do agendamento.';
      campoFoco = form.hora_agendada;
    } else if (!isAgendamentoFuturo(dataValor, horaValor)) {
      mensagem = 'A data e hora do agendamento devem ser estritamente futuras.';
      campoFoco = form.data_agendada;
    }
    if (mensagem) {
      if (erro) {
        erro.hidden = false;
        erro.textContent = mensagem;
      }
      if (form.data_agendada) form.data_agendada.setAttribute('aria-invalid', !dataValor || !isAgendamentoFuturo(dataValor, horaValor) ? 'true' : 'false');
      if (form.hora_agendada) form.hora_agendada.setAttribute('aria-invalid', !horaValor || !isAgendamentoFuturo(dataValor, horaValor) ? 'true' : 'false');
      campoFoco?.focus();
      return mensagem;
    }
    if (erro) {
      erro.hidden = true;
      erro.textContent = '';
    }
    form.data_agendada?.removeAttribute('aria-invalid');
    form.hora_agendada?.removeAttribute('aria-invalid');
    return null;
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

  // Campos de senha/PIN. ADMIN e GESTOR usam PIN numérico (>= 4 dígitos);
  // SUPER_ADMIN mantém a política completa. Validação real fica no backend.
  function credentialFields(perfilInicial) {
    const hint = el('p', { className: 'muted', id: 'senhaHint' });
    const senha = input('senha', { type: 'password', required: true, autocomplete: 'new-password' });
    const confirmacao = input('senha_confirmacao', { type: 'password', required: true, autocomplete: 'new-password' });
    const apply = (perfil) => {
      const pin = isPerfilComPin(perfil);
      for (const campo of [senha, confirmacao]) {
        if (pin) {
          campo.setAttribute('inputmode', 'numeric');
          campo.removeAttribute('minlength');
        } else {
          campo.removeAttribute('inputmode');
          campo.setAttribute('minlength', '10');
        }
      }
      hint.textContent = pin ? PIN_HINT : SENHA_HINT;
    };
    apply(perfilInicial);
    return {
      nodes: [field('senha', 'Senha *', senha), hint, field('senha_confirmacao', 'Confirmar senha *', confirmacao)],
      apply,
    };
  }

  function openUserForm(user) {
    const protectedUser = user?.protegido === true;
    const session = currentSession();
    const createPerfis = user ? [] : creatablePerfisFor(session);
    const editPerfis = protectedUser
      ? ['SUPER_ADMIN']
      : (isRootSuperAdminSession(session) ? ['SUPER_ADMIN', 'ADMIN', 'GESTOR'] : creatablePerfisFor(session));
    const perfis = user ? editPerfis : createPerfis;
    const perfilSelect = el('select', { id: 'perfil', name: 'perfil', required: true }, perfis.map((perfil) => el('option', {
      value: perfil,
      text: perfilFormLabel(perfil),
      selected: (user?.perfil_usuario || perfis[0]) === perfil,
    })));
    const cred = user ? null : credentialFields(perfis[0]);
    if (cred) perfilSelect.addEventListener('change', () => cred.apply(perfilSelect.value));
    resourceForm.replaceChildren(dialogFrame({
      eyebrow: 'Gestão',
      title: user ? 'Editar usuário' : 'Novo usuário',
      description: user ? 'Atualize os dados de acesso.' : 'Crie um acesso para o painel.',
      submitLabel: user ? 'Atualizar usuário' : 'Salvar usuário',
      size: 'small',
      children: [
        el('input', { type: 'hidden', name: 'id_usuario_admin', value: user?.id_usuario_admin || '' }),
        field('nome', 'Nome *', input('nome', { required: true, value: user?.nome_usuario || '' })),
        field('usuario', 'Usuário *', input('usuario', { required: true, value: user?.login_usuario || '', autocomplete: 'off', autocapitalize: 'none', spellcheck: false, maxLength: 32 })),
        field('email', 'E-mail *', input('email', { type: 'email', required: true, value: user?.email_usuario || '' })),
        protectedUser
          ? el('p', { className: 'muted', text: 'SUPER ADMIN protegido. Perfil, proteção e status não podem ser alterados.' })
          : field('perfil', 'Perfil *', perfilSelect),
        ...(cred ? cred.nodes : []),
        protectedUser ? null : statusToggle('ativo', 'Status ativo', user ? user.ativo : true),
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
        ...credentialFields(user?.perfil_usuario).nodes,
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
    if ((kind === 'categoria' || kind === 'produto') && validateAgendamento(resourceForm)) {
      return;
    }
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
        if (!id) {
          const erroPin = isPerfilComPin(data.get('perfil')) ? pinValidationMessage(senha) : null;
          if (erroPin) {
            formError(erroPin);
            return;
          }
          if (senha !== senhaConfirmacao) {
            formError('As senhas não coincidem.');
            return;
          }
        }
        const usuarioLogin = String(data.get('usuario') || '').trim().toLowerCase();
        const erroUsuario = usuarioValidationMessage(usuarioLogin);
        if (erroUsuario) {
          formError(erroUsuario);
          return;
        }
        const payload = {
          nome: String(data.get('nome') || ''),
          usuario: usuarioLogin,
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
        const alvo = state.usuarios.find((item) => String(item.id_usuario_admin) === String(id));
        const erroPin = isPerfilComPin(alvo?.perfil_usuario) ? pinValidationMessage(senha) : null;
        if (erroPin) {
          formError(erroPin);
          return;
        }
        if (senha !== senhaConfirmacao) {
          formError('As senhas não coincidem.');
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
          usuario: document.getElementById('adminLogin').value,
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
      renderAmbiente((await request('/api/admin/sessao').catch(() => null))?.ambiente);
      await showApp();
    } catch (error) {
      loginError.hidden = false;
      loginError.textContent = error.status === 401 ? 'Usuário ou senha inválidos.' : 'Não foi possível entrar. Tente novamente.';
    } finally {
      loginButton.disabled = false;
      loginButton.textContent = 'Entrar';
    }
  });

  logoutButton?.addEventListener('click', logout);

  document.querySelectorAll('.nav-btn[data-view]').forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.view));
  });
  // Edição de formulário marca a view como "dirty" (busca e filtros não contam). Ver admin-view-cache.js.
  Object.entries(views).forEach(([name, node]) => {
    if (name === 'overview') return;
    const markDirty = (event) => { if (isFormField(event.target)) viewDirty.mark(name); };
    node.addEventListener('input', markDirty);
    node.addEventListener('change', markDirty);
  });
  document.querySelectorAll('.nav-group').forEach((group) => {
    group.querySelector('.nav-group-toggle')?.addEventListener('click', () => {
      updateNavGroups(group.classList.contains('is-open') ? null : group);
    });
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
    clearAdminData();
  }

  function renderAmbiente(codigo) {
    const ambienteEl = document.getElementById('sidebarAmbiente');
    if (ambienteEl) ambienteEl.textContent = ambienteLabel(codigo);
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
      renderAmbiente(sessao.ambiente);
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
