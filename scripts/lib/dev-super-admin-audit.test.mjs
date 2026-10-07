import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Analise estatica offline: nenhum teste conecta ao PostgreSQL nem executa o CLI.
const dir = path.dirname(fileURLToPath(import.meta.url));
const auditPath = path.join(dir, '..', 'dev-super-admin-audit.mjs');

function codeOnly(file) {
  return readFileSync(file, 'utf8').replace(/^\s*\/\/.*$/gm, '');
}

test('auditoria faz login como amanteigados_dev_migrator e nao usa a identidade app', () => {
  const source = codeOnly(auditPath);
  assert.match(source, /user:\s*DEV_MIGRATOR_USER/);
  assert.doesNotMatch(source, /DEV_APP_USER|amanteigados_dev_app/);
  assert.match(source, /Senha PostgreSQL \(amanteigados_dev_migrator\)/);
});

test('auditoria nao executa LOCK, escrita nem COMMIT', () => {
  const source = codeOnly(auditPath);
  assert.doesNotMatch(source, /\bLOCK\b/i);
  assert.doesNotMatch(source, /COMMIT/);
  assert.doesNotMatch(source, /INSERT\s+INTO|UPDATE\s+app\.|DELETE\s+FROM|TRUNCATE|GRANT\s|REVOKE\s|ALTER\s+(TABLE|DEFAULT)|CREATE\s+/i);
});

test('auditoria: READ ONLY antes de qualquer inspecao e antes do SET ROLE owner', () => {
  const source = codeOnly(auditPath);
  const readOnly = source.indexOf("client.query('SET TRANSACTION READ ONLY')");
  const setRole = source.indexOf('client.query(SET_OWNER_ROLE_SQL)');
  assert.ok(readOnly > 0 && setRole > readOnly, 'SET TRANSACTION READ ONLY antes do SET ROLE');
  assert.ok(source.indexOf('client.query(IDENTITY_SQL)') < setRole, 'identidade pre-SET ROLE antes do SET ROLE');
});

test('auditoria le ledger, estrutura, privilegios e usuarios somente depois do SET ROLE owner', () => {
  const source = codeOnly(auditPath);
  const setRole = source.indexOf('client.query(SET_OWNER_ROLE_SQL)');
  for (const query of ['PRIVILEGED_LEDGER_GUARD_SQL', 'PRIVILEGED_STRUCTURE_GUARD_SQL', 'PRIVILEGED_PRIVILEGES_SQL', 'ADMIN_ROWS_SQL']) {
    assert.ok(source.indexOf(`client.query(${query})`) > setRole, `${query} deve vir depois do SET ROLE owner`);
  }
});

test('auditoria exige exatamente 1 usuario, 1 SUPER_ADMIN, 1 protegido, 1 ativo e o mesmo registro', () => {
  const source = codeOnly(auditPath);
  assert.match(source, /evaluateStructure\(structure\.rows\[0\], \{ expectUsuarioTotal: 1/);
  assert.match(source, /evaluateAdminTable\(admins\.rows, \{ expectedNome, expectedEmail \}\)/);
});

test('auditoria termina em RESET ROLE + ROLLBACK e valida a identidade apos o RESET', () => {
  const source = codeOnly(auditPath);
  const from = source.indexOf("stage = 'AUDIT_RESET_ROLE'");
  assert.ok(from > 0);
  assert.ok(source.indexOf('client.query(RESET_ROLE_SQL)', from) < source.indexOf("client.query('ROLLBACK')", from));
  assert.match(source, /sessionUser:\s*DEV_MIGRATOR_USER,\s*currentUser:\s*DEV_MIGRATOR_USER/);
  assert.match(source, /if \(inTransaction\) await rollbackSafely\(client\);\s*failStage\(stage, error\);/);
});

test('auditoria: etapas fixas AUDIT_* na ordem certa', () => {
  const source = codeOnly(auditPath);
  const stages = [...source.matchAll(/stage = '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(stages, [
    'AUDIT_CONEXAO',
    'AUDIT_TRANSACAO',
    'AUDIT_IDENTIDADE',
    'AUDIT_SET_ROLE',
    'AUDIT_LEDGER',
    'AUDIT_ESTRUTURA',
    'AUDIT_PRIVILEGIOS',
    'AUDIT_USUARIOS',
    'AUDIT_RESET_ROLE',
    'AUDIT_ROLLBACK',
  ]);
});

test('auditoria nao imprime error.message, hash, salt nem senha', () => {
  const source = codeOnly(auditPath);
  assert.doesNotMatch(source, /console\.(log|error)\([^)]*error\.(message|detail|query|stack|hint|where)/);
  assert.doesNotMatch(source, /senha_hash|senha_salt|console\.(log|error)\([^)]*(hash|salt|password)/i);
  const body = source.slice(source.indexOf('function failStage('), source.indexOf('async function rollbackSafely('));
  assert.match(body, /console\.error\(safeErrorCode\(error\)\)/);
  assert.doesNotMatch(body, /\.message|\.detail|\.query|\.stack/);
});

test('auditoria nao aceita argumentos', () => {
  const source = codeOnly(auditPath);
  assert.match(source, /if \(process\.argv\.length > 2\) return fail\('argumentos_nao_aceitos'\)/);
});
