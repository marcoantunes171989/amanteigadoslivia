-- =============================================================================
-- 003_admin_finalize_app_schema.sql
--
-- Fase: bootstrap administrativo do schema "app" (NAO e migration de negocio).
-- Identidade esperada: administrador do ambiente (mesma identidade do 001).
-- Runtime APP nunca executa este script.
--
-- Duas responsabilidades, nesta ordem estrita:
--   FASE A - remove o CREATE ON DATABASE TEMPORARIO concedido a owner_role
--            pelo script 001, e commita esse REVOKE imediatamente, ANTES de
--            qualquer validacao. Isso torna este script o mecanismo oficial
--            de cleanup mesmo que o script 002 nunca tenha sido executado ou
--            tenha sido interrompido no meio.
--   FASE B - validacao final somente-leitura do estado do database e do
--            schema app.
--
-- Variaveis psql obrigatorias (passadas via -v, nenhum valor default aqui):
--   target_database  -> nome do database alvo
--   owner_role       -> role Owner do schema app no ambiente
--   migrator_role    -> role Migrator do ambiente
--   app_role         -> role Runtime APP do ambiente
--
-- Se o schema app nao existir: o cleanup da FASE A e mantido (ja commitado),
-- e a FASE B falha de forma explicita. Este script NUNCA recria o schema.
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
  \echo 'ERRO [003]: variavel psql "target_database" ausente. Use -v target_database=... Nenhum REVOKE/validacao sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: target_database. Script 003 abortado antes de qualquer instrucao SQL.';
  END;
  $missing_var$;
\endif
\if :{?owner_role}
\else
  \echo 'ERRO [003]: variavel psql "owner_role" ausente. Use -v owner_role=... Nenhum REVOKE/validacao sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: owner_role. Script 003 abortado antes de qualquer instrucao SQL.';
  END;
  $missing_var$;
\endif
\if :{?migrator_role}
\else
  \echo 'ERRO [003]: variavel psql "migrator_role" ausente. Use -v migrator_role=... Nenhum REVOKE/validacao sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: migrator_role. Script 003 abortado antes de qualquer instrucao SQL.';
  END;
  $missing_var$;
\endif
\if :{?app_role}
\else
  \echo 'ERRO [003]: variavel psql "app_role" ausente. Use -v app_role=... Nenhum REVOKE/validacao sera executado.'
  DO $missing_var$
  BEGIN
    RAISE EXCEPTION 'Variavel psql obrigatoria ausente: app_role. Script 003 abortado antes de qualquer instrucao SQL.';
  END;
  $missing_var$;
\endif

\echo '=== 003: ADMIN FINALIZE / CLEANUP - inicio ==='

-- FASE A: cleanup do privilegio temporario. Transacao propria, commitada
-- imediatamente, ANTES de qualquer validacao (ver cabecalho acima).
BEGIN;
REVOKE CREATE ON DATABASE :"target_database" FROM :"owner_role";
COMMIT;
\echo 'FASE A concluida: CREATE ON DATABASE removido de owner_role (commitado).'

-- FASE B: validacao final, somente leitura.
BEGIN;

SELECT (current_database() IS NOT DISTINCT FROM :'target_database') AS db_ok
\gset v1_

\if :v1_db_ok
\else
  \echo 'ERRO [003]: current_database() difere de target_database (:target_database).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Validacao falhou: current_database() difere de target_database';
  END;
  $fail$;
\endif

SELECT
  has_database_privilege(:'owner_role', current_database(), 'CONNECT')    AS owner_connect,
  has_database_privilege(:'owner_role', current_database(), 'CREATE')     AS owner_create,
  has_database_privilege(:'migrator_role', current_database(), 'CONNECT') AS migrator_connect,
  has_database_privilege(:'migrator_role', current_database(), 'CREATE')  AS migrator_create,
  has_database_privilege(:'app_role', current_database(), 'CONNECT')      AS app_connect,
  has_database_privilege(:'app_role', current_database(), 'CREATE')       AS app_create
\gset v2_

\if :v2_owner_connect
\else
  \echo 'ERRO [003]: owner_role (:owner_role) sem CONNECT no database.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Validacao falhou: owner_role sem CONNECT no database';
  END;
  $fail$;
\endif
\if :v2_owner_create
  \echo 'ERRO [003]: owner_role (:owner_role) ainda possui CREATE no database apos cleanup.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Validacao falhou: owner_role ainda possui CREATE no database apos cleanup';
  END;
  $fail$;
\endif
\if :v2_migrator_connect
\else
  \echo 'ERRO [003]: migrator_role (:migrator_role) sem CONNECT no database.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Validacao falhou: migrator_role sem CONNECT no database';
  END;
  $fail$;
\endif
\if :v2_migrator_create
  \echo 'ERRO [003]: migrator_role (:migrator_role) possui CREATE no database.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Validacao falhou: migrator_role possui CREATE no database';
  END;
  $fail$;
\endif
\if :v2_app_connect
\else
  \echo 'ERRO [003]: app_role (:app_role) sem CONNECT no database.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Validacao falhou: app_role sem CONNECT no database';
  END;
  $fail$;
\endif
\if :v2_app_create
  \echo 'ERRO [003]: app_role (:app_role) possui CREATE no database.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Validacao falhou: app_role possui CREATE no database';
  END;
  $fail$;
\endif

SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'app') AS schema_exists
\gset v3_

\if :v3_schema_exists
\else
  \echo 'ERRO [003]: schema "app" nao existe. Cleanup do CREATE temporario (FASE A) ja foi aplicado e commitado, portanto owner_role NAO possui mais CREATE ON DATABASE. Este script NAO recria o schema automaticamente. Reexecutar somente o 002 NAO e suficiente: reexecute a sequencia completa 001 -> 002 -> 003, pois 002 depende do CREATE ON DATABASE temporario concedido pelo 001.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Validacao falhou: schema app nao existe; cleanup da FASE A ja commitado (owner_role sem CREATE ON DATABASE); reexecutar a sequencia completa 001 -> 002 -> 003, nao apenas 002';
  END;
  $fail$;
\endif

SELECT
  ((SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = 'app') IS NOT DISTINCT FROM :'owner_role') AS schema_owner_ok,
  has_schema_privilege(:'owner_role', 'app', 'CREATE') AS owner_schema_create,
  has_schema_privilege(:'owner_role', 'app', 'USAGE')  AS owner_schema_usage,
  has_schema_privilege('public', 'app', 'CREATE')      AS public_create,
  has_schema_privilege('public', 'app', 'USAGE')       AS public_usage,
  has_schema_privilege(:'app_role', 'app', 'CREATE')   AS app_schema_create,
  has_schema_privilege(:'app_role', 'app', 'USAGE')    AS app_schema_usage,
  -- Migrator, em identidade propria, nao pode ter nenhum grant DIRETO de
  -- CREATE/USAGE no schema app. has_schema_privilege() nao serve aqui porque
  -- refletiria tambem privilegio EFETIVO herdado via membership/SET em
  -- owner_role (ATENCAO: nao confundir membership SET com grant direto); o
  -- teste correto e a existencia (ou nao) de uma entrada de ACL diretamente
  -- concedida a migrator_role no schema app.
  EXISTS (
    SELECT 1
    FROM pg_namespace n
    CROSS JOIN LATERAL aclexplode(n.nspacl) a
    JOIN pg_roles r ON r.oid = a.grantee
    WHERE n.nspname = 'app'
      AND r.rolname = :'migrator_role'
      AND a.privilege_type IN ('CREATE', 'USAGE')
  ) AS migrator_direct_grant,
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app') AS relation_count,
  ((SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'app') = 0) AS relation_count_zero,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app')  AS routine_count,
  ((SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'app') = 0) AS routine_count_zero
\gset v4_

\if :v4_schema_owner_ok
\else
  \echo 'ERRO [003]: owner do schema app difere de owner_role (:owner_role).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Validacao falhou: owner do schema app difere de owner_role';
  END;
  $fail$;
\endif
\if :v4_owner_schema_create
\else
  \echo 'ERRO [003]: owner_role (:owner_role) sem CREATE efetivo no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Validacao falhou: owner_role sem CREATE efetivo no schema app';
  END;
  $fail$;
\endif
\if :v4_owner_schema_usage
\else
  \echo 'ERRO [003]: owner_role (:owner_role) sem USAGE efetivo no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Validacao falhou: owner_role sem USAGE efetivo no schema app';
  END;
  $fail$;
\endif
\if :v4_public_create
  \echo 'ERRO [003]: PUBLIC possui CREATE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Validacao falhou: PUBLIC possui CREATE no schema app';
  END;
  $fail$;
\endif
\if :v4_public_usage
  \echo 'ERRO [003]: PUBLIC possui USAGE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Validacao falhou: PUBLIC possui USAGE no schema app';
  END;
  $fail$;
\endif
\if :v4_app_schema_create
  \echo 'ERRO [003]: app_role (:app_role) possui CREATE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Validacao falhou: app_role possui CREATE no schema app';
  END;
  $fail$;
\endif
\if :v4_app_schema_usage
  \echo 'ERRO [003]: app_role (:app_role) possui USAGE no schema app.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Validacao falhou: app_role possui USAGE no schema app';
  END;
  $fail$;
\endif
\if :v4_migrator_direct_grant
  \echo 'ERRO [003]: migrator_role (:migrator_role) possui grant DIRETO de CREATE/USAGE no schema app (identidade propria).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Validacao falhou: migrator_role possui grant DIRETO de CREATE/USAGE no schema app';
  END;
  $fail$;
\endif
\if :v4_relation_count_zero
\else
  \echo 'ERRO [003]: schema app contem :v4_relation_count relation(s); esperado 0.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Validacao falhou: schema app contem relation(s); esperado 0';
  END;
  $fail$;
\endif
\if :v4_routine_count_zero
\else
  \echo 'ERRO [003]: schema app contem :v4_routine_count routine(s); esperado 0.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Validacao falhou: schema app contem routine(s); esperado 0';
  END;
  $fail$;
\endif

SELECT
  pg_has_role(:'migrator_role', :'owner_role', 'SET') AS migrator_set_owner,
  pg_has_role(:'app_role', :'owner_role', 'SET')       AS app_set_owner,
  pg_has_role(:'app_role', :'migrator_role', 'SET')    AS app_set_migrator,
  -- Defesa em profundidade (N-01): Runtime APP nao pode ser member DIRETA de
  -- owner_role nem de migrator_role em pg_auth_members, independentemente
  -- dos valores de admin_option/inherit_option/set_option dessa linha. O
  -- teste pg_has_role(..., 'SET') acima cobre apenas a capacidade EFETIVA de
  -- SET ROLE; uma membership direta com inherit_option=true e set_option=false
  -- concederia heranca de privilegio sem aparecer nesse teste. A politica do
  -- projeto e Runtime APP = READ_WRITE_NO_DDL: nenhuma membership direta de
  -- app_role em owner_role/migrator_role e permitida, sob nenhuma combinacao
  -- de opcoes.
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
  ) AS app_migrator_direct_membership,
  -- Membership DIRETA Migrator -> Owner deve permanecer exatamente
  -- admin_option=false, inherit_option=false, set_option=true. Verifica
  -- pg_auth_members diretamente; nao basta o privilegio efetivo checado
  -- acima via pg_has_role(..., 'SET').
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
\gset v5_

\if :v5_migrator_set_owner
\else
  \echo 'ERRO [003]: migrator_role perdeu a capacidade de SET ROLE para owner_role.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Validacao falhou: migrator_role perdeu a capacidade de SET ROLE para owner_role';
  END;
  $fail$;
\endif
\if :v5_app_set_owner
  \echo 'ERRO [003]: app_role pode executar SET ROLE para owner_role.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Validacao falhou: app_role pode executar SET ROLE para owner_role';
  END;
  $fail$;
\endif
\if :v5_app_set_migrator
  \echo 'ERRO [003]: app_role pode executar SET ROLE para migrator_role.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Validacao falhou: app_role pode executar SET ROLE para migrator_role';
  END;
  $fail$;
\endif
\if :v5_app_owner_direct_membership
  \echo 'ERRO [003]: app_role (:app_role) possui membership DIRETA indevida em owner_role (:owner_role) (pg_auth_members), independentemente de admin_option/inherit_option/set_option. Runtime APP = READ_WRITE_NO_DDL nao permite nenhuma membership direta em Owner.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Validacao falhou: app_role possui membership direta indevida em owner_role (pg_auth_members)';
  END;
  $fail$;
\endif
\if :v5_app_migrator_direct_membership
  \echo 'ERRO [003]: app_role (:app_role) possui membership DIRETA indevida em migrator_role (:migrator_role) (pg_auth_members), independentemente de admin_option/inherit_option/set_option. Runtime APP = READ_WRITE_NO_DDL nao permite nenhuma membership direta em Migrator.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Validacao falhou: app_role possui membership direta indevida em migrator_role (pg_auth_members)';
  END;
  $fail$;
\endif
\if :v5_migrator_owner_membership_exact
\else
  \echo 'ERRO [003]: membership direta de migrator_role (:migrator_role) em owner_role (:owner_role) nao permanece exata (admin_option=false, inherit_option=false, set_option=true).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Validacao falhou: membership de migrator_role em owner_role nao permanece exata (admin false, inherit false, set true)';
  END;
  $fail$;
\endif
\if :v5_migrator_owner_no_extra_membership
\else
  \echo 'ERRO [003]: existe membership adicional de migrator_role (:migrator_role) em owner_role (:owner_role) com admin_option=true ou inherit_option=true; esperado somente a membership exata (set_option=true).'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Validacao falhou: existe membership adicional de migrator_role em owner_role com admin_option ou inherit_option true';
  END;
  $fail$;
\endif

-- rolconfig cobre ALTER ROLE ... SET sem database associado; pg_db_role_setting
-- (catalogo compartilhado, visivel de qualquer database do cluster) cobre
-- settings por role+database E settings globais por role (setdatabase = 0).
-- Nesta fase nenhuma das tres roles deve ter qualquer configuracao customizada.
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
  -- DEFAULT PRIVILEGES nao sao configurados nesta fase para nenhuma das tres
  -- roles do projeto, em NENHUM schema (incluindo defaclnamespace global/NULL,
  -- ou seja, nao filtramos por schema app aqui).
  (SELECT count(*)
     FROM pg_default_acl d
     JOIN pg_roles r ON r.oid = d.defaclrole
     WHERE r.rolname IN (:'owner_role', :'migrator_role', :'app_role')) AS default_priv_count,
  ((SELECT count(*)
     FROM pg_default_acl d
     JOIN pg_roles r ON r.oid = d.defaclrole
     WHERE r.rolname IN (:'owner_role', :'migrator_role', :'app_role')) = 0) AS default_priv_zero
\gset v6_

\if :v6_custom_role_settings
  \echo 'ERRO [003]: existe role setting customizado (rolconfig) em owner_role/migrator_role/app_role.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Validacao falhou: existe role setting customizado (rolconfig) em owner_role/migrator_role/app_role';
  END;
  $fail$;
\endif
\if :v6_db_role_setting_exists
  \echo 'ERRO [003]: existe pg_db_role_setting (por database ou global) em owner_role/migrator_role/app_role.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Validacao falhou: existe pg_db_role_setting em owner_role/migrator_role/app_role';
  END;
  $fail$;
\endif
\if :v6_default_priv_zero
\else
  \echo 'ERRO [003]: existem :v6_default_priv_count pg_default_acl entry(ies) para owner_role/migrator_role/app_role; esperado 0.'
  DO $fail$
  BEGIN
    RAISE EXCEPTION 'Validacao falhou: existem pg_default_acl entry(ies) para owner_role/migrator_role/app_role; esperado 0';
  END;
  $fail$;
\endif

\echo 'Validacao final de 003 concluida com sucesso: estado consistente com a especificacao.'

COMMIT;

\echo '=== 003: ADMIN FINALIZE - concluido. Cleanup do CREATE temporario aplicado e commitado; validacao final passou. ==='
