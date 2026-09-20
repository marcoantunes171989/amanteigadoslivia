import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createCategoria, createProduto, updateProduto } from '../backend/src/admin-catalog.js';
import { createUsuario } from '../backend/src/admin-users.js';
import { captureVenda, computeFaturamento, listVendas, updateVendaStatus } from '../backend/src/admin-sales.js';
import { processDueScheduledChanges, scheduleChange } from '../backend/src/admin-schedule.js';
import { getReports } from '../backend/src/admin-reports.js';
import { validatePromotionDryRun, createPublicacao, processDuePublications } from '../backend/src/admin-publish.js';
import { createSignedImageUpload, validateImageUploadMeta, MAX_IMAGE_BYTES } from '../backend/src/admin-storage.js';
import { recordAudit } from '../backend/src/admin-audit.js';

const results = [];

function log(name, ok, extra = '') {
  const status = ok ? 'PASS' : 'FAIL';
  results.push({ name, status, extra });
  console.log(`${status}  ${name}${extra ? `  ${extra}` : ''}`);
}

function poolFromEnv() {
  const host = process.env.DATABASE_HOST;
  return new pg.Pool({
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
}

async function officialCounts(pool) {
  const result = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM app.tab_categoria WHERE ativo = true AND nome_categoria NOT LIKE 'TESTE HML V2%') AS categorias,
      (SELECT count(*)::int FROM app.tab_produto WHERE ativo = true AND nome_produto NOT LIKE 'Produto teste HML V2%') AS produtos,
      (SELECT count(*)::int FROM app.tab_produto_imagem i
         JOIN app.tab_produto p ON p.id_produto = i.id_produto
         WHERE p.nome_produto NOT LIKE 'Produto teste HML V2%') AS imagens,
      (SELECT count(*)::int FROM app.tab_produto_preco pr
         JOIN app.tab_produto p ON p.id_produto = pr.id_produto
         WHERE p.nome_produto NOT LIKE 'Produto teste HML V2%') AS precos
  `);
  return result.rows[0];
}

async function cleanup(pool, ids) {
  await pool.query("DELETE FROM app.tab_venda WHERE chave_idempotencia LIKE 'teste-hml-v2-%'");
  if (ids.venda) {
    await pool.query('DELETE FROM app.tab_venda WHERE id_venda = $1', [ids.venda]);
  }
  if (ids.publicacao) {
    await pool.query('DELETE FROM app.tab_publicacao WHERE id_publicacao = $1', [ids.publicacao]);
  }
  if (ids.alteracao) {
    await pool.query('DELETE FROM app.tab_alteracao_agendada WHERE id_alteracao_agendada = $1', [ids.alteracao]);
  }
  await pool.query("DELETE FROM app.tab_alteracao_agendada WHERE dados_alteracao->>'nome' LIKE 'Produto teste HML V2%' OR dados_alteracao->>'nome_produto' LIKE 'Produto teste HML V2%'");
  if (ids.produto) {
    await pool.query('DELETE FROM app.tab_produto_imagem WHERE id_produto = $1', [ids.produto]);
    await pool.query('DELETE FROM app.tab_produto_preco WHERE id_produto = $1', [ids.produto]);
    await pool.query('DELETE FROM app.tab_produto WHERE id_produto = $1', [ids.produto]);
  }
  if (ids.categoria) {
    await pool.query('DELETE FROM app.tab_categoria WHERE id_categoria = $1', [ids.categoria]);
  }
  if (ids.usuarioSecundario) {
    await pool.query('UPDATE app.tab_auditoria_admin SET id_usuario_admin = NULL WHERE id_usuario_admin = $1', [ids.usuarioSecundario]);
    await pool.query('DELETE FROM app.tab_usuario_admin WHERE id_usuario_admin = $1', [ids.usuarioSecundario]);
  }
}

async function main() {
  const pool = poolFromEnv();
  const ids = {};
  process.env.PROMOCAO_PROD_HABILITADA = process.env.PROMOCAO_PROD_HABILITADA || 'false';
  try {
    const tables = await pool.query(`
      SELECT tablename FROM pg_catalog.pg_tables
      WHERE schemaname = 'app'
      ORDER BY tablename
    `);
    const names = tables.rows.map((row) => row.tablename);
    log('tabelas_app', names.includes('tab_usuario_admin') && names.includes('tab_venda') && names.includes('tab_publicacao'), names.join(','));

    await cleanup(pool, {});
    await pool.query("DELETE FROM app.tab_produto_imagem WHERE id_produto IN (SELECT id_produto FROM app.tab_produto WHERE nome_produto LIKE 'Produto teste HML V2%')");
    await pool.query("DELETE FROM app.tab_produto_preco WHERE id_produto IN (SELECT id_produto FROM app.tab_produto WHERE nome_produto LIKE 'Produto teste HML V2%')");
    await pool.query("DELETE FROM app.tab_produto WHERE nome_produto LIKE 'Produto teste HML V2%'");
    await pool.query("DELETE FROM app.tab_categoria WHERE nome_categoria LIKE 'TESTE HML V2%'");
    await pool.query("DELETE FROM app.tab_usuario_admin WHERE email_usuario LIKE 'teste.hml.v2.%@amanteigados.invalid'");
    await pool.query("DELETE FROM app.tab_publicacao WHERE resumo_json->>'observacao' LIKE 'TESTE HML V2%'");
    await pool.query("DELETE FROM app.tab_alteracao_agendada WHERE dados_alteracao->>'nome' LIKE 'Produto teste HML V2%'");

    const before = await officialCounts(pool);
    log('contagem_oficial_antes', before.categorias === 4 && before.produtos === 8 && before.imagens === 8, JSON.stringify(before));

    const admin = await pool.query(`
      SELECT id_usuario_admin, email_usuario, perfil_usuario, ativo
      FROM app.tab_usuario_admin
      WHERE ativo = true AND perfil_usuario = 'ADMIN'
      ORDER BY data_criacao ASC
      LIMIT 1
    `);
    const firstAdmin = admin.rows[0];
    log('primeiro_usuario_admin', Boolean(firstAdmin), firstAdmin ? `email=${firstAdmin.email_usuario} id=${firstAdmin.id_usuario_admin}` : '');
    if (!firstAdmin) throw new Error('Nenhum ADMIN ativo');

    const secundario = await createUsuario(pool, {
      nome_usuario: 'TESTE HML V2 GESTOR',
      email_usuario: `teste.hml.v2.${randomUUID().slice(0, 8)}@amanteigados.invalid`,
      senha: 'SenhaTempV2#hml',
      perfil_usuario: 'GESTOR',
    }, {
      id_usuario_admin: firstAdmin.id_usuario_admin,
      perfil: firstAdmin.perfil_usuario,
      protegido: false,
    });
    ids.usuarioSecundario = secundario.id_usuario_admin;
    log('usuario_secundario', Boolean(secundario.id_usuario_admin), `id=${secundario.id_usuario_admin}`);

    const categoria = await createCategoria(pool, {
      nome: 'TESTE HML V2 CATEGORIA',
      slug: `teste-hml-v2-cat-${randomUUID().slice(0, 8)}`,
      descricao: 'Residuo identificavel de teste HML V2',
      ordem: 99,
      ativo: true,
    });
    ids.categoria = categoria.id_categoria;
    log('categoria_teste', Boolean(categoria.id_categoria));

    const produto = await createProduto(pool, {
      id_categoria: categoria.id_categoria,
      nome: 'Produto teste HML V2',
      slug: `produto-teste-hml-v2-${randomUUID().slice(0, 8)}`,
      descricao: 'Produto temporario HML V2',
      preco_normal: '12,50',
      preco_promocional: '9,90',
      promocao_ativa: true,
      url_imagem_principal: 'https://amanteigados-livia-homolog.vercel.app/assets/amanteigado-tradicional.jpg',
      ativo: true,
    });
    ids.produto = produto.id_produto;
    log('produto_teste', Boolean(produto.id_produto));

    try {
      validateImageUploadMeta({
        nome_arquivo: 'grande.jpg',
        tipo_mime: 'image/jpeg',
        tamanho_bytes: MAX_IMAGE_BYTES + 1,
      });
      log('upload_gt_2mb', false);
    } catch (error) {
      log('upload_gt_2mb', /2 MB/.test(error.message));
    }
    try {
      validateImageUploadMeta({
        nome_arquivo: 'x.svg',
        tipo_mime: 'image/svg+xml',
        tamanho_bytes: 100,
      });
      log('upload_mime_invalido', false);
    } catch {
      log('upload_mime_invalido', true);
    }

    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const signed = await createSignedImageUpload({
          nome_arquivo: 'teste.png',
          tipo_mime: 'image/png',
          tamanho_bytes: 80,
        });
        log('signed_upload_url', Boolean(signed.signed_upload_url && signed.public_url));
      } catch (error) {
        log('signed_upload_url', false, error.message || 'erro');
      }
    } else {
      log('signed_upload_url', false, 'storage_env_ausente');
    }

    const venda1 = await captureVenda(pool, {
      chave_idempotencia: `teste-hml-v2-${randomUUID()}`,
      nome_cliente: 'Cliente teste HML V2',
      telefone_cliente: '11999999999',
      itens: [{ id_produto: produto.id_produto, quantidade: 2 }],
    });
    ids.venda = venda1.venda.id_venda;
    log('venda_pendente', venda1.venda.status_venda === 'PENDENTE' && venda1.venda.valor_total_centavos === 1980, `total=${venda1.venda.valor_total_centavos}`);

    const vendaDup = await captureVenda(pool, {
      chave_idempotencia: venda1.venda.chave_idempotencia,
      itens: [{ id_produto: produto.id_produto, quantidade: 2 }],
    });
    log('venda_idempotente', vendaDup.duplicated === true && vendaDup.venda.id_venda === venda1.venda.id_venda);

    await updateVendaStatus(pool, venda1.venda.id_venda, 'CONFIRMADA');
    const confirmed = await pool.query(
      'SELECT status_venda, valor_total_centavos FROM app.tab_venda WHERE id_venda = $1',
      [venda1.venda.id_venda],
    );
    const vendas = await listVendas(pool, { periodo: '7d' });
    const fat = computeFaturamento(vendas);
    log(
      'faturamento_confirmada',
      confirmed.rows[0]?.status_venda === 'CONFIRMADA'
        && Number(confirmed.rows[0]?.valor_total_centavos) === 1980
        && fat.vendas_confirmadas >= 1,
      `status=${confirmed.rows[0]?.status_venda} fat=${fat.faturamento_centavos} confirmadas=${fat.vendas_confirmadas}`,
    );

    const reports = await getReports(pool, { periodo: '7d' });
    log('relatorios', Boolean(reports?.dashboard && reports?.vendas && reports?.catalogo));

    const dryRun = validatePromotionDryRun();
    log('publicacao_dry_run_bloqueada', dryRun.status === 'BLOQUEADA');

    const publicacao = await createPublicacao(pool, {
      tipo_publicacao: 'CATALOGO',
      acao: 'agendar',
      data_agendada: new Date(Date.now() - 1000).toISOString(),
      observacao: 'TESTE HML V2 agendamento',
    }, { id_usuario_admin: firstAdmin.id_usuario_admin });
    ids.publicacao = publicacao.id_publicacao;
    const processed = await processDuePublications(pool);
    const pubAfter = await pool.query('SELECT status_publicacao FROM app.tab_publicacao WHERE id_publicacao = $1', [publicacao.id_publicacao]);
    log('worker_publicacao_bloqueada', processed.note === 'production_not_enabled' && pubAfter.rows[0]?.status_publicacao === 'BLOQUEADA');

    const vigencia = new Date(Date.now() + 3000);
    const scheduled = await scheduleChange(pool, {
      id_usuario_admin: firstAdmin.id_usuario_admin,
      tipo_entidade: 'PRODUTO',
      id_registro: produto.id_produto,
      data_vigencia: vigencia,
      dados_alteracao: {
        recurso: 'produto',
        acao: 'editar',
        id: produto.id_produto,
        nome: 'Produto teste HML V2 agendado',
        id_categoria: categoria.id_categoria,
        preco_normal: '12,50',
      },
    });
    ids.alteracao = scheduled.id_alteracao_agendada;
    await new Promise((resolve) => setTimeout(resolve, 3500));
    const applied = await processDueScheduledChanges(pool, new Date());
    const prodAfter = await pool.query('SELECT nome_produto FROM app.tab_produto WHERE id_produto = $1', [produto.id_produto]);
    const schedRow = await pool.query('SELECT status_alteracao, mensagem_erro FROM app.tab_alteracao_agendada WHERE id_alteracao_agendada = $1', [scheduled.id_alteracao_agendada]);
    log(
      'alteracao_agendada_aplicada',
      applied.some((item) => item.status === 'APLICADA') && prodAfter.rows[0]?.nome_produto === 'Produto teste HML V2 agendado',
      `status=${schedRow.rows[0]?.status_alteracao || applied[0]?.status || 'none'} err=${applied[0]?.error || schedRow.rows[0]?.mensagem_erro || ''}`,
    );

    await updateProduto(pool, produto.id_produto, {
      nome: 'Produto teste HML V2 imediato',
      id_categoria: categoria.id_categoria,
      preco_normal: '12,50',
    });
    const prodImm = await pool.query('SELECT nome_produto FROM app.tab_produto WHERE id_produto = $1', [produto.id_produto]);
    log('alteracao_imediata', prodImm.rows[0]?.nome_produto === 'Produto teste HML V2 imediato');

    await recordAudit(pool, {
      id_usuario_admin: firstAdmin.id_usuario_admin,
      acao: 'TESTE_HML_V2',
      entidade: 'SISTEMA',
      sucesso: true,
      descricao_evento: 'TESTE HML V2 operacional concluido',
    });
    log('auditoria_teste', true);

    await cleanup(pool, ids);
    const after = await officialCounts(pool);
    log(
      'contagem_oficial_depois',
      after.categorias === 4 && after.produtos === 8 && after.imagens === 8,
      JSON.stringify(after),
    );
  } catch (error) {
    log('execucao', false, error?.message || String(error));
    try {
      await cleanup(pool, ids);
    } catch {
      // best-effort
    }
  } finally {
    await pool.end();
  }

  const hardFails = results.filter((item) => item.status !== 'PASS' && item.name !== 'signed_upload_url');
  console.log(hardFails.length ? 'FAIL' : 'PASS');
  process.exitCode = hardFails.length ? 1 : 0;
}

main();
