import { randomUUID } from 'node:crypto';
import { AdminError, mapDatabaseError } from './admin-errors.js';
import { hashPassword } from './password.js';

export const PERFIS_USUARIO = Object.freeze(['SUPER_ADMIN', 'ADMIN', 'GESTOR']);

export const SQL_USERS = {
  getByEmail: `-- op:get_usuario_email
    SELECT id_usuario_admin, nome_usuario, email_usuario, senha_hash, senha_salt,
           perfil_usuario, ativo, protegido, data_ultimo_login
    FROM app.tab_usuario_admin
    WHERE lower(email_usuario) = lower($1)
  `,
  getById: `-- op:get_usuario_id
    SELECT id_usuario_admin, nome_usuario, email_usuario, perfil_usuario, ativo,
           protegido, data_criacao, data_atualizacao, data_ultimo_login
    FROM app.tab_usuario_admin
    WHERE id_usuario_admin = $1
  `,
  list: `-- op:list_usuarios
    SELECT id_usuario_admin, nome_usuario, email_usuario, perfil_usuario, ativo,
           protegido, data_criacao, data_atualizacao, data_ultimo_login
    FROM app.tab_usuario_admin
    ORDER BY nome_usuario ASC
  `,
  insert: `-- op:insert_usuario
    INSERT INTO app.tab_usuario_admin (
      id_usuario_admin, nome_usuario, email_usuario, senha_hash, senha_salt, perfil_usuario, ativo, protegido
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, false)
    RETURNING id_usuario_admin, nome_usuario, email_usuario, perfil_usuario, ativo, protegido,
              data_criacao, data_ultimo_login
  `,
  update: `-- op:update_usuario
    UPDATE app.tab_usuario_admin
    SET nome_usuario = $2,
        email_usuario = $3,
        perfil_usuario = $4,
        ativo = $5,
        data_atualizacao = now()
    WHERE id_usuario_admin = $1
    RETURNING id_usuario_admin, nome_usuario, email_usuario, perfil_usuario, ativo, protegido,
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

function isSelf(session, id) {
  return Boolean(session?.id_usuario_admin && String(session.id_usuario_admin) === String(id));
}

function forbiddenProtected() {
  throw new AdminError(403, 'forbidden', 'Operação não permitida para este usuário.');
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id_usuario_admin: String(row.id_usuario_admin),
    nome_usuario: row.nome_usuario,
    email_usuario: row.email_usuario,
    perfil_usuario: row.perfil_usuario,
    ativo: row.ativo === true,
    protegido: isProtectedUser(row),
    data_criacao: row.data_criacao || null,
    data_atualizacao: row.data_atualizacao || null,
    data_ultimo_login: row.data_ultimo_login || null,
  };
}

export function assertCanManageProtectedUser(session, current, next = {}) {
  if (!current) {
    throw new AdminError(404, 'not_found', 'Usuário não encontrado.');
  }
  if (!isProtectedUser(current) && current.perfil_usuario !== 'SUPER_ADMIN') {
    return;
  }

  const actor = sessionPerfil(session);
  const self = isSelf(session, current.id_usuario_admin);
  const nextPerfil = next.perfil_usuario === undefined ? current.perfil_usuario : next.perfil_usuario;
  const nextAtivo = next.ativo === undefined ? current.ativo === true : next.ativo === true;
  const nextProtegido = next.protegido === undefined ? isProtectedUser(current) : next.protegido === true;

  if (nextAtivo === false || nextPerfil !== 'SUPER_ADMIN' || nextProtegido === false) {
    forbiddenProtected();
  }
  if (next.resetPassword && !(self && actor === 'SUPER_ADMIN')) {
    forbiddenProtected();
  }
}

export async function findUsuarioByEmail(queryable, email) {
  const result = await queryable.query(SQL_USERS.getByEmail, [String(email || '').trim()]);
  return result.rows[0] || null;
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
  const email = normalizeEmail(dados.email_usuario ?? dados.email);
  const senha = dados.senha;
  if (typeof senha !== 'string' || senha.length < 8) {
    throw new AdminError(400, 'validation_error', 'Senha deve ter pelo menos 8 caracteres.');
  }
  const perfil = normalizePerfil(dados.perfil_usuario ?? dados.perfil, 'ADMIN');
  if (perfil === 'SUPER_ADMIN' || dados.protegido === true) {
    throw new AdminError(403, 'forbidden', 'Operação não permitida para este usuário.');
  }
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
    ]);
    return publicUser(result.rows[0]);
  } catch (error) {
    if (error?.code === '23505') {
      throw new AdminError(409, 'conflict', 'Já existe um usuário com este e-mail.');
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
    const result = await queryable.query(SQL_USERS.update, [id, nome, email, perfil, ativo]);
    return publicUser(result.rows[0]);
  } catch (error) {
    if (error?.code === '23505') {
      throw new AdminError(409, 'conflict', 'Já existe um usuário com este e-mail.');
    }
    throw mapDatabaseError(error);
  }
}

export async function resetUsuarioSenha(queryable, id, senha, session = {}) {
  if (!id) {
    throw new AdminError(400, 'validation_error', 'Usuário é obrigatório.');
  }
  if (typeof senha !== 'string' || senha.length < 8) {
    throw new AdminError(400, 'validation_error', 'Senha deve ter pelo menos 8 caracteres.');
  }
  const current = await queryable.query(SQL_USERS.getById, [id]);
  if (!current.rows[0]) {
    throw new AdminError(404, 'not_found', 'Usuário não encontrado.');
  }
  assertCanManageProtectedUser(session, current.rows[0], { resetPassword: true });
  const hashed = await hashPassword(senha);
  try {
    await queryable.query(SQL_USERS.updatePassword, [id, hashed.senha_hash, hashed.senha_salt]);
    return { ok: true };
  } catch (error) {
    throw mapDatabaseError(error);
  }
}
