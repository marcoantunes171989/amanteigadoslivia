-- =============================================================================
-- 0009b_empresa_id_em_app_DRAFT.sql (OPCIONAL — Migrator/Owner)
--
-- NÃO rodar no SQL Editor do Supabase (schema app = 42501).
-- Só quando houver sessão Migrator/Owner com privilégio em app.*.
--
-- Adiciona id_empresa nullable nas tabelas app e faz backfill da empresa padrão.
-- =============================================================================

ALTER TABLE app.tab_usuario_admin
  ADD COLUMN IF NOT EXISTS id_empresa uuid;

ALTER TABLE app.tab_categoria
  ADD COLUMN IF NOT EXISTS id_empresa uuid;

ALTER TABLE app.tab_produto
  ADD COLUMN IF NOT EXISTS id_empresa uuid;

ALTER TABLE app.tab_venda
  ADD COLUMN IF NOT EXISTS id_empresa uuid;

ALTER TABLE app.tab_configuracao_site
  ADD COLUMN IF NOT EXISTS id_empresa uuid;

ALTER TABLE app.tab_conteudo_site
  ADD COLUMN IF NOT EXISTS id_empresa uuid;

ALTER TABLE app.tab_solicitacao_encomenda
  ADD COLUMN IF NOT EXISTS id_empresa uuid;

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

CREATE INDEX IF NOT EXISTS tab_usuario_admin_empresa_idx ON app.tab_usuario_admin (id_empresa);
CREATE INDEX IF NOT EXISTS tab_categoria_empresa_idx ON app.tab_categoria (id_empresa);
CREATE INDEX IF NOT EXISTS tab_produto_empresa_idx ON app.tab_produto (id_empresa);
CREATE INDEX IF NOT EXISTS tab_venda_empresa_idx ON app.tab_venda (id_empresa);
CREATE INDEX IF NOT EXISTS tab_configuracao_site_empresa_idx ON app.tab_configuracao_site (id_empresa);
CREATE INDEX IF NOT EXISTS tab_conteudo_site_empresa_idx ON app.tab_conteudo_site (id_empresa);
CREATE INDEX IF NOT EXISTS tab_solicitacao_encomenda_empresa_idx ON app.tab_solicitacao_encomenda (id_empresa);
