import express from 'express';

const app = express();

app.disable('x-powered-by');

app.use(express.json({
  limit: '100kb',
}));

app.get('/health', (_request, response) => {
  response.status(200).json({
    status: 'ok',
    service: 'amanteigados-livia-api',
  });
});

app.use((_request, response) => {
  response.status(404).json({
    error: 'not_found',
  });
});

export default app;
