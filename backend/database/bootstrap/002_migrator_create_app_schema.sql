-- =============================================================================
-- 002_migrator_create_app_schema.sql
--
-- Fase: bootstrap administrativo do schema "app" (NAO e migration de negocio).
-- Identidade esperada: Migrator do ambiente, autenticado por LOGIN real.
--   O script executa SET ROLE owner_role para o CREATE SCHEMA e RESET ROLE
--   ao final. Runtime APP nunca participa desta sessao.
--
-- Pre-requisito: script 001 ja executado (owner_role possui CREATE temporario
-- no database alvo).
--
-- Variaveis psql obrigatorias (passadas via -v, nenhum valor default aqui):
--   target_database  -> nome do database alvo (informativo/validacao)
--   owner_role       -> role Owner do schema app no ambiente
--   migrator_role    -> role Migrator do ambiente (deve ser a sessao atual)
--   app_role         -> role Runtime APP do ambiente
--
-- Efeito: cria o schema app (AUTHORIZATION owner_role) e imediatamente
-- revoga CREATE/USAGE de PUBLIC, app_role e migrator_role (identidade propria)
-- sobre o schema recem-criado. Nenhum objeto e criado dentro de app. Nenhum
-- DML e concedido. search_path e default privileges nao sao alterados.
--
-- Nota de implementacao: psql NAO interpola variaveis (:var, :'var', :"var")
-- dentro do corpo de blocos dollar-quoted (DO $tag$ ... $tag$). Esse corpo e
-- um literal de string para o comando SQL externo, resolvido inteiramente no
-- servidor. Por isso, toda validacao parametrizada abaixo e feita via SQL
-- top-level (onde psql interpola corretamente) seguido de \gset e \if. Blocos
-- DO sao usados somente para RAISE EXCEPTION com mensagem ESTATICA (sem
-- variavel psql), servindo apenas como mecanismo de aborto de transacao.
-- =============================================================================

\set ON_ERROR_STOP on

\if :{?target_database}
\else
  \echo 'ERRO [002]: variavel psql "target_database" ausente. Use -v target_database=... Nenhum CREATE/REVOKE sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: target_database. Script 002 abortado antes de qualquer instrucao SQL.';
  END;
  $missing_var$;
\endif
\if :{?owner_role}
\else
  \echo 'ERRO [002]: variavel psql "owner_role" ausente. Use -v owner_role=... Nenhum CREATE/REVOKE sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: owner_role. Script 002 abortado antes de qualquer instrucao SQL.';
  END;
  $missing_var$;
\endif
\if :{?migrator_role}
\else
  \echo 'ERRO [002]: variavel psql "migrator_role" ausente. Use -v migrator_role=... Nenhum CREATE/REVOKE sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: migrator_role. Script 002 abortado antes de qualquer instrucao SQL.';
  END;
  $missing_var$;
\endif
\if :{?app_role}
\else
  \echo 'ERRO [002]: variavel psql "app_role" ausente. Use -v app_role=... Nenhum CREATE/REVOKE sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: app_role. Script 002 abortado antes de qualquer instrucao SQL.';
  END;
  $missing_var$;
\endif

\echo '=== 002: MIGRATOR CREATE SCHEMA app - inicio ==='
\echo 'Este script deve ser executado autenticado como migrator_role.'

BEGIN;

-- ---------------------------------------------------------------------------
-- Validacao pre-SET ROLE: a sessao atual deve ser exatamente o Migrator.
-- ---------------------------------------------------------------------------

SELECT
  (current_database() IS NOT DISTINCT FROM :'target_database') AS db_ok,
  (session_user IS NOT DISTINCT FROM :'migrator_role')          AS session_is_migrator,
  (current_user IS NOT DISTINCT FROM :'migrator_role')          AS current_is_migrator,
  (session_user = :'app_role' OR current_user = :'app_role')    AS app_role_in_session,
  pg_has_role(current_user, :'owner_role', 'SET')                AS can_set_owner,
  EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app')      AS schema_exists
\gset preA_

\if :preA_db_ok
\else
  \echo 'ERRO [002]: current_database() difere de target_database (:target_database).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: current_database() difere de target_database';
  END;
  $fail$;
\endif
\if :preA_session_is_migrator
\else
  \echo 'ERRO [002]: session_user difere de migrator_role (:migrator_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: session_user difere de migrator_role';
  END;
  $fail$;
\endif
\if :preA_current_is_migrator
\else
  \echo 'ERRO [002]: current_user difere de migrator_role (:migrator_role) antes de SET ROLE.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: current_user difere de migrator_role antes de SET ROLE';
  END;
  $fail$;
\endif
\if :preA_app_role_in_session
  \echo 'ERRO [002]: app_role (:app_role) nao pode participar desta sessao.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role nao pode participar desta sessao';
  END;
  $fail$;
\endif
\if :preA_can_set_owner
\else
  \echo 'ERRO [002]: migrator_role (:migrator_role) nao pode executar SET ROLE para owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role nao pode executar SET ROLE para owner_role';
  END;
  $fail$;
\endif
\if :preA_schema_exists
  \echo 'ERRO [002]: schema "app" ja existe.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: schema app ja existe';
  END;
  $fail$;
\endif

-- Membership DIRETA Migrator -> Owner deve ser exatamente admin_option=false,
-- inherit_option=false, set_option=true (mesma verificacao de 001, repetida
-- aqui pois o SET ROLE a seguir depende diretamente dela). Verifica
-- pg_auth_members diretamente; nao basta o privilegio efetivo ja checado
-- acima via pg_has_role(..., 'SET').
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
  ) AS migrator_owner_no_extra_membership
\gset preB_

\if :preB_migrator_owner_membership_exact
\else
  \echo 'ERRO [002]: migrator_role (:migrator_role) nao possui membership direta em owner_role (:owner_role) com admin_option=false, inherit_option=false, set_option=true.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role nao possui membership exata (admin false, inherit false, set true) em owner_role';
  END;
  $fail$;
\endif
\if :preB_migrator_owner_no_extra_membership
\else
  \echo 'ERRO [002]: existe membership adicional de migrator_role (:migrator_role) em owner_role (:owner_role) com admin_option=true ou inherit_option=true; esperado somente a membership exata (set_option=true).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: existe membership adicional de migrator_role em owner_role com admin_option ou inherit_option true';
  END;
  $fail$;
\endif

\echo 'Precondicoes de 002 (pre SET ROLE) validadas.'

SET ROLE :"owner_role";

SELECT
  (current_user IS NOT DISTINCT FROM :'owner_role')    AS current_is_owner,
  (session_user IS NOT DISTINCT FROM :'migrator_role') AS session_is_migrator
\gset postSetB_

\if :postSetB_current_is_owner
\else
  \echo 'ERRO [002]: falha pos SET ROLE: current_user difere de owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Falha pos SET ROLE: current_user difere de owner_role';
  END;
  $fail$;
\endif
\if :postSetB_session_is_migrator
\else
  \echo 'ERRO [002]: falha pos SET ROLE: session_user difere de migrator_role (:migrator_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Falha pos SET ROLE: session_user difere de migrator_role';
  END;
  $fail$;
\endif

\echo 'SET ROLE owner_role confirmado; session_user permanece migrator_role.'

CREATE SCHEMA app AUTHORIZATION :"owner_role";

-- Hardening imediato e deterministico do schema recem-criado.
REVOKE CREATE, USAGE ON SCHEMA app FROM PUBLIC;
REVOKE CREATE, USAGE ON SCHEMA app FROM :"app_role";
REVOKE CREATE, USAGE ON SCHEMA app FROM :"migrator_role";

-- ---------------------------------------------------------------------------
-- Asserts positivos/negativos pos CREATE SCHEMA + hardening.
-- ---------------------------------------------------------------------------

SELECT
  ((SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = 'app') IS NOT DISTINCT FROM :'owner_role') AS schema_owner_ok,
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app')  AS relation_count,
  ((SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app') = 0) AS relation_count_zero,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app')   AS routine_count,
  ((SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app') = 0) AS routine_count_zero,
  has_schema_privilege(:'owner_role', 'app', 'CREATE') AS owner_schema_create,
  has_schema_privilege(:'owner_role', 'app', 'USAGE')  AS owner_schema_usage,
  has_schema_privilege('public', 'app', 'CREATE')      AS public_schema_create,
  has_schema_privilege('public', 'app', 'USAGE')       AS public_schema_usage,
  has_schema_privilege(:'app_role', 'app', 'CREATE')   AS app_schema_create,
  has_schema_privilege(:'app_role', 'app', 'USAGE')    AS app_schema_usage,
  -- Migrator, em identidade propria, nao pode ter nenhum grant DIRETO de
  -- CREATE/USAGE no schema app. has_schema_privilege() nao serve aqui porque
  -- refletiria tambem privilegio EFETIVO herdado via membership/SET em
  -- owner_role; o teste correto e a existencia (ou nao) de uma entrada de
  -- ACL diretamente concedida a migrator_role no schema app.
  EXISTS (
    SELECT 1
    FROM pg_namespace n
    CROSS JOIN LATERAL aclexplode(n.nspacl) a
    JOIN pg_roles r ON r.oid = a.grantee
    WHERE n.nspname = 'app'
      AND r.rolname = :'migrator_role'
      AND a.privilege_type IN ('CREATE', 'USAGE')
  ) AS migrator_direct_grant
\gset postC_

\if :postC_schema_owner_ok
\else
  \echo 'ERRO [002]: falha pos CREATE SCHEMA: owner do schema app difere de owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Falha pos CREATE SCHEMA: owner do schema app difere de owner_role';
  END;
  $fail$;
\endif
\if :postC_relation_count_zero
\else
  \echo 'ERRO [002]: falha pos CREATE SCHEMA: schema app contem :postC_relation_count relation(s); esperado 0.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Falha pos CREATE SCHEMA: schema app contem relation(s); esperado 0';
  END;
  $fail$;
\endif
\if :postC_routine_count_zero
\else
  \echo 'ERRO [002]: falha pos CREATE SCHEMA: schema app contem :postC_routine_count routine(s); esperado 0.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Falha pos CREATE SCHEMA: schema app contem routine(s); esperado 0';
  END;
  $fail$;
\endif
\if :postC_owner_schema_create
\else
  \echo 'ERRO [002]: falha pos hardening: owner_role (:owner_role) sem CREATE efetivo no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Falha pos hardening: owner_role sem CREATE efetivo no schema app';
  END;
  $fail$;
\endif
\if :postC_owner_schema_usage
\else
  \echo 'ERRO [002]: falha pos hardening: owner_role (:owner_role) sem USAGE efetivo no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Falha pos hardening: owner_role sem USAGE efetivo no schema app';
  END;
  $fail$;
\endif
\if :postC_public_schema_create
  \echo 'ERRO [002]: falha pos hardening: PUBLIC possui CREATE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Falha pos hardening: PUBLIC possui CREATE no schema app';
  END;
  $fail$;
\endif
\if :postC_public_schema_usage
  \echo 'ERRO [002]: falha pos hardening: PUBLIC possui USAGE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Falha pos hardening: PUBLIC possui USAGE no schema app';
  END;
  $fail$;
\endif
\if :postC_app_schema_create
  \echo 'ERRO [002]: falha pos hardening: app_role (:app_role) possui CREATE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Falha pos hardening: app_role possui CREATE no schema app';
  END;
  $fail$;
\endif
\if :postC_app_schema_usage
  \echo 'ERRO [002]: falha pos hardening: app_role (:app_role) possui USAGE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Falha pos hardening: app_role possui USAGE no schema app';
  END;
  $fail$;
\endif
\if :postC_migrator_direct_grant
  \echo 'ERRO [002]: falha pos hardening: migrator_role (:migrator_role) possui grant DIRETO de CREATE/USAGE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Falha pos hardening: migrator_role possui grant DIRETO de CREATE/USAGE no schema app';
  END;
  $fail$;
\endif

\echo 'Schema app criado e hardening aplicado sob identidade owner_role; asserts positivos/negativos validados.'

RESET ROLE;

SELECT
  (session_user IS NOT DISTINCT FROM :'migrator_role') AS session_is_migrator,
  (current_user IS NOT DISTINCT FROM :'migrator_role') AS current_is_migrator
\gset postD_

\if :postD_session_is_migrator
\else
  \echo 'ERRO [002]: falha pos RESET ROLE: session_user difere de migrator_role (:migrator_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Falha pos RESET ROLE: session_user difere de migrator_role';
  END;
  $fail$;
\endif
\if :postD_current_is_migrator
\else
  \echo 'ERRO [002]: falha pos RESET ROLE: current_user difere de migrator_role (:migrator_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Falha pos RESET ROLE: current_user difere de migrator_role';
  END;
  $fail$;
\endif

\echo 'RESET ROLE confirmado: sessao retornou a migrator_role.'

COMMIT;

\echo '=== 002: MIGRATOR CREATE SCHEMA app - concluido. Schema app existe, owned by owner_role, zero objetos, sem CREATE/USAGE para PUBLIC/app_role/migrator_role. ==='
