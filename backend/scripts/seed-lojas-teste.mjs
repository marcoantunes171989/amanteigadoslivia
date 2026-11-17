/**
 * Seed de 2 lojas fictícias (tema, catálogo, usuários ADMIN com PIN).
 * Uso: node backend/scripts/seed-lojas-teste.mjs
 * Lê DATABASE_URL de .env.vercel.tmp / .env / process.env (não imprime segredos).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { hashPassword } from '../src/password.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = value;
  }
}

loadEnvFile(path.join(root, '.env.vercel.tmp'));
loadEnvFile(path.join(root, 'backend', '.env'));
loadEnvFile(path.join(root, '.env'));

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
if (!url || /SENSITIVE|REPLACE|changeme/i.test(url)) {
  console.error('DATABASE_URL ausente ou placeholder. Rode: npx vercel env pull .env.vercel.tmp --environment=production');
  process.exit(1);
}

const EMPRESA_PADRAO = 'a0000000-0000-4000-8000-000000000001';

const LOJAS = [
  {
    id_empresa: 'b1000000-0000-4000-8000-000000000001',
    slug: 'doce-aurora',
    nome: 'Doce Aurora',
    tema: {
      cor_primaria: '#0f6a5a',
      cor_primaria_escura: '#0b5246',
      cor_fundo: '#f3fbf8',
      cor_texto: '#1a2e2a',
      cor_destaque: '#e0a100',
      fonte_titulo: 'Nunito',
      fonte_corpo: 'Nunito',
      whatsapp_telefone: '5511999001001',
      logo_topo_url: 'assets/brand/logo-topo.jpeg',
      logo_favicon_url: 'assets/brand/logo-topo.jpeg',
    },
    usuario: {
      id: 'b1000000-0000-4000-8000-000000000011',
      login: 'admin.aurora',
      nome: 'Admin Aurora',
      email: 'admin.aurora@teste.local',
      pin: '2468',
    },
    categoria: {
      id: 'b1000000-0000-4000-8000-000000000021',
      nome: 'Doces Aurora',
      slug: 'doces-aurora',
    },
    produtos: [
      { id: 'b1000000-0000-4000-8000-000000000031', nome: 'Cookie de Baunilha', slug: 'cookie-baunilha-aurora', preco: 1890, precoId: 'b1000000-0000-4000-8000-000000000041' },
      { id: 'b1000000-0000-4000-8000-000000000032', nome: 'Brownie de Café', slug: 'brownie-cafe-aurora', preco: 2190, precoId: 'b1000000-0000-4000-8000-000000000042' },
      { id: 'b1000000-0000-4000-8000-000000000033', nome: 'Torta Limão', slug: 'torta-limao-aurora', preco: 3290, precoId: 'b1000000-0000-4000-8000-000000000043' },
    ],
  },
  {
    id_empresa: 'b2000000-0000-4000-8000-000000000002',
    slug: 'padaria-norte',
    nome: 'Padaria Norte',
    tema: {
      cor_primaria: '#1d4ed8',
      cor_primaria_escura: '#1e3a8a',
      cor_fundo: '#f5f8ff',
      cor_texto: '#1e293b',
      cor_destaque: '#f59e0b',
      fonte_titulo: 'Nunito',
      fonte_corpo: 'Nunito',
      whatsapp_telefone: '5511999002002',
      logo_topo_url: 'assets/brand/logo-topo.jpeg',
      logo_favicon_url: 'assets/brand/logo-topo.jpeg',
    },
    usuario: {
      id: 'b2000000-0000-4000-8000-000000000012',
      login: 'admin.norte',
      nome: 'Admin Norte',
      email: 'admin.norte@teste.local',
      pin: '1357',
    },
    categoria: {
      id: 'b2000000-0000-4000-8000-000000000022',
      nome: 'Pães Norte',
      slug: 'paes-norte',
    },
    produtos: [
      { id: 'b2000000-0000-4000-8000-000000000034', nome: 'Pão de Queijo', slug: 'pao-queijo-norte', preco: 1290, precoId: 'b2000000-0000-4000-8000-000000000044' },
      { id: 'b2000000-0000-4000-8000-000000000035', nome: 'Croissant Manteiga', slug: 'croissant-norte', preco: 1590, precoId: 'b2000000-0000-4000-8000-000000000045' },
      { id: 'b2000000-0000-4000-8000-000000000036', nome: 'Baguete Tradicional', slug: 'baguete-norte', preco: 990, precoId: 'b2000000-0000-4000-8000-000000000046' },
    ],
  },
];

const pool = new pg.Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  max: 1,
});

async function q(client, sql, params = []) {
  return client.query(sql, params);
}

async function backfillPadrao(client) {
  await q(client, `
    INSERT INTO public.tab_usuario_empresa (id_usuario_admin, id_empresa)
    SELECT u.id_usuario_admin, $1 FROM app.tab_usuario_admin u
    ON CONFLICT (id_usuario_admin) DO NOTHING
  `, [EMPRESA_PADRAO]);
  await q(client, `
    INSERT INTO public.tab_categoria_empresa (id_categoria, id_empresa)
    SELECT c.id_categoria, $1 FROM app.tab_categoria c
    ON CONFLICT (id_categoria) DO NOTHING
  `, [EMPRESA_PADRAO]);
  await q(client, `
    INSERT INTO public.tab_produto_empresa (id_produto, id_empresa)
    SELECT p.id_produto, $1 FROM app.tab_produto p
    ON CONFLICT (id_produto) DO NOTHING
  `, [EMPRESA_PADRAO]);
  await q(client, `
    INSERT INTO public.tab_venda_empresa (id_venda, id_empresa)
    SELECT v.id_venda, $1 FROM app.tab_venda v
    ON CONFLICT (id_venda) DO NOTHING
  `, [EMPRESA_PADRAO]);
}

async function upsertLoja(client, loja) {
  await q(client, `
    INSERT INTO public.tab_empresa (id_empresa, slug, nome_fantasia, ativo)
    VALUES ($1, $2, $3, true)
    ON CONFLICT (id_empresa) DO UPDATE
      SET slug = EXCLUDED.slug,
          nome_fantasia = EXCLUDED.nome_fantasia,
          ativo = true,
          data_atualizacao = now()
  `, [loja.id_empresa, loja.slug, loja.nome]);

  // slug unique: se conflito por slug com outro id, atualiza o existente
  await q(client, `
    INSERT INTO public.tab_empresa_tema (
      id_empresa, nome_exibicao, cor_primaria, cor_primaria_escura, cor_fundo,
      cor_texto, cor_destaque, logo_topo_url, logo_favicon_url, whatsapp_telefone,
      fonte_titulo, fonte_corpo
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (id_empresa) DO UPDATE SET
      nome_exibicao = EXCLUDED.nome_exibicao,
      cor_primaria = EXCLUDED.cor_primaria,
      cor_primaria_escura = EXCLUDED.cor_primaria_escura,
      cor_fundo = EXCLUDED.cor_fundo,
      cor_texto = EXCLUDED.cor_texto,
      cor_destaque = EXCLUDED.cor_destaque,
      logo_topo_url = EXCLUDED.logo_topo_url,
      logo_favicon_url = EXCLUDED.logo_favicon_url,
      whatsapp_telefone = EXCLUDED.whatsapp_telefone,
      fonte_titulo = EXCLUDED.fonte_titulo,
      fonte_corpo = EXCLUDED.fonte_corpo,
      data_atualizacao = now()
  `, [
    loja.id_empresa,
    loja.nome,
    loja.tema.cor_primaria,
    loja.tema.cor_primaria_escura,
    loja.tema.cor_fundo,
    loja.tema.cor_texto,
    loja.tema.cor_destaque,
    loja.tema.logo_topo_url,
    loja.tema.logo_favicon_url,
    loja.tema.whatsapp_telefone,
    loja.tema.fonte_titulo,
    loja.tema.fonte_corpo,
  ]);

  await q(client, `
    INSERT INTO app.tab_categoria (id_categoria, nome_categoria, slug_categoria, ordem_exibicao, ativo)
    VALUES ($1, $2, $3, 1, true)
    ON CONFLICT (id_categoria) DO UPDATE
      SET nome_categoria = EXCLUDED.nome_categoria,
          slug_categoria = EXCLUDED.slug_categoria,
          ativo = true,
          data_atualizacao = now()
  `, [loja.categoria.id, loja.categoria.nome, loja.categoria.slug]);

  await q(client, `
    INSERT INTO public.tab_categoria_empresa (id_categoria, id_empresa)
    VALUES ($1, $2)
    ON CONFLICT (id_categoria) DO UPDATE SET id_empresa = EXCLUDED.id_empresa
  `, [loja.categoria.id, loja.id_empresa]);

  for (const [index, produto] of loja.produtos.entries()) {
    await q(client, `
      INSERT INTO app.tab_produto (
        id_produto, id_categoria, nome_produto, slug_produto,
        descricao_produto, ativo, destaque, ordem_exibicao
      ) VALUES ($1,$2,$3,$4,$5,true,$6,$7)
      ON CONFLICT (id_produto) DO UPDATE
        SET id_categoria = EXCLUDED.id_categoria,
            nome_produto = EXCLUDED.nome_produto,
            slug_produto = EXCLUDED.slug_produto,
            descricao_produto = EXCLUDED.descricao_produto,
            ativo = true,
            destaque = EXCLUDED.destaque,
            ordem_exibicao = EXCLUDED.ordem_exibicao,
            data_atualizacao = now()
    `, [
      produto.id,
      loja.categoria.id,
      produto.nome,
      produto.slug,
      `Produto fictício de teste — ${loja.nome}`,
      index === 0,
      index + 1,
    ]);

    await q(client, `
      INSERT INTO app.tab_produto_preco (
        id_preco, id_produto, valor_centavos, codigo_moeda, promocional, ativo
      ) VALUES ($1,$2,$3,'BRL',false,true)
      ON CONFLICT (id_preco) DO UPDATE
        SET valor_centavos = EXCLUDED.valor_centavos,
            ativo = true
    `, [produto.precoId, produto.id, produto.preco]);

    await q(client, `
      INSERT INTO public.tab_produto_empresa (id_produto, id_empresa)
      VALUES ($1, $2)
      ON CONFLICT (id_produto) DO UPDATE SET id_empresa = EXCLUDED.id_empresa
    `, [produto.id, loja.id_empresa]);
  }

  const hashed = await hashPassword(loja.usuario.pin);
  await q(client, `
    INSERT INTO app.tab_usuario_admin (
      id_usuario_admin, nome_usuario, email_usuario, senha_hash, senha_salt,
      perfil_usuario, ativo, protegido, login_usuario
    ) VALUES ($1,$2,$3,$4,$5,'ADMIN',true,false,$6)
    ON CONFLICT (id_usuario_admin) DO UPDATE
      SET nome_usuario = EXCLUDED.nome_usuario,
          email_usuario = EXCLUDED.email_usuario,
          senha_hash = EXCLUDED.senha_hash,
          senha_salt = EXCLUDED.senha_salt,
          perfil_usuario = 'ADMIN',
          ativo = true,
          login_usuario = EXCLUDED.login_usuario,
          data_atualizacao = now()
  `, [
    loja.usuario.id,
    loja.usuario.nome,
    loja.usuario.email,
    hashed.senha_hash,
    hashed.senha_salt,
    loja.usuario.login,
  ]);

  await q(client, `
    INSERT INTO public.tab_usuario_empresa (id_usuario_admin, id_empresa)
    VALUES ($1, $2)
    ON CONFLICT (id_usuario_admin) DO UPDATE
      SET id_empresa = EXCLUDED.id_empresa,
          data_atualizacao = now()
  `, [loja.usuario.id, loja.id_empresa]);
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await backfillPadrao(client);
    for (const loja of LOJAS) {
      await upsertLoja(client, loja);
    }
    await client.query('COMMIT');

    const empresas = await pool.query(`
      SELECT e.slug, e.nome_fantasia, t.cor_primaria,
        (SELECT count(*)::int FROM public.tab_produto_empresa pe WHERE pe.id_empresa = e.id_empresa) AS produtos,
        (SELECT count(*)::int FROM public.tab_usuario_empresa ue WHERE ue.id_empresa = e.id_empresa) AS usuarios
      FROM public.tab_empresa e
      JOIN public.tab_empresa_tema t ON t.id_empresa = e.id_empresa
      ORDER BY e.slug
    `);
    console.log('OK seed lojas teste');
    for (const row of empresas.rows) {
      console.log(`- ${row.slug} | ${row.nome_fantasia} | ${row.cor_primaria} | produtos=${row.produtos} usuarios=${row.usuarios}`);
    }
    console.log('Logins ADMIN (PIN):');
    for (const loja of LOJAS) {
      console.log(`- ${loja.slug}: usuario=${loja.usuario.login} pin=${loja.usuario.pin} url=/loja/${loja.slug}/produtos`);
    }
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    console.error('FAIL', error.code || '', String(error.message).split('\n')[0]);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

await main();
