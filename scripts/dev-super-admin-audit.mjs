// AUDITORIA READ-ONLY pos-bootstrap do primeiro SUPER_ADMIN (DEV LOCAL).
// Login: amanteigados_dev_migrator. Depois de READ ONLY, assume amanteigados_dev_owner via SET ROLE.
// Nao altera nada. Sem COMMIT. Termina sempre em RESET ROLE + ROLLBACK. Nao imprime senha, hash nem salt.
//
// Uso:  node scripts/dev-super-admin-audit.mjs

import pg from 'pg';
import {
  DEV_MIGRATOR_USER,
  DEV_OWNER_ROLE,
  buildDevClientConfig,
  evaluateAdminTable,
  evaluateAppPrivileges,
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
import { askHidden, askLine, requireTty } from './lib/dev-super-admin-io.mjs';

// Identificadores de etapa (fixos): AUDIT_CONEXAO, AUDIT_TRANSACAO, AUDIT_IDENTIDADE, AUDIT_SET_ROLE,
// AUDIT_LEDGER, AUDIT_ESTRUTURA, AUDIT_PRIVILEGIOS, AUDIT_USUARIOS, AUDIT_RESET_ROLE, AUDIT_ROLLBACK.

function fail(code) {
  console.error('FAIL');
  console.error(code);
  process.exitCode = 1;
}

function failStage(stage, error) {
  console.error('FAIL');
  console.error(stage);
  console.error(safeErrorCode(error));
  process.exitCode = 1;
}

async function rollbackSafely(client) {
  await client.query(RESET_ROLE_SQL).catch(() => {});
  await client.query('ROLLBACK').catch(() => {});
}

async function main() {
  console.log('AMANTEIGADOS LIVIA');
  console.log('AUDITORIA READ-ONLY — SUPER ADMIN — DEV LOCAL');

  if (process.argv.length > 2) return fail('argumentos_nao_aceitos');
  const forbidden = findForbiddenDbEnv(process.env);
  if (forbidden.length > 0) return fail(`variavel_de_banco_proibida:${forbidden.join(',')}`);
  try {
    requireTty();
  } catch {
    return fail('tty_required');
  }

  const expectedNome = (await askLine('Nome esperado do Super Admin: ')).trim();
  const expectedEmail = (await askLine('E-mail esperado do Super Admin: ')).trim().toLowerCase();
  let dbPassword = await askHidden('Senha PostgreSQL (amanteigados_dev_migrator): ');
  if (!dbPassword) return fail('senha_postgres_ausente');

  const client = new pg.Client(buildDevClientConfig({
    user: DEV_MIGRATOR_USER,
    password: dbPassword,
    applicationName: 'amanteigados-livia-audit-super-admin-dev',
  }));
  dbPassword = '';

  let inTransaction = false;
  let stage = 'AUDIT_CONEXAO';
  try {
    await client.connect();

    stage = 'AUDIT_TRANSACAO';
    await client.query('BEGIN');
    inTransaction = true;
    await client.query('SET TRANSACTION READ ONLY');
    await client.query("SET LOCAL statement_timeout = '15s'");

    stage = 'AUDIT_IDENTIDADE';
    const before = await client.query(IDENTITY_SQL);
    throwIfFailures(evaluateIdentity(before.rows[0], {
      sessionUser: DEV_MIGRATOR_USER,
      currentUser: DEV_MIGRATOR_USER,
      requireReadOnly: true,
    }));

    stage = 'AUDIT_SET_ROLE';
    await client.query(SET_OWNER_ROLE_SQL);
    const asOwner = await client.query(IDENTITY_SQL);
    throwIfFailures(evaluateIdentity(asOwner.rows[0], {
      sessionUser: DEV_MIGRATOR_USER,
      currentUser: DEV_OWNER_ROLE,
      requireReadOnly: true,
    }));

    stage = 'AUDIT_LEDGER';
    const ledger = await client.query(PRIVILEGED_LEDGER_GUARD_SQL);
    throwIfFailures(evaluateLedger(ledger.rows[0]));

    stage = 'AUDIT_ESTRUTURA';
    const structure = await client.query(PRIVILEGED_STRUCTURE_GUARD_SQL);
    throwIfFailures(evaluateStructure(structure.rows[0], { expectUsuarioTotal: 1, includeLedger: true }));

    stage = 'AUDIT_PRIVILEGIOS';
    const privileges = await client.query(PRIVILEGED_PRIVILEGES_SQL);
    throwIfFailures([...evaluateAppPrivileges(privileges.rows[0]), ...evaluateSecurity(privileges.rows[0])]);

    stage = 'AUDIT_USUARIOS';
    const admins = await client.query(ADMIN_ROWS_SQL);
    throwIfFailures(evaluateAdminTable(admins.rows, { expectedNome, expectedEmail }));

    stage = 'AUDIT_RESET_ROLE';
    await client.query(RESET_ROLE_SQL);
    const restored = await client.query(IDENTITY_SQL);
    throwIfFailures(evaluateIdentity(restored.rows[0], {
      sessionUser: DEV_MIGRATOR_USER,
      currentUser: DEV_MIGRATOR_USER,
      requireReadOnly: true,
    }));

    stage = 'AUDIT_ROLLBACK';
    await client.query('ROLLBACK');
    inTransaction = false;

    const only = admins.rows[0];
    console.log('PASS');
    console.log('session_user=amanteigados_dev_migrator current_user=amanteigados_dev_owner (owner_assumido=validado)');
    console.log('migrations=0001-0005 exatas');
    console.log('tab_usuario_admin_total=1');
    console.log(`id_usuario_admin=${only.id_usuario_admin}`);
    console.log(`email=${only.email_usuario}`);
    console.log('perfil=SUPER_ADMIN protegido=true ativo=true');
    console.log('credencial_formato=ok (valor nao exibido)');
    console.log('catalogo=4/8/8/9');
  } catch (error) {
    if (inTransaction) await rollbackSafely(client);
    failStage(stage, error);
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => fail(safeErrorCode(error)));
