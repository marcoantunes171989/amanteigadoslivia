# Mapa Persistente do Projeto — Amanteigados Lívia

> Documento de controle arquitetural. Não altera comportamento do site,
> do backend ou do banco de dados. Registra o estado aprovado do projeto
> por ambiente e a política de evolução DEV-first. Complementa
> `docs/catalog-homologation.md` (homologação comercial de catálogo),
> `docs/cart-spec.md` e `docs/catalog-spec.md` (especificações de
> produto/frontend) sem duplicá-los.

**Fase ativa: 5.0D.6D-DEV-SEARCH-PATH-DRAFT** — Artefato SQL de
`search_path` por database para o schema `app` em DEV, em DRAFT (ver
seção 2).

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

## 2. Fase ativa

**5.0D.6D-DEV-SEARCH-PATH-DRAFT** — Checkpoint Git atual (fase 5.0D.6C
fechada): `ecbb05d4b717b74c5d509911210724f96c5c9b64`, branch
`dev/backend-admin-local`. Bootstrap administrativo do schema `app` em
DEV (5.0D.6C) **executado e auditado**: scripts
`001_admin_prepare_app_schema.sql` → `002_migrator_create_app_schema.sql`
→ `003_admin_finalize_app_schema.sql` executados nesta ordem no database
`amanteigados_dev`, todos com exit code 0; POSTCHECK DEV aprovado.
Schema `app` **existe** em `amanteigados_dev`, owner
`amanteigados_dev_owner`, vazio (zero relations/routines). Fase atual:
artefato SQL de `search_path` POR DATABASE
(`backend/database/config/001_admin_set_search_path.sql`) para
Owner/Migrator/Runtime APP, em **DRAFT** — criado, **ainda não
executado** em nenhum ambiente. `DEFAULT PRIVILEGES`, grants de
runtime, framework de migrations e HOMOLOG/PROD permanecem bloqueados
(ver `docs/database/SCHEMA_SECURITY_SPEC.md`, seções 6 e 7).

## 3. Próximos gates

### Concluído

- 5.0D.6B — especificação/documentação formal DEV-first (`docs/database/SCHEMA_SECURITY_SPEC.md`), concluída e commitada
- 5.0D.6C — bootstrap administrativo do schema `app` versionado (`backend/database/bootstrap/001-003`)
- Scripts `001_admin_prepare_app_schema.sql` → `002_migrator_create_app_schema.sql` → `003_admin_finalize_app_schema.sql` executados em DEV, nesta ordem, todos com exit code 0
- POSTCHECK DEV aprovado
- Schema `app` **existe** em `amanteigados_dev`, owner `amanteigados_dev_owner`, auditado (vazio, zero relations/routines)

### Fase atual

- 5.0D.6D — artefato de `search_path` por database (`backend/database/config/001_admin_set_search_path.sql`) para Owner/Migrator/Runtime APP
- Artefato em **DRAFT**
- Ainda **não executado** em nenhum ambiente

### Próximos gates

| Gate | Descrição | Pré-requisito |
|---|---|---|
| 1 | Finalizar review/gate do artefato de `search_path` | Fase 5.0D.6D em DRAFT |
| 2 | Commit controlado do artefato de `search_path` | Gate 1 aprovado |
| 3 | Review do commit (Cursor/ChatGPT) | Gate 2 concluído |
| 4 | Execução do `search_path` em DEV | Gate 3 aprovado |
| 5 | POSTCHECK em novas sessões das três roles (owner/migrator/app) | Gate 4 executado |
| 6 | `DEFAULT PRIVILEGES` (bloqueado até este gate) | Gate 5 aprovado |
| 7 | Grants de runtime (bloqueado até este gate) | Gate 6 aprovado |
| 8 | Framework de migrations (bloqueado até este gate) | Gate 7 aprovado |
| 9 | Promoção do schema homologado em DEV para HOMOLOG (somente após DEV completo) | Gate 8 aprovado + homologação comercial de catálogo (bloqueio independente, ver `docs/catalog-homologation.md`) |
| 10 | Promoção HOMOLOG → PROD via fluxo de release (`DRAFT → READY_FOR_HOMOLOG → HOMOLOGATED → PUBLISHED`), somente após aprovação humana explícita | Gate 9 aprovado, gate explícito de produção |

## 4. Ambientes

| Ambiente | Banco | Estado atual |
|---|---|---|
| DEV | PostgreSQL local | Roles owner/migrator/app existentes; pool `max=5`; `/health` e `/ready` implementados; schema `app` **existe** (bootstrap 5.0D.6C executado e auditado; owner `amanteigados_dev_owner`; vazio, zero relations/routines); `search_path` por database ainda em **DRAFT** (5.0D.6D), não executado |
| HOMOLOG | Supabase (Session Pooler 5432, TLS) | `amanteigados_homolog_owner` (NOLOGIN), `amanteigados_homolog_migrator` (SCRAM-SHA-256, login validado, `SET ROLE` owner validado), `amanteigados_homolog_app` (SCRAM-SHA-256, login validado, sem `SET ROLE` privilegiado, sem DDL); `public` sem tabelas de negócio; nenhum objeto de negócio criado |
| PROD | Não provisionado | Nomes de role equivalentes previstos, **não criados nesta fase** |

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
| Frontend | Estável | Landing page + `/produtos` + `/carrinho` fiéis à referência; catálogo em modo demo |
| Backend | Em desenvolvimento | Fundação Express + config + pool + readiness prontos; sem rotas de negócio ainda |
| Database | Bootstrap DEV executado e auditado | Schema `app` existe em DEV (owner `amanteigados_dev_owner`), vazio; `search_path` por database em DRAFT (5.0D.6D); `DEFAULT PRIVILEGES`, grants de runtime, migrations e HOMOLOG/PROD permanecem bloqueados |
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
fluxo `DEV → HOMOLOG → aprovação` (ver seção 3, gates 9–10, e
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
  seção 3, gate 10).
- Segredos nunca podem ir para Git, prompt, log ou documentação.
- `.env` permanece local e ignorado (`backend/.env`, ver `.gitignore`).

---

*Documento de controle. Atualizar a cada fase concluída ou gate
alcançado. Não é fonte de verdade para segredos, credenciais ou dados
operacionais — apenas para estado arquitetural e de fase.*
