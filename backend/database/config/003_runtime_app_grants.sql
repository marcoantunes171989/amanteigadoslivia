-- =============================================================================
-- 003_runtime_app_grants.sql
--
-- Fase: RUNTIME APP GRANTS (READ_WRITE_NO_DDL) para objetos FUTUROS
-- criados por owner_role no schema app, mais USAGE direto no schema app
-- para app_role (NAO e migration de negocio; NAO cria tabela, sequence
-- ou function).
--
-- Pre-requisito: bootstrap do schema app (backend/database/bootstrap/001-003),
-- o artefato de search_path por database (backend/database/config/001) e o
-- artefato de DEFAULT PRIVILEGES de FUNCTIONS de owner_role
-- (backend/database/config/002) ja devem ter sido executados e auditados
-- neste database antes de rodar este script. Baseline exigido ANTES desta
-- fase (comprovado em DEV para 5.0D.6E): owner_role possui exatamente 1
-- entrada pg_default_acl (GLOBAL, defaclnamespace=0, defaclobjtype='f',
-- sem EXECUTE para PUBLIC/app_role/migrator_role); zero default ACL de
-- TABLES/SEQUENCES para owner_role; zero pg_default_acl para
-- migrator_role; zero pg_default_acl para app_role.
--
-- Escopo real desta fase:
--   1) GRANT USAGE ON SCHEMA app TO app_role (grant direto, unico grant de
--      schema concedido a app_role nesta fase; CREATE nao e concedido).
--   2) ALTER DEFAULT PRIVILEGES FOR ROLE owner_role IN SCHEMA app GRANT
--      SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_role.
--   3) ALTER DEFAULT PRIVILEGES FOR ROLE owner_role IN SCHEMA app GRANT
--      USAGE ON SEQUENCES TO app_role.
-- Nada alem disso. Nenhum objeto (tabela/sequence/function) e criado.
-- Nenhum grant e concedido a PUBLIC ou a migrator_role. Nenhuma membership
-- e concedida a app_role. app_role nao recebe capacidade de SET ROLE para
-- owner_role ou migrator_role nesta fase (nem em nenhuma fase futura
-- prevista pela arquitetura corrente). app_role nao recebe EXECUTE em
-- FUNCTIONS/ROUTINES (nem automatico via default ACL, nem direto): a
-- entrada global de FUNCTIONS de owner_role criada em 5.0D.6E permanece
-- inalterada por este script, e nenhuma nova entrada de default ACL de
-- FUNCTIONS e criada no schema app.
--
-- Runtime APP resultante: READ_WRITE_NO_DDL. Podera futuramente
-- consultar/inserir/atualizar/excluir dados e consumir sequences
-- necessarias a INSERTs em tabelas futuras do schema app. Nao podera
-- CREATE/ALTER/DROP/TRUNCATE objetos, criar schema, receber ownership,
-- SET ROLE para owner_role/migrator_role, ou receber membership.
--
-- Identidade esperada: Migrator do ambiente, autenticado por LOGIN real
-- (mesma identidade usada em backend/database/bootstrap/002 e em
-- backend/database/config/001-002). O script executa SET ROLE owner_role
-- para o GRANT ON SCHEMA e para os dois ALTER DEFAULT PRIVILEGES, e
-- RESET ROLE ao final. Runtime APP nunca participa desta sessao.
--
-- Variaveis psql obrigatorias (passadas via -v, nenhum valor default aqui):
--   target_database  -> nome do database alvo
--   owner_role       -> role Owner do schema app no ambiente (deve ser
--                       alcancavel via SET ROLE pela sessao atual)
--   migrator_role    -> role Migrator do ambiente (deve ser a sessao atual)
--   app_role         -> role Runtime APP do ambiente (grantee desta fase)
--
-- Efeito: app_role passa a possuir USAGE efetivo no schema app (CREATE
-- permanece false). owner_role passa a possuir, alem da entrada global de
-- FUNCTIONS ja existente (5.0D.6E), exatamente mais duas entradas de
-- default ACL: uma de TABLES (schema app) e uma de SEQUENCES (schema app),
-- ambas concedendo privilegios exclusivamente a app_role, sem grant
-- option. PUBLIC e migrator_role nao recebem qualquer privilegio novo.
-- Nenhuma membership, search_path, owner de schema/database ou ACL de
-- FUNCTIONS e alterada por este script.
--
-- Nota de implementacao: psql NAO interpola variaveis (:var, :'var', :"var")
-- dentro do corpo de blocos dollar-quoted (DO $tag$ ... $tag$). Esse corpo e
-- um literal de string para o comando SQL externo, resolvido inteiramente no
-- servidor. Por isso, toda validacao parametrizada abaixo e feita via SQL
-- top-level (onde psql interpola corretamente) seguido de \gset e \if. Blocos
-- DO sao usados somente para RAISE EXCEPTION com mensagem ESTATICA (sem
-- variavel psql), servindo apenas como mecanismo de aborto de transacao.
--
-- Esta fase (5.0D.6F) apenas cria este artefato em DRAFT; nenhuma execucao
-- real contra qualquer ambiente (DEV, HOMOLOG ou PROD) ocorre nesta fase.
--
-- Requisito minimo: PostgreSQL >= 16. Motivo: mesmas colunas de
-- pg_auth_members (inherit_option, set_option) usadas em config/001-002 e
-- em bootstrap/002 sao reutilizadas aqui para revalidar a membership
-- Migrator -> Owner.
-- =============================================================================

\set ON_ERROR_STOP on

\if :{?target_database}
\else
  \echo 'ERRO [config/003]: variavel psql "target_database" ausente. Use -v target_database=... Nenhum GRANT/ALTER DEFAULT PRIVILEGES sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: target_database. Script config/003 abortado antes de qualquer instrucao SQL.';
  END;
  $missing_var$;
\endif
\if :{?owner_role}
\else
  \echo 'ERRO [config/003]: variavel psql "owner_role" ausente. Use -v owner_role=... Nenhum GRANT/ALTER DEFAULT PRIVILEGES sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: owner_role. Script config/003 abortado antes de qualquer instrucao SQL.';
  END;
  $missing_var$;
\endif
\if :{?migrator_role}
\else
  \echo 'ERRO [config/003]: variavel psql "migrator_role" ausente. Use -v migrator_role=... Nenhum GRANT/ALTER DEFAULT PRIVILEGES sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: migrator_role. Script config/003 abortado antes de qualquer instrucao SQL.';
  END;
  $missing_var$;
\endif
\if :{?app_role}
\else
  \echo 'ERRO [config/003]: variavel psql "app_role" ausente. Use -v app_role=... Nenhum GRANT/ALTER DEFAULT PRIVILEGES sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: app_role. Script config/003 abortado antes de qualquer instrucao SQL.';
  END;
  $missing_var$;
\endif

\echo '=== config/003: RUNTIME APP GRANTS (READ_WRITE_NO_DDL) - inicio ==='
\echo 'Este script deve ser executado autenticado como migrator_role.'

BEGIN;

-- ---------------------------------------------------------------------------
-- PRECONDICAO 0 (identidade de sessao, pre SET ROLE): a sessao atual deve
-- ser exatamente o Migrator, capaz de SET ROLE para owner_role, com app_role
-- ausente da sessao, e o schema app deve existir.
-- ---------------------------------------------------------------------------

SELECT
  (current_database() IS NOT DISTINCT FROM :'target_database') AS db_ok,
  (session_user IS NOT DISTINCT FROM :'migrator_role')          AS session_is_migrator,
  (current_user IS NOT DISTINCT FROM :'migrator_role')          AS current_is_migrator,
  (session_user = :'app_role' OR current_user = :'app_role')    AS app_role_in_session,
  pg_has_role(current_user, :'owner_role', 'SET')                AS can_set_owner,
  EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app')      AS schema_app_exists
\gset pre0_

\if :pre0_db_ok
\else
  \echo 'ERRO [config/003]: current_database() difere de target_database (:target_database).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: current_database() difere de target_database';
  END;
  $fail$;
\endif
\if :pre0_session_is_migrator
\else
  \echo 'ERRO [config/003]: session_user difere de migrator_role (:migrator_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: session_user difere de migrator_role';
  END;
  $fail$;
\endif
\if :pre0_current_is_migrator
\else
  \echo 'ERRO [config/003]: current_user difere de migrator_role (:migrator_role) antes de SET ROLE.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: current_user difere de migrator_role antes de SET ROLE';
  END;
  $fail$;
\endif
\if :pre0_app_role_in_session
  \echo 'ERRO [config/003]: app_role (:app_role) nao pode participar desta sessao.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role nao pode participar desta sessao';
  END;
  $fail$;
\endif
\if :pre0_can_set_owner
\else
  \echo 'ERRO [config/003]: migrator_role (:migrator_role) nao pode executar SET ROLE para owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role nao pode executar SET ROLE para owner_role';
  END;
  $fail$;
\endif
\if :pre0_schema_app_exists
\else
  \echo 'ERRO [config/003]: schema "app" nao existe. Execute o bootstrap (backend/database/bootstrap/001-003) antes deste script.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: schema app nao existe';
  END;
  $fail$;
\endif

-- Owner do schema app deve ser exatamente owner_role. OID do schema e
-- capturado aqui via \gset para reuso em checagens de default ACL
-- (defaclnamespace) mais adiante.
SELECT
  ((SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = 'app') IS NOT DISTINCT FROM :'owner_role') AS schema_owner_ok,
  (SELECT oid FROM pg_namespace WHERE nspname = 'app') AS app_namespace_oid
\gset pre1_

\if :pre1_schema_owner_ok
\else
  \echo 'ERRO [config/003]: owner do schema app difere de owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: owner do schema app difere de owner_role';
  END;
  $fail$;
\endif

-- Membership DIRETA Migrator -> Owner deve ser exatamente admin_option=false,
-- inherit_option=false, set_option=true, sem membership adicional. Runtime
-- APP deve permanecer sem membership DIRETA em Owner ou Migrator, e sem
-- capacidade de SET ROLE para nenhuma das duas (pg_has_role, prova
-- independente de aclexplode/pg_auth_members, cobre tambem membership
-- indireta, ainda que nao prevista pela arquitetura atual).
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
\gset pre2_

\if :pre2_migrator_owner_membership_exact
\else
  \echo 'ERRO [config/003]: migrator_role (:migrator_role) nao possui membership direta em owner_role (:owner_role) com admin_option=false, inherit_option=false, set_option=true.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role nao possui membership exata em owner_role';
  END;
  $fail$;
\endif
\if :pre2_migrator_owner_no_extra_membership
\else
  \echo 'ERRO [config/003]: existe membership adicional de migrator_role (:migrator_role) em owner_role (:owner_role) com admin_option/inherit_option true.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: membership adicional de migrator_role em owner_role';
  END;
  $fail$;
\endif
\if :pre2_app_owner_no_direct_membership
\else
  \echo 'ERRO [config/003]: app_role (:app_role) possui membership DIRETA indevida em owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role possui membership direta indevida em owner_role';
  END;
  $fail$;
\endif
\if :pre2_app_migrator_no_direct_membership
\else
  \echo 'ERRO [config/003]: app_role (:app_role) possui membership DIRETA indevida em migrator_role (:migrator_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role possui membership direta indevida em migrator_role';
  END;
  $fail$;
\endif
\if :pre2_app_cannot_set_owner
\else
  \echo 'ERRO [config/003]: app_role (:app_role) possui capacidade de SET ROLE para owner_role (:owner_role); esperado false.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role possui SET ROLE para owner_role';
  END;
  $fail$;
\endif
\if :pre2_app_cannot_set_migrator
\else
  \echo 'ERRO [config/003]: app_role (:app_role) possui capacidade de SET ROLE para migrator_role (:migrator_role); esperado false.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role possui SET ROLE para migrator_role';
  END;
  $fail$;
\endif

-- search_path POR DATABASE das tres roles deve ja estar configurado como
-- "app, pg_catalog" (artefato config/001 ja executado e auditado).
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
\gset pre3_

\if :pre3_owner_search_path_ok
\else
  \echo 'ERRO [config/003]: search_path POR DATABASE de owner_role (:owner_role) para target_database difere de "app, pg_catalog". Execute e audite config/001 antes deste script.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: search_path de owner_role incorreto ou ausente';
  END;
  $fail$;
\endif
\if :pre3_migrator_search_path_ok
\else
  \echo 'ERRO [config/003]: search_path POR DATABASE de migrator_role (:migrator_role) para target_database difere de "app, pg_catalog". Execute e audite config/001 antes deste script.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: search_path de migrator_role incorreto ou ausente';
  END;
  $fail$;
\endif
\if :pre3_app_search_path_ok
\else
  \echo 'ERRO [config/003]: search_path POR DATABASE de app_role (:app_role) para target_database difere de "app, pg_catalog". Execute e audite config/001 antes deste script.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: search_path de app_role incorreto ou ausente';
  END;
  $fail$;
\endif

-- CREATE no database deve continuar false para as tres roles.
SELECT
  has_database_privilege(:'owner_role', current_database(), 'CREATE')    AS owner_db_create,
  has_database_privilege(:'migrator_role', current_database(), 'CREATE') AS migrator_db_create,
  has_database_privilege(:'app_role', current_database(), 'CREATE')      AS app_db_create
\gset pre4_

\if :pre4_owner_db_create
  \echo 'ERRO [config/003]: owner_role (:owner_role) possui CREATE no database; esperado false nesta fase.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: owner_role possui CREATE no database';
  END;
  $fail$;
\endif
\if :pre4_migrator_db_create
  \echo 'ERRO [config/003]: migrator_role (:migrator_role) possui CREATE no database; esperado false nesta fase.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role possui CREATE no database';
  END;
  $fail$;
\endif
\if :pre4_app_db_create
  \echo 'ERRO [config/003]: app_role (:app_role) possui CREATE no database; esperado false nesta fase.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role possui CREATE no database';
  END;
  $fail$;
\endif

-- Privilegios efetivos no schema app ANTES desta fase: Owner CREATE+USAGE,
-- PUBLIC e Runtime APP sem CREATE/USAGE, Migrator sem grant DIRETO de
-- CREATE/USAGE.
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
  \echo 'ERRO [config/003]: owner_role (:owner_role) sem CREATE efetivo no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: owner_role sem CREATE efetivo no schema app';
  END;
  $fail$;
\endif
\if :pre5_owner_schema_usage
\else
  \echo 'ERRO [config/003]: owner_role (:owner_role) sem USAGE efetivo no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: owner_role sem USAGE efetivo no schema app';
  END;
  $fail$;
\endif
\if :pre5_public_schema_create
  \echo 'ERRO [config/003]: PUBLIC possui CREATE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: PUBLIC possui CREATE no schema app';
  END;
  $fail$;
\endif
\if :pre5_public_schema_usage
  \echo 'ERRO [config/003]: PUBLIC possui USAGE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: PUBLIC possui USAGE no schema app';
  END;
  $fail$;
\endif
\if :pre5_app_schema_create
  \echo 'ERRO [config/003]: app_role (:app_role) possui CREATE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role possui CREATE no schema app';
  END;
  $fail$;
\endif
\if :pre5_app_schema_usage
  \echo 'ERRO [config/003]: app_role (:app_role) ja possui USAGE no schema app antes desta fase; estado inicial inesperado.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role ja possui USAGE no schema app antes desta fase';
  END;
  $fail$;
\endif
\if :pre5_migrator_direct_grant
  \echo 'ERRO [config/003]: migrator_role (:migrator_role) possui grant DIRETO de CREATE/USAGE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role possui grant DIRETO de CREATE/USAGE no schema app';
  END;
  $fail$;
\endif

-- schema app deve permanecer vazio (zero relations, zero routines).
SELECT
  ((SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app') = 0) AS relation_count_zero,
  ((SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app') = 0)  AS routine_count_zero
\gset pre6_

\if :pre6_relation_count_zero
\else
  \echo 'ERRO [config/003]: schema app contem relation(s); esperado 0 nesta fase.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: schema app contem relation(s)';
  END;
  $fail$;
\endif
\if :pre6_routine_count_zero
\else
  \echo 'ERRO [config/003]: schema app contem routine(s); esperado 0 nesta fase.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: schema app contem routine(s)';
  END;
  $fail$;
\endif

-- BASELINE de pg_default_acl exigido pela conclusao auditada de 5.0D.6E:
-- owner_role possui EXATAMENTE 1 entrada (GLOBAL, defaclnamespace=0,
-- defaclobjtype='f'), sem EXECUTE para PUBLIC/app_role/migrator_role nessa
-- entrada; zero entradas de TABLES/SEQUENCES para owner_role em qualquer
-- schema; migrator_role e app_role com zero entradas totais (nunca
-- participaram como defaclrole ate aqui). Este script nao deve rodar sobre
-- um estado ja parcialmente configurado por esta mesma fase (idempotencia).
SELECT
  ((SELECT count(*)
      FROM pg_default_acl d
      JOIN pg_roles r ON r.oid = d.defaclrole
      WHERE r.rolname = :'owner_role') = 1) AS owner_total_default_acl_row_count_exact_one,
  ((SELECT count(*)
      FROM pg_default_acl d
      JOIN pg_roles r ON r.oid = d.defaclrole
      WHERE r.rolname = :'owner_role'
        AND d.defaclnamespace = 0
        AND d.defaclobjtype = 'f') = 1) AS owner_global_functions_default_acl_exists,
  NOT EXISTS (
    SELECT 1 FROM pg_default_acl d
    JOIN pg_roles r ON r.oid = d.defaclrole
    WHERE r.rolname = :'owner_role'
      AND d.defaclobjtype IN ('r', 'S')
  ) AS owner_no_tables_or_sequences_default_acl,
  NOT EXISTS (
    SELECT 1
    FROM pg_default_acl d
    JOIN pg_roles r ON r.oid = d.defaclrole
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE r.rolname = :'owner_role' AND d.defaclnamespace = 0
      AND a.grantee = 0
  ) AS no_public_grant_in_global_functions_default_acl,
  NOT EXISTS (
    SELECT 1
    FROM pg_default_acl d
    JOIN pg_roles r ON r.oid = d.defaclrole
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    JOIN pg_roles gr ON gr.oid = a.grantee
    WHERE r.rolname = :'owner_role' AND d.defaclnamespace = 0
      AND gr.rolname = :'app_role'
  ) AS no_app_grant_in_global_functions_default_acl,
  NOT EXISTS (
    SELECT 1
    FROM pg_default_acl d
    JOIN pg_roles r ON r.oid = d.defaclrole
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    JOIN pg_roles gr ON gr.oid = a.grantee
    WHERE r.rolname = :'owner_role' AND d.defaclnamespace = 0
      AND gr.rolname = :'migrator_role'
  ) AS no_migrator_grant_in_global_functions_default_acl,
  ((SELECT count(*)
      FROM pg_default_acl d
      JOIN pg_roles r ON r.oid = d.defaclrole
      WHERE r.rolname = :'migrator_role') = 0) AS migrator_default_acl_zero,
  ((SELECT count(*)
      FROM pg_default_acl d
      JOIN pg_roles r ON r.oid = d.defaclrole
      WHERE r.rolname = :'app_role') = 0) AS app_default_acl_zero
\gset pre7_

\if :pre7_owner_total_default_acl_row_count_exact_one
\else
  \echo 'ERRO [config/003]: owner_role (:owner_role) nao possui exatamente 1 entrada pg_default_acl (esperado: baseline de FUNCTIONS global de 5.0D.6E). Confirme execucao e auditoria de config/002 antes deste script.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: owner_role sem exatamente 1 entrada pg_default_acl (baseline 5.0D.6E)';
  END;
  $fail$;
\endif
\if :pre7_owner_global_functions_default_acl_exists
\else
  \echo 'ERRO [config/003]: nao foi encontrada entrada pg_default_acl GLOBAL (defaclnamespace = 0) de FUNCTIONS para owner_role (:owner_role). Confirme execucao e auditoria de config/002 antes deste script.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: entrada pg_default_acl global de FUNCTIONS ausente para owner_role';
  END;
  $fail$;
\endif
\if :pre7_owner_no_tables_or_sequences_default_acl
\else
  \echo 'ERRO [config/003]: owner_role (:owner_role) ja possui entrada pg_default_acl de TABLES ou SEQUENCES; esperado nenhuma antes desta fase.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: owner_role com pg_default_acl inesperado de TABLES/SEQUENCES antes desta fase';
  END;
  $fail$;
\endif
\if :pre7_no_public_grant_in_global_functions_default_acl
\else
  \echo 'ERRO [config/003]: PUBLIC possui privilegio no default ACL global de FUNCTIONS de owner_role.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: PUBLIC com privilegio em default ACL global de FUNCTIONS';
  END;
  $fail$;
\endif
\if :pre7_no_app_grant_in_global_functions_default_acl
\else
  \echo 'ERRO [config/003]: app_role (:app_role) possui privilegio no default ACL global de FUNCTIONS de owner_role.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role com privilegio em default ACL global de FUNCTIONS';
  END;
  $fail$;
\endif
\if :pre7_no_migrator_grant_in_global_functions_default_acl
\else
  \echo 'ERRO [config/003]: migrator_role (:migrator_role) possui privilegio no default ACL global de FUNCTIONS de owner_role.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role com privilegio em default ACL global de FUNCTIONS';
  END;
  $fail$;
\endif
\if :pre7_migrator_default_acl_zero
\else
  \echo 'ERRO [config/003]: migrator_role (:migrator_role) ja possui entrada em pg_default_acl como defaclrole; esperado 0 antes desta fase.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role com pg_default_acl inesperado antes desta fase';
  END;
  $fail$;
\endif
\if :pre7_app_default_acl_zero
\else
  \echo 'ERRO [config/003]: app_role (:app_role) ja possui entrada em pg_default_acl como defaclrole; esperado 0 antes desta fase.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role com pg_default_acl inesperado antes desta fase';
  END;
  $fail$;
\endif

\echo 'Todas as precondicoes de config/003 (pre SET ROLE) foram validadas com sucesso.'

-- ---------------------------------------------------------------------------
-- SET ROLE owner_role: o GRANT ON SCHEMA e os dois ALTER DEFAULT PRIVILEGES
-- exigem que a sessao seja capaz de agir como owner_role (dono do schema
-- app). session_user permanece migrator_role (auditavel via
-- pg_stat_activity / logs de sessao).
-- ---------------------------------------------------------------------------

SET ROLE :"owner_role";

SELECT
  (current_user IS NOT DISTINCT FROM :'owner_role')    AS current_is_owner,
  (session_user IS NOT DISTINCT FROM :'migrator_role') AS session_is_migrator
\gset postSet_

\if :postSet_current_is_owner
\else
  \echo 'ERRO [config/003]: falha pos SET ROLE: current_user difere de owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Falha pos SET ROLE: current_user difere de owner_role';
  END;
  $fail$;
\endif
\if :postSet_session_is_migrator
\else
  \echo 'ERRO [config/003]: falha pos SET ROLE: session_user difere de migrator_role (:migrator_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Falha pos SET ROLE: session_user difere de migrator_role';
  END;
  $fail$;
\endif

\echo 'SET ROLE owner_role confirmado; session_user permanece migrator_role.'

-- ---------------------------------------------------------------------------
-- ALTERACOES AUTORIZADAS (READ_WRITE_NO_DDL para app_role):
--   1) USAGE direto no schema app (sem CREATE).
--   2) DEFAULT PRIVILEGES de TABLES futuras no schema app: SELECT, INSERT,
--      UPDATE, DELETE (sem TRUNCATE/REFERENCES/TRIGGER/MAINTAIN, sem grant
--      option).
--   3) DEFAULT PRIVILEGES de SEQUENCES futuras no schema app: USAGE (sem
--      SELECT/UPDATE, sem grant option).
-- Nenhum grant a PUBLIC ou migrator_role. Nenhum default ACL de FUNCTIONS
-- e criado no schema app nesta fase.
-- ---------------------------------------------------------------------------

GRANT USAGE ON SCHEMA app TO :"app_role";

ALTER DEFAULT PRIVILEGES
FOR ROLE :"owner_role"
IN SCHEMA app
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLES
TO :"app_role";

ALTER DEFAULT PRIVILEGES
FOR ROLE :"owner_role"
IN SCHEMA app
GRANT USAGE
ON SEQUENCES
TO :"app_role";

\echo 'Grants de runtime configurados: app_role com USAGE no schema app; DEFAULT PRIVILEGES de owner_role no schema app concedendo SELECT/INSERT/UPDATE/DELETE em TABLES e USAGE em SEQUENCES futuras a app_role. Nenhum grant a PUBLIC ou migrator_role. Nenhum default ACL de FUNCTIONS criado no schema app.'

-- ---------------------------------------------------------------------------
-- ASSERT POS-ALTER (ainda dentro da transacao, ainda sob SET ROLE
-- owner_role). Qualquer falha aborta a transacao antes do COMMIT.
-- ---------------------------------------------------------------------------

-- Schema app: Owner mantem CREATE+USAGE; app_role passa a ter USAGE (sem
-- CREATE); PUBLIC continua sem CREATE/USAGE; Migrator continua sem grant
-- DIRETO. aclexplode confirma que o grant de app_role no schema e
-- EXATAMENTE USAGE, sem grant option.
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
  ) AS migrator_direct_grant,
  ((SELECT array_agg(a.privilege_type ORDER BY a.privilege_type)
      FROM pg_namespace n
      CROSS JOIN LATERAL aclexplode(n.nspacl) a
      JOIN pg_roles r ON r.oid = a.grantee
      WHERE n.nspname = 'app' AND r.rolname = :'app_role') = ARRAY['USAGE']) AS app_schema_privs_exact_usage,
  NOT EXISTS (
    SELECT 1
    FROM pg_namespace n
    CROSS JOIN LATERAL aclexplode(n.nspacl) a
    JOIN pg_roles r ON r.oid = a.grantee
    WHERE n.nspname = 'app' AND r.rolname = :'app_role' AND a.is_grantable
  ) AS app_schema_no_grant_option
\gset post1_

\if :post1_owner_schema_create
\else
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: owner_role (:owner_role) perdeu CREATE efetivo no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: owner_role sem CREATE efetivo no schema app';
  END;
  $fail$;
\endif
\if :post1_owner_schema_usage
\else
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: owner_role (:owner_role) perdeu USAGE efetivo no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: owner_role sem USAGE efetivo no schema app';
  END;
  $fail$;
\endif
\if :post1_public_schema_create
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: PUBLIC passou a possuir CREATE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: PUBLIC com CREATE no schema app';
  END;
  $fail$;
\endif
\if :post1_public_schema_usage
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: PUBLIC passou a possuir USAGE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: PUBLIC com USAGE no schema app';
  END;
  $fail$;
\endif
\if :post1_app_schema_create
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: app_role (:app_role) passou a possuir CREATE no schema app; esperado false.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: app_role com CREATE no schema app';
  END;
  $fail$;
\endif
\if :post1_app_schema_usage
\else
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: app_role (:app_role) nao possui USAGE efetivo no schema app apos o GRANT.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: app_role sem USAGE efetivo no schema app apos GRANT';
  END;
  $fail$;
\endif
\if :post1_migrator_direct_grant
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: migrator_role (:migrator_role) passou a possuir grant DIRETO de CREATE/USAGE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: migrator_role com grant direto no schema app';
  END;
  $fail$;
\endif
\if :post1_app_schema_privs_exact_usage
\else
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: conjunto de privilegios de app_role (:app_role) no schema app difere de exatamente {USAGE}.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: privilegios de app_role no schema app diferem de {USAGE}';
  END;
  $fail$;
\endif
\if :post1_app_schema_no_grant_option
\else
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: app_role (:app_role) possui grant option no schema app; esperado false.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: app_role com grant option no schema app';
  END;
  $fail$;
\endif

-- DEFAULT ACL pos-ALTER: owner_role deve possuir EXATAMENTE 3 entradas no
-- total (a global de FUNCTIONS ja existente de 5.0D.6E, mais 1 de TABLES e
-- 1 de SEQUENCES no schema app criadas agora). A entrada global de
-- FUNCTIONS permanece inalterada (revalidada abaixo). Nenhuma entrada de
-- FUNCTIONS e criada no schema app. migrator_role e app_role continuam com
-- ZERO entradas como defaclrole (nao sao FOR ROLE desta fase).
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
        AND d.defaclobjtype = 'f') = 1) AS owner_global_functions_default_acl_still_exists,
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
      WHERE r.rolname = :'owner_role'
        AND d.defaclnamespace = :pre1_app_namespace_oid
        AND d.defaclobjtype = 'r') = 1) AS owner_tables_default_acl_in_app_schema_exists_once,
  ((SELECT count(*)
      FROM pg_default_acl d
      JOIN pg_roles r ON r.oid = d.defaclrole
      WHERE r.rolname = :'owner_role'
        AND d.defaclnamespace = :pre1_app_namespace_oid
        AND d.defaclobjtype = 'S') = 1) AS owner_sequences_default_acl_in_app_schema_exists_once,
  ((SELECT count(*)
      FROM pg_default_acl d
      JOIN pg_roles r ON r.oid = d.defaclrole
      WHERE r.rolname = :'migrator_role') = 0) AS migrator_default_acl_zero,
  ((SELECT count(*)
      FROM pg_default_acl d
      JOIN pg_roles r ON r.oid = d.defaclrole
      WHERE r.rolname = :'app_role') = 0) AS app_default_acl_zero
\gset post2_

\if :post2_owner_total_default_acl_row_count_exact_three
\else
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: owner_role (:owner_role) nao possui exatamente 3 entradas pg_default_acl (1 global FUNCTIONS + 1 TABLES app + 1 SEQUENCES app).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: owner_role sem exatamente 3 entradas pg_default_acl';
  END;
  $fail$;
\endif
\if :post2_owner_global_functions_default_acl_still_exists
\else
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: entrada pg_default_acl GLOBAL (defaclnamespace = 0) de FUNCTIONS de owner_role (:owner_role) nao existe mais; esta fase nao deve alterar essa entrada.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: entrada pg_default_acl global de FUNCTIONS de owner_role ausente';
  END;
  $fail$;
\endif
\if :post2_owner_no_functions_default_acl_in_app_schema
\else
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: foi criada entrada pg_default_acl de FUNCTIONS no schema app para owner_role (:owner_role); esperado nenhuma nesta fase.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: entrada pg_default_acl de FUNCTIONS inesperada no schema app';
  END;
  $fail$;
\endif
\if :post2_owner_tables_default_acl_in_app_schema_exists_once
\else
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: entrada pg_default_acl de TABLES no schema app para owner_role (:owner_role) nao existe exatamente uma vez.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: entrada pg_default_acl de TABLES no schema app ausente ou duplicada';
  END;
  $fail$;
\endif
\if :post2_owner_sequences_default_acl_in_app_schema_exists_once
\else
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: entrada pg_default_acl de SEQUENCES no schema app para owner_role (:owner_role) nao existe exatamente uma vez.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: entrada pg_default_acl de SEQUENCES no schema app ausente ou duplicada';
  END;
  $fail$;
\endif
\if :post2_migrator_default_acl_zero
\else
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: migrator_role (:migrator_role) passou a possuir entrada em pg_default_acl como defaclrole; esperado 0.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: migrator_role com pg_default_acl inesperado';
  END;
  $fail$;
\endif
\if :post2_app_default_acl_zero
\else
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: app_role (:app_role) passou a possuir entrada em pg_default_acl como defaclrole; esperado 0.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: app_role com pg_default_acl inesperado';
  END;
  $fail$;
\endif

-- Revalidacao INTEGRAL da entrada GLOBAL de FUNCTIONS (baseline endurecida
-- em 5.0D.6E): nao basta confirmar que a entrada ainda existe (ja feito
-- acima); e necessario reexplodir pg_default_acl.defaclacl via
-- aclexplode(...) e confirmar explicitamente que PUBLIC, app_role e
-- migrator_role continuam com ZERO privilegio (especialmente ZERO EXECUTE)
-- nessa entrada, e que ela nao possui grant option. Nenhum ALTER DEFAULT
-- PRIVILEGES de FUNCTIONS e executado neste script; isto e SOMENTE
-- revalidacao.
SELECT
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
    WHERE r.rolname = :'owner_role' AND d.defaclnamespace = 0 AND d.defaclobjtype = 'f'
      AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
  ) AS global_functions_public_zero_execute,
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
      AND gr.rolname = :'app_role' AND a.privilege_type = 'EXECUTE'
  ) AS global_functions_app_zero_execute,
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
    JOIN pg_roles gr ON gr.oid = a.grantee
    WHERE r.rolname = :'owner_role' AND d.defaclnamespace = 0 AND d.defaclobjtype = 'f'
      AND gr.rolname = :'migrator_role' AND a.privilege_type = 'EXECUTE'
  ) AS global_functions_migrator_zero_execute,
  NOT EXISTS (
    SELECT 1
    FROM pg_default_acl d
    JOIN pg_roles r ON r.oid = d.defaclrole
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE r.rolname = :'owner_role' AND d.defaclnamespace = 0 AND d.defaclobjtype = 'f'
      AND a.is_grantable
  ) AS global_functions_no_grant_option
\gset post2b_

\if :post2b_global_functions_public_zero_priv
\else
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: PUBLIC possui privilegio na entrada GLOBAL de FUNCTIONS de owner_role (:owner_role); baseline de 5.0D.6E violada.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: PUBLIC com privilegio na entrada global de FUNCTIONS';
  END;
  $fail$;
\endif
\if :post2b_global_functions_public_zero_execute
\else
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: PUBLIC possui EXECUTE na entrada GLOBAL de FUNCTIONS de owner_role (:owner_role); baseline de 5.0D.6E violada.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: PUBLIC com EXECUTE na entrada global de FUNCTIONS';
  END;
  $fail$;
\endif
\if :post2b_global_functions_app_zero_priv
\else
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: app_role (:app_role) possui privilegio na entrada GLOBAL de FUNCTIONS de owner_role (:owner_role); baseline de 5.0D.6E violada.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: app_role com privilegio na entrada global de FUNCTIONS';
  END;
  $fail$;
\endif
\if :post2b_global_functions_app_zero_execute
\else
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: app_role (:app_role) possui EXECUTE na entrada GLOBAL de FUNCTIONS de owner_role (:owner_role); baseline de 5.0D.6E violada.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: app_role com EXECUTE na entrada global de FUNCTIONS';
  END;
  $fail$;
\endif
\if :post2b_global_functions_migrator_zero_priv
\else
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: migrator_role (:migrator_role) possui privilegio na entrada GLOBAL de FUNCTIONS de owner_role (:owner_role); baseline de 5.0D.6E violada.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: migrator_role com privilegio na entrada global de FUNCTIONS';
  END;
  $fail$;
\endif
\if :post2b_global_functions_migrator_zero_execute
\else
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: migrator_role (:migrator_role) possui EXECUTE na entrada GLOBAL de FUNCTIONS de owner_role (:owner_role); baseline de 5.0D.6E violada.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: migrator_role com EXECUTE na entrada global de FUNCTIONS';
  END;
  $fail$;
\endif
\if :post2b_global_functions_no_grant_option
\else
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: entrada GLOBAL de FUNCTIONS de owner_role (:owner_role) possui grant option inesperado; baseline de 5.0D.6E violada.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: grant option inesperado na entrada global de FUNCTIONS';
  END;
  $fail$;
\endif

\echo 'Revalidacao INTEGRAL da entrada GLOBAL de FUNCTIONS (baseline 5.0D.6E) concluida via aclexplode: PUBLIC, app_role e migrator_role continuam com zero privilegio (zero EXECUTE) e sem grant option.'

-- Conteudo exato da entrada de TABLES (schema app): app_role deve possuir
-- EXATAMENTE {DELETE, INSERT, SELECT, UPDATE}, sem TRUNCATE/REFERENCES/
-- TRIGGER/MAINTAIN, sem grant option; PUBLIC e migrator_role sem qualquer
-- privilegio nessa entrada.
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
  NOT EXISTS (
    SELECT 1
    FROM pg_default_acl d
    JOIN pg_roles r ON r.oid = d.defaclrole
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    JOIN pg_roles gr ON gr.oid = a.grantee
    WHERE r.rolname = :'owner_role'
      AND d.defaclnamespace = :pre1_app_namespace_oid
      AND d.defaclobjtype = 'r'
      AND gr.rolname = :'app_role'
      AND a.is_grantable
  ) AS app_tables_no_grant_option,
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
  ) AS tables_no_migrator_priv
\gset post3_

\if :post3_app_tables_privs_exact
\else
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: conjunto de privilegios default de TABLES (schema app) para app_role (:app_role) difere de exatamente {DELETE, INSERT, SELECT, UPDATE}.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: privilegios default de TABLES para app_role diferem do esperado';
  END;
  $fail$;
\endif
\if :post3_app_tables_no_grant_option
\else
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: app_role (:app_role) possui grant option no default ACL de TABLES (schema app); esperado false.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: app_role com grant option no default ACL de TABLES';
  END;
  $fail$;
\endif
\if :post3_tables_no_public_priv
\else
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: PUBLIC possui privilegio no default ACL de TABLES (schema app).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: PUBLIC com privilegio em default ACL de TABLES';
  END;
  $fail$;
\endif
\if :post3_tables_no_migrator_priv
\else
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: migrator_role (:migrator_role) possui privilegio no default ACL de TABLES (schema app).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: migrator_role com privilegio em default ACL de TABLES';
  END;
  $fail$;
\endif

-- Conteudo exato da entrada de SEQUENCES (schema app): app_role deve
-- possuir EXATAMENTE {USAGE}, sem SELECT/UPDATE, sem grant option; PUBLIC
-- e migrator_role sem qualquer privilegio nessa entrada.
SELECT
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
    JOIN pg_roles gr ON gr.oid = a.grantee
    WHERE r.rolname = :'owner_role'
      AND d.defaclnamespace = :pre1_app_namespace_oid
      AND d.defaclobjtype = 'S'
      AND gr.rolname = :'app_role'
      AND a.is_grantable
  ) AS app_sequences_no_grant_option,
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
\gset post4_

\if :post4_app_sequences_privs_exact
\else
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: conjunto de privilegios default de SEQUENCES (schema app) para app_role (:app_role) difere de exatamente {USAGE}.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: privilegios default de SEQUENCES para app_role diferem do esperado';
  END;
  $fail$;
\endif
\if :post4_app_sequences_no_grant_option
\else
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: app_role (:app_role) possui grant option no default ACL de SEQUENCES (schema app); esperado false.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: app_role com grant option no default ACL de SEQUENCES';
  END;
  $fail$;
\endif
\if :post4_sequences_no_public_priv
\else
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: PUBLIC possui privilegio no default ACL de SEQUENCES (schema app).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: PUBLIC com privilegio em default ACL de SEQUENCES';
  END;
  $fail$;
\endif
\if :post4_sequences_no_migrator_priv
\else
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: migrator_role (:migrator_role) possui privilegio no default ACL de SEQUENCES (schema app).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: migrator_role com privilegio em default ACL de SEQUENCES';
  END;
  $fail$;
\endif

-- Revalidacao POS-ALTER de pg_auth_members e pg_has_role (prova direta de
-- membership, independente dos asserts de ACL/default ACL acima): a
-- membership DIRETA Migrator -> Owner deve permanecer EXATAMENTE
-- admin_option=false, inherit_option=false, set_option=true, sem
-- membership adicional incompativel; Runtime APP deve continuar com ZERO
-- membership DIRETA em owner_role e ZERO membership DIRETA em
-- migrator_role, e sem capacidade de SET ROLE para nenhuma das duas.
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
\gset post5_

\if :post5_migrator_owner_membership_exact
\else
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: migrator_role (:migrator_role) nao possui membership direta em owner_role (:owner_role) com admin_option=false, inherit_option=false, set_option=true.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: migrator_role nao possui membership exata em owner_role';
  END;
  $fail$;
\endif
\if :post5_migrator_owner_no_extra_membership
\else
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: existe membership adicional de migrator_role (:migrator_role) em owner_role (:owner_role) com admin_option/inherit_option true.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: membership adicional de migrator_role em owner_role';
  END;
  $fail$;
\endif
\if :post5_app_owner_no_direct_membership
\else
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: app_role (:app_role) possui membership DIRETA indevida em owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: app_role possui membership direta indevida em owner_role';
  END;
  $fail$;
\endif
\if :post5_app_migrator_no_direct_membership
\else
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: app_role (:app_role) possui membership DIRETA indevida em migrator_role (:migrator_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: app_role possui membership direta indevida em migrator_role';
  END;
  $fail$;
\endif
\if :post5_app_cannot_set_owner
\else
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: app_role (:app_role) passou a possuir capacidade de SET ROLE para owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: app_role com SET ROLE para owner_role';
  END;
  $fail$;
\endif
\if :post5_app_cannot_set_migrator
\else
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: app_role (:app_role) passou a possuir capacidade de SET ROLE para migrator_role (:migrator_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: app_role com SET ROLE para migrator_role';
  END;
  $fail$;
\endif

\echo 'Revalidacao pos-ALTER de pg_auth_members/pg_has_role concluida: membership Migrator -> Owner permanece exata; Runtime APP permanece sem membership direta em Owner ou Migrator e sem capacidade de SET ROLE para nenhuma das duas.'

-- Reconfirma que search_path POR DATABASE das tres roles permanece intacto
-- (este script nunca executa ALTER ROLE ... SET search_path).
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
        AND split_part(elem, '=', 1) = 'search_path') = ARRAY['app', 'pg_catalog']) AS app_search_path_still_ok
\gset post6_

\if :post6_owner_search_path_still_ok
\else
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: search_path POR DATABASE de owner_role (:owner_role) mudou; esperado permanecer "app, pg_catalog".'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: search_path de owner_role mudou';
  END;
  $fail$;
\endif
\if :post6_migrator_search_path_still_ok
\else
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: search_path POR DATABASE de migrator_role (:migrator_role) mudou; esperado permanecer "app, pg_catalog".'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: search_path de migrator_role mudou';
  END;
  $fail$;
\endif
\if :post6_app_search_path_still_ok
\else
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: search_path POR DATABASE de app_role (:app_role) mudou; esperado permanecer "app, pg_catalog".'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: search_path de app_role mudou';
  END;
  $fail$;
\endif

-- Reconfirma que nenhum efeito colateral ocorreu: CREATE no database
-- continua false para as tres roles, schema app continua vazio.
SELECT
  has_database_privilege(:'owner_role', current_database(), 'CREATE')    AS owner_db_create,
  has_database_privilege(:'migrator_role', current_database(), 'CREATE') AS migrator_db_create,
  has_database_privilege(:'app_role', current_database(), 'CREATE')      AS app_db_create,
  ((SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app') = 0) AS relation_count_zero,
  ((SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app') = 0)  AS routine_count_zero
\gset post7_

\if :post7_owner_db_create
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: owner_role (:owner_role) passou a possuir CREATE no database.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: owner_role com CREATE no database apos esta fase';
  END;
  $fail$;
\endif
\if :post7_migrator_db_create
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: migrator_role (:migrator_role) passou a possuir CREATE no database.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: migrator_role com CREATE no database apos esta fase';
  END;
  $fail$;
\endif
\if :post7_app_db_create
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: app_role (:app_role) passou a possuir CREATE no database.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: app_role com CREATE no database apos esta fase';
  END;
  $fail$;
\endif
\if :post7_relation_count_zero
\else
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: schema app passou a conter relation(s).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: schema app com relation(s) apos esta fase';
  END;
  $fail$;
\endif
\if :post7_routine_count_zero
\else
  \echo 'ERRO [config/003]: assert pos-ALTER falhou: schema app passou a conter routine(s).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: schema app com routine(s) apos esta fase';
  END;
  $fail$;
\endif

\echo 'Assert pos-ALTER de config/003 validado: app_role com USAGE no schema app (sem CREATE); DEFAULT PRIVILEGES de owner_role no schema app concedendo exatamente SELECT/INSERT/UPDATE/DELETE em TABLES e USAGE em SEQUENCES a app_role, sem grant option, sem privilegio a PUBLIC/migrator_role; baseline de FUNCTIONS de 5.0D.6E inalterado; sem efeito colateral em search_path, CREATE de database, membership ou objetos do schema app.'

RESET ROLE;

SELECT
  (session_user IS NOT DISTINCT FROM :'migrator_role') AS session_is_migrator,
  (current_user IS NOT DISTINCT FROM :'migrator_role') AS current_is_migrator
\gset postReset_

\if :postReset_session_is_migrator
\else
  \echo 'ERRO [config/003]: falha pos RESET ROLE: session_user difere de migrator_role (:migrator_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Falha pos RESET ROLE: session_user difere de migrator_role';
  END;
  $fail$;
\endif
\if :postReset_current_is_migrator
\else
  \echo 'ERRO [config/003]: falha pos RESET ROLE: current_user difere de migrator_role (:migrator_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Falha pos RESET ROLE: current_user difere de migrator_role';
  END;
  $fail$;
\endif

\echo 'RESET ROLE confirmado: sessao retornou a migrator_role.'

COMMIT;

\echo '=== config/003: RUNTIME APP GRANTS - concluido. app_role (READ_WRITE_NO_DDL) com USAGE no schema app e DEFAULT PRIVILEGES para SELECT/INSERT/UPDATE/DELETE em TABLES e USAGE em SEQUENCES futuras do schema app; sem CREATE/DDL, sem EXECUTE em FUNCTIONS, sem membership, sem SET ROLE para Owner/Migrator. ==='
