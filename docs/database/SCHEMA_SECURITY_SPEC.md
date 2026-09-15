# Especificação de Schema e Segurança — Amanteigados Lívia

> Documento de controle arquitetural (Fase 5.0D.6B). **Somente
> especificação — nenhum comando SQL, DDL, `ALTER ROLE` ou
> `ALTER DEFAULT PRIVILEGES` desta fase foi executado.** Nenhum banco
> (DEV, HOMOLOG ou PROD) foi alterado pela criação deste documento.
> Complementa `docs/PROJECT_MAP.md` (estado geral do projeto).

---

## 1. Schema

Nome aprovado: **`app`**.

- Tabelas de negócio da Amanteigados Lívia vivem exclusivamente em `app`.
- `public` **não** contém e não deve conter tabelas de negócio.
- `app` permanece **fora da Supabase Data API** inicialmente (não
  exposto via `postgrest`/`Data API` em HOMOLOG/PROD).
- Frontend **nunca** acessa PostgreSQL diretamente. Fluxo obrigatório:

  ```
  Browser → Node/Express (backend/) → PostgreSQL
  ```

## 2. Ownership por ambiente

| Ambiente | Owner do schema `app` |
|---|---|
| DEV | Role owner DEV já existente no PostgreSQL local (equivalente funcional ao papel Owner descrito na seção 3; nome não repetido aqui por não ser necessário à especificação e por política de segredos) |
| HOMOLOG | `amanteigados_homolog_owner` (já criado, `NOLOGIN`) |
| PROD | Nomes de role equivalentes futuros — **não criados nesta fase** |

## 3. Modelo de privilégios

### Owner

- `NOLOGIN`.
- Dono do schema `app` e de todos os objetos nele criados.
- Nunca é usado para autenticação de aplicação nem de migration runner.
- Migrations são executadas sob a identidade do Owner via `SET ROLE`,
  nunca por login direto.

### Migrator

- `LOGIN` (autenticação real, ex.: SCRAM-SHA-256 em HOMOLOG).
- Sem DDL direto sob sua própria identidade.
- Executa `SET ROLE app_owner`-equivalente explicitamente antes de rodar
  DDL de migration; usa `RESET ROLE` ao final.
- Nunca é usado como runtime de aplicação (não atende requisições HTTP).

### Runtime APP

- `LOGIN` (autenticação real de aplicação).
- **Sem** `SET ROLE` Owner.
- **Sem** `SET ROLE` Migrator.
- **Sem** `CREATE`.
- **Sem** `ALTER`.
- **Sem** `DROP`.
- Futuramente: `USAGE` no schema `app`.
- DML (`SELECT`/`INSERT`/`UPDATE`/`DELETE`) concedido explicitamente,
  objeto a objeto, apenas por necessidade real do backend — nunca por
  padrão amplo (`GRANT ALL`).

#### Política `READ_WRITE_NO_DDL` (permanente, todos os ambientes)

`READ_WRITE_NO_DDL` é a política **permanente** da Runtime APP em
**DEV, HOMOLOG e PROD** — não é uma restrição exclusiva de DEV.

Runtime APP pode receber apenas o DML deliberadamente necessário:

- `SELECT`
- `INSERT`
- `UPDATE`
- `DELETE`, quando autorizado

Runtime APP **nunca** recebe, em nenhum ambiente:

- `CREATE`
- `ALTER`
- `DROP`
- `CREATE ROLE`
- `ALTER ROLE`
- `GRANT` estrutural
- `SET ROLE` Owner
- `SET ROLE` Migrator

### `public`

- Não contém e não deve conter tabelas de negócio da Amanteigados Lívia.

### Data API (Supabase)

- Schema `app` **não** é exposto pela Data API inicialmente. Exposição
  futura, se necessária, exige decisão e gate explícitos — fora do
  escopo desta fase.

### CREATE no schema `app`

**Regra normativa:** somente a role **Owner** do respectivo ambiente
possui `CREATE` no schema `app`.

Explicitamente **não** recebem `CREATE` em `app`:

- Migrator, em sua identidade própria (sem `SET ROLE` Owner)
- Runtime APP
- `PUBLIC` (pseudo-role)
- `anon`
- `authenticated`
- `service_role`

Migrator só executa DDL depois de `SET ROLE` Owner (`RESET ROLE` ao
final — ver "Migrator" acima).

## 4. Estado real por ambiente nesta fase

| Item | DEV | HOMOLOG | PROD |
|---|---|---|---|
| Roles owner/migrator/app | Existentes | Existentes (`amanteigados_homolog_owner/_migrator/_app`) | Não criadas |
| Schema `app` criado | Não | Não | Não |
| Login migrator validado | — | Sim | — |
| `SET ROLE` owner validado (migrator) | — | Sim | — |
| `RESET ROLE` validado | — | Sim | — |
| Login runtime APP validado | — | Sim | — |
| APP consegue `SET ROLE` owner | — | Não (validado) | — |
| APP consegue `SET ROLE` migrator | — | Não (validado) | — |
| APP possui DDL | — | Não (validado) | — |
| Objetos de negócio criados | Não | Não | Não |
| Pool PostgreSQL runtime | `max=5` (`backend/src/database.js`) | — | — |
| `/health` e `/ready` | Implementados (`backend/src/app.js`, `backend/src/readiness.js`) | — | — |

---

## 5. Estratégia DEV-first para criação do schema (planejada — não executada)

**Esta seção é apenas documentação do plano futuro. Nenhum passo abaixo
foi executado nesta fase.**

1. Preflight (confirmar ambiente, role de conexão, branch, backup se
   aplicável).
2. Garantir que o schema `app` está ausente antes de criar (idempotência
   de verificação, não de execução).
3. Criar o schema `app` com o Owner DEV (`CREATE SCHEMA app AUTHORIZATION
   <owner_dev>`), executado sob identidade Owner.
4. Validar ownership do schema (`\dn+ app` ou equivalente).
5. Manter Runtime APP sem `CREATE` em `app` durante e após a criação.
6. Configurar `search_path` de forma controlada (ver seção 6) — sem
   depender implicitamente de `public`.
7. Configurar `DEFAULT PRIVILEGES` (ver seção 7) para objetos futuros
   criados pelo Owner.
8. Conceder grants mínimos ao Runtime APP (`USAGE` no schema; DML
   objeto a objeto, apenas quando houver tabela real a servir).
9. Testes positivos (Runtime APP consegue operações autorizadas) e
   negativos (Runtime APP falha ao tentar DDL, `SET ROLE`, ou acesso a
   `public` fora do previsto).
10. Introduzir o framework de migrations (ver seção 8).
11. Introduzir `schema_version` (ledger de versão de schema aplicada).
12. Somente depois de validado e aprovado em DEV, promover a mesma
    estratégia e versionamento para HOMOLOG.
13. Somente depois de HOMOLOG aprovado (gate explícito), promover para
    PROD.

## 6. `search_path` — decisão final

**Esta fase somente documenta; nenhum `ALTER ROLE ... SET search_path`
é executado.**

Especificação oficial (decisão final, sem redação ambígua):

| Role | `search_path` |
|---|---|
| Owner | `app, pg_catalog` |
| Migrator | `app, pg_catalog` |
| Runtime APP | `app, pg_catalog` |

Regras explícitas:

- `public` **não** faz parte do `search_path` operacional das roles do
  projeto.
- Migrations e código crítico do backend preferem nomes totalmente
  qualificados (`app.<objeto>`), independentemente do `search_path`
  configurado.
- Nenhuma identidade não confiável pode possuir `CREATE` em qualquer
  schema presente em seu próprio `search_path`.
- Runtime APP nunca possui `CREATE` no schema `app`.
- Esta fase somente documenta a decisão; nenhum `ALTER ROLE` é
  executado nesta fase.

## 7. `DEFAULT PRIVILEGES` — especificação (não executada)

**Nenhum `ALTER DEFAULT PRIVILEGES` é executado nesta fase.** Os
`DEFAULT PRIVILEGES` futuros são definidos sob a identidade **Owner**
(`ALTER DEFAULT PRIVILEGES FOR ROLE <owner> IN SCHEMA app ...`, execução
futura).

### Tabelas

- Nenhum privilégio de negócio para `PUBLIC` (pseudo-role) por default.
- Nenhum privilégio automático para `anon`.
- Nenhum privilégio automático para `authenticated`.
- Nenhum privilégio automático para `service_role`.
- Runtime APP recebe somente grants explicitamente definidos, objeto a
  objeto — nunca por herança ampla de default privileges genéricos.
- Objetos criados **depois de `SET ROLE` Owner** (pelo Migrator, durante
  migrations) herdam os defaults do Owner.

### Sequences

- Tratadas separadamente dos privilégios de tabela.
- Runtime APP recebe somente `USAGE`/`SELECT` em sequence quando
  tecnicamente necessário (ex.: `INSERT` com geração de id via
  `SERIAL`/`IDENTITY`).
- Nenhuma role de API recebe privilégio implícito em sequences.

### Functions / Procedures / Routines

Novas functions PostgreSQL historicamente podem receber `EXECUTE` para
`PUBLIC` por default. Nossa política **remove esse acesso quando
aplicável**. Intenção futura documentada (SQL **não** executado nesta
fase):

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE <OWNER>
IN SCHEMA app
REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
```

Functions/procedures recebem `EXECUTE` apenas para roles explicitamente
autorizadas — nunca por default amplo.

## 8. Futuro framework de migrations — especificação (não implementado)

- Migrations versionadas no Git (diretório dedicado a definir dentro de
  `backend/`, fora do escopo de criação nesta fase).
- Identificador monotonicamente ordenado (ex.: timestamp ou sequência
  numérica zero-padded) por arquivo de migration.
- Ledger de schema version (`schema_version`, ou tabela equivalente) que
  registra migrations já aplicadas por ambiente.
- Aplicação idempotente quando aplicável (migration não reaplica efeito
  se já registrada no ledger).
- Cada migration roda dentro de uma transação quando o DDL utilizado
  permitir (PostgreSQL suporta DDL transacional na maioria dos casos).
- Estratégia de rollback documentada por migration (script de reversão
  ou migration "forward-only" com plano de correção explícito quando
  reversão não for viável).
- Checksum (ou mecanismo equivalente de integridade) para detectar
  migrations já aplicadas que tiveram seu conteúdo alterado após a
  aplicação.
- Ordem de aplicação obrigatória: **DEV primeiro → HOMOLOG depois → PROD
  somente por release aprovado** (ver seção 10).

## 9. Promoção entre ambientes

Fluxo obrigatório:

```
DEV → HOMOLOG → aprovação → PROD
```

**O que é promovido:**

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

### Política de dados entre ambientes

- **Nunca** copiar dados operacionais automaticamente DEV → HOMOLOG →
  PROD, em nenhuma direção.
- Clientes, pedidos e dados de teste ficam **isolados por ambiente**.
- "Sincronização" entre ambientes significa promoção de **schema,
  migrations e releases** — nunca cópia de banco/dados operacionais.

### Seeds

- Artefatos versionados no Git.
- **Nunca** representam cópia do banco operacional.
- Devem ser **idempotentes** ou possuir estratégia equivalente,
  aplicados como parte controlada do processo de release.

## 10. Painel "Ambientes & Releases" — requisitos futuros (não implementado)

Nenhuma UI é implementada nesta fase. Requisitos documentados para
implementação futura:

- Cards por ambiente: DEV, HOMOLOG, PROD.
- Versões exibidas por ambiente: `APP VERSION`, `SCHEMA VERSION`,
  `CATALOG VERSION`, `RELEASE VERSION`.
- Health checks por ambiente: Frontend, API, Database, Auth.
- Indicação de divergência entre versão atual do ambiente e a versão
  mais recente disponível para promoção.
- Diff de release (o que muda entre a versão atual de um ambiente e a
  versão candidata).
- Aprovação de promoção: aprovador registrado, data/hora.
- Promoção HOMOLOG → PROD como ação distinta e auditável (não automática).
- Agendamento de promoção (execução programada, não imediata).
- Histórico de promoções e rollbacks.
- Rollback por release.
- Auditoria (quem, quando, o quê, de qual versão para qual versão).

### Fluxo de release

```
DRAFT → READY_FOR_HOMOLOG → HOMOLOGATED → PUBLISHED
```

- `DRAFT`: release em construção em DEV, ainda não candidata a promoção.
- `READY_FOR_HOMOLOG`: artefatos versionados e aprovados em DEV, prontos
  para promoção a HOMOLOG.
- `HOMOLOGATED`: release validada em HOMOLOG, candidata a PROD.
- `PUBLISHED`: release promovida a PROD via gate explícito.

## 11. Governança Claude Code / Cursor / ChatGPT

Ver `docs/PROJECT_MAP.md`, seção "Governança dos agentes", para o
registro completo (papéis padrão, regra de não edição simultânea dos
mesmos arquivos, ordem de fallback, exigência de gate para produção e
política de segredos). Este documento não duplica essas regras — apenas
referencia.

---

*Documento de controle. Nenhum comando executado contra DEV, HOMOLOG ou
PROD nesta fase. Execução real de qualquer item acima requer tarefa
específica, gate e aprovação explícita, conforme `docs/PROJECT_MAP.md`.*
