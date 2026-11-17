# SaaS multi-estabelecimento — Fase 1

Fundação adicionativa sobre o sistema atual. A loja **Amanteigados Lívia** permanece a empresa padrão; URLs e fluxo de pedido não mudam.

## O que entrou

- `public.tab_empresa` + `public.tab_empresa_tema` (SQL Editor não tem CREATE em `app`)
- Seed fixo: slug `amanteigados-livia`, id `a0000000-0000-4000-8000-000000000001`
- `id_empresa` em `public.tab_pedido_numero` (nullable + backfill)
- `GET /api/empresa` (tema público; fallback hardcoded se schema ausente)
- `GET|POST /api/admin/empresa` (tema + switcher SUPER_ADMIN)
- Storefront aplica tema via `storefront-theme.js` sem alterar a estrutura do pedido

## Migration (SQL Editor)

Arquivo: `backend/database/migrations/0009_adicionar_empresa_saas.sql`

Rodar **este** arquivo no SQL Editor do Supabase (PROD/HML). Ele usa só `public.*`, no mesmo padrão da `0008`.

Opcional (Migrator/Owner, **não** SQL Editor): `0009b_empresa_id_em_app_DRAFT.sql` adiciona `id_empresa` nas tabelas `app.*`.

Sem a `0009`, a API/admin continuam com o fallback da loja atual.

## Próximas fases (não nesta entrega)

- Unique composto `(id_empresa, slug_*)` e `NOT NULL`
- Subdomínio automático / onboarding self-serve
- Upload dedicado e numeração de pedido por empresa
