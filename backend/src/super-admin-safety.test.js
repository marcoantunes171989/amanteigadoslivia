import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  ENVIRONMENTS,
  PROD_SUPER_ADMIN_CONFIRMATION,
  expectedAdminUser,
  isEnvironmentConfirmed,
  parseEnvironment,
  validateAdminConnection,
  validateEmail,
} from './super-admin-safety.js';

const HML_REF = 'ywlzswyepcawcgkllwlu';
const PROD_REF = 'suyablzfgupcslfasgzw';
const HOST = 'aws-0-sa-east-1.pooler.supabase.com';

function conn(overrides = {}) {
  return {
    environment: 'HOMOLOGACAO',
    host: HOST,
    port: '6543',
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

test('porta diferente de 6543 e host fora do pooler Supabase: recusados', () => {
  for (const port of ['5432', '6542', '', 'abc']) {
    assert.ok(validateAdminConnection(conn({ port })).includes('port_must_be_6543'), port);
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
  assert.doesNotMatch(script, /5432/);
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
