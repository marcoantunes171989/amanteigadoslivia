\set ON_ERROR_STOP on

\echo === HML AUDIT DETALHADO + LIMPEZA NOMES EXATOS DE TESTE ===
SELECT current_database() AS db, session_user, current_user;

BEGIN;
SET ROLE amanteigados_homolog_owner;

\echo --- tabelas fisicas no schema app ---
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'app'
ORDER BY table_name;

SELECT schemaname, tablename
FROM pg_catalog.pg_tables
WHERE schemaname = 'app'
ORDER BY tablename;

\echo --- ledger ---
SELECT migration_id, left(checksum_sha256, 12) AS checksum_prefix, applied_by_login, applied_as_role, database_name
FROM app.schema_migrations
ORDER BY applied_at;

\echo --- categorias ---
SELECT id_categoria, nome_categoria, ativo, data_atualizacao
FROM app.tab_categoria
ORDER BY nome_categoria;

\echo --- produtos com contagem de imagem/preco ---
SELECT
  p.id_produto,
  p.nome_produto,
  p.ativo,
  c.nome_categoria,
  c.ativo AS categoria_ativa,
  (SELECT count(*) FROM app.tab_produto_imagem i WHERE i.id_produto = p.id_produto) AS imagens,
  (SELECT count(*) FROM app.tab_produto_preco pr WHERE pr.id_produto = p.id_produto) AS precos
FROM app.tab_produto p
JOIN app.tab_categoria c ON c.id_categoria = p.id_categoria
ORDER BY c.nome_categoria, p.nome_produto;

\echo --- totais ---
SELECT
  (SELECT count(*) FROM app.tab_categoria WHERE ativo = true AND nome_categoria IS DISTINCT FROM 'TESTE HOMOLOG ADMIN') AS cat_oficiais_ativas,
  (SELECT count(*) FROM app.tab_produto WHERE ativo = true AND nome_produto IS DISTINCT FROM 'Produto teste homolog admin') AS prod_oficiais_ativos,
  (SELECT count(*) FROM app.tab_produto_imagem i
     JOIN app.tab_produto p ON p.id_produto = i.id_produto
     WHERE p.nome_produto IS DISTINCT FROM 'Produto teste homolog admin') AS imagens_oficiais,
  (SELECT count(*) FROM app.tab_produto_preco pr
     JOIN app.tab_produto p ON p.id_produto = pr.id_produto
     WHERE p.nome_produto IS DISTINCT FROM 'Produto teste homolog admin') AS precos_oficiais,
  (SELECT count(*) FROM app.tab_categoria WHERE nome_categoria = 'TESTE HOMOLOG ADMIN') AS cat_teste,
  (SELECT count(*) FROM app.tab_produto WHERE nome_produto = 'Produto teste homolog admin') AS prod_teste,
  (SELECT count(*) FROM app.tab_produto_imagem i
     JOIN app.tab_produto p ON p.id_produto = i.id_produto
     WHERE p.nome_produto = 'Produto teste homolog admin') AS imagens_teste,
  (SELECT count(*) FROM app.tab_produto_preco pr
     JOIN app.tab_produto p ON p.id_produto = pr.id_produto
     WHERE p.nome_produto = 'Produto teste homolog admin') AS precos_teste;

SELECT
  ((SELECT count(*) FROM app.tab_categoria WHERE nome_categoria = 'TESTE HOMOLOG ADMIN') = 1) AS cat_teste_ok,
  ((SELECT count(*) FROM app.tab_produto p
      JOIN app.tab_categoria c ON c.id_categoria = p.id_categoria
      WHERE p.nome_produto = 'Produto teste homolog admin'
        AND c.nome_categoria = 'TESTE HOMOLOG ADMIN') = 1) AS prod_teste_ok,
  ((SELECT count(*) FROM app.tab_categoria WHERE ativo = true AND nome_categoria IS DISTINCT FROM 'TESTE HOMOLOG ADMIN') = 4) AS cat_oficiais_ok,
  ((SELECT count(*) FROM app.tab_produto WHERE ativo = true AND nome_produto IS DISTINCT FROM 'Produto teste homolog admin') = 8) AS prod_oficiais_ok
\gset chk_

\if :chk_cat_teste_ok
\else
  \echo 'Categoria de teste nao identificada com seguranca. Nenhuma exclusao sera feita.'
  RESET ROLE;
  ROLLBACK;
  \echo '=== LIMPEZA NAO APLICADA ==='
  \quit
\endif
\if :chk_prod_teste_ok
\else
  \echo 'Produto de teste nao identificado com seguranca. Nenhuma exclusao sera feita.'
  RESET ROLE;
  ROLLBACK;
  \echo '=== LIMPEZA NAO APLICADA ==='
  \quit
\endif
\if :chk_cat_oficiais_ok
\else
  \echo 'Contagem de categorias oficiais ativas diverge de 4. Abortando limpeza.'
  RESET ROLE;
  ROLLBACK;
  \echo '=== LIMPEZA NAO APLICADA ==='
  \quit
\endif
\if :chk_prod_oficiais_ok
\else
  \echo 'Contagem de produtos oficiais ativos diverge de 8. Abortando limpeza.'
  RESET ROLE;
  ROLLBACK;
  \echo '=== LIMPEZA NAO APLICADA ==='
  \quit
\endif

\echo 'Residuos identificados pelo nome exato do teste HML. Removendo somente esses registros e dependentes.'

DELETE FROM app.tab_produto_imagem
WHERE id_produto IN (
  SELECT id_produto FROM app.tab_produto
  WHERE nome_produto = 'Produto teste homolog admin'
);

DELETE FROM app.tab_produto_preco
WHERE id_produto IN (
  SELECT id_produto FROM app.tab_produto
  WHERE nome_produto = 'Produto teste homolog admin'
);

DELETE FROM app.tab_produto
WHERE nome_produto = 'Produto teste homolog admin';

DELETE FROM app.tab_categoria
WHERE nome_categoria = 'TESTE HOMOLOG ADMIN';

SELECT
  (SELECT count(*) FROM app.tab_categoria WHERE ativo = true) AS categorias_ativas,
  (SELECT count(*) FROM app.tab_produto WHERE ativo = true) AS produtos_ativos,
  (SELECT count(*) FROM app.tab_produto_imagem) AS imagens_total,
  (SELECT count(*) FROM app.tab_produto_preco) AS precos_total,
  (SELECT count(*) FROM app.tab_categoria WHERE nome_categoria = 'TESTE HOMOLOG ADMIN') AS cat_teste_restante,
  (SELECT count(*) FROM app.tab_produto WHERE nome_produto = 'Produto teste homolog admin') AS prod_teste_restante;

RESET ROLE;
COMMIT;

\echo === LIMPEZA CONCLUIDA ===
