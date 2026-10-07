// PRECHECK READ-ONLY antes do bootstrap do primeiro SUPER_ADMIN (DEV LOCAL).
// Login: amanteigados_dev_migrator. Depois de READ ONLY, assume amanteigados_dev_owner via SET ROLE
// para inspecionar ledger e estrutura. Nao cria nada. Sem LOCK, sem escrita, sem COMMIT.
// Termina sempre em RESET ROLE + ROLLBACK.
//
// Uso:  node scripts/dev-super-admin-precheck.mjs

import pg from 'pg';
import {
  DEV_MIGRATOR_USER,
  DEV_OWNER_ROLE,
  buildDevClientConfig,
  evaluateAppPrivileges,
  evaluateEmptyAdminRows,
  evaluateIdentity,
  evaluateLedger,
  evaluateSecurity,
  evaluateStructure,
  findForbiddenDbEnv,
  safeErrorCode,
  throwIfFailures,
} from './lib/dev-super-admin-bootstrap.mjs';
import {
  ADMIN_ROWS_SQL,
  IDENTITY_SQL,
  PRIVILEGED_LEDGER_GUARD_SQL,
  PRIVILEGED_PRIVILEGES_SQL,
  PRIVILEGED_STRUCTURE_GUARD_SQL,
  RESET_ROLE_SQL,
  SET_OWNER_ROLE_SQL,
} from './lib/dev-super-admin-sql.mjs';
import { askHidden, requireTty } from './lib/dev-super-admin-io.mjs';

// Identificadores de etapa (fixos, nunca derivados de mensagem do PostgreSQL):
// PRECHECK_CONEXAO, PRECHECK_TRANSACAO, PRECHECK_IDENTIDADE, PRECHECK_SET_ROLE, PRECHECK_LEDGER,
// PRECHECK_ESTRUTURA, PRECHECK_PRIVILEGIOS, PRECHECK_USUARIOS, PRECHECK_RESET_ROLE, PRECHECK_ROLLBACK.

function fail(code) {
  console.error('FAIL');
  console.error(code);
  process.exitCode = 1;
}

// Falha dentro de uma etapa: so o identificador da etapa e o codigo seguro. Nunca message, detail, query, stack, config ou senha.
function failStage(stage, error) {
  console.error('FAIL');
  console.error(stage);
  console.error(safeErrorCode(error));
  process.exitCode = 1;
}

// Melhor esforco para encerrar a transacao sem mascarar o erro original.
async function rollbackSafely(client) {
  await client.query(RESET_ROLE_SQL).catch(() => {});
  await client.query('ROLLBACK').catch(() => {});
}

async function main() {
  console.log('AMANTEIGADOS LIVIA');
  console.log('PRECHECK READ-ONLY — BOOTSTRAP SUPER ADMIN — DEV LOCAL');

  if (process.argv.length > 2) return fail('argumentos_nao_aceitos');
  const forbidden = findForbiddenDbEnv(process.env);
  if (forbidden.length > 0) return fail(`variavel_de_banco_proibida:${forbidden.join(',')}`);
  try {
    requireTty();
  } catch {
    return fail('tty_required');
  }

  let dbPassword = await askHidden('Senha PostgreSQL (amanteigados_dev_migrator): ');
  if (!dbPassword) return fail('senha_postgres_ausente');

  const client = new pg.Client(buildDevClientConfig({
    user: DEV_MIGRATOR_USER,
    password: dbPassword,
    applicationName: 'amanteigados-livia-precheck-super-admin-dev',
  }));
  dbPassword = '';

  let inTransaction = false;
  let stage = 'PRECHECK_CONEXAO';
  try {
    await client.connect();

    stage = 'PRECHECK_TRANSACAO';
    await client.query('BEGIN');
    inTransaction = true;
    await client.query('SET TRANSACTION READ ONLY');
    await client.query("SET LOCAL statement_timeout = '15s'");

    // Antes de qualquer inspecao de negocio e antes do SET ROLE: sessao e corrente ainda sao o migrator.
    stage = 'PRECHECK_IDENTIDADE';
    const before = await client.query(IDENTITY_SQL);
    throwIfFailures(evaluateIdentity(before.rows[0], {
      sessionUser: DEV_MIGRATOR_USER,
      currentUser: DEV_MIGRATOR_USER,
      requireReadOnly: true,
    }));

    stage = 'PRECHECK_SET_ROLE';
    await client.query(SET_OWNER_ROLE_SQL);
    const asOwner = await client.query(IDENTITY_SQL);
    throwIfFailures(evaluateIdentity(asOwner.rows[0], {
      sessionUser: DEV_MIGRATOR_USER,
      currentUser: DEV_OWNER_ROLE,
      requireReadOnly: true,
    }));

    // Ledger e estrutura so sao lidos depois do SET ROLE owner.
    stage = 'PRECHECK_LEDGER';
    const ledger = await client.query(PRIVILEGED_LEDGER_GUARD_SQL);
    throwIfFailures(evaluateLedger(ledger.rows[0]));

    stage = 'PRECHECK_ESTRUTURA';
    const structure = await client.query(PRIVILEGED_STRUCTURE_GUARD_SQL);
    throwIfFailures(evaluateStructure(structure.rows[0], { expectUsuarioTotal: 0, includeLedger: true }));

    stage = 'PRECHECK_PRIVILEGIOS';
    const privileges = await client.query(PRIVILEGED_PRIVILEGES_SQL);
    throwIfFailures([...evaluateAppPrivileges(privileges.rows[0]), ...evaluateSecurity(privileges.rows[0])]);

    stage = 'PRECHECK_USUARIOS';
    const admins = await client.query(ADMIN_ROWS_SQL);
    throwIfFailures(evaluateEmptyAdminRows(admins.rows));

    stage = 'PRECHECK_RESET_ROLE';
    await client.query(RESET_ROLE_SQL);
    const restored = await client.query(IDENTITY_SQL);
    throwIfFailures(evaluateIdentity(restored.rows[0], {
      sessionUser: DEV_MIGRATOR_USER,
      currentUser: DEV_MIGRATOR_USER,
      requireReadOnly: true,
    }));

    stage = 'PRECHECK_ROLLBACK';
    await client.query('ROLLBACK');
    inTransaction = false;

    console.log('PASS');
    console.log('ambiente=DEV_LOCAL 127.0.0.1:5432/amanteigados_dev');
    console.log('session_user=amanteigados_dev_migrator current_user=amanteigados_dev_owner (owner_assumido=validado)');
    console.log('transaction_read_only=on');
    console.log('ledger=0001-0005 exato');
    console.log('tab_usuario_admin_total=0');
    console.log('catalogo=4/8/8/9');
  } catch (error) {
    if (inTransaction) await rollbackSafely(client);
    failStage(stage, error);
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => fail(safeErrorCode(error)));
