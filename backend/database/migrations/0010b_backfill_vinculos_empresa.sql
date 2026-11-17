-- 0010b: só backfill dos vínculos (rode se o catálogo ficou vazio após a 0010)
-- SQL Editor, query NOVA. Idempotente.

INSERT INTO public.tab_usuario_empresa (id_usuario_admin, id_empresa)
SELECT u.id_usuario_admin, 'a0000000-0000-4000-8000-000000000001'
FROM app.tab_usuario_admin u
ON CONFLICT (id_usuario_admin) DO NOTHING;

INSERT INTO public.tab_categoria_empresa (id_categoria, id_empresa)
SELECT c.id_categoria, 'a0000000-0000-4000-8000-000000000001'
FROM app.tab_categoria c
ON CONFLICT (id_categoria) DO NOTHING;

INSERT INTO public.tab_produto_empresa (id_produto, id_empresa)
SELECT p.id_produto, 'a0000000-0000-4000-8000-000000000001'
FROM app.tab_produto p
ON CONFLICT (id_produto) DO NOTHING;

INSERT INTO public.tab_venda_empresa (id_venda, id_empresa)
SELECT v.id_venda, 'a0000000-0000-4000-8000-000000000001'
FROM app.tab_venda v
ON CONFLICT (id_venda) DO NOTHING;

-- Conferência
SELECT 'usuario' AS vinculo, count(*)::int AS qtd FROM public.tab_usuario_empresa
UNION ALL SELECT 'categoria', count(*)::int FROM public.tab_categoria_empresa
UNION ALL SELECT 'produto', count(*)::int FROM public.tab_produto_empresa
UNION ALL SELECT 'venda', count(*)::int FROM public.tab_venda_empresa;
