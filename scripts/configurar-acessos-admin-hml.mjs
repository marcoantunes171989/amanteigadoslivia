import { randomUUID } from 'node:crypto';
import readline from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import pg from 'pg';
import { hashPassword, passwordPolicyError } from '../backend/src/password.js';

const EXPECTED_REF = 'ywlzswyepcawcgkllwlu';
const EXPECTED_DATABASE = 'postgres';
const HML_HOST = 'aws-0-sa-east-1.pooler.supabase.com';
const HML_PORT = 5432;
const HML_USER = `amanteigados_homolog_app.${EXPECTED_REF}`;
const EMAIL_EXISTENTE = 'amanteigadoslivia@gmail.com';
const EMAIL_ALTERNATIVO = 'amanteigadodoslivia@gmail.com';

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

async function askNewPassword(label) {
  let senha = '';
  let senha2 = '';
  while (true) {
    senha = await askHidden(`${label}: `);
    const policyError = passwordPolicyError(senha);
    if (policyError) {
      console.error(policyError);
      continue;
    }
    senha2 = await askHidden('Confirmar senha: ');
    if (senha !== senha2) {
      console.error('Confirmacao divergente.');
      continue;
    }
    return senha;
  }
}

function printUser(row) {
  console.log(`Nome: ${row.nome_usuario}`);
  console.log(`Email: ${row.email_usuario}`);
  console.log(`Perfil: ${row.perfil_usuario}`);
  console.log(`Ativo: ${row.ativo === true}`);
  console.log(`Protegido: ${row.protegido === true}`);
}

async function main() {
  if (process.platform === 'win32') {
    process.title = 'AMANTEIGADOS LIVIA - CONFIGURAR ACESSOS HML';
  }

  console.log('AMANTEIGADOS LIVIA - CONFIGURAR ACESSOS HML');
  console.log(`PROJECT REF esperado: ${EXPECTED_REF}`);
  console.log('Ambiente: HOMOLOG. PROD nao sera alterado.');
  console.log('');

  const confirmRl = readline.createInterface({ input, output });
  const confirm = (await askVisible(confirmRl, 'CONFIRMACAO DO AMBIENTE: digite HOMOLOG: ')).trim();
  if (confirm !== 'HOMOLOG') {
    confirmRl.close();
    console.error('FAIL');
    console.error('Confirmacao invalida. Nenhuma alteracao foi feita.');
    process.exitCode = 1;
    return;
  }

  const pgPassword = await askHidden('Senha PostgreSQL HML: ');
  if (!pgPassword) {
    confirmRl.close();
    console.error('FAIL');
    console.error('Senha PostgreSQL ausente.');
    process.exitCode = 1;
    return;
  }

  const pool = new pg.Pool({
    host: HML_HOST,
    port: HML_PORT,
    database: EXPECTED_DATABASE,
    user: HML_USER,
    password: pgPassword,
    ssl: { rejectUnauthorized: false },
    max: 1,
  });

  let rootPasswordConfigured = false;
  let adminPasswordConfigured = false;
  let rootRow = null;
  let adminRow = null;

  try {
    const identity = await pool.query('SELECT current_database() AS db');
    if (identity.rows[0]?.db !== EXPECTED_DATABASE) {
      throw new Error('database_mismatch');
    }

    const migrationProbe = await pool.query(`
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = 'app'
         AND table_name = 'tab_usuario_admin'
         AND column_name = 'protegido'
    `);
    if (!migrationProbe.rowCount) {
      throw new Error('migration_0005_ausente');
    }

    const users = await pool.query(`
      SELECT id_usuario_admin, nome_usuario, email_usuario, perfil_usuario, ativo, protegido
        FROM app.tab_usuario_admin
       ORDER BY data_criacao
    `);

    console.log('');
    console.log('Contas administrativas atuais:');
    if (!users.rows.length) {
      console.log('(nenhuma)');
    }
    for (const row of users.rows) {
      console.log('---');
      printUser(row);
    }
    console.log('');

    rootRow = users.rows.find((row) => row.perfil_usuario === 'SUPER_ADMIN' && row.protegido === true) || null;
    if (!rootRow) {
      throw new Error('root_super_admin_ausente');
    }

    console.log('ROOT SUPER ADMIN encontrado:');
    console.log(rootRow.email_usuario);
    console.log('Recomendacao para esta fase: SIM');
    const resetRoot = (await askVisible(confirmRl, 'Deseja redefinir a senha deste Super Admin agora? S/N: ')).trim().toUpperCase();
    if (resetRoot === 'S' || resetRoot === 'SIM') {
      const novaSenha = await askNewPassword('Nova senha');
      const hashed = await hashPassword(novaSenha);
      await pool.query(
        `UPDATE app.tab_usuario_admin
            SET senha_hash = $2,
                senha_salt = $3,
                data_atualizacao = now()
          WHERE id_usuario_admin = $1
            AND perfil_usuario = 'SUPER_ADMIN'
            AND protegido = true
            AND ativo = true`,
        [rootRow.id_usuario_admin, hashed.senha_hash, hashed.senha_salt],
      );
      rootPasswordConfigured = true;
    }

    console.log('');
    console.log('Qual endereco deve permanecer como conta administrativa da Amanteigados Livia?');
    console.log(`1 - usar conta existente ${EMAIL_EXISTENTE}`);
    console.log(`2 - criar/usar ${EMAIL_ALTERNATIVO}`);
    console.log('3 - informar outro endereco');
    let choice = '';
    while (!['1', '2', '3'].includes(choice)) {
      choice = (await askVisible(confirmRl, 'Escolha 1, 2 ou 3: ')).trim();
    }

    let adminEmail = EMAIL_EXISTENTE;
    if (choice === '2') adminEmail = EMAIL_ALTERNATIVO;
    if (choice === '3') {
      adminEmail = '';
      while (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
        adminEmail = (await askVisible(confirmRl, 'Informe o e-mail administrativo: ')).trim().toLowerCase();
      }
    } else {
      adminEmail = adminEmail.toLowerCase();
    }

    if (adminEmail === String(rootRow.email_usuario || '').toLowerCase()) {
      throw new Error('email_admin_coincide_com_root');
    }

    const existingAdmin = users.rows.find((row) => String(row.email_usuario || '').toLowerCase() === adminEmail) || null;
    if (existingAdmin?.protegido === true) {
      throw new Error('email_protegido_nao_pode_virar_admin');
    }

    let adminNome = existingAdmin?.nome_usuario || '';
    if (!existingAdmin) {
      while (!adminNome) {
        adminNome = (await askVisible(confirmRl, 'Nome da conta administrativa: ')).trim();
      }
    }

    const adminSenha = await askNewPassword('Nova senha');
    const adminHashed = await hashPassword(adminSenha);

    if (existingAdmin) {
      await pool.query(
        `UPDATE app.tab_usuario_admin
            SET senha_hash = $2,
                senha_salt = $3,
                perfil_usuario = 'ADMIN',
                ativo = true,
                protegido = false,
                data_atualizacao = now()
          WHERE id_usuario_admin = $1`,
        [existingAdmin.id_usuario_admin, adminHashed.senha_hash, adminHashed.senha_salt],
      );
    } else {
      await pool.query(
        `INSERT INTO app.tab_usuario_admin (
           id_usuario_admin, nome_usuario, email_usuario, senha_hash, senha_salt,
           perfil_usuario, ativo, protegido
         ) VALUES ($1,$2,$3,$4,$5,'ADMIN', true, false)`,
        [randomUUID(), adminNome, adminEmail, adminHashed.senha_hash, adminHashed.senha_salt],
      );
    }
    adminPasswordConfigured = true;

    const rootCheck = await pool.query(
      `SELECT email_usuario, perfil_usuario, ativo, protegido
         FROM app.tab_usuario_admin
        WHERE id_usuario_admin = $1`,
      [rootRow.id_usuario_admin],
    );
    const adminCheck = await pool.query(
      `SELECT email_usuario, perfil_usuario, ativo, protegido
         FROM app.tab_usuario_admin
        WHERE lower(email_usuario) = lower($1)`,
      [adminEmail],
    );
    rootRow = rootCheck.rows[0];
    adminRow = adminCheck.rows[0];
    if (!rootRow || rootRow.perfil_usuario !== 'SUPER_ADMIN' || rootRow.ativo !== true || rootRow.protegido !== true) {
      throw new Error('root_postcheck_failed');
    }
    if (!adminRow || adminRow.perfil_usuario !== 'ADMIN' || adminRow.ativo !== true || adminRow.protegido !== false) {
      throw new Error('admin_postcheck_failed');
    }

    console.log('');
    console.log('PASS');
    console.log('SUPER_ADMIN:');
    console.log(`email=${rootRow.email_usuario}`);
    console.log(`perfil=${rootRow.perfil_usuario}`);
    console.log(`ativo=${rootRow.ativo}`);
    console.log(`protegido=${rootRow.protegido}`);
    console.log(`SENHA CONFIGURADA = ${rootPasswordConfigured ? 'SIM' : 'NAO'}`);
    console.log('ADMIN:');
    console.log(`email=${adminRow.email_usuario}`);
    console.log(`perfil=${adminRow.perfil_usuario}`);
    console.log(`ativo=${adminRow.ativo}`);
    console.log(`protegido=${adminRow.protegido}`);
    console.log(`SENHA CONFIGURADA = ${adminPasswordConfigured ? 'SIM' : 'NAO'}`);
  } catch (error) {
    console.error('FAIL');
    console.error(error?.code || error?.message || 'erro');
    process.exitCode = 1;
  } finally {
    confirmRl.close();
    await pool.end().catch(() => {});
  }
}

main();
