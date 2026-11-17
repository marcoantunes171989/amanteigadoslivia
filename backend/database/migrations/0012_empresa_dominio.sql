-- 0012: domínio próprio por empresa (public)
-- SQL Editor, query NOVA.
-- Depois: aponte DNS (CNAME) desses hosts para cname.vercel-dns.com
-- e adicione o domínio no projeto Vercel amanteigadoslivia.

ALTER TABLE public.tab_empresa
  ADD COLUMN IF NOT EXISTS dominio text;

CREATE UNIQUE INDEX IF NOT EXISTS tab_empresa_dominio_unq
  ON public.tab_empresa (lower(dominio))
  WHERE dominio IS NOT NULL AND btrim(dominio) <> '';

-- Domínios reais sob pedidoprime.com.br (já na conta Vercel)
UPDATE public.tab_empresa
SET dominio = 'doce-aurora.pedidoprime.com.br', data_atualizacao = now()
WHERE id_empresa = 'b1000000-0000-4000-8000-000000000001';

UPDATE public.tab_empresa
SET dominio = 'padaria-norte.pedidoprime.com.br', data_atualizacao = now()
WHERE id_empresa = 'b2000000-0000-4000-8000-000000000002';

UPDATE public.tab_empresa
SET dominio = 'amanteigadoslivia.vercel.app', data_atualizacao = now()
WHERE id_empresa = 'a0000000-0000-4000-8000-000000000001';

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tab_empresa TO amanteigados_prod_app;

SELECT slug, dominio, nome_fantasia, ativo
FROM public.tab_empresa
ORDER BY slug;
