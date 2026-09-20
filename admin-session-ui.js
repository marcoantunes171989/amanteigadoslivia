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
