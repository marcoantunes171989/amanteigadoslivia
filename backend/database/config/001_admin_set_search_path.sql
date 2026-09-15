-- =============================================================================
-- 001_admin_set_search_path.sql
--
-- Fase: configuracao administrativa de search_path por role, POR DATABASE
-- (NAO e migration de negocio; NAO e parte do bootstrap de criacao do
-- schema "app" em backend/database/bootstrap/).
-- Identidade esperada: administrador do ambiente (mesma identidade
-- administrativa usada em 001/003 de backend/database/bootstrap/; precisa
-- de privilegio para ALTER ROLE ... IN DATABASE sobre as tres roles alvo).
-- Runtime APP nunca executa este script.
--
-- Pre-requisito: o bootstrap administrativo do schema "app"
-- (backend/database/bootstrap/001-003) deve ja ter sido executado e
-- validado com sucesso neste database antes de rodar este script.
--
-- Variaveis psql obrigatorias (passadas via -v, nenhum valor default aqui):
--   target_database  -> nome do database alvo (ex.: -v target_database=amanteigados_dev)
--   owner_role       -> role Owner do schema app no ambiente
--   migrator_role    -> role Migrator do ambiente
--   app_role         -> role Runtime APP do ambiente
--
-- Efeito: configura, POR DATABASE (ALTER ROLE ... IN DATABASE ...), o
-- search_path = app, pg_catalog para owner_role, migrator_role e app_role
-- no database :target_database. Nenhuma configuracao GLOBAL de role
-- (ALTER ROLE ... SET, sem IN DATABASE) e usada, para nao alterar o
-- comportamento dessas roles em outros databases do cluster. Nenhum outro
-- objeto, privilegio, membership ou schema e alterado aqui.
--
-- Nota de implementacao: psql NAO interpola variaveis (:var, :'var', :"var")
-- dentro do corpo de blocos dollar-quoted (DO $tag$ ... $tag$). Esse corpo e
-- um literal de string para o comando SQL externo, resolvido inteiramente no
-- servidor. Por isso, toda validacao parametrizada abaixo e feita via SQL
-- top-level (onde psql interpola corretamente) seguido de \gset e \if. Blocos
-- DO sao usados somente para RAISE EXCEPTION com mensagem ESTATICA (sem
-- variavel psql), servindo apenas como mecanismo de aborto de transacao.
--
-- Esta fase (5.0D.6D) apenas cria este artefato em DRAFT; nenhuma execucao
-- real contra qualquer ambiente (DEV, HOMOLOG ou PROD) ocorre nesta fase.
--
-- Requisito minimo: PostgreSQL >= 16. Motivo: os asserts pos-ALTER abaixo
-- consultam diretamente pg_auth_members.inherit_option e
-- pg_auth_members.set_option, colunas introduzidas no PostgreSQL 16.
-- =============================================================================

\set ON_ERROR_STOP on

\if :{?target_database}
\else
  \echo 'ERRO [config/001]: variavel psql "target_database" ausente. Use -v target_database=... Nenhum ALTER ROLE sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: target_database. Script config/001 abortado antes de qualquer instrucao SQL.';
  END;
  $missing_var$;
\endif
\if :{?owner_role}
\else
  \echo 'ERRO [config/001]: variavel psql "owner_role" ausente. Use -v owner_role=... Nenhum ALTER ROLE sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: owner_role. Script config/001 abortado antes de qualquer instrucao SQL.';
  END;
  $missing_var$;
\endif
\if :{?migrator_role}
\else
  \echo 'ERRO [config/001]: variavel psql "migrator_role" ausente. Use -v migrator_role=... Nenhum ALTER ROLE sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: migrator_role. Script config/001 abortado antes de qualquer instrucao SQL.';
  END;
  $missing_var$;
\endif
\if :{?app_role}
\else
  \echo 'ERRO [config/001]: variavel psql "app_role" ausente. Use -v app_role=... Nenhum ALTER ROLE sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: app_role. Script config/001 abortado antes de qualquer instrucao SQL.';
  END;
  $missing_var$;
\endif

\echo '=== config/001: ADMIN SET SEARCH_PATH - inicio ==='

BEGIN;

-- ---------------------------------------------------------------------------
-- PRECONDICOES (SQL top-level + \gset + \if). Cada checagem aborta a
-- transacao via DO estatico caso falhe; a mensagem detalhada (com os valores
-- reais das variaveis psql) e emitida antes, via \echo. Nenhum ALTER ROLE e
-- executado antes de todas as precondicoes passarem.
-- ---------------------------------------------------------------------------

SELECT (current_database() IS NOT DISTINCT FROM :'target_database') AS db_ok
\gset pre1_

\if :pre1_db_ok
\else
  \echo 'ERRO [config/001]: current_database() difere de target_database (:target_database).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: current_database() difere de target_database';
  END;
  $fail$;
\endif

SELECT
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'owner_role')    AS owner_exists,
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'migrator_role') AS migrator_exists,
  EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_role')      AS app_exists
\gset pre2_

\if :pre2_owner_exists
\else
  \echo 'ERRO [config/001]: owner_role (:owner_role) nao existe.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: owner_role nao existe';
  END;
  $fail$;
\endif
\if :pre2_migrator_exists
\else
  \echo 'ERRO [config/001]: migrator_role (:migrator_role) nao existe.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role nao existe';
  END;
  $fail$;
\endif
\if :pre2_app_exists
\else
  \echo 'ERRO [config/001]: app_role (:app_role) nao existe.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role nao existe';
  END;
  $fail$;
\endif

SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app') AS schema_app_exists
\gset pre3_

\if :pre3_schema_app_exists
\else
  \echo 'ERRO [config/001]: schema "app" nao existe. Execute o bootstrap (backend/database/bootstrap/001-003) antes deste script.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: schema app nao existe';
  END;
  $fail$;
\endif

SELECT
  ((SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = 'app') IS NOT DISTINCT FROM :'owner_role') AS schema_owner_ok
\gset pre4_

\if :pre4_schema_owner_ok
\else
  \echo 'ERRO [config/001]: owner do schema app difere de owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: owner do schema app difere de owner_role';
  END;
  $fail$;
\endif

-- Privilegios de database: CONNECT=true e CREATE=false para as tres roles.
SELECT
  has_database_privilege(:'owner_role', current_database(), 'CONNECT')    AS owner_connect,
  has_database_privilege(:'owner_role', current_database(), 'CREATE')     AS owner_create,
  has_database_privilege(:'migrator_role', current_database(), 'CONNECT') AS migrator_connect,
  has_database_privilege(:'migrator_role', current_database(), 'CREATE')  AS migrator_create,
  has_database_privilege(:'app_role', current_database(), 'CONNECT')      AS app_connect,
  has_database_privilege(:'app_role', current_database(), 'CREATE')       AS app_create
\gset pre5_

\if :pre5_owner_connect
\else
  \echo 'ERRO [config/001]: owner_role (:owner_role) sem CONNECT no database.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: owner_role sem CONNECT no database';
  END;
  $fail$;
\endif
\if :pre5_owner_create
  \echo 'ERRO [config/001]: owner_role (:owner_role) possui CREATE no database; esperado false nesta fase.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: owner_role possui CREATE no database';
  END;
  $fail$;
\endif
\if :pre5_migrator_connect
\else
  \echo 'ERRO [config/001]: migrator_role (:migrator_role) sem CONNECT no database.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role sem CONNECT no database';
  END;
  $fail$;
\endif
\if :pre5_migrator_create
  \echo 'ERRO [config/001]: migrator_role (:migrator_role) possui CREATE no database.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role possui CREATE no database';
  END;
  $fail$;
\endif
\if :pre5_app_connect
\else
  \echo 'ERRO [config/001]: app_role (:app_role) sem CONNECT no database.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role sem CONNECT no database';
  END;
  $fail$;
\endif
\if :pre5_app_create
  \echo 'ERRO [config/001]: app_role (:app_role) possui CREATE no database.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role possui CREATE no database';
  END;
  $fail$;
\endif

-- Privilegios efetivos no schema app: Owner CREATE+USAGE, PUBLIC e Runtime
-- APP sem CREATE/USAGE. Migrator sem grant DIRETO de CREATE/USAGE (privilegio
-- efetivo herdado via SET ROLE em owner_role nao conta como grant direto).
SELECT
  has_schema_privilege(:'owner_role', 'app', 'CREATE') AS owner_schema_create,
  has_schema_privilege(:'owner_role', 'app', 'USAGE')  AS owner_schema_usage,
  has_schema_privilege('public', 'app', 'CREATE')      AS public_create,
  has_schema_privilege('public', 'app', 'USAGE')       AS public_usage,
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
\gset pre6_

\if :pre6_owner_schema_create
\else
  \echo 'ERRO [config/001]: owner_role (:owner_role) sem CREATE efetivo no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: owner_role sem CREATE efetivo no schema app';
  END;
  $fail$;
\endif
\if :pre6_owner_schema_usage
\else
  \echo 'ERRO [config/001]: owner_role (:owner_role) sem USAGE efetivo no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: owner_role sem USAGE efetivo no schema app';
  END;
  $fail$;
\endif
\if :pre6_public_create
  \echo 'ERRO [config/001]: PUBLIC possui CREATE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: PUBLIC possui CREATE no schema app';
  END;
  $fail$;
\endif
\if :pre6_public_usage
  \echo 'ERRO [config/001]: PUBLIC possui USAGE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: PUBLIC possui USAGE no schema app';
  END;
  $fail$;
\endif
\if :pre6_app_schema_create
  \echo 'ERRO [config/001]: app_role (:app_role) possui CREATE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role possui CREATE no schema app';
  END;
  $fail$;
\endif
\if :pre6_app_schema_usage
  \echo 'ERRO [config/001]: app_role (:app_role) possui USAGE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role possui USAGE no schema app';
  END;
  $fail$;
\endif
\if :pre6_migrator_direct_grant
  \echo 'ERRO [config/001]: migrator_role (:migrator_role) possui grant DIRETO de CREATE/USAGE no schema app (identidade propria).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role possui grant DIRETO de CREATE/USAGE no schema app';
  END;
  $fail$;
\endif

-- Membership Migrator -> Owner deve ser exatamente admin_option=false,
-- inherit_option=false, set_option=true, sem membership adicional.
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
  pg_has_role(:'migrator_role', :'owner_role', 'SET') AS migrator_set_owner,
  pg_has_role(:'app_role', :'owner_role', 'SET')       AS app_set_owner,
  pg_has_role(:'app_role', :'migrator_role', 'SET')    AS app_set_migrator,
  EXISTS (
    SELECT 1
    FROM pg_auth_members m
    JOIN pg_roles r   ON r.oid = m.roleid
    JOIN pg_roles mem ON mem.oid = m.member
    WHERE r.rolname = :'owner_role'
      AND mem.rolname = :'app_role'
  ) AS app_owner_direct_membership,
  EXISTS (
    SELECT 1
    FROM pg_auth_members m
    JOIN pg_roles r   ON r.oid = m.roleid
    JOIN pg_roles mem ON mem.oid = m.member
    WHERE r.rolname = :'migrator_role'
      AND mem.rolname = :'app_role'
  ) AS app_migrator_direct_membership
\gset pre7_

\if :pre7_migrator_owner_membership_exact
\else
  \echo 'ERRO [config/001]: migrator_role (:migrator_role) nao possui membership direta em owner_role (:owner_role) com admin_option=false, inherit_option=false, set_option=true.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role nao possui membership exata em owner_role';
  END;
  $fail$;
\endif
\if :pre7_migrator_owner_no_extra_membership
\else
  \echo 'ERRO [config/001]: existe membership adicional de migrator_role (:migrator_role) em owner_role (:owner_role) com admin_option/inherit_option true.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: membership adicional de migrator_role em owner_role';
  END;
  $fail$;
\endif
\if :pre7_migrator_set_owner
\else
  \echo 'ERRO [config/001]: migrator_role (:migrator_role) sem capacidade de SET ROLE para owner_role.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role sem capacidade de SET ROLE para owner_role';
  END;
  $fail$;
\endif
\if :pre7_app_set_owner
  \echo 'ERRO [config/001]: app_role (:app_role) pode executar SET ROLE para owner_role.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role pode executar SET ROLE para owner_role';
  END;
  $fail$;
\endif
\if :pre7_app_set_migrator
  \echo 'ERRO [config/001]: app_role (:app_role) pode executar SET ROLE para migrator_role.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role pode executar SET ROLE para migrator_role';
  END;
  $fail$;
\endif
\if :pre7_app_owner_direct_membership
  \echo 'ERRO [config/001]: app_role (:app_role) possui membership DIRETA indevida em owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role possui membership direta indevida em owner_role';
  END;
  $fail$;
\endif
\if :pre7_app_migrator_direct_membership
  \echo 'ERRO [config/001]: app_role (:app_role) possui membership DIRETA indevida em migrator_role (:migrator_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role possui membership direta indevida em migrator_role';
  END;
  $fail$;
\endif

-- Estado atual de configuracao de role deve estar zerado antes deste script:
-- rolconfig vazio/null, zero entradas em pg_db_role_setting (qualquer
-- database, incluindo global), zero default privileges.
SELECT
  EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname IN (:'owner_role', :'migrator_role', :'app_role')
      AND rolconfig IS NOT NULL
  ) AS custom_role_settings,
  EXISTS (
    SELECT 1
    FROM pg_db_role_setting s
    JOIN pg_roles r ON r.oid = s.setrole
    WHERE r.rolname IN (:'owner_role', :'migrator_role', :'app_role')
  ) AS db_role_setting_exists,
  ((SELECT count(*)
      FROM pg_default_acl d
      JOIN pg_roles r ON r.oid = d.defaclrole
      WHERE r.rolname IN (:'owner_role', :'migrator_role', :'app_role')) = 0) AS default_priv_zero
\gset pre8_

\if :pre8_custom_role_settings
  \echo 'ERRO [config/001]: ja existe role setting customizado (rolconfig) em owner_role/migrator_role/app_role; esperado NULL antes deste script.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: rolconfig ja customizado em owner_role/migrator_role/app_role';
  END;
  $fail$;
\endif
\if :pre8_db_role_setting_exists
  \echo 'ERRO [config/001]: ja existe entrada em pg_db_role_setting para owner_role/migrator_role/app_role; esperado zero antes deste script.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: pg_db_role_setting ja possui entrada para owner_role/migrator_role/app_role';
  END;
  $fail$;
\endif
\if :pre8_default_priv_zero
\else
  \echo 'ERRO [config/001]: existem pg_default_acl entry(ies) para owner_role/migrator_role/app_role; esperado 0.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: pg_default_acl nao esta zerado para owner_role/migrator_role/app_role';
  END;
  $fail$;
\endif

-- schema app deve permanecer vazio (zero relations, zero routines) antes
-- deste script.
SELECT
  ((SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app') = 0) AS relation_count_zero,
  ((SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app') = 0)  AS routine_count_zero
\gset pre9_

\if :pre9_relation_count_zero
\else
  \echo 'ERRO [config/001]: schema app contem relation(s); esperado 0 nesta fase.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: schema app contem relation(s)';
  END;
  $fail$;
\endif
\if :pre9_routine_count_zero
\else
  \echo 'ERRO [config/001]: schema app contem routine(s); esperado 0 nesta fase.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: schema app contem routine(s)';
  END;
  $fail$;
\endif

\echo 'Todas as precondicoes de config/001 foram validadas com sucesso.'

-- ---------------------------------------------------------------------------
-- ALTERACOES AUTORIZADAS: search_path POR DATABASE (ALTER ROLE ... IN
-- DATABASE ...) para owner_role, migrator_role e app_role. Nenhuma outra
-- alteracao (atributos, memberships, GRANT/REVOKE, DDL, DML) e executada.
-- ---------------------------------------------------------------------------

ALTER ROLE :"owner_role"
IN DATABASE :"target_database"
SET search_path TO app, pg_catalog;

ALTER ROLE :"migrator_role"
IN DATABASE :"target_database"
SET search_path TO app, pg_catalog;

ALTER ROLE :"app_role"
IN DATABASE :"target_database"
SET search_path TO app, pg_catalog;

\echo 'search_path = app, pg_catalog configurado POR DATABASE para owner_role, migrator_role e app_role.'

-- ---------------------------------------------------------------------------
-- ASSERT POS-ALTER (ainda dentro da transacao). Qualquer falha aborta a
-- transacao antes do COMMIT. Nao usar SHOW search_path como prova aqui:
-- ALTER ROLE ... IN DATABASE so afeta NOVAS sessoes da role, nao a conexao
-- administrativa atual. A validacao correta nesta fase e via catalogo
-- (pg_db_role_setting / pg_roles.rolconfig), nunca via SHOW na sessao
-- corrente. O teste de novas conexoes e um POSTCHECK separado, fora do
-- escopo deste script.
-- ---------------------------------------------------------------------------

-- Nota: cada verificacao abaixo e computada como booleano DENTRO do SQL
-- top-level (via \gset), nunca como expressao dentro de \if. O comando
-- \if do psql aceita somente um literal booleano (true/false/1/0/yes/no/
-- on/off), nao uma expressao SQL como "coluna = 1"; por isso toda
-- comparacao (contagem, tamanho de array, igualdade) e resolvida no
-- proprio SELECT, nunca depois do \gset.
SELECT
  ((SELECT count(*)
      FROM pg_db_role_setting s
      JOIN pg_roles r ON r.oid = s.setrole
      JOIN pg_database d ON d.oid = s.setdatabase
      WHERE r.rolname = :'owner_role' AND d.datname = :'target_database') = 1) AS owner_row_count_exact_one,
  ((SELECT array_length(s.setconfig, 1)
      FROM pg_db_role_setting s
      JOIN pg_roles r ON r.oid = s.setrole
      JOIN pg_database d ON d.oid = s.setdatabase
      WHERE r.rolname = :'owner_role' AND d.datname = :'target_database') = 1) AS owner_setconfig_len_exact_one,
  ((SELECT string_to_array(regexp_replace(split_part(elem, '=', 2), '\s+', '', 'g'), ',')
      FROM pg_db_role_setting s
      JOIN pg_roles r ON r.oid = s.setrole
      JOIN pg_database d ON d.oid = s.setdatabase
      CROSS JOIN LATERAL unnest(s.setconfig) AS elem
      WHERE r.rolname = :'owner_role' AND d.datname = :'target_database'
        AND split_part(elem, '=', 1) = 'search_path') = ARRAY['app', 'pg_catalog']) AS owner_search_path_value_ok,
  ((SELECT count(*)
      FROM pg_db_role_setting s
      JOIN pg_roles r ON r.oid = s.setrole
      WHERE r.rolname = :'owner_role'
        AND s.setdatabase IS DISTINCT FROM (SELECT oid FROM pg_database WHERE datname = :'target_database')) = 0) AS owner_no_other_db_rows
\gset post_

\if :post_owner_row_count_exact_one
\else
  \echo 'ERRO [config/001]: assert pos-ALTER falhou: owner_role (:owner_role) nao possui exatamente uma entrada em pg_db_role_setting para target_database.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: owner_role sem exatamente uma entrada em pg_db_role_setting';
  END;
  $fail$;
\endif
\if :post_owner_setconfig_len_exact_one
\else
  \echo 'ERRO [config/001]: assert pos-ALTER falhou: owner_role (:owner_role) possui setconfig com tamanho diferente de 1 (setting inesperado presente).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: owner_role com setconfig de tamanho inesperado';
  END;
  $fail$;
\endif
\if :post_owner_search_path_value_ok
\else
  \echo 'ERRO [config/001]: assert pos-ALTER falhou: search_path de owner_role (:owner_role) para target_database difere de "app, pg_catalog".'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: search_path de owner_role incorreto';
  END;
  $fail$;
\endif
\if :post_owner_no_other_db_rows
\else
  \echo 'ERRO [config/001]: assert pos-ALTER falhou: owner_role (:owner_role) possui pg_db_role_setting para outro database ou configuracao global.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: owner_role com pg_db_role_setting fora de target_database';
  END;
  $fail$;
\endif

SELECT
  ((SELECT count(*)
      FROM pg_db_role_setting s
      JOIN pg_roles r ON r.oid = s.setrole
      JOIN pg_database d ON d.oid = s.setdatabase
      WHERE r.rolname = :'migrator_role' AND d.datname = :'target_database') = 1) AS migrator_row_count_exact_one,
  ((SELECT array_length(s.setconfig, 1)
      FROM pg_db_role_setting s
      JOIN pg_roles r ON r.oid = s.setrole
      JOIN pg_database d ON d.oid = s.setdatabase
      WHERE r.rolname = :'migrator_role' AND d.datname = :'target_database') = 1) AS migrator_setconfig_len_exact_one,
  ((SELECT string_to_array(regexp_replace(split_part(elem, '=', 2), '\s+', '', 'g'), ',')
      FROM pg_db_role_setting s
      JOIN pg_roles r ON r.oid = s.setrole
      JOIN pg_database d ON d.oid = s.setdatabase
      CROSS JOIN LATERAL unnest(s.setconfig) AS elem
      WHERE r.rolname = :'migrator_role' AND d.datname = :'target_database'
        AND split_part(elem, '=', 1) = 'search_path') = ARRAY['app', 'pg_catalog']) AS migrator_search_path_value_ok,
  ((SELECT count(*)
      FROM pg_db_role_setting s
      JOIN pg_roles r ON r.oid = s.setrole
      WHERE r.rolname = :'migrator_role'
        AND s.setdatabase IS DISTINCT FROM (SELECT oid FROM pg_database WHERE datname = :'target_database')) = 0) AS migrator_no_other_db_rows
\gset post_

\if :post_migrator_row_count_exact_one
\else
  \echo 'ERRO [config/001]: assert pos-ALTER falhou: migrator_role (:migrator_role) nao possui exatamente uma entrada em pg_db_role_setting para target_database.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: migrator_role sem exatamente uma entrada em pg_db_role_setting';
  END;
  $fail$;
\endif
\if :post_migrator_setconfig_len_exact_one
\else
  \echo 'ERRO [config/001]: assert pos-ALTER falhou: migrator_role (:migrator_role) possui setconfig com tamanho diferente de 1.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: migrator_role com setconfig de tamanho inesperado';
  END;
  $fail$;
\endif
\if :post_migrator_search_path_value_ok
\else
  \echo 'ERRO [config/001]: assert pos-ALTER falhou: search_path de migrator_role (:migrator_role) para target_database difere de "app, pg_catalog".'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: search_path de migrator_role incorreto';
  END;
  $fail$;
\endif
\if :post_migrator_no_other_db_rows
\else
  \echo 'ERRO [config/001]: assert pos-ALTER falhou: migrator_role (:migrator_role) possui pg_db_role_setting para outro database ou configuracao global.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: migrator_role com pg_db_role_setting fora de target_database';
  END;
  $fail$;
\endif

SELECT
  ((SELECT count(*)
      FROM pg_db_role_setting s
      JOIN pg_roles r ON r.oid = s.setrole
      JOIN pg_database d ON d.oid = s.setdatabase
      WHERE r.rolname = :'app_role' AND d.datname = :'target_database') = 1) AS app_row_count_exact_one,
  ((SELECT array_length(s.setconfig, 1)
      FROM pg_db_role_setting s
      JOIN pg_roles r ON r.oid = s.setrole
      JOIN pg_database d ON d.oid = s.setdatabase
      WHERE r.rolname = :'app_role' AND d.datname = :'target_database') = 1) AS app_setconfig_len_exact_one,
  ((SELECT string_to_array(regexp_replace(split_part(elem, '=', 2), '\s+', '', 'g'), ',')
      FROM pg_db_role_setting s
      JOIN pg_roles r ON r.oid = s.setrole
      JOIN pg_database d ON d.oid = s.setdatabase
      CROSS JOIN LATERAL unnest(s.setconfig) AS elem
      WHERE r.rolname = :'app_role' AND d.datname = :'target_database'
        AND split_part(elem, '=', 1) = 'search_path') = ARRAY['app', 'pg_catalog']) AS app_search_path_value_ok,
  ((SELECT count(*)
      FROM pg_db_role_setting s
      JOIN pg_roles r ON r.oid = s.setrole
      WHERE r.rolname = :'app_role'
        AND s.setdatabase IS DISTINCT FROM (SELECT oid FROM pg_database WHERE datname = :'target_database')) = 0) AS app_no_other_db_rows
\gset post_

\if :post_app_row_count_exact_one
\else
  \echo 'ERRO [config/001]: assert pos-ALTER falhou: app_role (:app_role) nao possui exatamente uma entrada em pg_db_role_setting para target_database.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: app_role sem exatamente uma entrada em pg_db_role_setting';
  END;
  $fail$;
\endif
\if :post_app_setconfig_len_exact_one
\else
  \echo 'ERRO [config/001]: assert pos-ALTER falhou: app_role (:app_role) possui setconfig com tamanho diferente de 1.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: app_role com setconfig de tamanho inesperado';
  END;
  $fail$;
\endif
\if :post_app_search_path_value_ok
\else
  \echo 'ERRO [config/001]: assert pos-ALTER falhou: search_path de app_role (:app_role) para target_database difere de "app, pg_catalog".'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: search_path de app_role incorreto';
  END;
  $fail$;
\endif
\if :post_app_no_other_db_rows
\else
  \echo 'ERRO [config/001]: assert pos-ALTER falhou: app_role (:app_role) possui pg_db_role_setting para outro database ou configuracao global.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: app_role com pg_db_role_setting fora de target_database';
  END;
  $fail$;
\endif

-- pg_roles.rolconfig deve continuar NULL: ALTER ROLE ... IN DATABASE grava
-- somente em pg_db_role_setting, nunca em pg_roles.rolconfig (que e usado
-- por ALTER ROLE ... SET global, nao utilizado por este script).
SELECT
  EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname IN (:'owner_role', :'migrator_role', :'app_role')
      AND rolconfig IS NOT NULL
  ) AS custom_role_settings
\gset post_rolconfig_

\if :post_rolconfig_custom_role_settings
  \echo 'ERRO [config/001]: assert pos-ALTER falhou: pg_roles.rolconfig deixou de ser NULL para owner_role/migrator_role/app_role.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: pg_roles.rolconfig nao esta mais NULL para owner_role/migrator_role/app_role';
  END;
  $fail$;
\endif

-- Reconfirma que nenhum efeito colateral ocorreu: CREATE no database
-- continua false, ACL do schema app inalterado, memberships inalteradas
-- (revalidado diretamente contra pg_auth_members, nao apenas via
-- pg_has_role), default privileges continuam zero, schema app continua
-- vazio.
SELECT
  has_database_privilege(:'owner_role', current_database(), 'CREATE')     AS owner_create,
  has_database_privilege(:'migrator_role', current_database(), 'CREATE')  AS migrator_create,
  has_database_privilege(:'app_role', current_database(), 'CREATE')       AS app_create,
  has_schema_privilege(:'owner_role', 'app', 'CREATE') AS owner_schema_create,
  has_schema_privilege(:'owner_role', 'app', 'USAGE')  AS owner_schema_usage,
  has_schema_privilege('public', 'app', 'CREATE')      AS public_create,
  has_schema_privilege('public', 'app', 'USAGE')       AS public_usage,
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
  pg_has_role(:'migrator_role', :'owner_role', 'SET') AS migrator_set_owner,
  pg_has_role(:'app_role', :'owner_role', 'SET')       AS app_set_owner,
  pg_has_role(:'app_role', :'migrator_role', 'SET')    AS app_set_migrator,
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
  ((SELECT count(*)
      FROM pg_default_acl d
      JOIN pg_roles r ON r.oid = d.defaclrole
      WHERE r.rolname IN (:'owner_role', :'migrator_role', :'app_role')) = 0) AS default_priv_zero,
  ((SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app') = 0) AS relation_count_zero,
  ((SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app') = 0)  AS routine_count_zero
\gset post_side_

\if :post_side_owner_create
  \echo 'ERRO [config/001]: assert pos-ALTER falhou: owner_role (:owner_role) passou a possuir CREATE no database.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: owner_role com CREATE no database apos ALTER ROLE search_path';
  END;
  $fail$;
\endif
\if :post_side_migrator_create
  \echo 'ERRO [config/001]: assert pos-ALTER falhou: migrator_role (:migrator_role) passou a possuir CREATE no database.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: migrator_role com CREATE no database apos ALTER ROLE search_path';
  END;
  $fail$;
\endif
\if :post_side_app_create
  \echo 'ERRO [config/001]: assert pos-ALTER falhou: app_role (:app_role) passou a possuir CREATE no database.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: app_role com CREATE no database apos ALTER ROLE search_path';
  END;
  $fail$;
\endif
\if :post_side_owner_schema_create
\else
  \echo 'ERRO [config/001]: assert pos-ALTER falhou: owner_role (:owner_role) perdeu CREATE efetivo no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: owner_role sem CREATE efetivo no schema app';
  END;
  $fail$;
\endif
\if :post_side_owner_schema_usage
\else
  \echo 'ERRO [config/001]: assert pos-ALTER falhou: owner_role (:owner_role) perdeu USAGE efetivo no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: owner_role sem USAGE efetivo no schema app';
  END;
  $fail$;
\endif
\if :post_side_public_create
  \echo 'ERRO [config/001]: assert pos-ALTER falhou: PUBLIC passou a possuir CREATE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: PUBLIC com CREATE no schema app';
  END;
  $fail$;
\endif
\if :post_side_public_usage
  \echo 'ERRO [config/001]: assert pos-ALTER falhou: PUBLIC passou a possuir USAGE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: PUBLIC com USAGE no schema app';
  END;
  $fail$;
\endif
\if :post_side_app_schema_create
  \echo 'ERRO [config/001]: assert pos-ALTER falhou: app_role (:app_role) passou a possuir CREATE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: app_role com CREATE no schema app';
  END;
  $fail$;
\endif
\if :post_side_app_schema_usage
  \echo 'ERRO [config/001]: assert pos-ALTER falhou: app_role (:app_role) passou a possuir USAGE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: app_role com USAGE no schema app';
  END;
  $fail$;
\endif
\if :post_side_migrator_direct_grant
  \echo 'ERRO [config/001]: assert pos-ALTER falhou: migrator_role (:migrator_role) passou a possuir grant DIRETO de CREATE/USAGE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: migrator_role com grant direto no schema app';
  END;
  $fail$;
\endif
\if :post_side_migrator_set_owner
\else
  \echo 'ERRO [config/001]: assert pos-ALTER falhou: migrator_role perdeu a capacidade de SET ROLE para owner_role.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: migrator_role perdeu capacidade de SET ROLE para owner_role';
  END;
  $fail$;
\endif
\if :post_side_app_set_owner
  \echo 'ERRO [config/001]: assert pos-ALTER falhou: app_role passou a poder executar SET ROLE para owner_role.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: app_role com SET ROLE para owner_role';
  END;
  $fail$;
\endif
\if :post_side_app_set_migrator
  \echo 'ERRO [config/001]: assert pos-ALTER falhou: app_role passou a poder executar SET ROLE para migrator_role.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: app_role com SET ROLE para migrator_role';
  END;
  $fail$;
\endif
\if :post_side_migrator_owner_membership_exact
\else
  \echo 'ERRO [config/001]: assert pos-ALTER falhou: membership direta de migrator_role (:migrator_role) em owner_role (:owner_role) deixou de ser exatamente admin_option=false, inherit_option=false, set_option=true.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: membership migrator_role em owner_role nao esta mais exata';
  END;
  $fail$;
\endif
\if :post_side_migrator_owner_no_extra_membership
\else
  \echo 'ERRO [config/001]: assert pos-ALTER falhou: passou a existir membership adicional de migrator_role (:migrator_role) em owner_role (:owner_role) com admin_option/inherit_option true.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: membership adicional indevida de migrator_role em owner_role';
  END;
  $fail$;
\endif
\if :post_side_app_owner_no_direct_membership
\else
  \echo 'ERRO [config/001]: assert pos-ALTER falhou: app_role (:app_role) passou a possuir membership DIRETA em owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: app_role com membership direta em owner_role';
  END;
  $fail$;
\endif
\if :post_side_app_migrator_no_direct_membership
\else
  \echo 'ERRO [config/001]: assert pos-ALTER falhou: app_role (:app_role) passou a possuir membership DIRETA em migrator_role (:migrator_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: app_role com membership direta em migrator_role';
  END;
  $fail$;
\endif
\if :post_side_default_priv_zero
\else
  \echo 'ERRO [config/001]: assert pos-ALTER falhou: pg_default_acl deixou de estar zerado para owner_role/migrator_role/app_role.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: pg_default_acl nao esta mais zerado';
  END;
  $fail$;
\endif
\if :post_side_relation_count_zero
\else
  \echo 'ERRO [config/001]: assert pos-ALTER falhou: schema app passou a conter relation(s).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: schema app com relation(s) apos ALTER ROLE search_path';
  END;
  $fail$;
\endif
\if :post_side_routine_count_zero
\else
  \echo 'ERRO [config/001]: assert pos-ALTER falhou: schema app passou a conter routine(s).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-ALTER falhou: schema app com routine(s) apos ALTER ROLE search_path';
  END;
  $fail$;
\endif

\echo 'Assert pos-ALTER de config/001 validado: search_path = app, pg_catalog configurado POR DATABASE para as tres roles, sem efeito colateral.'

COMMIT;

\echo '=== config/001: ADMIN SET SEARCH_PATH - concluido. ==='
