-- =============================================================================
-- 0009_adicionar_empresa_saas.sql
-- Fundação SaaS multi-estabelecimento (ADDITIVE ONLY) — SQL Editor Supabase.
--
-- Motivo de public.*: o SQL Editor não tem CREATE/ALTER no schema app (42501).
-- Mesmo padrão de 0008 (tab_pedido_numero em public).
--
-- Este script:
--   - Cria public.tab_empresa e public.tab_empresa_tema
--   - Seed da empresa padrão Amanteigados Lívia
--   - ADD id_empresa em public.tab_pedido_numero (se a tabela existir)
--   - GRANTs para o role APP (quando existir)
--
-- Sem DROP, sem NOT NULL, sem ALTER em app.* (isso exige Migrator/Owner).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.tab_empresa (
  id_empresa uuid PRIMARY KEY,
  slug text NOT NULL,
  nome_fantasia text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  data_criacao timestamptz NOT NULL DEFAULT now(),
  data_atualizacao timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tab_empresa_slug_chk CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT tab_empresa_slug_uq UNIQUE (slug)
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
  data_atualizacao timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tab_empresa_tema_cor_primaria_chk CHECK (cor_primaria ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT tab_empresa_tema_cor_escura_chk CHECK (cor_primaria_escura ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT tab_empresa_tema_cor_fundo_chk CHECK (cor_fundo ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT tab_empresa_tema_cor_texto_chk CHECK (cor_texto ~ '^#[0-9A-Fa-f]{6}$'),
  CONSTRAINT tab_empresa_tema_cor_destaque_chk CHECK (cor_destaque ~ '^#[0-9A-Fa-f]{6}$')
);

-- Sem FK REFERENCES (SQL Editor costuma negar). Integridade via app.

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

CREATE INDEX IF NOT EXISTS tab_empresa_slug_idx ON public.tab_empresa (slug);
CREATE INDEX IF NOT EXISTS tab_pedido_numero_empresa_idx ON public.tab_pedido_numero (id_empresa);

ALTER TABLE public.tab_empresa DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tab_empresa_tema DISABLE ROW LEVEL SECURITY;

-- GRANTs para roles APP conhecidos (ignora se o role não existir)
DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY[
    'amanteigados_prod_app',
    'amanteigados_hml_app',
    'amanteigados_dev_app'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tab_empresa TO %I', role_name);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tab_empresa_tema TO %I', role_name);
    END IF;
  END LOOP;
END
$$;
