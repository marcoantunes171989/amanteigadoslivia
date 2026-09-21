import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DATA_LOAD_ERROR_MESSAGE,
  DIALOG_CLOSE_LABEL,
  canAccessUsuarios,
  creatablePerfisFor,
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

test('ROOT cria Super Admin, ADMIN e Gerente; GESTOR nao cria', () => {
  assert.deepEqual(creatablePerfisFor({ perfil: 'SUPER_ADMIN', protegido: true }), ['SUPER_ADMIN', 'ADMIN', 'GESTOR']);
  assert.deepEqual(creatablePerfisFor({ perfil: 'SUPER_ADMIN', protegido: false }), ['ADMIN', 'GESTOR']);
  assert.deepEqual(creatablePerfisFor({ perfil: 'ADMIN' }), ['GESTOR']);
  assert.deepEqual(creatablePerfisFor({ perfil: 'GESTOR' }), []);
  assert.equal(canAccessUsuarios({ perfil: 'GESTOR' }), false);
  assert.equal(canAccessUsuarios({ perfil: 'ADMIN' }), true);
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
