export function isUnauthorizedStatus(status) {
  return Number(status) === 401;
}

export function isTemporaryApiStatus(status) {
  const code = Number(status);
  return code === 500 || code === 502 || code === 503;
}

export function decideSessionErrorAction(status) {
  const code = Number(status);
  if (code === 401) return 'login';
  if (code === 403) return 'forbidden';
  if (code === 429) return 'rate_limit';
  if (isTemporaryApiStatus(code)) return 'retry';
  return 'error';
}

export function decideBootAction(sessaoStatus) {
  if (Number(sessaoStatus) === 401) return 'login';
  if (Number(sessaoStatus) === 200) return 'app';
  return 'retry';
}

export function decideCatalogLoadAction(status) {
  if (Number(status) === 200) return 'ok';
  return decideSessionErrorAction(status);
}

export function canAccessUsuarios(session) {
  const perfil = String(session?.perfil || session?.perfil_usuario || '').trim().toUpperCase();
  return perfil === 'SUPER_ADMIN' || perfil === 'ADMIN';
}

export function creatablePerfisFor(session) {
  const perfil = String(session?.perfil || session?.perfil_usuario || '').trim().toUpperCase();
  const protegido = session?.protegido === true;
  if (perfil === 'SUPER_ADMIN' && protegido) return ['SUPER_ADMIN', 'ADMIN', 'GESTOR'];
  if (perfil === 'SUPER_ADMIN') return ['ADMIN', 'GESTOR'];
  if (perfil === 'ADMIN') return ['GESTOR'];
  return [];
}

export function perfilBadgeLabel(perfil) {
  const value = String(perfil || '').trim().toUpperCase();
  if (value === 'SUPER_ADMIN') return 'SUPER ADMIN';
  if (value === 'ADMIN') return 'ADMINISTRADOR';
  if (value === 'GESTOR') return 'GERENTE';
  return value || '—';
}

export function perfilFormLabel(perfil) {
  const value = String(perfil || '').trim().toUpperCase();
  if (value === 'SUPER_ADMIN') return 'Super Admin';
  if (value === 'ADMIN') return 'Administrador';
  if (value === 'GESTOR') return 'Gerente';
  return value;
}

export const DATA_LOAD_ERROR_MESSAGE = 'Não foi possível carregar os dados agora.';
export const DIALOG_CLOSE_LABEL = 'Fechar';

export function sessionEmail(session) {
  return String(session?.email || session?.email_usuario || '').trim();
}

export function sessionDisplayName(session) {
  const nome = String(session?.nome_usuario || '').trim();
  if (nome) return nome;
  return sessionEmail(session) || 'Usuário';
}

export function sessionInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'U';
  const first = parts[0];
  if (parts.length === 1) {
    return first.slice(0, 2).toUpperCase();
  }
  return `${first[0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function sessionFirstName(name) {
  return String(name || '').trim().split(/\s+/).filter(Boolean)[0] || 'Conta';
}

export function truncateEmail(email, max = 28) {
  const value = String(email || '');
  if (value.length <= max) return value;
  const at = value.indexOf('@');
  if (at <= 0) return `${value.slice(0, Math.max(1, max - 1))}…`;
  const user = value.slice(0, at);
  const domain = value.slice(at + 1);
  const keepUser = Math.max(3, max - domain.length - 2);
  return `${user.slice(0, keepUser)}…@${domain}`;
}

export function shouldCloseDialogOnBackdrop(isDirty) {
  return isDirty !== true;
}

export function requestStatusLabel(status) {
  const value = String(status || '').trim().toUpperCase();
  if (value === 'NOVA') return 'Nova';
  if (value === 'EM_ATENDIMENTO') return 'Em atendimento';
  if (value === 'CONCLUIDA') return 'Concluída';
  if (value === 'CANCELADA') return 'Cancelada';
  return status || '—';
}

export function saleStatusLabel(status) {
  const value = String(status || '').trim().toUpperCase();
  if (value === 'PENDENTE') return 'Pendente';
  if (value === 'CONFIRMADA') return 'Confirmada';
  if (value === 'CANCELADA') return 'Cancelada';
  return status || '—';
}

export function requestStatusBadgeClass(status) {
  const value = String(status || '').trim().toUpperCase();
  if (value === 'NOVA') return 'badge-warn';
  if (value === 'EM_ATENDIMENTO') return 'badge-root';
  if (value === 'CONCLUIDA') return 'badge-ok';
  if (value === 'CANCELADA') return 'badge-off';
  return 'badge-warn';
}

export function saleStatusBadgeClass(status) {
  const value = String(status || '').trim().toUpperCase();
  if (value === 'CONFIRMADA') return 'badge-ok';
  if (value === 'CANCELADA') return 'badge-off';
  return 'badge-warn';
}

export const PROD_PUBLISH_CONFIRMATION = 'PUBLICAR PRODUCAO';

export function isProdPublishConfirmation(value) {
  return String(value || '') === PROD_PUBLISH_CONFIRMATION;
}

export function canRequestProductionPromotion(session) {
  const perfil = String(session?.perfil || session?.perfil_usuario || '').trim().toUpperCase();
  return perfil === 'SUPER_ADMIN' && session?.protegido === true;
}

export function canEnableProductionUpdateButton({ session, producao, dryRunStatus } = {}) {
  return canRequestProductionPromotion(session)
    && producao?.habilitada === true
    && producao?.release_configurada === true
    && producao?.pronta === true
    && dryRunStatus === 'VALIDADA';
}

export function collapsedUserMenuExposes() {
  return {
    name: true,
    email: false,
    role: false,
    avatar: false,
    sair: false,
    protegido: false,
  };
}

export function createUserMenuController(initialOpen = false) {
  let open = initialOpen === true;
  return {
    isOpen() {
      return open;
    },
    handleTriggerClick() {
      open = !open;
      return open;
    },
    handleDocumentClick({ insideTrigger = false, insideMenu = false } = {}) {
      if (!insideTrigger && !insideMenu) open = false;
      return open;
    },
    handleEscape() {
      const wasOpen = open;
      open = false;
      return { closed: wasOpen, restoreFocus: wasOpen };
    },
    handleNavigate() {
      open = false;
    },
    handleDrawerOpen() {
      open = false;
    },
    handleLogout(logoutFn) {
      open = false;
      if (typeof logoutFn === 'function') logoutFn();
    },
  };
}

export function shortGitSha(sha) {
  const value = String(sha || '').trim();
  if (!value) return '';
  return value.length > 12 ? value.slice(0, 12) : value;
}

export function publicationStatusLabel(status) {
  const value = String(status || '').trim().toUpperCase();
  if (value === 'EM_EXECUCAO') return 'EM EXECUÇÃO';
  return value || '—';
}

export function publicationBadgeClass(status) {
  const value = String(status || '').trim().toUpperCase();
  if (value === 'PUBLICADA' || value === 'VALIDADA') return 'badge-ok';
  if (value === 'BLOQUEADA' || value === 'ERRO') return 'badge-off';
  if (value === 'AGENDADA' || value === 'EM_EXECUCAO' || value === 'EM EXECUÇÃO') return 'badge-warn';
  return 'badge-root';
}

export function releaseCheckTone(status) {
  const value = String(status || '').trim().toUpperCase();
  if (value === 'PASS') return 'pass';
  if (value === 'WARN') return 'warn';
  return 'block';
}
