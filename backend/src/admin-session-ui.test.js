import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  DATA_LOAD_ERROR_MESSAGE,
  DIALOG_CLOSE_LABEL,
  canAccessUsuarios,
  canAccessGestao,
  canAccessReportTab,
  GESTAO_VIEWS,
  resolveAllowedReportTab,
  resolveAllowedView,
  creatablePerfisFor,
  isPerfilComPin,
  pinValidationMessage,
  decideBootAction,
  decideCatalogLoadAction,
  decideSessionErrorAction,
  perfilBadgeLabel,
  perfilFormLabel,
  requestStatusLabel,
  saleStatusLabel,
  sessionDisplayName,
  sessionFirstName,
  sessionInitials,
  shouldCloseDialogOnBackdrop,
  truncateEmail,
  canRequestProductionPromotion,
  canEnableProductionUpdateButton,
  collapsedUserMenuExposes,
  createUserMenuController,
  isProdPublishConfirmation,
  publicationBadgeClass,
  publicationStatusLabel,
  shortGitSha,
} from '../../admin-session-ui.js';

test('sessao 200 abre o painel e 401 vai para login', () => {
  assert.equal(decideBootAction(200), 'app');
  assert.equal(decideBootAction(401), 'login');
  assert.equal(decideBootAction(500), 'retry');
});

test('catalogo 500 com sessao valida nao desloga', () => {
  assert.equal(decideCatalogLoadAction(500), 'retry');
  assert.equal(decideCatalogLoadAction(502), 'retry');
  assert.equal(decideCatalogLoadAction(503), 'retry');
  assert.equal(decideSessionErrorAction(500), 'retry');
  assert.notEqual(decideCatalogLoadAction(500), 'login');
  assert.equal(DATA_LOAD_ERROR_MESSAGE, 'Não foi possível carregar os dados agora.');
});

test('catalogo 401 desloga', () => {
  assert.equal(decideCatalogLoadAction(401), 'login');
  assert.equal(decideSessionErrorAction(401), 'login');
});

test('403 e 429 nao deslogam', () => {
  assert.equal(decideSessionErrorAction(403), 'forbidden');
  assert.equal(decideSessionErrorAction(429), 'rate_limit');
});

test('ROOT cria Super Admin, ADMIN e Gerente; ADMIN e GESTOR nao criam usuarios', () => {
  assert.deepEqual(creatablePerfisFor({ perfil: 'SUPER_ADMIN', protegido: true }), ['SUPER_ADMIN', 'ADMIN', 'GESTOR']);
  assert.deepEqual(creatablePerfisFor({ perfil: 'SUPER_ADMIN', protegido: false }), ['ADMIN', 'GESTOR']);
  assert.deepEqual(creatablePerfisFor({ perfil: 'ADMIN' }), []);
  assert.deepEqual(creatablePerfisFor({ perfil: 'GESTOR' }), []);
  assert.equal(canAccessUsuarios({ perfil: 'GESTOR' }), false);
  assert.equal(canAccessUsuarios({ perfil: 'ADMIN' }), false);
  assert.equal(canAccessUsuarios({ perfil: 'SUPER_ADMIN', protegido: false }), true);
});

test('Gestão: só SUPER_ADMIN da sessão real libera o grupo (fail closed)', () => {
  assert.equal(canAccessGestao({ perfil: 'SUPER_ADMIN', protegido: true }), true);
  assert.equal(canAccessGestao({ perfil: 'SUPER_ADMIN', protegido: false }), true);
  assert.equal(canAccessGestao({ perfil: 'ADMIN' }), false);
  assert.equal(canAccessGestao({ perfil: 'GESTOR' }), false);
  assert.equal(canAccessGestao({ perfil: 'ROOT' }), false);
  assert.equal(canAccessGestao({ perfil: null }), false);
  assert.equal(canAccessGestao({}), false);
  assert.equal(canAccessGestao(null), false);
  assert.equal(canAccessGestao(undefined), false);
  assert.equal(canAccessGestao(), false);
});

test('Gestão: perfil vem da sessão, nunca do login ou do nome exibido', () => {
  const session = { email: 'super.admin@amanteigados.test', nome_usuario: 'Super Admin', login_usuario: 'superadmin', perfil: 'GESTOR' };
  assert.equal(canAccessGestao(session), false);
});

test('Gestão: view privilegiada sem acesso cai no Dashboard; demais views não mudam', () => {
  const admin = { perfil: 'ADMIN' };
  const superAdmin = { perfil: 'SUPER_ADMIN', protegido: true };
  assert.deepEqual([...GESTAO_VIEWS], ['publications', 'audit', 'users']);
  GESTAO_VIEWS.forEach((view) => {
    assert.equal(resolveAllowedView(view, admin), 'overview');
    assert.equal(resolveAllowedView(view, {}), 'overview');
    assert.equal(resolveAllowedView(view, null), 'overview');
    assert.equal(resolveAllowedView(view, superAdmin), view);
  });
  assert.equal(resolveAllowedView('reports', admin), 'reports');
  assert.equal(resolveAllowedView('sales', null), 'sales');
  assert.equal(resolveAllowedView('overview', {}), 'overview');
});

test('badges visuais de perfil', () => {
  assert.equal(perfilBadgeLabel('SUPER_ADMIN'), 'SUPER ADMIN');
  assert.equal(perfilBadgeLabel('ADMIN'), 'ADMINISTRADOR');
  assert.equal(perfilBadgeLabel('GESTOR'), 'GERENTE');
  assert.equal(perfilFormLabel('SUPER_ADMIN'), 'Super Admin');
  assert.equal(perfilFormLabel('ADMIN'), 'Administrador');
  assert.equal(perfilFormLabel('GESTOR'), 'Gerente');
});

test('usuario logado usa nome, iniciais e fallback de email', () => {
  assert.equal(sessionDisplayName({ nome_usuario: 'Marco Antônio', email: 'marco@example.com' }), 'Marco Antônio');
  assert.equal(sessionDisplayName({ email: 'marcoantunes171989@gmail.com' }), 'marcoantunes171989@gmail.com');
  assert.equal(sessionInitials('Marco Antônio'), 'MA');
  assert.equal(sessionInitials('Amanteigados Lívia'), 'AL');
  assert.equal(sessionFirstName('Marco Antônio'), 'Marco');
  assert.equal(truncateEmail('marcoantunes171989@gmail.com', 22).includes('…@gmail.com'), true);
  assert.equal(truncateEmail('marcoantunes171989@gmail.com', 22).length <= 24, true);
});

test('status amigaveis e fechamento de dialog', () => {
  assert.equal(requestStatusLabel('NOVA'), 'Nova');
  assert.equal(requestStatusLabel('EM_ATENDIMENTO'), 'Em atendimento');
  assert.equal(requestStatusLabel('CONCLUIDA'), 'Concluída');
  assert.equal(requestStatusLabel('CANCELADA'), 'Cancelada');
  assert.equal(saleStatusLabel('PENDENTE'), 'Pendente');
  assert.equal(shouldCloseDialogOnBackdrop(false), true);
  assert.equal(shouldCloseDialogOnBackdrop(true), false);
  assert.equal(DIALOG_CLOSE_LABEL, 'Fechar');
});

test('menu do usuario inicia fechado, mostra so o nome e faz toggle', () => {
  const menu = createUserMenuController();
  const collapsed = collapsedUserMenuExposes();
  assert.equal(menu.isOpen(), false);
  assert.equal(collapsed.name, true);
  assert.equal(collapsed.email, false);
  assert.equal(collapsed.role, false);
  assert.equal(collapsed.avatar, false);
  assert.equal(collapsed.sair, false);
  assert.equal(collapsed.protegido, false);
  assert.equal(sessionDisplayName({ nome_usuario: 'Marco Antônio' }), 'Marco Antônio');

  assert.equal(menu.handleTriggerClick(), true);
  assert.equal(menu.isOpen(), true);
  assert.equal(menu.handleTriggerClick(), false);
  assert.equal(menu.isOpen(), false);

  menu.handleTriggerClick();
  menu.handleDocumentClick({ insideTrigger: false, insideMenu: false });
  assert.equal(menu.isOpen(), false);

  menu.handleTriggerClick();
  menu.handleDocumentClick({ insideTrigger: true, insideMenu: false });
  assert.equal(menu.isOpen(), true);
  menu.handleDocumentClick({ insideTrigger: false, insideMenu: true });
  assert.equal(menu.isOpen(), true);

  const escape = menu.handleEscape();
  assert.equal(menu.isOpen(), false);
  assert.equal(escape.closed, true);
  assert.equal(escape.restoreFocus, true);

  menu.handleTriggerClick();
  let loggedOut = false;
  menu.handleLogout(() => { loggedOut = true; });
  assert.equal(menu.isOpen(), false);
  assert.equal(loggedOut, true);

  menu.handleTriggerClick();
  menu.handleNavigate();
  assert.equal(menu.isOpen(), false);
  menu.handleTriggerClick();
  menu.handleDrawerOpen();
  assert.equal(menu.isOpen(), false);
});

test('somente ROOT SUPER_ADMIN protegido habilita o gate de producao', () => {
  assert.equal(canRequestProductionPromotion({ perfil: 'ADMIN' }), false);
  assert.equal(canRequestProductionPromotion({ perfil: 'GESTOR' }), false);
  assert.equal(canRequestProductionPromotion({ perfil: 'SUPER_ADMIN', protegido: false }), false);
  assert.equal(canRequestProductionPromotion({ perfil: 'SUPER_ADMIN', protegido: true }), true);
  assert.equal(canEnableProductionUpdateButton({
    session: { perfil: 'SUPER_ADMIN', protegido: true },
    producao: { habilitada: false, release_configurada: false, pronta: false },
    dryRunStatus: 'BLOQUEADA',
  }), false);
  assert.equal(isProdPublishConfirmation('PUBLICAR PRODUCAO'), true);
  assert.equal(isProdPublishConfirmation('publicar producao'), false);
  assert.equal(isProdPublishConfirmation(''), false);
  assert.equal(publicationStatusLabel('EM_EXECUCAO'), 'EM EXECUÇÃO');
  assert.equal(publicationBadgeClass('BLOQUEADA'), 'badge-off');
  assert.equal(shortGitSha('89d0a9152a2604d71e5898040fb95b5783e5e3d0'), '89d0a9152a26');
});

test('Relatórios: sub-aba Auditoria só para SUPER_ADMIN da sessão real (fail closed)', () => {
  assert.equal(canAccessReportTab('auditoria', { perfil: 'SUPER_ADMIN', protegido: true }), true);
  assert.equal(canAccessReportTab('auditoria', { perfil: 'SUPER_ADMIN', protegido: false }), true);
  assert.equal(canAccessReportTab('auditoria', { perfil: 'ADMIN' }), false);
  assert.equal(canAccessReportTab('auditoria', { perfil: 'GESTOR' }), false);
  assert.equal(canAccessReportTab('auditoria', { perfil: 'ROOT' }), false);
  assert.equal(canAccessReportTab('auditoria', { perfil: null }), false);
  assert.equal(canAccessReportTab('auditoria', {}), false);
  assert.equal(canAccessReportTab('auditoria', null), false);
  assert.equal(canAccessReportTab('auditoria', undefined), false);
  assert.equal(canAccessReportTab('auditoria'), false);
});

test('Relatórios: demais sub-abas continuam acessíveis para qualquer sessão', () => {
  const sessions = [{ perfil: 'SUPER_ADMIN', protegido: true }, { perfil: 'ADMIN' }, { perfil: 'GESTOR' }, {}, null, undefined];
  for (const session of sessions) {
    for (const tab of ['visao', 'vendas', 'produtos']) {
      assert.equal(canAccessReportTab(tab, session), true, `${tab} ${JSON.stringify(session)}`);
      assert.equal(resolveAllowedReportTab(tab, session), tab, `${tab} ${JSON.stringify(session)}`);
    }
  }
});

test('Relatórios: Auditoria persistida ou pedida por código cai em Resumo sem acesso', () => {
  assert.equal(resolveAllowedReportTab('auditoria', { perfil: 'ADMIN' }), 'visao');
  assert.equal(resolveAllowedReportTab('auditoria', { perfil: 'GESTOR' }), 'visao');
  assert.equal(resolveAllowedReportTab('auditoria', {}), 'visao');
  assert.equal(resolveAllowedReportTab('auditoria', null), 'visao');
  assert.equal(resolveAllowedReportTab('auditoria', undefined), 'visao');
  assert.equal(resolveAllowedReportTab('auditoria', { perfil: 'SUPER_ADMIN', protegido: true }), 'auditoria');
});

test('Relatórios: UI filtra a sub-aba pelo helper, sem chip estático nem flash', () => {
  const html = readFileSync(new URL('../../admin.html', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../../admin.js', import.meta.url), 'utf8');
  // Nenhuma sub-aba de Relatórios fixa no HTML: as chips são geradas só após a sessão real.
  assert.doesNotMatch(html, /role="tab"[^>]*>\s*Auditoria/);
  assert.doesNotMatch(html, /data-report[^>]*auditoria/i);
  // Renderização filtra pela mesma regra; o estado persistido é resolvido ao aplicar a sessão.
  assert.match(js, /\.filter\(\(\[id\]\) => canAccessReportTab\(id, session\)\)/);
  assert.match(js, /state\.reportTab = resolveAllowedReportTab\(state\.reportTab, session\);\r?\n\s+renderAdminUser\(\);/);
  assert.match(js, /function setReportTab\(id\)\s*\{\s*state\.reportTab = resolveAllowedReportTab\(id, currentSession\(\)\);/);
  assert.match(js, /onClick: \(\) => setReportTab\(id\)/);
  // Nenhum caminho grava a sub-aba direto no estado sem passar pelo resolve.
  assert.doesNotMatch(js, /state\.reportTab = id;/);
});

test('PIN na UI: perfis ADMIN e GESTOR usam PIN, SUPER_ADMIN nao', () => {
  assert.equal(isPerfilComPin('GESTOR'), true);
  assert.equal(isPerfilComPin('ADMIN'), true);
  assert.equal(isPerfilComPin('SUPER_ADMIN'), false);
  assert.equal(isPerfilComPin(undefined), false);
});

test('validacao de PIN na UI aceita e rejeita os casos do contrato', () => {
  for (const pin of ['1234', '0123', '12345', '0000', '987654']) {
    assert.equal(pinValidationMessage(pin), null, pin);
  }
  for (const pin of ['', '1', '123', '12a4', 'abcd', '12 34', '12-34']) {
    assert.notEqual(pinValidationMessage(pin), null, JSON.stringify(pin));
  }
  assert.equal(pinValidationMessage('12a4'), 'Use somente números.');
  assert.equal(pinValidationMessage('123'), 'Informe no mínimo 4 dígitos.');
  assert.equal(pinValidationMessage(1234), 'Informe no mínimo 4 dígitos.');
});

test('mensagens de PIN da UI batem com o backend', async () => {
  const backend = await import('./password.js');
  for (const pin of ['', '1', '123', '12a4', 'abcd', '12 34', '12-34', '1234', '0123']) {
    assert.equal(pinValidationMessage(pin), backend.pinPolicyError(pin), JSON.stringify(pin));
  }
});

test('sidebar: segunda linha do cabeçalho é dinâmica, sem Homologação fixa', () => {
  const html = readFileSync(new URL('../../admin.html', import.meta.url), 'utf8');
  const brand = html.match(/<div class="sidebar-brand">[\s\S]*?<\/div>\s*<button/);
  assert.ok(brand, 'bloco sidebar-brand existe');
  assert.match(brand[0], /<strong>Amanteigados Lívia<\/strong>/);
  assert.match(brand[0], /<img src="assets\/logo\.jpg"/);
  assert.match(brand[0], /<span id="sidebarAmbiente">/);
  assert.doesNotMatch(brand[0], /Homologação/);
});

test('sidebar: renderização do ambiente centralizada e sem checagem por hostname', () => {
  const js = readFileSync(new URL('../../admin.js', import.meta.url), 'utf8');
  assert.equal(js.split('function renderAmbiente(').length - 1, 1);
  assert.equal(js.split("getElementById('sidebarAmbiente')").length - 1, 1);
  assert.doesNotMatch(js, /hostname/);
  assert.match(js, /renderAmbiente\(sessao\.ambiente\)/);
});
