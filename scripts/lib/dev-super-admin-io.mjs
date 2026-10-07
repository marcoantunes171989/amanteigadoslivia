// Entrada do operador para o bootstrap DEV LOCAL. Senhas sempre ocultas, nunca em argumento, arquivo ou log.
import readline from 'node:readline';

export function requireTty() {
  const stdin = process.stdin;
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('tty_required');
  }
}

export function askLine(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// Digitacao oculta: mostra '*' por caractere. Trata chunks colados (varios caracteres de uma vez).
export function askHidden(question) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    let value = '';

    const finish = () => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write('\n');
      resolve(value);
    };

    const onData = (chunk) => {
      for (const ch of String(chunk)) {
        if (ch === '\u0003') {
          stdin.setRawMode(false);
          process.exit(130);
        }
        if (ch === '\r' || ch === '\n') {
          finish();
          return;
        }
        if (ch === '\u0008' || ch === '\u007f') {
          value = value.slice(0, -1);
          continue;
        }
        value += ch;
        process.stdout.write('*');
      }
    };

    process.stdout.write(question);
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}
