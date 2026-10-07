import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  ADMIN_ROWS_SQL,
  BOOTSTRAP_INSERT_SQL,
  BOOTSTRAP_LOCK_SQL,
  IDENTITY_SQL,
  PRIVILEGED_LEDGER_GUARD_SQL,
  PRIVILEGED_PRIVILEGES_SQL,
  PRIVILEGED_STRUCTURE_GUARD_SQL,
  RESET_ROLE_SQL,
  RUNTIME_BOOTSTRAP_GUARD_SQL,
  SET_OWNER_ROLE_SQL,
} from './dev-super-admin-sql.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));

function codeOnly(file) {
  return readFileSync(file, 'utf8').replace(/^\s*\/\/.*$/gm, '');
}

// Consultas que o app_role (B) pode executar: nenhuma pode tocar o ledger.
const RUNTIME_QUERIES = { RUNTIME_BOOTSTRAP_GUARD_SQL, BOOTSTRAP_LOCK_SQL, BOOTSTRAP_INSERT_SQL, ADMIN_ROWS_SQL };

test('B: nenhuma consulta do runtime referencia app.schema_migrations', () => {
  for (const [name, sql] of Object.entries(RUNTIME_QUERIES)) {
    assert.doesNotMatch(sql, /schema_migrations/, name);
  }
});

test('B: o guard runtime nao contem SET ROLE/RESET ROLE nem o login migrator', () => {
  // O nome do owner aparece apenas como dono de funcao lido do catalogo (sem privilegio); nao ha SET ROLE.
  assert.doesNotMatch(RUNTIME_BOOTSTRAP_GUARD_SQL, /SET\s+(LOCAL\s+|SESSION\s+)?ROLE|RESET\s+ROLE/i);
  assert.doesNotMatch(RUNTIME_BOOTSTRAP_GUARD_SQL, /amanteigados_dev_migrator/);
});

test('B: o guard runtime nao usa a funcao current_user como identidade de privilegio do app', () => {
  // Privilegios do app sao lidos pelo nome fixo do app_role, nunca pelo current_user (que e o do chamador).
  assert.match(RUNTIME_BOOTSTRAP_GUARD_SQL, /has_table_privilege\('amanteigados_dev_app', 'app\.tab_usuario_admin', 'SELECT'\)/);
  assert.doesNotMatch(RUNTIME_BOOTSTRAP_GUARD_SQL, /has_table_privilege\(current_user/);
});

test('B: o guard runtime e composto apenas por identidade, estrutura e privilegios do app', () => {
  assert.match(RUNTIME_BOOTSTRAP_GUARD_SQL, /AS db_ok/);
  assert.match(RUNTIME_BOOTSTRAP_GUARD_SQL, /AS tables/);
  assert.match(RUNTIME_BOOTSTRAP_GUARD_SQL, /AS priv_schema_usage/);
  assert.doesNotMatch(RUNTIME_BOOTSTRAP_GUARD_SQL, /AS ledger\b|AS migrator_owner_exact|AS ledger_no_app_acl/);
});

test('A/C: o ledger so e consultado pela query privilegiada, nunca pelo runtime', () => {
  assert.match(PRIVILEGED_LEDGER_GUARD_SQL, /app\.schema_migrations/);
  assert.doesNotMatch(RUNTIME_BOOTSTRAP_GUARD_SQL, /PRIVILEGED_/);
});

test('A/C: a query de seguranca verifica membership exata, SET e ACL do ledger', () => {
  assert.match(PRIVILEGED_PRIVILEGES_SQL, /m\.admin_option = false AND m\.inherit_option = false AND m\.set_option = true/);
  assert.match(PRIVILEGED_PRIVILEGES_SQL, /pg_has_role\('amanteigados_dev_migrator', 'amanteigados_dev_owner', 'SET'\) AS migrator_can_set_owner/);
  assert.match(PRIVILEGED_PRIVILEGES_SQL, /NOT pg_has_role\('amanteigados_dev_app', 'amanteigados_dev_owner', 'SET'\) AS app_cannot_set_owner/);
  assert.match(PRIVILEGED_PRIVILEGES_SQL, /ledger_no_app_acl/);
  assert.match(PRIVILEGED_PRIVILEGES_SQL, /aclexplode/);
});

test('A/C: a estrutura privilegiada inclui as 15 tabelas via catalogo (ledger incluso)', () => {
  assert.match(PRIVILEGED_STRUCTURE_GUARD_SQL, /n\.nspname = 'app' AND c\.relkind = 'r'/);
});

test('identidade compartilhada nao toca o ledger', () => {
  assert.doesNotMatch(IDENTITY_SQL, /schema_migrations/);
  assert.match(IDENTITY_SQL, /session_user::text AS sess_user/);
  assert.match(IDENTITY_SQL, /current_user::text AS curr_user/);
});

test('SET ROLE e RESET ROLE sao constantes com o owner esperado', () => {
  assert.equal(SET_OWNER_ROLE_SQL, 'SET ROLE amanteigados_dev_owner');
  assert.equal(RESET_ROLE_SQL, 'RESET ROLE');
});

test('leitura de admin nao seleciona senha nem hash, apenas o teste de formato', () => {
  assert.doesNotMatch(ADMIN_ROWS_SQL, /senha_hash\s*,|senha_salt\s*,/);
  assert.match(ADMIN_ROWS_SQL, /hash_format_ok/);
  assert.doesNotMatch(RUNTIME_BOOTSTRAP_GUARD_SQL, /senha_hash|senha_salt/);
});

test('bootstrap B: nenhum SET ROLE, RESET ROLE, ledger ou senha de outra identidade no script', () => {
  const source = codeOnly(path.join(dir, '..', 'dev-super-admin-bootstrap.mjs'));
  assert.doesNotMatch(source, /SET\s+(LOCAL\s+|SESSION\s+)?ROLE|RESET\s+ROLE/i);
  assert.doesNotMatch(source, /schema_migrations|PRIVILEGED_|SET_OWNER_ROLE_SQL|RESET_ROLE_SQL/);
  assert.doesNotMatch(source, /DEV_MIGRATOR_USER|DEV_OWNER_ROLE/);
  assert.doesNotMatch(source, /migrator/i);
});

test('bootstrap B: LOCK antes das guardas runtime, guardas antes do INSERT, COMMIT depois da pos-condicao', () => {
  const source = codeOnly(path.join(dir, '..', 'dev-super-admin-bootstrap.mjs'));
  const lock = source.indexOf('client.query(BOOTSTRAP_LOCK_SQL)');
  const guard = source.indexOf('client.query(RUNTIME_BOOTSTRAP_GUARD_SQL)');
  const insert = source.indexOf('client.query(BOOTSTRAP_INSERT_SQL');
  const post = source.indexOf('evaluateAdminTable(after.rows');
  const commit = source.indexOf("client.query('COMMIT')");
  assert.ok(lock > 0 && guard > lock, 'LOCK antes das guardas');
  assert.ok(insert > guard, 'guardas antes do INSERT');
  assert.ok(post > insert && commit > post, 'pos-condicao antes do COMMIT');
});

test('bootstrap B: ROLLBACK em erro e nenhum COMMIT antes da pos-condicao', () => {
  const source = codeOnly(path.join(dir, '..', 'dev-super-admin-bootstrap.mjs'));
  assert.match(source, /await client\.query\('ROLLBACK'\)\.catch/);
  assert.equal([...source.matchAll(/client\.query\('COMMIT'\)/g)].length, 1);
});
