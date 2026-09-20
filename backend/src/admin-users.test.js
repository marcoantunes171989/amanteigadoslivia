import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AdminError } from './admin-errors.js';
import {
  createUsuario,
  listUsuarios,
  normalizePerfil,
  publicUser,
  resetUsuarioSenha,
  updateUsuario,
} from './admin-users.js';
import { hashPassword } from './password.js';

function userRow(overrides = {}) {
  return {
    id_usuario_admin: '11111111-1111-4111-8111-111111111111',
    nome_usuario: 'Super',
    email_usuario: 'super@example.com',
    perfil_usuario: 'SUPER_ADMIN',
    ativo: true,
    protegido: true,
    data_criacao: '2026-01-01',
    data_atualizacao: '2026-01-01',
    data_ultimo_login: null,
    ...overrides,
  };
}

function poolWith(user) {
  return {
    async query(sql, params = []) {
      const text = String(sql);
      if (text.includes('op:get_usuario_id')) {
        return { rows: user && String(params[0]) === String(user.id_usuario_admin) ? [user] : [] };
      }
      if (text.includes('op:update_usuario_senha')) {
        return { rows: [{ id_usuario_admin: params[0] }] };
      }
      if (text.includes('op:update_usuario')) {
        if (user.protegido === true && (params[4] === false || params[3] !== 'SUPER_ADMIN')) {
          const error = new Error('Operacao nao permitida para este usuario.');
          error.code = '23001';
          throw error;
        }
        Object.assign(user, {
          nome_usuario: params[1],
          email_usuario: params[2],
          perfil_usuario: params[3],
          ativo: params[4],
        });
        return { rows: [user] };
      }
      if (text.includes('op:insert_usuario')) {
        return { rows: [{
          id_usuario_admin: params[0],
          nome_usuario: params[1],
          email_usuario: params[2],
          perfil_usuario: params[5],
          ativo: params[6],
          protegido: false,
        }] };
      }
      if (text.includes('op:count_admin_ativos')) {
        return { rows: [{ total: 2 }] };
      }
      return { rows: [] };
    },
  };
}

test('perfil SUPER_ADMIN aceito', () => {
  assert.equal(normalizePerfil('super_admin'), 'SUPER_ADMIN');
  assert.equal(normalizePerfil('ADMIN'), 'ADMIN');
  assert.equal(normalizePerfil('GESTOR'), 'GESTOR');
  assert.throws(() => normalizePerfil('ROOT'), AdminError);
});

test('protected user public representation', () => {
  const pub = publicUser(userRow());
  assert.equal(pub.perfil_usuario, 'SUPER_ADMIN');
  assert.equal(pub.protegido, true);
  assert.equal(pub.ativo, true);
  assert.equal(pub.senha_hash, undefined);
  assert.equal(pub.senha_salt, undefined);
});

test('ADMIN nao desativa protegido', async () => {
  const user = userRow();
  await assert.rejects(
    () => updateUsuario(poolWith(user), user.id_usuario_admin, { ativo: false }, {
      id_usuario_admin: 'admin-1',
      perfil: 'ADMIN',
    }),
    (error) => error instanceof AdminError && error.status === 403,
  );
});

test('GESTOR nao desativa protegido', async () => {
  const user = userRow();
  await assert.rejects(
    () => updateUsuario(poolWith(user), user.id_usuario_admin, { ativo: false }, {
      id_usuario_admin: 'gestor-1',
      perfil: 'GESTOR',
    }),
    (error) => error instanceof AdminError && error.status === 403,
  );
});

test('perfil nao pode ser rebaixado', async () => {
  const user = userRow();
  await assert.rejects(
    () => updateUsuario(poolWith(user), user.id_usuario_admin, { perfil: 'GESTOR' }, {
      id_usuario_admin: 'admin-1',
      perfil: 'ADMIN',
    }),
    (error) => error instanceof AdminError && error.status === 403,
  );
});

test('protegido nao pode virar false', async () => {
  const user = userRow();
  await assert.rejects(
    () => updateUsuario(poolWith(user), user.id_usuario_admin, { protegido: false }, {
      id_usuario_admin: user.id_usuario_admin,
      perfil: 'SUPER_ADMIN',
    }),
    (error) => error instanceof AdminError && error.status === 403,
  );
});

test('reset de senha protegido por permissao', async () => {
  const user = userRow();
  await assert.rejects(
    () => resetUsuarioSenha(poolWith(user), user.id_usuario_admin, 'nova-senha-123', {
      id_usuario_admin: 'admin-1',
      perfil: 'ADMIN',
    }),
    (error) => error instanceof AdminError && error.status === 403,
  );
  const ok = await resetUsuarioSenha(poolWith(user), user.id_usuario_admin, 'nova-senha-123', {
    id_usuario_admin: user.id_usuario_admin,
    perfil: 'SUPER_ADMIN',
  });
  assert.equal(ok.ok, true);
});

test('API nao cria SUPER_ADMIN', async () => {
  await assert.rejects(
    () => createUsuario(poolWith(null), {
      nome: 'X',
      email: 'x@example.com',
      senha: 'senha-forte-123',
      perfil: 'SUPER_ADMIN',
    }, { perfil: 'ADMIN' }),
    (error) => error instanceof AdminError && error.status === 403,
  );
});

test('listagem retorna protegido sem hash ou salt', async () => {
  const pool = {
    async query() {
      return { rows: [userRow()] };
    },
  };
  const users = await listUsuarios(pool);
  assert.equal(users.length, 1);
  assert.equal(users[0].protegido, true);
  assert.equal(users[0].perfil_usuario, 'SUPER_ADMIN');
  assert.equal(users[0].senha_hash, undefined);
  assert.equal(users[0].senha_salt, undefined);
});

test('SUPER_ADMIN pode alterar nome e email sem desproteger', async () => {
  const user = userRow();
  const updated = await updateUsuario(poolWith(user), user.id_usuario_admin, {
    nome: 'Super Atualizado',
    email: 'super.novo@example.com',
  }, {
    id_usuario_admin: user.id_usuario_admin,
    perfil: 'SUPER_ADMIN',
  });
  assert.equal(updated.nome_usuario, 'Super Atualizado');
  assert.equal(updated.email_usuario, 'super.novo@example.com');
  assert.equal(updated.perfil_usuario, 'SUPER_ADMIN');
  assert.equal(updated.protegido, true);
  assert.equal(updated.ativo, true);
});

test('hashPassword continues to use scrypt salt', async () => {
  const hashed = await hashPassword('senha-forte-123');
  assert.equal(hashed.senha_hash.length, 128);
  assert.equal(hashed.senha_salt.length, 32);
});
