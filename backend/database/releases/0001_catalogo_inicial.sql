-- =============================================================================
-- 0001_catalogo_inicial.sql
--
-- Release de CARGA INICIAL do catalogo para HOMOLOG.
-- NAO e migration estrutural. NAO altera 0001 nem 0002.
-- NAO cria tabela, sequence, trigger ou GRANT.
--
-- Fonte: catalog-demo-data.js (cardapio demonstrativo atual).
-- Destino: app.tab_categoria, app.tab_produto, app.tab_produto_imagem,
--          app.tab_produto_preco.
--
-- Identidade esperada: Runtime APP do ambiente (LOGIN real), porque esta
-- carga e DML de negocio. Nunca usar postgres / Owner / Migrator / service_role
-- como runtime da aplicacao; aqui o APP e o executor autorizado do INSERT.
--
-- Idempotencia: INSERT ... ON CONFLICT (PK) DO NOTHING.
-- UUIDs estaveis, explicitos, sem sequence e sem gerador no banco.
-- =============================================================================

\set ON_ERROR_STOP on

\echo '=== RELEASE 0001: catalogo inicial - inicio ==='

BEGIN;

INSERT INTO app.tab_categoria (
  id_categoria,
  nome_categoria,
  slug_categoria,
  descricao_categoria,
  ordem_exibicao,
  ativo
) VALUES
  ('0c1a5510-c1a5-4000-8000-000000000001', 'Clássicos', 'classicos', NULL, 10, true),
  ('0c1a5510-c1a5-4000-8000-000000000002', 'Especiais', 'especiais', NULL, 20, true),
  ('0c1a5510-c1a5-4000-8000-000000000003', 'Presentes', 'presentes', NULL, 30, true),
  ('0c1a5510-c1a5-4000-8000-000000000004', 'Personalizados', 'personalizados', NULL, 40, true)
ON CONFLICT (id_categoria) DO NOTHING;

INSERT INTO app.tab_produto (
  id_produto,
  id_categoria,
  nome_produto,
  slug_produto,
  descricao_produto,
  ativo,
  destaque,
  ordem_exibicao
) VALUES
  (
    '0f00d070-0001-4000-8000-000000000001',
    '0c1a5510-c1a5-4000-8000-000000000001',
    'Amanteigado Tradicional',
    'tradicional',
    'Uma opção demonstrativa do nosso cardápio, criada para apresentar como informações de sabor, embalagem e quantidade aparecem na experiência digital.',
    true,
    true,
    10
  ),
  (
    '0f00d070-0001-4000-8000-000000000002',
    '0c1a5510-c1a5-4000-8000-000000000001',
    'Amanteigado com Goiabada',
    'goiabada',
    'Produto demonstrativo desenvolvido para apresentar a navegação, os detalhes e a organização visual do futuro catálogo da marca.',
    true,
    true,
    20
  ),
  (
    '0f00d070-0001-4000-8000-000000000003',
    '0c1a5510-c1a5-4000-8000-000000000001',
    'Amanteigado de Chocolate',
    'chocolate',
    'Exemplo visual utilizado exclusivamente para demonstrar como diferentes sabores podem ser apresentados no Cardápio Digital.',
    true,
    false,
    30
  ),
  (
    '0f00d070-0001-4000-8000-000000000004',
    '0c1a5510-c1a5-4000-8000-000000000001',
    'Amanteigado de Limão',
    'limao',
    'Produto demonstrativo sem vínculo com o catálogo comercial definitivo, utilizado para validar busca, filtros e apresentação.',
    true,
    false,
    40
  ),
  (
    '0f00d070-0001-4000-8000-000000000005',
    '0c1a5510-c1a5-4000-8000-000000000002',
    'Amanteigado de Coco',
    'coco',
    'Exemplo fictício utilizado somente na demonstração visual e funcional do frontend.',
    true,
    false,
    50
  ),
  (
    '0f00d070-0001-4000-8000-000000000006',
    '0c1a5510-c1a5-4000-8000-000000000002',
    'Amanteigado Mesclado',
    'mesclado',
    'Esta opção fictícia permite demonstrar visualmente preço-base, preço promocional, total por quantidade e ordenação por preço efetivo.',
    true,
    true,
    60
  ),
  (
    '0f00d070-0001-4000-8000-000000000007',
    '0c1a5510-c1a5-4000-8000-000000000003',
    'Caixa Presenteável',
    'presenteavel',
    'Exemplo ilustrativo de uma opção presenteável para validar unidades diferentes, cards sem peso e apresentação de detalhes.',
    true,
    true,
    70
  ),
  (
    '0f00d070-0001-4000-8000-000000000008',
    '0c1a5510-c1a5-4000-8000-000000000004',
    'Amanteigados Personalizados',
    'personalizados',
    'Produto fictício utilizado para apresentar como personalização, quantidade e informações adicionais poderão aparecer no futuro catálogo real.',
    true,
    false,
    80
  )
ON CONFLICT (id_produto) DO NOTHING;

INSERT INTO app.tab_produto_imagem (
  id_imagem,
  id_produto,
  url_imagem,
  texto_alternativo,
  ordem_exibicao,
  principal
) VALUES
  ('1f1a9e10-0001-4000-8000-000000000001', '0f00d070-0001-4000-8000-000000000001', 'assets/demo-products/tradicional.svg', 'Amanteigado Tradicional', 0, true),
  ('1f1a9e10-0001-4000-8000-000000000002', '0f00d070-0001-4000-8000-000000000002', 'assets/demo-products/goiabada.svg', 'Amanteigado com Goiabada', 0, true),
  ('1f1a9e10-0001-4000-8000-000000000003', '0f00d070-0001-4000-8000-000000000003', 'assets/demo-products/chocolate.svg', 'Amanteigado de Chocolate', 0, true),
  ('1f1a9e10-0001-4000-8000-000000000004', '0f00d070-0001-4000-8000-000000000004', 'assets/demo-products/limao.svg', 'Amanteigado de Limão', 0, true),
  ('1f1a9e10-0001-4000-8000-000000000005', '0f00d070-0001-4000-8000-000000000005', 'assets/demo-products/coco.svg', 'Amanteigado de Coco', 0, true),
  ('1f1a9e10-0001-4000-8000-000000000006', '0f00d070-0001-4000-8000-000000000006', 'assets/demo-products/mesclado.svg', 'Amanteigado Mesclado', 0, true),
  ('1f1a9e10-0001-4000-8000-000000000007', '0f00d070-0001-4000-8000-000000000007', 'assets/demo-products/presenteavel.svg', 'Caixa Presenteável', 0, true),
  ('1f1a9e10-0001-4000-8000-000000000008', '0f00d070-0001-4000-8000-000000000008', 'assets/demo-products/personalizados.svg', 'Amanteigados Personalizados', 0, true)
ON CONFLICT (id_imagem) DO NOTHING;

INSERT INTO app.tab_produto_preco (
  id_preco,
  id_produto,
  valor_centavos,
  codigo_moeda,
  promocional,
  inicio_vigencia,
  fim_vigencia,
  ativo
) VALUES
  ('9f1ce010-0001-4000-8000-000000000001', '0f00d070-0001-4000-8000-000000000001', 1990, 'BRL', false, NULL, NULL, true),
  ('9f1ce010-0001-4000-8000-000000000002', '0f00d070-0001-4000-8000-000000000002', 2290, 'BRL', false, NULL, NULL, true),
  ('9f1ce010-0001-4000-8000-000000000003', '0f00d070-0001-4000-8000-000000000003', 2290, 'BRL', false, NULL, NULL, true),
  ('9f1ce010-0001-4000-8000-000000000004', '0f00d070-0001-4000-8000-000000000004', 2190, 'BRL', false, NULL, NULL, true),
  ('9f1ce010-0001-4000-8000-000000000005', '0f00d070-0001-4000-8000-000000000005', 2390, 'BRL', false, NULL, NULL, true),
  ('9f1ce010-0001-4000-8000-000000000006', '0f00d070-0001-4000-8000-000000000006', 2490, 'BRL', false, NULL, NULL, true),
  ('9f1ce010-0001-4000-8000-000000000009', '0f00d070-0001-4000-8000-000000000006', 2190, 'BRL', true, NULL, NULL, true),
  ('9f1ce010-0001-4000-8000-000000000007', '0f00d070-0001-4000-8000-000000000007', 3990, 'BRL', false, NULL, NULL, true),
  ('9f1ce010-0001-4000-8000-000000000008', '0f00d070-0001-4000-8000-000000000008', 3490, 'BRL', false, NULL, NULL, true)
ON CONFLICT (id_preco) DO NOTHING;

COMMIT;

\echo '=== RELEASE 0001: catalogo inicial - concluido ==='
\echo 'Contagens esperadas: 4 categorias, 8 produtos, 8 imagens, 9 precos.'
