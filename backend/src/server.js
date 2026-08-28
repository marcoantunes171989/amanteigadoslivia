import app from './app.js';

const HOST = '127.0.0.1';
const PORT = 3101;

const server = app.listen(PORT, HOST, () => {
  console.log(`[amanteigados-livia-api] listening on http://${HOST}:${PORT}`);
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
