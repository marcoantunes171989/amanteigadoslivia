# SaaS multi-estabelecimento — Fase 1

Fundação adicionativa sobre o sistema atual. A loja **Amanteigados Lívia** permanece a empresa padrão; URLs e fluxo de pedido não mudam.

## O que entrou

- `app.tab_empresa` + `app.tab_empresa_tema`
- Seed fixo: slug `amanteigados-livia`, id `a0000000-0000-4000-8000-000000000001`
- Colunas `id_empresa` **nullable** + backfill na empresa padrão
- `GET /api/empresa` (tema público; fallback hardcoded se schema ausente)
- `GET|POST /api/admin/empresa` (tema + switcher SUPER_ADMIN)
- Storefront aplica tema via `storefront-theme.js` sem alterar a estrutura do pedido

## Migration

Arquivo: `backend/database/migrations/0009_adicionar_empresa_saas.sql`

Executar no SQL Editor (Owner) em HML/PROD quando for ativar o schema SaaS. Sem a migration, a API pública e o admin continuam com o fallback da loja atual.

## Próximas fases (não nesta entrega)

- Unique composto `(id_empresa, slug_*)` e `NOT NULL`
- Subdomínio automático / onboarding self-serve
- Upload dedicado e numeração de pedido por empresa
