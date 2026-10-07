import { randomUUID } from 'node:crypto';
import readline from 'node:readline';
import { createUsuario } from '../backend/src/admin-users.js';
import { resolveDevAdminTarget } from './lib/dev-admin-target.mjs';
import pg from 'pg';

function ask(rl, question, { silent = false } = {}) {
  if (!silent) {
    return new Promise((resolve) => rl.question(question, resolve));
  }
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const onData = (char) => {
      const text = char.toString('utf8');
      if (text === '\n' || text === '\r' || text === '\u0004') {
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        return;
      }
      stdin.removeListener('data', onData);
      process.stdout.write('*');
    };
    process.stdout.write(question);
    stdin.setRawMode?.(true);
    stdin.resume();
    let value = '';
    stdin.on('data', (char) => {
      const text = char.toString('utf8');
      if (text === '\n' || text === '\r' || text === '\u0004') {
        stdin.setRawMode?.(false);
        stdin.pause();
        process.stdout.write('\n');
        resolve(value);
        return;
      }
      if (text === '\u0003') {
        process.exit(1);
      }
      if (text === '\u0008' || text === '\u007f') {
        value = value.slice(0, -1);
        return;
      }
      value += text;
      process.stdout.write('*');
    });
  });
}

async function main() {
  console.log('AMANTEIGADOS LIVIA');
  console.log('BOOTSTRAP USUARIO ADMIN — DEV LOCAL ONLY');
  let target;
  try {
    target = resolveDevAdminTarget(process.env);
  } catch (error) {
    console.error('FAIL');
    console.error(error?.code || 'dev_target_rejected');
    console.error(error?.message || 'destino rejeitado');
    process.exitCode = 1;
    return;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const nome = (await ask(rl, 'Nome: ')).trim();
    const usuarioLogin = (await ask(rl, 'Usuário (login): ')).trim();
    const email = (await ask(rl, 'E-mail: ')).trim();
    rl.pause();
    const senha = await ask(rl, 'Senha/PIN: ', { silent: true });
    if (!nome || !usuarioLogin || !email || !senha) {
      console.error('FAIL');
      process.exitCode = 1;
      return;
    }

    const pool = new pg.Pool({
      host: target.host,
      port: target.port,
      database: target.database,
      user: target.user,
      password: target.password,
      ssl: target.ssl,
      max: 1,
    });

    const root = await pool.query(`
      SELECT id_usuario_admin, perfil_usuario, protegido, ativo
        FROM app.tab_usuario_admin
       WHERE perfil_usuario = 'SUPER_ADMIN' AND protegido = true AND ativo = true
       LIMIT 1
    `);
    if (!root.rows[0]) {
      throw new Error('root_super_admin_ausente');
    }
    const usuario = await createUsuario(pool, {
      id_usuario_admin: randomUUID(),
      nome_usuario: nome,
      usuario: usuarioLogin,
      email_usuario: email,
      senha,
      perfil_usuario: 'ADMIN',
    }, {
      id_usuario_admin: String(root.rows[0].id_usuario_admin),
      perfil: 'SUPER_ADMIN',
      protegido: true,
    });
    await pool.end();
    console.log('PASS');
    console.log(`usuario=${usuario.login_usuario}`);
    console.log(`email=${usuario.email_usuario}`);
    console.log(`id_usuario_admin=${usuario.id_usuario_admin}`);
  } catch (error) {
    console.error('FAIL');
    console.error(error?.code || error?.message || 'erro');
    process.exitCode = 1;
  } finally {
    rl.close();
  }
}

main();
