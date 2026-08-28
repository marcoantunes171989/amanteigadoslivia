import app from './app.js';
import config from './config.js';

const { host, port } = config.app;

const server = app.listen(port, host, () => {
  console.log(`[amanteigados-livia-api] listening on http://${host}:${port}`);
});

server.on('error', (error) => {
  console.error('[amanteigados-livia-api] server error', error);
  process.exitCode = 1;
});

const shutdown = (signal) => {
  console.log(`[amanteigados-livia-api] received ${signal}; shutting down`);

  server.close((error) => {
    if (error) {
      console.error('[amanteigados-livia-api] shutdown error', error);
      process.exitCode = 1;
      return;
    }

    process.exitCode = 0;
  });
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
