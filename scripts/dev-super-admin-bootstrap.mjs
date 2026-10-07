// Cria o PRIMEIRO SUPER_ADMIN protegido no DEV LOCAL (127.0.0.1:5432/amanteigados_dev, login amanteigados_dev_app).
//
// Uso (operador, terminal interativo):  node scripts/dev-super-admin-bootstrap.mjs
//
// Garantias:
//  - nenhum argumento aceito; DATABASE_URL/PGPASSWORD/DATABASE_PASSWORD/PG* preenchidos => aborta sem conexao;
//  - login direto app_role, SEM SET ROLE, SEM acesso ao ledger (app.schema_migrations nunca e consultado);
//  - senha do banco e senha do admin apenas por entrada oculta, mantidas em memoria e zeradas apos uso;
//  - destino fixo (lib DEV_BOOTSTRAP_TARGET), sem connectionString;
//  - BEGIN -> LOCK EXCLUSIVE -> guards runtime -> tabela vazia -> INSERT (SUPER_ADMIN, protegido, ativo)
//    -> pos-condicoes -> COMMIT; qualquer divergencia => ROLLBACK. Nunca corrige o banco automaticamente.
//  - erro exibido apenas como etapa + codigo (SQLSTATE ou motivo interno), nunca mensagem bruta, senha ou hash.

import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { hashPassword } from '../backend/src/password.js';
import {
  DEV_APP_USER,
  DEV_BOOTSTRAP_CONFIRMATION,
  buildBootstrapRow,
  buildBootstrapSummaryLines,
  buildDevClientConfig,
  evaluateAdminTable,
  evaluateEmptyAdminRows,
  evaluateRuntimeGuards,
  findForbiddenDbEnv,
  isBootstrapConfirmed,
  safeErrorCode,
  throwIfFailures,
  validateBootstrapInput,
} from './lib/dev-super-admin-bootstrap.mjs';
import {
  ADMIN_ROWS_SQL,
  BOOTSTRAP_INSERT_SQL,
  BOOTSTRAP_LOCK_SQL,
  RUNTIME_BOOTSTRAP_GUARD_SQL,
} from './lib/dev-super-admin-sql.mjs';
import { askHidden, askLine, requireTty } from './lib/dev-super-admin-io.mjs';

// Identificadores de etapa (fixos): BOOTSTRAP_CONEXAO, BOOTSTRAP_BEGIN, BOOTSTRAP_LOCK, BOOTSTRAP_GUARDAS,
// BOOTSTRAP_INSERT, BOOTSTRAP_POS, BOOTSTRAP_COMMIT, BOOTSTRAP_ROLLBACK.

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

async function main() {
  console.log('AMANTEIGADOS LIVIA');
  console.log('BOOTSTRAP PRIMEIRO SUPER ADMIN — DEV LOCAL ONLY');

  if (process.argv.length > 2) {
    return fail('argumentos_nao_aceitos');
  }
  const forbidden = findForbiddenDbEnv(process.env);
  if (forbidden.length > 0) {
    return fail(`variavel_de_banco_proibida:${forbidden.join(',')}`);
  }
  try {
    requireTty();
  } catch {
    return fail('tty_required');
  }

  const nome = await askLine('Nome do Super Admin: ');
  const email = await askLine('E-mail do Super Admin: ');
  const emailConfirmacao = await askLine('Confirme o e-mail: ');
  let senha = await askHidden('Senha do Super Admin: ');
  let senhaConfirmacao = await askHidden('Confirme a senha: ');

  const { errors, value } = validateBootstrapInput({ nome, email, emailConfirmacao, senha, senhaConfirmacao });
  senhaConfirmacao = '';
  if (errors.length > 0) {
    senha = '';
    return fail(`entrada_invalida:${errors.join(',')}`);
  }

  console.log('');
  for (const line of buildBootstrapSummaryLines(value)) console.log(line);
  console.log('');
  const typed = await askLine(`Digite exatamente "${DEV_BOOTSTRAP_CONFIRMATION}" para confirmar: `);
  if (!isBootstrapConfirmed(typed)) {
    senha = '';
    return fail('confirmacao_invalida');
  }

  let dbPassword = await askHidden(`Senha PostgreSQL (${DEV_APP_USER}): `);
  if (!dbPassword) {
    senha = '';
    return fail('senha_postgres_ausente');
  }

  const hashed = await hashPassword(senha);
  senha = '';
  const row = buildBootstrapRow({ id: randomUUID(), ...value, hashed });

  const client = new pg.Client(buildDevClientConfig({
    user: DEV_APP_USER,
    password: dbPassword,
    applicationName: 'amanteigados-livia-bootstrap-super-admin-dev',
  }));
  dbPassword = '';

  let inTransaction = false;
  let stage = 'BOOTSTRAP_CONEXAO';
  try {
    await client.connect();

    stage = 'BOOTSTRAP_BEGIN';
    await client.query('BEGIN');
    inTransaction = true;
    await client.query("SET LOCAL statement_timeout = '15s'");
    await client.query("SET LOCAL lock_timeout = '3s'");
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '30s'");

    // Lock ANTES de qualquer guarda e de decidir que a tabela esta vazia: impede dois bootstraps concorrentes.
    stage = 'BOOTSTRAP_LOCK';
    await client.query(BOOTSTRAP_LOCK_SQL);

    // Sob o lock: identidade runtime, estrutura observavel e privilegios do app. Nenhum acesso ao ledger.
    stage = 'BOOTSTRAP_GUARDAS';
    const guard = await client.query(RUNTIME_BOOTSTRAP_GUARD_SQL);
    throwIfFailures(evaluateRuntimeGuards(guard.rows[0], { expectUsuarioTotal: 0 }));
    const before = await client.query(ADMIN_ROWS_SQL);
    throwIfFailures(evaluateEmptyAdminRows(before.rows));

    stage = 'BOOTSTRAP_INSERT';
    const inserted = await client.query(BOOTSTRAP_INSERT_SQL, [
      row.id_usuario_admin,
      row.nome_usuario,
      row.email_usuario,
      row.senha_hash,
      row.senha_salt,
    ]);

    stage = 'BOOTSTRAP_POS';
    const after = await client.query(ADMIN_ROWS_SQL);
    throwIfFailures(evaluateAdminTable(after.rows, {
      expectedNome: row.nome_usuario,
      expectedEmail: row.email_usuario,
      expectedId: inserted.rows[0]?.id_usuario_admin,
    }));

    stage = 'BOOTSTRAP_COMMIT';
    await client.query('COMMIT');
    inTransaction = false;

    console.log('PASS');
    console.log('ambiente=DEV_LOCAL');
    console.log(`id_usuario_admin=${row.id_usuario_admin}`);
    console.log(`email=${row.email_usuario}`);
    console.log('perfil=SUPER_ADMIN');
    console.log('protegido=true');
    console.log('ativo=true');
  } catch (error) {
    let rollbackFailed = false;
    if (inTransaction) {
      await client.query('ROLLBACK').catch(() => {
        rollbackFailed = true;
      });
      inTransaction = false;
    }
    failStage(stage, error);
    if (rollbackFailed) console.error('BOOTSTRAP_ROLLBACK');
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((error) => fail(safeErrorCode(error)));
