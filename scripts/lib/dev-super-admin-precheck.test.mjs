import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { safeErrorCode } from './dev-super-admin-bootstrap.mjs';

// Analise estatica offline: nenhum teste conecta ao PostgreSQL nem executa o CLI.
const dir = path.dirname(fileURLToPath(import.meta.url));
const precheckPath = path.join(dir, '..', 'dev-super-admin-precheck.mjs');

// Remove comentarios de linha inteira para analisar somente codigo executavel.
function codeOnly(file) {
  return readFileSync(file, 'utf8').replace(/^\s*\/\/.*$/gm, '');
}

// Trecho da funcao failStage, do cabecalho ate a chave de fechamento.
function failStageBody(source) {
  const start = source.indexOf('function failStage(');
  assert.ok(start >= 0, 'failStage precisa existir no precheck');
  const end = source.indexOf('\n}\n', start);
  return source.slice(start, end);
}

test('precheck faz login como amanteigados_dev_migrator e nunca usa a identidade app', () => {
  const source = codeOnly(precheckPath);
  assert.match(source, /user:\s*DEV_MIGRATOR_USER/);
  assert.doesNotMatch(source, /DEV_APP_USER|DEV_BOOTSTRAP_TARGET\.user/);
  assert.doesNotMatch(source, /amanteigados_dev_app/);
  assert.match(source, /Senha PostgreSQL \(amanteigados_dev_migrator\)/);
});

test('precheck nao executa LOCK em nenhuma forma', () => {
  const source = codeOnly(precheckPath);
  assert.doesNotMatch(source, /\bLOCK\b/i);
  assert.doesNotMatch(source, /BOOTSTRAP_LOCK_SQL/);
});

test('precheck assume o owner somente via SET ROLE constante, depois da leitura READ ONLY', () => {
  const source = codeOnly(precheckPath);
  assert.match(source, /client\.query\(SET_OWNER_ROLE_SQL\)/);
  assert.doesNotMatch(source, /SET\s+(LOCAL\s+|SESSION\s+)?ROLE/i, 'SET ROLE literal nao deve aparecer no script');
  assert.ok(source.indexOf("client.query('SET TRANSACTION READ ONLY')") < source.indexOf('client.query(SET_OWNER_ROLE_SQL)'));
  assert.ok(source.indexOf('client.query(IDENTITY_SQL)') < source.indexOf('client.query(SET_OWNER_ROLE_SQL)'));
});

test('precheck le ledger, estrutura e usuarios somente depois do SET ROLE owner', () => {
  const source = codeOnly(precheckPath);
  const setRole = source.indexOf('client.query(SET_OWNER_ROLE_SQL)');
  for (const query of ['PRIVILEGED_LEDGER_GUARD_SQL', 'PRIVILEGED_STRUCTURE_GUARD_SQL', 'PRIVILEGED_PRIVILEGES_SQL', 'ADMIN_ROWS_SQL']) {
    const at = source.indexOf(`client.query(${query})`);
    assert.ok(at > setRole, `${query} deve vir depois do SET ROLE owner`);
  }
});

test('precheck nao referencia schema_migrations nem o guard antigo compartilhado', () => {
  const source = codeOnly(precheckPath);
  assert.doesNotMatch(source, /schema_migrations/);
  assert.doesNotMatch(source, /\bGUARD_SQL\b/);
});

test('precheck valida identidade antes e depois do SET ROLE e apos o RESET ROLE', () => {
  const source = codeOnly(precheckPath);
  assert.equal([...source.matchAll(/evaluateIdentity\(/g)].length, 3);
  assert.match(source, /sessionUser:\s*DEV_MIGRATOR_USER,\s*currentUser:\s*DEV_OWNER_ROLE/);
});

test('precheck permanece READ ONLY e termina em RESET ROLE + ROLLBACK, sem COMMIT', () => {
  const source = codeOnly(precheckPath);
  assert.match(source, /SET TRANSACTION READ ONLY/);
  assert.match(source, /client\.query\(RESET_ROLE_SQL\)/);
  assert.match(source, /client\.query\('ROLLBACK'\)/);
  assert.doesNotMatch(source, /COMMIT/);
  assert.doesNotMatch(source, /INSERT\s+INTO|UPDATE\s+app\.|DELETE\s+FROM|TRUNCATE|GRANT\s|REVOKE\s|ALTER\s+(TABLE|DEFAULT)|CREATE\s+/i);
});

test('precheck: RESET ROLE acontece antes do ROLLBACK final, dentro da etapa', () => {
  const source = codeOnly(precheckPath);
  const from = source.indexOf("stage = 'PRECHECK_RESET_ROLE'");
  assert.ok(from > 0);
  assert.ok(source.indexOf('client.query(RESET_ROLE_SQL)', from) < source.indexOf("client.query('ROLLBACK')", from));
});

test('precheck: em erro faz melhor esforco de RESET ROLE + ROLLBACK via rollbackSafely, sem mascarar o erro', () => {
  const source = codeOnly(precheckPath);
  const body = source.slice(source.indexOf('async function rollbackSafely('), source.indexOf('async function main('));
  assert.ok(body.indexOf('RESET_ROLE_SQL') < body.indexOf("'ROLLBACK'"));
  assert.match(body, /\.catch\(\(\) => \{\}\)/g);
  assert.match(source, /if \(inTransaction\) await rollbackSafely\(client\);\s*failStage\(stage, error\);/);
});

test('precheck define a etapa antes de cada operacao, na ordem certa', () => {
  const source = codeOnly(precheckPath);
  const order = [
    ["stage = 'PRECHECK_CONEXAO'", 'client.connect()'],
    ["stage = 'PRECHECK_TRANSACAO'", "client.query('BEGIN')"],
    ["stage = 'PRECHECK_IDENTIDADE'", 'client.query(IDENTITY_SQL)'],
    ["stage = 'PRECHECK_SET_ROLE'", 'client.query(SET_OWNER_ROLE_SQL)'],
    ["stage = 'PRECHECK_LEDGER'", 'client.query(PRIVILEGED_LEDGER_GUARD_SQL)'],
    ["stage = 'PRECHECK_ESTRUTURA'", 'client.query(PRIVILEGED_STRUCTURE_GUARD_SQL)'],
    ["stage = 'PRECHECK_PRIVILEGIOS'", 'client.query(PRIVILEGED_PRIVILEGES_SQL)'],
    ["stage = 'PRECHECK_USUARIOS'", 'client.query(ADMIN_ROWS_SQL)'],
    ["stage = 'PRECHECK_RESET_ROLE'", 'client.query(RESET_ROLE_SQL)'],
    ["stage = 'PRECHECK_ROLLBACK'", "client.query('ROLLBACK')"],
  ];
  let previous = -1;
  for (const [stageAssign, operation] of order) {
    const at = source.indexOf(stageAssign);
    // Busca a operacao a partir da etapa: rollbackSafely tambem usa RESET ROLE e ROLLBACK antes de main().
    const op = source.indexOf(operation, at);
    assert.ok(at >= 0, `etapa ausente: ${stageAssign}`);
    assert.ok(op > at, `operacao ${operation} deve vir depois de ${stageAssign}`);
    assert.ok(at > previous, `etapa fora de ordem: ${stageAssign}`);
    previous = at;
  }
});

test('falha de etapa imprime somente FAIL, identificador de etapa e codigo seguro', () => {
  const body = failStageBody(codeOnly(precheckPath));
  assert.match(body, /console\.error\('FAIL'\)/);
  assert.match(body, /console\.error\(stage\)/);
  assert.match(body, /console\.error\(safeErrorCode\(error\)\)/);
  assert.doesNotMatch(body, /\.message|\.detail|\.query|\.stack|\.hint|\.where|\.config|\.password/);
});

test('catch do precheck usa failStage com a etapa atual, nunca a mensagem bruta', () => {
  const source = codeOnly(precheckPath);
  assert.match(source, /catch \(error\) \{[\s\S]*?failStage\(stage, error\);/);
  assert.doesNotMatch(source, /console\.(log|error)\([^)]*error\.(message|detail|query|stack|hint|where)/);
});

test('identificadores de etapa do precheck sao fixos e seguem o padrao PRECHECK_*', () => {
  const source = codeOnly(precheckPath);
  const stages = [...source.matchAll(/stage = '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(stages, [
    'PRECHECK_CONEXAO',
    'PRECHECK_TRANSACAO',
    'PRECHECK_IDENTIDADE',
    'PRECHECK_SET_ROLE',
    'PRECHECK_LEDGER',
    'PRECHECK_ESTRUTURA',
    'PRECHECK_PRIVILEGIOS',
    'PRECHECK_USUARIOS',
    'PRECHECK_RESET_ROLE',
    'PRECHECK_ROLLBACK',
  ]);
  for (const stageName of stages) assert.match(stageName, /^PRECHECK_[A-Z_]+$/);
});

test('precheck le o catalogo somente depois de SET TRANSACTION READ ONLY', () => {
  const source = codeOnly(precheckPath);
  const readOnly = source.indexOf("client.query('SET TRANSACTION READ ONLY')");
  assert.ok(readOnly > 0);
  assert.ok(readOnly < source.indexOf('client.query(IDENTITY_SQL)'));
});

test('safeErrorCode devolve somente SQLSTATE, sem mensagem, e-mail ou senha', () => {
  const secret = 'SenhaNaoReal-99';
  const pgError = { code: '42501', message: `permission denied for table tab_x (${secret})`, detail: secret };
  assert.equal(safeErrorCode(pgError), '42501');
  assert.ok(!safeErrorCode(pgError).includes(secret));
  assert.equal(safeErrorCode(new Error(secret)), 'erro_interno');
});
