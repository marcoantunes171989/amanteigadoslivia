import app from './app.js';
import config from './config.js';
import { closeDatabasePool } from './database.js';

const { host, port } = config.app;

const server = app.listen(port, host, () => {
  console.log(`[amanteigados-livia-api] listening on http://${host}:${port}`);
});

server.on('error', (error) => {
  console.error('[amanteigados-livia-api] server error', error);
  process.exitCode = 1;
});

let shuttingDown = false;

const shutdown = (signal) => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  console.log(`[amanteigados-livia-api] received ${signal}; shutting down`);

  server.close(async (error) => {
    if (error) {
      console.error('[amanteigados-livia-api] shutdown error', error);
      process.exitCode = 1;
      return;
    }

    try {
      await closeDatabasePool();
      process.exitCode = 0;
    } catch (dbError) {
      console.error('[amanteigados-livia-api] database pool shutdown error', {
        code: dbError.code ?? 'unknown_error',
      });
      process.exitCode = 1;
    }
  });
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
