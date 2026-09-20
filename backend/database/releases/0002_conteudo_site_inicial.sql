-- =============================================================================
-- 0002_conteudo_site_inicial.sql
--
-- Carga inicial do conteudo institucional ATUAL do site em HOMOLOG.
-- NAO e migration estrutural. NAO altera 0001/0002/0003/0004.
-- NAO cria tabela, sequence, trigger ou GRANT.
--
-- Destino:
--   app.tab_configuracao_site
--   app.tab_conteudo_site
--   app.tab_conteudo_imagem
--
-- Identidade esperada: Runtime APP do ambiente (LOGIN real).
-- Idempotencia: INSERT ... ON CONFLICT (PK) DO NOTHING.
-- UUIDs estaveis, explicitos, sem sequence e sem gerador no banco.
-- =============================================================================

\set ON_ERROR_STOP on

\echo '=== RELEASE 0002: conteudo institucional inicial - inicio ==='

BEGIN;

INSERT INTO app.tab_configuracao_site (
  id_configuracao_site, chave_configuracao, valor_texto, ativo
) VALUES
  ('c0f10001-0002-4000-8000-000000000001', 'whatsapp_telefone', '5500000000000', true),
  ('c0f10001-0002-4000-8000-000000000002', 'logo_topo_url', 'assets/logo.jpg', true),
  ('c0f10001-0002-4000-8000-000000000003', 'logo_rodape_url', 'assets/footer-brand.png', true),
  ('c0f10001-0002-4000-8000-000000000004', 'hero_imagem_url', 'assets/hero.jpg', true),
  ('c0f10001-0002-4000-8000-000000000005', 'descubra_imagem_url', 'assets/hero.jpg', true)
ON CONFLICT (id_configuracao_site) DO NOTHING;

INSERT INTO app.tab_conteudo_site (
  id_conteudo_site, secao, tipo_conteudo, titulo, subtitulo, descricao,
  texto_botao, url_destino, ordem_exibicao, ativo
) VALUES
  (
    'c0e10001-0002-4000-8000-000000000001',
    'HOME', 'CHAMADA',
    'Amanteigados feitos para tornar cada momento mais especial.',
    'Amanteigados artesanais',
    'Receitas artesanais preparadas com carinho para presentear, celebrar e compartilhar momentos inesquecíveis.',
    'Conheça o cardápio',
    '/produtos',
    10, true
  ),
  (
    'c0e10001-0002-4000-8000-000000000002',
    'HOME', 'DESTAQUE',
    'Sabores feitos para conquistar no primeiro pedaço.',
    'Descubra nossos amanteigados',
    'Conheça nossas opções e encontre o amanteigado perfeito para presentear, compartilhar ou aproveitar no seu momento.',
    'Conheça o cardápio',
    '/produtos',
    20, true
  ),
  (
    'c0e10001-0002-4000-8000-000000000003',
    'HOME', 'CARD',
    'Encomendas',
    NULL,
    'Presentes e sabores preparados especialmente para surpreender quem você ama.',
    NULL,
    '#encomendas',
    30, true
  ),
  (
    'c0e10001-0002-4000-8000-000000000004',
    'HOME', 'CARD',
    'Festas',
    NULL,
    'Um toque artesanal para deixar cada celebração ainda mais especial.',
    NULL,
    '#festas-momentos',
    40, true
  ),
  (
    'c0e10001-0002-4000-8000-000000000005',
    'HOME', 'CARD',
    'Personalizados',
    NULL,
    'Detalhes únicos pensados para transformar sua ideia em uma lembrança inesquecível.',
    NULL,
    '#personalizados-historia',
    50, true
  ),
  (
    'c0e10001-0002-4000-8000-000000000006',
    'ENCOMENDAS', 'CHAMADA',
    'Encomendas feitas para o seu momento.',
    'Encomendas',
    'Presentes e sabores preparados especialmente para surpreender quem você ama. Conte-nos a ocasião e montamos a encomenda com carinho.',
    'Solicitar encomenda',
    '#form-encomenda',
    10, true
  ),
  (
    'c0e10001-0002-4000-8000-000000000007',
    'ENCOMENDAS', 'GALERIA',
    'Encomendas já realizadas',
    NULL,
    'Alguns dos pedidos que já saíram da nossa cozinha.',
    NULL,
    NULL,
    20, true
  ),
  (
    'c0e10001-0002-4000-8000-000000000008',
    'FESTAS', 'CHAMADA',
    'Um detalhe especial para fazer parte da sua celebração.',
    'Festas e momentos especiais',
    'Aniversários, encontros, lembranças e momentos especiais podem ganhar um toque ainda mais afetivo com amanteigados preparados para a ocasião.',
    'Solicitar para a festa',
    '#form-encomenda',
    10, true
  ),
  (
    'c0e10001-0002-4000-8000-000000000009',
    'FESTAS', 'CARD',
    'Aniversários',
    NULL,
    'Amanteigados para tornar o aniversário ainda mais doce, do jeitinho da ocasião.',
    'Quero para um aniversário',
    'ANIVERSARIO',
    20, true
  ),
  (
    'c0e10001-0002-4000-8000-000000000010',
    'FESTAS', 'CARD',
    'Presentes',
    NULL,
    'Uma caixa especial para presentear com carinho e sabor.',
    'Quero presentear',
    'PRESENTE',
    30, true
  ),
  (
    'c0e10001-0002-4000-8000-000000000011',
    'FESTAS', 'CARD',
    'Celebrações',
    NULL,
    'Um toque artesanal para mesas de celebração e encontros afetivos.',
    'Quero para uma celebração',
    'CELEBRACAO',
    40, true
  ),
  (
    'c0e10001-0002-4000-8000-000000000012',
    'FESTAS', 'CARD',
    'Eventos',
    NULL,
    'Opções pensadas para eventos menores, com apresentação cuidadosa.',
    'Quero para um evento',
    'EVENTO',
    50, true
  ),
  (
    'c0e10001-0002-4000-8000-000000000013',
    'FESTAS', 'CARD',
    'Lembranças',
    NULL,
    'Lembrancinhas e detalhes que prolongam o momento especial.',
    'Quero uma lembrança',
    'LEMBRANCA',
    60, true
  ),
  (
    'c0e10001-0002-4000-8000-000000000014',
    'PERSONALIZADOS', 'CHAMADA',
    'Detalhes pensados para contar a sua história.',
    'Personalizados',
    'Personalizações transformam os amanteigados em lembranças únicas para presentes, celebrações e ocasiões especiais.',
    'Solicitar personalizado',
    '#form-encomenda',
    10, true
  ),
  (
    'c0e10001-0002-4000-8000-000000000015',
    'PERSONALIZADOS', 'GALERIA',
    'Trabalhos já realizados',
    NULL,
    'Alguns personalizados que já preparamos.',
    NULL,
    NULL,
    20, true
  )
ON CONFLICT (id_conteudo_site) DO NOTHING;

INSERT INTO app.tab_conteudo_imagem (
  id_conteudo_imagem, id_conteudo_site, url_imagem, texto_alternativo,
  ordem_exibicao, principal, ativo
) VALUES
  ('c0a10001-0002-4000-8000-000000000001', 'c0e10001-0002-4000-8000-000000000001', 'assets/hero.jpg', 'Prato de biscoitos amanteigados com tulipas e caixa de presente', 0, true, true),
  ('c0a10001-0002-4000-8000-000000000002', 'c0e10001-0002-4000-8000-000000000002', 'assets/hero.jpg', 'Amanteigados variados dispostos em prato', 0, true, true),
  ('c0a10001-0002-4000-8000-000000000003', 'c0e10001-0002-4000-8000-000000000003', 'assets/encomendas.jpg', 'Caixa de amanteigados para encomenda', 0, true, true),
  ('c0a10001-0002-4000-8000-000000000004', 'c0e10001-0002-4000-8000-000000000004', 'assets/festas.jpg', 'Amanteigados servidos em prato para festa', 0, true, true),
  ('c0a10001-0002-4000-8000-000000000005', 'c0e10001-0002-4000-8000-000000000005', 'assets/personalizados.jpg', 'Amanteigados personalizados com letras e mensagens', 0, true, true),
  ('c0a10001-0002-4000-8000-000000000006', 'c0e10001-0002-4000-8000-000000000007', 'assets/encomendas.jpg', 'Encomenda de amanteigados', 0, true, true),
  ('c0a10001-0002-4000-8000-000000000007', 'c0e10001-0002-4000-8000-000000000008', 'assets/festas.jpg', 'Amanteigados servidos em prato para festa', 0, true, true),
  ('c0a10001-0002-4000-8000-000000000008', 'c0e10001-0002-4000-8000-000000000009', 'assets/festas.jpg', 'Aniversário com amanteigados', 0, true, true),
  ('c0a10001-0002-4000-8000-000000000009', 'c0e10001-0002-4000-8000-000000000010', 'assets/encomendas.jpg', 'Presente de amanteigados', 0, true, true),
  ('c0a10001-0002-4000-8000-000000000010', 'c0e10001-0002-4000-8000-000000000011', 'assets/festas.jpg', 'Celebração com amanteigados', 0, true, true),
  ('c0a10001-0002-4000-8000-000000000011', 'c0e10001-0002-4000-8000-000000000012', 'assets/hero.jpg', 'Evento com amanteigados', 0, true, true),
  ('c0a10001-0002-4000-8000-000000000012', 'c0e10001-0002-4000-8000-000000000013', 'assets/personalizados.jpg', 'Lembrança de amanteigados', 0, true, true),
  ('c0a10001-0002-4000-8000-000000000013', 'c0e10001-0002-4000-8000-000000000014', 'assets/personalizados.jpg', 'Amanteigados personalizados com letras e mensagens', 0, true, true),
  ('c0a10001-0002-4000-8000-000000000014', 'c0e10001-0002-4000-8000-000000000015', 'assets/personalizados.jpg', 'Trabalhos personalizados', 0, true, true)
ON CONFLICT (id_conteudo_imagem) DO NOTHING;

COMMIT;

\echo '=== RELEASE 0002: conteudo institucional inicial - concluido ==='
