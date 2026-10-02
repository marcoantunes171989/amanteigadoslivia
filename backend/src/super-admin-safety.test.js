import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  ENVIRONMENTS,
  PROD_SUPER_ADMIN_CONFIRMATION,
  SUPER_ADMIN_ADVISORY_LOCK_KEY,
  evaluateSuperAdminState,
  expectedAdminUser,
  isEnvironmentConfirmed,
  parseEnvironment,
  validateAdminConnection,
  validateCaPath,
  validateEmail,
} from './super-admin-safety.js';

const HML_REF = 'ywlzswyepcawcgkllwlu';
const PROD_REF = 'suyablzfgupcslfasgzw';
const HOST = 'aws-0-sa-east-1.pooler.supabase.com';

function conn(overrides = {}) {
  return {
    environment: 'HOMOLOGACAO',
    host: HOST,
    port: '5432',
    database: 'postgres',
    user: `postgres.${HML_REF}`,
    projectRef: HML_REF,
    ...overrides,
  };
}

test('refs conhecidos por ambiente', () => {
  assert.equal(ENVIRONMENTS.HOMOLOGACAO.projectRef, HML_REF);
  assert.equal(ENVIRONMENTS.PRODUCAO.projectRef, PROD_REF);
});

test('selecao de ambiente: somente HOMOLOGACAO ou PRODUCAO exatos', () => {
  assert.equal(parseEnvironment('HOMOLOGACAO'), 'HOMOLOGACAO');
  assert.equal(parseEnvironment(' PRODUCAO '), 'PRODUCAO');
  for (const bad of ['', 'homologacao', 'prod', 'PROD', 'HOMOLOG', undefined, 'toString', '__proto__']) {
    assert.equal(parseEnvironment(bad), null, String(bad));
  }
});

test('PRODUCAO exige a confirmacao exata; sem ela nao segue', () => {
  assert.equal(isEnvironmentConfirmed('PRODUCAO', PROD_SUPER_ADMIN_CONFIRMATION), true);
  for (const typed of ['', 'criar super admin producao', 'CRIAR SUPER ADMIN PRODUCAO ', 'PRODUCAO', 'HOMOLOG', undefined]) {
    assert.equal(isEnvironmentConfirmed('PRODUCAO', typed), false, String(typed));
  }
  assert.equal(PROD_SUPER_ADMIN_CONFIRMATION, 'CRIAR SUPER ADMIN PRODUCAO');
  assert.equal(isEnvironmentConfirmed('HOMOLOGACAO', ''), true);
  assert.equal(isEnvironmentConfirmed(null, PROD_SUPER_ADMIN_CONFIRMATION), false);
});

test('conexao administrativa valida: HML e PROD', () => {
  assert.deepEqual(validateAdminConnection(conn()), []);
  assert.deepEqual(validateAdminConnection(conn({
    environment: 'PRODUCAO',
    user: `postgres.${PROD_REF}`,
    projectRef: PROD_REF,
  })), []);
  assert.equal(expectedAdminUser(PROD_REF), `postgres.${PROD_REF}`);
});

test('project ref divergente do ambiente selecionado: PARA', () => {
  assert.ok(validateAdminConnection(conn({ projectRef: PROD_REF })).includes('project_ref_belongs_to_other_environment'));
  assert.ok(validateAdminConnection(conn({
    environment: 'PRODUCAO',
    user: `postgres.${PROD_REF}`,
    projectRef: HML_REF,
  })).includes('project_ref_belongs_to_other_environment'));
  assert.ok(validateAdminConnection(conn({ projectRef: 'outroprojeto' })).includes('project_ref_mismatch'));
});

test('porta diferente de 5432 e host fora do pooler Supabase: recusados', () => {
  for (const port of ['6543', '6542', '', 'abc']) {
    assert.ok(validateAdminConnection(conn({ port })).includes('port_must_be_5432'), port);
  }
  assert.ok(validateAdminConnection(conn({ host: 'db.ywlzswyepcawcgkllwlu.supabase.co' })).includes('host_must_be_supabase_pooler'));
  assert.ok(validateAdminConnection(conn({ host: 'localhost' })).includes('host_must_be_supabase_pooler'));
  assert.ok(validateAdminConnection(conn({ database: 'outro' })).includes('database_must_be_postgres'));
});

test('usuario administrativo precisa ser postgres.<ref>; *_app.<ref> e recusado', () => {
  for (const user of [
    `amanteigados_homolog_app.${HML_REF}`,
    `amanteigados_prod_app.${HML_REF}`,
    `amanteigados_prod_app.${PROD_REF}`,
    `postgres.${PROD_REF}`, // ref de outro ambiente
    'postgres',
    '',
  ]) {
    assert.ok(validateAdminConnection(conn({ user })).includes('user_must_be_postgres_project_ref'), user);
  }
  assert.ok(validateAdminConnection(conn({
    environment: 'PRODUCAO',
    user: `amanteigados_prod_app.${PROD_REF}`,
    projectRef: PROD_REF,
  })).includes('user_must_be_postgres_project_ref'));
  assert.deepEqual(validateAdminConnection({ environment: 'XYZ' }), ['environment_invalid']);
});

test('validateEmail', () => {
  assert.equal(validateEmail('nome@dominio.com'), true);
  for (const bad of ['', 'a@b', 'a b@c.com', 'a@@b.com', undefined]) {
    assert.equal(validateEmail(bad), false, String(bad));
  }
});

test('validateCaPath: exige caminho nao vazio (existencia/tipo e checada no script, fora deste modulo puro)', () => {
  assert.deepEqual(validateCaPath('/caminho/qualquer/ca.crt'), []);
  for (const bad of ['', '   ', undefined, null, 0, 42]) {
    assert.ok(validateCaPath(bad).includes('ca_path_required'), String(bad));
  }
});

test('SUPER_ADMIN_ADVISORY_LOCK_KEY: constante numerica fixa e segura para bigint', () => {
  assert.equal(typeof SUPER_ADMIN_ADVISORY_LOCK_KEY, 'number');
  assert.ok(Number.isSafeInteger(SUPER_ADMIN_ADVISORY_LOCK_KEY));
  assert.ok(SUPER_ADMIN_ADVISORY_LOCK_KEY > 0);
});

test('evaluateSuperAdminState: zero existentes -> create', () => {
  assert.deepEqual(evaluateSuperAdminState([], 'novo@dominio.com'), { action: 'create' });
  assert.deepEqual(evaluateSuperAdminState(undefined, 'novo@dominio.com'), { action: 'create' });
});

test('evaluateSuperAdminState: um existente com mesmo email (case-insensitive) -> update', () => {
  const rows = [{ id_usuario_admin: 'id-1', email_usuario: 'Admin@Dominio.com' }];
  assert.deepEqual(evaluateSuperAdminState(rows, 'admin@dominio.com'), { action: 'update', id: 'id-1' });
  assert.deepEqual(evaluateSuperAdminState(rows, '  ADMIN@DOMINIO.COM  '), { action: 'update', id: 'id-1' });
});

test('evaluateSuperAdminState: mesmo email -> update, independente de ativo/protegido (qualquer combinacao)', () => {
  // ativo=false e/ou protegido=false NUNCA podem equivaler a "ausencia de SUPER_ADMIN":
  // a mesma linha deve ser reconciliada (update), nunca recriada.
  const combos = [
    { ativo: true, protegido: true },
    { ativo: false, protegido: true },
    { ativo: true, protegido: false },
    { ativo: false, protegido: false },
  ];
  for (const flags of combos) {
    const rows = [{ id_usuario_admin: 'id-1', email_usuario: 'admin@dominio.com', ...flags }];
    assert.deepEqual(
      evaluateSuperAdminState(rows, 'admin@dominio.com'),
      { action: 'update', id: 'id-1' },
      JSON.stringify(flags),
    );
  }
});

test('evaluateSuperAdminState: um existente com email diferente -> block', () => {
  const rows = [{ id_usuario_admin: 'id-1', email_usuario: 'outro@dominio.com' }];
  assert.deepEqual(
    evaluateSuperAdminState(rows, 'admin@dominio.com'),
    { action: 'block', reason: 'different_email_super_admin_exists' },
  );
});

test('evaluateSuperAdminState: email diferente -> block, independente de ativo/protegido (qualquer combinacao)', () => {
  // Uma linha SUPER_ADMIN de outro email bloqueia sempre, mesmo inativa/desprotegida;
  // nunca e modificada automaticamente por este fluxo.
  const combos = [
    { ativo: true, protegido: true },
    { ativo: false, protegido: true },
    { ativo: true, protegido: false },
    { ativo: false, protegido: false },
  ];
  for (const flags of combos) {
    const rows = [{ id_usuario_admin: 'id-1', email_usuario: 'outro@dominio.com', ...flags }];
    assert.deepEqual(
      evaluateSuperAdminState(rows, 'admin@dominio.com'),
      { action: 'block', reason: 'different_email_super_admin_exists' },
      JSON.stringify(flags),
    );
  }
});

test('evaluateSuperAdminState: mais de um existente -> block, independente do email', () => {
  const rows = [
    { id_usuario_admin: 'id-1', email_usuario: 'admin@dominio.com' },
    { id_usuario_admin: 'id-2', email_usuario: 'admin@dominio.com' },
  ];
  assert.deepEqual(
    evaluateSuperAdminState(rows, 'admin@dominio.com'),
    { action: 'block', reason: 'multiple_super_admin_exists' },
  );
});

test('evaluateSuperAdminState: mais de um existente -> block, mesmo com ativo=false/protegido=false', () => {
  // >1 linha SUPER_ADMIN bloqueia sempre; nenhuma combinacao de ativo/protegido reduz o
  // conjunto para "menos de duas" nem escolhe uma linha arbitrariamente.
  const rows = [
    { id_usuario_admin: 'id-1', email_usuario: 'admin@dominio.com', ativo: false, protegido: false },
    { id_usuario_admin: 'id-2', email_usuario: 'outro@dominio.com', ativo: true, protegido: true },
  ];
  assert.deepEqual(
    evaluateSuperAdminState(rows, 'admin@dominio.com'),
    { action: 'block', reason: 'multiple_super_admin_exists' },
  );
});

const script = readFileSync(new URL('../../scripts/criar-super-admin-seguro.mjs', import.meta.url), 'utf8');

test('source guard: sem host/porta/usuario/senha/ref hardcoded e sem canais de senha proibidos', () => {
  assert.doesNotMatch(script, /pooler\.supabase\.com['"`]/); // nenhum host literal
  assert.doesNotMatch(script, /ywlzswyepcawcgkllwlu|suyablzfgupcslfasgzw/); // refs ficam so em super-admin-safety.js
  assert.doesNotMatch(script, /_app\./);
  assert.doesNotMatch(script, /process\.env/);
  assert.doesNotMatch(script, /PGPASSWORD/);
  assert.doesNotMatch(script, /process\.argv/);
  assert.doesNotMatch(script, /dotenv|writeFile|appendFile|createWriteStream|tmpdir/);
  assert.doesNotMatch(script, /password:\s*['"`]/);
  assert.doesNotMatch(script, /6543/); // porta exigida agora e 5432; 6543 nao pode aparecer nem como fallback
});

test('source guard: TLS exige CA e rejectUnauthorized:true, sem downgrade inseguro', () => {
  assert.doesNotMatch(script, /rejectUnauthorized:\s*false/);
  assert.match(script, /rejectUnauthorized:\s*true/);
  assert.match(script, /ssl:\s*\{\s*ca:\s*caContent,\s*rejectUnauthorized:\s*true\s*\}/);
  assert.match(script, /validateCaPath\(/);
  assert.match(script, /existsSync\(caPath\)/);
  assert.match(script, /statSync\(caPath\)\.isFile\(\)/);
  assert.match(script, /Porta \(5432\)/);
});

test('source guard: advisory lock de transacao e checagem global de SUPER_ADMIN antes de INSERT/UPDATE', () => {
  const iLock = script.indexOf('pg_advisory_xact_lock');
  const iEvaluate = script.indexOf('evaluateSuperAdminState(');
  const iWrite = script.indexOf('INSERT INTO app.tab_usuario_admin');
  const iUpdateSql = script.indexOf('UPDATE app.tab_usuario_admin');
  assert.ok(iLock > 0 && iEvaluate > iLock && iWrite > iEvaluate && iUpdateSql > iEvaluate);
  assert.match(script, /SUPER_ADMIN_ADVISORY_LOCK_KEY/);
  assert.match(script, /WHERE perfil_usuario = 'SUPER_ADMIN'/);
});

test('source guard: query de existencia de SUPER_ADMIN e global e NAO filtra por ativo/protegido', () => {
  const marker = "SELECT id_usuario_admin, email_usuario FROM app.tab_usuario_admin WHERE perfil_usuario = 'SUPER_ADMIN'";
  const iQuery = script.indexOf(marker);
  assert.ok(iQuery > 0, 'query de existencia deve buscar globalmente por perfil_usuario=SUPER_ADMIN');

  // A query de existencia e uma string de uma linha; isolar somente essa linha evita
  // falso-negativo por causa do UPDATE mais abaixo, que legitimamente contem
  // "ativo = true, protegido = true" como efeito do UPDATE, nao como filtro WHERE.
  const queryEnd = script.indexOf('\n', iQuery);
  const existenceQuery = script.slice(iQuery, queryEnd);
  assert.doesNotMatch(existenceQuery, /ativo/i);
  assert.doesNotMatch(existenceQuery, /protegido/i);
});

test('source guard: senhas por input oculto e sem log de senha/hash', () => {
  assert.match(script, /askHidden\('Senha do Super Admin: '\)/);
  assert.match(script, /askHidden\('Confirmar senha do Super Admin: '\)/);
  assert.match(script, /askHidden\(`Senha PostgreSQL/);
  assert.match(script, /setRawMode\(true\)/);
  assert.doesNotMatch(script, /console\.(log|error)\([^)]*(senha|pgPassword|senha_hash|hashed)/i);
});

test('source guard: validacoes locais ANTES da conexao e transacao com ROLLBACK', () => {
  const iValidate = script.indexOf('validateAdminConnection(');
  const iConfirm = script.indexOf('isEnvironmentConfirmed(');
  const iParse = script.indexOf('parseEnvironment(');
  const iConnect = script.indexOf('client.connect()');
  assert.ok(iParse > 0 && iConfirm > iParse && iValidate > iConfirm && iConnect > iValidate);

  const iBegin = script.indexOf("'BEGIN'");
  const iWrite = script.indexOf('INSERT INTO app.tab_usuario_admin');
  const iUpdate = script.indexOf('UPDATE app.tab_usuario_admin');
  const iPostcheck = script.indexOf('postcheck_failed');
  const iCommit = script.indexOf("'COMMIT'");
  assert.ok(iBegin > iConnect && iWrite > iBegin && iUpdate > iBegin && iPostcheck > iWrite && iCommit > iPostcheck);
  assert.match(script, /'ROLLBACK'/);
  assert.match(script, /new pg\.Client\(/);
});

test('script legado HML marcado como LEGACY/HML e aponta para o seguro', () => {
  const legacy = readFileSync(new URL('../../scripts/criar-super-admin.mjs', import.meta.url), 'utf8');
  assert.match(legacy, /LEGACY\/HML ONLY/);
  assert.match(legacy, /criar-super-admin-seguro\.mjs/);
});
