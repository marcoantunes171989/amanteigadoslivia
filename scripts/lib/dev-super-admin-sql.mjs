// SQL do fluxo do primeiro SUPER_ADMIN (DEV LOCAL), separado por identidade e responsabilidade.
//
//  - IDENTITY_SQL: destino e identidade de sessao. Nao toca o ledger. Usado por A, B e C.
//  - PRIVILEGED_LEDGER_GUARD_SQL: ledger app.schema_migrations. SOMENTE apos SET ROLE owner (A e C).
//  - PRIVILEGED_STRUCTURE_GUARD_SQL / PRIVILEGED_PRIVILEGES_SQL: inspecao estrutural e de seguranca (A e C).
//  - RUNTIME_BOOTSTRAP_GUARD_SQL: unico guard usado por B (app_role). Composto sem nenhuma referencia ao ledger.
//  - ADMIN_ROWS_SQL: linhas de tab_usuario_admin sem hash/salt (somente o teste de formato).
//  - BOOTSTRAP_LOCK_SQL / BOOTSTRAP_INSERT_SQL: escrita exclusiva do bootstrap B.
//
// B nunca executa SET ROLE, nunca consulta app.schema_migrations e nunca depende de ACL do ledger.

import { DEV_APP_USER, DEV_MIGRATOR_USER, DEV_OWNER_ROLE } from './dev-super-admin-bootstrap.mjs';

export const SET_OWNER_ROLE_SQL = `SET ROLE ${DEV_OWNER_ROLE}`;
export const RESET_ROLE_SQL = 'RESET ROLE';

const IDENTITY_COLUMNS = `
  (current_database() = 'amanteigados_dev') AS db_ok,
  (host(inet_server_addr()) = '127.0.0.1' AND inet_server_port() = 5432) AS addr_ok,
  session_user::text AS sess_user,
  current_user::text AS curr_user,
  (current_setting('transaction_read_only') = 'on') AS read_only`;

// Fragmentos de catalogo visiveis ao runtime. Nenhum toca dados de usuario (sem hash, sem senha).
const STRUCTURE_COLUMNS = `
  (SELECT array_agg(c.relname::text ORDER BY c.relname::text)
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'app' AND c.relkind = 'r') AS tables,
  (SELECT array_agg(a.attname::text ORDER BY a.attnum)
     FROM pg_attribute a
     JOIN pg_class c ON c.oid = a.attrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'app' AND c.relname = 'tab_usuario_admin'
      AND a.attnum > 0 AND NOT a.attisdropped) AS columns,
  (SELECT a.attnotnull AND pg_get_expr(d.adbin, d.adrelid) = 'false'
     FROM pg_attribute a
     JOIN pg_class c ON c.oid = a.attrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE n.nspname = 'app' AND c.relname = 'tab_usuario_admin' AND a.attname = 'protegido') AS protegido_def_ok,
  (SELECT count(*)::int
     FROM pg_constraint x
     JOIN pg_class c ON c.oid = x.conrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'app' AND c.relname = 'tab_usuario_admin' AND x.contype = 'c'
      AND x.conname IN ('ck_tab_usuario_admin_perfil', 'ck_tab_usuario_admin_protegido')) AS checks_count,
  (SELECT count(*)::int
     FROM pg_trigger t
     JOIN pg_class c ON c.oid = t.tgrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'app' AND c.relname = 'tab_usuario_admin'
      AND t.tgname = 'trg_proteger_usuario_admin' AND NOT t.tgisinternal AND t.tgenabled <> 'D') AS trigger_count,
  (SELECT count(*)::int
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'app' AND p.proname = 'fn_proteger_usuario_admin'
      AND pg_get_userbyid(p.proowner) = '${DEV_OWNER_ROLE}') AS function_count,
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'app') AS routine_count,
  (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'app' AND c.relkind = 'S') AS sequence_count,
  (SELECT count(*)::int FROM app.tab_usuario_admin) AS usuario_total,
  (SELECT count(*)::int FROM app.tab_categoria) AS categorias,
  (SELECT count(*)::int FROM app.tab_produto) AS produtos,
  (SELECT count(*)::int FROM app.tab_produto_imagem) AS imagens,
  (SELECT count(*)::int FROM app.tab_produto_preco) AS precos`;

// Privilegios do app_role (nome fixo, nao current_user) sobre o que o bootstrap usa.
const APP_PRIVILEGE_COLUMNS = `
  has_table_privilege('${DEV_APP_USER}', 'app.tab_usuario_admin', 'SELECT') AS priv_select,
  has_table_privilege('${DEV_APP_USER}', 'app.tab_usuario_admin', 'INSERT') AS priv_insert,
  has_table_privilege('${DEV_APP_USER}', 'app.tab_usuario_admin', 'UPDATE') AS priv_update,
  has_table_privilege('${DEV_APP_USER}', 'app.tab_usuario_admin', 'DELETE') AS priv_delete,
  has_schema_privilege('${DEV_APP_USER}', 'app', 'USAGE') AS priv_schema_usage`;

// Seguranca relevante para A e C. Verifica o modelo de SET ROLE e a ausencia de ACL do ledger para app/public.
const SECURITY_COLUMNS = `
  EXISTS (
    SELECT 1
      FROM pg_auth_members m
      JOIN pg_roles r   ON r.oid = m.roleid
      JOIN pg_roles mem ON mem.oid = m.member
     WHERE r.rolname = '${DEV_OWNER_ROLE}' AND mem.rolname = '${DEV_MIGRATOR_USER}'
       AND m.admin_option = false AND m.inherit_option = false AND m.set_option = true
  ) AS migrator_owner_exact,
  (SELECT count(*)::int
     FROM pg_auth_members m
     JOIN pg_roles r   ON r.oid = m.roleid
     JOIN pg_roles mem ON mem.oid = m.member
    WHERE r.rolname = '${DEV_OWNER_ROLE}' AND mem.rolname = '${DEV_MIGRATOR_USER}') AS migrator_owner_rows,
  pg_has_role('${DEV_MIGRATOR_USER}', '${DEV_OWNER_ROLE}', 'SET') AS migrator_can_set_owner,
  NOT EXISTS (
    SELECT 1
      FROM pg_auth_members m
      JOIN pg_roles mem ON mem.oid = m.member
     WHERE mem.rolname = '${DEV_APP_USER}'
  ) AS app_no_membership,
  NOT pg_has_role('${DEV_APP_USER}', '${DEV_OWNER_ROLE}', 'SET') AS app_cannot_set_owner,
  NOT pg_has_role('${DEV_APP_USER}', '${DEV_MIGRATOR_USER}', 'SET') AS app_cannot_set_migrator,
  NOT has_table_privilege('${DEV_APP_USER}', 'app.schema_migrations', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS ledger_no_app_acl,
  NOT has_table_privilege('${DEV_MIGRATOR_USER}', 'app.schema_migrations', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS ledger_no_migrator_acl,
  NOT EXISTS (
    SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace,
           aclexplode(c.relacl) a
     WHERE n.nspname = 'app' AND c.relname = 'schema_migrations' AND a.grantee = 0
  ) AS ledger_no_public_acl,
  NOT has_schema_privilege('${DEV_APP_USER}', 'app', 'CREATE') AS app_no_schema_create`;

// Identidade de sessao: usado por A (antes e depois do SET ROLE), B e C.
export const IDENTITY_SQL = `SELECT ${IDENTITY_COLUMNS}`;

// A/C: ledger. Depende de SET ROLE owner; o migrator nao tem ACL direta sobre ele.
export const PRIVILEGED_LEDGER_GUARD_SQL = `
  SELECT (SELECT array_agg(migration_id || '=' || checksum_sha256 ORDER BY migration_id)
            FROM app.schema_migrations) AS ledger`;

// A/C: estrutura completa, incluindo as tabelas de negocio e o ledger (existencia verificada pelo owner).
export const PRIVILEGED_STRUCTURE_GUARD_SQL = `SELECT ${STRUCTURE_COLUMNS}`;

// A/C: privilegios do app_role e seguranca do modelo de SET ROLE.
export const PRIVILEGED_PRIVILEGES_SQL = `SELECT ${APP_PRIVILEGE_COLUMNS}, ${SECURITY_COLUMNS}`;

// B: unico guard do bootstrap. Identidade + estrutura observavel (sem ledger) + privilegios do app.
export const RUNTIME_BOOTSTRAP_GUARD_SQL = `SELECT ${IDENTITY_COLUMNS}, ${STRUCTURE_COLUMNS}, ${APP_PRIVILEGE_COLUMNS}`;

// Leitura de TODAS as linhas de admin, sem expor hash: apenas se o formato bate.
export const ADMIN_ROWS_SQL = `
  SELECT id_usuario_admin, nome_usuario, email_usuario, perfil_usuario, ativo, protegido,
         (senha_hash ~ '^[0-9a-f]{128}$' AND senha_salt ~ '^[0-9a-f]{32}$') AS hash_format_ok
    FROM app.tab_usuario_admin
   ORDER BY id_usuario_admin
`;

// Lock EXCLUSIVE: bloqueia outras escritas e outro bootstrap concorrente, mas nao bloqueia SELECT
// comum (ACCESS SHARE). Como o lock e adquirido ANTES da contagem, a segunda execucao so le
// tab_usuario_admin depois do COMMIT da primeira, enxerga 1 registro e aborta.
export const BOOTSTRAP_LOCK_SQL = 'LOCK TABLE app.tab_usuario_admin IN EXCLUSIVE MODE';

// Somente 5 parametros: o perfil e fixado em SUPER_ADMIN no SQL, nunca vem da entrada.
export const BOOTSTRAP_INSERT_SQL = `
  INSERT INTO app.tab_usuario_admin (
    id_usuario_admin, nome_usuario, email_usuario, senha_hash, senha_salt,
    perfil_usuario, ativo, protegido
  ) VALUES ($1, $2, $3, $4, $5, 'SUPER_ADMIN', true, true)
  RETURNING id_usuario_admin, nome_usuario, email_usuario, perfil_usuario, ativo, protegido
`;
