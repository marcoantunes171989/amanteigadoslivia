import { randomUUID } from 'node:crypto';
import { AdminError, mapDatabaseError } from './admin-errors.js';
import { hashPassword, passwordPolicyError, pinPolicyError } from './password.js';

export const PERFIS_USUARIO = Object.freeze(['SUPER_ADMIN', 'ADMIN', 'GESTOR']);
// Perfis administrativos que usam PIN numérico (>= 4 dígitos) em vez da senha completa.
// SUPER_ADMIN permanece com a política completa de senha.
export const PERFIS_COM_PIN = Object.freeze(['ADMIN', 'GESTOR']);

// Identidade de login = usuario_login normalizado (ver normalizeLoginUsuario).
// O e-mail continua existindo como dado cadastral, mas NÃO autentica.
export const SQL_USERS = {
  getByLogin: `-- op:get_usuario_login
    SELECT id_usuario_admin, nome_usuario, email_usuario, login_usuario, senha_hash, senha_salt,
           perfil_usuario, ativo, protegido, data_ultimo_login
    FROM app.tab_usuario_admin
    WHERE lower(login_usuario) = lower($1)
  `,
  getById: `-- op:get_usuario_id
    SELECT id_usuario_admin, nome_usuario, email_usuario, login_usuario, perfil_usuario, ativo,
           protegido, data_criacao, data_atualizacao, data_ultimo_login
    FROM app.tab_usuario_admin
    WHERE id_usuario_admin = $1
  `,
  list: `-- op:list_usuarios
    SELECT id_usuario_admin, nome_usuario, email_usuario, login_usuario, perfil_usuario, ativo,
           protegido, data_criacao, data_atualizacao, data_ultimo_login
    FROM app.tab_usuario_admin
    ORDER BY nome_usuario ASC
  `,
  insert: `-- op:insert_usuario
    INSERT INTO app.tab_usuario_admin (
      id_usuario_admin, nome_usuario, email_usuario, senha_hash, senha_salt, perfil_usuario, ativo, protegido,
      login_usuario
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8)
    RETURNING id_usuario_admin, nome_usuario, email_usuario, login_usuario, perfil_usuario, ativo, protegido,
              data_criacao, data_ultimo_login
  `,
  update: `-- op:update_usuario
    UPDATE app.tab_usuario_admin
    SET nome_usuario = $2,
        email_usuario = $3,
        perfil_usuario = $4,
        ativo = $5,
        login_usuario = $6,
        data_atualizacao = now()
    WHERE id_usuario_admin = $1
    RETURNING id_usuario_admin, nome_usuario, email_usuario, login_usuario, perfil_usuario, ativo, protegido,
              data_criacao, data_atualizacao, data_ultimo_login
  `,
  updatePassword: `-- op:update_usuario_senha
    UPDATE app.tab_usuario_admin
    SET senha_hash = $2, senha_salt = $3, data_atualizacao = now()
    WHERE id_usuario_admin = $1
    RETURNING id_usuario_admin
  `,
  touchLogin: `-- op:touch_usuario_login
    UPDATE app.tab_usuario_admin
    SET data_ultimo_login = now(), data_atualizacao = now()
    WHERE id_usuario_admin = $1
  `,
  countActiveAdmins: `-- op:count_admin_ativos
    SELECT count(*)::int AS total
    FROM app.tab_usuario_admin
    WHERE perfil_usuario IN ('SUPER_ADMIN', 'ADMIN') AND ativo = true
  `,
};

function requiredText(value, label) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    throw new AdminError(400, 'validation_error', `${label} é obrigatório.`);
  }
  return text;
}

// Usuário de login. Regra única para cadastro, login e rate limit:
// - trim + minúsculas (unicidade é case-insensitive);
// - 3 a 32 caracteres; apenas a-z, 0-9, '.', '_' e '-' (sem acento e sem espaço interno);
// - tratado sempre como STRING.
// O projeto não tinha padrão prévio de username; regra escolhida para evitar ambiguidade
// (ex.: "Administrador" x "administrador" x " ADMINISTRADOR ").
export const LOGIN_MIN_LENGTH = 3;
export const LOGIN_MAX_LENGTH = 32;
const LOGIN_PATTERN = /^[a-z0-9._-]+$/;

export function normalizeLoginKey(value) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim().toLowerCase() : '';
}

export function loginFormatError(value) {
  const login = normalizeLoginKey(value);
  if (!login) return 'Usuário é obrigatório.';
  if (login.length < LOGIN_MIN_LENGTH || login.length > LOGIN_MAX_LENGTH) {
    return `Usuário deve ter entre ${LOGIN_MIN_LENGTH} e ${LOGIN_MAX_LENGTH} caracteres.`;
  }
  if (!LOGIN_PATTERN.test(login)) {
    return 'Use somente letras sem acento, números, ponto, hífen ou underline no usuário.';
  }
  return null;
}

export function normalizeLoginUsuario(value) {
  const message = loginFormatError(value);
  if (message) {
    throw new AdminError(400, 'validation_error', message);
  }
  return normalizeLoginKey(value);
}

function normalizeEmail(value) {
  const email = requiredText(value, 'E-mail').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AdminError(400, 'validation_error', 'E-mail inválido.');
  }
  return email;
}

export function normalizePerfil(value, fallback = 'ADMIN') {
  const perfil = String(value || fallback).trim().toUpperCase();
  if (!PERFIS_USUARIO.includes(perfil)) {
    throw new AdminError(400, 'validation_error', 'Perfil inválido.');
  }
  return perfil;
}

export function isProtectedUser(row) {
  return row?.protegido === true || row?.protegido === 't';
}

export function sessionPerfil(session) {
  return String(session?.perfil || session?.perfil_usuario || '').trim().toUpperCase();
}

export function isRootSuperAdmin(actor) {
  return sessionPerfil(actor) === 'SUPER_ADMIN' && isProtectedUser(actor);
}

// Grupo Gestão (Publicações, Auditoria, Usuários) é EXCLUSIVO de SUPER_ADMIN.
// Ponto único de decisão server-side: perfil ausente, vazio, nulo ou desconhecido é negado.
export function isSuperAdminPerfil(actor) {
  return sessionPerfil(actor) === 'SUPER_ADMIN';
}

export function assertSuperAdmin(actor) {
  if (!isSuperAdminPerfil(actor)) {
    forbiddenProtected();
  }
}

export function canListUsuarios(actor) {
  return isSuperAdminPerfil(actor);
}

export function creatablePerfisFor(actor) {
  if (isRootSuperAdmin(actor)) return ['SUPER_ADMIN', 'ADMIN', 'GESTOR'];
  if (isSuperAdminPerfil(actor)) return ['ADMIN', 'GESTOR'];
  return [];
}

function isSelf(session, id) {
  return Boolean(session?.id_usuario_admin && String(session.id_usuario_admin) === String(id));
}

function forbiddenProtected() {
  throw new AdminError(403, 'forbidden', 'Operação não permitida para este usuário.');
}

export function assertPasswordPolicy(password) {
  const message = passwordPolicyError(password);
  if (message) {
    throw new AdminError(400, 'validation_error', message);
  }
}

export function assertPinPolicy(pin) {
  const message = pinPolicyError(pin);
  if (message) {
    throw new AdminError(400, 'validation_error', message);
  }
}

// Decide a política de credencial pelo perfil do usuário que será gravado.
export function assertCredentialPolicy(perfil, credential) {
  if (PERFIS_COM_PIN.includes(perfil)) {
    assertPinPolicy(credential);
    return;
  }
  assertPasswordPolicy(credential);
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id_usuario_admin: String(row.id_usuario_admin),
    nome_usuario: row.nome_usuario,
    email_usuario: row.email_usuario,
    login_usuario: row.login_usuario || null,
    perfil_usuario: row.perfil_usuario,
    ativo: row.ativo === true,
    protegido: isProtectedUser(row),
    data_criacao: row.data_criacao || null,
    data_atualizacao: row.data_atualizacao || null,
    data_ultimo_login: row.data_ultimo_login || null,
  };
}

export function assertCanCreateUsuario(actor, perfil) {
  if (!creatablePerfisFor(actor).includes(perfil)) {
    forbiddenProtected();
  }
}

export function assertCanManageProtectedUser(session, current, next = {}) {
  if (!current) {
    throw new AdminError(404, 'not_found', 'Usuário não encontrado.');
  }

  const actorPerfil = sessionPerfil(session);
  const self = isSelf(session, current.id_usuario_admin);
  const nextPerfil = next.perfil_usuario === undefined ? current.perfil_usuario : next.perfil_usuario;
  const nextAtivo = next.ativo === undefined ? current.ativo === true : next.ativo === true;
  const nextProtegido = next.protegido === undefined ? isProtectedUser(current) : next.protegido === true;

  if (isProtectedUser(current)) {
    if (nextAtivo === false || nextPerfil !== 'SUPER_ADMIN' || nextProtegido === false) {
      forbiddenProtected();
    }
    if (next.resetPassword && !(self && actorPerfil === 'SUPER_ADMIN')) {
      forbiddenProtected();
    }
    if (!(self && actorPerfil === 'SUPER_ADMIN')) {
      forbiddenProtected();
    }
    return;
  }

  // Gestão de usuários é exclusiva de SUPER_ADMIN (ADMIN e GESTOR não gerenciam ninguém).
  if (!isSuperAdminPerfil(session)) {
    forbiddenProtected();
  }

  if (isRootSuperAdmin(session)) {
    return;
  }

  if (current.perfil_usuario === 'SUPER_ADMIN' || nextPerfil === 'SUPER_ADMIN') {
    forbiddenProtected();
  }
}

export async function loadActor(queryable, session) {
  if (!session?.id_usuario_admin) {
    throw new AdminError(401, 'unauthorized', 'Sessão administrativa ausente ou inválida.');
  }
  const result = await queryable.query(SQL_USERS.getById, [session.id_usuario_admin]);
  const actor = result.rows[0];
  if (!actor || actor.ativo !== true) {
    throw new AdminError(401, 'unauthorized', 'Sessão administrativa ausente ou inválida.');
  }
  return {
    ...actor,
    id_usuario_admin: String(actor.id_usuario_admin),
    perfil: actor.perfil_usuario,
    protegido: isProtectedUser(actor),
  };
}

// Formato inválido não consulta o banco: retorna null como usuário inexistente.
export async function findUsuarioByLogin(queryable, usuario) {
  if (loginFormatError(usuario)) return null;
  const result = await queryable.query(SQL_USERS.getByLogin, [normalizeLoginKey(usuario)]);
  return result.rows[0] || null;
}

function duplicateUsuarioError(error) {
  const constraint = String(error?.constraint || error?.detail || '');
  if (/login/i.test(constraint)) {
    return new AdminError(409, 'conflict', 'Este usuário de login já está em uso.');
  }
  return new AdminError(409, 'conflict', 'Já existe um usuário com este e-mail.');
}

export async function listUsuarios(queryable) {
  const result = await queryable.query(SQL_USERS.list);
  return result.rows.map(publicUser);
}

export async function touchUltimoLogin(queryable, id) {
  await queryable.query(SQL_USERS.touchLogin, [id]);
}

export async function createUsuario(queryable, dados = {}, session = {}) {
  const nome = requiredText(dados.nome_usuario ?? dados.nome, 'Nome');
  const login = normalizeLoginUsuario(dados.usuario ?? dados.login_usuario);
  const email = normalizeEmail(dados.email_usuario ?? dados.email);
  const senha = dados.senha;
  const perfil = normalizePerfil(dados.perfil_usuario ?? dados.perfil, 'ADMIN');
  if (dados.protegido === true) {
    throw new AdminError(403, 'forbidden', 'Operação não permitida para este usuário.');
  }
  assertCanCreateUsuario(session, perfil);
  assertCredentialPolicy(perfil, senha);
  const ativo = dados.ativo !== false;
  const hashed = await hashPassword(senha);
  try {
    const result = await queryable.query(SQL_USERS.insert, [
      dados.id_usuario_admin || randomUUID(),
      nome,
      email,
      hashed.senha_hash,
      hashed.senha_salt,
      perfil,
      ativo,
      login,
    ]);
    return publicUser(result.rows[0]);
  } catch (error) {
    if (error?.code === '23505') {
      throw duplicateUsuarioError(error);
    }
    throw mapDatabaseError(error);
  }
}

export async function updateUsuario(queryable, id, dados = {}, session = {}) {
  if (!id) {
    throw new AdminError(400, 'validation_error', 'Usuário é obrigatório.');
  }
  const currentResult = await queryable.query(SQL_USERS.getById, [id]);
  const current = currentResult.rows[0];
  if (!current) {
    throw new AdminError(404, 'not_found', 'Usuário não encontrado.');
  }

  const nome = requiredText(dados.nome_usuario ?? dados.nome ?? current.nome_usuario, 'Nome');
  const login = normalizeLoginUsuario(dados.usuario ?? dados.login_usuario ?? current.login_usuario);
  const email = normalizeEmail(dados.email_usuario ?? dados.email ?? current.email_usuario);
  const perfil = normalizePerfil(dados.perfil_usuario ?? dados.perfil ?? current.perfil_usuario);
  const ativo = dados.ativo === undefined ? current.ativo === true : dados.ativo === true;
  const nextProtegido = dados.protegido === undefined ? isProtectedUser(current) : dados.protegido === true;

  assertCanManageProtectedUser(session, current, {
    perfil_usuario: perfil,
    ativo,
    protegido: nextProtegido,
  });

  if (current.perfil_usuario === 'ADMIN' && current.ativo === true && (perfil !== 'ADMIN' || ativo === false)) {
    const count = await queryable.query(SQL_USERS.countActiveAdmins);
    const total = count.rows[0]?.total ?? 0;
    const self = isSelf(session, id);
    if (total <= 1 && self) {
      throw new AdminError(409, 'conflict', 'Não é permitido desativar o último administrador ativo.');
    }
    if (total <= 1) {
      throw new AdminError(409, 'conflict', 'Deve existir pelo menos um administrador ativo.');
    }
  }

  try {
    const result = await queryable.query(SQL_USERS.update, [id, nome, email, perfil, ativo, login]);
    return publicUser(result.rows[0]);
  } catch (error) {
    if (error?.code === '23505') {
      throw duplicateUsuarioError(error);
    }
    throw mapDatabaseError(error);
  }
}

export async function resetUsuarioSenha(queryable, id, senha, session = {}) {
  if (!id) {
    throw new AdminError(400, 'validation_error', 'Usuário é obrigatório.');
  }
  const current = await queryable.query(SQL_USERS.getById, [id]);
  if (!current.rows[0]) {
    throw new AdminError(404, 'not_found', 'Usuário não encontrado.');
  }
  assertCanManageProtectedUser(session, current.rows[0], { resetPassword: true });
  assertCredentialPolicy(current.rows[0].perfil_usuario, senha);
  const hashed = await hashPassword(senha);
  try {
    await queryable.query(SQL_USERS.updatePassword, [id, hashed.senha_hash, hashed.senha_salt]);
    return { ok: true };
  } catch (error) {
    throw mapDatabaseError(error);
  }
}
