// Cria/promove o SUPER_ADMIN protegido em HOMOLOGACAO ou PRODUCAO, de forma explicita e segura.
//
// Uso (operador, interativo, local):  node scripts/criar-super-admin-seguro.mjs
//
// Garantias:
//  - selecao explicita HOMOLOGACAO | PRODUCAO; PRODUCAO exige digitar "CRIAR SUPER ADMIN PRODUCAO";
//  - project ref validado contra o ambiente escolhido (mismatch => PARA, sem conexao);
//  - conexao administrativa via pooler Supabase, porta 6543, usuario postgres.<project_ref>;
//    roles de runtime (app) sao recusadas;
//  - nada hardcoded de host/porta/usuario/senha; nada de arquivo de env, variavel de ambiente, argumento CLI ou arquivo temporario;
//  - senhas (Super Admin, confirmacao, PostgreSQL) lidas com input oculto;
//  - BEGIN -> INSERT/UPDATE -> postcheck -> COMMIT; qualquer erro => ROLLBACK.
//
// NAO e executado por testes nem pelo build (apenas `node --check`).

import { randomUUID } from 'node:crypto';
import readline from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import pg from 'pg';
import { hashPassword, passwordPolicyError } from '../backend/src/password.js';
import {
  ENVIRONMENTS,
  PROD_SUPER_ADMIN_CONFIRMATION,
  isEnvironmentConfirmed,
  parseEnvironment,
  validateAdminConnection,
  validateEmail,
} from '../backend/src/super-admin-safety.js';

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function askHidden(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
      // Sem TTY nao ha como ocultar a digitacao: recusa em vez de ecoar senha.
      console.error('FAIL');
      console.error('Terminal interativo (TTY) necessario para entrada oculta de senha.');
      process.exit(1);
    }
    output.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (char) => {
      if (char === '\u0003') process.exit(1);
      if (char === '\n' || char === '\r') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        output.write('\n');
        resolve(value);
        return;
      }
      if (char === '\u0008' || char === '\u007f') {
        if (value.length) {
          value = value.slice(0, -1);
          output.write('\b \b');
        }
        return;
      }
      value += char;
      output.write('*');
    };
    stdin.on('data', onData);
  });
}

function fail(message) {
  console.error('FAIL');
  console.error(message);
  process.exitCode = 1;
}

async function main() {
  console.log('AMANTEIGADOS LIVIA - SUPER ADMIN (SEGURO)');
  console.log('Selecione o ambiente. Nenhuma conexao e aberta antes de todas as validacoes locais.');
  console.log('');

  const rl = readline.createInterface({ input, output });

  const environment = parseEnvironment(await ask(rl, 'Ambiente (HOMOLOGACAO ou PRODUCAO): '));
  if (!environment) {
    rl.close();
    fail('Ambiente invalido. Nenhuma conexao foi aberta e nada foi alterado.');
    return;
  }

  let typedConfirmation = '';
  if (environment === 'PRODUCAO') {
    console.log('ATENCAO: ambiente PRODUCAO.');
    typedConfirmation = await ask(rl, `Digite exatamente "${PROD_SUPER_ADMIN_CONFIRMATION}": `);
  }
  if (!isEnvironmentConfirmed(environment, typedConfirmation)) {
    rl.close();
    fail('Confirmacao invalida. Nenhuma conexao foi aberta e nada foi alterado.');
    return;
  }

  const projectRef = (await ask(rl, 'Project ref: ')).trim();
  const host = (await ask(rl, 'Host (pooler Supabase): ')).trim();
  const port = (await ask(rl, 'Porta (6543): ')).trim();
  const database = (await ask(rl, 'Database: ')).trim();
  const user = (await ask(rl, 'Usuario administrativo (postgres.<project_ref>): ')).trim();

  const connectionErrors = validateAdminConnection({ environment, host, port, database, user, projectRef });
  if (connectionErrors.length > 0) {
    rl.close();
    fail(`Conexao recusada (${connectionErrors.join(', ')}). Nenhuma conexao foi aberta e nada foi alterado.`);
    return;
  }

  let nome = '';
  let email = '';
  while (!nome || !validateEmail(email)) {
    if (nome || email) {
      console.error('Nome ou e-mail invalido. Use um e-mail com um unico @, por exemplo nome@dominio.com');
    }
    nome = (await ask(rl, 'Nome do Super Admin: ')).trim();
    email = (await ask(rl, 'E-mail do Super Admin: ')).trim().toLowerCase();
  }
  rl.close();

  let senha = '';
  let senha2 = '';
  for (;;) {
    senha = await askHidden('Senha do Super Admin: ');
    senha2 = await askHidden('Confirmar senha do Super Admin: ');
    const policyError = passwordPolicyError(senha);
    if (policyError) {
      console.error(policyError);
    } else if (senha !== senha2) {
      console.error('Confirmacao divergente.');
    } else {
      break;
    }
  }

  const pgPassword = await askHidden(`Senha PostgreSQL (${ENVIRONMENTS[environment].label}): `);
  if (!pgPassword) {
    fail('Senha PostgreSQL ausente. Nenhuma conexao foi aberta e nada foi alterado.');
    return;
  }

  const hashed = await hashPassword(senha);
  const client = new pg.Client({
    host,
    port: Number(port),
    database,
    user,
    password: pgPassword,
    ssl: { rejectUnauthorized: false },
    application_name: 'amanteigados-livia-criar-super-admin',
  });

  let connected = false;
  let inTransaction = false;
  try {
    await client.connect();
    connected = true;

    await client.query('BEGIN');
    inTransaction = true;

    const identity = await client.query('SELECT current_database() AS db');
    if (identity.rows[0]?.db !== database) {
      throw new Error('database_mismatch');
    }

    const existing = await client.query(
      'SELECT id_usuario_admin FROM app.tab_usuario_admin WHERE lower(email_usuario) = lower($1)',
      [email],
    );

    let id;
    let acao;
    if (existing.rows[0]) {
      id = existing.rows[0].id_usuario_admin;
      acao = 'promovido';
      await client.query(
        `UPDATE app.tab_usuario_admin
            SET nome_usuario = $2,
                senha_hash = $3,
                senha_salt = $4,
                perfil_usuario = 'SUPER_ADMIN',
                ativo = true,
                protegido = true,
                data_atualizacao = now()
          WHERE id_usuario_admin = $1`,
        [id, nome, hashed.senha_hash, hashed.senha_salt],
      );
    } else {
      id = randomUUID();
      acao = 'criado';
      await client.query(
        `INSERT INTO app.tab_usuario_admin (
           id_usuario_admin, nome_usuario, email_usuario, senha_hash, senha_salt,
           perfil_usuario, ativo, protegido
         ) VALUES ($1,$2,$3,$4,$5,'SUPER_ADMIN', true, true)`,
        [id, nome, email, hashed.senha_hash, hashed.senha_salt],
      );
    }

    const check = await client.query(
      `SELECT id_usuario_admin, email_usuario, perfil_usuario, ativo, protegido
         FROM app.tab_usuario_admin
        WHERE id_usuario_admin = $1`,
      [id],
    );
    const row = check.rows[0];
    if (!row || row.perfil_usuario !== 'SUPER_ADMIN' || row.ativo !== true || row.protegido !== true) {
      throw new Error('postcheck_failed');
    }

    await client.query('COMMIT');
    inTransaction = false;

    console.log('PASS');
    console.log(`ambiente=${environment}`);
    console.log(`acao=${acao}`);
    console.log(`id_usuario_admin=${row.id_usuario_admin}`);
    console.log(`email=${row.email_usuario}`);
    console.log('perfil=SUPER_ADMIN');
    console.log('ativo=true');
    console.log('protegido=true');
  } catch (error) {
    if (inTransaction) {
      await client.query('ROLLBACK').catch(() => {});
    }
    // So codigo/motivo controlado: nunca senha, hash ou connection string.
    fail(error?.code || error?.message || 'erro');
  } finally {
    if (connected) {
      await client.end().catch(() => {});
    }
  }
}

main();
