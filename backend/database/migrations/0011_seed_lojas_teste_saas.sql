-- 0011 Seed SaaS: só public (empresa + tema). SQL Editor NÃO escreve em app.*.
-- Query NOVA. Idempotente.
-- Depois: painel admin cria produtos/usuários (role da API tem acesso a app.*).

-- ===== Doce Aurora (verde) =====
INSERT INTO public.tab_empresa (id_empresa, slug, nome_fantasia, ativo)
VALUES ('b1000000-0000-4000-8000-000000000001', 'doce-aurora', 'Doce Aurora', true)
ON CONFLICT (id_empresa) DO UPDATE
  SET slug = EXCLUDED.slug,
      nome_fantasia = EXCLUDED.nome_fantasia,
      ativo = true,
      data_atualizacao = now();

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
  logo_topo_url = EXCLUDED.logo_topo_url,
  logo_favicon_url = EXCLUDED.logo_favicon_url,
  whatsapp_telefone = EXCLUDED.whatsapp_telefone,
  fonte_titulo = EXCLUDED.fonte_titulo,
  fonte_corpo = EXCLUDED.fonte_corpo,
  data_atualizacao = now();

-- ===== Padaria Norte (azul) =====
INSERT INTO public.tab_empresa (id_empresa, slug, nome_fantasia, ativo)
VALUES ('b2000000-0000-4000-8000-000000000002', 'padaria-norte', 'Padaria Norte', true)
ON CONFLICT (id_empresa) DO UPDATE
  SET slug = EXCLUDED.slug,
      nome_fantasia = EXCLUDED.nome_fantasia,
      ativo = true,
      data_atualizacao = now();

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
  logo_topo_url = EXCLUDED.logo_topo_url,
  logo_favicon_url = EXCLUDED.logo_favicon_url,
  whatsapp_telefone = EXCLUDED.whatsapp_telefone,
  fonte_titulo = EXCLUDED.fonte_titulo,
  fonte_corpo = EXCLUDED.fonte_corpo,
  data_atualizacao = now();

-- Conferência (só public)
SELECT e.slug, e.nome_fantasia, e.ativo, t.cor_primaria, t.fonte_titulo
FROM public.tab_empresa e
JOIN public.tab_empresa_tema t ON t.id_empresa = e.id_empresa
ORDER BY e.slug;
