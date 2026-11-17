-- 0010c: garante GRANT dos vínculos + tipografia para o role da API
-- SQL Editor, query NOVA.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tab_usuario_empresa TO amanteigados_prod_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tab_categoria_empresa TO amanteigados_prod_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tab_produto_empresa TO amanteigados_prod_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tab_venda_empresa TO amanteigados_prod_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tab_empresa TO amanteigados_prod_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tab_empresa_tema TO amanteigados_prod_app;

ALTER TABLE public.tab_usuario_empresa DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tab_categoria_empresa DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tab_produto_empresa DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tab_venda_empresa DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tab_empresa DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tab_empresa_tema DISABLE ROW LEVEL SECURITY;
