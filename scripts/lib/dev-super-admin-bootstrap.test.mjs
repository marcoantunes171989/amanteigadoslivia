import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  BUSINESS_TABLES,
  DEV_APP_USER,
  DEV_BOOTSTRAP_CONFIRMATION,
  DEV_BOOTSTRAP_TARGET,
  DEV_MIGRATOR_USER,
  DEV_OWNER_ROLE,
  EXPECTED_CATALOG,
  EXPECTED_TABLES,
  EXPECTED_USUARIO_COLUMNS,
  LEDGER_EXPECTED,
  LEDGER_TABLE,
  buildBootstrapRow,
  buildBootstrapSummaryLines,
  buildDevClientConfig,
  evaluateAdminTable,
  evaluateAppPrivileges,
  evaluateEmptyAdminRows,
  evaluateIdentity,
  evaluateLedger,
  evaluateRuntimeGuards,
  evaluateSecurity,
  evaluateStructure,
  findForbiddenDbEnv,
  isBootstrapConfirmed,
  safeErrorCode,
  throwIfFailures,
  validateBootstrapInput,
} from './dev-super-admin-bootstrap.mjs';
import { BOOTSTRAP_INSERT_SQL, BOOTSTRAP_LOCK_SQL } from './dev-super-admin-sql.mjs';

const SECRET_DB = 'SenhaBancoNaoReal-77';
const SECRET_ADMIN = 'SenhaAdminNaoReal-42';
const HASH_HEX = 'a'.repeat(128);
const SALT_HEX = 'b'.repeat(32);

// Linha de sessao no formato de IDENTITY_SQL.
function identityRow(overrides = {}) {
  return {
    db_ok: true,
    addr_ok: true,
    sess_user: DEV_APP_USER,
    curr_user: DEV_APP_USER,
    read_only: false,
    ...overrides,
  };
}

// Linha de estrutura/privilegios no formato de STRUCTURE_COLUMNS + APP_PRIVILEGE_COLUMNS (sem ledger).
function structureRow(overrides = {}) {
  return {
    tables: [...BUSINESS_TABLES, LEDGER_TABLE].sort(),
    columns: [...EXPECTED_USUARIO_COLUMNS],
    protegido_def_ok: true,
    checks_count: 2,
    trigger_count: 1,
    function_count: 1,
    routine_count: 1,
    sequence_count: 0,
    usuario_total: 0,
    categorias: 4,
    produtos: 8,
    imagens: 8,
    precos: 9,
    priv_select: true,
    priv_insert: true,
    priv_update: true,
    priv_delete: true,
    priv_schema_usage: true,
    ...overrides,
  };
}

// Linha de seguranca no formato de SECURITY_COLUMNS (somente A/C).
function securityRow(overrides = {}) {
  return {
    migrator_owner_exact: true,
    migrator_owner_rows: 1,
    migrator_can_set_owner: true,
    app_no_membership: true,
    app_cannot_set_owner: true,
    app_cannot_set_migrator: true,
    ledger_no_app_acl: true,
    ledger_no_migrator_acl: true,
    ledger_no_public_acl: true,
    app_no_schema_create: true,
    ...overrides,
  };
}

function goodAdminRow(overrides = {}) {
  return {
    id_usuario_admin: '11111111-1111-4111-8111-111111111111',
    nome_usuario: 'Operador Teste',
    email_usuario: 'operador@exemplo.test',
    perfil_usuario: 'SUPER_ADMIN',
    ativo: true,
    protegido: true,
    hash_format_ok: true,
    ...overrides,
  };
}

const EXPECTED = { expectedNome: 'Operador Teste', expectedEmail: 'operador@exemplo.test', expectedId: '11111111-1111-4111-8111-111111111111' };

test('destino fixo do DEV LOCAL e identidades nomeadas', () => {
  assert.deepEqual(DEV_BOOTSTRAP_TARGET, {
    host: '127.0.0.1',
    port: 5432,
    database: 'amanteigados_dev',
    user: 'amanteigados_dev_app',
    ssl: false,
  });
  assert.ok(Object.isFrozen(DEV_BOOTSTRAP_TARGET));
  assert.equal(DEV_APP_USER, 'amanteigados_dev_app');
  assert.equal(DEV_MIGRATOR_USER, 'amanteigados_dev_migrator');
  assert.equal(DEV_OWNER_ROLE, 'amanteigados_dev_owner');
});

test('config do client nao usa connectionString, fixa o destino e recebe o usuario explicito', () => {
  const config = buildDevClientConfig({ user: DEV_MIGRATOR_USER, password: SECRET_DB, applicationName: 'app-name' });
  assert.equal(config.connectionString, undefined);
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 5432);
  assert.equal(config.database, 'amanteigados_dev');
  assert.equal(config.user, DEV_MIGRATOR_USER);
  assert.equal(config.ssl, false);
  assert.equal(config.password, SECRET_DB);
});

test('aborta se DATABASE_URL, PGPASSWORD ou DATABASE_PASSWORD estiverem preenchidas, sem expor valor', () => {
  assert.deepEqual(findForbiddenDbEnv({ DATABASE_URL: `postgres://u:${SECRET_DB}@db.remoto/x` }), ['DATABASE_URL']);
  assert.deepEqual(findForbiddenDbEnv({ PGPASSWORD: SECRET_DB, DATABASE_PASSWORD: SECRET_DB }), ['DATABASE_PASSWORD', 'PGPASSWORD']);
  const found = findForbiddenDbEnv({ PGHOST: 'db.remoto.test' });
  assert.deepEqual(found, ['PGHOST']);
  assert.ok(!JSON.stringify(found).includes('db.remoto.test'));
});

test('variaveis vazias ou somente espacos nao bloqueiam', () => {
  assert.deepEqual(findForbiddenDbEnv({ DATABASE_URL: '', PGPASSWORD: '   ' }), []);
  assert.deepEqual(findForbiddenDbEnv({}), []);
});

test('validacao aceita entrada correta e normaliza e-mail sem devolver senha', () => {
  const result = validateBootstrapInput({
    nome: '  Operador Teste  ',
    email: '  Operador@Exemplo.TEST ',
    emailConfirmacao: 'operador@exemplo.test',
    senha: SECRET_ADMIN,
    senhaConfirmacao: SECRET_ADMIN,
  });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.value, { nome: 'Operador Teste', email: 'operador@exemplo.test' });
  assert.ok(!JSON.stringify(result).includes(SECRET_ADMIN));
});

test('validacao recusa nome vazio, e-mail invalido e confirmacao de e-mail divergente', () => {
  const r = validateBootstrapInput({
    nome: '   ',
    email: 'sem-arroba',
    emailConfirmacao: 'sem-arroba',
    senha: SECRET_ADMIN,
    senhaConfirmacao: SECRET_ADMIN,
  });
  assert.ok(r.errors.includes('nome_obrigatorio'));
  assert.ok(r.errors.includes('email_invalido'));

  const divergente = validateBootstrapInput({
    nome: 'X',
    email: 'a@b.test',
    emailConfirmacao: 'outro@b.test',
    senha: SECRET_ADMIN,
    senhaConfirmacao: SECRET_ADMIN,
  });
  assert.deepEqual(divergente.errors, ['email_confirmacao_divergente']);
});

test('validacao aplica a politica de senha oficial (10+ caracteres, letra e numero)', () => {
  const base = { nome: 'X', email: 'a@b.test', emailConfirmacao: 'a@b.test' };
  assert.deepEqual(
    validateBootstrapInput({ ...base, senha: 'curta1', senhaConfirmacao: 'curta1' }).errors,
    ['senha_fora_da_politica'],
  );
  assert.deepEqual(
    validateBootstrapInput({ ...base, senha: 'SomenteLetras', senhaConfirmacao: 'SomenteLetras' }).errors,
    ['senha_fora_da_politica'],
  );
  assert.deepEqual(
    validateBootstrapInput({ ...base, senha: 'SenhaBoa12345', senhaConfirmacao: 'SenhaBoa1234X' }).errors,
    ['senha_confirmacao_divergente'],
  );
});

test('confirmacao exige a frase exata', () => {
  assert.equal(isBootstrapConfirmed(DEV_BOOTSTRAP_CONFIRMATION), true);
  assert.equal(isBootstrapConfirmed(`  ${DEV_BOOTSTRAP_CONFIRMATION}  `), true);
  assert.equal(isBootstrapConfirmed('criar super admin dev local'), false);
  assert.equal(isBootstrapConfirmed(''), false);
});

test('linha do bootstrap fixa SUPER_ADMIN, protegido e ativo', () => {
  const row = buildBootstrapRow({
    id: 'id-1',
    nome: 'N',
    email: 'e@x.test',
    hashed: { senha_hash: HASH_HEX, senha_salt: SALT_HEX },
  });
  assert.equal(row.perfil_usuario, 'SUPER_ADMIN');
  assert.equal(row.protegido, true);
  assert.equal(row.ativo, true);
});

test('resumo exibido ao operador declara destino, perfil, protegido e ativo, sem senha nem hash', () => {
  const lines = buildBootstrapSummaryLines({ nome: 'N', email: 'e@x.test' }).join('\n');
  assert.match(lines, /DEV LOCAL 127\.0\.0\.1:5432\/amanteigados_dev/);
  assert.match(lines, /Perfil: SUPER_ADMIN/);
  assert.match(lines, /Protegido: SIM/);
  assert.match(lines, /Ativo: SIM/);
  assert.match(lines, /E-mail: e@x\.test/);
  assert.doesNotMatch(lines, /senha|hash/i);
});

test('INSERT aceita apenas 5 parametros e fixa SUPER_ADMIN/true/true no SQL', () => {
  const params = BOOTSTRAP_INSERT_SQL.match(/\$\d+/g);
  assert.deepEqual([...new Set(params)], ['$1', '$2', '$3', '$4', '$5']);
  assert.match(BOOTSTRAP_INSERT_SQL, /'SUPER_ADMIN', true, true/);
  assert.doesNotMatch(BOOTSTRAP_INSERT_SQL, /'ADMIN'|'GESTOR'/);
});

test('lock do bootstrap e EXCLUSIVE sobre tab_usuario_admin', () => {
  assert.equal(BOOTSTRAP_LOCK_SQL, 'LOCK TABLE app.tab_usuario_admin IN EXCLUSIVE MODE');
});

test('ledger esperado tem 0001-0005 com checksums SHA256 completos', () => {
  assert.equal(LEDGER_EXPECTED.length, 5);
  for (const line of LEDGER_EXPECTED) {
    assert.match(line, /^\d{4}_[a-z_]+=[0-9a-f]{64}$/);
  }
  assert.ok(LEDGER_EXPECTED[4].startsWith('0005_criar_super_admin_protegido='));
});

test('ledger: exatamente 0001-0005 passa; faltando ou checksum divergente falha', () => {
  assert.deepEqual(evaluateLedger({ ledger: [...LEDGER_EXPECTED] }), []);
  const alterado = [...LEDGER_EXPECTED];
  alterado[2] = alterado[2].replace(/3b1d/, 'efe0');
  assert.deepEqual(evaluateLedger({ ledger: alterado }), ['ledger_mismatch']);
  assert.deepEqual(evaluateLedger({ ledger: LEDGER_EXPECTED.slice(0, 4) }), ['ledger_mismatch']);
  assert.deepEqual(evaluateLedger({ ledger: null }), ['ledger_mismatch']);
});

test('identidade: destino, sessao, corrente e read-only sao verificados com valores esperados', () => {
  assert.deepEqual(evaluateIdentity(identityRow(), { sessionUser: DEV_APP_USER, currentUser: DEV_APP_USER }), []);
  assert.ok(evaluateIdentity(identityRow({ db_ok: false }), { sessionUser: DEV_APP_USER, currentUser: DEV_APP_USER }).includes('database_mismatch'));
  assert.ok(evaluateIdentity(identityRow({ addr_ok: false }), { sessionUser: DEV_APP_USER, currentUser: DEV_APP_USER }).includes('address_mismatch'));
  assert.ok(evaluateIdentity(identityRow({ sess_user: DEV_MIGRATOR_USER }), { sessionUser: DEV_APP_USER, currentUser: DEV_APP_USER }).includes('session_user_mismatch'));
  assert.ok(evaluateIdentity(identityRow({ curr_user: DEV_OWNER_ROLE }), { sessionUser: DEV_MIGRATOR_USER, currentUser: DEV_MIGRATOR_USER }).includes('current_user_mismatch'));
  assert.ok(evaluateIdentity(identityRow({ read_only: false }), { sessionUser: DEV_APP_USER, currentUser: DEV_APP_USER, requireReadOnly: true }).includes('transaction_not_read_only'));
});

test('estrutura: passa no estado esperado (tabela vazia, 15 tabelas, catalogo 4/8/8/9)', () => {
  assert.deepEqual(evaluateStructure(structureRow(), { expectUsuarioTotal: 0 }), []);
  assert.deepEqual(EXPECTED_CATALOG, { categorias: 4, produtos: 8, imagens: 8, precos: 9 });
});

test('estrutura: recusa tabela nao vazia quando o esperado e zero', () => {
  assert.deepEqual(evaluateStructure(structureRow({ usuario_total: 1 }), { expectUsuarioTotal: 0 }), ['usuario_total_mismatch']);
});

test('estrutura: recusa 0005 ausente ou divergente (coluna, constraints, trigger, funcao)', () => {
  assert.ok(evaluateStructure(structureRow({ columns: EXPECTED_USUARIO_COLUMNS.slice(0, 10) }), { expectUsuarioTotal: 0 }).includes('columns_mismatch'));
  assert.ok(evaluateStructure(structureRow({ protegido_def_ok: false }), { expectUsuarioTotal: 0 }).includes('protegido_definition_mismatch'));
  assert.ok(evaluateStructure(structureRow({ checks_count: 1 }), { expectUsuarioTotal: 0 }).includes('constraints_mismatch'));
  assert.ok(evaluateStructure(structureRow({ trigger_count: 0 }), { expectUsuarioTotal: 0 }).includes('trigger_mismatch'));
  assert.ok(evaluateStructure(structureRow({ function_count: 0 }), { expectUsuarioTotal: 0 }).includes('function_mismatch'));
});

test('estrutura: recusa sequence, rotina extra e catalogo divergente', () => {
  assert.ok(evaluateStructure(structureRow({ sequence_count: 1 }), { expectUsuarioTotal: 0 }).includes('unexpected_sequences'));
  assert.ok(evaluateStructure(structureRow({ routine_count: 2 }), { expectUsuarioTotal: 0 }).includes('unexpected_routines'));
  assert.ok(evaluateStructure(structureRow({ produtos: 7 }), { expectUsuarioTotal: 0 }).includes('catalog_mismatch'));
});

test('estrutura: includeLedger=false ignora o ledger e nao exige sua presenca na lista de tabelas', () => {
  const semLedger = structureRow({ tables: [...BUSINESS_TABLES] });
  assert.deepEqual(evaluateStructure(semLedger, { expectUsuarioTotal: 0, includeLedger: false }), []);
  assert.ok(evaluateStructure(semLedger, { expectUsuarioTotal: 0, includeLedger: true }).includes('tables_mismatch'));
  assert.equal(EXPECTED_TABLES.length, 15);
  assert.equal(BUSINESS_TABLES.length, 14);
});

test('privilegios do app: DML sobre tab_usuario_admin e USAGE no schema app sao obrigatorios', () => {
  assert.deepEqual(evaluateAppPrivileges(structureRow()), []);
  assert.ok(evaluateAppPrivileges(structureRow({ priv_update: false })).includes('app_privileges_missing'));
  assert.ok(evaluateAppPrivileges(structureRow({ priv_schema_usage: false })).includes('app_schema_usage_missing'));
});

test('seguranca (A/C): membership exata migrator->owner e ausencia de SET/ACL indevidos', () => {
  assert.deepEqual(evaluateSecurity(securityRow()), []);
  assert.ok(evaluateSecurity(securityRow({ migrator_owner_exact: false })).includes('migrator_owner_membership_mismatch'));
  assert.ok(evaluateSecurity(securityRow({ migrator_owner_rows: 2 })).includes('migrator_owner_membership_extra'));
  assert.ok(evaluateSecurity(securityRow({ migrator_can_set_owner: false })).includes('migrator_cannot_set_owner'));
  assert.ok(evaluateSecurity(securityRow({ app_cannot_set_owner: false })).includes('app_can_set_owner'));
  assert.ok(evaluateSecurity(securityRow({ app_no_membership: false })).includes('app_membership_forbidden'));
  assert.ok(evaluateSecurity(securityRow({ ledger_no_app_acl: false })).includes('ledger_app_acl_present'));
  assert.ok(evaluateSecurity(securityRow({ ledger_no_public_acl: false })).includes('ledger_public_acl_present'));
});

test('guards runtime do bootstrap (B): passam com identidade app, sem ledger e com tabela vazia', () => {
  const row = { ...identityRow(), ...structureRow({ tables: [...BUSINESS_TABLES] }) };
  assert.deepEqual(evaluateRuntimeGuards(row, { expectUsuarioTotal: 0 }), []);
});

test('guards runtime (B) recusam sessao ou corrente que nao seja o app_role', () => {
  const row = { ...identityRow({ sess_user: DEV_MIGRATOR_USER }), ...structureRow({ tables: [...BUSINESS_TABLES] }) };
  assert.ok(evaluateRuntimeGuards(row, { expectUsuarioTotal: 0 }).includes('session_user_mismatch'));
  const corrente = { ...identityRow({ curr_user: DEV_OWNER_ROLE }), ...structureRow({ tables: [...BUSINESS_TABLES] }) };
  assert.ok(evaluateRuntimeGuards(corrente, { expectUsuarioTotal: 0 }).includes('current_user_mismatch'));
});

test('guards runtime (B) recusam presenca de linha de usuario e falta de privilegio do app', () => {
  const base = { ...identityRow(), ...structureRow({ tables: [...BUSINESS_TABLES] }) };
  assert.ok(evaluateRuntimeGuards({ ...base, usuario_total: 1 }, { expectUsuarioTotal: 0 }).includes('usuario_total_mismatch'));
  assert.ok(evaluateRuntimeGuards({ ...base, priv_insert: false }, { expectUsuarioTotal: 0 }).includes('app_privileges_missing'));
});

test('lista vazia de admin antes do INSERT passa; qualquer linha existente falha', () => {
  assert.deepEqual(evaluateEmptyAdminRows([]), []);
  assert.deepEqual(evaluateEmptyAdminRows([goodAdminRow()]), ['usuario_admin_existente']);
});

test('pos-condicao aceita exatamente 1 registro SUPER_ADMIN + protegido + ativo com nome/e-mail esperados', () => {
  assert.deepEqual(evaluateAdminTable([goodAdminRow()], EXPECTED), []);
});

test('pos-condicao recusa zero registros, dois registros ou perfil/flag incorretos', () => {
  assert.ok(evaluateAdminTable([], EXPECTED).includes('total_must_be_1'));
  const dois = [goodAdminRow(), goodAdminRow({ id_usuario_admin: '22222222-2222-4222-8222-222222222222' })];
  assert.ok(evaluateAdminTable(dois, EXPECTED).includes('total_must_be_1'));
  assert.ok(evaluateAdminTable([goodAdminRow({ perfil_usuario: 'ADMIN' })], EXPECTED).includes('super_admin_count_must_be_1'));
  assert.ok(evaluateAdminTable([goodAdminRow({ protegido: false })], EXPECTED).includes('protegido_count_must_be_1'));
  assert.ok(evaluateAdminTable([goodAdminRow({ ativo: false })], EXPECTED).includes('ativo_count_must_be_1'));
});

test('pos-condicao recusa nome, e-mail, id ou formato de hash divergentes', () => {
  assert.ok(evaluateAdminTable([goodAdminRow({ nome_usuario: 'Outro' })], EXPECTED).includes('nome_mismatch'));
  assert.ok(evaluateAdminTable([goodAdminRow({ email_usuario: 'outro@x.test' })], EXPECTED).includes('email_mismatch'));
  assert.ok(evaluateAdminTable([goodAdminRow({ hash_format_ok: false })], EXPECTED).includes('hash_format_mismatch'));
  assert.ok(evaluateAdminTable([goodAdminRow()], { ...EXPECTED, expectedId: 'outro-id' }).includes('id_mismatch'));
});

test('e-mail comparado sem diferenca de caixa na pos-condicao', () => {
  assert.deepEqual(evaluateAdminTable([goodAdminRow({ email_usuario: 'Operador@Exemplo.TEST' })], EXPECTED), []);
});

test('throwIfFailures lanca erro com codigos e safeErrorCode devolve os codigos sem mensagem', () => {
  let caught;
  try {
    throwIfFailures(['usuario_total_mismatch', 'ledger_mismatch']);
  } catch (error) {
    caught = error;
  }
  assert.ok(caught);
  assert.equal(safeErrorCode(caught), 'usuario_total_mismatch,ledger_mismatch');
  assert.doesNotThrow(() => throwIfFailures([]));
});

test('mensagem de erro segura: codigo SQLSTATE ou motivo, nunca mensagem bruta', () => {
  assert.equal(safeErrorCode({ code: '55P03', message: `Key (email)=(${SECRET_ADMIN})` }), '55P03');
  assert.equal(safeErrorCode({ failures: ['usuario_total_mismatch', 'ledger_mismatch'] }), 'usuario_total_mismatch,ledger_mismatch');
  assert.equal(safeErrorCode(new Error(SECRET_DB)), 'erro_interno');
});

test('scripts e libs nao leem argv com segredo, nao montam connection string e nao logam senha/hash', () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const files = [
    path.join(dir, '..', 'dev-super-admin-bootstrap.mjs'),
    path.join(dir, '..', 'dev-super-admin-precheck.mjs'),
    path.join(dir, '..', 'dev-super-admin-audit.mjs'),
    path.join(dir, 'dev-super-admin-bootstrap.mjs'),
    path.join(dir, 'dev-super-admin-io.mjs'),
    path.join(dir, 'dev-super-admin-sql.mjs'),
  ];
  for (const file of files) {
    // Analisa somente codigo: comentarios de cabecalho podem citar os nomes proibidos.
    const source = readFileSync(file, 'utf8').replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(source, /connectionString|DATABASE_URL\s*[:=]|PGPASSWORD\s*[:=]|process\.env\.DATABASE_PASSWORD/, file);
    const argvUses = source.match(/process\.argv[^\n]*/g) || [];
    for (const use of argvUses) {
      assert.match(use, /process\.argv\.length/, `argv usado de forma nao permitida em ${file}: ${use}`);
    }
    const logs = source.match(/console\.(log|error)\([^\n]*/g) || [];
    for (const log of logs) {
      assert.doesNotMatch(log, /senha|password|hash|salt|dbPassword|\berror\b\.message/i, `log suspeito em ${file}: ${log}`);
    }
  }
});

test('modulos puros da lib nao importam o driver pg nem abrem conexao', () => {
  // A lib e o io devem ser testaveis offline: pg so e importado pelos CLIs.
  const dir = path.dirname(fileURLToPath(import.meta.url));
  for (const name of ['dev-super-admin-bootstrap.mjs', 'dev-super-admin-io.mjs', 'dev-super-admin-sql.mjs']) {
    const source = readFileSync(path.join(dir, name), 'utf8');
    assert.doesNotMatch(source, /import\s+pg\b|from\s+['"]pg['"]|new\s+pg\./, name);
  }
});
