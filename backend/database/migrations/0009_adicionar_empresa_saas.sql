-- 0009 SaaS empresa (public) — SQL Editor Supabase
-- Rode SOMENTE este arquivo (cole em query NOVA, limpa).
-- Sem schema app (SQL Editor nega CREATE em app).

CREATE TABLE IF NOT EXISTS public.tab_empresa (
  id_empresa uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  nome_fantasia text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  data_criacao timestamptz NOT NULL DEFAULT now(),
  data_atualizacao timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tab_empresa_tema (
  id_empresa uuid PRIMARY KEY,
  nome_exibicao text NOT NULL,
  cor_primaria text NOT NULL DEFAULT '#800020',
  cor_primaria_escura text NOT NULL DEFAULT '#650019',
  cor_fundo text NOT NULL DEFAULT '#fff8f1',
  cor_texto text NOT NULL DEFAULT '#2d2020',
  cor_destaque text NOT NULL DEFAULT '#d8a44d',
  logo_topo_url text NOT NULL DEFAULT 'assets/brand/logo-topo.jpeg',
  logo_favicon_url text NOT NULL DEFAULT 'assets/brand/logo-topo.jpeg',
  whatsapp_telefone text NOT NULL DEFAULT '5518981465499',
  data_criacao timestamptz NOT NULL DEFAULT now(),
  data_atualizacao timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.tab_empresa (id_empresa, slug, nome_fantasia, ativo)
VALUES (
  'a0000000-0000-4000-8000-000000000001',
  'amanteigados-livia',
  'Amanteigados Lívia',
  true
)
ON CONFLICT (id_empresa) DO NOTHING;

INSERT INTO public.tab_empresa_tema (
  id_empresa,
  nome_exibicao,
  cor_primaria,
  cor_primaria_escura,
  cor_fundo,
  cor_texto,
  cor_destaque,
  logo_topo_url,
  logo_favicon_url,
  whatsapp_telefone
)
VALUES (
  'a0000000-0000-4000-8000-000000000001',
  'Amanteigados Lívia',
  '#800020',
  '#650019',
  '#fff8f1',
  '#2d2020',
  '#d8a44d',
  'assets/brand/logo-topo.jpeg',
  'assets/brand/logo-topo.jpeg',
  '5518981465499'
)
ON CONFLICT (id_empresa) DO NOTHING;

ALTER TABLE public.tab_pedido_numero
  ADD COLUMN IF NOT EXISTS id_empresa uuid;

UPDATE public.tab_pedido_numero
SET id_empresa = 'a0000000-0000-4000-8000-000000000001'
WHERE id_empresa IS NULL;

CREATE INDEX IF NOT EXISTS tab_empresa_slug_idx
  ON public.tab_empresa (slug);

CREATE INDEX IF NOT EXISTS tab_pedido_numero_empresa_idx
  ON public.tab_pedido_numero (id_empresa);

ALTER TABLE public.tab_empresa DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tab_empresa_tema DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tab_empresa TO amanteigados_prod_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tab_empresa_tema TO amanteigados_prod_app;
