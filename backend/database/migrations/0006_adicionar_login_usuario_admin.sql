-- =============================================================================
-- 0006_adicionar_login_usuario_admin.sql
--
-- Adiciona o USUARIO DE LOGIN em app.tab_usuario_admin.
--   coluna login_usuario text NULL
--   constraint ck_tab_usuario_admin_login (formato normalizado)
--   indice unico case-insensitive tab_usuario_admin_login_unq
--
-- Depende obrigatoriamente de:
--   0005_criar_super_admin_protegido (registro no ledger)
--
-- STATUS: PREPARADA, NAO EXECUTADA. Requer autorizacao explicita (ver relatorio
-- do microgate "login administrativo por usuario").
--
-- Decisoes:
--   - NAO faz backfill. Usuarios existentes (inclusive o SUPER_ADMIN de DEV)
--     ficam com login_usuario NULL. Nenhum username e inventado aqui.
--   - NAO aplica NOT NULL. Torna-lo obrigatorio exige backfill concluido e
--     autorizado em migration posterior (forward-fix, sem editar esta).
--   - Login NULL nao autentica: a aplicacao procura por login_usuario normalizado.
--   - E-mail permanece como dado cadastral com seu indice unico atual
--     (tab_usuario_admin_email_unq). Nao e removido.
--   - Normalizacao (aplicacao e constraint): minusculas, 3 a 32 caracteres,
--     apenas a-z, 0-9, '.', '_' e '-'. Ver backend/src/admin-users.js.
--
-- Variaveis psql obrigatorias (passadas via -v, nenhum valor default aqui):
--   target_database   -> nome do database alvo
--   owner_role        -> role Owner do schema app no ambiente
--   migrator_role     -> role Migrator do ambiente (deve ser a sessao atual)
--   app_role          -> role Runtime APP do ambiente
--   migration_sha256  -> SHA256 do arquivo, calculado FORA do SQL
--
-- Mesmo padrao de 0005: validacoes via SQL top-level + \gset + \if; blocos DO
-- servem apenas para abortar a transacao com mensagem estatica.
-- Requisito minimo: PostgreSQL >= 16.
-- =============================================================================

\set ON_ERROR_STOP on

\if :{?target_database}
\else
  \echo 'ERRO [0006]: variavel psql "target_database" ausente. Nenhum ALTER sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: target_database. Migration 0006 abortada.';
  END;
  $missing_var$;
\endif
\if :{?owner_role}
\else
  \echo 'ERRO [0006]: variavel psql "owner_role" ausente. Nenhum ALTER sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: owner_role. Migration 0006 abortada.';
  END;
  $missing_var$;
\endif
\if :{?migrator_role}
\else
  \echo 'ERRO [0006]: variavel psql "migrator_role" ausente. Nenhum ALTER sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: migrator_role. Migration 0006 abortada.';
  END;
  $missing_var$;
\endif
\if :{?app_role}
\else
  \echo 'ERRO [0006]: variavel psql "app_role" ausente. Nenhum ALTER sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: app_role. Migration 0006 abortada.';
  END;
  $missing_var$;
\endif
\if :{?migration_sha256}
\else
  \echo 'ERRO [0006]: variavel psql "migration_sha256" ausente. Use -v migration_sha256=<sha256 hex 64>.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: migration_sha256. Migration 0006 abortada.';
  END;
  $missing_var$;
\endif

SELECT (:'migration_sha256' ~ '^[0-9a-fA-F]{64}$') AS sha256_format_ok
\gset preSha_

\if :preSha_sha256_format_ok
\else
  \echo 'ERRO [0006]: migration_sha256 nao possui formato SHA256 (64 caracteres hexadecimais).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migration_sha256 nao possui formato SHA256';
  END;
  $fail$;
\endif

\echo '=== 0006: LOGIN DE USUARIO ADMIN - inicio ==='
\echo 'Este script deve ser executado autenticado como migrator_role.'

BEGIN;

-- ---------------------------------------------------------------------------
-- PRECONDICOES (antes de SET ROLE / ALTER)
-- ---------------------------------------------------------------------------

SELECT
  (current_setting('server_version_num')::int >= 160000) AS pg16_ok,
  (current_database() IS NOT DISTINCT FROM :'target_database') AS db_ok,
  (session_user IS NOT DISTINCT FROM :'migrator_role')          AS session_is_migrator,
  (current_user IS NOT DISTINCT FROM :'migrator_role')          AS current_is_migrator,
  pg_has_role(current_user, :'owner_role', 'SET')                AS can_set_owner,
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'tab_usuario_admin' AND column_name = 'login_usuario'
  )                                                              AS login_column_absent
\gset pre0_

\if :pre0_pg16_ok
\else
  \echo 'ERRO [0006]: PostgreSQL < 16.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Precondicao falhou: PostgreSQL >= 16'; END; $fail$;
\endif
\if :pre0_db_ok
\else
  \echo 'ERRO [0006]: database diverge de target_database.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Precondicao falhou: database alvo divergente'; END; $fail$;
\endif
\if :pre0_session_is_migrator
\else
  \echo 'ERRO [0006]: sessao nao autenticada como migrator_role.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Precondicao falhou: sessao nao e migrator_role'; END; $fail$;
\endif
\if :pre0_current_is_migrator
\else
  \echo 'ERRO [0006]: current_user nao e migrator_role.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Precondicao falhou: current_user nao e migrator_role'; END; $fail$;
\endif
\if :pre0_can_set_owner
\else
  \echo 'ERRO [0006]: migrator_role nao pode assumir owner_role.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Precondicao falhou: sem SET para owner_role'; END; $fail$;
\endif
\if :pre0_login_column_absent
\else
  \echo 'ERRO [0006]: coluna login_usuario ja existe. Migration nao reexecutavel.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Precondicao falhou: login_usuario ja existe'; END; $fail$;
\endif

SET ROLE :"owner_role";

-- Ledger so e legivel pelo Owner: 0005 precisa estar registrada e 0006 ausente.
SELECT
  EXISTS (SELECT 1 FROM app.schema_migrations WHERE migration_id = '0005_criar_super_admin_protegido') AS ledger_0005_present,
  NOT EXISTS (SELECT 1 FROM app.schema_migrations WHERE migration_id = '0006_adicionar_login_usuario_admin') AS ledger_0006_absent
\gset pre1_

\if :pre1_ledger_0005_present
\else
  \echo 'ERRO [0006]: 0005 nao esta registrada no ledger.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Precondicao falhou: 0005 ausente no ledger'; END; $fail$;
\endif
\if :pre1_ledger_0006_absent
\else
  \echo 'ERRO [0006]: 0006 ja existe no ledger.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Precondicao falhou: 0006 ja registrada'; END; $fail$;
\endif

\echo 'Ledger 0005 validado; 0006 ausente. Iniciando evolucao de tab_usuario_admin.'

ALTER TABLE app.tab_usuario_admin
  ADD COLUMN login_usuario text NULL;

ALTER TABLE app.tab_usuario_admin
  ADD CONSTRAINT ck_tab_usuario_admin_login
    CHECK (login_usuario IS NULL OR login_usuario ~ '^[a-z0-9._-]{3,32}$');

-- Unicidade case-insensitive. Multiplos NULL sao permitidos (usuarios sem login ainda).
CREATE UNIQUE INDEX tab_usuario_admin_login_unq
  ON app.tab_usuario_admin (lower(login_usuario));

\echo 'Coluna, constraint e indice unico criados.'

SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'app' AND table_name = 'tab_usuario_admin'
      AND column_name = 'login_usuario' AND is_nullable = 'YES'
  ) AS post_column_ok,
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'app' AND tablename = 'tab_usuario_admin'
      AND indexname = 'tab_usuario_admin_login_unq'
  ) AS post_index_ok
\gset post1_

\if :post1_post_column_ok
\else
  \echo 'ERRO [0006]: poscondicao da coluna login_usuario falhou.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Poscondicao falhou: coluna login_usuario'; END; $fail$;
\endif
\if :post1_post_index_ok
\else
  \echo 'ERRO [0006]: poscondicao do indice tab_usuario_admin_login_unq falhou.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Poscondicao falhou: indice tab_usuario_admin_login_unq'; END; $fail$;
\endif

INSERT INTO app.schema_migrations (
  migration_id,
  checksum_sha256,
  description,
  applied_at,
  applied_by_login,
  applied_as_role,
  database_name
) VALUES (
  '0006_adicionar_login_usuario_admin',
  :'migration_sha256',
  'Adiciona login_usuario (nullable, normalizado, unico case-insensitive) em tab_usuario_admin. Sem backfill.',
  now(),
  session_user::text,
  current_user::text,
  current_database()
);

RESET ROLE;

SELECT
  (session_user IS NOT DISTINCT FROM :'migrator_role') AS session_is_migrator,
  (current_user IS NOT DISTINCT FROM :'migrator_role') AS current_is_migrator
\gset postReset_

\if :postReset_session_is_migrator
\else
  \echo 'ERRO [0006]: falha pos RESET ROLE (session_user).'
  DO $fail$ BEGIN RAISE EXCEPTION 'Falha pos RESET ROLE: session_user'; END; $fail$;
\endif
\if :postReset_current_is_migrator
\else
  \echo 'ERRO [0006]: falha pos RESET ROLE (current_user).'
  DO $fail$ BEGIN RAISE EXCEPTION 'Falha pos RESET ROLE: current_user'; END; $fail$;
\endif

COMMIT;

\echo '=== 0006: LOGIN DE USUARIO ADMIN - concluido. login_usuario nullable, unico case-insensitive. Sem backfill. ==='
