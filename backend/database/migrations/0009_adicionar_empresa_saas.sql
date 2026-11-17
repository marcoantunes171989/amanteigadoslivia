-- =============================================================================
-- 0009_adicionar_empresa_saas.sql
-- Fundação SaaS multi-estabelecimento (ADDITIVE ONLY).
--
-- - Cria app.tab_empresa e app.tab_empresa_tema
-- - Seed da empresa padrão Amanteigados Lívia (slug amanteigados-livia)
-- - Adiciona id_empresa NULLABLE nas tabelas raiz
-- - Backfill id_empresa = empresa padrão onde NULL
--
-- Sem DROP, sem NOT NULL, sem reescrita de dados de negócio.
-- Pode ser executada no SQL Editor (Owner) ou pelo fluxo Migrator.
-- =============================================================================

-- Empresa
CREATE TABLE IF NOT EXISTS app.tab_empresa (
  id_empresa uuid PRIMARY KEY,
  slug text NOT NULL,
  nome_fantasia text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  data_criacao timestamptz NOT NULL DEFAULT now(),
  data_atualizacao timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tab_empresa_slug_chk CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT tab_empresa_slug_uq UNIQUE (slug)
);

-- Tema / branding por empresa
CREATE TABLE IF NOT EXISTS app.tab_empresa_tema (
  id_empresa uuid PRIMARY KEY REFERENCES app.tab_empresa (id_empresa) ON DELETE CASCADE,
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

-- Seed empresa padrão (idempotente)
INSERT INTO app.tab_empresa (id_empresa, slug, nome_fantasia, ativo)
VALUES (
  'a0000000-0000-4000-8000-000000000001',
  'amanteigados-livia',
  'Amanteigados Lívia',
  true
)
ON CONFLICT (id_empresa) DO NOTHING;

INSERT INTO app.tab_empresa_tema (
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

-- Colunas nullable id_empresa (ADDITIVE)
ALTER TABLE app.tab_usuario_admin
  ADD COLUMN IF NOT EXISTS id_empresa uuid REFERENCES app.tab_empresa (id_empresa);

ALTER TABLE app.tab_categoria
  ADD COLUMN IF NOT EXISTS id_empresa uuid REFERENCES app.tab_empresa (id_empresa);

ALTER TABLE app.tab_produto
  ADD COLUMN IF NOT EXISTS id_empresa uuid REFERENCES app.tab_empresa (id_empresa);

ALTER TABLE app.tab_venda
  ADD COLUMN IF NOT EXISTS id_empresa uuid REFERENCES app.tab_empresa (id_empresa);

ALTER TABLE app.tab_configuracao_site
  ADD COLUMN IF NOT EXISTS id_empresa uuid REFERENCES app.tab_empresa (id_empresa);

ALTER TABLE app.tab_conteudo_site
  ADD COLUMN IF NOT EXISTS id_empresa uuid REFERENCES app.tab_empresa (id_empresa);

ALTER TABLE app.tab_solicitacao_encomenda
  ADD COLUMN IF NOT EXISTS id_empresa uuid REFERENCES app.tab_empresa (id_empresa);

ALTER TABLE public.tab_pedido_numero
  ADD COLUMN IF NOT EXISTS id_empresa uuid;

-- Backfill somente NULL -> empresa padrão (não altera demais campos)
UPDATE app.tab_usuario_admin
SET id_empresa = 'a0000000-0000-4000-8000-000000000001'
WHERE id_empresa IS NULL;

UPDATE app.tab_categoria
SET id_empresa = 'a0000000-0000-4000-8000-000000000001'
WHERE id_empresa IS NULL;

UPDATE app.tab_produto
SET id_empresa = 'a0000000-0000-4000-8000-000000000001'
WHERE id_empresa IS NULL;

UPDATE app.tab_venda
SET id_empresa = 'a0000000-0000-4000-8000-000000000001'
WHERE id_empresa IS NULL;

UPDATE app.tab_configuracao_site
SET id_empresa = 'a0000000-0000-4000-8000-000000000001'
WHERE id_empresa IS NULL;

UPDATE app.tab_conteudo_site
SET id_empresa = 'a0000000-0000-4000-8000-000000000001'
WHERE id_empresa IS NULL;

UPDATE app.tab_solicitacao_encomenda
SET id_empresa = 'a0000000-0000-4000-8000-000000000001'
WHERE id_empresa IS NULL;

UPDATE public.tab_pedido_numero
SET id_empresa = 'a0000000-0000-4000-8000-000000000001'
WHERE id_empresa IS NULL;

CREATE INDEX IF NOT EXISTS tab_usuario_admin_empresa_idx ON app.tab_usuario_admin (id_empresa);
CREATE INDEX IF NOT EXISTS tab_categoria_empresa_idx ON app.tab_categoria (id_empresa);
CREATE INDEX IF NOT EXISTS tab_produto_empresa_idx ON app.tab_produto (id_empresa);
CREATE INDEX IF NOT EXISTS tab_venda_empresa_idx ON app.tab_venda (id_empresa);
CREATE INDEX IF NOT EXISTS tab_configuracao_site_empresa_idx ON app.tab_configuracao_site (id_empresa);
CREATE INDEX IF NOT EXISTS tab_conteudo_site_empresa_idx ON app.tab_conteudo_site (id_empresa);
CREATE INDEX IF NOT EXISTS tab_solicitacao_encomenda_empresa_idx ON app.tab_solicitacao_encomenda (id_empresa);
CREATE INDEX IF NOT EXISTS tab_pedido_numero_empresa_idx ON public.tab_pedido_numero (id_empresa);
