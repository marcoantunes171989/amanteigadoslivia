# Mapa Persistente do Projeto — Amanteigados Lívia

> Documento de controle arquitetural. Não altera comportamento do site,
> do backend ou do banco de dados. Registra o estado aprovado do projeto
> por ambiente e a política de evolução DEV-first. Complementa
> `docs/catalog-homologation.md` (homologação comercial de catálogo),
> `docs/cart-spec.md` e `docs/catalog-spec.md` (especificações de
> produto/frontend) sem duplicá-los.

**Fase ativa: 5.0D.6B** — Especificação formal DEV-first de schema,
privilégios, migrations e fluxo de releases.

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

## 2. Fase ativa

**5.0D.6B** — Documentar (sem executar) o modelo de schema `app`, o
modelo de privilégios Owner/Migrator/Runtime APP, a estratégia DEV-first
de criação de schema, `search_path`, `DEFAULT PRIVILEGES`, o futuro
framework de migrations, a política de dados entre ambientes e os
requisitos do futuro painel "Ambientes & Releases".

Ver `docs/database/SCHEMA_SECURITY_SPEC.md` para o detalhamento completo.

## 3. Próximos gates

| Gate | Descrição | Pré-requisito |
|---|---|---|
| G1 | Revisão por Cursor (segundo agente) da documentação desta fase | Fase 5.0D.6B fechada por Claude Code, sem commit |
| G2 | Auditoria por ChatGPT (arquiteto/auditor independente) | G1 concluído |
| G3 | Execução real da criação do schema `app` em DEV (fora do escopo desta fase — apenas planejada em `SCHEMA_SECURITY_SPEC.md`, seção "Estratégia DEV-first") | G1 + G2 aprovados |
| G4 | Promoção do schema homologado em DEV para HOMOLOG | G3 aprovado + homologação comercial de catálogo (bloqueio independente, ver `docs/catalog-homologation.md`) |
| G5 | Promoção HOMOLOG → PROD via fluxo de release (`DRAFT → READY_FOR_HOMOLOG → HOMOLOGATED → PUBLISHED`) | G4 aprovado, gate explícito de produção |

## 4. Ambientes

| Ambiente | Banco | Estado atual |
|---|---|---|
| DEV | PostgreSQL local | Roles owner/migrator/app existentes; pool `max=5`; `/health` e `/ready` implementados; schema `app` **ainda não criado** |
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
| Database | Em especificação | Schema `app` documentado nesta fase; criação real ainda não executada |
| Admin (painel administrativo) | Não iniciado | Depende do schema `app` e do modelo de releases |
| Releases (painel "Ambientes & Releases") | Não iniciado | Requisitos documentados nesta fase em `SCHEMA_SECURITY_SPEC.md`, seção "Painel Ambientes & Releases" |

## 6. Percentuais atuais

| Ambiente | Percentual |
|---|---|
| DEV | 57% |
| HOMOLOG | 52% |
| PROD | 30% |

**Sobre o percentual de PROD (30%):** este valor representa o
progresso geral do ambiente/projeto — incluindo o frontend já existente
e publicado — e **não** significa que o banco/schema PROD esteja
provisionado. O banco/schema PROD permanece bloqueado, aguardando o
fluxo `DEV → HOMOLOG → aprovação` (ver seção 3, gates G3–G5, e
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
  seção 3, gate G5).
- Segredos nunca podem ir para Git, prompt, log ou documentação.
- `.env` permanece local e ignorado (`backend/.env`, ver `.gitignore`).

---

*Documento de controle. Atualizar a cada fase concluída ou gate
alcançado. Não é fonte de verdade para segredos, credenciais ou dados
operacionais — apenas para estado arquitetural e de fase.*
