-- 0010c: GRANT das tabelas SaaS para o mesmo role que já escreve em app.tab_produto
-- SQL Editor, query NOVA.

DO $$
DECLARE
  r record;
  t text;
  tables text[] := ARRAY[
    'tab_empresa',
    'tab_empresa_tema',
    'tab_usuario_empresa',
    'tab_categoria_empresa',
    'tab_produto_empresa',
    'tab_venda_empresa'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE 'tabela ausente: %', t;
      CONTINUE;
    END;

    FOR r IN
      SELECT DISTINCT grantee::text AS grantee
      FROM information_schema.role_table_grants
      WHERE table_schema = 'app'
        AND table_name = 'tab_produto'
        AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
        AND grantee::text NOT IN ('PUBLIC')
    LOOP
      BEGIN
        EXECUTE format(
          'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO %I',
          t, r.grantee
        );
      EXCEPTION WHEN undefined_object OR insufficient_privilege THEN
        RAISE NOTICE 'grant falhou % -> %', t, r.grantee;
      END;
    END LOOP;

    -- Fallbacks conhecidos
    BEGIN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO amanteigados_prod_app', t);
    EXCEPTION WHEN undefined_object OR insufficient_privilege THEN
      NULL;
    END;
    BEGIN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO amanteigados_homolog_app', t);
    EXCEPTION WHEN undefined_object OR insufficient_privilege THEN
      NULL;
    END;
  END LOOP;
END $$;

-- Conferência
SELECT table_name, grantee, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN (
    'tab_empresa', 'tab_empresa_tema',
    'tab_usuario_empresa', 'tab_categoria_empresa',
    'tab_produto_empresa', 'tab_venda_empresa'
  )
GROUP BY table_name, grantee
ORDER BY table_name, grantee;
