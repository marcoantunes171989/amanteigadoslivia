-- =============================================================================
-- 002_owner_default_privileges.sql
--
-- Fase: DEFAULT PRIVILEGES para objetos FUTUROS criados por owner_role
-- (NAO e migration de negocio; NAO cria tabela, sequence ou function).
--
-- Escopo real (corrigido nesta revisao):
--   FUNCTIONS/ROUTINES -> ALTER DEFAULT PRIVILEGES FOR ROLE owner_role
--   REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, SEM "IN SCHEMA". No
--   PostgreSQL, default privileges configurados POR SCHEMA (IN SCHEMA x)
--   sao ADICIONADOS aos defaults hard-wired do servidor; eles NUNCA
--   substituem ou removem o grant hard-wired de EXECUTE a PUBLIC. Por
--   isso, um "IN SCHEMA app REVOKE EXECUTE ... FROM PUBLIC" NAO remove o
--   EXECUTE automatico de PUBLIC -- apenas a forma SEM IN SCHEMA (escopo
--   owner_role dentro do database atual, valida para qualquer schema)
--   remove esse hard-wired default. O efeito e portanto GLOBAL a
--   owner_role dentro do database atual, nao limitado ao schema "app".
--   Owner permanece, pela arquitetura corrente, dedicado ao schema "app"
--   como o unico schema de negocio onde cria objetos; este script nao
--   amplia essa responsabilidade, apenas reflete o escopo real do comando
--   do PostgreSQL.
--
--   TABLES/SEQUENCES -> nesta fase NENHUM default ACL e criado. Os
--   defaults normais do PostgreSQL ja NAO concedem privilegios a PUBLIC
--   em tabelas/sequences futuras; criar um default ACL artificial apenas
--   para "revogar" um privilegio que PUBLIC nunca teria seria um ACL sem
--   efeito pratico, alem de mascarar o estado real em pg_default_acl. O
--   script portanto apenas VALIDA a ausencia de default ACL inesperado
--   para TABLES/SEQUENCES (owner/migrator/app), sem conceder nada a
--   PUBLIC, APP ou Migrator. Runtime grants sobre objetos reais
--   pertencem a fase posterior.
--
-- Identidade esperada: Migrator do ambiente, autenticado por LOGIN real
-- (mesma identidade usada em backend/database/bootstrap/002). O script
-- executa SET ROLE owner_role para o ALTER DEFAULT PRIVILEGES e RESET ROLE
-- ao final. Runtime APP nunca participa desta sessao.
--
-- Pre-requisito: bootstrap do schema app (backend/database/bootstrap/001-003)
-- e o artefato de search_path por database (backend/database/config/001)
-- ja devem ter sido executados e auditados neste database antes de rodar
-- este script. search_path = app, pg_catalog deve estar configurado POR
-- DATABASE para owner_role, migrator_role e app_role.
--
-- Variaveis psql obrigatorias (passadas via -v, nenhum valor default aqui):
--   target_database  -> nome do database alvo
--   owner_role       -> role Owner do schema app no ambiente (deve ser
--                       alcancavel via SET ROLE pela sessao atual)
--   migrator_role    -> role Migrator do ambiente (deve ser a sessao atual)
--   app_role         -> role Runtime APP do ambiente
--
-- Efeito: ALTER DEFAULT PRIVILEGES FOR ROLE owner_role (sem IN SCHEMA),
-- revogando de PUBLIC o EXECUTE automatico hard-wired em FUNCTIONS futuras
-- criadas por owner_role neste database. E o UNICO ALTER executado por
-- este script. TABLES e SEQUENCES nao recebem nenhum default ACL nesta
-- fase; o script apenas confirma a ausencia desses defaults antes e depois
-- do ALTER. Nenhum privilegio e concedido a app_role ou migrator_role
-- nesta fase (grants de runtime pertencem a fase posterior). Nenhum objeto
-- (tabela/sequence/function) e criado. search_path, memberships, owners de
-- schema/database e ACL do schema app NAO sao alterados por este script.
--
-- Nota de implementacao: psql NAO interpola variaveis (:var, :'var', :"var")
-- dentro do corpo de blocos dollar-quoted (DO $tag$ ... $tag$). Esse corpo e
-- um literal de string para o comando SQL externo, resolvido inteiramente no
-- servidor. Por isso, toda validacao parametrizada abaixo e feita via SQL
-- top-level (onde psql interpola corretamente) seguido de \gset e \if. Blocos
-- DO sao usados somente para RAISE EXCEPTION com mensagem ESTATICA (sem
-- variavel psql), servindo apenas como mecanismo de aborto de transacao.
--
-- Esta fase (5.0D.6E) apenas cria este artefato em DRAFT; nenhuma execucao
-- real contra qualquer ambiente (DEV, HOMOLOG ou PROD) ocorre nesta fase.
--
-- Requisito minimo: PostgreSQL >= 16. Motivo: mesmas colunas de
-- pg_auth_members (inherit_option, set_option) usadas em config/001 e em
-- bootstrap/002 sao reutilizadas aqui para revalidar a membership
-- Migrator -> Owner.
-- =============================================================================

\set ON_ERROR_STOP on

\if :{?target_database}
\else
  \echo 'ERRO [config/002]: variavel psql "target_database" ausente. Use -v target_database=... Nenhum ALTER DEFAULT PRIVILEGES sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: target_database. Script config/002 abortado antes de qualquer instrucao SQL.';
  END;
  $missing_var$;
\endif
\if :{?owner_role}
\else
  \echo 'ERRO [config/002]: variavel psql "owner_role" ausente. Use -v owner_role=... Nenhum ALTER DEFAULT PRIVILEGES sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: owner_role. Script config/002 abortado antes de qualquer instrucao SQL.';
  END;
  $missing_var$;
\endif
\if :{?migrator_role}
\else
  \echo 'ERRO [config/002]: variavel psql "migrator_role" ausente. Use -v migrator_role=... Nenhum ALTER DEFAULT PRIVILEGES sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: migrator_role. Script config/002 abortado antes de qualquer instrucao SQL.';
  END;
  $missing_var$;
\endif
\if :{?app_role}
\else
  \echo 'ERRO [config/002]: variavel psql "app_role" ausente. Use -v app_role=... Nenhum ALTER DEFAULT PRIVILEGES sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: app_role. Script config/002 abortado antes de qualquer instrucao SQL.';
  END;
  $missing_var$;
\endif

\echo '=== config/002: OWNER DEFAULT PRIVILEGES (FUNCTIONS, escopo global ao database) - inicio ==='
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
  \echo 'ERRO [config/002]: current_database() difere de target_database (:target_database).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: current_database() difere de target_database';
  END;
  $fail$;
\endif
\if :pre0_session_is_migrator
\else
  \echo 'ERRO [config/002]: session_user difere de migrator_role (:migrator_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: session_user difere de migrator_role';
  END;
  $fail$;
\endif
\if :pre0_current_is_migrator
\else
  \echo 'ERRO [config/002]: current_user difere de migrator_role (:migrator_role) antes de SET ROLE.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: current_user difere de migrator_role antes de SET ROLE';
  END;
  $fail$;
\endif
\if :pre0_app_role_in_session
  \echo 'ERRO [config/002]: app_role (:app_role) nao pode participar desta sessao.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role nao pode participar desta sessao';
  END;
  $fail$;
\endif
\if :pre0_can_set_owner
\else
  \echo 'ERRO [config/002]: migrator_role (:migrator_role) nao pode executar SET ROLE para owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role nao pode executar SET ROLE para owner_role';
  END;
  $fail$;
\endif
\if :pre0_schema_app_exists
\else
  \echo 'ERRO [config/002]: schema "app" nao existe. Execute o bootstrap (backend/database/bootstrap/001-003) antes deste script.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: schema app nao existe';
  END;
  $fail$;
\endif

-- Owner do schema app deve ser exatamente owner_role.
SELECT
  ((SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = 'app') IS NOT DISTINCT FROM :'owner_role') AS schema_owner_ok
\gset pre1_

\if :pre1_schema_owner_ok
\else
  \echo 'ERRO [config/002]: owner do schema app difere de owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: owner do schema app difere de owner_role';
  END;
  $fail$;
\endif

-- Membership DIRETA Migrator -> Owner deve ser exatamente admin_option=false,
-- inherit_option=false, set_option=true, sem membership adicional (mesma
-- verificacao de config/001 e bootstrap/002, repetida aqui pois o SET ROLE
-- a seguir depende diretamente dela).
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
  ) AS app_migrator_no_direct_membership
\gset pre2_

\if :pre2_migrator_owner_membership_exact
\else
  \echo 'ERRO [config/002]: migrator_role (:migrator_role) nao possui membership direta em owner_role (:owner_role) com admin_option=false, inherit_option=false, set_option=true.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role nao possui membership exata em owner_role';
  END;
  $fail$;
\endif
\if :pre2_migrator_owner_no_extra_membership
\else
  \echo 'ERRO [config/002]: existe membership adicional de migrator_role (:migrator_role) em owner_role (:owner_role) com admin_option/inherit_option true.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: membership adicional de migrator_role em owner_role';
  END;
  $fail$;
\endif
\if :pre2_app_owner_no_direct_membership
\else
  \echo 'ERRO [config/002]: app_role (:app_role) possui membership DIRETA indevida em owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role possui membership direta indevida em owner_role';
  END;
  $fail$;
\endif
\if :pre2_app_migrator_no_direct_membership
\else
  \echo 'ERRO [config/002]: app_role (:app_role) possui membership DIRETA indevida em migrator_role (:migrator_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role possui membership direta indevida em migrator_role';
  END;
  $fail$;
\endif

-- search_path POR DATABASE das tres roles deve ja estar configurado como
-- "app, pg_catalog" (artefato config/001 ja executado e auditado nesta
-- fase, conforme instrucao). Nao usar SHOW search_path (reflete apenas a
-- sessao atual); a prova correta e via catalogo (pg_db_role_setting).
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
  \echo 'ERRO [config/002]: search_path POR DATABASE de owner_role (:owner_role) para target_database difere de "app, pg_catalog". Execute e audite config/001 antes deste script.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: search_path de owner_role incorreto ou ausente';
  END;
  $fail$;
\endif
\if :pre3_migrator_search_path_ok
\else
  \echo 'ERRO [config/002]: search_path POR DATABASE de migrator_role (:migrator_role) para target_database difere de "app, pg_catalog". Execute e audite config/001 antes deste script.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: search_path de migrator_role incorreto ou ausente';
  END;
  $fail$;
\endif
\if :pre3_app_search_path_ok
\else
  \echo 'ERRO [config/002]: search_path POR DATABASE de app_role (:app_role) para target_database difere de "app, pg_catalog". Execute e audite config/001 antes deste script.'
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
  \echo 'ERRO [config/002]: owner_role (:owner_role) possui CREATE no database; esperado false nesta fase.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: owner_role possui CREATE no database';
  END;
  $fail$;
\endif
\if :pre4_migrator_db_create
  \echo 'ERRO [config/002]: migrator_role (:migrator_role) possui CREATE no database; esperado false nesta fase.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role possui CREATE no database';
  END;
  $fail$;
\endif
\if :pre4_app_db_create
  \echo 'ERRO [config/002]: app_role (:app_role) possui CREATE no database; esperado false nesta fase.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role possui CREATE no database';
  END;
  $fail$;
\endif

-- Privilegios efetivos no schema app: Owner CREATE+USAGE, PUBLIC e Runtime
-- APP sem CREATE/USAGE, Migrator sem grant DIRETO de CREATE/USAGE.
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
  \echo 'ERRO [config/002]: owner_role (:owner_role) sem CREATE efetivo no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: owner_role sem CREATE efetivo no schema app';
  END;
  $fail$;
\endif
\if :pre5_owner_schema_usage
\else
  \echo 'ERRO [config/002]: owner_role (:owner_role) sem USAGE efetivo no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: owner_role sem USAGE efetivo no schema app';
  END;
  $fail$;
\endif
\if :pre5_public_schema_create
  \echo 'ERRO [config/002]: PUBLIC possui CREATE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: PUBLIC possui CREATE no schema app';
  END;
  $fail$;
\endif
\if :pre5_public_schema_usage
  \echo 'ERRO [config/002]: PUBLIC possui USAGE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: PUBLIC possui USAGE no schema app';
  END;
  $fail$;
\endif
\if :pre5_app_schema_create
  \echo 'ERRO [config/002]: app_role (:app_role) possui CREATE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role possui CREATE no schema app';
  END;
  $fail$;
\endif
\if :pre5_app_schema_usage
  \echo 'ERRO [config/002]: app_role (:app_role) possui USAGE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role possui USAGE no schema app';
  END;
  $fail$;
\endif
\if :pre5_migrator_direct_grant
  \echo 'ERRO [config/002]: migrator_role (:migrator_role) possui grant DIRETO de CREATE/USAGE no schema app.'
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
  \echo 'ERRO [config/002]: schema app contem relation(s); esperado 0 nesta fase.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: schema app contem relation(s)';
  END;
  $fail$;
\endif
\if :pre6_routine_count_zero
\else
  \echo 'ERRO [config/002]: schema app contem routine(s); esperado 0 nesta fase.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: schema app contem routine(s)';
  END;
  $fail$;
\endif

-- pg_default_acl das tres roles deve estar zerado ANTES desta fase (garante
-- idempotencia: este script nao roda sobre um estado ja configurado).
SELECT
  ((SELECT count(*)
      FROM pg_default_acl d
      JOIN pg_roles r ON r.oid = d.defaclrole
      WHERE r.rolname IN (:'owner_role', :'migrator_role', :'app_role')) = 0) AS default_priv_zero
\gset pre7_

\if :pre7_default_priv_zero
\else
  \echo 'ERRO [config/002]: ja existem pg_default_acl entry(ies) para owner_role/migrator_role/app_role; esperado 0 antes desta fase.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: pg_default_acl nao esta zerado para owner_role/migrator_role/app_role';
  END;
  $fail$;
\endif

\echo 'Todas as precondicoes de config/002 (pre SET ROLE) foram validadas com sucesso.'

-- ---------------------------------------------------------------------------
-- SET ROLE owner_role: ALTER DEFAULT PRIVILEGES FOR ROLE owner_role exige
-- que a sessao seja capaz de agir como owner_role. session_user permanece
-- migrator_role (auditavel via pg_stat_activity / logs de sessao).
-- ---------------------------------------------------------------------------

SET ROLE :"owner_role";

SELECT
  (current_user IS NOT DISTINCT FROM :'owner_role')    AS current_is_owner,
  (session_user IS NOT DISTINCT FROM :'migrator_role') AS session_is_migrator
\gset postSet_

\if :postSet_current_is_owner
\else
  \echo 'ERRO [config/002]: falha pos SET ROLE: current_user difere de owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Falha pos SET ROLE: current_user difere de owner_role';
  END;
  $fail$;
\endif
\if :postSet_session_is_migrator
\else
  \echo 'ERRO [config/002]: falha pos SET ROLE: session_user difere de migrator_role (:migrator_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Falha pos SET ROLE: session_user difere de migrator_role';
  END;
  $fail$;
\endif

\echo 'SET ROLE owner_role confirmado; session_user permanece migrator_role.'

-- ---------------------------------------------------------------------------
-- ALTERACOES AUTORIZADAS: DEFAULT PRIVILEGES para FUNCTIONS futuras
-- criadas por owner_role, escopo GLOBAL a owner_role dentro do database
-- atual (SEM IN SCHEMA -- ver nota semantica no cabecalho: default
-- privileges por schema se SOMAM aos defaults hard-wired do PostgreSQL e
-- nunca os substituem; somente o escopo global remove o EXECUTE
-- automatico de PUBLIC). TABLES e SEQUENCES NAO sao alteradas nesta fase
-- (nenhum default ACL artificial e criado). Nenhum grant e concedido a
-- app_role ou migrator_role nesta fase. Nenhum objeto e criado.
-- ---------------------------------------------------------------------------

ALTER DEFAULT PRIVILEGES
FOR ROLE :"owner_role"
REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

\echo 'DEFAULT PRIVILEGES configurados para owner_role: PUBLIC sem EXECUTE automatico em FUNCTIONS futuras, escopo global ao database atual. TABLES/SEQUENCES nao alteradas nesta fase.'

-- ---------------------------------------------------------------------------
-- ASSERT POS-ALTER (ainda dentro da transacao, ainda sob SET ROLE
-- owner_role). Qualquer falha aborta a transacao antes do COMMIT.
-- ---------------------------------------------------------------------------

-- Deve existir exatamente 1 entrada pg_default_acl para owner_role,
-- GLOBAL ao database (defaclnamespace = 0, ou seja, sem schema
-- associado -- NAO se junta a pg_namespace pois nao existe um schema com
-- oid 0), defaclobjtype = 'f' (functions/routines). Nenhuma entrada para
-- TABLES ('r') ou SEQUENCES ('S') para owner_role, em nenhum schema.
-- Nenhuma entrada para migrator_role/app_role em lugar nenhum (nenhum
-- grant default concedido a eles nesta fase).
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
  ((SELECT count(*)
      FROM pg_default_acl d
      JOIN pg_roles r ON r.oid = d.defaclrole
      WHERE r.rolname = :'migrator_role') = 0) AS migrator_default_acl_zero,
  ((SELECT count(*)
      FROM pg_default_acl d
      JOIN pg_roles r ON r.oid = d.defaclrole
      WHERE r.rolname = :'app_role') = 0) AS app_default_acl_zero
\gset post1_

\if :post1_owner_total_default_acl_row_count_exact_one
\else
  \echo 'ERRO [config/002]: assert pos-ALTER falhou: owner_role (:owner_role) nao possui exatamente 1 entrada pg_default_acl (esperado: FUNCTIONS global ao database).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: owner_role sem exatamente 1 entrada pg_default_acl';
  END;
  $fail$;
\endif
\if :post1_owner_global_functions_default_acl_exists
\else
  \echo 'ERRO [config/002]: assert pos-ALTER falhou: nao foi encontrada entrada pg_default_acl GLOBAL (defaclnamespace = 0) de FUNCTIONS para owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: entrada pg_default_acl global de FUNCTIONS ausente para owner_role';
  END;
  $fail$;
\endif
\if :post1_owner_no_tables_or_sequences_default_acl
\else
  \echo 'ERRO [config/002]: assert pos-ALTER falhou: owner_role (:owner_role) possui entrada pg_default_acl de TABLES ou SEQUENCES; esperado nenhuma nesta fase.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: owner_role com pg_default_acl inesperado de TABLES/SEQUENCES';
  END;
  $fail$;
\endif
\if :post1_migrator_default_acl_zero
\else
  \echo 'ERRO [config/002]: assert pos-ALTER falhou: migrator_role (:migrator_role) passou a possuir entrada em pg_default_acl; esperado 0.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: migrator_role com pg_default_acl inesperado';
  END;
  $fail$;
\endif
\if :post1_app_default_acl_zero
\else
  \echo 'ERRO [config/002]: assert pos-ALTER falhou: app_role (:app_role) passou a possuir entrada em pg_default_acl; esperado 0.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: app_role com pg_default_acl inesperado';
  END;
  $fail$;
\endif

-- Revalidacao POS-ALTER de pg_auth_members (prova direta de membership,
-- independente dos asserts de pg_default_acl acima): a membership DIRETA
-- Migrator -> Owner deve permanecer EXATAMENTE admin_option=false,
-- inherit_option=false, set_option=true, sem membership adicional
-- incompativel; Runtime APP deve continuar com ZERO membership DIRETA em
-- owner_role e ZERO membership DIRETA em migrator_role. Mesma verificacao
-- da PRECONDICAO (pre-SET ROLE, acima), repetida aqui pos-ALTER pois
-- ALTER DEFAULT PRIVILEGES nao deve, sob nenhuma circunstancia, alterar
-- memberships.
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
  ) AS app_migrator_no_direct_membership
\gset post2_

\if :post2_migrator_owner_membership_exact
\else
  \echo 'ERRO [config/002]: assert pos-ALTER falhou: migrator_role (:migrator_role) nao possui membership direta em owner_role (:owner_role) com admin_option=false, inherit_option=false, set_option=true.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: migrator_role nao possui membership exata em owner_role';
  END;
  $fail$;
\endif
\if :post2_migrator_owner_no_extra_membership
\else
  \echo 'ERRO [config/002]: assert pos-ALTER falhou: existe membership adicional de migrator_role (:migrator_role) em owner_role (:owner_role) com admin_option/inherit_option true.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: membership adicional de migrator_role em owner_role';
  END;
  $fail$;
\endif
\if :post2_app_owner_no_direct_membership
\else
  \echo 'ERRO [config/002]: assert pos-ALTER falhou: app_role (:app_role) possui membership DIRETA indevida em owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: app_role possui membership direta indevida em owner_role';
  END;
  $fail$;
\endif
\if :post2_app_migrator_no_direct_membership
\else
  \echo 'ERRO [config/002]: assert pos-ALTER falhou: app_role (:app_role) possui membership DIRETA indevida em migrator_role (:migrator_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: app_role possui membership direta indevida em migrator_role';
  END;
  $fail$;
\endif

\echo 'Revalidacao pos-ALTER de pg_auth_members concluida: membership Migrator -> Owner permanece exata; Runtime APP permanece sem membership direta em Owner ou Migrator.'

-- A entrada global (defaclnamespace = 0) de default ACL de owner_role
-- (FUNCTIONS) nao pode conceder qualquer privilegio a PUBLIC (grantee 0 =
-- pseudo-role PUBLIC em aclexplode), a app_role ou a migrator_role.
SELECT
  NOT EXISTS (
    SELECT 1
    FROM pg_default_acl d
    JOIN pg_roles r ON r.oid = d.defaclrole
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE r.rolname = :'owner_role' AND d.defaclnamespace = 0
      AND a.grantee = 0
  ) AS no_public_grant_in_default_acl,
  NOT EXISTS (
    SELECT 1
    FROM pg_default_acl d
    JOIN pg_roles r ON r.oid = d.defaclrole
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    JOIN pg_roles gr ON gr.oid = a.grantee
    WHERE r.rolname = :'owner_role' AND d.defaclnamespace = 0
      AND gr.rolname = :'app_role'
  ) AS no_app_grant_in_default_acl,
  NOT EXISTS (
    SELECT 1
    FROM pg_default_acl d
    JOIN pg_roles r ON r.oid = d.defaclrole
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    JOIN pg_roles gr ON gr.oid = a.grantee
    WHERE r.rolname = :'owner_role' AND d.defaclnamespace = 0
      AND gr.rolname = :'migrator_role'
  ) AS no_migrator_grant_in_default_acl
\gset post3_

\if :post3_no_public_grant_in_default_acl
\else
  \echo 'ERRO [config/002]: assert pos-ALTER falhou: PUBLIC possui privilegio de negocio no default ACL global de FUNCTIONS de owner_role.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: PUBLIC com privilegio em default ACL global de FUNCTIONS';
  END;
  $fail$;
\endif
\if :post3_no_app_grant_in_default_acl
\else
  \echo 'ERRO [config/002]: assert pos-ALTER falhou: app_role (:app_role) possui privilegio no default ACL global de FUNCTIONS de owner_role; nenhum grant a app_role e esperado nesta fase.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: app_role com privilegio em default ACL global de FUNCTIONS';
  END;
  $fail$;
\endif
\if :post3_no_migrator_grant_in_default_acl
\else
  \echo 'ERRO [config/002]: assert pos-ALTER falhou: migrator_role (:migrator_role) possui privilegio no default ACL global de FUNCTIONS de owner_role; nenhum grant a migrator_role e esperado nesta fase.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: migrator_role com privilegio em default ACL global de FUNCTIONS';
  END;
  $fail$;
\endif

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
\gset post4_

\if :post4_owner_search_path_still_ok
\else
  \echo 'ERRO [config/002]: assert pos-ALTER falhou: search_path POR DATABASE de owner_role (:owner_role) mudou; esperado permanecer "app, pg_catalog".'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: search_path de owner_role mudou';
  END;
  $fail$;
\endif
\if :post4_migrator_search_path_still_ok
\else
  \echo 'ERRO [config/002]: assert pos-ALTER falhou: search_path POR DATABASE de migrator_role (:migrator_role) mudou; esperado permanecer "app, pg_catalog".'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: search_path de migrator_role mudou';
  END;
  $fail$;
\endif
\if :post4_app_search_path_still_ok
\else
  \echo 'ERRO [config/002]: assert pos-ALTER falhou: search_path POR DATABASE de app_role (:app_role) mudou; esperado permanecer "app, pg_catalog".'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: search_path de app_role mudou';
  END;
  $fail$;
\endif

-- Reconfirma que nenhum efeito colateral ocorreu: CREATE no database
-- continua false, ACL do schema app inalterada, schema app continua vazio.
SELECT
  has_database_privilege(:'owner_role', current_database(), 'CREATE')    AS owner_db_create,
  has_database_privilege(:'migrator_role', current_database(), 'CREATE') AS migrator_db_create,
  has_database_privilege(:'app_role', current_database(), 'CREATE')      AS app_db_create,
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
  ((SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app') = 0) AS relation_count_zero,
  ((SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app') = 0)  AS routine_count_zero
\gset post5_

\if :post5_owner_db_create
  \echo 'ERRO [config/002]: assert pos-ALTER falhou: owner_role (:owner_role) passou a possuir CREATE no database.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: owner_role com CREATE no database apos ALTER DEFAULT PRIVILEGES';
  END;
  $fail$;
\endif
\if :post5_migrator_db_create
  \echo 'ERRO [config/002]: assert pos-ALTER falhou: migrator_role (:migrator_role) passou a possuir CREATE no database.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: migrator_role com CREATE no database apos ALTER DEFAULT PRIVILEGES';
  END;
  $fail$;
\endif
\if :post5_app_db_create
  \echo 'ERRO [config/002]: assert pos-ALTER falhou: app_role (:app_role) passou a possuir CREATE no database.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: app_role com CREATE no database apos ALTER DEFAULT PRIVILEGES';
  END;
  $fail$;
\endif
\if :post5_owner_schema_create
\else
  \echo 'ERRO [config/002]: assert pos-ALTER falhou: owner_role (:owner_role) perdeu CREATE efetivo no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: owner_role sem CREATE efetivo no schema app';
  END;
  $fail$;
\endif
\if :post5_owner_schema_usage
\else
  \echo 'ERRO [config/002]: assert pos-ALTER falhou: owner_role (:owner_role) perdeu USAGE efetivo no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: owner_role sem USAGE efetivo no schema app';
  END;
  $fail$;
\endif
\if :post5_public_schema_create
  \echo 'ERRO [config/002]: assert pos-ALTER falhou: PUBLIC passou a possuir CREATE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: PUBLIC com CREATE no schema app';
  END;
  $fail$;
\endif
\if :post5_public_schema_usage
  \echo 'ERRO [config/002]: assert pos-ALTER falhou: PUBLIC passou a possuir USAGE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: PUBLIC com USAGE no schema app';
  END;
  $fail$;
\endif
\if :post5_app_schema_create
  \echo 'ERRO [config/002]: assert pos-ALTER falhou: app_role (:app_role) passou a possuir CREATE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: app_role com CREATE no schema app';
  END;
  $fail$;
\endif
\if :post5_app_schema_usage
  \echo 'ERRO [config/002]: assert pos-ALTER falhou: app_role (:app_role) passou a possuir USAGE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: app_role com USAGE no schema app';
  END;
  $fail$;
\endif
\if :post5_migrator_direct_grant
  \echo 'ERRO [config/002]: assert pos-ALTER falhou: migrator_role (:migrator_role) passou a possuir grant DIRETO de CREATE/USAGE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: migrator_role com grant direto no schema app';
  END;
  $fail$;
\endif
\if :post5_relation_count_zero
\else
  \echo 'ERRO [config/002]: assert pos-ALTER falhou: schema app passou a conter relation(s).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: schema app com relation(s) apos ALTER DEFAULT PRIVILEGES';
  END;
  $fail$;
\endif
\if :post5_routine_count_zero
\else
  \echo 'ERRO [config/002]: assert pos-ALTER falhou: schema app passou a conter routine(s).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: schema app com routine(s) apos ALTER DEFAULT PRIVILEGES';
  END;
  $fail$;
\endif

\echo 'Assert pos-ALTER de config/002 validado: DEFAULT PRIVILEGES de owner_role cobrem exatamente FUNCTIONS (escopo global ao database), sem grant a PUBLIC/app_role/migrator_role, sem default ACL de TABLES/SEQUENCES, sem efeito colateral.'

RESET ROLE;

SELECT
  (session_user IS NOT DISTINCT FROM :'migrator_role') AS session_is_migrator,
  (current_user IS NOT DISTINCT FROM :'migrator_role') AS current_is_migrator
\gset postReset_

\if :postReset_session_is_migrator
\else
  \echo 'ERRO [config/002]: falha pos RESET ROLE: session_user difere de migrator_role (:migrator_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Falha pos RESET ROLE: session_user difere de migrator_role';
  END;
  $fail$;
\endif
\if :postReset_current_is_migrator
\else
  \echo 'ERRO [config/002]: falha pos RESET ROLE: current_user difere de migrator_role (:migrator_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Falha pos RESET ROLE: current_user difere de migrator_role';
  END;
  $fail$;
\endif

\echo 'RESET ROLE confirmado: sessao retornou a migrator_role.'

COMMIT;

\echo '=== config/002: OWNER DEFAULT PRIVILEGES - concluido. PUBLIC sem EXECUTE automatico futuro em FUNCTIONS de owner_role (escopo global ao database); TABLES/SEQUENCES nao alteradas; nenhum grant a app_role ou migrator_role nesta fase. ==='
