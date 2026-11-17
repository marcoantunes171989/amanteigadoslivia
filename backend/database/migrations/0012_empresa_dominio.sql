-- 0012: domínio próprio por empresa (public)
-- SQL Editor, query NOVA.

ALTER TABLE public.tab_empresa
  ADD COLUMN IF NOT EXISTS dominio text;

-- Unique parcial: só domínios preenchidos
CREATE UNIQUE INDEX IF NOT EXISTS tab_empresa_dominio_unq
  ON public.tab_empresa (lower(dominio))
  WHERE dominio IS NOT NULL AND btrim(dominio) <> '';

-- Demo: domínios das lojas de teste (ajuste depois para DNS real)
UPDATE public.tab_empresa
SET dominio = 'www.doceaurora.com.br', data_atualizacao = now()
WHERE id_empresa = 'b1000000-0000-4000-8000-000000000001'
  AND (dominio IS NULL OR btrim(dominio) = '');

UPDATE public.tab_empresa
SET dominio = 'www.padarianorte.com.br', data_atualizacao = now()
WHERE id_empresa = 'b2000000-0000-4000-8000-000000000002'
  AND (dominio IS NULL OR btrim(dominio) = '');

UPDATE public.tab_empresa
SET dominio = 'amanteigadoslivia.vercel.app', data_atualizacao = now()
WHERE id_empresa = 'a0000000-0000-4000-8000-000000000001'
  AND (dominio IS NULL OR btrim(dominio) = '');

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tab_empresa TO amanteigados_prod_app;

SELECT slug, dominio, nome_fantasia, ativo
FROM public.tab_empresa
ORDER BY slug;
