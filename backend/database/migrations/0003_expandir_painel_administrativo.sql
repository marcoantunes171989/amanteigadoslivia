-- =============================================================================
-- 0003_expandir_painel_administrativo.sql
--
-- Expande o painel administrativo em HOMOLOG:
--   app.tab_usuario_admin
--   app.tab_auditoria_admin
--   app.tab_alteracao_agendada
--   app.tab_venda
--   app.tab_venda_item
--   app.tab_publicacao
--
-- Depende obrigatoriamente de:
--   0001_create_migration_ledger
--     checksum bb018fc0c74c17d8ee072fb0c0711d60ead28ce587c47e2bc1bc7dd0664991c0
--   0002_criar_nucleo_catalogo
--     checksum 35eaf497f9dbb0bd6844120f150930df404b8526ff1907e5d4c1810a1aebb6b4
--
-- Identidade esperada: Migrator do ambiente, autenticado por LOGIN real.
--   Fluxo obrigatorio (uma unica transacao):
--     LOGIN migrator_role
--     -> BEGIN
--     -> prechecks de catalogo/seguranca
--     -> SET ROLE owner_role
--     -> precheck do ledger 0001+0002 (somente Owner consegue ler o ledger)
--     -> CREATE das 6 tabelas do painel administrativo
--     -> CREATE dos indexes autorizados
--     -> poschecks estruturais e de privilegio
--     -> INSERT do registro 0003 no ledger
--     -> validar ledger
--     -> RESET ROLE
--     -> confirmar Migrator
--     -> COMMIT
-- Runtime APP nunca executa migration.
--
-- IDs: uuid fornecido pela aplicacao. Sem default gerador no banco.
-- Sem SERIAL, BIGSERIAL, IDENTITY, CREATE SEQUENCE, trigger de
-- data_atualizacao, GRANT manual de negocio, ou REVOKE das tabelas novas.
-- O default privilege 5.0D.6F deve conceder automaticamente a
-- app_role: SELECT, INSERT, UPDATE, DELETE. Esta migration apenas
-- valida esse resultado. ACL de runtime e FAIL CLOSED: somente
-- Owner (ownership; ACL explicita do Owner nao exigida) e APP
-- podem aparecer como grantees. PUBLIC, Migrator e QUALQUER outro
-- grantee inesperado abortam a migration. Sem GRANT/REVOKE de
-- negocio nesta 0003. Se divergir: FAIL CLOSED.
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
-- Requisito minimo: PostgreSQL >= 16.
-- =============================================================================

\set ON_ERROR_STOP on

\if :{?target_database}
\else
  \echo 'ERRO [0003]: variavel psql "target_database" ausente. Use -v target_database=... Nenhum CREATE/INSERT sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: target_database. Migration 0003 abortada antes de qualquer instrucao SQL.';
  END;
  $missing_var$;
\endif
\if :{?owner_role}
\else
  \echo 'ERRO [0003]: variavel psql "owner_role" ausente. Use -v owner_role=... Nenhum CREATE/INSERT sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: owner_role. Migration 0003 abortada antes de qualquer instrucao SQL.';
  END;
  $missing_var$;
\endif
\if :{?migrator_role}
\else
  \echo 'ERRO [0003]: variavel psql "migrator_role" ausente. Use -v migrator_role=... Nenhum CREATE/INSERT sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: migrator_role. Migration 0003 abortada antes de qualquer instrucao SQL.';
  END;
  $missing_var$;
\endif
\if :{?app_role}
\else
  \echo 'ERRO [0003]: variavel psql "app_role" ausente. Use -v app_role=... Nenhum CREATE/INSERT sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: app_role. Migration 0003 abortada antes de qualquer instrucao SQL.';
  END;
  $missing_var$;
\endif
\if :{?migration_sha256}
\else
  \echo 'ERRO [0003]: variavel psql "migration_sha256" ausente. Use -v migration_sha256=<sha256 hex 64>. O checksum e calculado fora do SQL. Nenhum CREATE/INSERT sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: migration_sha256. Migration 0003 abortada antes de qualquer instrucao SQL.';
  END;
  $missing_var$;
\endif

SELECT (:'migration_sha256' ~ '^[0-9a-fA-F]{64}$') AS sha256_format_ok
\gset preSha_

\if :preSha_sha256_format_ok
\else
  \echo 'ERRO [0003]: migration_sha256 nao possui formato SHA256 (64 caracteres hexadecimais).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migration_sha256 nao possui formato SHA256 (64 caracteres hexadecimais)';
  END;
  $fail$;
\endif

\echo '=== 0003: EXPANDIR PAINEL ADMINISTRATIVO - inicio ==='
\echo 'Este script deve ser executado autenticado como migrator_role.'

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
  \echo 'ERRO [0003]: PostgreSQL < 16. Esta migration exige server_version_num >= 160000 (pg_auth_members inherit_option/set_option).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: PostgreSQL inferior a 16';
  END;
  $fail$;
\endif
\if :pre0_db_ok
\else
  \echo 'ERRO [0003]: current_database() difere de target_database (:target_database).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: current_database() difere de target_database';
  END;
  $fail$;
\endif
\if :pre0_session_is_migrator
\else
  \echo 'ERRO [0003]: session_user difere de migrator_role (:migrator_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: session_user difere de migrator_role';
  END;
  $fail$;
\endif
\if :pre0_current_is_migrator
\else
  \echo 'ERRO [0003]: current_user difere de migrator_role (:migrator_role) antes de SET ROLE.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: current_user difere de migrator_role antes de SET ROLE';
  END;
  $fail$;
\endif
\if :pre0_app_role_in_session
  \echo 'ERRO [0003]: app_role (:app_role) nao pode participar desta sessao.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role nao pode participar desta sessao';
  END;
  $fail$;
\endif
\if :pre0_can_set_owner
\else
  \echo 'ERRO [0003]: migrator_role (:migrator_role) nao pode executar SET ROLE para owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role nao pode executar SET ROLE para owner_role';
  END;
  $fail$;
\endif
\if :pre0_schema_app_exists
\else
  \echo 'ERRO [0003]: schema "app" nao existe. Execute o bootstrap (backend/database/bootstrap/001-003) e a migration 0001 antes desta migration.'
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
  \echo 'ERRO [0003]: owner_role (:owner_role) nao existe.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: owner_role nao existe';
  END;
  $fail$;
\endif
\if :pre1_migrator_exists
\else
  \echo 'ERRO [0003]: migrator_role (:migrator_role) nao existe.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role nao existe';
  END;
  $fail$;
\endif
\if :pre1_app_exists
\else
  \echo 'ERRO [0003]: app_role (:app_role) nao existe.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role nao existe';
  END;
  $fail$;
\endif
\if :pre1_schema_owner_ok
\else
  \echo 'ERRO [0003]: owner do schema app difere de owner_role (:owner_role).'
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
  \echo 'ERRO [0003]: search_path POR DATABASE de owner_role (:owner_role) difere de "app, pg_catalog".'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: search_path de owner_role incorreto ou ausente';
  END;
  $fail$;
\endif
\if :pre2_migrator_search_path_ok
\else
  \echo 'ERRO [0003]: search_path POR DATABASE de migrator_role (:migrator_role) difere de "app, pg_catalog".'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: search_path de migrator_role incorreto ou ausente';
  END;
  $fail$;
\endif
\if :pre2_app_search_path_ok
\else
  \echo 'ERRO [0003]: search_path POR DATABASE de app_role (:app_role) difere de "app, pg_catalog".'
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
  \echo 'ERRO [0003]: owner_role (:owner_role) possui CREATE no database; esperado false.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: owner_role possui CREATE no database';
  END;
  $fail$;
\endif
\if :pre3_migrator_db_create
  \echo 'ERRO [0003]: migrator_role (:migrator_role) possui CREATE no database; esperado false.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role possui CREATE no database';
  END;
  $fail$;
\endif
\if :pre3_app_db_create
  \echo 'ERRO [0003]: app_role (:app_role) possui CREATE no database; esperado false.'
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
  \echo 'ERRO [0003]: migrator_role (:migrator_role) nao possui membership direta em owner_role (:owner_role) com admin_option=false, inherit_option=false, set_option=true.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role nao possui membership exata em owner_role';
  END;
  $fail$;
\endif
\if :pre4_migrator_owner_no_extra_membership
\else
  \echo 'ERRO [0003]: existe membership adicional de migrator_role (:migrator_role) em owner_role (:owner_role) com admin_option/inherit_option true.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: membership adicional de migrator_role em owner_role';
  END;
  $fail$;
\endif
\if :pre4_app_owner_no_direct_membership
\else
  \echo 'ERRO [0003]: app_role (:app_role) possui membership DIRETA indevida em owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role possui membership direta indevida em owner_role';
  END;
  $fail$;
\endif
\if :pre4_app_migrator_no_direct_membership
\else
  \echo 'ERRO [0003]: app_role (:app_role) possui membership DIRETA indevida em migrator_role (:migrator_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role possui membership direta indevida em migrator_role';
  END;
  $fail$;
\endif
\if :pre4_app_cannot_set_owner
\else
  \echo 'ERRO [0003]: app_role (:app_role) possui capacidade de SET ROLE para owner_role (:owner_role); esperado false.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role possui SET ROLE para owner_role';
  END;
  $fail$;
\endif
\if :pre4_app_cannot_set_migrator
\else
  \echo 'ERRO [0003]: app_role (:app_role) possui capacidade de SET ROLE para migrator_role (:migrator_role); esperado false.'
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
  \echo 'ERRO [0003]: owner_role (:owner_role) sem CREATE efetivo no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: owner_role sem CREATE efetivo no schema app';
  END;
  $fail$;
\endif
\if :pre5_owner_schema_usage
\else
  \echo 'ERRO [0003]: owner_role (:owner_role) sem USAGE efetivo no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: owner_role sem USAGE efetivo no schema app';
  END;
  $fail$;
\endif
\if :pre5_public_schema_create
  \echo 'ERRO [0003]: PUBLIC possui CREATE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: PUBLIC possui CREATE no schema app';
  END;
  $fail$;
\endif
\if :pre5_public_schema_usage
  \echo 'ERRO [0003]: PUBLIC possui USAGE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: PUBLIC possui USAGE no schema app';
  END;
  $fail$;
\endif
\if :pre5_app_schema_create
  \echo 'ERRO [0003]: app_role (:app_role) possui CREATE no schema app; esperado false.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role possui CREATE no schema app';
  END;
  $fail$;
\endif
\if :pre5_app_schema_usage
\else
  \echo 'ERRO [0003]: app_role (:app_role) sem USAGE efetivo no schema app; esperado true apos 5.0D.6F.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role sem USAGE efetivo no schema app';
  END;
  $fail$;
\endif
\if :pre5_migrator_direct_grant
  \echo 'ERRO [0003]: migrator_role (:migrator_role) possui grant DIRETO de CREATE/USAGE no schema app.'
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
  \echo 'ERRO [0003]: owner_role (:owner_role) nao possui exatamente 3 entradas pg_default_acl (baseline 5.0D.6F).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: owner_role sem exatamente 3 entradas pg_default_acl';
  END;
  $fail$;
\endif
\if :pre6_owner_global_functions_default_acl_exists
\else
  \echo 'ERRO [0003]: entrada pg_default_acl GLOBAL de FUNCTIONS ausente para owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: entrada pg_default_acl global de FUNCTIONS ausente para owner_role';
  END;
  $fail$;
\endif
\if :pre6_owner_tables_default_acl_in_app_schema_exists_once
\else
  \echo 'ERRO [0003]: entrada pg_default_acl de TABLES no schema app ausente ou duplicada para owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: entrada pg_default_acl de TABLES no schema app ausente ou duplicada';
  END;
  $fail$;
\endif
\if :pre6_owner_sequences_default_acl_in_app_schema_exists_once
\else
  \echo 'ERRO [0003]: entrada pg_default_acl de SEQUENCES no schema app ausente ou duplicada para owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: entrada pg_default_acl de SEQUENCES no schema app ausente ou duplicada';
  END;
  $fail$;
\endif
\if :pre6_owner_no_functions_default_acl_in_app_schema
\else
  \echo 'ERRO [0003]: existe entrada pg_default_acl de FUNCTIONS no schema app para owner_role (:owner_role); esperado nenhuma.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: entrada pg_default_acl de FUNCTIONS inesperada no schema app';
  END;
  $fail$;
\endif
\if :pre6_migrator_default_acl_zero
\else
  \echo 'ERRO [0003]: migrator_role (:migrator_role) possui entrada em pg_default_acl como defaclrole; esperado 0.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role com pg_default_acl inesperado';
  END;
  $fail$;
\endif
\if :pre6_app_default_acl_zero
\else
  \echo 'ERRO [0003]: app_role (:app_role) possui entrada em pg_default_acl como defaclrole; esperado 0.'
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
  \echo 'ERRO [0003]: default ACL de TABLES (schema app) para app_role (:app_role) difere de {DELETE, INSERT, SELECT, UPDATE}.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: privilegios default de TABLES para app_role diferem do esperado';
  END;
  $fail$;
\endif
\if :pre7_app_sequences_privs_exact
\else
  \echo 'ERRO [0003]: default ACL de SEQUENCES (schema app) para app_role (:app_role) difere de {USAGE}.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: privilegios default de SEQUENCES para app_role diferem do esperado';
  END;
  $fail$;
\endif
\if :pre7_global_functions_public_zero_priv
\else
  \echo 'ERRO [0003]: PUBLIC possui privilegio na entrada GLOBAL de FUNCTIONS.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: PUBLIC com privilegio na entrada global de FUNCTIONS';
  END;
  $fail$;
\endif
\if :pre7_global_functions_app_zero_priv
\else
  \echo 'ERRO [0003]: app_role (:app_role) possui privilegio (EXECUTE) na entrada GLOBAL de FUNCTIONS.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role com privilegio na entrada global de FUNCTIONS';
  END;
  $fail$;
\endif
\if :pre7_global_functions_migrator_zero_priv
\else
  \echo 'ERRO [0003]: migrator_role (:migrator_role) possui privilegio na entrada GLOBAL de FUNCTIONS.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role com privilegio na entrada global de FUNCTIONS';
  END;
  $fail$;
\endif
\if :pre7_tables_no_public_priv
\else
  \echo 'ERRO [0003]: PUBLIC possui privilegio no default ACL de TABLES (schema app).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: PUBLIC com privilegio em default ACL de TABLES';
  END;
  $fail$;
\endif
\if :pre7_tables_no_migrator_priv
\else
  \echo 'ERRO [0003]: migrator_role (:migrator_role) possui privilegio no default ACL de TABLES (schema app).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role com privilegio em default ACL de TABLES';
  END;
  $fail$;
\endif
\if :pre7_sequences_no_public_priv
\else
  \echo 'ERRO [0003]: PUBLIC possui privilegio no default ACL de SEQUENCES (schema app).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: PUBLIC com privilegio em default ACL de SEQUENCES';
  END;
  $fail$;
\endif
\if :pre7_sequences_no_migrator_priv
\else
  \echo 'ERRO [0003]: migrator_role (:migrator_role) possui privilegio no default ACL de SEQUENCES (schema app).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role com privilegio em default ACL de SEQUENCES';
  END;
  $fail$;
\endif
\if :pre7_tables_no_unexpected_grantee
\else
  \echo 'ERRO [0003]: default ACL de TABLES (schema app) possui grantee inesperado (alem de Owner e APP). FAIL CLOSED.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: grantee inesperado no default ACL de TABLES';
  END;
  $fail$;
\endif
\if :pre7_sequences_no_unexpected_grantee
\else
  \echo 'ERRO [0003]: default ACL de SEQUENCES (schema app) possui grantee inesperado (alem de Owner e APP). FAIL CLOSED.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: grantee inesperado no default ACL de SEQUENCES';
  END;
  $fail$;
\endif
\if :pre7_functions_no_unexpected_grantee
\else
  \echo 'ERRO [0003]: default ACL GLOBAL de FUNCTIONS possui grantee inesperado (alem de Owner). FAIL CLOSED.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: grantee inesperado no default ACL global de FUNCTIONS';
  END;
  $fail$;
\endif


-- Objetos atuais: ledger + 4 tabelas do catalogo existem; as 6 tabelas
-- do painel NAO existem; sequences=0; routines=0.
SELECT
  EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'app' AND c.relname = 'schema_migrations' AND c.relkind = 'r'
  ) AS ledger_exists,
  ((SELECT array_agg(c.relname::text ORDER BY c.relname::text)
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relkind = 'r')
    = ARRAY['schema_migrations','tab_categoria','tab_produto','tab_produto_imagem','tab_produto_preco']::text[]) AS catalog_tables_exact,
  NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'app' AND c.relkind = 'r'
      AND c.relname IN (
        'tab_usuario_admin','tab_auditoria_admin','tab_alteracao_agendada',
        'tab_venda','tab_venda_item','tab_publicacao'
      )
  ) AS panel_tables_absent,
  ((SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relkind = 'S') = 0) AS sequence_count_zero,
  ((SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app') = 0) AS routine_count_zero,
  NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'app' AND c.relkind NOT IN ('r', 'i')
  ) AS no_unexpected_relkind
\gset pre8_

\if :pre8_ledger_exists
\else
  \echo 'ERRO [0003]: app.schema_migrations nao existe. Aplique a migration 0001 antes desta.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Precondicao falhou: app.schema_migrations nao existe'; END; $fail$;
\endif
\if :pre8_catalog_tables_exact
\else
  \echo 'ERRO [0003]: conjunto de tabelas do catalogo em app diverge do esperado (ledger + 4 tabelas).'
  DO $fail$ BEGIN RAISE EXCEPTION 'Precondicao falhou: conjunto de tabelas do catalogo diverge'; END; $fail$;
\endif
\if :pre8_panel_tables_absent
\else
  \echo 'ERRO [0003]: uma ou mais tabelas do painel ja existem; esta migration nao e reexecutavel.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Precondicao falhou: tabelas do painel ja existem'; END; $fail$;
\endif
\if :pre8_sequence_count_zero
\else
  \echo 'ERRO [0003]: schema app contem sequence(s); esperado nenhuma.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Precondicao falhou: sequence presente no schema app'; END; $fail$;
\endif
\if :pre8_routine_count_zero
\else
  \echo 'ERRO [0003]: schema app contem routine(s); esperado 0 antes desta migration.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Precondicao falhou: schema app contem routine(s)'; END; $fail$;
\endif
\if :pre8_no_unexpected_relkind
\else
  \echo 'ERRO [0003]: schema app possui relkind inesperado (alem de tabela/indice).'
  DO $fail$ BEGIN RAISE EXCEPTION 'Precondicao falhou: relkind inesperado no schema app'; END; $fail$;
\endif

\echo 'Precondicoes de catalogo/seguranca de 0003 (pre SET ROLE) validadas com sucesso.'

SET ROLE :"owner_role";

SELECT
  (current_user IS NOT DISTINCT FROM :'owner_role')    AS current_is_owner,
  (session_user IS NOT DISTINCT FROM :'migrator_role') AS session_is_migrator
\gset postSet_

\if :postSet_current_is_owner
\else
  \echo 'ERRO [0003]: falha pos SET ROLE: current_user difere de owner_role (:owner_role).'
  DO $fail$ BEGIN RAISE EXCEPTION 'Falha pos SET ROLE: current_user difere de owner_role'; END; $fail$;
\endif
\if :postSet_session_is_migrator
\else
  \echo 'ERRO [0003]: falha pos SET ROLE: session_user difere de migrator_role (:migrator_role).'
  DO $fail$ BEGIN RAISE EXCEPTION 'Falha pos SET ROLE: session_user difere de migrator_role'; END; $fail$;
\endif

\echo 'SET ROLE owner_role confirmado; session_user permanece migrator_role.'

SELECT
  ((SELECT count(*) FROM app.schema_migrations) = 2) AS ledger_rowcount_two,
  EXISTS (
    SELECT 1 FROM app.schema_migrations
    WHERE migration_id = '0001_create_migration_ledger'
      AND checksum_sha256 = 'bb018fc0c74c17d8ee072fb0c0711d60ead28ce587c47e2bc1bc7dd0664991c0'
  ) AS ledger_0001_exact,
  EXISTS (
    SELECT 1 FROM app.schema_migrations
    WHERE migration_id = '0002_criar_nucleo_catalogo'
      AND checksum_sha256 = '35eaf497f9dbb0bd6844120f150930df404b8526ff1907e5d4c1810a1aebb6b4'
  ) AS ledger_0002_exact,
  NOT EXISTS (
    SELECT 1 FROM app.schema_migrations
    WHERE migration_id = '0003_expandir_painel_administrativo'
  ) AS ledger_0003_absent
\gset preLed_

\if :preLed_ledger_rowcount_two
\else
  \echo 'ERRO [0003]: ledger nao possui exatamente 2 registros antes desta migration.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Precondicao falhou: ledger nao possui exatamente 2 registros'; END; $fail$;
\endif
\if :preLed_ledger_0001_exact
\else
  \echo 'ERRO [0003]: registro 0001 ausente ou checksum diverge.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Precondicao falhou: registro 0001 ausente ou checksum diverge'; END; $fail$;
\endif
\if :preLed_ledger_0002_exact
\else
  \echo 'ERRO [0003]: registro 0002 ausente ou checksum diverge de 35eaf497f9dbb0bd6844120f150930df404b8526ff1907e5d4c1810a1aebb6b4.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Precondicao falhou: registro 0002 ausente ou checksum diverge'; END; $fail$;
\endif
\if :preLed_ledger_0003_absent
\else
  \echo 'ERRO [0003]: 0003_expandir_painel_administrativo ja existe no ledger; esta migration nao e reexecutavel.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Precondicao falhou: 0003 ja existe no ledger'; END; $fail$;
\endif

\echo 'Ledger 0001+0002 validado; 0003 ausente. Iniciando CREATE do painel administrativo.'

CREATE TABLE app.tab_usuario_admin (
  id_usuario_admin   uuid        NOT NULL,
  nome_usuario       text        NOT NULL,
  email_usuario      text        NOT NULL,
  senha_hash         text        NOT NULL,
  senha_salt         text        NOT NULL,
  perfil_usuario     text        NOT NULL DEFAULT 'ADMIN',
  ativo              boolean     NOT NULL DEFAULT true,
  data_criacao       timestamptz NOT NULL DEFAULT now(),
  data_atualizacao   timestamptz NOT NULL DEFAULT now(),
  data_ultimo_login  timestamptz NULL,
  CONSTRAINT pk_tab_usuario_admin PRIMARY KEY (id_usuario_admin),
  CONSTRAINT ck_tab_usuario_admin_nome CHECK (btrim(nome_usuario) <> ''),
  CONSTRAINT ck_tab_usuario_admin_email CHECK (btrim(email_usuario) <> ''),
  CONSTRAINT ck_tab_usuario_admin_perfil CHECK (perfil_usuario IN ('ADMIN', 'GESTOR')),
  CONSTRAINT ck_tab_usuario_admin_hash CHECK (btrim(senha_hash) <> ''),
  CONSTRAINT ck_tab_usuario_admin_salt CHECK (btrim(senha_salt) <> '')
);

CREATE UNIQUE INDEX tab_usuario_admin_email_unq
  ON app.tab_usuario_admin (lower(email_usuario));

CREATE TABLE app.tab_auditoria_admin (
  id_auditoria             uuid        NOT NULL,
  id_usuario_admin         uuid        NULL,
  acao                     text        NOT NULL,
  entidade                 text        NULL,
  id_registro              uuid        NULL,
  sucesso                  boolean     NOT NULL,
  descricao_evento         text        NULL,
  detalhes_json            jsonb       NULL,
  identificador_requisicao text        NULL,
  data_evento              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_tab_auditoria_admin PRIMARY KEY (id_auditoria),
  CONSTRAINT fk_tab_auditoria_admin_usuario
    FOREIGN KEY (id_usuario_admin)
    REFERENCES app.tab_usuario_admin (id_usuario_admin)
    ON DELETE SET NULL,
  CONSTRAINT ck_tab_auditoria_admin_acao CHECK (btrim(acao) <> '')
);

CREATE INDEX tab_auditoria_admin_id_usuario_admin_idx
  ON app.tab_auditoria_admin (id_usuario_admin);
CREATE INDEX tab_auditoria_admin_data_evento_idx
  ON app.tab_auditoria_admin (data_evento);
CREATE INDEX tab_auditoria_admin_acao_idx
  ON app.tab_auditoria_admin (acao);
CREATE INDEX tab_auditoria_admin_entidade_idx
  ON app.tab_auditoria_admin (entidade);

CREATE TABLE app.tab_alteracao_agendada (
  id_alteracao_agendada uuid        NOT NULL,
  id_usuario_admin      uuid        NOT NULL,
  tipo_entidade         text        NOT NULL,
  id_registro           uuid        NOT NULL,
  dados_alteracao       jsonb       NOT NULL,
  data_vigencia         timestamptz NOT NULL,
  status_alteracao      text        NOT NULL DEFAULT 'AGENDADA',
  data_criacao          timestamptz NOT NULL DEFAULT now(),
  data_aplicacao        timestamptz NULL,
  data_cancelamento     timestamptz NULL,
  mensagem_erro         text        NULL,
  CONSTRAINT pk_tab_alteracao_agendada PRIMARY KEY (id_alteracao_agendada),
  CONSTRAINT fk_tab_alteracao_agendada_usuario
    FOREIGN KEY (id_usuario_admin)
    REFERENCES app.tab_usuario_admin (id_usuario_admin)
    ON DELETE RESTRICT,
  CONSTRAINT ck_tab_alteracao_agendada_status
    CHECK (status_alteracao IN ('AGENDADA', 'APLICADA', 'CANCELADA', 'ERRO')),
  CONSTRAINT ck_tab_alteracao_agendada_tipo
    CHECK (tipo_entidade IN ('CATEGORIA', 'PRODUTO', 'PRECO', 'PROMOCAO', 'IMAGEM'))
);

CREATE INDEX tab_alteracao_agendada_data_vigencia_idx
  ON app.tab_alteracao_agendada (data_vigencia);
CREATE INDEX tab_alteracao_agendada_status_alteracao_idx
  ON app.tab_alteracao_agendada (status_alteracao);
CREATE INDEX tab_alteracao_agendada_id_registro_idx
  ON app.tab_alteracao_agendada (id_registro);

CREATE TABLE app.tab_venda (
  id_venda              uuid        NOT NULL,
  chave_idempotencia    text        NOT NULL,
  status_venda          text        NOT NULL DEFAULT 'PENDENTE',
  origem_venda          text        NOT NULL DEFAULT 'SITE',
  nome_cliente          text        NULL,
  telefone_cliente      text        NULL,
  valor_total_centavos  bigint      NOT NULL,
  data_venda            timestamptz NOT NULL DEFAULT now(),
  data_atualizacao      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_tab_venda PRIMARY KEY (id_venda),
  CONSTRAINT unq_tab_venda_chave_idempotencia UNIQUE (chave_idempotencia),
  CONSTRAINT ck_tab_venda_chave CHECK (btrim(chave_idempotencia) <> ''),
  CONSTRAINT ck_tab_venda_status CHECK (status_venda IN ('PENDENTE', 'CONFIRMADA', 'CANCELADA')),
  CONSTRAINT ck_tab_venda_valor CHECK (valor_total_centavos >= 0)
);

CREATE INDEX tab_venda_data_venda_idx
  ON app.tab_venda (data_venda);
CREATE INDEX tab_venda_status_venda_idx
  ON app.tab_venda (status_venda);

CREATE TABLE app.tab_venda_item (
  id_item_venda             uuid        NOT NULL,
  id_venda                  uuid        NOT NULL,
  id_produto                uuid        NULL,
  nome_produto              text        NOT NULL,
  quantidade                integer     NOT NULL,
  valor_unitario_centavos   bigint      NOT NULL,
  valor_total_centavos      bigint      NOT NULL,
  data_criacao              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_tab_venda_item PRIMARY KEY (id_item_venda),
  CONSTRAINT fk_tab_venda_item_venda
    FOREIGN KEY (id_venda)
    REFERENCES app.tab_venda (id_venda)
    ON DELETE CASCADE,
  CONSTRAINT fk_tab_venda_item_produto
    FOREIGN KEY (id_produto)
    REFERENCES app.tab_produto (id_produto)
    ON DELETE SET NULL,
  CONSTRAINT ck_tab_venda_item_nome CHECK (btrim(nome_produto) <> ''),
  CONSTRAINT ck_tab_venda_item_quantidade CHECK (quantidade > 0),
  CONSTRAINT ck_tab_venda_item_unitario CHECK (valor_unitario_centavos >= 0),
  CONSTRAINT ck_tab_venda_item_total CHECK (valor_total_centavos >= 0)
);

CREATE INDEX tab_venda_item_id_venda_idx
  ON app.tab_venda_item (id_venda);
CREATE INDEX tab_venda_item_id_produto_idx
  ON app.tab_venda_item (id_produto);

CREATE TABLE app.tab_publicacao (
  id_publicacao      uuid        NOT NULL,
  id_usuario_admin   uuid        NOT NULL,
  tipo_publicacao    text        NOT NULL,
  ambiente_origem    text        NOT NULL DEFAULT 'HOMOLOG',
  ambiente_destino   text        NOT NULL DEFAULT 'PROD',
  git_sha            text        NULL,
  status_publicacao  text        NOT NULL DEFAULT 'RASCUNHO',
  data_agendada      timestamptz NULL,
  data_criacao       timestamptz NOT NULL DEFAULT now(),
  data_inicio        timestamptz NULL,
  data_fim           timestamptz NULL,
  resumo_json        jsonb       NULL,
  mensagem_erro      text        NULL,
  CONSTRAINT pk_tab_publicacao PRIMARY KEY (id_publicacao),
  CONSTRAINT fk_tab_publicacao_usuario
    FOREIGN KEY (id_usuario_admin)
    REFERENCES app.tab_usuario_admin (id_usuario_admin)
    ON DELETE RESTRICT,
  CONSTRAINT ck_tab_publicacao_tipo
    CHECK (tipo_publicacao IN ('CATALOGO', 'ESTRUTURA', 'COMPLETA')),
  CONSTRAINT ck_tab_publicacao_status
    CHECK (status_publicacao IN (
      'RASCUNHO', 'VALIDADA', 'AGENDADA', 'EM_EXECUCAO',
      'PUBLICADA', 'ERRO', 'CANCELADA', 'BLOQUEADA'
    ))
);

CREATE INDEX tab_publicacao_status_publicacao_idx
  ON app.tab_publicacao (status_publicacao);
CREATE INDEX tab_publicacao_data_agendada_idx
  ON app.tab_publicacao (data_agendada);
CREATE INDEX tab_publicacao_data_criacao_idx
  ON app.tab_publicacao (data_criacao);

\echo 'Tabelas e indexes do painel administrativo criados. Sem GRANT/REVOKE manual de negocio. Sem seed.'

SELECT
  ((SELECT array_agg(c.relname::text ORDER BY c.relname::text)
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relkind = 'r')
    = ARRAY[
      'schema_migrations',
      'tab_alteracao_agendada',
      'tab_auditoria_admin',
      'tab_categoria',
      'tab_produto',
      'tab_produto_imagem',
      'tab_produto_preco',
      'tab_publicacao',
      'tab_usuario_admin',
      'tab_venda',
      'tab_venda_item'
    ]::text[]) AS tables_exact,
  ((SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relkind = 'r'
        AND pg_get_userbyid(c.relowner) IS NOT DISTINCT FROM :'owner_role') = 11) AS all_tables_owner_ok,
  ((SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relkind = 'S') = 0) AS sequence_count_zero,
  ((SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'app') = 0) AS routine_count_zero,
  NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'app' AND c.relkind NOT IN ('r', 'i')
  ) AS no_unexpected_relkind,
  NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'app'
      AND c.relname IN (
        'tab_usuario_admin','tab_auditoria_admin','tab_alteracao_agendada',
        'tab_venda','tab_venda_item','tab_publicacao'
      )
      AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
      AND a.attidentity <> ''
  ) AS no_identity,
  NOT EXISTS (
    SELECT 1 FROM pg_attrdef d
    JOIN pg_class c ON c.oid = d.adrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'app'
      AND c.relname IN (
        'tab_usuario_admin','tab_auditoria_admin','tab_alteracao_agendada',
        'tab_venda','tab_venda_item','tab_publicacao'
      )
      AND c.relkind = 'r'
      AND pg_get_expr(d.adbin, d.adrelid) LIKE 'nextval%'
  ) AS no_nextval_default,
  NOT EXISTS (
    SELECT 1 FROM pg_attrdef d
    JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
    JOIN pg_class c ON c.oid = d.adrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_type t ON t.oid = a.atttypid
    WHERE n.nspname = 'app'
      AND c.relname IN (
        'tab_usuario_admin','tab_auditoria_admin','tab_alteracao_agendada',
        'tab_venda','tab_venda_item','tab_publicacao'
      )
      AND c.relkind = 'r'
      AND t.typname = 'uuid'
  ) AS uuid_columns_no_default,
  NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'app'
      AND c.relname IN (
        'tab_usuario_admin','tab_auditoria_admin','tab_alteracao_agendada',
        'tab_venda','tab_venda_item','tab_publicacao'
      )
      AND NOT t.tgisinternal
  ) AS no_user_triggers
\gset post1_

\if :post1_tables_exact
\else
  \echo 'ERRO [0003]: conjunto de tabelas em app diverge do esperado (ledger + 4 catalogo + 6 painel).'
  DO $fail$ BEGIN RAISE EXCEPTION 'Poscondicao falhou: conjunto de tabelas em app diverge'; END; $fail$;
\endif
\if :post1_all_tables_owner_ok
\else
  \echo 'ERRO [0003]: alguma tabela em app nao pertence a owner_role (:owner_role).'
  DO $fail$ BEGIN RAISE EXCEPTION 'Poscondicao falhou: ownership de tabela diverge de owner_role'; END; $fail$;
\endif
\if :post1_sequence_count_zero
\else
  \echo 'ERRO [0003]: foi criada sequence no schema app; esperado nenhuma.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Poscondicao falhou: sequence criada no schema app'; END; $fail$;
\endif
\if :post1_routine_count_zero
\else
  \echo 'ERRO [0003]: schema app passou a conter routine(s).'
  DO $fail$ BEGIN RAISE EXCEPTION 'Poscondicao falhou: schema app com routine(s)'; END; $fail$;
\endif
\if :post1_no_unexpected_relkind
\else
  \echo 'ERRO [0003]: schema app possui relkind inesperado (alem de tabela/indice).'
  DO $fail$ BEGIN RAISE EXCEPTION 'Poscondicao falhou: relkind inesperado no schema app'; END; $fail$;
\endif
\if :post1_no_identity
\else
  \echo 'ERRO [0003]: alguma tabela do painel possui coluna IDENTITY; proibido.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Poscondicao falhou: coluna IDENTITY presente no painel'; END; $fail$;
\endif
\if :post1_no_nextval_default
\else
  \echo 'ERRO [0003]: alguma tabela do painel possui default nextval (sequence); proibido.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Poscondicao falhou: default nextval presente no painel'; END; $fail$;
\endif
\if :post1_uuid_columns_no_default
\else
  \echo 'ERRO [0003]: alguma coluna uuid do painel possui default gerador; proibido nesta fase.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Poscondicao falhou: coluna uuid com default gerador'; END; $fail$;
\endif
\if :post1_no_user_triggers
\else
  \echo 'ERRO [0003]: trigger de usuario criada no painel; data_atualizacao deve ser atualizado pela aplicacao.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Poscondicao falhou: trigger de usuario presente no painel'; END; $fail$;
\endif

SELECT
  ((SELECT array_agg(a.attname::text ORDER BY a.attnum)
      FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relname = 'tab_usuario_admin' AND c.relkind = 'r'
        AND a.attnum > 0 AND NOT a.attisdropped)
    = ARRAY['id_usuario_admin','nome_usuario','email_usuario','senha_hash','senha_salt','perfil_usuario','ativo','data_criacao','data_atualizacao','data_ultimo_login']::text[]) AS tab_usuario_admin_cols,
  ((SELECT array_agg(a.attname::text ORDER BY a.attnum)
      FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relname = 'tab_auditoria_admin' AND c.relkind = 'r'
        AND a.attnum > 0 AND NOT a.attisdropped)
    = ARRAY['id_auditoria','id_usuario_admin','acao','entidade','id_registro','sucesso','descricao_evento','detalhes_json','identificador_requisicao','data_evento']::text[]) AS tab_auditoria_admin_cols,
  ((SELECT array_agg(a.attname::text ORDER BY a.attnum)
      FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relname = 'tab_alteracao_agendada' AND c.relkind = 'r'
        AND a.attnum > 0 AND NOT a.attisdropped)
    = ARRAY['id_alteracao_agendada','id_usuario_admin','tipo_entidade','id_registro','dados_alteracao','data_vigencia','status_alteracao','data_criacao','data_aplicacao','data_cancelamento','mensagem_erro']::text[]) AS tab_alteracao_agendada_cols,
  ((SELECT array_agg(a.attname::text ORDER BY a.attnum)
      FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relname = 'tab_venda' AND c.relkind = 'r'
        AND a.attnum > 0 AND NOT a.attisdropped)
    = ARRAY['id_venda','chave_idempotencia','status_venda','origem_venda','nome_cliente','telefone_cliente','valor_total_centavos','data_venda','data_atualizacao']::text[]) AS tab_venda_cols,
  ((SELECT array_agg(a.attname::text ORDER BY a.attnum)
      FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relname = 'tab_venda_item' AND c.relkind = 'r'
        AND a.attnum > 0 AND NOT a.attisdropped)
    = ARRAY['id_item_venda','id_venda','id_produto','nome_produto','quantidade','valor_unitario_centavos','valor_total_centavos','data_criacao']::text[]) AS tab_venda_item_cols,
  ((SELECT array_agg(a.attname::text ORDER BY a.attnum)
      FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relname = 'tab_publicacao' AND c.relkind = 'r'
        AND a.attnum > 0 AND NOT a.attisdropped)
    = ARRAY['id_publicacao','id_usuario_admin','tipo_publicacao','ambiente_origem','ambiente_destino','git_sha','status_publicacao','data_agendada','data_criacao','data_inicio','data_fim','resumo_json','mensagem_erro']::text[]) AS tab_publicacao_cols,
  EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class idx ON idx.oid = i.indexrelid
    JOIN pg_class tbl ON tbl.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = tbl.relnamespace
    WHERE n.nspname = 'app' AND tbl.relname = 'tab_usuario_admin'
      AND idx.relname = 'tab_usuario_admin_email_unq'
      AND i.indisunique = true
      AND pg_get_indexdef(idx.oid) ILIKE '%lower(%email_usuario%)%'
  ) AS email_unique_lower,
  EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app' AND c.relname = 'tab_venda_data_venda_idx') AS venda_data_idx,
  EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app' AND c.relname = 'tab_venda_status_venda_idx') AS venda_status_idx,
  EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app' AND c.relname = 'tab_venda_item_id_venda_idx') AS venda_item_venda_idx,
  EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app' AND c.relname = 'tab_venda_item_id_produto_idx') AS venda_item_produto_idx
\gset post2_

\if :post2_tab_usuario_admin_cols
\else
  \echo 'ERRO [0003]: colunas de app.tab_usuario_admin divergem do esperado.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Poscondicao falhou: colunas de app.tab_usuario_admin divergem'; END; $fail$;
\endif
\if :post2_tab_auditoria_admin_cols
\else
  \echo 'ERRO [0003]: colunas de app.tab_auditoria_admin divergem do esperado.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Poscondicao falhou: colunas de app.tab_auditoria_admin divergem'; END; $fail$;
\endif
\if :post2_tab_alteracao_agendada_cols
\else
  \echo 'ERRO [0003]: colunas de app.tab_alteracao_agendada divergem do esperado.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Poscondicao falhou: colunas de app.tab_alteracao_agendada divergem'; END; $fail$;
\endif
\if :post2_tab_venda_cols
\else
  \echo 'ERRO [0003]: colunas de app.tab_venda divergem do esperado.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Poscondicao falhou: colunas de app.tab_venda divergem'; END; $fail$;
\endif
\if :post2_tab_venda_item_cols
\else
  \echo 'ERRO [0003]: colunas de app.tab_venda_item divergem do esperado.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Poscondicao falhou: colunas de app.tab_venda_item divergem'; END; $fail$;
\endif
\if :post2_tab_publicacao_cols
\else
  \echo 'ERRO [0003]: colunas de app.tab_publicacao divergem do esperado.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Poscondicao falhou: colunas de app.tab_publicacao divergem'; END; $fail$;
\endif
\if :post2_email_unique_lower
\else
  \echo 'ERRO [0003]: unique index case-insensitive de email ausente ou incorreto.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Poscondicao falhou: tab_usuario_admin_email_unq'; END; $fail$;
\endif
\if :post2_venda_data_idx
\else
  \echo 'ERRO [0003]: indice tab_venda_data_venda_idx ausente.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Poscondicao falhou: tab_venda_data_venda_idx'; END; $fail$;
\endif
\if :post2_venda_status_idx
\else
  \echo 'ERRO [0003]: indice tab_venda_status_venda_idx ausente.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Poscondicao falhou: tab_venda_status_venda_idx'; END; $fail$;
\endif
\if :post2_venda_item_venda_idx
\else
  \echo 'ERRO [0003]: indice tab_venda_item_id_venda_idx ausente.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Poscondicao falhou: tab_venda_item_id_venda_idx'; END; $fail$;
\endif
\if :post2_venda_item_produto_idx
\else
  \echo 'ERRO [0003]: indice tab_venda_item_id_produto_idx ausente.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Poscondicao falhou: tab_venda_item_id_produto_idx'; END; $fail$;
\endif

SELECT
  (
    SELECT count(*)
    FROM unnest(ARRAY[
      'tab_usuario_admin','tab_auditoria_admin','tab_alteracao_agendada',
      'tab_venda','tab_venda_item','tab_publicacao'
    ]) AS t(relname)
    WHERE (
      SELECT coalesce(array_agg(a.privilege_type ORDER BY a.privilege_type), ARRAY[]::text[])
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, '{}'::aclitem[])) a
      JOIN pg_roles r ON r.oid = a.grantee
      WHERE n.nspname = 'app' AND c.relkind = 'r' AND c.relname = t.relname
        AND r.rolname = :'app_role'
    ) = ARRAY['DELETE','INSERT','SELECT','UPDATE']
  ) = 6 AS app_dml_exact_all_six,
  NOT EXISTS (
    SELECT 1
    FROM unnest(ARRAY[
      'tab_usuario_admin','tab_auditoria_admin','tab_alteracao_agendada',
      'tab_venda','tab_venda_item','tab_publicacao'
    ]) AS t(relname)
    JOIN pg_class c ON c.relname = t.relname AND c.relkind = 'r'
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'app'
    CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, '{}'::aclitem[])) a
    WHERE a.grantee IS DISTINCT FROM c.relowner
      AND a.grantee IS DISTINCT FROM (SELECT oid FROM pg_roles WHERE rolname = :'app_role')
  ) AS panel_no_unexpected_grantee,
  NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL aclexplode(c.relacl) a
    JOIN pg_roles r ON r.oid = a.grantee
    WHERE n.nspname = 'app' AND c.relname = 'schema_migrations' AND c.relkind = 'r'
      AND r.rolname = :'app_role'
  ) AS ledger_still_app_zero
\gset post5_

\if :post5_app_dml_exact_all_six
\else
  \echo 'ERRO [0003]: Runtime APP nao possui exatamente SELECT/INSERT/UPDATE/DELETE nas 6 tabelas do painel. FAIL CLOSED sem GRANT manual.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Poscondicao falhou: DML de app_role nas tabelas do painel diverge'; END; $fail$;
\endif
\if :post5_panel_no_unexpected_grantee
\else
  \echo 'ERRO [0003]: alguma tabela do painel possui grantee inesperado (alem de Owner e APP). FAIL CLOSED.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Poscondicao falhou: grantee inesperado na ACL das tabelas do painel'; END; $fail$;
\endif
\if :post5_ledger_still_app_zero
\else
  \echo 'ERRO [0003]: app_role passou a possuir ACL no ledger.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Poscondicao falhou: app_role com ACL no ledger'; END; $fail$;
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
  '0003_expandir_painel_administrativo',
  :'migration_sha256',
  'Expande o painel administrativo: usuarios, auditoria, alteracoes agendadas, vendas e publicacao HML->PROD.',
  now(),
  session_user::text,
  current_user::text,
  current_database()
);

\echo 'Registro 0003 inserido no ledger.'

SELECT
  ((SELECT count(*) FROM app.schema_migrations) = 3) AS ledger_rowcount_three,
  EXISTS (
    SELECT 1 FROM app.schema_migrations
    WHERE migration_id = '0001_create_migration_ledger'
      AND checksum_sha256 = 'bb018fc0c74c17d8ee072fb0c0711d60ead28ce587c47e2bc1bc7dd0664991c0'
  ) AS ledger_0001_intact,
  EXISTS (
    SELECT 1 FROM app.schema_migrations
    WHERE migration_id = '0002_criar_nucleo_catalogo'
      AND checksum_sha256 = '35eaf497f9dbb0bd6844120f150930df404b8526ff1907e5d4c1810a1aebb6b4'
  ) AS ledger_0002_intact,
  EXISTS (
    SELECT 1 FROM app.schema_migrations
    WHERE migration_id = '0003_expandir_painel_administrativo'
      AND checksum_sha256 IS NOT DISTINCT FROM :'migration_sha256'
      AND applied_by_login IS NOT DISTINCT FROM :'migrator_role'
      AND applied_as_role IS NOT DISTINCT FROM :'owner_role'
      AND database_name IS NOT DISTINCT FROM current_database()
      AND database_name IS NOT DISTINCT FROM :'target_database'
  ) AS ledger_0003_exact
\gset post6_

\if :post6_ledger_rowcount_three
\else
  \echo 'ERRO [0003]: ledger nao possui exatamente 3 registros apos INSERT.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Poscondicao falhou: ledger nao possui exatamente 3 registros'; END; $fail$;
\endif
\if :post6_ledger_0001_intact
\else
  \echo 'ERRO [0003]: checksum/registro 0001 foi alterado.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Poscondicao falhou: registro 0001 divergiu'; END; $fail$;
\endif
\if :post6_ledger_0002_intact
\else
  \echo 'ERRO [0003]: checksum/registro 0002 foi alterado.'
  DO $fail$ BEGIN RAISE EXCEPTION 'Poscondicao falhou: registro 0002 divergiu'; END; $fail$;
\endif
\if :post6_ledger_0003_exact
\else
  \echo 'ERRO [0003]: registro da migration 0003 diverge (migration_id, checksum, login, role ou database).'
  DO $fail$ BEGIN RAISE EXCEPTION 'Poscondicao falhou: registro da migration 0003 diverge do esperado'; END; $fail$;
\endif

\echo 'Poscondicoes de 0003 validadas sob identidade owner_role.'

RESET ROLE;

SELECT
  (session_user IS NOT DISTINCT FROM :'migrator_role') AS session_is_migrator,
  (current_user IS NOT DISTINCT FROM :'migrator_role') AS current_is_migrator
\gset postReset_

\if :postReset_session_is_migrator
\else
  \echo 'ERRO [0003]: falha pos RESET ROLE: session_user difere de migrator_role (:migrator_role).'
  DO $fail$ BEGIN RAISE EXCEPTION 'Falha pos RESET ROLE: session_user difere de migrator_role'; END; $fail$;
\endif
\if :postReset_current_is_migrator
\else
  \echo 'ERRO [0003]: falha pos RESET ROLE: current_user difere de migrator_role (:migrator_role).'
  DO $fail$ BEGIN RAISE EXCEPTION 'Falha pos RESET ROLE: current_user difere de migrator_role'; END; $fail$;
\endif

\echo 'RESET ROLE confirmado: sessao retornou a migrator_role.'

COMMIT;

\echo '=== 0003: EXPANDIR PAINEL ADMINISTRATIVO - concluido. Painel expandido, owned by owner_role, sem seed, Runtime APP com DML default nas 6 tabelas, ledger com 0001+0002+0003. ==='
