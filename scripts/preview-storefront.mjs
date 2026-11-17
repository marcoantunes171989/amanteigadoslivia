import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 4173);

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

async function loadDemoCatalog() {
  const file = path.join(root, 'catalog-demo-data.js');
  const source = fs.readFileSync(file, 'utf8');
  const sandbox = { window: {} };
  const runner = new Function('window', `${source}\nreturn window.CATALOG_DATA;`);
  return runner(sandbox.window);
}

const demoCatalog = await loadDemoCatalog();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://127.0.0.1:${port}`);

  if (url.pathname === '/api/catalogo') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ...demoCatalog, mode: 'live' }));
    return;
  }

  if (url.pathname === '/api/catalogo/revisao') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ revisao_catalogo: 'preview', proxima_alteracao: null }));
    return;
  }

  if (url.pathname === '/api/conteudo-site' || (url.pathname === '/api/catalogo' && url.searchParams.get('recurso') === 'conteudo-site')) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ configuracao: { whatsapp_telefone: '5511999990000' } }));
    return;
  }

  if (url.pathname === '/api/vendas' && req.method === 'POST') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let parsed = {};
    try { parsed = JSON.parse(body || '{}'); } catch { parsed = {}; }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: true,
      duplicated: false,
      venda: {
        id_venda: '11111111-2222-3333-4444-555555555555',
        numero_pedido: 345,
        status_venda: 'PENDENTE',
        nome_cliente: parsed.nome_cliente || null,
        telefone_cliente: parsed.telefone_cliente || null,
        valor_total_centavos: 9570,
      },
    }));
    return;
  }

  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  if (!path.extname(pathname)) {
    const candidate = path.join(root, `${pathname}.html`);
    if (fs.existsSync(candidate)) pathname = `${pathname}.html`;
  }

  const filePath = path.normalize(path.join(root, pathname));
  if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': mime[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Storefront preview: http://127.0.0.1:${port}/produtos`);
});
