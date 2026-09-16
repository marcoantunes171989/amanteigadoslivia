-- =============================================================================
-- 0001_create_migration_ledger.sql
--
-- Fase: 5.0D.6G MIGRATION FRAMEWORK DRAFT.
-- Este arquivo e DRAFT. Nao executar nesta fase.
--
-- Identidade esperada: Migrator do ambiente, autenticado por LOGIN real.
--   Fluxo obrigatorio (uma unica transacao):
--     LOGIN migrator_role
--     -> BEGIN
--     -> prechecks
--     -> SET ROLE owner_role
--     -> CREATE TABLE app.schema_migrations
--     -> remover grants automaticos do ledger
--     -> inserir registro da propria migration
--     -> poschecks
--     -> RESET ROLE
--     -> COMMIT
-- Runtime APP nunca executa migration.
--
-- Efeito: cria o ledger app.schema_migrations (sem schema administrativo
-- adicional, sem sequence/identity) e registra a propria migration 0001.
-- O default privilege de TABLES do schema app concederia DML automatico
-- a app_role; esta migration REMOVE esse grant do ledger na mesma
-- transacao. Runtime APP termina com ZERO privilege no ledger.
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
-- e set_option (PG 16+), mesma baseline de config/001-003. A validacao de
-- privilegios do ledger usa pg_class.relacl / aclexplode e NAO depende de
-- privilege nominal de versao posterior.
-- =============================================================================

\set ON_ERROR_STOP on

\if :{?target_database}
\else
  \echo 'ERRO [0001]: variavel psql "target_database" ausente. Use -v target_database=... Nenhum CREATE/REVOKE/INSERT sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: target_database. Migration 0001 abortada antes de qualquer instrucao SQL.';
  END;
  $missing_var$;
\endif
\if :{?owner_role}
\else
  \echo 'ERRO [0001]: variavel psql "owner_role" ausente. Use -v owner_role=... Nenhum CREATE/REVOKE/INSERT sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: owner_role. Migration 0001 abortada antes de qualquer instrucao SQL.';
  END;
  $missing_var$;
\endif
\if :{?migrator_role}
\else
  \echo 'ERRO [0001]: variavel psql "migrator_role" ausente. Use -v migrator_role=... Nenhum CREATE/REVOKE/INSERT sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: migrator_role. Migration 0001 abortada antes de qualquer instrucao SQL.';
  END;
  $missing_var$;
\endif
\if :{?app_role}
\else
  \echo 'ERRO [0001]: variavel psql "app_role" ausente. Use -v app_role=... Nenhum CREATE/REVOKE/INSERT sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: app_role. Migration 0001 abortada antes de qualquer instrucao SQL.';
  END;
  $missing_var$;
\endif
\if :{?migration_sha256}
\else
  \echo 'ERRO [0001]: variavel psql "migration_sha256" ausente. Use -v migration_sha256=<sha256 hex 64>. O checksum e calculado fora do SQL. Nenhum CREATE/REVOKE/INSERT sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: migration_sha256. Migration 0001 abortada antes de qualquer instrucao SQL.';
  END;
  $missing_var$;
\endif

SELECT (:'migration_sha256' ~ '^[0-9a-fA-F]{64}$') AS sha256_format_ok
\gset preSha_

\if :preSha_sha256_format_ok
\else
  \echo 'ERRO [0001]: migration_sha256 nao possui formato SHA256 (64 caracteres hexadecimais).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migration_sha256 nao possui formato SHA256 (64 caracteres hexadecimais)';
  END;
  $fail$;
\endif

\echo '=== 0001: CREATE MIGRATION LEDGER - inicio ==='
\echo 'Este script deve ser executado autenticado como migrator_role.'
\echo 'DRAFT: nao executar nesta fase.'

BEGIN;

-- ---------------------------------------------------------------------------
-- PRECONDICOES (SQL top-level + \gset + \if), ANTES de SET ROLE / CREATE.
-- Cada checagem aborta a transacao via DO estatico caso falhe.
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
  \echo 'ERRO [0001]: PostgreSQL < 16. Esta migration exige server_version_num >= 160000 (pg_auth_members inherit_option/set_option).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: PostgreSQL inferior a 16';
  END;
  $fail$;
\endif
\if :pre0_db_ok
\else
  \echo 'ERRO [0001]: current_database() difere de target_database (:target_database).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: current_database() difere de target_database';
  END;
  $fail$;
\endif
\if :pre0_session_is_migrator
\else
  \echo 'ERRO [0001]: session_user difere de migrator_role (:migrator_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: session_user difere de migrator_role';
  END;
  $fail$;
\endif
\if :pre0_current_is_migrator
\else
  \echo 'ERRO [0001]: current_user difere de migrator_role (:migrator_role) antes de SET ROLE.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: current_user difere de migrator_role antes de SET ROLE';
  END;
  $fail$;
\endif
\if :pre0_app_role_in_session
  \echo 'ERRO [0001]: app_role (:app_role) nao pode participar desta sessao.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role nao pode participar desta sessao';
  END;
  $fail$;
\endif
\if :pre0_can_set_owner
\else
  \echo 'ERRO [0001]: migrator_role (:migrator_role) nao pode executar SET ROLE para owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role nao pode executar SET ROLE para owner_role';
  END;
  $fail$;
\endif
\if :pre0_schema_app_exists
\else
  \echo 'ERRO [0001]: schema "app" nao existe. Execute o bootstrap (backend/database/bootstrap/001-003) antes desta migration.'
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
  \echo 'ERRO [0001]: owner_role (:owner_role) nao existe.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: owner_role nao existe';
  END;
  $fail$;
\endif
\if :pre1_migrator_exists
\else
  \echo 'ERRO [0001]: migrator_role (:migrator_role) nao existe.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role nao existe';
  END;
  $fail$;
\endif
\if :pre1_app_exists
\else
  \echo 'ERRO [0001]: app_role (:app_role) nao existe.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role nao existe';
  END;
  $fail$;
\endif
\if :pre1_schema_owner_ok
\else
  \echo 'ERRO [0001]: owner do schema app difere de owner_role (:owner_role).'
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
  \echo 'ERRO [0001]: search_path POR DATABASE de owner_role (:owner_role) difere de "app, pg_catalog".'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: search_path de owner_role incorreto ou ausente';
  END;
  $fail$;
\endif
\if :pre2_migrator_search_path_ok
\else
  \echo 'ERRO [0001]: search_path POR DATABASE de migrator_role (:migrator_role) difere de "app, pg_catalog".'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: search_path de migrator_role incorreto ou ausente';
  END;
  $fail$;
\endif
\if :pre2_app_search_path_ok
\else
  \echo 'ERRO [0001]: search_path POR DATABASE de app_role (:app_role) difere de "app, pg_catalog".'
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
  \echo 'ERRO [0001]: owner_role (:owner_role) possui CREATE no database; esperado false.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: owner_role possui CREATE no database';
  END;
  $fail$;
\endif
\if :pre3_migrator_db_create
  \echo 'ERRO [0001]: migrator_role (:migrator_role) possui CREATE no database; esperado false.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role possui CREATE no database';
  END;
  $fail$;
\endif
\if :pre3_app_db_create
  \echo 'ERRO [0001]: app_role (:app_role) possui CREATE no database; esperado false.'
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
  \echo 'ERRO [0001]: migrator_role (:migrator_role) nao possui membership direta em owner_role (:owner_role) com admin_option=false, inherit_option=false, set_option=true.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role nao possui membership exata em owner_role';
  END;
  $fail$;
\endif
\if :pre4_migrator_owner_no_extra_membership
\else
  \echo 'ERRO [0001]: existe membership adicional de migrator_role (:migrator_role) em owner_role (:owner_role) com admin_option/inherit_option true.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: membership adicional de migrator_role em owner_role';
  END;
  $fail$;
\endif
\if :pre4_app_owner_no_direct_membership
\else
  \echo 'ERRO [0001]: app_role (:app_role) possui membership DIRETA indevida em owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role possui membership direta indevida em owner_role';
  END;
  $fail$;
\endif
\if :pre4_app_migrator_no_direct_membership
\else
  \echo 'ERRO [0001]: app_role (:app_role) possui membership DIRETA indevida em migrator_role (:migrator_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role possui membership direta indevida em migrator_role';
  END;
  $fail$;
\endif
\if :pre4_app_cannot_set_owner
\else
  \echo 'ERRO [0001]: app_role (:app_role) possui capacidade de SET ROLE para owner_role (:owner_role); esperado false.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role possui SET ROLE para owner_role';
  END;
  $fail$;
\endif
\if :pre4_app_cannot_set_migrator
\else
  \echo 'ERRO [0001]: app_role (:app_role) possui capacidade de SET ROLE para migrator_role (:migrator_role); esperado false.'
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
  \echo 'ERRO [0001]: owner_role (:owner_role) sem CREATE efetivo no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: owner_role sem CREATE efetivo no schema app';
  END;
  $fail$;
\endif
\if :pre5_owner_schema_usage
\else
  \echo 'ERRO [0001]: owner_role (:owner_role) sem USAGE efetivo no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: owner_role sem USAGE efetivo no schema app';
  END;
  $fail$;
\endif
\if :pre5_public_schema_create
  \echo 'ERRO [0001]: PUBLIC possui CREATE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: PUBLIC possui CREATE no schema app';
  END;
  $fail$;
\endif
\if :pre5_public_schema_usage
  \echo 'ERRO [0001]: PUBLIC possui USAGE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: PUBLIC possui USAGE no schema app';
  END;
  $fail$;
\endif
\if :pre5_app_schema_create
  \echo 'ERRO [0001]: app_role (:app_role) possui CREATE no schema app; esperado false.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role possui CREATE no schema app';
  END;
  $fail$;
\endif
\if :pre5_app_schema_usage
\else
  \echo 'ERRO [0001]: app_role (:app_role) sem USAGE efetivo no schema app; esperado true apos 5.0D.6F.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role sem USAGE efetivo no schema app';
  END;
  $fail$;
\endif
\if :pre5_migrator_direct_grant
  \echo 'ERRO [0001]: migrator_role (:migrator_role) possui grant DIRETO de CREATE/USAGE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role possui grant DIRETO de CREATE/USAGE no schema app';
  END;
  $fail$;
\endif

-- Default ACL baseline (5.0D.6E + 5.0D.6F): Owner exatamente 3 entradas
-- (FUNCTIONS global f, TABLES app r, SEQUENCES app S). APP: TABLES =
-- SELECT/INSERT/UPDATE/DELETE; SEQUENCES = USAGE; FUNCTIONS = nenhum EXECUTE.
-- Migrator/PUBLIC: sem privilege inesperado.
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
  \echo 'ERRO [0001]: owner_role (:owner_role) nao possui exatamente 3 entradas pg_default_acl (baseline 5.0D.6F).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: owner_role sem exatamente 3 entradas pg_default_acl';
  END;
  $fail$;
\endif
\if :pre6_owner_global_functions_default_acl_exists
\else
  \echo 'ERRO [0001]: entrada pg_default_acl GLOBAL de FUNCTIONS ausente para owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: entrada pg_default_acl global de FUNCTIONS ausente para owner_role';
  END;
  $fail$;
\endif
\if :pre6_owner_tables_default_acl_in_app_schema_exists_once
\else
  \echo 'ERRO [0001]: entrada pg_default_acl de TABLES no schema app ausente ou duplicada para owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: entrada pg_default_acl de TABLES no schema app ausente ou duplicada';
  END;
  $fail$;
\endif
\if :pre6_owner_sequences_default_acl_in_app_schema_exists_once
\else
  \echo 'ERRO [0001]: entrada pg_default_acl de SEQUENCES no schema app ausente ou duplicada para owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: entrada pg_default_acl de SEQUENCES no schema app ausente ou duplicada';
  END;
  $fail$;
\endif
\if :pre6_owner_no_functions_default_acl_in_app_schema
\else
  \echo 'ERRO [0001]: existe entrada pg_default_acl de FUNCTIONS no schema app para owner_role (:owner_role); esperado nenhuma.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: entrada pg_default_acl de FUNCTIONS inesperada no schema app';
  END;
  $fail$;
\endif
\if :pre6_migrator_default_acl_zero
\else
  \echo 'ERRO [0001]: migrator_role (:migrator_role) possui entrada em pg_default_acl como defaclrole; esperado 0.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role com pg_default_acl inesperado';
  END;
  $fail$;
\endif
\if :pre6_app_default_acl_zero
\else
  \echo 'ERRO [0001]: app_role (:app_role) possui entrada em pg_default_acl como defaclrole; esperado 0.'
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
  ) AS sequences_no_migrator_priv
\gset pre7_

\if :pre7_app_tables_privs_exact
\else
  \echo 'ERRO [0001]: default ACL de TABLES (schema app) para app_role (:app_role) difere de {DELETE, INSERT, SELECT, UPDATE}.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: privilegios default de TABLES para app_role diferem do esperado';
  END;
  $fail$;
\endif
\if :pre7_app_sequences_privs_exact
\else
  \echo 'ERRO [0001]: default ACL de SEQUENCES (schema app) para app_role (:app_role) difere de {USAGE}.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: privilegios default de SEQUENCES para app_role diferem do esperado';
  END;
  $fail$;
\endif
\if :pre7_global_functions_public_zero_priv
\else
  \echo 'ERRO [0001]: PUBLIC possui privilegio na entrada GLOBAL de FUNCTIONS.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: PUBLIC com privilegio na entrada global de FUNCTIONS';
  END;
  $fail$;
\endif
\if :pre7_global_functions_app_zero_priv
\else
  \echo 'ERRO [0001]: app_role (:app_role) possui privilegio (EXECUTE) na entrada GLOBAL de FUNCTIONS.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role com privilegio na entrada global de FUNCTIONS';
  END;
  $fail$;
\endif
\if :pre7_global_functions_migrator_zero_priv
\else
  \echo 'ERRO [0001]: migrator_role (:migrator_role) possui privilegio na entrada GLOBAL de FUNCTIONS.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role com privilegio na entrada global de FUNCTIONS';
  END;
  $fail$;
\endif
\if :pre7_tables_no_public_priv
\else
  \echo 'ERRO [0001]: PUBLIC possui privilegio no default ACL de TABLES (schema app).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: PUBLIC com privilegio em default ACL de TABLES';
  END;
  $fail$;
\endif
\if :pre7_tables_no_migrator_priv
\else
  \echo 'ERRO [0001]: migrator_role (:migrator_role) possui privilegio no default ACL de TABLES (schema app).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role com privilegio em default ACL de TABLES';
  END;
  $fail$;
\endif
\if :pre7_sequences_no_public_priv
\else
  \echo 'ERRO [0001]: PUBLIC possui privilegio no default ACL de SEQUENCES (schema app).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: PUBLIC com privilegio em default ACL de SEQUENCES';
  END;
  $fail$;
\endif
\if :pre7_sequences_no_migrator_priv
\else
  \echo 'ERRO [0001]: migrator_role (:migrator_role) possui privilegio no default ACL de SEQUENCES (schema app).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role com privilegio em default ACL de SEQUENCES';
  END;
  $fail$;
\endif

-- Objetos atuais: app relations=0, app routines=0, ledger ausente.
SELECT
  ((SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app') = 0) AS relation_count_zero,
  ((SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app') = 0)  AS routine_count_zero,
  NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'app'
      AND c.relname = 'schema_migrations'
      AND c.relkind = 'r'
  ) AS ledger_absent
\gset pre8_

\if :pre8_relation_count_zero
\else
  \echo 'ERRO [0001]: schema app contem relation(s); esperado 0 antes desta migration.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: schema app contem relation(s)';
  END;
  $fail$;
\endif
\if :pre8_routine_count_zero
\else
  \echo 'ERRO [0001]: schema app contem routine(s); esperado 0 antes desta migration.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: schema app contem routine(s)';
  END;
  $fail$;
\endif
\if :pre8_ledger_absent
\else
  \echo 'ERRO [0001]: app.schema_migrations ja existe; esta migration nao e reexecutavel.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app.schema_migrations ja existe';
  END;
  $fail$;
\endif

\echo 'Todas as precondicoes de 0001 (pre SET ROLE) foram validadas com sucesso.'

SET ROLE :"owner_role";

SELECT
  (current_user IS NOT DISTINCT FROM :'owner_role')    AS current_is_owner,
  (session_user IS NOT DISTINCT FROM :'migrator_role') AS session_is_migrator
\gset postSet_

\if :postSet_current_is_owner
\else
  \echo 'ERRO [0001]: falha pos SET ROLE: current_user difere de owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Falha pos SET ROLE: current_user difere de owner_role';
  END;
  $fail$;
\endif
\if :postSet_session_is_migrator
\else
  \echo 'ERRO [0001]: falha pos SET ROLE: session_user difere de migrator_role (:migrator_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Falha pos SET ROLE: session_user difere de migrator_role';
  END;
  $fail$;
\endif

\echo 'SET ROLE owner_role confirmado; session_user permanece migrator_role.'

CREATE TABLE app.schema_migrations (
  migration_id     text        NOT NULL,
  checksum_sha256  text        NOT NULL,
  description      text        NOT NULL,
  applied_at       timestamptz NOT NULL,
  applied_by_login text        NOT NULL,
  applied_as_role  text        NOT NULL,
  database_name    text        NOT NULL,
  CONSTRAINT schema_migrations_pkey PRIMARY KEY (migration_id),
  CONSTRAINT schema_migrations_checksum_sha256_format_chk
    CHECK (checksum_sha256 ~ '^[0-9a-fA-F]{64}$'),
  CONSTRAINT schema_migrations_migration_id_format_chk
    CHECK (migration_id ~ '^[0-9]{4}_[a-z0-9_]+$')
);

-- Default ACL de TABLES do schema app concede DML automatico a app_role.
-- Remover isso NA MESMA TRANSACAO. Owner permanece owner da tabela.
REVOKE ALL PRIVILEGES
ON TABLE app.schema_migrations
FROM :"app_role";

REVOKE ALL PRIVILEGES
ON TABLE app.schema_migrations
FROM PUBLIC;

REVOKE ALL PRIVILEGES
ON TABLE app.schema_migrations
FROM :"migrator_role";

INSERT INTO app.schema_migrations (
  migration_id,
  checksum_sha256,
  description,
  applied_at,
  applied_by_login,
  applied_as_role,
  database_name
) VALUES (
  '0001_create_migration_ledger',
  :'migration_sha256',
  'Cria o ledger app.schema_migrations e registra a propria migration 0001.',
  now(),
  session_user::text,
  current_user::text,
  current_database()
);

\echo 'Ledger criado, grants automaticos removidos e registro 0001 inserido.'

-- ---------------------------------------------------------------------------
-- POSCONDICOES (ainda sob SET ROLE owner_role, ainda na mesma transacao).
-- ---------------------------------------------------------------------------

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
  NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'app'
      AND c.relkind NOT IN ('r', 'i')
  ) AS no_unexpected_relkind,
  ((SELECT count(*)
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app') = 0) AS routine_count_zero,
  NOT EXISTS (
    SELECT 1
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'app'
      AND c.relname = 'schema_migrations'
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
      AND c.relname = 'schema_migrations'
      AND c.relkind = 'r'
      AND pg_get_expr(d.adbin, d.adrelid) LIKE 'nextval%'
  ) AS no_nextval_default
\gset post1_

\if :post1_ledger_exists
\else
  \echo 'ERRO [0001]: app.schema_migrations nao existe apos CREATE TABLE.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: app.schema_migrations nao existe';
  END;
  $fail$;
\endif
\if :post1_ledger_owner_ok
\else
  \echo 'ERRO [0001]: owner de app.schema_migrations difere de owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: owner de app.schema_migrations difere de owner_role';
  END;
  $fail$;
\endif
\if :post1_exactly_one_table
\else
  \echo 'ERRO [0001]: schema app nao possui exatamente 1 tabela apos CREATE.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: schema app nao possui exatamente 1 tabela';
  END;
  $fail$;
\endif
\if :post1_sequence_count_zero
\else
  \echo 'ERRO [0001]: foi criada sequence no schema app; esperado nenhuma.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: sequence criada no schema app';
  END;
  $fail$;
\endif
\if :post1_no_unexpected_relkind
\else
  \echo 'ERRO [0001]: schema app possui relkind inesperado (alem de tabela/indice).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: relkind inesperado no schema app';
  END;
  $fail$;
\endif
\if :post1_routine_count_zero
\else
  \echo 'ERRO [0001]: schema app passou a conter routine(s).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: schema app com routine(s)';
  END;
  $fail$;
\endif
\if :post1_no_identity
\else
  \echo 'ERRO [0001]: app.schema_migrations possui coluna IDENTITY; proibido.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: coluna IDENTITY presente no ledger';
  END;
  $fail$;
\endif
\if :post1_no_nextval_default
\else
  \echo 'ERRO [0001]: app.schema_migrations possui default nextval (sequence); proibido.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: default nextval presente no ledger';
  END;
  $fail$;
\endif

SELECT
  ((SELECT count(*) FROM app.schema_migrations) = 1) AS ledger_rowcount_one,
  EXISTS (
    SELECT 1
    FROM app.schema_migrations
    WHERE migration_id = '0001_create_migration_ledger'
      AND checksum_sha256 IS NOT DISTINCT FROM :'migration_sha256'
      AND applied_by_login IS NOT DISTINCT FROM :'migrator_role'
      AND applied_as_role IS NOT DISTINCT FROM :'owner_role'
      AND database_name IS NOT DISTINCT FROM current_database()
      AND database_name IS NOT DISTINCT FROM :'target_database'
      AND applied_by_login IS NOT DISTINCT FROM session_user::text
      AND applied_as_role IS NOT DISTINCT FROM current_user::text
  ) AS ledger_row_exact
\gset post2_

\if :post2_ledger_rowcount_one
\else
  \echo 'ERRO [0001]: ledger nao possui exatamente 1 registro.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: ledger nao possui exatamente 1 registro';
  END;
  $fail$;
\endif
\if :post2_ledger_row_exact
\else
  \echo 'ERRO [0001]: registro da migration 0001 diverge (migration_id, checksum, login, role ou database).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: registro da migration 0001 diverge do esperado';
  END;
  $fail$;
\endif

-- Privileges do ledger: ZERO privilege direto para app_role, migrator_role
-- e PUBLIC, validado por catalogo (pg_class.relacl + aclexplode). Qualquer
-- entrada ACL dessas identidades = FAIL CLOSED, independente do privilege
-- name. Cobre privileges adicionais de versoes posteriores sem enumera-los
-- e sem exigir PostgreSQL 17. Owner: controle por ownership (ja assertado
-- acima); ACL explicita do Owner nao e exigida.
SELECT
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
  ) AS app_no_direct_acl,
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
  ) AS migrator_no_direct_acl,
  NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) a
    WHERE n.nspname = 'app'
      AND c.relname = 'schema_migrations'
      AND c.relkind = 'r'
      AND a.grantee = 0
  ) AS public_no_direct_acl
\gset post3_

\if :post3_app_no_direct_acl
\else
  \echo 'ERRO [0001]: app_role (:app_role) possui ACL direta em app.schema_migrations.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: app_role possui ACL direta no ledger';
  END;
  $fail$;
\endif
\if :post3_migrator_no_direct_acl
\else
  \echo 'ERRO [0001]: migrator_role (:migrator_role) possui grant direto em app.schema_migrations.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: migrator_role possui grant direto no ledger';
  END;
  $fail$;
\endif
\if :post3_public_no_direct_acl
\else
  \echo 'ERRO [0001]: PUBLIC possui ACL em app.schema_migrations.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: PUBLIC possui ACL no ledger';
  END;
  $fail$;
\endif

-- Default ACL baseline permanece intacta.
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
      WHERE r.rolname = :'app_role') = 0) AS app_default_acl_zero
\gset post4_

\if :post4_owner_total_default_acl_row_count_exact_three
\else
  \echo 'ERRO [0001]: pg_default_acl de owner_role deixou de ter exatamente 3 entradas.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: pg_default_acl de owner_role divergiu da baseline';
  END;
  $fail$;
\endif
\if :post4_owner_global_functions_default_acl_exists
\else
  \echo 'ERRO [0001]: entrada GLOBAL de FUNCTIONS de owner_role ausente apos CREATE.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: entrada global de FUNCTIONS ausente';
  END;
  $fail$;
\endif
\if :post4_owner_tables_default_acl_in_app_schema_exists_once
\else
  \echo 'ERRO [0001]: entrada TABLES (schema app) de owner_role divergiu da baseline.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: default ACL de TABLES divergiu';
  END;
  $fail$;
\endif
\if :post4_owner_sequences_default_acl_in_app_schema_exists_once
\else
  \echo 'ERRO [0001]: entrada SEQUENCES (schema app) de owner_role divergiu da baseline.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: default ACL de SEQUENCES divergiu';
  END;
  $fail$;
\endif
\if :post4_app_tables_privs_exact
\else
  \echo 'ERRO [0001]: privilegios default de TABLES para app_role divergiram da baseline.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: privilegios default de TABLES para app_role divergiram';
  END;
  $fail$;
\endif
\if :post4_app_sequences_privs_exact
\else
  \echo 'ERRO [0001]: privilegios default de SEQUENCES para app_role divergiram da baseline.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: privilegios default de SEQUENCES para app_role divergiram';
  END;
  $fail$;
\endif
\if :post4_migrator_default_acl_zero
\else
  \echo 'ERRO [0001]: migrator_role passou a possuir pg_default_acl.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: migrator_role com pg_default_acl inesperado';
  END;
  $fail$;
\endif
\if :post4_app_default_acl_zero
\else
  \echo 'ERRO [0001]: app_role passou a possuir pg_default_acl como defaclrole.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: app_role com pg_default_acl inesperado';
  END;
  $fail$;
\endif

-- search_path, memberships e DB CREATE intactos.
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
\gset post5_

\if :post5_owner_search_path_still_ok
\else
  \echo 'ERRO [0001]: search_path de owner_role mudou.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: search_path de owner_role mudou';
  END;
  $fail$;
\endif
\if :post5_migrator_search_path_still_ok
\else
  \echo 'ERRO [0001]: search_path de migrator_role mudou.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: search_path de migrator_role mudou';
  END;
  $fail$;
\endif
\if :post5_app_search_path_still_ok
\else
  \echo 'ERRO [0001]: search_path de app_role mudou.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: search_path de app_role mudou';
  END;
  $fail$;
\endif
\if :post5_owner_db_create
  \echo 'ERRO [0001]: owner_role passou a possuir CREATE no database.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: owner_role com CREATE no database';
  END;
  $fail$;
\endif
\if :post5_migrator_db_create
  \echo 'ERRO [0001]: migrator_role passou a possuir CREATE no database.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: migrator_role com CREATE no database';
  END;
  $fail$;
\endif
\if :post5_app_db_create
  \echo 'ERRO [0001]: app_role passou a possuir CREATE no database.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: app_role com CREATE no database';
  END;
  $fail$;
\endif
\if :post5_migrator_owner_membership_exact
\else
  \echo 'ERRO [0001]: membership Migrator->Owner deixou de ser exata.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: membership Migrator->Owner nao permanece exata';
  END;
  $fail$;
\endif
\if :post5_migrator_owner_no_extra_membership
\else
  \echo 'ERRO [0001]: passou a existir membership adicional Migrator->Owner.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: membership adicional Migrator->Owner';
  END;
  $fail$;
\endif
\if :post5_app_owner_no_direct_membership
\else
  \echo 'ERRO [0001]: app_role passou a possuir membership direta em owner_role.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: app_role com membership direta em owner_role';
  END;
  $fail$;
\endif
\if :post5_app_migrator_no_direct_membership
\else
  \echo 'ERRO [0001]: app_role passou a possuir membership direta em migrator_role.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: app_role com membership direta em migrator_role';
  END;
  $fail$;
\endif
\if :post5_app_cannot_set_owner
\else
  \echo 'ERRO [0001]: app_role passou a poder SET ROLE owner_role.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: app_role com SET ROLE para owner_role';
  END;
  $fail$;
\endif
\if :post5_app_cannot_set_migrator
\else
  \echo 'ERRO [0001]: app_role passou a poder SET ROLE migrator_role.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Poscondicao falhou: app_role com SET ROLE para migrator_role';
  END;
  $fail$;
\endif

\echo 'Poscondicoes de 0001 validadas sob identidade owner_role.'

RESET ROLE;

SELECT
  (session_user IS NOT DISTINCT FROM :'migrator_role') AS session_is_migrator,
  (current_user IS NOT DISTINCT FROM :'migrator_role') AS current_is_migrator
\gset postReset_

\if :postReset_session_is_migrator
\else
  \echo 'ERRO [0001]: falha pos RESET ROLE: session_user difere de migrator_role (:migrator_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Falha pos RESET ROLE: session_user difere de migrator_role';
  END;
  $fail$;
\endif
\if :postReset_current_is_migrator
\else
  \echo 'ERRO [0001]: falha pos RESET ROLE: current_user difere de migrator_role (:migrator_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Falha pos RESET ROLE: current_user difere de migrator_role';
  END;
  $fail$;
\endif

\echo 'RESET ROLE confirmado: sessao retornou a migrator_role.'

COMMIT;

\echo '=== 0001: CREATE MIGRATION LEDGER - concluido. app.schema_migrations existe, owned by owner_role, 1 registro, Runtime APP com ZERO privilege no ledger. ==='
