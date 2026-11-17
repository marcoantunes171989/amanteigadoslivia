-- 0011 Seed SaaS: 2 lojas fictícias + produtos + admins (PIN)
-- SQL Editor, query NOVA. Idempotente (UPSERT por UUID fixo).
-- Também faz backfill dos vínculos da empresa padrão.

-- Backfill padrão
INSERT INTO public.tab_usuario_empresa (id_usuario_admin, id_empresa)
SELECT u.id_usuario_admin, 'a0000000-0000-4000-8000-000000000001'
FROM app.tab_usuario_admin u
ON CONFLICT (id_usuario_admin) DO NOTHING;

INSERT INTO public.tab_categoria_empresa (id_categoria, id_empresa)
SELECT c.id_categoria, 'a0000000-0000-4000-8000-000000000001'
FROM app.tab_categoria c
ON CONFLICT (id_categoria) DO NOTHING;

INSERT INTO public.tab_produto_empresa (id_produto, id_empresa)
SELECT p.id_produto, 'a0000000-0000-4000-8000-000000000001'
FROM app.tab_produto p
ON CONFLICT (id_produto) DO NOTHING;

INSERT INTO public.tab_venda_empresa (id_venda, id_empresa)
SELECT v.id_venda, 'a0000000-0000-4000-8000-000000000001'
FROM app.tab_venda v
ON CONFLICT (id_venda) DO NOTHING;

-- ===== Doce Aurora (verde) =====
INSERT INTO public.tab_empresa (id_empresa, slug, nome_fantasia, ativo)
VALUES ('b1000000-0000-4000-8000-000000000001', 'doce-aurora', 'Doce Aurora', true)
ON CONFLICT (id_empresa) DO UPDATE
  SET slug = EXCLUDED.slug, nome_fantasia = EXCLUDED.nome_fantasia, ativo = true, data_atualizacao = now();

INSERT INTO public.tab_empresa_tema (
  id_empresa, nome_exibicao, cor_primaria, cor_primaria_escura, cor_fundo,
  cor_texto, cor_destaque, logo_topo_url, logo_favicon_url, whatsapp_telefone,
  fonte_titulo, fonte_corpo
) VALUES (
  'b1000000-0000-4000-8000-000000000001', 'Doce Aurora',
  '#0f6a5a', '#0b5246', '#f3fbf8', '#1a2e2a', '#e0a100',
  'assets/brand/logo-topo.jpeg', 'assets/brand/logo-topo.jpeg', '5511999001001',
  'Nunito', 'Nunito'
)
ON CONFLICT (id_empresa) DO UPDATE SET
  nome_exibicao = EXCLUDED.nome_exibicao,
  cor_primaria = EXCLUDED.cor_primaria,
  cor_primaria_escura = EXCLUDED.cor_primaria_escura,
  cor_fundo = EXCLUDED.cor_fundo,
  cor_texto = EXCLUDED.cor_texto,
  cor_destaque = EXCLUDED.cor_destaque,
  whatsapp_telefone = EXCLUDED.whatsapp_telefone,
  fonte_titulo = EXCLUDED.fonte_titulo,
  fonte_corpo = EXCLUDED.fonte_corpo,
  data_atualizacao = now();

INSERT INTO app.tab_categoria (id_categoria, nome_categoria, slug_categoria, ordem_exibicao, ativo)
VALUES ('b1000000-0000-4000-8000-000000000021', 'Doces Aurora', 'doces-aurora', 1, true)
ON CONFLICT (id_categoria) DO UPDATE
  SET nome_categoria = EXCLUDED.nome_categoria, slug_categoria = EXCLUDED.slug_categoria, ativo = true, data_atualizacao = now();

INSERT INTO public.tab_categoria_empresa (id_categoria, id_empresa)
VALUES ('b1000000-0000-4000-8000-000000000021', 'b1000000-0000-4000-8000-000000000001')
ON CONFLICT (id_categoria) DO UPDATE SET id_empresa = EXCLUDED.id_empresa;

INSERT INTO app.tab_produto (id_produto, id_categoria, nome_produto, slug_produto, descricao_produto, ativo, destaque, ordem_exibicao)
VALUES
  ('b1000000-0000-4000-8000-000000000031', 'b1000000-0000-4000-8000-000000000021', 'Cookie de Baunilha', 'cookie-baunilha-aurora', 'Produto fictício — Doce Aurora', true, true, 1),
  ('b1000000-0000-4000-8000-000000000032', 'b1000000-0000-4000-8000-000000000021', 'Brownie de Café', 'brownie-cafe-aurora', 'Produto fictício — Doce Aurora', true, false, 2),
  ('b1000000-0000-4000-8000-000000000033', 'b1000000-0000-4000-8000-000000000021', 'Torta Limão', 'torta-limao-aurora', 'Produto fictício — Doce Aurora', true, false, 3)
ON CONFLICT (id_produto) DO UPDATE
  SET id_categoria = EXCLUDED.id_categoria, nome_produto = EXCLUDED.nome_produto, slug_produto = EXCLUDED.slug_produto,
      descricao_produto = EXCLUDED.descricao_produto, ativo = true, destaque = EXCLUDED.destaque,
      ordem_exibicao = EXCLUDED.ordem_exibicao, data_atualizacao = now();

INSERT INTO app.tab_produto_preco (id_preco, id_produto, valor_centavos, codigo_moeda, promocional, ativo)
VALUES
  ('b1000000-0000-4000-8000-000000000041', 'b1000000-0000-4000-8000-000000000031', 1890, 'BRL', false, true),
  ('b1000000-0000-4000-8000-000000000042', 'b1000000-0000-4000-8000-000000000032', 2190, 'BRL', false, true),
  ('b1000000-0000-4000-8000-000000000043', 'b1000000-0000-4000-8000-000000000033', 3290, 'BRL', false, true)
ON CONFLICT (id_preco) DO UPDATE SET valor_centavos = EXCLUDED.valor_centavos, ativo = true;

INSERT INTO public.tab_produto_empresa (id_produto, id_empresa)
VALUES
  ('b1000000-0000-4000-8000-000000000031', 'b1000000-0000-4000-8000-000000000001'),
  ('b1000000-0000-4000-8000-000000000032', 'b1000000-0000-4000-8000-000000000001'),
  ('b1000000-0000-4000-8000-000000000033', 'b1000000-0000-4000-8000-000000000001')
ON CONFLICT (id_produto) DO UPDATE SET id_empresa = EXCLUDED.id_empresa;

-- PIN 2468 (scrypt)
INSERT INTO app.tab_usuario_admin (
  id_usuario_admin, nome_usuario, email_usuario, senha_hash, senha_salt,
  perfil_usuario, ativo, protegido, login_usuario
) VALUES (
  'b1000000-0000-4000-8000-000000000011',
  'Admin Aurora',
  'admin.aurora@teste.local',
  '851519464dc3bb4219ecf18613be19644f39510a122f7c2eb791a1f5a554c3784e4bc78d628c3af7539c57bdb8e3621f319db705cd5cf8d5dfc29dfdd747a35f',
  '7c951053fcbf4c5bb3f59e6152571ac5',
  'ADMIN', true, false, 'admin.aurora'
)
ON CONFLICT (id_usuario_admin) DO UPDATE SET
  nome_usuario = EXCLUDED.nome_usuario,
  email_usuario = EXCLUDED.email_usuario,
  senha_hash = EXCLUDED.senha_hash,
  senha_salt = EXCLUDED.senha_salt,
  perfil_usuario = 'ADMIN',
  ativo = true,
  login_usuario = EXCLUDED.login_usuario,
  data_atualizacao = now();

INSERT INTO public.tab_usuario_empresa (id_usuario_admin, id_empresa)
VALUES ('b1000000-0000-4000-8000-000000000011', 'b1000000-0000-4000-8000-000000000001')
ON CONFLICT (id_usuario_admin) DO UPDATE SET id_empresa = EXCLUDED.id_empresa, data_atualizacao = now();

-- ===== Padaria Norte (azul) =====
INSERT INTO public.tab_empresa (id_empresa, slug, nome_fantasia, ativo)
VALUES ('b2000000-0000-4000-8000-000000000002', 'padaria-norte', 'Padaria Norte', true)
ON CONFLICT (id_empresa) DO UPDATE
  SET slug = EXCLUDED.slug, nome_fantasia = EXCLUDED.nome_fantasia, ativo = true, data_atualizacao = now();

INSERT INTO public.tab_empresa_tema (
  id_empresa, nome_exibicao, cor_primaria, cor_primaria_escura, cor_fundo,
  cor_texto, cor_destaque, logo_topo_url, logo_favicon_url, whatsapp_telefone,
  fonte_titulo, fonte_corpo
) VALUES (
  'b2000000-0000-4000-8000-000000000002', 'Padaria Norte',
  '#1d4ed8', '#1e3a8a', '#f5f8ff', '#1e293b', '#f59e0b',
  'assets/brand/logo-topo.jpeg', 'assets/brand/logo-topo.jpeg', '5511999002002',
  'Nunito', 'Nunito'
)
ON CONFLICT (id_empresa) DO UPDATE SET
  nome_exibicao = EXCLUDED.nome_exibicao,
  cor_primaria = EXCLUDED.cor_primaria,
  cor_primaria_escura = EXCLUDED.cor_primaria_escura,
  cor_fundo = EXCLUDED.cor_fundo,
  cor_texto = EXCLUDED.cor_texto,
  cor_destaque = EXCLUDED.cor_destaque,
  whatsapp_telefone = EXCLUDED.whatsapp_telefone,
  fonte_titulo = EXCLUDED.fonte_titulo,
  fonte_corpo = EXCLUDED.fonte_corpo,
  data_atualizacao = now();

INSERT INTO app.tab_categoria (id_categoria, nome_categoria, slug_categoria, ordem_exibicao, ativo)
VALUES ('b2000000-0000-4000-8000-000000000022', 'Pães Norte', 'paes-norte', 1, true)
ON CONFLICT (id_categoria) DO UPDATE
  SET nome_categoria = EXCLUDED.nome_categoria, slug_categoria = EXCLUDED.slug_categoria, ativo = true, data_atualizacao = now();

INSERT INTO public.tab_categoria_empresa (id_categoria, id_empresa)
VALUES ('b2000000-0000-4000-8000-000000000022', 'b2000000-0000-4000-8000-000000000002')
ON CONFLICT (id_categoria) DO UPDATE SET id_empresa = EXCLUDED.id_empresa;

INSERT INTO app.tab_produto (id_produto, id_categoria, nome_produto, slug_produto, descricao_produto, ativo, destaque, ordem_exibicao)
VALUES
  ('b2000000-0000-4000-8000-000000000034', 'b2000000-0000-4000-8000-000000000022', 'Pão de Queijo', 'pao-queijo-norte', 'Produto fictício — Padaria Norte', true, true, 1),
  ('b2000000-0000-4000-8000-000000000035', 'b2000000-0000-4000-8000-000000000022', 'Croissant Manteiga', 'croissant-norte', 'Produto fictício — Padaria Norte', true, false, 2),
  ('b2000000-0000-4000-8000-000000000036', 'b2000000-0000-4000-8000-000000000022', 'Baguete Tradicional', 'baguete-norte', 'Produto fictício — Padaria Norte', true, false, 3)
ON CONFLICT (id_produto) DO UPDATE
  SET id_categoria = EXCLUDED.id_categoria, nome_produto = EXCLUDED.nome_produto, slug_produto = EXCLUDED.slug_produto,
      descricao_produto = EXCLUDED.descricao_produto, ativo = true, destaque = EXCLUDED.destaque,
      ordem_exibicao = EXCLUDED.ordem_exibicao, data_atualizacao = now();

INSERT INTO app.tab_produto_preco (id_preco, id_produto, valor_centavos, codigo_moeda, promocional, ativo)
VALUES
  ('b2000000-0000-4000-8000-000000000044', 'b2000000-0000-4000-8000-000000000034', 1290, 'BRL', false, true),
  ('b2000000-0000-4000-8000-000000000045', 'b2000000-0000-4000-8000-000000000035', 1590, 'BRL', false, true),
  ('b2000000-0000-4000-8000-000000000046', 'b2000000-0000-4000-8000-000000000036', 990, 'BRL', false, true)
ON CONFLICT (id_preco) DO UPDATE SET valor_centavos = EXCLUDED.valor_centavos, ativo = true;

INSERT INTO public.tab_produto_empresa (id_produto, id_empresa)
VALUES
  ('b2000000-0000-4000-8000-000000000034', 'b2000000-0000-4000-8000-000000000002'),
  ('b2000000-0000-4000-8000-000000000035', 'b2000000-0000-4000-8000-000000000002'),
  ('b2000000-0000-4000-8000-000000000036', 'b2000000-0000-4000-8000-000000000002')
ON CONFLICT (id_produto) DO UPDATE SET id_empresa = EXCLUDED.id_empresa;

-- PIN 1357 (scrypt)
INSERT INTO app.tab_usuario_admin (
  id_usuario_admin, nome_usuario, email_usuario, senha_hash, senha_salt,
  perfil_usuario, ativo, protegido, login_usuario
) VALUES (
  'b2000000-0000-4000-8000-000000000012',
  'Admin Norte',
  'admin.norte@teste.local',
  'fe3a91f3ec549b7f09f29461e74569d7554beab9e61730851a083f59fe0a81e0faeb948d1a7c4b347a7f2b0bb04909bf648fbbe9d82290564e7f633592b3ce35',
  'aa6dc7ad5719ee9e6fed91e26bbcfb64',
  'ADMIN', true, false, 'admin.norte'
)
ON CONFLICT (id_usuario_admin) DO UPDATE SET
  nome_usuario = EXCLUDED.nome_usuario,
  email_usuario = EXCLUDED.email_usuario,
  senha_hash = EXCLUDED.senha_hash,
  senha_salt = EXCLUDED.senha_salt,
  perfil_usuario = 'ADMIN',
  ativo = true,
  login_usuario = EXCLUDED.login_usuario,
  data_atualizacao = now();

INSERT INTO public.tab_usuario_empresa (id_usuario_admin, id_empresa)
VALUES ('b2000000-0000-4000-8000-000000000012', 'b2000000-0000-4000-8000-000000000002')
ON CONFLICT (id_usuario_admin) DO UPDATE SET id_empresa = EXCLUDED.id_empresa, data_atualizacao = now();

-- Conferência
SELECT e.slug, e.nome_fantasia, t.cor_primaria,
  (SELECT count(*) FROM public.tab_produto_empresa pe WHERE pe.id_empresa = e.id_empresa) AS produtos,
  (SELECT count(*) FROM public.tab_usuario_empresa ue WHERE ue.id_empresa = e.id_empresa) AS usuarios
FROM public.tab_empresa e
JOIN public.tab_empresa_tema t ON t.id_empresa = e.id_empresa
ORDER BY e.slug;
