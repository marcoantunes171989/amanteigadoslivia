import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AdminError } from './admin-errors.js';
import {
  assertCredentialPolicy,
  createUsuario as createUsuarioBase,
  listUsuarios,
  normalizeLoginUsuario,
  normalizePerfil,
  publicUser,
  resetUsuarioSenha,
  updateUsuario as updateUsuarioBase,
} from './admin-users.js';

// Fixtures existentes usam só e-mail. Quando o teste não informa `usuario`,
// deriva um login válido da parte local do e-mail. Os testes de regra do
// campo Usuário chamam as funções base diretamente, sem este default.
function loginFromEmail(email) {
  const local = String(email || '').split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '');
  return local.length >= 3 ? local : `${local}xxx`.slice(0, 3);
}

function withDefaultLogin(dados = {}) {
  if (dados.usuario !== undefined || dados.login_usuario !== undefined || !dados.email) return dados;
  return { ...dados, usuario: loginFromEmail(dados.email) };
}

function createUsuario(queryable, dados, session) {
  return createUsuarioBase(queryable, withDefaultLogin(dados), session);
}

function updateUsuario(queryable, id, dados, session) {
  return updateUsuarioBase(queryable, id, withDefaultLogin(dados), session);
}
import { hashPassword, pinPolicyError, verifyPassword } from './password.js';

function userRow(overrides = {}) {
  return {
    id_usuario_admin: '11111111-1111-4111-8111-111111111111',
    nome_usuario: 'Super',
    email_usuario: 'super@example.com',
    login_usuario: 'super',
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
          login_usuario: params[5],
        });
        return { rows: [user] };
      }
      if (text.includes('op:insert_usuario')) {
        return { rows: [{
          id_usuario_admin: params[0],
          nome_usuario: params[1],
          email_usuario: params[2],
          login_usuario: params[7],
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

test('ADMIN nao cria SUPER_ADMIN', async () => {
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

test('ROOT protegido cria SUPER_ADMIN nao protegido', async () => {
  const created = await createUsuario(poolWith(null), {
    nome: 'Novo Super',
    email: 'novo-super@example.com',
    senha: 'senha-forte-123',
    perfil: 'SUPER_ADMIN',
  }, {
    id_usuario_admin: 'root-1',
    perfil: 'SUPER_ADMIN',
    protegido: true,
  });
  assert.equal(created.perfil_usuario, 'SUPER_ADMIN');
  assert.equal(created.protegido, false);
  assert.equal(created.ativo, true);
  assert.equal(created.senha, undefined);
  assert.equal(created.senha_hash, undefined);
  assert.equal(created.senha_salt, undefined);
});

test('SUPER_ADMIN novo nao protegido nao cria SUPER_ADMIN', async () => {
  await assert.rejects(
    () => createUsuario(poolWith(null), {
      nome: 'Outro Super',
      email: 'outro-super@example.com',
      senha: 'senha-forte-123',
      perfil: 'SUPER_ADMIN',
    }, {
      id_usuario_admin: 'super-2',
      perfil: 'SUPER_ADMIN',
      protegido: false,
    }),
    (error) => error instanceof AdminError && error.status === 403,
  );
});

test('GESTOR nao cria usuarios', async () => {
  await assert.rejects(
    () => createUsuario(poolWith(null), {
      nome: 'Y',
      email: 'y@example.com',
      senha: 'senha-forte-123',
      perfil: 'GESTOR',
    }, { id_usuario_admin: 'gestor-1', perfil: 'GESTOR' }),
    (error) => error instanceof AdminError && error.status === 403,
  );
});

test('ADMIN cria GESTOR e senha nao retorna', async () => {
  const created = await createUsuario(poolWith(null), {
    nome: 'Gerente',
    email: 'gerente@example.com',
    senha: '123456',
    perfil: 'GESTOR',
  }, { id_usuario_admin: 'admin-1', perfil: 'ADMIN' });
  assert.equal(created.perfil_usuario, 'GESTOR');
  assert.equal(created.protegido, false);
  assert.equal(created.senha, undefined);
  assert.equal(created.senha_hash, undefined);
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

test('ROOT continua protegido apos edicao de nome', async () => {
  const user = userRow();
  const updated = await updateUsuario(poolWith(user), user.id_usuario_admin, {
    nome: 'Super Atualizado',
    email: 'super.novo@example.com',
  }, {
    id_usuario_admin: user.id_usuario_admin,
    perfil: 'SUPER_ADMIN',
    protegido: true,
  });
  assert.equal(updated.protegido, true);
  assert.equal(updated.perfil_usuario, 'SUPER_ADMIN');
  assert.equal(updated.ativo, true);
});

test('ROOT pode inativar SUPER_ADMIN nao protegido', async () => {
  const user = userRow({
    id_usuario_admin: '33333333-3333-4333-8333-333333333333',
    email_usuario: 'outro-super@example.com',
    protegido: false,
  });
  const updated = await updateUsuario(poolWith(user), user.id_usuario_admin, {
    ativo: false,
  }, {
    id_usuario_admin: '11111111-1111-4111-8111-111111111111',
    perfil: 'SUPER_ADMIN',
    protegido: true,
  });
  assert.equal(updated.ativo, false);
  assert.equal(updated.protegido, false);
});

test('reset senha nao devolve hash', async () => {
  const user = userRow({
    id_usuario_admin: '44444444-4444-4444-8444-444444444444',
    perfil_usuario: 'GESTOR',
    protegido: false,
  });
  const result = await resetUsuarioSenha(poolWith(user), user.id_usuario_admin, '123456', {
    id_usuario_admin: 'root-1',
    perfil: 'SUPER_ADMIN',
    protegido: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.senha, undefined);
  assert.equal(result.senha_hash, undefined);
  assert.equal(result.senha_salt, undefined);
});

test('hashPassword continues to use scrypt salt', async () => {
  const hashed = await hashPassword('senha-forte-123');
  assert.equal(hashed.senha_hash.length, 128);
  assert.equal(hashed.senha_salt.length, 32);
});

function recordingPool(user = null) {
  const base = poolWith(user);
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql: String(sql), params });
      return base.query(sql, params);
    },
  };
}

function insertParams(pool) {
  return pool.calls.find((item) => item.sql.includes('op:insert_usuario')).params;
}

test('PIN aceita somente digitos com no minimo 4 e preserva zero a esquerda', () => {
  for (const pin of ['1234', '0123', '12345', '0000', '987654', '123456']) {
    assert.equal(pinPolicyError(pin), null, pin);
  }
  assert.equal('0123'.length, 4);
});

test('PIN rejeita vazio, curto, letras, espacos, hifen e digitos nao ASCII', () => {
  for (const pin of ['', '1', '123', '12a4', 'abcd', '12 34', '12-34', '١٢٣٤']) {
    assert.notEqual(pinPolicyError(pin), null, JSON.stringify(pin));
  }
  assert.equal(pinPolicyError('12a4'), 'Use somente números.');
  assert.equal(pinPolicyError('123'), 'Informe no mínimo 4 dígitos.');
});

test('PIN nao aceita number: zeros a esquerda nao podem ser perdidos por conversao', () => {
  assert.notEqual(pinPolicyError(1234), null);
  assert.notEqual(pinPolicyError(null), null);
});

test('politica de credencial: ADMIN e GESTOR usam PIN, SUPER_ADMIN usa politica completa', () => {
  assert.equal(assertCredentialPolicy('GESTOR', '0123'), undefined);
  assert.equal(assertCredentialPolicy('ADMIN', '12345'), undefined);
  assert.throws(() => assertCredentialPolicy('GESTOR', 'senha-forte-123'), (error) => error.status === 400);
  assert.equal(assertCredentialPolicy('SUPER_ADMIN', 'senha-forte-123'), undefined);
  assert.throws(() => assertCredentialPolicy('SUPER_ADMIN', '1234'), (error) => error.status === 400);
});

test('GESTOR com PIN "0123" chega ao hash como 4 caracteres e valida no login', async () => {
  const pool = recordingPool();
  await createUsuario(pool, {
    nome: 'Gerente PIN',
    email: 'gerente-pin@example.com',
    senha: '0123',
    perfil: 'GESTOR',
  }, { id_usuario_admin: 'admin-1', perfil: 'ADMIN' });
  const [, , , senhaHash, senhaSalt] = insertParams(pool);
  assert.equal(await verifyPassword('0123', senhaHash, senhaSalt), true);
  assert.equal(await verifyPassword('123', senhaHash, senhaSalt), false);
  assert.equal(await verifyPassword('0123 ', senhaHash, senhaSalt), false);
});

test('ADMIN cria GESTOR com PIN e o hash nao aparece na resposta', async () => {
  const pool = recordingPool();
  const created = await createUsuario(pool, {
    nome: 'Gerente',
    email: 'gerente2@example.com',
    senha: '987654',
    perfil: 'GESTOR',
  }, { id_usuario_admin: 'admin-1', perfil: 'ADMIN' });
  assert.equal(created.senha, undefined);
  assert.equal(created.senha_hash, undefined);
  assert.equal(created.senha_salt, undefined);
  assert.equal(insertParams(pool)[5], 'GESTOR');
});

test('GESTOR com senha alfanumerica nao e aceito: PIN obrigatorio', async () => {
  await assert.rejects(
    () => createUsuario(poolWith(null), {
      nome: 'Gerente',
      email: 'gerente3@example.com',
      senha: 'senha-forte-123',
      perfil: 'GESTOR',
    }, { id_usuario_admin: 'admin-1', perfil: 'ADMIN' }),
    (error) => error instanceof AdminError && error.status === 400 && error.code === 'validation_error',
  );
});

test('PIN curto e nao numerico sao rejeitados na criacao com mensagem clara', async () => {
  const actor = { id_usuario_admin: 'admin-1', perfil: 'ADMIN' };
  const base = { nome: 'G', email: 'g@example.com', perfil: 'GESTOR' };
  await assert.rejects(() => createUsuario(poolWith(null), { ...base, senha: '123' }, actor), (error) => error.message === 'Informe no mínimo 4 dígitos.');
  await assert.rejects(() => createUsuario(poolWith(null), { ...base, senha: '12a4' }, actor), (error) => error.message === 'Use somente números.');
  await assert.rejects(() => createUsuario(poolWith(null), { ...base, senha: 1234 }, actor), (error) => error.status === 400);
});

test('SUPER_ADMIN novo mantem a politica completa: PIN numerico e rejeitado', async () => {
  await assert.rejects(
    () => createUsuario(poolWith(null), {
      nome: 'Novo Super',
      email: 'novo-super-pin@example.com',
      senha: '1234',
      perfil: 'SUPER_ADMIN',
    }, { id_usuario_admin: 'root-1', perfil: 'SUPER_ADMIN', protegido: true }),
    (error) => error instanceof AdminError && error.status === 400 && error.message === 'Senha deve ter pelo menos 8 caracteres.',
  );
});

test('usuario sem permissao recebe 403 mesmo com senha invalida (autorizacao antes da validacao)', async () => {
  await assert.rejects(
    () => createUsuario(poolWith(null), {
      nome: 'Y',
      email: 'y2@example.com',
      senha: '12',
      perfil: 'GESTOR',
    }, { id_usuario_admin: 'gestor-1', perfil: 'GESTOR' }),
    (error) => error instanceof AdminError && error.status === 403,
  );
});

test('reset de PIN de GESTOR aceita "0123" e grava hash verificavel', async () => {
  const user = {
    id_usuario_admin: '55555555-5555-4555-8555-555555555555',
    nome_usuario: 'Gerente',
    email_usuario: 'gerente-reset@example.com',
    perfil_usuario: 'GESTOR',
    ativo: true,
    protegido: false,
  };
  const pool = recordingPool(user);
  const result = await resetUsuarioSenha(pool, user.id_usuario_admin, '0123', {
    id_usuario_admin: 'root-1',
    perfil: 'SUPER_ADMIN',
    protegido: true,
  });
  assert.deepEqual(result, { ok: true });
  const [, senhaHash, senhaSalt] = pool.calls.find((item) => item.sql.includes('op:update_usuario_senha')).params;
  assert.equal(await verifyPassword('0123', senhaHash, senhaSalt), true);
  assert.equal(await verifyPassword('123', senhaHash, senhaSalt), false);
});

test('reset de PIN invalido de GESTOR e rejeitado antes de gravar', async () => {
  const user = {
    id_usuario_admin: '66666666-6666-4666-8666-666666666666',
    nome_usuario: 'Gerente',
    email_usuario: 'gerente-bad@example.com',
    perfil_usuario: 'GESTOR',
    ativo: true,
    protegido: false,
  };
  const pool = recordingPool(user);
  await assert.rejects(
    () => resetUsuarioSenha(pool, user.id_usuario_admin, '12-34', {
      id_usuario_admin: 'root-1',
      perfil: 'SUPER_ADMIN',
      protegido: true,
    }),
    (error) => error.status === 400 && error.message === 'Use somente números.',
  );
  assert.equal(pool.calls.some((item) => item.sql.includes('op:update_usuario_senha')), false);
});

test('reset de SUPER_ADMIN nao protegido continua exigindo politica completa', async () => {
  const user = {
    id_usuario_admin: '77777777-7777-4777-8777-777777777777',
    nome_usuario: 'Super 2',
    email_usuario: 'super2@example.com',
    perfil_usuario: 'SUPER_ADMIN',
    ativo: true,
    protegido: false,
  };
  await assert.rejects(
    () => resetUsuarioSenha(poolWith(user), user.id_usuario_admin, '1234', {
      id_usuario_admin: 'root-1',
      perfil: 'SUPER_ADMIN',
      protegido: true,
    }),
    (error) => error.status === 400 && error.message === 'Senha deve ter pelo menos 8 caracteres.',
  );
});

test('hashPassword aceita PIN de 4 caracteres e recusa menos de 4', async () => {
  const hashed = await hashPassword('0123');
  assert.equal(await verifyPassword('0123', hashed.senha_hash, hashed.senha_salt), true);
  await assert.rejects(() => hashPassword('123'), /password_too_short/);
});
