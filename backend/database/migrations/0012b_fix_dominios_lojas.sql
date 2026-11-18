-- 0012b: corrige domínio de cada loja (query NOVA)
UPDATE public.tab_empresa
SET dominio = 'doce-aurora.pedidoprime.com.br', data_atualizacao = now()
WHERE slug = 'doce-aurora';

UPDATE public.tab_empresa
SET dominio = 'padaria-norte.pedidoprime.com.br', data_atualizacao = now()
WHERE slug = 'padaria-norte';

UPDATE public.tab_empresa
SET dominio = 'amanteigadoslivia.pedidoprime.com.br', data_atualizacao = now()
WHERE slug = 'amanteigados-livia';

SELECT slug, dominio, nome_fantasia FROM public.tab_empresa ORDER BY slug;
