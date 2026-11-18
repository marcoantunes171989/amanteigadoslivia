-- 0012c: Amanteigados Lívia no subdomínio pedidoprime; cardápio.* fica só a landing.
UPDATE public.tab_empresa
SET dominio = 'amanteigadoslivia.pedidoprime.com.br', data_atualizacao = now()
WHERE slug = 'amanteigados-livia';

SELECT slug, dominio, nome_fantasia, ativo
FROM public.tab_empresa
ORDER BY slug;
