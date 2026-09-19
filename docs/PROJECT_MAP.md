# Mapa Persistente do Projeto — Amanteigados Lívia

> Documento de controle arquitetural. Não altera comportamento do site,
> do backend ou do banco de dados. Registra o estado aprovado do projeto
> por ambiente e a política de evolução DEV-first. Complementa
> `docs/catalog-homologation.md` (homologação comercial de catálogo),
> `docs/cart-spec.md` e `docs/catalog-spec.md` (especificações de
> produto/frontend) sem duplicá-los.

**Fase ativa: FAST-TRACK HOMOLOG CATÁLOGO** — primeiro ambiente
funcional em HOMOLOG (Vercel `homologacao` + Supabase
`amanteigados-livia-homolog`). A 0002 (`0002_criar_nucleo_catalogo`)
permanece versionada e **imutável** após esta revisão R2. Artefato de
carga: `backend/database/releases/0001_catalogo_inicial.sql`. API:
`GET /api/catalogo` (server-side `DATABASE_URL`, role Runtime APP).
PROD (`amanteigados-livia-prod`) permanece bloqueado.

---

## 1. Histórico de fases e status

| Fase | Escopo | Status |
|---|---|---|
| 2.x | Landing page fiel à referência (HTML/CSS/JS estático) | Concluída |
| 3.x | Especificação e homologação de catálogo (`docs/catalog-spec.md`, `docs/catalog-homologation.md`) | Catálogo em modo demo; homologação comercial real ainda **PENDENTE** |
| 4.x | Especificação de carrinho (`docs/cart-spec.md`) | Concluída |
| 5.0D.1 | Fundação da API local (Node.js + Express) | Concluída |
| 5.0D.2 | Validação de configuração de runtime (`backend/src/config.js`) | Concluída |
| 5.0D.3 | Pool PostgreSQL seguro em DEV (`backend/src/database.js`, `max=5`) | Concluída |
| 5.0D.4 | Monitoramento de prontidão (`/health`, `/ready`, `backend/src/readiness.js`) | Concluída |
| 5.0D.5 | Provisionamento HOMOLOG (Supabase, roles owner/migrator/app, TLS, SCRAM-SHA-256) | Concluída — nenhum objeto de negócio criado ainda |
| 5.0D.6A | Hardening de `.gitignore` para segredos locais | Concluída |
| 5.0D.6B | Especificação formal DEV-first de schema, privilégios, migrations e releases (`docs/database/SCHEMA_SECURITY_SPEC.md`) | Concluída |
| 5.0D.6C | Bootstrap administrativo do schema `app` em DEV (`backend/database/bootstrap/001-003`) — auditado e aprovado | Concluída — **executado e auditado em DEV** (scripts 001→002→003, nesta ordem, exit code 0; POSTCHECK DEV aprovado); schema `app` existe em `amanteigados_dev`, owner `amanteigados_dev_owner` |
| 5.0D.6D | `search_path` por database do schema `app` em DEV (`backend/database/config/001_admin_set_search_path.sql`) para Owner/Migrator/Runtime APP | Concluída — **executado e auditado em DEV**; `search_path = app, pg_catalog` confirmado POR DATABASE para as três roles |
| 5.0D.6E | `DEFAULT PRIVILEGES` de FUNCTIONS para `owner_role` em DEV (`backend/database/config/002_owner_default_privileges.sql`), escopo global ao database | Concluída — **executado e auditado em DEV**; `owner_role` com exatamente 1 entrada `pg_default_acl` (global, FUNCTIONS, `PUBLIC` sem `EXECUTE`); zero default ACL de TABLES/SEQUENCES; `migrator_role`/`app_role` com zero `pg_default_acl` |
| 5.0D.6F | Grants de runtime para `app_role` em DEV (`backend/database/config/003_runtime_app_grants.sql`) | Concluída — **CONCLUÍDO/AUDITADO EM DEV**; APP schema USAGE=true, CREATE=false; DB CREATE=false; TABLES futuras SELECT/INSERT/UPDATE/DELETE; SEQUENCES futuras USAGE; sem grant option; sem EXECUTE automático em FUNCTIONS; APP sem membership/SET ROLE Owner/Migrator; `search_path = app, pg_catalog`; schema `app` vazio; 003 **não** deve ser reexecutado em DEV |
| 5.0D.6G | Framework de migrations PostgreSQL (`backend/database/migrations/`, ledger `app.schema_migrations`, spec `docs/database/MIGRATION_FRAMEWORK_SPEC.md`) | Concluída — **CONCLUÍDO / EXECUTADO / AUDITADO EM DEV**; `0001_create_migration_ledger` aplicada (checksum `bb018fc0c74c17d8ee072fb0c0711d60ead28ce587c47e2bc1bc7dd0664991c0`); `app.schema_migrations` existe, owner `amanteigados_dev_owner`, exatamente 1 registro; `applied_by_login` = `amanteigados_dev_migrator`; `applied_as_role` = `amanteigados_dev_owner`; `database_name` = `amanteigados_dev`; APP com zero privilege efetivo no ledger; Migrator com zero ACL direta; PUBLIC com zero ACL direta; default privileges 5.0D.6F intactos; `search_path` intacto; DB CREATE=false nas 3 roles; memberships intactas; schema `app` somente `schema_migrations` como relation; routines = 0; sequences = 0; 0001 **não** deve ser reexecutada em DEV (histórica/imutável; ajuste futuro só por forward-fix) |
| 5.0D.6H | Business migrations / catalog model | 0002 versionada (`0002_criar_nucleo_catalogo`); nomenclatura PT (`app.tab_*`); release `0001_catalogo_inicial`; API `GET /api/catalogo`; HOMOLOG é o destino oficial; PROD bloqueado |
| FAST-TRACK HML | Primeiro ambiente funcional HOMOLOG | Em execução — Vercel `homologacao` + Supabase `amanteigados-livia-homolog`; PROD não publicado |

## 2. Fase ativa

**FAST-TRACK HOMOLOG CATÁLOGO** — colocar o cardápio funcionando na
Vercel HOMOLOG com banco Supabase HOMOLOG.

- DEV = laboratório
- HOMOLOG = validação oficial
- PROD = cliente/público (não publicar nesta fase)

Fluxo: `DEV → GitHub → Vercel HOMOLOG → Supabase HOMOLOG → teste/aprovação → Vercel PROD + Supabase PROD`.

Artefatos:

- `backend/database/migrations/0002_criar_nucleo_catalogo.sql` (SHA256
  `c745487eb9aa1af4d20add5a1f6a6600ed12780382303ed621794941626f4161`)
- `backend/database/releases/0001_catalogo_inicial.sql`
- `GET /api/catalogo` (`api/catalogo.js` na Vercel; Express em `backend/src/app.js`)
- Frontend `/produtos` e `/carrinho` consomem a API; sem fallback fake

A 0001 permanece imutável (`bb018fc0c74c17d8ee072fb0c0711d60ead28ce587c47e2bc1bc7dd0664991c0`).
A 0002 **não** é reexecutável. PROD permanece bloqueado.

## 3. Próximos gates

### Concluído

- 5.0D.6B — especificação/documentação formal DEV-first (`docs/database/SCHEMA_SECURITY_SPEC.md`), concluída e commitada
- 5.0D.6C — bootstrap administrativo do schema `app` versionado (`backend/database/bootstrap/001-003`)
- Scripts `001_admin_prepare_app_schema.sql` → `002_migrator_create_app_schema.sql` → `003_admin_finalize_app_schema.sql` executados em DEV, nesta ordem, todos com exit code 0
- POSTCHECK DEV aprovado
- Schema `app` **existe** em `amanteigados_dev`, owner `amanteigados_dev_owner`, auditado (vazio, zero relations/routines)
- 5.0D.6D — artefato de `search_path` por database (`backend/database/config/001_admin_set_search_path.sql`) para Owner/Migrator/Runtime APP
- `search_path` **executado e auditado** em DEV: `app, pg_catalog` confirmado para as três roles
- 5.0D.6E — artefato de `DEFAULT PRIVILEGES` de FUNCTIONS (`backend/database/config/002_owner_default_privileges.sql`), sob identidade Owner
- `DEFAULT PRIVILEGES` **executado e auditado** em DEV: `owner_role` com exatamente 1 entrada `pg_default_acl` (global, FUNCTIONS, `PUBLIC` sem `EXECUTE`); zero default ACL de TABLES/SEQUENCES; `migrator_role`/`app_role` com zero `pg_default_acl`
- 5.0D.6F — artefato de grants de runtime (`backend/database/config/003_runtime_app_grants.sql`), sob identidade Owner
- 5.0D.6F **CONCLUÍDO/AUDITADO EM DEV**: APP schema USAGE=true, CREATE=false; DB CREATE=false; TABLES futuras SELECT/INSERT/UPDATE/DELETE; SEQUENCES futuras USAGE; sem grant option; sem EXECUTE automático em FUNCTIONS; APP sem membership/SET ROLE Owner/Migrator; `search_path = app, pg_catalog`; schema `app` vazio
- Tentativa autenticada posterior do `003` abortou em pré-condição (APP já possuía USAGE); não chegou a `SET ROLE`, `GRANT`, `ALTER DEFAULT PRIVILEGES` ou `COMMIT`
- Diagnóstico read-only posterior confirmou o estado final completo já presente; `003` **não** deve ser reexecutado em DEV
- 5.0D.6G — artefatos do framework de migrations (`backend/database/migrations/`, `docs/database/MIGRATION_FRAMEWORK_SPEC.md`)
- 5.0D.6G **CONCLUÍDO / EXECUTADO / AUDITADO EM DEV**: `0001_create_migration_ledger` aplicada (checksum `bb018fc0c74c17d8ee072fb0c0711d60ead28ce587c47e2bc1bc7dd0664991c0`); `app.schema_migrations` existe, owner `amanteigados_dev_owner`, exatamente 1 registro; `applied_by_login` = `amanteigados_dev_migrator`; `applied_as_role` = `amanteigados_dev_owner`; `database_name` = `amanteigados_dev`; APP com zero privilege efetivo no ledger; Migrator com zero ACL direta; PUBLIC com zero ACL direta; default privileges 5.0D.6F intactos; `search_path` intacto; DB CREATE=false nas 3 roles; memberships intactas; schema `app` somente `schema_migrations` como relation; routines = 0; sequences = 0
- A migration 0001 **não** deve ser reexecutada em DEV — migration histórica aplicada e imutável; qualquer ajuste futuro deve ser feito por nova migration forward-fix

### Fase atual

- FAST-TRACK HOMOLOG CATÁLOGO
- 0002 pronta para primeira aplicação oficial em HOMOLOG
- Release versionado: `backend/database/releases/0001_catalogo_inicial.sql`
- API: `GET /api/catalogo` com `DATABASE_URL` server-side
- Frontend consome a API; sem fallback fake
- HOMOLOG = validação oficial; PROD permanece **bloqueado**
- `003_runtime_app_grants.sql` **não** deve ser reexecutado em DEV
- `0001_create_migration_ledger` **não** deve ser reexecutada em DEV

### Próximos gates

| Gate | Descrição | Pré-requisito |
|---|---|---|
| 1 | 5.0D.6H BUSINESS MIGRATIONS / CATALOG MODEL - DRAFT (0002 **DRAFT / NÃO executada**) | Fase 5.0D.6G concluída/executada/auditada em DEV; 0001 histórica/imutável |
| 2 | Promoção do schema homologado em DEV para HOMOLOG (`amanteigados-livia-homolog`, destino oficial de validação; somente após DEV completo; 0002 ainda **não executada**) | Gate 1 aprovado + homologação comercial de catálogo (bloqueio independente, ver `docs/catalog-homologation.md`) |
| 3 | Promoção HOMOLOG → PROD (`amanteigados-livia-prod`) via fluxo de release (`DRAFT → READY_FOR_HOMOLOG → HOMOLOGATED → PUBLISHED`), somente após aprovação humana explícita | Gate 2 aprovado, gate explícito de produção |

## 4. Ambientes

| Ambiente | Banco | Estado atual |
|---|---|---|
| DEV | PostgreSQL local | Roles owner/migrator/app existentes; pool `max=5`; `/health` e `/ready` implementados; schema `app` **existe** (bootstrap 5.0D.6C executado e auditado; owner `amanteigados_dev_owner`); `search_path` por database **executado e auditado** (5.0D.6D, `app, pg_catalog` para as três roles); `DEFAULT PRIVILEGES` de `owner_role` (FUNCTIONS, escopo global ao database) **executado e auditado** (5.0D.6E); grants de runtime para `app_role` **CONCLUÍDOS/AUDITADOS** (5.0D.6F): USAGE=true, CREATE=false, DB CREATE=false, TABLES futuras SELECT/INSERT/UPDATE/DELETE, SEQUENCES futuras USAGE, sem grant option, sem EXECUTE automático em FUNCTIONS, APP sem membership/SET ROLE Owner/Migrator; `003` **não** deve ser reexecutado em DEV; 5.0D.6G MIGRATION FRAMEWORK **CONCLUÍDO / EXECUTADO / AUDITADO EM DEV**: `0001_create_migration_ledger` aplicada (checksum `bb018fc0c74c17d8ee072fb0c0711d60ead28ce587c47e2bc1bc7dd0664991c0`); `app.schema_migrations` existe, owner `amanteigados_dev_owner`, exatamente 1 registro (`applied_by_login` = `amanteigados_dev_migrator`, `applied_as_role` = `amanteigados_dev_owner`, `database_name` = `amanteigados_dev`); APP com zero privilege efetivo no ledger; Migrator/PUBLIC com zero ACL direta; default privileges 5.0D.6F intactos; `search_path` intacto; DB CREATE=false nas 3 roles; memberships intactas; schema `app` somente `schema_migrations` como relation; routines = 0; sequences = 0; 0001 **não** deve ser reexecutada em DEV; 5.0D.6H BUSINESS MIGRATIONS / CATALOG MODEL - DRAFT (0002 `0002_criar_nucleo_catalogo` **DRAFT / NÃO executada**); HOMOLOG (`amanteigados-livia-homolog`) destino oficial de validação; PROD (`amanteigados-livia-prod`) bloqueado até aprovação humana |
| HOMOLOG | Supabase `amanteigados-livia-homolog` (Session Pooler 5432, TLS) | Destino oficial de validação. `amanteigados_homolog_owner` (NOLOGIN), `amanteigados_homolog_migrator` (SCRAM-SHA-256, login validado, `SET ROLE` owner validado), `amanteigados_homolog_app` (SCRAM-SHA-256, login validado, sem `SET ROLE` privilegiado, sem DDL); `public` sem tabelas de negócio; nenhum objeto de negócio criado; 0002 **não executada** |
| PROD | Supabase `amanteigados-livia-prod` | Bloqueado até aprovação humana. Nomes de role equivalentes previstos, **não criados nesta fase**; 0002 **não executada** |

### Política DEV-first

Todo novo desenvolvimento de schema, migrations, backend, regras de
negócio, painel administrativo e testes segue obrigatoriamente:

```
DEV → HOMOLOG → aprovação → PROD
```

Schema e migrations nunca são desenvolvidos primeiro em HOMOLOG. Somente
artefatos versionados e aprovados em DEV são promovidos para HOMOLOG;
somente artefatos homologados em HOMOLOG são promovidos para PROD.

**O que é promovido entre ambientes:**

- Código
- Schema
- Migrations
- Releases
- `APP VERSION`, `SCHEMA VERSION`, `CATALOG VERSION`, `RELEASE VERSION`
- Seeds versionados, quando necessários

**O que NÃO é promovido automaticamente:**

- Clientes
- Pedidos
- Dados operacionais
- Dados de teste
- Dumps completos de banco

Seeds são artefatos versionados no Git, **nunca** representam cópia do
banco operacional, e devem ser idempotentes (ou possuir estratégia
equivalente). Ver `docs/database/SCHEMA_SECURITY_SPEC.md`, seção
"Promoção entre ambientes".

## 5. Status por área

| Área | Status | Observação |
|---|---|---|
| Frontend | Estável | Landing + `/produtos` + `/carrinho`; catálogo via `GET /api/catalogo` |
| Backend | HOMOLOG catalog API | Express `/api/catalogo` + função Vercel `api/catalogo.js`; `DATABASE_URL` server-side |
| Database | 0002 + release inicial prontos para HOMOLOG | Núcleo `app.tab_*`; carga `releases/0001_catalogo_inicial.sql`; PROD bloqueado |
| Admin (painel administrativo) | Não iniciado | Depende do schema `app` e do modelo de releases |
| Releases (painel "Ambientes & Releases") | Não iniciado | Requisitos documentados nesta fase em `SCHEMA_SECURITY_SPEC.md`, seção "Painel Ambientes & Releases" |

## 6. Percentuais atuais

| Ambiente | Percentual |
|---|---|
| DEV | 64% |
| HOMOLOG | 52% |
| PROD | 30% |

**Sobre o percentual de PROD (30%):** este valor representa o
progresso geral do ambiente/projeto — incluindo o frontend já existente
e publicado — e **não** significa que o banco/schema PROD esteja
provisionado. O banco/schema PROD permanece bloqueado, aguardando o
fluxo `DEV → HOMOLOG → aprovação` (ver seção 3, gate 3, e
`docs/database/SCHEMA_SECURITY_SPEC.md`, seção "Promoção entre
ambientes").

## 7. Governança dos agentes

| Agente | Papel padrão |
|---|---|
| Claude Code | Executa desenvolvimento, alterações e testes quando designado |
| Cursor | Executa desenvolvimento ou revisão quando designado |
| ChatGPT | Arquiteto e auditor independente |

Regras:

- Claude Code e Cursor **nunca** editam simultaneamente os mesmos arquivos.
- Padrão de fluxo: Claude implementa e fecha → Cursor revisa → ChatGPT audita.
- Se Claude estiver indisponível, Cursor pode assumir a tarefa.
- Se Cursor estiver indisponível, Claude executa e ChatGPT audita.
- Todo prompt de tarefa deve iniciar com `PROJETO: AMANTEIGADOS LIVIA`.
- Qualquer mudança de produção exige gate e aprovação explícita (ver
  seção 3, gate 3).
- Segredos nunca podem ir para Git, prompt, log ou documentação.
- `.env` permanece local e ignorado (`backend/.env`, ver `.gitignore`).

---

*Documento de controle. Atualizar a cada fase concluída ou gate
alcançado. Não é fonte de verdade para segredos, credenciais ou dados
operacionais — apenas para estado arquitetural e de fase.*
