-- =============================================================================
-- 001_admin_prepare_app_schema.sql
--
-- Fase: bootstrap administrativo do schema "app" (NAO e migration de negocio).
-- Identidade esperada: administrador do ambiente (NAO superuser obrigatorio;
--   precisa apenas de privilegio para GRANT/REVOKE CREATE ON DATABASE, tipicamente
--   por ser o dono do database).
-- Runtime APP nunca executa este script.
--
-- Variaveis psql obrigatorias (passadas via -v, nenhum valor default aqui):
--   target_database  -> nome do database alvo (ex.: -v target_database=amanteigados_dev)
--   owner_role       -> role Owner do schema app no ambiente
--   migrator_role    -> role Migrator do ambiente
--   app_role         -> role Runtime APP do ambiente
--
-- Efeito: concede CREATE ON DATABASE :target_database para :owner_role.
-- Este privilegio e TEMPORARIO e deve ser removido pelo script 003 apos a
-- execucao do 002. Nenhum outro objeto, role ou schema e alterado aqui.
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
  \echo 'ERRO [001]: variavel psql "target_database" ausente. Use -v target_database=... Nenhum GRANT/REVOKE/CREATE sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: target_database. Script 001 abortado antes de qualquer instrucao SQL.';
  END;
  $missing_var$;
\endif
\if :{?owner_role}
\else
  \echo 'ERRO [001]: variavel psql "owner_role" ausente. Use -v owner_role=... Nenhum GRANT/REVOKE/CREATE sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: owner_role. Script 001 abortado antes de qualquer instrucao SQL.';
  END;
  $missing_var$;
\endif
\if :{?migrator_role}
\else
  \echo 'ERRO [001]: variavel psql "migrator_role" ausente. Use -v migrator_role=... Nenhum GRANT/REVOKE/CREATE sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: migrator_role. Script 001 abortado antes de qualquer instrucao SQL.';
  END;
  $missing_var$;
\endif
\if :{?app_role}
\else
  \echo 'ERRO [001]: variavel psql "app_role" ausente. Use -v app_role=... Nenhum GRANT/REVOKE/CREATE sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: app_role. Script 001 abortado antes de qualquer instrucao SQL.';
  END;
  $missing_var$;
\endif

\echo '=== 001: ADMIN PREPARE - inicio ==='

BEGIN;

-- ---------------------------------------------------------------------------
-- Precondicoes (SQL top-level + \gset + \if). Cada checagem aborta a
-- transacao via DO estatico caso falhe; a mensagem detalhada (com os valores
-- reais das variaveis psql) e emitida antes, via \echo.
-- ---------------------------------------------------------------------------

SELECT (current_database() IS NOT DISTINCT FROM :'target_database') AS db_ok
\gset pre1_

\if :pre1_db_ok
\else
  \echo 'ERRO [001]: current_database() difere de target_database (:target_database).'
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
  \echo 'ERRO [001]: owner_role (:owner_role) nao existe.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: owner_role nao existe';
  END;
  $fail$;
\endif
\if :pre2_migrator_exists
\else
  \echo 'ERRO [001]: migrator_role (:migrator_role) nao existe.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role nao existe';
  END;
  $fail$;
\endif
\if :pre2_app_exists
\else
  \echo 'ERRO [001]: app_role (:app_role) nao existe.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role nao existe';
  END;
  $fail$;
\endif

-- Roles confirmadas existentes acima: seguro consultar atributos agora.
SELECT
  (SELECT rolcanlogin FROM pg_roles WHERE rolname = :'owner_role')    AS owner_login,
  (SELECT rolsuper    FROM pg_roles WHERE rolname = :'owner_role')    AS owner_super,
  (SELECT rolcanlogin FROM pg_roles WHERE rolname = :'migrator_role') AS migrator_login,
  (SELECT rolsuper    FROM pg_roles WHERE rolname = :'migrator_role') AS migrator_super,
  (SELECT rolcanlogin FROM pg_roles WHERE rolname = :'app_role')      AS app_login,
  (SELECT rolsuper    FROM pg_roles WHERE rolname = :'app_role')      AS app_super
\gset pre3_

\if :pre3_owner_login
  \echo 'ERRO [001]: owner_role (:owner_role) possui LOGIN; esperado NOLOGIN.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: owner_role possui LOGIN; esperado NOLOGIN';
  END;
  $fail$;
\endif
\if :pre3_owner_super
  \echo 'ERRO [001]: owner_role (:owner_role) e superuser.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: owner_role e superuser';
  END;
  $fail$;
\endif
\if :pre3_migrator_login
\else
  \echo 'ERRO [001]: migrator_role (:migrator_role) nao possui LOGIN.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role nao possui LOGIN';
  END;
  $fail$;
\endif
\if :pre3_migrator_super
  \echo 'ERRO [001]: migrator_role (:migrator_role) e superuser.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role e superuser';
  END;
  $fail$;
\endif
\if :pre3_app_login
\else
  \echo 'ERRO [001]: app_role (:app_role) nao possui LOGIN.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role nao possui LOGIN';
  END;
  $fail$;
\endif
\if :pre3_app_super
  \echo 'ERRO [001]: app_role (:app_role) e superuser.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role e superuser';
  END;
  $fail$;
\endif

SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app') AS schema_app_exists
\gset pre4_

\if :pre4_schema_app_exists
  \echo 'ERRO [001]: schema "app" ja existe; bootstrap requer schema app ausente.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: schema app ja existe';
  END;
  $fail$;
\endif

-- relkinds cobertos: r=table, p=partitioned table, v=view, m=materialized
-- view, S=sequence, f=foreign table.
SELECT EXISTS (
  SELECT 1
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
) AS public_has_relations
\gset pre5_

\if :pre5_public_has_relations
  \echo 'ERRO [001]: schema public contem relations (tabela/view/matview/sequence/foreign table); esperado public sem objetos de negocio.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: schema public contem relations';
  END;
  $fail$;
\endif

SELECT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
) AS public_has_routines
\gset pre5b_

\if :pre5b_public_has_routines
  \echo 'ERRO [001]: schema public contem routines (funcoes/procedures); esperado public sem objetos de negocio.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: schema public contem routines';
  END;
  $fail$;
\endif

-- Migrator deve possuir membership DIRETA em Owner com exatamente
-- admin_option=false, inherit_option=false, set_option=true (modelo
-- normativo aprovado). Verifica pg_auth_members diretamente; nao basta
-- privilegio efetivo via pg_has_role(..., 'SET').
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
\gset pre6_

\if :pre6_migrator_owner_membership_exact
\else
  \echo 'ERRO [001]: migrator_role (:migrator_role) nao possui membership direta em owner_role (:owner_role) com admin_option=false, inherit_option=false, set_option=true.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role nao possui membership exata (admin false, inherit false, set true) em owner_role';
  END;
  $fail$;
\endif
\if :pre6_migrator_owner_no_extra_membership
\else
  \echo 'ERRO [001]: existe membership adicional de migrator_role (:migrator_role) em owner_role (:owner_role) com admin_option=true ou inherit_option=true; esperado somente a membership exata (set_option=true).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: existe membership adicional de migrator_role em owner_role com admin_option ou inherit_option true';
  END;
  $fail$;
\endif

-- app_role nao pode ter nenhuma associacao (SET) com Owner ou Migrator.
SELECT EXISTS (
  SELECT 1
  FROM pg_auth_members m
  JOIN pg_roles r   ON r.oid = m.roleid
  JOIN pg_roles mem ON mem.oid = m.member
  WHERE mem.rolname = :'app_role'
    AND r.rolname IN (:'owner_role', :'migrator_role')
) AS app_member_of_owner_or_migrator
\gset pre7_

\if :pre7_app_member_of_owner_or_migrator
  \echo 'ERRO [001]: app_role (:app_role) possui associacao com owner_role/migrator_role; esperado nenhuma.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role possui associacao com owner_role/migrator_role';
  END;
  $fail$;
\endif

SELECT
  has_database_privilege(:'owner_role', current_database(), 'CREATE')    AS owner_can_create,
  has_database_privilege(:'migrator_role', current_database(), 'CREATE') AS migrator_can_create,
  has_database_privilege(:'app_role', current_database(), 'CREATE')      AS app_can_create
\gset pre8_

\if :pre8_owner_can_create
  \echo 'ERRO [001]: owner_role (:owner_role) ja possui CREATE no database antes da preparacao.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: owner_role ja possui CREATE no database antes da preparacao';
  END;
  $fail$;
\endif
\if :pre8_migrator_can_create
  \echo 'ERRO [001]: migrator_role (:migrator_role) possui CREATE no database; esperado false.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: migrator_role possui CREATE no database';
  END;
  $fail$;
\endif
\if :pre8_app_can_create
  \echo 'ERRO [001]: app_role (:app_role) possui CREATE no database; esperado false.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Precondicao falhou: app_role possui CREATE no database';
  END;
  $fail$;
\endif

\echo 'Todas as precondicoes de 001 foram validadas com sucesso.'

-- Concessao TEMPORARIA: somente owner_role recebe CREATE no database alvo.
GRANT CREATE ON DATABASE :"target_database" TO :"owner_role";

\echo 'ATENCAO: CREATE ON DATABASE foi concedido a owner_role e e TEMPORARIO.'
\echo 'Este privilegio DEVE ser removido pelo script 003 apos a execucao do 002.'

-- ---------------------------------------------------------------------------
-- Assert pos-GRANT, ainda dentro da transacao: confirma que APENAS owner_role
-- recebeu CREATE, e que nenhum outro estado relevante mudou como efeito
-- colateral do GRANT. Qualquer falha aqui aborta a transacao antes do COMMIT.
-- ---------------------------------------------------------------------------

SELECT
  has_database_privilege(:'owner_role', current_database(), 'CONNECT')    AS owner_connect,
  has_database_privilege(:'owner_role', current_database(), 'CREATE')     AS owner_create,
  has_database_privilege(:'migrator_role', current_database(), 'CONNECT') AS migrator_connect,
  has_database_privilege(:'migrator_role', current_database(), 'CREATE')  AS migrator_create,
  has_database_privilege(:'app_role', current_database(), 'CONNECT')      AS app_connect,
  has_database_privilege(:'app_role', current_database(), 'CREATE')       AS app_create
\gset post1_

\if :post1_owner_connect
\else
  \echo 'ERRO [001]: assert pos-GRANT falhou: owner_role (:owner_role) sem CONNECT.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-GRANT falhou: owner_role sem CONNECT';
  END;
  $fail$;
\endif
\if :post1_owner_create
\else
  \echo 'ERRO [001]: assert pos-GRANT falhou: owner_role (:owner_role) sem CREATE apos GRANT.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-GRANT falhou: owner_role sem CREATE apos GRANT';
  END;
  $fail$;
\endif
\if :post1_migrator_connect
\else
  \echo 'ERRO [001]: assert pos-GRANT falhou: migrator_role (:migrator_role) sem CONNECT.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-GRANT falhou: migrator_role sem CONNECT';
  END;
  $fail$;
\endif
\if :post1_migrator_create
  \echo 'ERRO [001]: assert pos-GRANT falhou: migrator_role (:migrator_role) recebeu CREATE indevidamente.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-GRANT falhou: migrator_role recebeu CREATE indevidamente';
  END;
  $fail$;
\endif
\if :post1_app_connect
\else
  \echo 'ERRO [001]: assert pos-GRANT falhou: app_role (:app_role) sem CONNECT.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-GRANT falhou: app_role sem CONNECT';
  END;
  $fail$;
\endif
\if :post1_app_create
  \echo 'ERRO [001]: assert pos-GRANT falhou: app_role (:app_role) recebeu CREATE indevidamente.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-GRANT falhou: app_role recebeu CREATE indevidamente';
  END;
  $fail$;
\endif

SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app') AS schema_app_exists
\gset post2_

\if :post2_schema_app_exists
  \echo 'ERRO [001]: assert pos-GRANT falhou: schema "app" ja existe apos 001; esperado ausente ate a execucao de 002.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-GRANT falhou: schema app ja existe apos 001';
  END;
  $fail$;
\endif

SELECT
  pg_has_role(:'migrator_role', :'owner_role', 'SET') AS migrator_set_owner,
  pg_has_role(:'app_role', :'owner_role', 'SET')       AS app_set_owner,
  pg_has_role(:'app_role', :'migrator_role', 'SET')    AS app_set_migrator
\gset post3_

\if :post3_migrator_set_owner
\else
  \echo 'ERRO [001]: assert pos-GRANT falhou: migrator_role perdeu a capacidade de SET ROLE para owner_role.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-GRANT falhou: migrator_role perdeu a capacidade de SET ROLE para owner_role';
  END;
  $fail$;
\endif
\if :post3_app_set_owner
  \echo 'ERRO [001]: assert pos-GRANT falhou: app_role pode executar SET ROLE para owner_role.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-GRANT falhou: app_role pode executar SET ROLE para owner_role';
  END;
  $fail$;
\endif
\if :post3_app_set_migrator
  \echo 'ERRO [001]: assert pos-GRANT falhou: app_role pode executar SET ROLE para migrator_role.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Assert pos-GRANT falhou: app_role pode executar SET ROLE para migrator_role';
  END;
  $fail$;
\endif

\echo 'Assert pos-GRANT de 001 validado: somente owner_role possui CREATE temporario no database.'

COMMIT;

\echo '=== 001: ADMIN PREPARE - concluido. owner_role possui CREATE temporario; migrator_role e app_role continuam sem CREATE. ==='
