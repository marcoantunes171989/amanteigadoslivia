import { randomUUID } from 'node:crypto';
import readline from 'node:readline';
import { createUsuario } from '../backend/src/admin-users.js';
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
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('AMANTEIGADOS LIVIA');
    console.log('BOOTSTRAP USUARIO ADMIN — HOMOLOG');
    const nome = (await ask(rl, 'Nome: ')).trim();
    const email = (await ask(rl, 'E-mail: ')).trim();
    rl.pause();
    const senha = await ask(rl, 'Senha: ', { silent: true });
    if (!nome || !email || !senha) {
      console.error('FAIL');
      process.exitCode = 1;
      return;
    }

    const host = process.env.DATABASE_HOST;
    const pool = new pg.Pool({
      ...(host
        ? {
          host,
          port: Number(process.env.DATABASE_PORT || 5432),
          database: process.env.DATABASE_NAME,
          user: process.env.DATABASE_USER,
          password: process.env.DATABASE_PASSWORD,
        }
        : { connectionString: process.env.DATABASE_URL }),
      ssl: { rejectUnauthorized: false },
      max: 1,
    });

    const usuario = await createUsuario(pool, {
      id_usuario_admin: randomUUID(),
      nome_usuario: nome,
      email_usuario: email,
      senha,
      perfil_usuario: 'ADMIN',
    });
    await pool.end();
    console.log('PASS');
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
