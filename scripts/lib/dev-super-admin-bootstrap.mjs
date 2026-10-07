// Bootstrap EXCLUSIVO do primeiro SUPER_ADMIN protegido no DEV LOCAL.
// Modulo puro: sem I/O, sem conexao, sem leitura de senha. Tudo testavel offline.
// SQL fica em dev-super-admin-sql.mjs.
//
// Identidades (modelo aprovado):
//  - A (precheck) e C (auditoria): login amanteigados_dev_migrator -> SET ROLE amanteigados_dev_owner, READ ONLY.
//  - B (bootstrap): login amanteigados_dev_app, sem SET ROLE, sem acesso ao ledger.
// A criacao normal (scripts/criar-usuario-admin.mjs) NAO serve para isto: exige root ja existente
// e grava sempre perfil ADMIN com protegido=false.

import { passwordPolicyError } from '../../backend/src/password.js';

export const DEV_BOOTSTRAP_TARGET = Object.freeze({
  host: '127.0.0.1',
  port: 5432,
  database: 'amanteigados_dev',
  user: 'amanteigados_dev_app',
  ssl: false,
});

export const DEV_APP_USER = DEV_BOOTSTRAP_TARGET.user;
export const DEV_MIGRATOR_USER = 'amanteigados_dev_migrator';
export const DEV_OWNER_ROLE = 'amanteigados_dev_owner';

export const DEV_BOOTSTRAP_CONFIRMATION = 'CRIAR SUPER ADMIN DEV LOCAL';

// Variaveis que o driver pg ou o ambiente poderiam usar como fonte alternativa de conexao/senha.
// Qualquer uma preenchida aborta antes de qualquer conexao. So o NOME e reportado, nunca o valor.
export const FORBIDDEN_DB_ENV = Object.freeze([
  'DATABASE_URL',
  'DATABASE_PASSWORD',
  'PGPASSWORD',
  'PGHOST',
  'PGPORT',
  'PGDATABASE',
  'PGUSER',
  'PGSSLMODE',
  'PGSERVICE',
  'PGSERVICEFILE',
  'PGPASSFILE',
]);

export const LEDGER_TABLE = 'schema_migrations';

export const LEDGER_EXPECTED = Object.freeze([
  ['0001_create_migration_ledger', 'bb018fc0c74c17d8ee072fb0c0711d60ead28ce587c47e2bc1bc7dd0664991c0'],
  ['0002_criar_nucleo_catalogo', '35eaf497f9dbb0bd6844120f150930df404b8526ff1907e5d4c1810a1aebb6b4'],
  ['0003_expandir_painel_administrativo', '3b1db35ab9644b351668e4adc16a1ef167b4c70088f07add46d653ca76c4960a'],
  ['0004_criar_conteudo_site', '613b06c82989e4b793a824b4ad6efb113e89375c1682c0849b5b0799c5bc4bd7'],
  ['0005_criar_super_admin_protegido', '1a8af93049947606f0c60a2b8bdb92aebc813f2a78a0b1ba47ea48352429fdec'],
].map(([id, sha]) => `${id}=${sha}`));

export const EXPECTED_TABLES = Object.freeze([
  'schema_migrations',
  'tab_alteracao_agendada',
  'tab_auditoria_admin',
  'tab_categoria',
  'tab_configuracao_site',
  'tab_conteudo_imagem',
  'tab_conteudo_site',
  'tab_produto',
  'tab_produto_imagem',
  'tab_produto_preco',
  'tab_publicacao',
  'tab_solicitacao_encomenda',
  'tab_usuario_admin',
  'tab_venda',
  'tab_venda_item',
]);

// Tabelas de negocio, visiveis ao runtime. O ledger fica fora deste conjunto no bootstrap (B).
export const BUSINESS_TABLES = Object.freeze(EXPECTED_TABLES.filter((name) => name !== LEDGER_TABLE));

export const EXPECTED_USUARIO_COLUMNS = Object.freeze([
  'id_usuario_admin',
  'nome_usuario',
  'email_usuario',
  'senha_hash',
  'senha_salt',
  'perfil_usuario',
  'ativo',
  'data_criacao',
  'data_atualizacao',
  'data_ultimo_login',
  'protegido',
]);

export const EXPECTED_CATALOG = Object.freeze({ categorias: 4, produtos: 8, imagens: 8, precos: 9 });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sameArray(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

// Retorna somente NOMES de variaveis presentes e nao vazias. Nunca retorna valores.
export function findForbiddenDbEnv(env = process.env) {
  return FORBIDDEN_DB_ENV.filter((name) => typeof env[name] === 'string' && env[name].trim() !== '');
}

// Config do Client: sem connectionString, sem fallback, host/porta/banco fixos.
// O usuario e explicito (migrator para A/C, app para B). A senha entra apenas como valor do objeto.
export function buildDevClientConfig({ user, password, applicationName }) {
  return {
    host: DEV_BOOTSTRAP_TARGET.host,
    port: DEV_BOOTSTRAP_TARGET.port,
    database: DEV_BOOTSTRAP_TARGET.database,
    user,
    password,
    ssl: false,
    application_name: applicationName,
  };
}

export function validateBootstrapInput({ nome, email, emailConfirmacao, senha, senhaConfirmacao } = {}) {
  const errors = [];
  const cleanNome = String(nome ?? '').trim();
  const cleanEmail = String(email ?? '').trim().toLowerCase();

  if (!cleanNome) errors.push('nome_obrigatorio');
  if (!EMAIL_RE.test(cleanEmail)) errors.push('email_invalido');
  if (String(emailConfirmacao ?? '').trim().toLowerCase() !== cleanEmail) errors.push('email_confirmacao_divergente');
  if (passwordPolicyError(senha)) errors.push('senha_fora_da_politica');
  if (senha !== senhaConfirmacao) errors.push('senha_confirmacao_divergente');

  // value nao carrega senha: ela e tratada fora deste retorno.
  return { errors, value: { nome: cleanNome, email: cleanEmail } };
}

export function isBootstrapConfirmed(typed) {
  return String(typed ?? '').trim() === DEV_BOOTSTRAP_CONFIRMATION;
}

export function buildBootstrapRow({ id, nome, email, hashed }) {
  return {
    id_usuario_admin: id,
    nome_usuario: nome,
    email_usuario: email,
    senha_hash: hashed.senha_hash,
    senha_salt: hashed.senha_salt,
    perfil_usuario: 'SUPER_ADMIN',
    ativo: true,
    protegido: true,
  };
}

// Linhas que o operador confirma antes do INSERT. Sem senha, sem hash.
export function buildBootstrapSummaryLines({ nome, email }) {
  return [
    `Destino: DEV LOCAL ${DEV_BOOTSTRAP_TARGET.host}:${DEV_BOOTSTRAP_TARGET.port}/${DEV_BOOTSTRAP_TARGET.database} (usuario ${DEV_APP_USER})`,
    'Perfil: SUPER_ADMIN',
    'Protegido: SIM',
    'Ativo: SIM',
    `Nome: ${nome}`,
    `E-mail: ${email}`,
  ];
}

// Lanca um erro carregando somente os codigos de falha (sem mensagem livre). safeErrorCode le `failures`.
export function throwIfFailures(failures) {
  if (failures.length > 0) {
    throw Object.assign(new Error('guard'), { failures });
  }
}

// Identidade de sessao e corrente, destino e (opcionalmente) transacao READ ONLY.
// sessionUser/currentUser sao os valores esperados naquele ponto do fluxo.
export function evaluateIdentity(row, { sessionUser, currentUser, requireReadOnly = false } = {}) {
  const r = row ?? {};
  const failures = [];
  const check = (ok, code) => {
    if (ok !== true) failures.push(code);
  };

  check(r.db_ok, 'database_mismatch');
  check(r.addr_ok, 'address_mismatch');
  check(r.sess_user === sessionUser, 'session_user_mismatch');
  check(r.curr_user === currentUser, 'current_user_mismatch');
  if (requireReadOnly) check(r.read_only, 'transaction_not_read_only');
  return failures;
}

// Ledger exatamente 0001-0005 com checksums oficiais. Consulta feita SOMENTE sob owner (A e C).
export function evaluateLedger(row) {
  const failures = [];
  if (!sameArray(row?.ledger, LEDGER_EXPECTED)) failures.push('ledger_mismatch');
  return failures;
}

// Estrutura observavel. includeLedger=false (bootstrap) nao exige nem inspeciona o ledger.
export function evaluateStructure(row, { expectUsuarioTotal, includeLedger = true } = {}) {
  const r = row ?? {};
  const failures = [];
  const check = (ok, code) => {
    if (ok !== true) failures.push(code);
  };

  const expectedTables = includeLedger ? EXPECTED_TABLES : BUSINESS_TABLES;
  const actualTables = Array.isArray(r.tables) && !includeLedger
    ? r.tables.filter((name) => name !== LEDGER_TABLE)
    : r.tables;
  check(sameArray(actualTables, expectedTables), 'tables_mismatch');
  check(sameArray(r.columns, EXPECTED_USUARIO_COLUMNS), 'columns_mismatch');
  check(r.protegido_def_ok, 'protegido_definition_mismatch');
  check(r.checks_count === 2, 'constraints_mismatch');
  check(r.trigger_count === 1, 'trigger_mismatch');
  check(r.function_count === 1, 'function_mismatch');
  check(r.routine_count === 1, 'unexpected_routines');
  check(r.sequence_count === 0, 'unexpected_sequences');
  check(r.usuario_total === expectUsuarioTotal, 'usuario_total_mismatch');
  check(
    r.categorias === EXPECTED_CATALOG.categorias
      && r.produtos === EXPECTED_CATALOG.produtos
      && r.imagens === EXPECTED_CATALOG.imagens
      && r.precos === EXPECTED_CATALOG.precos,
    'catalog_mismatch',
  );
  return failures;
}

// Privilegios DML do app_role sobre tab_usuario_admin e USAGE no schema app (necessarios para B).
export function evaluateAppPrivileges(row) {
  const r = row ?? {};
  const failures = [];
  if (!(r.priv_select && r.priv_insert && r.priv_update && r.priv_delete)) failures.push('app_privileges_missing');
  if (r.priv_schema_usage !== true) failures.push('app_schema_usage_missing');
  return failures;
}

// Seguranca relevante (somente A e C): membership exata, ausencia de SET ROLE indevido e ACL do ledger.
export function evaluateSecurity(row) {
  const r = row ?? {};
  const failures = [];
  const check = (ok, code) => {
    if (ok !== true) failures.push(code);
  };

  check(r.migrator_owner_exact, 'migrator_owner_membership_mismatch');
  check(r.migrator_owner_rows === 1, 'migrator_owner_membership_extra');
  check(r.migrator_can_set_owner, 'migrator_cannot_set_owner');
  check(r.app_no_membership, 'app_membership_forbidden');
  check(r.app_cannot_set_owner, 'app_can_set_owner');
  check(r.app_cannot_set_migrator, 'app_can_set_migrator');
  check(r.ledger_no_app_acl, 'ledger_app_acl_present');
  check(r.ledger_no_migrator_acl, 'ledger_migrator_acl_present');
  check(r.ledger_no_public_acl, 'ledger_public_acl_present');
  check(r.app_no_schema_create, 'app_schema_create_present');
  return failures;
}

// Guards do bootstrap B, sob o mesmo lock: identidade runtime (app/app), estrutura observavel
// sem ledger e privilegios do app. Nao contem nenhuma informacao de ledger.
export function evaluateRuntimeGuards(row, { expectUsuarioTotal }) {
  return [
    ...evaluateIdentity(row, { sessionUser: DEV_APP_USER, currentUser: DEV_APP_USER }),
    ...evaluateStructure(row, { expectUsuarioTotal, includeLedger: false }),
    ...evaluateAppPrivileges(row),
  ];
}

// Antes do INSERT: a tabela precisa estar exatamente vazia.
export function evaluateEmptyAdminRows(rows) {
  return Array.isArray(rows) && rows.length === 0 ? [] : ['usuario_admin_existente'];
}

// Estado final de tab_usuario_admin: exatamente 1 registro, SUPER_ADMIN + protegido + ativo,
// nome/email conforme entrada, hash/salt com formato esperado (sem comparar valor).
export function evaluateAdminTable(rows, { expectedNome, expectedEmail, expectedId } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const failures = [];
  const check = (ok, code) => {
    if (!ok) failures.push(code);
  };

  check(list.length === 1, 'total_must_be_1');
  check(list.filter((r) => r.perfil_usuario === 'SUPER_ADMIN').length === 1, 'super_admin_count_must_be_1');
  check(list.filter((r) => r.protegido === true).length === 1, 'protegido_count_must_be_1');
  check(list.filter((r) => r.ativo === true).length === 1, 'ativo_count_must_be_1');

  const [only] = list;
  if (only) {
    check(only.perfil_usuario === 'SUPER_ADMIN' && only.protegido === true && only.ativo === true, 'single_row_triple_mismatch');
    check(String(only.nome_usuario ?? '').trim() === String(expectedNome ?? '').trim(), 'nome_mismatch');
    check(String(only.email_usuario ?? '').trim().toLowerCase() === String(expectedEmail ?? '').trim().toLowerCase(), 'email_mismatch');
    check(only.hash_format_ok === true, 'hash_format_mismatch');
    if (expectedId !== undefined) {
      check(String(only.id_usuario_admin) === String(expectedId), 'id_mismatch');
    }
  }
  return failures;
}

// Codigo seguro para log: SQLSTATE do pg ou codigo interno. Nunca message (pode trazer e-mail/valores).
export function safeErrorCode(error) {
  if (typeof error?.code === 'string' && error.code) return error.code;
  if (Array.isArray(error?.failures) && error.failures.length) return error.failures.join(',');
  return 'erro_interno';
}
