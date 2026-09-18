-- =============================================================================
-- 0002_create_catalog_core.sql
--
-- Fase: 5.0D.6H BUSINESS MIGRATIONS / CATALOG MODEL - DRAFT.
-- Este arquivo e DRAFT. Nao executar nesta fase.
--
-- Depende obrigatoriamente da 0001 (app.schema_migrations com
-- migration_id = 0001_create_migration_ledger e checksum
-- bb018fc0c74c17d8ee072fb0c0711d60ead28ce587c47e2bc1bc7dd0664991c0).
--
-- Identidade esperada: Migrator do ambiente, autenticado por LOGIN real.
--   Fluxo obrigatorio (uma unica transacao):
--     LOGIN migrator_role
--     -> BEGIN
--     -> prechecks de catalogo/seguranca
--     -> SET ROLE owner_role
--     -> precheck do ledger 0001 (somente Owner consegue ler o ledger)
--     -> CREATE das 4 tabelas do nucleo do catalogo
--     -> CREATE dos indexes autorizados
--     -> poschecks estruturais e de privilegio
--     -> INSERT do registro 0002 no ledger
--     -> validar ledger
--     -> RESET ROLE
--     -> confirmar Migrator
--     -> COMMIT
-- Runtime APP nunca executa migration.
--
-- Efeito: cria o nucleo estrutural do catalogo:
--   app.categories
--   app.products
--   app.product_images
--   app.product_prices
-- Sem seed/demo data. O unico INSERT e o registro 0002 em
-- app.schema_migrations.
--
-- IDs: uuid fornecido pela aplicacao. Sem default gerador no banco.
-- Sem SERIAL, BIGSERIAL, IDENTITY, CREATE SEQUENCE, trigger de
-- updated_at, GRANT manual de negocio, ou REVOKE das tabelas novas.
-- O default privilege 5.0D.6F deve conceder automaticamente a
-- app_role: SELECT, INSERT, UPDATE, DELETE. Esta migration apenas
-- valida esse resultado. ACL de runtime e FAIL CLOSED: somente
-- Owner (ownership; ACL explicita do Owner nao exigida) e APP
-- podem aparecer como grantees. PUBLIC, Migrator e QUALQUER outro
-- grantee inesperado abortam a migration. Sem GRANT/REVOKE de
-- negocio nesta 0002. Se divergir: FAIL CLOSED.
--
-- Variaveis psql obrigatorias (passadas via -v, nenhum valor default aqui):
--   target_database   -> nome do database alvo
--   owner_role        -> role Owner do schema app no ambiente
--   migrator_role     -> role Migrator do ambiente (deve ser a sessao atual)
--   app_role          -> role Runtime APP do ambiente
--   migration_sha256  -> SHA256 do arquivo, calculado FORA do SQL
--
-- O SHA256 desta migration NAO e hardcoded neste arquivo. Validar formato:
-- exatamente 64 caracteres hexadecimais.
--
-- Nota de implementacao: psql NAO interpola variaveis (:var, :'var', :"var")
-- dentro do corpo de blocos dollar-quoted (DO $tag$ ... $tag$). Esse corpo e
-- um literal de string para o comando SQL externo, resolvido inteiramente no
-- servidor. Por isso, toda validacao parametrizada abaixo e feita via SQL
-- top-level (onde psql interpola corretamente) seguido de \gset e \if. Blocos
-- DO sao usados somente para RAISE EXCEPTION com mensagem ESTATICA (sem
-- variavel psql), servindo apenas como mecanismo de aborto de transacao.
-- Nenhum \quit com codigo de saida e utilizado.
--
-- Requisito minimo: PostgreSQL >= 16. Motivo: pg_auth_members.inherit_option
-- e set_option (PG 16+), mesma baseline de config/001-003 e da 0001.
-- =============================================================================

\set ON_ERROR_STOP on

\if :{?target_database}
\else
  \echo 'ERRO [0002]: variavel psql "target_database" ausente. Use -v target_database=... Nenhum CREATE/INSERT sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: target_database. Migration 0002 abortada antes de qualquer instrucao SQL.';
  END;
  $missing_var$;
\endif
\if :{?owner_role}
\else
  \echo 'ERRO [0002]: variavel psql "owner_role" ausente. Use -v owner_role=... Nenhum CREATE/INSERT sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: owner_role. Migration 0002 abortada antes de qualquer instrucao SQL.';
  END;
  $missing_var$;
\endif
\if :{?migrator_role}
\else
  \echo 'ERRO [0002]: variavel psql "migrator_role" ausente. Use -v migrator_role=... Nenhum CREATE/INSERT sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: migrator_role. Migration 0002 abortada antes de qualquer instrucao SQL.';
  END;
  $missing_var$;
\endif
\if :{?app_role}
\else
  \echo 'ERRO [0002]: variavel psql "app_role" ausente. Use -v app_role=... Nenhum CREATE/INSERT sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: app_role. Migration 0002 abortada antes de qualquer instrucao SQL.';
  END;
  $missing_var$;
\endif
\if :{?migration_sha256}
\else
  \echo 'ERRO [0002]: variavel psql "migration_sha256" ausente. Use -v migration_sha256=<sha256 hex 64>. O checksum e calculado fora do SQL. Nenhum CREATE/INSERT sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: migration_sha256. Migration 0002 abortada antes de qualquer instrucao SQL.';
  END;
  $missing_var$;
\endif

SELECT (:'migration_sha256' ~ '^[0-9a-fA-F]{64}$') AS sha256_format_ok
\gset preSha_

\if :preSha_sha256_format_ok
\else
  \echo 'ERRO [0002]: migration_sha256 nao possui formato SHA256 (64 caracteres hexadecimais).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migration_sha256 nao possui formato SHA256 (64 caracteres hexadecimais)';
  END;
  $fail$;
\endif

\echo '=== 0002: CREATE CATALOG CORE - inicio ==='
\echo 'Este script deve ser executado autenticado como migrator_role.'
\echo 'DRAFT: nao executar nesta fase.'

BEGIN;

-- ---------------------------------------------------------------------------
-- PRECONDICOES de catalogo/seguranca (SQL top-level + \gset + \if),
-- ANTES de SET ROLE / CREATE. Cada checagem aborta a transacao via DO
-- estatico caso falhe.
-- Leitura do conteudo de app.schema_migrations fica DEPOIS do SET ROLE
-- owner_role: Migrator nao possui privilege direto no ledger.
-- ---------------------------------------------------------------------------

SELECT
  (current_setting('server_version_num')::int >= 160000) AS pg16_ok,
  (current_database() IS NOT DISTINCT FROM :'target_database') AS db_ok,
  (session_user IS NOT DISTINCT FROM :'migrator_role')          AS session_is_migrator,
  (current_user IS NOT DISTINCT FROM :'migrator_role')          AS current_is_migrator,
  (session_user = :'app_role' OR current_user = :'app_role')    AS app_role_in_session,
  pg_has_role(current_user, :'owner_role', 'SET')                AS can_set_owner,
  EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app')      AS schema_app_exists
\gset pre0_

\if :pre0_pg16_ok
\else
  \echo 'ERRO [0002]: PostgreSQL < 16. Esta migration exige server_version_num >= 160000 (pg_auth_members inherit_option/set_option).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: PostgreSQL inferior a 16';
  END;
  $fail$;
\endif
\if :pre0_db_ok
\else
  \echo 'ERRO [0002]: current_database() difere de target_database (:target_database).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: current_database() difere de target_database';
  END;
  $fail$;
\endif
\if :pre0_session_is_migrator
\else
  \echo 'ERRO [0002]: session_user difere de migrator_role (:migrator_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: session_user difere de migrator_role';
  END;
  $fail$;
\endif
\if :pre0_current_is_migrator
\else
  \echo 'ERRO [0002]: current_user difere de migrator_role (:migrator_role) antes de SET ROLE.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: current_user difere de migrator_role antes de SET ROLE';
  END;
  $fail$;
\endif
\if :pre0_app_role_in_session
  \echo 'ERRO [0002]: app_role (:app_role) nao pode participar desta sessao.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role nao pode participar desta sessao';
  END;
  $fail$;
\endif
\if :pre0_can_set_owner
\else
  \echo 'ERRO [0002]: migrator_role (:migrator_role) nao pode executar SET ROLE para owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role nao pode executar SET ROLE para owner_role';
  END;
  $fail$;
\endif
\if :pre0_schema_app_exists
\else
  \echo 'ERRO [0002]: schema "app" nao existe. Execute o bootstrap (backend/database/bootstrap/001-003) e a migration 0001 antes desta migration.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: schema app nao existe';
  END;
  $fail$;
\endif

SELECT
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'owner_role')    AS owner_exists,
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'migrator_role') AS migrator_exists,
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_role')      AS app_exists,
  ((SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = 'app') IS NOT DISTINCT FROM :'owner_role') AS schema_owner_ok,
  (SELECT oid FROM pg_namespace WHERE nspname = 'app') AS app_namespace_oid
\gset pre1_

\if :pre1_owner_exists
\else
  \echo 'ERRO [0002]: owner_role (:owner_role) nao existe.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: owner_role nao existe';
  END;
  $fail$;
\endif
\if :pre1_migrator_exists
\else
  \echo 'ERRO [0002]: migrator_role (:migrator_role) nao existe.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role nao existe';
  END;
  $fail$;
\endif
\if :pre1_app_exists
\else
  \echo 'ERRO [0002]: app_role (:app_role) nao existe.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role nao existe';
  END;
  $fail$;
\endif
\if :pre1_schema_owner_ok
\else
  \echo 'ERRO [0002]: owner do schema app difere de owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: owner do schema app difere de owner_role';
  END;
  $fail$;
\endif

-- search_path POR DATABASE das tres roles = app, pg_catalog.
SELECT
  ((SELECT string_to_array(regexp_replace(split_part(elem, '=', 2), '\s+', '', 'g'), ',')
      FROM pg_db_role_setting s
      JOIN pg_roles r ON r.oid = s.setrole
      JOIN pg_database d ON d.oid = s.setdatabase
      CROSS JOIN LATERAL unnest(s.setconfig) AS elem
      WHERE r.rolname = :'owner_role' AND d.datname = :'target_database'
        AND split_part(elem, '=', 1) = 'search_path') = ARRAY['app', 'pg_catalog']) AS owner_search_path_ok,
  ((SELECT string_to_array(regexp_replace(split_part(elem, '=', 2), '\s+', '', 'g'), ',')
      FROM pg_db_role_setting s
      JOIN pg_roles r ON r.oid = s.setrole
      JOIN pg_database d ON d.oid = s.setdatabase
      CROSS JOIN LATERAL unnest(s.setconfig) AS elem
      WHERE r.rolname = :'migrator_role' AND d.datname = :'target_database'
        AND split_part(elem, '=', 1) = 'search_path') = ARRAY['app', 'pg_catalog']) AS migrator_search_path_ok,
  ((SELECT string_to_array(regexp_replace(split_part(elem, '=', 2), '\s+', '', 'g'), ',')
      FROM pg_db_role_setting s
      JOIN pg_roles r ON r.oid = s.setrole
      JOIN pg_database d ON d.oid = s.setdatabase
      CROSS JOIN LATERAL unnest(s.setconfig) AS elem
      WHERE r.rolname = :'app_role' AND d.datname = :'target_database'
        AND split_part(elem, '=', 1) = 'search_path') = ARRAY['app', 'pg_catalog']) AS app_search_path_ok
\gset pre2_

\if :pre2_owner_search_path_ok
\else
  \echo 'ERRO [0002]: search_path POR DATABASE de owner_role (:owner_role) difere de "app, pg_catalog".'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: search_path de owner_role incorreto ou ausente';
  END;
  $fail$;
\endif
\if :pre2_migrator_search_path_ok
\else
  \echo 'ERRO [0002]: search_path POR DATABASE de migrator_role (:migrator_role) difere de "app, pg_catalog".'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: search_path de migrator_role incorreto ou ausente';
  END;
  $fail$;
\endif
\if :pre2_app_search_path_ok
\else
  \echo 'ERRO [0002]: search_path POR DATABASE de app_role (:app_role) difere de "app, pg_catalog".'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: search_path de app_role incorreto ou ausente';
  END;
  $fail$;
\endif

-- DB CREATE=false nas tres roles.
SELECT
  has_database_privilege(:'owner_role', current_database(), 'CREATE')    AS owner_db_create,
  has_database_privilege(:'migrator_role', current_database(), 'CREATE') AS migrator_db_create,
  has_database_privilege(:'app_role', current_database(), 'CREATE')      AS app_db_create
\gset pre3_

\if :pre3_owner_db_create
  \echo 'ERRO [0002]: owner_role (:owner_role) possui CREATE no database; esperado false.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: owner_role possui CREATE no database';
  END;
  $fail$;
\endif
\if :pre3_migrator_db_create
  \echo 'ERRO [0002]: migrator_role (:migrator_role) possui CREATE no database; esperado false.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role possui CREATE no database';
  END;
  $fail$;
\endif
\if :pre3_app_db_create
  \echo 'ERRO [0002]: app_role (:app_role) possui CREATE no database; esperado false.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role possui CREATE no database';
  END;
  $fail$;
\endif

-- Membership Migrator->Owner: admin=false, inherit=false, set=true.
-- APP sem membership Owner/Migrator e sem SET ROLE Owner/Migrator.
SELECT
  EXISTS (
    SELECT 1
    FROM pg_auth_members m
    JOIN pg_roles r   ON r.oid = m.roleid
    JOIN pg_roles mem ON mem.oid = m.member
    WHERE r.rolname = :'owner_role'
      AND mem.rolname = :'migrator_role'
      AND m.admin_option = false
      AND m.inherit_option = false
      AND m.set_option = true
  ) AS migrator_owner_membership_exact,
  NOT EXISTS (
    SELECT 1
    FROM pg_auth_members m
    JOIN pg_roles r   ON r.oid = m.roleid
    JOIN pg_roles mem ON mem.oid = m.member
    WHERE r.rolname = :'owner_role'
      AND mem.rolname = :'migrator_role'
      AND (m.admin_option = true OR m.inherit_option = true)
  ) AS migrator_owner_no_extra_membership,
  NOT EXISTS (
    SELECT 1
    FROM pg_auth_members m
    JOIN pg_roles r   ON r.oid = m.roleid
    JOIN pg_roles mem ON mem.oid = m.member
    WHERE r.rolname = :'owner_role'
      AND mem.rolname = :'app_role'
  ) AS app_owner_no_direct_membership,
  NOT EXISTS (
    SELECT 1
    FROM pg_auth_members m
    JOIN pg_roles r   ON r.oid = m.roleid
    JOIN pg_roles mem ON mem.oid = m.member
    WHERE r.rolname = :'migrator_role'
      AND mem.rolname = :'app_role'
  ) AS app_migrator_no_direct_membership,
  (pg_has_role(:'app_role', :'owner_role', 'SET') = false)    AS app_cannot_set_owner,
  (pg_has_role(:'app_role', :'migrator_role', 'SET') = false) AS app_cannot_set_migrator
\gset pre4_

\if :pre4_migrator_owner_membership_exact
\else
  \echo 'ERRO [0002]: migrator_role (:migrator_role) nao possui membership direta em owner_role (:owner_role) com admin_option=false, inherit_option=false, set_option=true.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role nao possui membership exata em owner_role';
  END;
  $fail$;
\endif
\if :pre4_migrator_owner_no_extra_membership
\else
  \echo 'ERRO [0002]: existe membership adicional de migrator_role (:migrator_role) em owner_role (:owner_role) com admin_option/inherit_option true.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: membership adicional de migrator_role em owner_role';
  END;
  $fail$;
\endif
\if :pre4_app_owner_no_direct_membership
\else
  \echo 'ERRO [0002]: app_role (:app_role) possui membership DIRETA indevida em owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role possui membership direta indevida em owner_role';
  END;
  $fail$;
\endif
\if :pre4_app_migrator_no_direct_membership
\else
  \echo 'ERRO [0002]: app_role (:app_role) possui membership DIRETA indevida em migrator_role (:migrator_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role possui membership direta indevida em migrator_role';
  END;
  $fail$;
\endif
\if :pre4_app_cannot_set_owner
\else
  \echo 'ERRO [0002]: app_role (:app_role) possui capacidade de SET ROLE para owner_role (:owner_role); esperado false.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role possui SET ROLE para owner_role';
  END;
  $fail$;
\endif
\if :pre4_app_cannot_set_migrator
\else
  \echo 'ERRO [0002]: app_role (:app_role) possui capacidade de SET ROLE para migrator_role (:migrator_role); esperado false.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role possui SET ROLE para migrator_role';
  END;
  $fail$;
\endif

-- Schema app: Owner CREATE+USAGE; APP USAGE sem CREATE; PUBLIC sem CREATE/USAGE;
-- Migrator sem grant direto.
SELECT
  has_schema_privilege(:'owner_role', 'app', 'CREATE') AS owner_schema_create,
  has_schema_privilege(:'owner_role', 'app', 'USAGE')  AS owner_schema_usage,
  has_schema_privilege('public', 'app', 'CREATE')      AS public_schema_create,
  has_schema_privilege('public', 'app', 'USAGE')       AS public_schema_usage,
  has_schema_privilege(:'app_role', 'app', 'CREATE')   AS app_schema_create,
  has_schema_privilege(:'app_role', 'app', 'USAGE')    AS app_schema_usage,
  EXISTS (
    SELECT 1
    FROM pg_namespace n
    CROSS JOIN LATERAL aclexplode(n.nspacl) a
    JOIN pg_roles r ON r.oid = a.grantee
    WHERE n.nspname = 'app'
      AND r.rolname = :'migrator_role'
      AND a.privilege_type IN ('CREATE', 'USAGE')
  ) AS migrator_direct_grant
\gset pre5_

\if :pre5_owner_schema_create
\else
  \echo 'ERRO [0002]: owner_role (:owner_role) sem CREATE efetivo no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: owner_role sem CREATE efetivo no schema app';
  END;
  $fail$;
\endif
\if :pre5_owner_schema_usage
\else
  \echo 'ERRO [0002]: owner_role (:owner_role) sem USAGE efetivo no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: owner_role sem USAGE efetivo no schema app';
  END;
  $fail$;
\endif
\if :pre5_public_schema_create
  \echo 'ERRO [0002]: PUBLIC possui CREATE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: PUBLIC possui CREATE no schema app';
  END;
  $fail$;
\endif
\if :pre5_public_schema_usage
  \echo 'ERRO [0002]: PUBLIC possui USAGE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: PUBLIC possui USAGE no schema app';
  END;
  $fail$;
\endif
\if :pre5_app_schema_create
  \echo 'ERRO [0002]: app_role (:app_role) possui CREATE no schema app; esperado false.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role possui CREATE no schema app';
  END;
  $fail$;
\endif
\if :pre5_app_schema_usage
\else
  \echo 'ERRO [0002]: app_role (:app_role) sem USAGE efetivo no schema app; esperado true apos 5.0D.6F.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role sem USAGE efetivo no schema app';
  END;
  $fail$;
\endif
\if :pre5_migrator_direct_grant
  \echo 'ERRO [0002]: migrator_role (:migrator_role) possui grant DIRETO de CREATE/USAGE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role possui grant DIRETO de CREATE/USAGE no schema app';
  END;
  $fail$;
\endif

-- Default ACL baseline (5.0D.6E + 5.0D.6F): Owner exatamente 3 entradas
-- (FUNCTIONS global f, TABLES app r, SEQUENCES app S). APP: TABLES =
-- SELECT/INSERT/UPDATE/DELETE; SEQUENCES = USAGE; FUNCTIONS = nenhum EXECUTE.
-- Migrator/PUBLIC: sem privilege. Grantees autorizados SOMENTE os
-- esperados, validados por pg_default_acl + aclexplode por OID:
--   TABLES (schema app): APP e (opcional) Owner; qualquer outro = zero
--   SEQUENCES (schema app): APP (USAGE) e (opcional) Owner; qualquer outro = zero
--   FUNCTIONS global: somente Owner conforme baseline; APP/PUBLIC/Migrator/
--   qualquer outro = zero
-- Sem hardcode de nomes de roles desconhecidas.
SELECT
  ((SELECT count(*)
      FROM pg_default_acl d
      JOIN pg_roles r ON r.oid = d.defaclrole
      WHERE r.rolname = :'owner_role') = 3) AS owner_total_default_acl_row_count_exact_three,
  ((SELECT count(*)
      FROM pg_default_acl d
      JOIN pg_roles r ON r.oid = d.defaclrole
      WHERE r.rolname = :'owner_role'
        AND d.defaclnamespace = 0
        AND d.defaclobjtype = 'f') = 1) AS owner_global_functions_default_acl_exists,
  ((SELECT count(*)
      FROM pg_default_acl d
      JOIN pg_roles r ON r.oid = d.defaclrole
      WHERE r.rolname = :'owner_role'
        AND d.defaclnamespace = :pre1_app_namespace_oid
        AND d.defaclobjtype = 'r') = 1) AS owner_tables_default_acl_in_app_schema_exists_once,
  ((SELECT count(*)
      FROM pg_default_acl d
      JOIN pg_roles r ON r.oid = d.defaclrole
      WHERE r.rolname = :'owner_role'
        AND d.defaclnamespace = :pre1_app_namespace_oid
        AND d.defaclobjtype = 'S') = 1) AS owner_sequences_default_acl_in_app_schema_exists_once,
  NOT EXISTS (
    SELECT 1 FROM pg_default_acl d
    JOIN pg_roles r ON r.oid = d.defaclrole
    WHERE r.rolname = :'owner_role'
      AND d.defaclnamespace = :pre1_app_namespace_oid
      AND d.defaclobjtype = 'f'
  ) AS owner_no_functions_default_acl_in_app_schema,
  ((SELECT count(*)
      FROM pg_default_acl d
      JOIN pg_roles r ON r.oid = d.defaclrole
      WHERE r.rolname = :'migrator_role') = 0) AS migrator_default_acl_zero,
  ((SELECT count(*)
      FROM pg_default_acl d
      JOIN pg_roles r ON r.oid = d.defaclrole
      WHERE r.rolname = :'app_role') = 0) AS app_default_acl_zero
\gset pre6_

\if :pre6_owner_total_default_acl_row_count_exact_three
\else
  \echo 'ERRO [0002]: owner_role (:owner_role) nao possui exatamente 3 entradas pg_default_acl (baseline 5.0D.6F).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: owner_role sem exatamente 3 entradas pg_default_acl';
  END;
  $fail$;
\endif
\if :pre6_owner_global_functions_default_acl_exists
\else
  \echo 'ERRO [0002]: entrada pg_default_acl GLOBAL de FUNCTIONS ausente para owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: entrada pg_default_acl global de FUNCTIONS ausente para owner_role';
  END;
  $fail$;
\endif
\if :pre6_owner_tables_default_acl_in_app_schema_exists_once
\else
  \echo 'ERRO [0002]: entrada pg_default_acl de TABLES no schema app ausente ou duplicada para owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: entrada pg_default_acl de TABLES no schema app ausente ou duplicada';
  END;
  $fail$;
\endif
\if :pre6_owner_sequences_default_acl_in_app_schema_exists_once
\else
  \echo 'ERRO [0002]: entrada pg_default_acl de SEQUENCES no schema app ausente ou duplicada para owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: entrada pg_default_acl de SEQUENCES no schema app ausente ou duplicada';
  END;
  $fail$;
\endif
\if :pre6_owner_no_functions_default_acl_in_app_schema
\else
  \echo 'ERRO [0002]: existe entrada pg_default_acl de FUNCTIONS no schema app para owner_role (:owner_role); esperado nenhuma.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: entrada pg_default_acl de FUNCTIONS inesperada no schema app';
  END;
  $fail$;
\endif
\if :pre6_migrator_default_acl_zero
\else
  \echo 'ERRO [0002]: migrator_role (:migrator_role) possui entrada em pg_default_acl como defaclrole; esperado 0.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role com pg_default_acl inesperado';
  END;
  $fail$;
\endif
\if :pre6_app_default_acl_zero
\else
  \echo 'ERRO [0002]: app_role (:app_role) possui entrada em pg_default_acl como defaclrole; esperado 0.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role com pg_default_acl inesperado';
  END;
  $fail$;
\endif

SELECT
  ((SELECT array_agg(a.privilege_type ORDER BY a.privilege_type)
      FROM pg_default_acl d
      JOIN pg_roles r ON r.oid = d.defaclrole
      CROSS JOIN LATERAL aclexplode(d.defaclacl) a
      JOIN pg_roles gr ON gr.oid = a.grantee
      WHERE r.rolname = :'owner_role'
        AND d.defaclnamespace = :pre1_app_namespace_oid
        AND d.defaclobjtype = 'r'
        AND gr.rolname = :'app_role') = ARRAY['DELETE','INSERT','SELECT','UPDATE']) AS app_tables_privs_exact,
  ((SELECT array_agg(a.privilege_type ORDER BY a.privilege_type)
      FROM pg_default_acl d
      JOIN pg_roles r ON r.oid = d.defaclrole
      CROSS JOIN LATERAL aclexplode(d.defaclacl) a
      JOIN pg_roles gr ON gr.oid = a.grantee
      WHERE r.rolname = :'owner_role'
        AND d.defaclnamespace = :pre1_app_namespace_oid
        AND d.defaclobjtype = 'S'
        AND gr.rolname = :'app_role') = ARRAY['USAGE']) AS app_sequences_privs_exact,
  NOT EXISTS (
    SELECT 1
    FROM pg_default_acl d
    JOIN pg_roles r ON r.oid = d.defaclrole
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE r.rolname = :'owner_role' AND d.defaclnamespace = 0 AND d.defaclobjtype = 'f'
      AND a.grantee = 0
  ) AS global_functions_public_zero_priv,
  NOT EXISTS (
    SELECT 1
    FROM pg_default_acl d
    JOIN pg_roles r ON r.oid = d.defaclrole
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    JOIN pg_roles gr ON gr.oid = a.grantee
    WHERE r.rolname = :'owner_role' AND d.defaclnamespace = 0 AND d.defaclobjtype = 'f'
      AND gr.rolname = :'app_role'
  ) AS global_functions_app_zero_priv,
  NOT EXISTS (
    SELECT 1
    FROM pg_default_acl d
    JOIN pg_roles r ON r.oid = d.defaclrole
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    JOIN pg_roles gr ON gr.oid = a.grantee
    WHERE r.rolname = :'owner_role' AND d.defaclnamespace = 0 AND d.defaclobjtype = 'f'
      AND gr.rolname = :'migrator_role'
  ) AS global_functions_migrator_zero_priv,
  NOT EXISTS (
    SELECT 1
    FROM pg_default_acl d
    JOIN pg_roles r ON r.oid = d.defaclrole
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE r.rolname = :'owner_role'
      AND d.defaclnamespace = :pre1_app_namespace_oid
      AND d.defaclobjtype = 'r'
      AND a.grantee = 0
  ) AS tables_no_public_priv,
  NOT EXISTS (
    SELECT 1
    FROM pg_default_acl d
    JOIN pg_roles r ON r.oid = d.defaclrole
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    JOIN pg_roles gr ON gr.oid = a.grantee
    WHERE r.rolname = :'owner_role'
      AND d.defaclnamespace = :pre1_app_namespace_oid
      AND d.defaclobjtype = 'r'
      AND gr.rolname = :'migrator_role'
  ) AS tables_no_migrator_priv,
  NOT EXISTS (
    SELECT 1
    FROM pg_default_acl d
    JOIN pg_roles r ON r.oid = d.defaclrole
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE r.rolname = :'owner_role'
      AND d.defaclnamespace = :pre1_app_namespace_oid
      AND d.defaclobjtype = 'S'
      AND a.grantee = 0
  ) AS sequences_no_public_priv,
  NOT EXISTS (
    SELECT 1
    FROM pg_default_acl d
    JOIN pg_roles r ON r.oid = d.defaclrole
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    JOIN pg_roles gr ON gr.oid = a.grantee
    WHERE r.rolname = :'owner_role'
      AND d.defaclnamespace = :pre1_app_namespace_oid
      AND d.defaclobjtype = 'S'
      AND gr.rolname = :'migrator_role'
  ) AS sequences_no_migrator_priv,
  NOT EXISTS (
    SELECT 1
    FROM pg_default_acl d
    JOIN pg_roles r ON r.oid = d.defaclrole
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE r.rolname = :'owner_role'
      AND d.defaclnamespace = :pre1_app_namespace_oid
      AND d.defaclobjtype = 'r'
      AND a.grantee IS DISTINCT FROM d.defaclrole
      AND a.grantee IS DISTINCT FROM (SELECT oid FROM pg_roles WHERE rolname = :'app_role')
  ) AS tables_no_unexpected_grantee,
  NOT EXISTS (
    SELECT 1
    FROM pg_default_acl d
    JOIN pg_roles r ON r.oid = d.defaclrole
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE r.rolname = :'owner_role'
      AND d.defaclnamespace = :pre1_app_namespace_oid
      AND d.defaclobjtype = 'S'
      AND a.grantee IS DISTINCT FROM d.defaclrole
      AND a.grantee IS DISTINCT FROM (SELECT oid FROM pg_roles WHERE rolname = :'app_role')
  ) AS sequences_no_unexpected_grantee,
  NOT EXISTS (
    SELECT 1
    FROM pg_default_acl d
    JOIN pg_roles r ON r.oid = d.defaclrole
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE r.rolname = :'owner_role'
      AND d.defaclnamespace = 0
      AND d.defaclobjtype = 'f'
      AND a.grantee IS DISTINCT FROM d.defaclrole
  ) AS functions_no_unexpected_grantee
\gset pre7_

\if :pre7_app_tables_privs_exact
\else
  \echo 'ERRO [0002]: default ACL de TABLES (schema app) para app_role (:app_role) difere de {DELETE, INSERT, SELECT, UPDATE}.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: privilegios default de TABLES para app_role diferem do esperado';
  END;
  $fail$;
\endif
\if :pre7_app_sequences_privs_exact
\else
  \echo 'ERRO [0002]: default ACL de SEQUENCES (schema app) para app_role (:app_role) difere de {USAGE}.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: privilegios default de SEQUENCES para app_role diferem do esperado';
  END;
  $fail$;
\endif
\if :pre7_global_functions_public_zero_priv
\else
  \echo 'ERRO [0002]: PUBLIC possui privilegio na entrada GLOBAL de FUNCTIONS.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: PUBLIC com privilegio na entrada global de FUNCTIONS';
  END;
  $fail$;
\endif
\if :pre7_global_functions_app_zero_priv
\else
  \echo 'ERRO [0002]: app_role (:app_role) possui privilegio (EXECUTE) na entrada GLOBAL de FUNCTIONS.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role com privilegio na entrada global de FUNCTIONS';
  END;
  $fail$;
\endif
\if :pre7_global_functions_migrator_zero_priv
\else
  \echo 'ERRO [0002]: migrator_role (:migrator_role) possui privilegio na entrada GLOBAL de FUNCTIONS.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role com privilegio na entrada global de FUNCTIONS';
  END;
  $fail$;
\endif
\if :pre7_tables_no_public_priv
\else
  \echo 'ERRO [0002]: PUBLIC possui privilegio no default ACL de TABLES (schema app).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: PUBLIC com privilegio em default ACL de TABLES';
  END;
  $fail$;
\endif
\if :pre7_tables_no_migrator_priv
\else
  \echo 'ERRO [0002]: migrator_role (:migrator_role) possui privilegio no default ACL de TABLES (schema app).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role com privilegio em default ACL de TABLES';
  END;
  $fail$;
\endif
\if :pre7_sequences_no_public_priv
\else
  \echo 'ERRO [0002]: PUBLIC possui privilegio no default ACL de SEQUENCES (schema app).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: PUBLIC com privilegio em default ACL de SEQUENCES';
  END;
  $fail$;
\endif
\if :pre7_sequences_no_migrator_priv
\else
  \echo 'ERRO [0002]: migrator_role (:migrator_role) possui privilegio no default ACL de SEQUENCES (schema app).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role com privilegio em default ACL de SEQUENCES';
  END;
  $fail$;
\endif
\if :pre7_tables_no_unexpected_grantee
\else
  \echo 'ERRO [0002]: default ACL de TABLES (schema app) possui grantee inesperado (alem de Owner e APP). FAIL CLOSED.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: grantee inesperado no default ACL de TABLES';
  END;
  $fail$;
\endif
\if :pre7_sequences_no_unexpected_grantee
\else
  \echo 'ERRO [0002]: default ACL de SEQUENCES (schema app) possui grantee inesperado (alem de Owner e APP). FAIL CLOSED.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: grantee inesperado no default ACL de SEQUENCES';
  END;
  $fail$;
\endif
\if :pre7_functions_no_unexpected_grantee
\else
  \echo 'ERRO [0002]: default ACL GLOBAL de FUNCTIONS possui grantee inesperado (alem de Owner). FAIL CLOSED.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: grantee inesperado no default ACL global de FUNCTIONS';
  END;
  $fail$;
\endif

-- Objetos atuais: ledger existe; as 4 tabelas do catalogo NAO existem;
-- exatamente 1 tabela (schema_migrations); sequences=0; routines=0.
-- Protecao do ledger validada por catalogo (Migrator nao consegue SELECT
-- na tabela; a leitura do registro 0001 ocorre apos SET ROLE).
SELECT
  EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'app'
      AND c.relname = 'schema_migrations'
      AND c.relkind = 'r'
  ) AS ledger_exists,
  ((SELECT pg_get_userbyid(c.relowner)
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app'
        AND c.relname = 'schema_migrations'
        AND c.relkind = 'r') IS NOT DISTINCT FROM :'owner_role') AS ledger_owner_ok,
  ((SELECT count(*)
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relkind = 'r') = 1) AS exactly_one_table,
  ((SELECT count(*)
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relkind = 'S') = 0) AS sequence_count_zero,
  ((SELECT count(*)
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app') = 0) AS routine_count_zero,
  NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'app'
      AND c.relkind NOT IN ('r', 'i')
  ) AS no_unexpected_relkind,
  NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'app'
      AND c.relname IN ('categories', 'products', 'product_images', 'product_prices')
      AND c.relkind = 'r'
  ) AS catalog_tables_absent,
  NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) a
    JOIN pg_roles r ON r.oid = a.grantee
    WHERE n.nspname = 'app'
      AND c.relname = 'schema_migrations'
      AND c.relkind = 'r'
      AND r.rolname = :'app_role'
  ) AS ledger_app_no_direct_acl,
  NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) a
    JOIN pg_roles r ON r.oid = a.grantee
    WHERE n.nspname = 'app'
      AND c.relname = 'schema_migrations'
      AND c.relkind = 'r'
      AND r.rolname = :'migrator_role'
  ) AS ledger_migrator_no_direct_acl,
  NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) a
    WHERE n.nspname = 'app'
      AND c.relname = 'schema_migrations'
      AND c.relkind = 'r'
      AND a.grantee = 0
  ) AS ledger_public_no_direct_acl
\gset pre8_

\if :pre8_ledger_exists
\else
  \echo 'ERRO [0002]: app.schema_migrations nao existe. Aplique a migration 0001 antes desta.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app.schema_migrations nao existe';
  END;
  $fail$;
\endif
\if :pre8_ledger_owner_ok
\else
  \echo 'ERRO [0002]: owner de app.schema_migrations difere de owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: owner de app.schema_migrations difere de owner_role';
  END;
  $fail$;
\endif
\if :pre8_exactly_one_table
\else
  \echo 'ERRO [0002]: schema app nao possui exatamente 1 tabela (esperado somente schema_migrations) antes desta migration.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: schema app nao possui exatamente 1 tabela';
  END;
  $fail$;
\endif
\if :pre8_sequence_count_zero
\else
  \echo 'ERRO [0002]: schema app contem sequence(s); esperado nenhuma.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: sequence presente no schema app';
  END;
  $fail$;
\endif
\if :pre8_routine_count_zero
\else
  \echo 'ERRO [0002]: schema app contem routine(s); esperado 0 antes desta migration.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: schema app contem routine(s)';
  END;
  $fail$;
\endif
\if :pre8_no_unexpected_relkind
\else
  \echo 'ERRO [0002]: schema app possui relkind inesperado (alem de tabela/indice).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: relkind inesperado no schema app';
  END;
  $fail$;
\endif
\if :pre8_catalog_tables_absent
\else
  \echo 'ERRO [0002]: uma ou mais tabelas do catalogo (categories/products/product_images/product_prices) ja existem; esta migration nao e reexecutavel.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: tabelas do catalogo ja existem';
  END;
  $fail$;
\endif
\if :pre8_ledger_app_no_direct_acl
\else
  \echo 'ERRO [0002]: app_role (:app_role) possui ACL direta em app.schema_migrations; ledger deve permanecer inacessivel.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role possui ACL direta no ledger';
  END;
  $fail$;
\endif
\if :pre8_ledger_migrator_no_direct_acl
\else
  \echo 'ERRO [0002]: migrator_role (:migrator_role) possui ACL direta em app.schema_migrations.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role possui ACL direta no ledger';
  END;
  $fail$;
\endif
\if :pre8_ledger_public_no_direct_acl
\else
  \echo 'ERRO [0002]: PUBLIC possui ACL em app.schema_migrations.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: PUBLIC possui ACL no ledger';
  END;
  $fail$;
\endif

\echo 'Precondicoes de catalogo/seguranca de 0002 (pre SET ROLE) validadas com sucesso.'

SET ROLE :"owner_role";

SELECT
  (current_user IS NOT DISTINCT FROM :'owner_role')    AS current_is_owner,
  (session_user IS NOT DISTINCT FROM :'migrator_role') AS session_is_migrator
\gset postSet_

\if :postSet_current_is_owner
\else
  \echo 'ERRO [0002]: falha pos SET ROLE: current_user difere de owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Falha pos SET ROLE: current_user difere de owner_role';
  END;
  $fail$;
\endif
\if :postSet_session_is_migrator
\else
  \echo 'ERRO [0002]: falha pos SET ROLE: session_user difere de migrator_role (:migrator_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Falha pos SET ROLE: session_user difere de migrator_role';
  END;
  $fail$;
\endif

\echo 'SET ROLE owner_role confirmado; session_user permanece migrator_role.'

-- Conteudo do ledger: somente Owner consegue SELECT. Exigir 0001 exata
-- e 0002 ausente ANTES de qualquer CREATE.
SELECT
  ((SELECT count(*) FROM app.schema_migrations) = 1) AS ledger_rowcount_one,
  EXISTS (
    SELECT 1
    FROM app.schema_migrations
    WHERE migration_id = '0001_create_migration_ledger'
      AND checksum_sha256 = 'bb018fc0c74c17d8ee072fb0c0711d60ead28ce587c47e2bc1bc7dd0664991c0'
  ) AS ledger_0001_exact,
  NOT EXISTS (
    SELECT 1
    FROM app.schema_migrations
    WHERE migration_id = '0002_create_catalog_core'
  ) AS ledger_0002_absent
\gset preLed_

\if :preLed_ledger_rowcount_one
\else
  \echo 'ERRO [0002]: ledger nao possui exatamente 1 registro antes desta migration.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: ledger nao possui exatamente 1 registro';
  END;
  $fail$;
\endif
\if :preLed_ledger_0001_exact
\else
  \echo 'ERRO [0002]: registro 0001_create_migration_ledger ausente ou checksum diverge de bb018fc0c74c17d8ee072fb0c0711d60ead28ce587c47e2bc1bc7dd0664991c0.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: registro 0001 ausente ou checksum diverge';
  END;
  $fail$;
\endif
\if :preLed_ledger_0002_absent
\else
  \echo 'ERRO [0002]: 0002_create_catalog_core ja existe no ledger; esta migration nao e reexecutavel.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: 0002 ja existe no ledger';
  END;
  $fail$;
\endif

\echo 'Ledger 0001 validado; 0002 ausente. Iniciando CREATE do nucleo do catalogo.'

CREATE TABLE app.categories (
  category_id uuid        NOT NULL,
  name        text        NOT NULL,
  slug        text        NOT NULL,
  description text        NULL,
  sort_order  integer     NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT categories_pkey PRIMARY KEY (category_id),
  CONSTRAINT categories_slug_key UNIQUE (slug),
  CONSTRAINT categories_name_not_empty_chk CHECK (btrim(name) <> ''),
  CONSTRAINT categories_slug_format_chk CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT categories_sort_order_nonneg_chk CHECK (sort_order >= 0)
);

CREATE TABLE app.products (
  product_id  uuid        NOT NULL,
  category_id uuid        NOT NULL,
  name        text        NOT NULL,
  slug        text        NOT NULL,
  description text        NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  is_featured boolean     NOT NULL DEFAULT false,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT products_pkey PRIMARY KEY (product_id),
  CONSTRAINT products_slug_key UNIQUE (slug),
  CONSTRAINT products_category_id_fkey
    FOREIGN KEY (category_id)
    REFERENCES app.categories (category_id)
    ON DELETE RESTRICT,
  CONSTRAINT products_name_not_empty_chk CHECK (btrim(name) <> ''),
  CONSTRAINT products_slug_format_chk CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT products_sort_order_nonneg_chk CHECK (sort_order >= 0)
);

CREATE TABLE app.product_images (
  image_id   uuid        NOT NULL,
  product_id uuid        NOT NULL,
  image_url  text        NOT NULL,
  alt_text   text        NULL,
  sort_order integer     NOT NULL DEFAULT 0,
  is_primary boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_images_pkey PRIMARY KEY (image_id),
  CONSTRAINT product_images_product_id_fkey
    FOREIGN KEY (product_id)
    REFERENCES app.products (product_id)
    ON DELETE CASCADE,
  CONSTRAINT product_images_image_url_not_empty_chk CHECK (btrim(image_url) <> ''),
  CONSTRAINT product_images_sort_order_nonneg_chk CHECK (sort_order >= 0)
);

CREATE TABLE app.product_prices (
  price_id       uuid        NOT NULL,
  product_id     uuid        NOT NULL,
  amount_cents   bigint      NOT NULL,
  currency_code  text        NOT NULL DEFAULT 'BRL',
  is_promotional boolean     NOT NULL DEFAULT false,
  starts_at      timestamptz NULL,
  ends_at        timestamptz NULL,
  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_prices_pkey PRIMARY KEY (price_id),
  CONSTRAINT product_prices_product_id_fkey
    FOREIGN KEY (product_id)
    REFERENCES app.products (product_id)
    ON DELETE CASCADE,
  CONSTRAINT product_prices_amount_cents_positive_chk CHECK (amount_cents > 0),
  CONSTRAINT product_prices_currency_code_format_chk CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT product_prices_validity_window_chk
    CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX products_category_id_idx
  ON app.products (category_id);

CREATE INDEX product_images_product_id_idx
  ON app.product_images (product_id);

CREATE UNIQUE INDEX product_images_one_primary_per_product_idx
  ON app.product_images (product_id)
  WHERE is_primary = true;

CREATE INDEX product_prices_product_id_idx
  ON app.product_prices (product_id);

\echo 'Tabelas e indexes do nucleo do catalogo criados. Sem GRANT/REVOKE manual de negocio. Sem seed.'

-- ---------------------------------------------------------------------------
-- POSCONDICOES estruturais e de privilegio (ainda sob SET ROLE owner_role,
-- ainda na mesma transacao), ANTES do INSERT no ledger.
-- ---------------------------------------------------------------------------

SELECT
  ((SELECT array_agg(c.relname ORDER BY c.relname)
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relkind = 'r')
    = ARRAY['categories','product_images','product_prices','products','schema_migrations']) AS tables_exact,
  ((SELECT count(*)
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app'
        AND c.relkind = 'r'
        AND pg_get_userbyid(c.relowner) IS NOT DISTINCT FROM :'owner_role') = 5) AS all_tables_owner_ok,
  ((SELECT count(*)
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relkind = 'S') = 0) AS sequence_count_zero,
  ((SELECT count(*)
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app') = 0) AS routine_count_zero,
  NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'app'
      AND c.relkind NOT IN ('r', 'i')
  ) AS no_unexpected_relkind,
  NOT EXISTS (
    SELECT 1
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'app'
      AND c.relname IN ('categories','products','product_images','product_prices')
      AND c.relkind = 'r'
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND a.attidentity <> ''
  ) AS no_identity,
  NOT EXISTS (
    SELECT 1
    FROM pg_attrdef d
    JOIN pg_class c ON c.oid = d.adrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'app'
      AND c.relname IN ('categories','products','product_images','product_prices')
      AND c.relkind = 'r'
      AND pg_get_expr(d.adbin, d.adrelid) LIKE 'nextval%'
  ) AS no_nextval_default,
  NOT EXISTS (
    SELECT 1
    FROM pg_attrdef d
    JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
    JOIN pg_class c ON c.oid = d.adrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_type t ON t.oid = a.atttypid
    WHERE n.nspname = 'app'
      AND c.relname IN ('categories','products','product_images','product_prices')
      AND c.relkind = 'r'
      AND t.typname = 'uuid'
  ) AS uuid_columns_no_default,
  NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'app'
      AND c.relname IN ('categories','products','product_images','product_prices')
      AND NOT t.tgisinternal
  ) AS no_user_triggers,
  ((SELECT count(*) FROM app.categories) = 0) AS categories_empty,
  ((SELECT count(*) FROM app.products) = 0) AS products_empty,
  ((SELECT count(*) FROM app.product_images) = 0) AS product_images_empty,
  ((SELECT count(*) FROM app.product_prices) = 0) AS product_prices_empty
\gset post1_

\if :post1_tables_exact
\else
  \echo 'ERRO [0002]: conjunto de tabelas em app diverge do esperado (ledger + 4 tabelas do catalogo).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: conjunto de tabelas em app diverge';
  END;
  $fail$;
\endif
\if :post1_all_tables_owner_ok
\else
  \echo 'ERRO [0002]: alguma tabela em app nao pertence a owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: ownership de tabela diverge de owner_role';
  END;
  $fail$;
\endif
\if :post1_sequence_count_zero
\else
  \echo 'ERRO [0002]: foi criada sequence no schema app; esperado nenhuma.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: sequence criada no schema app';
  END;
  $fail$;
\endif
\if :post1_routine_count_zero
\else
  \echo 'ERRO [0002]: schema app passou a conter routine(s).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: schema app com routine(s)';
  END;
  $fail$;
\endif
\if :post1_no_unexpected_relkind
\else
  \echo 'ERRO [0002]: schema app possui relkind inesperado (alem de tabela/indice).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: relkind inesperado no schema app';
  END;
  $fail$;
\endif
\if :post1_no_identity
\else
  \echo 'ERRO [0002]: alguma tabela do catalogo possui coluna IDENTITY; proibido.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: coluna IDENTITY presente no catalogo';
  END;
  $fail$;
\endif
\if :post1_no_nextval_default
\else
  \echo 'ERRO [0002]: alguma tabela do catalogo possui default nextval (sequence); proibido.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: default nextval presente no catalogo';
  END;
  $fail$;
\endif
\if :post1_uuid_columns_no_default
\else
  \echo 'ERRO [0002]: alguma coluna uuid do catalogo possui default gerador; proibido nesta fase.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: coluna uuid com default gerador';
  END;
  $fail$;
\endif
\if :post1_no_user_triggers
\else
  \echo 'ERRO [0002]: trigger de usuario criada no catalogo; updated_at deve ser atualizado pela aplicacao.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: trigger de usuario presente no catalogo';
  END;
  $fail$;
\endif
\if :post1_categories_empty
\else
  \echo 'ERRO [0002]: app.categories nao esta vazia; seed e proibido nesta migration.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: app.categories contem dados';
  END;
  $fail$;
\endif
\if :post1_products_empty
\else
  \echo 'ERRO [0002]: app.products nao esta vazia; seed e proibido nesta migration.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: app.products contem dados';
  END;
  $fail$;
\endif
\if :post1_product_images_empty
\else
  \echo 'ERRO [0002]: app.product_images nao esta vazia; seed e proibido nesta migration.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: app.product_images contem dados';
  END;
  $fail$;
\endif
\if :post1_product_prices_empty
\else
  \echo 'ERRO [0002]: app.product_prices nao esta vazia; seed e proibido nesta migration.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: app.product_prices contem dados';
  END;
  $fail$;
\endif

SELECT
  ((SELECT array_agg(a.attname ORDER BY a.attnum)
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relname = 'categories' AND c.relkind = 'r'
        AND a.attnum > 0 AND NOT a.attisdropped)
    = ARRAY['category_id','name','slug','description','sort_order','is_active','created_at','updated_at']) AS categories_cols,
  ((SELECT array_agg(format_type(a.atttypid, a.atttypmod) ORDER BY a.attnum)
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relname = 'categories' AND c.relkind = 'r'
        AND a.attnum > 0 AND NOT a.attisdropped)
    = ARRAY['uuid','text','text','text','integer','boolean','timestamp with time zone','timestamp with time zone']) AS categories_types,
  ((SELECT array_agg(a.attname ORDER BY a.attnum)
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relname = 'products' AND c.relkind = 'r'
        AND a.attnum > 0 AND NOT a.attisdropped)
    = ARRAY['product_id','category_id','name','slug','description','is_active','is_featured','sort_order','created_at','updated_at']) AS products_cols,
  ((SELECT array_agg(format_type(a.atttypid, a.atttypmod) ORDER BY a.attnum)
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relname = 'products' AND c.relkind = 'r'
        AND a.attnum > 0 AND NOT a.attisdropped)
    = ARRAY['uuid','uuid','text','text','text','boolean','boolean','integer','timestamp with time zone','timestamp with time zone']) AS products_types,
  ((SELECT array_agg(a.attname ORDER BY a.attnum)
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relname = 'product_images' AND c.relkind = 'r'
        AND a.attnum > 0 AND NOT a.attisdropped)
    = ARRAY['image_id','product_id','image_url','alt_text','sort_order','is_primary','created_at']) AS product_images_cols,
  ((SELECT array_agg(format_type(a.atttypid, a.atttypmod) ORDER BY a.attnum)
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relname = 'product_images' AND c.relkind = 'r'
        AND a.attnum > 0 AND NOT a.attisdropped)
    = ARRAY['uuid','uuid','text','text','integer','boolean','timestamp with time zone']) AS product_images_types,
  ((SELECT array_agg(a.attname ORDER BY a.attnum)
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relname = 'product_prices' AND c.relkind = 'r'
        AND a.attnum > 0 AND NOT a.attisdropped)
    = ARRAY['price_id','product_id','amount_cents','currency_code','is_promotional','starts_at','ends_at','is_active','created_at']) AS product_prices_cols,
  ((SELECT array_agg(format_type(a.atttypid, a.atttypmod) ORDER BY a.attnum)
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relname = 'product_prices' AND c.relkind = 'r'
        AND a.attnum > 0 AND NOT a.attisdropped)
    = ARRAY['uuid','uuid','bigint','text','boolean','timestamp with time zone','timestamp with time zone','boolean','timestamp with time zone']) AS product_prices_types
\gset post2_

\if :post2_categories_cols
\else
  \echo 'ERRO [0002]: colunas de app.categories divergem do esperado.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: colunas de app.categories divergem';
  END;
  $fail$;
\endif
\if :post2_categories_types
\else
  \echo 'ERRO [0002]: tipos de app.categories divergem do esperado.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: tipos de app.categories divergem';
  END;
  $fail$;
\endif
\if :post2_products_cols
\else
  \echo 'ERRO [0002]: colunas de app.products divergem do esperado.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: colunas de app.products divergem';
  END;
  $fail$;
\endif
\if :post2_products_types
\else
  \echo 'ERRO [0002]: tipos de app.products divergem do esperado.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: tipos de app.products divergem';
  END;
  $fail$;
\endif
\if :post2_product_images_cols
\else
  \echo 'ERRO [0002]: colunas de app.product_images divergem do esperado.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: colunas de app.product_images divergem';
  END;
  $fail$;
\endif
\if :post2_product_images_types
\else
  \echo 'ERRO [0002]: tipos de app.product_images divergem do esperado.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: tipos de app.product_images divergem';
  END;
  $fail$;
\endif
\if :post2_product_prices_cols
\else
  \echo 'ERRO [0002]: colunas de app.product_prices divergem do esperado.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: colunas de app.product_prices divergem';
  END;
  $fail$;
\endif
\if :post2_product_prices_types
\else
  \echo 'ERRO [0002]: tipos de app.product_prices divergem do esperado.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: tipos de app.product_prices divergem';
  END;
  $fail$;
\endif

SELECT
  EXISTS (SELECT 1 FROM pg_constraint co JOIN pg_class c ON c.oid = co.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app' AND c.relname = 'categories' AND co.contype = 'p' AND co.conname = 'categories_pkey') AS categories_pk,
  EXISTS (SELECT 1 FROM pg_constraint co JOIN pg_class c ON c.oid = co.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app' AND c.relname = 'products' AND co.contype = 'p' AND co.conname = 'products_pkey') AS products_pk,
  EXISTS (SELECT 1 FROM pg_constraint co JOIN pg_class c ON c.oid = co.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app' AND c.relname = 'product_images' AND co.contype = 'p' AND co.conname = 'product_images_pkey') AS product_images_pk,
  EXISTS (SELECT 1 FROM pg_constraint co JOIN pg_class c ON c.oid = co.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app' AND c.relname = 'product_prices' AND co.contype = 'p' AND co.conname = 'product_prices_pkey') AS product_prices_pk,
  EXISTS (SELECT 1 FROM pg_constraint co JOIN pg_class c ON c.oid = co.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app' AND c.relname = 'categories' AND co.contype = 'u' AND co.conname = 'categories_slug_key') AS categories_slug_unique,
  EXISTS (SELECT 1 FROM pg_constraint co JOIN pg_class c ON c.oid = co.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app' AND c.relname = 'products' AND co.contype = 'u' AND co.conname = 'products_slug_key') AS products_slug_unique,
  EXISTS (
    SELECT 1
    FROM pg_constraint co
    JOIN pg_class src ON src.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = src.relnamespace
    JOIN pg_class dst ON dst.oid = co.confrelid
    WHERE n.nspname = 'app'
      AND src.relname = 'products'
      AND dst.relname = 'categories'
      AND co.contype = 'f'
      AND co.confdeltype = 'r'
      AND co.conname = 'products_category_id_fkey'
  ) AS products_fk_restrict,
  EXISTS (
    SELECT 1
    FROM pg_constraint co
    JOIN pg_class src ON src.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = src.relnamespace
    JOIN pg_class dst ON dst.oid = co.confrelid
    WHERE n.nspname = 'app'
      AND src.relname = 'product_images'
      AND dst.relname = 'products'
      AND co.contype = 'f'
      AND co.confdeltype = 'c'
      AND co.conname = 'product_images_product_id_fkey'
  ) AS product_images_fk_cascade,
  EXISTS (
    SELECT 1
    FROM pg_constraint co
    JOIN pg_class src ON src.oid = co.conrelid
    JOIN pg_namespace n ON n.oid = src.relnamespace
    JOIN pg_class dst ON dst.oid = co.confrelid
    WHERE n.nspname = 'app'
      AND src.relname = 'product_prices'
      AND dst.relname = 'products'
      AND co.contype = 'f'
      AND co.confdeltype = 'c'
      AND co.conname = 'product_prices_product_id_fkey'
  ) AS product_prices_fk_cascade,
  ((SELECT count(*)
      FROM pg_constraint co
      JOIN pg_class c ON c.oid = co.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app'
        AND c.relname IN ('categories','products','product_images','product_prices')
        AND co.contype = 'c') = 11) AS check_count_eleven,
  EXISTS (SELECT 1 FROM pg_constraint co JOIN pg_class c ON c.oid = co.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app' AND c.relname = 'categories' AND co.conname = 'categories_name_not_empty_chk' AND co.contype = 'c') AS categories_name_chk,
  EXISTS (SELECT 1 FROM pg_constraint co JOIN pg_class c ON c.oid = co.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app' AND c.relname = 'categories' AND co.conname = 'categories_slug_format_chk' AND co.contype = 'c') AS categories_slug_chk,
  EXISTS (SELECT 1 FROM pg_constraint co JOIN pg_class c ON c.oid = co.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app' AND c.relname = 'categories' AND co.conname = 'categories_sort_order_nonneg_chk' AND co.contype = 'c') AS categories_sort_chk,
  EXISTS (SELECT 1 FROM pg_constraint co JOIN pg_class c ON c.oid = co.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app' AND c.relname = 'products' AND co.conname = 'products_name_not_empty_chk' AND co.contype = 'c') AS products_name_chk,
  EXISTS (SELECT 1 FROM pg_constraint co JOIN pg_class c ON c.oid = co.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app' AND c.relname = 'products' AND co.conname = 'products_slug_format_chk' AND co.contype = 'c') AS products_slug_chk,
  EXISTS (SELECT 1 FROM pg_constraint co JOIN pg_class c ON c.oid = co.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app' AND c.relname = 'products' AND co.conname = 'products_sort_order_nonneg_chk' AND co.contype = 'c') AS products_sort_chk,
  EXISTS (SELECT 1 FROM pg_constraint co JOIN pg_class c ON c.oid = co.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app' AND c.relname = 'product_images' AND co.conname = 'product_images_image_url_not_empty_chk' AND co.contype = 'c') AS product_images_url_chk,
  EXISTS (SELECT 1 FROM pg_constraint co JOIN pg_class c ON c.oid = co.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app' AND c.relname = 'product_images' AND co.conname = 'product_images_sort_order_nonneg_chk' AND co.contype = 'c') AS product_images_sort_chk,
  EXISTS (SELECT 1 FROM pg_constraint co JOIN pg_class c ON c.oid = co.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app' AND c.relname = 'product_prices' AND co.conname = 'product_prices_amount_cents_positive_chk' AND co.contype = 'c') AS product_prices_amount_chk,
  EXISTS (SELECT 1 FROM pg_constraint co JOIN pg_class c ON c.oid = co.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app' AND c.relname = 'product_prices' AND co.conname = 'product_prices_currency_code_format_chk' AND co.contype = 'c') AS product_prices_currency_chk,
  EXISTS (SELECT 1 FROM pg_constraint co JOIN pg_class c ON c.oid = co.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app' AND c.relname = 'product_prices' AND co.conname = 'product_prices_validity_window_chk' AND co.contype = 'c') AS product_prices_window_chk
\gset post3_

\if :post3_categories_pk
\else
  \echo 'ERRO [0002]: PK de app.categories ausente ou com nome inesperado.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: PK de app.categories';
  END;
  $fail$;
\endif
\if :post3_products_pk
\else
  \echo 'ERRO [0002]: PK de app.products ausente ou com nome inesperado.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: PK de app.products';
  END;
  $fail$;
\endif
\if :post3_product_images_pk
\else
  \echo 'ERRO [0002]: PK de app.product_images ausente ou com nome inesperado.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: PK de app.product_images';
  END;
  $fail$;
\endif
\if :post3_product_prices_pk
\else
  \echo 'ERRO [0002]: PK de app.product_prices ausente ou com nome inesperado.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: PK de app.product_prices';
  END;
  $fail$;
\endif
\if :post3_categories_slug_unique
\else
  \echo 'ERRO [0002]: UNIQUE de slug em app.categories ausente.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: UNIQUE slug de categories';
  END;
  $fail$;
\endif
\if :post3_products_slug_unique
\else
  \echo 'ERRO [0002]: UNIQUE de slug em app.products ausente.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: UNIQUE slug de products';
  END;
  $fail$;
\endif
\if :post3_products_fk_restrict
\else
  \echo 'ERRO [0002]: FK products.category_id -> categories ON DELETE RESTRICT ausente ou incorreta.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: FK products -> categories';
  END;
  $fail$;
\endif
\if :post3_product_images_fk_cascade
\else
  \echo 'ERRO [0002]: FK product_images.product_id -> products ON DELETE CASCADE ausente ou incorreta.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: FK product_images -> products';
  END;
  $fail$;
\endif
\if :post3_product_prices_fk_cascade
\else
  \echo 'ERRO [0002]: FK product_prices.product_id -> products ON DELETE CASCADE ausente ou incorreta.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: FK product_prices -> products';
  END;
  $fail$;
\endif
\if :post3_check_count_eleven
\else
  \echo 'ERRO [0002]: quantidade de CHECK constraints do catalogo diverge de 11.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: quantidade de CHECK constraints diverge';
  END;
  $fail$;
\endif
\if :post3_categories_name_chk
\else
  \echo 'ERRO [0002]: CHECK categories_name_not_empty_chk ausente.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: CHECK name de categories';
  END;
  $fail$;
\endif
\if :post3_categories_slug_chk
\else
  \echo 'ERRO [0002]: CHECK categories_slug_format_chk ausente.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: CHECK slug de categories';
  END;
  $fail$;
\endif
\if :post3_categories_sort_chk
\else
  \echo 'ERRO [0002]: CHECK categories_sort_order_nonneg_chk ausente.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: CHECK sort_order de categories';
  END;
  $fail$;
\endif
\if :post3_products_name_chk
\else
  \echo 'ERRO [0002]: CHECK products_name_not_empty_chk ausente.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: CHECK name de products';
  END;
  $fail$;
\endif
\if :post3_products_slug_chk
\else
  \echo 'ERRO [0002]: CHECK products_slug_format_chk ausente.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: CHECK slug de products';
  END;
  $fail$;
\endif
\if :post3_products_sort_chk
\else
  \echo 'ERRO [0002]: CHECK products_sort_order_nonneg_chk ausente.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: CHECK sort_order de products';
  END;
  $fail$;
\endif
\if :post3_product_images_url_chk
\else
  \echo 'ERRO [0002]: CHECK product_images_image_url_not_empty_chk ausente.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: CHECK image_url de product_images';
  END;
  $fail$;
\endif
\if :post3_product_images_sort_chk
\else
  \echo 'ERRO [0002]: CHECK product_images_sort_order_nonneg_chk ausente.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: CHECK sort_order de product_images';
  END;
  $fail$;
\endif
\if :post3_product_prices_amount_chk
\else
  \echo 'ERRO [0002]: CHECK product_prices_amount_cents_positive_chk ausente.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: CHECK amount_cents de product_prices';
  END;
  $fail$;
\endif
\if :post3_product_prices_currency_chk
\else
  \echo 'ERRO [0002]: CHECK product_prices_currency_code_format_chk ausente.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: CHECK currency_code de product_prices';
  END;
  $fail$;
\endif
\if :post3_product_prices_window_chk
\else
  \echo 'ERRO [0002]: CHECK product_prices_validity_window_chk ausente.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: CHECK janela de product_prices';
  END;
  $fail$;
\endif

SELECT
  ((SELECT array_agg(idx.relname ORDER BY idx.relname)
      FROM pg_class idx
      JOIN pg_index i ON i.indexrelid = idx.oid
      JOIN pg_class tbl ON tbl.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = tbl.relnamespace
      WHERE n.nspname = 'app')
    = ARRAY[
      'categories_pkey',
      'categories_slug_key',
      'product_images_one_primary_per_product_idx',
      'product_images_pkey',
      'product_images_product_id_idx',
      'product_prices_pkey',
      'product_prices_product_id_idx',
      'products_category_id_idx',
      'products_pkey',
      'products_slug_key',
      'schema_migrations_pkey'
    ]) AS indexes_exact,
  EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class idx ON idx.oid = i.indexrelid
    JOIN pg_class tbl ON tbl.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = tbl.relnamespace
    WHERE n.oid = :pre1_app_namespace_oid
      AND tbl.relname = 'product_images'
      AND tbl.relkind = 'r'
      AND idx.relnamespace = n.oid
      AND idx.relname = 'product_images_one_primary_per_product_idx'
      AND i.indisunique = true
  ) AS primary_image_idx_on_table_unique,
  EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class idx ON idx.oid = i.indexrelid
    JOIN pg_class tbl ON tbl.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = tbl.relnamespace
    JOIN pg_attribute col ON col.attrelid = tbl.oid
      AND col.attname = 'product_id'
      AND col.attnum > 0
      AND NOT col.attisdropped
    WHERE n.oid = :pre1_app_namespace_oid
      AND tbl.relname = 'product_images'
      AND tbl.relkind = 'r'
      AND idx.relnamespace = n.oid
      AND idx.relname = 'product_images_one_primary_per_product_idx'
      AND i.indnkeyatts = 1
      AND i.indnatts = 1
      AND i.indkey::smallint[] = ARRAY[col.attnum]::smallint[]
  ) AS primary_image_idx_indkey_product_id,
  EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class idx ON idx.oid = i.indexrelid
    JOIN pg_class tbl ON tbl.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = tbl.relnamespace
    WHERE n.oid = :pre1_app_namespace_oid
      AND tbl.relname = 'product_images'
      AND tbl.relkind = 'r'
      AND idx.relnamespace = n.oid
      AND idx.relname = 'product_images_one_primary_per_product_idx'
      AND i.indpred IS NOT NULL
      AND replace(replace(pg_get_expr(i.indpred, i.indrelid), '::boolean', ''), ' ', '')
          IN ('(is_primary=true)', 'is_primary=true', '(is_primaryISTRUE)', 'is_primaryISTRUE', 'is_primary')
  ) AS primary_image_idx_pred_is_primary
\gset post4_

\if :post4_indexes_exact
\else
  \echo 'ERRO [0002]: conjunto de indexes em app diverge do esperado.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: conjunto de indexes diverge';
  END;
  $fail$;
\endif
\if :post4_primary_image_idx_on_table_unique
\else
  \echo 'ERRO [0002]: UNIQUE INDEX parcial de imagem primaria nao pertence a app.product_images ou nao e UNIQUE.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: UNIQUE INDEX parcial nao pertence a app.product_images ou nao e UNIQUE';
  END;
  $fail$;
\endif
\if :post4_primary_image_idx_indkey_product_id
\else
  \echo 'ERRO [0002]: UNIQUE INDEX parcial de imagem primaria nao referencia exatamente a coluna product_id (indkey/attnum).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: UNIQUE INDEX parcial nao referencia exatamente product_id';
  END;
  $fail$;
\endif
\if :post4_primary_image_idx_pred_is_primary
\else
  \echo 'ERRO [0002]: predicado do UNIQUE INDEX parcial de imagem primaria nao corresponde a is_primary=true.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: predicado do UNIQUE INDEX parcial de imagem primaria';
  END;
  $fail$;
\endif

-- Runtime APP DML exato nas 4 tabelas novas, por catalogo (relacl +
-- aclexplode). Esperado: SELECT, INSERT, UPDATE, DELETE.
-- is_grantable=false. Sem TRUNCATE/REFERENCES/TRIGGER.
-- PUBLIC=zero. Migrator=zero. Owner = relowner (ACL explicita do Owner
-- nao exigida). QUALQUER outro grantee (OID diferente de Owner e APP,
-- incluindo PUBLIC, Migrator, role dropped e qualquer quarta role) =
-- FAIL CLOSED. Sem GRANT/REVOKE manual de negocio.
SELECT
  (
    SELECT count(*)
    FROM unnest(ARRAY['categories','products','product_images','product_prices']) AS t(relname)
    WHERE (
      SELECT coalesce(array_agg(a.privilege_type ORDER BY a.privilege_type), ARRAY[]::text[])
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, '{}'::aclitem[])) a
      JOIN pg_roles r ON r.oid = a.grantee
      WHERE n.nspname = 'app'
        AND c.relkind = 'r'
        AND c.relname = t.relname
        AND r.rolname = :'app_role'
    ) = ARRAY['DELETE','INSERT','SELECT','UPDATE']
  ) = 4 AS app_dml_exact_all_four,
  NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY['categories','products','product_images','product_prices']) AS t(relname)
    JOIN pg_class c ON c.relname = t.relname AND c.relkind = 'r'
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'app'
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, '{}'::aclitem[])) a
    JOIN pg_roles r ON r.oid = a.grantee
    WHERE n.nspname = 'app'
      AND r.rolname = :'app_role'
      AND a.is_grantable = true
  ) AS app_no_grant_option,
  NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY['categories','products','product_images','product_prices']) AS t(relname)
    JOIN pg_class c ON c.relname = t.relname AND c.relkind = 'r'
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'app'
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, '{}'::aclitem[])) a
    JOIN pg_roles r ON r.oid = a.grantee
    WHERE n.nspname = 'app'
      AND r.rolname = :'app_role'
      AND a.privilege_type IN ('TRUNCATE','REFERENCES','TRIGGER')
  ) AS app_no_forbidden_privs,
  NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY['categories','products','product_images','product_prices']) AS t(relname)
    JOIN pg_class c ON c.relname = t.relname AND c.relkind = 'r'
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'app'
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, '{}'::aclitem[])) a
    WHERE n.nspname = 'app'
      AND a.grantee = 0
  ) AS public_zero_on_catalog,
  NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY['categories','products','product_images','product_prices']) AS t(relname)
    JOIN pg_class c ON c.relname = t.relname AND c.relkind = 'r'
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'app'
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, '{}'::aclitem[])) a
    JOIN pg_roles r ON r.oid = a.grantee
    WHERE n.nspname = 'app'
      AND r.rolname = :'migrator_role'
  ) AS migrator_zero_on_catalog,
  NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY['categories','products','product_images','product_prices']) AS t(relname)
    JOIN pg_class c ON c.relname = t.relname AND c.relkind = 'r'
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'app'
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, '{}'::aclitem[])) a
    WHERE a.grantee IS DISTINCT FROM c.relowner
      AND a.grantee IS DISTINCT FROM (SELECT oid FROM pg_roles WHERE rolname = :'app_role')
  ) AS catalog_no_unexpected_grantee,
  NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) a
    JOIN pg_roles r ON r.oid = a.grantee
    WHERE n.nspname = 'app'
      AND c.relname = 'schema_migrations'
      AND c.relkind = 'r'
      AND r.rolname = :'app_role'
  ) AS ledger_still_app_zero,
  NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) a
    JOIN pg_roles r ON r.oid = a.grantee
    WHERE n.nspname = 'app'
      AND c.relname = 'schema_migrations'
      AND c.relkind = 'r'
      AND r.rolname = :'migrator_role'
  ) AS ledger_still_migrator_zero,
  NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) a
    WHERE n.nspname = 'app'
      AND c.relname = 'schema_migrations'
      AND c.relkind = 'r'
      AND a.grantee = 0
  ) AS ledger_still_public_zero
\gset post5_

\if :post5_app_dml_exact_all_four
\else
  \echo 'ERRO [0002]: Runtime APP nao possui exatamente SELECT/INSERT/UPDATE/DELETE nas 4 tabelas do catalogo. Defaults 5.0D.6F divergiram; FAIL CLOSED sem GRANT manual.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: DML de app_role nas tabelas do catalogo diverge';
  END;
  $fail$;
\endif
\if :post5_app_no_grant_option
\else
  \echo 'ERRO [0002]: app_role possui grant option em alguma tabela do catalogo.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: app_role com grant option no catalogo';
  END;
  $fail$;
\endif
\if :post5_app_no_forbidden_privs
\else
  \echo 'ERRO [0002]: app_role possui TRUNCATE, REFERENCES ou TRIGGER em alguma tabela do catalogo.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: app_role com privilegio proibido no catalogo';
  END;
  $fail$;
\endif
\if :post5_public_zero_on_catalog
\else
  \echo 'ERRO [0002]: PUBLIC possui privilege em alguma tabela do catalogo.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: PUBLIC com privilege no catalogo';
  END;
  $fail$;
\endif
\if :post5_migrator_zero_on_catalog
\else
  \echo 'ERRO [0002]: migrator_role possui privilege direto em alguma tabela do catalogo.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: migrator_role com privilege direto no catalogo';
  END;
  $fail$;
\endif
\if :post5_catalog_no_unexpected_grantee
\else
  \echo 'ERRO [0002]: alguma tabela do catalogo possui grantee inesperado (alem de Owner e APP). FAIL CLOSED.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: grantee inesperado na ACL das tabelas do catalogo';
  END;
  $fail$;
\endif
\if :post5_ledger_still_app_zero
\else
  \echo 'ERRO [0002]: app_role passou a possuir ACL no ledger.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: app_role com ACL no ledger';
  END;
  $fail$;
\endif
\if :post5_ledger_still_migrator_zero
\else
  \echo 'ERRO [0002]: migrator_role passou a possuir ACL no ledger.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: migrator_role com ACL no ledger';
  END;
  $fail$;
\endif
\if :post5_ledger_still_public_zero
\else
  \echo 'ERRO [0002]: PUBLIC passou a possuir ACL no ledger.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: PUBLIC com ACL no ledger';
  END;
  $fail$;
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
  '0002_create_catalog_core',
  :'migration_sha256',
  'Cria o nucleo estrutural do catalogo: app.categories, app.products, app.product_images e app.product_prices.',
  now(),
  session_user::text,
  current_user::text,
  current_database()
);

\echo 'Registro 0002 inserido no ledger.'

SELECT
  ((SELECT count(*) FROM app.schema_migrations) = 2) AS ledger_rowcount_two,
  EXISTS (
    SELECT 1
    FROM app.schema_migrations
    WHERE migration_id = '0001_create_migration_ledger'
      AND checksum_sha256 = 'bb018fc0c74c17d8ee072fb0c0711d60ead28ce587c47e2bc1bc7dd0664991c0'
  ) AS ledger_0001_intact,
  EXISTS (
    SELECT 1
    FROM app.schema_migrations
    WHERE migration_id = '0002_create_catalog_core'
      AND checksum_sha256 IS NOT DISTINCT FROM :'migration_sha256'
      AND applied_by_login IS NOT DISTINCT FROM :'migrator_role'
      AND applied_as_role IS NOT DISTINCT FROM :'owner_role'
      AND database_name IS NOT DISTINCT FROM current_database()
      AND database_name IS NOT DISTINCT FROM :'target_database'
      AND applied_by_login IS NOT DISTINCT FROM session_user::text
      AND applied_as_role IS NOT DISTINCT FROM current_user::text
  ) AS ledger_0002_exact
\gset post6_

\if :post6_ledger_rowcount_two
\else
  \echo 'ERRO [0002]: ledger nao possui exatamente 2 registros apos INSERT.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: ledger nao possui exatamente 2 registros';
  END;
  $fail$;
\endif
\if :post6_ledger_0001_intact
\else
  \echo 'ERRO [0002]: checksum/registro 0001 foi alterado.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: registro 0001 divergiu';
  END;
  $fail$;
\endif
\if :post6_ledger_0002_exact
\else
  \echo 'ERRO [0002]: registro da migration 0002 diverge (migration_id, checksum, login, role ou database).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: registro da migration 0002 diverge do esperado';
  END;
  $fail$;
\endif

-- Default ACL, search_path, memberships e DB CREATE intactos.
-- Default ACL revalida grantees por OID/aclexplode: somente os esperados.
SELECT
  ((SELECT count(*)
      FROM pg_default_acl d
      JOIN pg_roles r ON r.oid = d.defaclrole
      WHERE r.rolname = :'owner_role') = 3) AS owner_total_default_acl_row_count_exact_three,
  ((SELECT count(*)
      FROM pg_default_acl d
      JOIN pg_roles r ON r.oid = d.defaclrole
      WHERE r.rolname = :'owner_role'
        AND d.defaclnamespace = 0
        AND d.defaclobjtype = 'f') = 1) AS owner_global_functions_default_acl_exists,
  ((SELECT count(*)
      FROM pg_default_acl d
      JOIN pg_roles r ON r.oid = d.defaclrole
      WHERE r.rolname = :'owner_role'
        AND d.defaclnamespace = :pre1_app_namespace_oid
        AND d.defaclobjtype = 'r') = 1) AS owner_tables_default_acl_in_app_schema_exists_once,
  ((SELECT count(*)
      FROM pg_default_acl d
      JOIN pg_roles r ON r.oid = d.defaclrole
      WHERE r.rolname = :'owner_role'
        AND d.defaclnamespace = :pre1_app_namespace_oid
        AND d.defaclobjtype = 'S') = 1) AS owner_sequences_default_acl_in_app_schema_exists_once,
  ((SELECT array_agg(a.privilege_type ORDER BY a.privilege_type)
      FROM pg_default_acl d
      JOIN pg_roles r ON r.oid = d.defaclrole
      CROSS JOIN LATERAL aclexplode(d.defaclacl) a
      JOIN pg_roles gr ON gr.oid = a.grantee
      WHERE r.rolname = :'owner_role'
        AND d.defaclnamespace = :pre1_app_namespace_oid
        AND d.defaclobjtype = 'r'
        AND gr.rolname = :'app_role') = ARRAY['DELETE','INSERT','SELECT','UPDATE']) AS app_tables_privs_exact,
  ((SELECT array_agg(a.privilege_type ORDER BY a.privilege_type)
      FROM pg_default_acl d
      JOIN pg_roles r ON r.oid = d.defaclrole
      CROSS JOIN LATERAL aclexplode(d.defaclacl) a
      JOIN pg_roles gr ON gr.oid = a.grantee
      WHERE r.rolname = :'owner_role'
        AND d.defaclnamespace = :pre1_app_namespace_oid
        AND d.defaclobjtype = 'S'
        AND gr.rolname = :'app_role') = ARRAY['USAGE']) AS app_sequences_privs_exact,
  ((SELECT count(*)
      FROM pg_default_acl d
      JOIN pg_roles r ON r.oid = d.defaclrole
      WHERE r.rolname = :'migrator_role') = 0) AS migrator_default_acl_zero,
  ((SELECT count(*)
      FROM pg_default_acl d
      JOIN pg_roles r ON r.oid = d.defaclrole
      WHERE r.rolname = :'app_role') = 0) AS app_default_acl_zero,
  NOT EXISTS (
    SELECT 1
    FROM pg_default_acl d
    JOIN pg_roles r ON r.oid = d.defaclrole
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE r.rolname = :'owner_role'
      AND d.defaclnamespace = :pre1_app_namespace_oid
      AND d.defaclobjtype = 'r'
      AND a.grantee IS DISTINCT FROM d.defaclrole
      AND a.grantee IS DISTINCT FROM (SELECT oid FROM pg_roles WHERE rolname = :'app_role')
  ) AS tables_no_unexpected_grantee,
  NOT EXISTS (
    SELECT 1
    FROM pg_default_acl d
    JOIN pg_roles r ON r.oid = d.defaclrole
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE r.rolname = :'owner_role'
      AND d.defaclnamespace = :pre1_app_namespace_oid
      AND d.defaclobjtype = 'S'
      AND a.grantee IS DISTINCT FROM d.defaclrole
      AND a.grantee IS DISTINCT FROM (SELECT oid FROM pg_roles WHERE rolname = :'app_role')
  ) AS sequences_no_unexpected_grantee,
  NOT EXISTS (
    SELECT 1
    FROM pg_default_acl d
    JOIN pg_roles r ON r.oid = d.defaclrole
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE r.rolname = :'owner_role'
      AND d.defaclnamespace = 0
      AND d.defaclobjtype = 'f'
      AND a.grantee IS DISTINCT FROM d.defaclrole
  ) AS functions_no_unexpected_grantee
\gset post7_

\if :post7_owner_total_default_acl_row_count_exact_three
\else
  \echo 'ERRO [0002]: pg_default_acl de owner_role deixou de ter exatamente 3 entradas.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: pg_default_acl de owner_role divergiu da baseline';
  END;
  $fail$;
\endif
\if :post7_owner_global_functions_default_acl_exists
\else
  \echo 'ERRO [0002]: entrada GLOBAL de FUNCTIONS de owner_role ausente apos CREATE.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: entrada global de FUNCTIONS ausente';
  END;
  $fail$;
\endif
\if :post7_owner_tables_default_acl_in_app_schema_exists_once
\else
  \echo 'ERRO [0002]: entrada TABLES (schema app) de owner_role divergiu da baseline.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: default ACL de TABLES divergiu';
  END;
  $fail$;
\endif
\if :post7_owner_sequences_default_acl_in_app_schema_exists_once
\else
  \echo 'ERRO [0002]: entrada SEQUENCES (schema app) de owner_role divergiu da baseline.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: default ACL de SEQUENCES divergiu';
  END;
  $fail$;
\endif
\if :post7_app_tables_privs_exact
\else
  \echo 'ERRO [0002]: privilegios default de TABLES para app_role divergiram da baseline.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: privilegios default de TABLES para app_role divergiram';
  END;
  $fail$;
\endif
\if :post7_app_sequences_privs_exact
\else
  \echo 'ERRO [0002]: privilegios default de SEQUENCES para app_role divergiram da baseline.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: privilegios default de SEQUENCES para app_role divergiram';
  END;
  $fail$;
\endif
\if :post7_migrator_default_acl_zero
\else
  \echo 'ERRO [0002]: migrator_role passou a possuir pg_default_acl.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: migrator_role com pg_default_acl inesperado';
  END;
  $fail$;
\endif
\if :post7_app_default_acl_zero
\else
  \echo 'ERRO [0002]: app_role passou a possuir pg_default_acl como defaclrole.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: app_role com pg_default_acl inesperado';
  END;
  $fail$;
\endif
\if :post7_tables_no_unexpected_grantee
\else
  \echo 'ERRO [0002]: default ACL de TABLES (schema app) passou a possuir grantee inesperado (alem de Owner e APP). FAIL CLOSED.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: grantee inesperado no default ACL de TABLES apos CREATE';
  END;
  $fail$;
\endif
\if :post7_sequences_no_unexpected_grantee
\else
  \echo 'ERRO [0002]: default ACL de SEQUENCES (schema app) passou a possuir grantee inesperado (alem de Owner e APP). FAIL CLOSED.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: grantee inesperado no default ACL de SEQUENCES apos CREATE';
  END;
  $fail$;
\endif
\if :post7_functions_no_unexpected_grantee
\else
  \echo 'ERRO [0002]: default ACL GLOBAL de FUNCTIONS passou a possuir grantee inesperado (alem de Owner). FAIL CLOSED.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: grantee inesperado no default ACL global de FUNCTIONS apos CREATE';
  END;
  $fail$;
\endif

SELECT
  ((SELECT string_to_array(regexp_replace(split_part(elem, '=', 2), '\s+', '', 'g'), ',')
      FROM pg_db_role_setting s
      JOIN pg_roles r ON r.oid = s.setrole
      JOIN pg_database d ON d.oid = s.setdatabase
      CROSS JOIN LATERAL unnest(s.setconfig) AS elem
      WHERE r.rolname = :'owner_role' AND d.datname = :'target_database'
        AND split_part(elem, '=', 1) = 'search_path') = ARRAY['app', 'pg_catalog']) AS owner_search_path_still_ok,
  ((SELECT string_to_array(regexp_replace(split_part(elem, '=', 2), '\s+', '', 'g'), ',')
      FROM pg_db_role_setting s
      JOIN pg_roles r ON r.oid = s.setrole
      JOIN pg_database d ON d.oid = s.setdatabase
      CROSS JOIN LATERAL unnest(s.setconfig) AS elem
      WHERE r.rolname = :'migrator_role' AND d.datname = :'target_database'
        AND split_part(elem, '=', 1) = 'search_path') = ARRAY['app', 'pg_catalog']) AS migrator_search_path_still_ok,
  ((SELECT string_to_array(regexp_replace(split_part(elem, '=', 2), '\s+', '', 'g'), ',')
      FROM pg_db_role_setting s
      JOIN pg_roles r ON r.oid = s.setrole
      JOIN pg_database d ON d.oid = s.setdatabase
      CROSS JOIN LATERAL unnest(s.setconfig) AS elem
      WHERE r.rolname = :'app_role' AND d.datname = :'target_database'
        AND split_part(elem, '=', 1) = 'search_path') = ARRAY['app', 'pg_catalog']) AS app_search_path_still_ok,
  has_database_privilege(:'owner_role', current_database(), 'CREATE')    AS owner_db_create,
  has_database_privilege(:'migrator_role', current_database(), 'CREATE') AS migrator_db_create,
  has_database_privilege(:'app_role', current_database(), 'CREATE')      AS app_db_create,
  EXISTS (
    SELECT 1
    FROM pg_auth_members m
    JOIN pg_roles r   ON r.oid = m.roleid
    JOIN pg_roles mem ON mem.oid = m.member
    WHERE r.rolname = :'owner_role'
      AND mem.rolname = :'migrator_role'
      AND m.admin_option = false
      AND m.inherit_option = false
      AND m.set_option = true
  ) AS migrator_owner_membership_exact,
  NOT EXISTS (
    SELECT 1
    FROM pg_auth_members m
    JOIN pg_roles r   ON r.oid = m.roleid
    JOIN pg_roles mem ON mem.oid = m.member
    WHERE r.rolname = :'owner_role'
      AND mem.rolname = :'migrator_role'
      AND (m.admin_option = true OR m.inherit_option = true)
  ) AS migrator_owner_no_extra_membership,
  NOT EXISTS (
    SELECT 1
    FROM pg_auth_members m
    JOIN pg_roles r   ON r.oid = m.roleid
    JOIN pg_roles mem ON mem.oid = m.member
    WHERE r.rolname = :'owner_role'
      AND mem.rolname = :'app_role'
  ) AS app_owner_no_direct_membership,
  NOT EXISTS (
    SELECT 1
    FROM pg_auth_members m
    JOIN pg_roles r   ON r.oid = m.roleid
    JOIN pg_roles mem ON mem.oid = m.member
    WHERE r.rolname = :'migrator_role'
      AND mem.rolname = :'app_role'
  ) AS app_migrator_no_direct_membership,
  (pg_has_role(:'app_role', :'owner_role', 'SET') = false)    AS app_cannot_set_owner,
  (pg_has_role(:'app_role', :'migrator_role', 'SET') = false) AS app_cannot_set_migrator
\gset post8_

\if :post8_owner_search_path_still_ok
\else
  \echo 'ERRO [0002]: search_path de owner_role mudou.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: search_path de owner_role mudou';
  END;
  $fail$;
\endif
\if :post8_migrator_search_path_still_ok
\else
  \echo 'ERRO [0002]: search_path de migrator_role mudou.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: search_path de migrator_role mudou';
  END;
  $fail$;
\endif
\if :post8_app_search_path_still_ok
\else
  \echo 'ERRO [0002]: search_path de app_role mudou.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: search_path de app_role mudou';
  END;
  $fail$;
\endif
\if :post8_owner_db_create
  \echo 'ERRO [0002]: owner_role passou a possuir CREATE no database.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: owner_role com CREATE no database';
  END;
  $fail$;
\endif
\if :post8_migrator_db_create
  \echo 'ERRO [0002]: migrator_role passou a possuir CREATE no database.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: migrator_role com CREATE no database';
  END;
  $fail$;
\endif
\if :post8_app_db_create
  \echo 'ERRO [0002]: app_role passou a possuir CREATE no database.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: app_role com CREATE no database';
  END;
  $fail$;
\endif
\if :post8_migrator_owner_membership_exact
\else
  \echo 'ERRO [0002]: membership Migrator->Owner deixou de ser exata.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: membership Migrator->Owner nao permanece exata';
  END;
  $fail$;
\endif
\if :post8_migrator_owner_no_extra_membership
\else
  \echo 'ERRO [0002]: passou a existir membership adicional Migrator->Owner.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: membership adicional Migrator->Owner';
  END;
  $fail$;
\endif
\if :post8_app_owner_no_direct_membership
\else
  \echo 'ERRO [0002]: app_role passou a possuir membership direta em owner_role.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: app_role com membership direta em owner_role';
  END;
  $fail$;
\endif
\if :post8_app_migrator_no_direct_membership
\else
  \echo 'ERRO [0002]: app_role passou a possuir membership direta em migrator_role.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: app_role com membership direta em migrator_role';
  END;
  $fail$;
\endif
\if :post8_app_cannot_set_owner
\else
  \echo 'ERRO [0002]: app_role passou a poder SET ROLE owner_role.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: app_role com SET ROLE para owner_role';
  END;
  $fail$;
\endif
\if :post8_app_cannot_set_migrator
\else
  \echo 'ERRO [0002]: app_role passou a poder SET ROLE migrator_role.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: app_role com SET ROLE para migrator_role';
  END;
  $fail$;
\endif

\echo 'Poscondicoes de 0002 validadas sob identidade owner_role.'

RESET ROLE;

SELECT
  (session_user IS NOT DISTINCT FROM :'migrator_role') AS session_is_migrator,
  (current_user IS NOT DISTINCT FROM :'migrator_role') AS current_is_migrator
\gset postReset_

\if :postReset_session_is_migrator
\else
  \echo 'ERRO [0002]: falha pos RESET ROLE: session_user difere de migrator_role (:migrator_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Falha pos RESET ROLE: session_user difere de migrator_role';
  END;
  $fail$;
\endif
\if :postReset_current_is_migrator
\else
  \echo 'ERRO [0002]: falha pos RESET ROLE: current_user difere de migrator_role (:migrator_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Falha pos RESET ROLE: current_user difere de migrator_role';
  END;
  $fail$;
\endif

\echo 'RESET ROLE confirmado: sessao retornou a migrator_role.'

COMMIT;

\echo '=== 0002: CREATE CATALOG CORE - concluido. Nucleo do catalogo criado, owned by owner_role, sem seed, Runtime APP com DML default nas 4 tabelas, ledger com 0001+0002. ==='
