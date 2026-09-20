import { randomUUID } from 'node:crypto';
import readline from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import pg from 'pg';
import { hashPassword } from '../backend/src/password.js';

const EXPECTED_REF = 'ywlzswyepcawcgkllwlu';
const EXPECTED_DATABASE = 'postgres';
const HML_HOST = 'aws-0-sa-east-1.pooler.supabase.com';
const HML_PORT = 5432;
const HML_USER = `amanteigados_homolog_app.${EXPECTED_REF}`;

function askVisible(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

function askHidden(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
      const rl = readline.createInterface({ input, output });
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
      return;
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

async function main() {
  console.log('AMANTEIGADOS LIVIA - SUPER ADMIN - HOMOLOGACAO');
  console.log(`PROJECT REF esperado: ${EXPECTED_REF}`);
  console.log('Ambiente: HOMOLOG. PROD nao sera alterado.');
  console.log('');

  const confirmRl = readline.createInterface({ input, output });
  const confirm = (await askVisible(confirmRl, 'DIGITE HOMOLOG PARA CONTINUAR: ')).trim();
  if (confirm !== 'HOMOLOG') {
    confirmRl.close();
    console.error('FAIL');
    console.error('Confirmacao invalida. Nenhuma alteracao foi feita.');
    process.exitCode = 1;
    return;
  }

  let nome = '';
  let email = '';
  while (!nome || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    if (nome || email) {
      console.error('Nome ou e-mail invalido. Use um e-mail com um unico @, por exemplo nome@dominio.com');
    }
    nome = (await askVisible(confirmRl, 'Nome do Super Admin: ')).trim();
    email = (await askVisible(confirmRl, 'E-mail do Super Admin: ')).trim().toLowerCase();
  }
  confirmRl.close();

  let senha = '';
  let senha2 = '';
  while (typeof senha !== 'string' || senha.length < 8 || senha !== senha2) {
    if (senha || senha2) {
      console.error('Senha invalida ou confirmacao divergente. Minimo 8 caracteres.');
    }
    senha = await askHidden('Senha: ');
    senha2 = await askHidden('Confirmar senha: ');
  }
  const pgPassword = await askHidden('Senha PostgreSQL HML: ');
  if (!pgPassword) {
    console.error('FAIL');
    console.error('Senha PostgreSQL ausente.');
    process.exitCode = 1;
    return;
  }

  const hashed = await hashPassword(senha);
  const pool = new pg.Pool({
    host: HML_HOST,
    port: HML_PORT,
    database: EXPECTED_DATABASE,
    user: HML_USER,
    password: pgPassword,
    ssl: { rejectUnauthorized: false },
    max: 1,
  });

  try {
    const identity = await pool.query('SELECT current_database() AS db, inet_server_addr()::text AS addr');
    const db = identity.rows[0]?.db;
    if (db !== EXPECTED_DATABASE) {
      throw new Error('database_mismatch');
    }

    const existing = await pool.query(
      `SELECT id_usuario_admin FROM app.tab_usuario_admin WHERE lower(email_usuario) = lower($1)`,
      [email],
    );

    let id;
    let acao;
    if (existing.rows[0]) {
      id = existing.rows[0].id_usuario_admin;
      acao = 'promovido';
      await pool.query(
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
      await pool.query(
        `INSERT INTO app.tab_usuario_admin (
           id_usuario_admin, nome_usuario, email_usuario, senha_hash, senha_salt,
           perfil_usuario, ativo, protegido
         ) VALUES ($1,$2,$3,$4,$5,'SUPER_ADMIN', true, true)`,
        [id, nome, email, hashed.senha_hash, hashed.senha_salt],
      );
    }

    const check = await pool.query(
      `SELECT id_usuario_admin, email_usuario, perfil_usuario, ativo, protegido
         FROM app.tab_usuario_admin
        WHERE id_usuario_admin = $1`,
      [id],
    );
    const row = check.rows[0];
    if (!row || row.perfil_usuario !== 'SUPER_ADMIN' || row.ativo !== true || row.protegido !== true) {
      throw new Error('postcheck_failed');
    }

    console.log('PASS');
    console.log(`acao=${acao}`);
    console.log(`id_usuario_admin=${row.id_usuario_admin}`);
    console.log(`email=${row.email_usuario}`);
    console.log('perfil=SUPER_ADMIN');
    console.log('ativo=true');
    console.log('protegido=true');
  } catch (error) {
    console.error('FAIL');
    console.error(error?.code || error?.message || 'erro');
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
}

main();
