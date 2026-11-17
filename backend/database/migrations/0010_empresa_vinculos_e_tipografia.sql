-- 0010 SaaS: tipografia + vinculos por empresa (public) — SQL Editor
-- Rode em query NOVA. Nao altera schema app.

ALTER TABLE public.tab_empresa_tema
  ADD COLUMN IF NOT EXISTS fonte_titulo text NOT NULL DEFAULT 'Nunito';

ALTER TABLE public.tab_empresa_tema
  ADD COLUMN IF NOT EXISTS fonte_corpo text NOT NULL DEFAULT 'Nunito';

CREATE TABLE IF NOT EXISTS public.tab_usuario_empresa (
  id_usuario_admin uuid PRIMARY KEY,
  id_empresa uuid NOT NULL,
  data_criacao timestamptz NOT NULL DEFAULT now(),
  data_atualizacao timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tab_categoria_empresa (
  id_categoria uuid PRIMARY KEY,
  id_empresa uuid NOT NULL,
  data_criacao timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tab_produto_empresa (
  id_produto uuid PRIMARY KEY,
  id_empresa uuid NOT NULL,
  data_criacao timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tab_venda_empresa (
  id_venda uuid PRIMARY KEY,
  id_empresa uuid NOT NULL,
  data_criacao timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tab_usuario_empresa_empresa_idx
  ON public.tab_usuario_empresa (id_empresa);

CREATE INDEX IF NOT EXISTS tab_categoria_empresa_empresa_idx
  ON public.tab_categoria_empresa (id_empresa);

CREATE INDEX IF NOT EXISTS tab_produto_empresa_empresa_idx
  ON public.tab_produto_empresa (id_empresa);

CREATE INDEX IF NOT EXISTS tab_venda_empresa_empresa_idx
  ON public.tab_venda_empresa (id_empresa);

-- Backfill: tudo existente fica na empresa padrao
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

ALTER TABLE public.tab_usuario_empresa DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tab_categoria_empresa DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tab_produto_empresa DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tab_venda_empresa DISABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tab_usuario_empresa TO amanteigados_prod_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tab_categoria_empresa TO amanteigados_prod_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tab_produto_empresa TO amanteigados_prod_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tab_venda_empresa TO amanteigados_prod_app;
