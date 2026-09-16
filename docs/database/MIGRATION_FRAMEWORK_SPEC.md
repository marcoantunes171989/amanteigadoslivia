# Especificação do Framework de Migrations — Amanteigados Lívia

> Fase **5.0D.6G MIGRATION FRAMEWORK DRAFT**. **Somente draft.** Nenhum
> comando SQL, `psql`, DDL ou DML desta fase foi executado. Nenhum banco
> (DEV, HOMOLOG ou PROD) foi alterado pela criação destes artefatos.
> Complementa `docs/database/SCHEMA_SECURITY_SPEC.md` (modelo de
> privilégios e promoção entre ambientes) e
> `backend/database/migrations/README.md` (convenção operacional).
> Estado geral: `docs/PROJECT_MAP.md`.

---

## 1. Escopo desta fase

Esta fase cria o draft seguro do framework:

| Artefato | Papel |
|---|---|
| `backend/database/migrations/0001_create_migration_ledger.sql` | Primeira migration: cria o ledger |
| `backend/database/migrations/README.md` | Convenção operacional do diretório |
| `docs/database/MIGRATION_FRAMEWORK_SPEC.md` | Esta especificação normativa |
| `docs/PROJECT_MAP.md` | Registro de fase (atualizado) |

Fora de escopo (bloqueado):

- Executar a migration 0001
- Runner automático
- Business migrations
- Modelo de catálogo
- HOMOLOG
- PROD

## 2. Arquitetura

Diretório: `backend/database/migrations/`.

Naming:

```
NNNN_descricao_snake_case.sql
```

`NNNN` é inteiro zero-padded de 4 dígitos, monotonicamente crescente.
`migration_id` = basename sem `.sql`. Único no ledger e no Git.

O framework **não** cria schema adicional. O ledger vive em
`app.schema_migrations`.

Motivo arquitetural:

- o schema `app` já existe e é controlado pelo Owner;
- evita conceder `CREATE` no database;
- evita novo schema administrativo;
- Runtime APP não pode acessar o ledger.

Separação de responsabilidades:

```
bootstrap/   -> cria schema app vazio
config/      -> search_path + default privileges + grants de runtime
migrations/  -> objetos reais e evolução versionada
```

## 3. Ledger `app.schema_migrations`

Estrutura mínima (tipos conservadores, todos `NOT NULL`):

| Coluna | Tipo | Papel |
|---|---|---|
| `migration_id` | `text` PRIMARY KEY | Identificador estável (`0001_create_migration_ledger`) |
| `checksum_sha256` | `text` | SHA256 recebido via `psql -v` (64 hex) |
| `description` | `text` | Descrição coerente da migration |
| `applied_at` | `timestamptz` | Momento da aplicação (`now()` da transação) |
| `applied_by_login` | `text` | `session_user` (login que executou = Migrator) |
| `applied_as_role` | `text` | `current_user` (role efetiva = Owner) |
| `database_name` | `text` | `current_database()` |

Proibições:

- `SERIAL` / `BIGSERIAL`
- `IDENTITY`
- sequence

CHECK de formato:

- `migration_id ~ '^[0-9]{4}_[a-z0-9_]+$'`
- `checksum_sha256 ~ '^[0-9a-fA-F]{64}$'`

Owner permanece owner da tabela. Controle do Owner é por ownership,
não por GRANT direto extra.

## 4. Segurança do ledger vs default DML do Runtime APP

A fase 5.0D.6F concedeu a `app_role`, via `ALTER DEFAULT PRIVILEGES`
no schema `app`:

- TABLES futuras: `SELECT`, `INSERT`, `UPDATE`, `DELETE`
- SEQUENCES futuras: `USAGE`

Portanto, `CREATE TABLE app.schema_migrations` **concederá DML
automático** a `app_role`. A migration 0001 **deve remover isso na
mesma transação**:

```sql
REVOKE ALL PRIVILEGES
ON TABLE app.schema_migrations
FROM :"app_role";
```

Também revoga grants de `PUBLIC` e `migrator_role`.

Estado final obrigatório do ledger:

| Identidade | Privilege no ledger |
|---|---|
| Owner | Controle por ownership (ACL explícita do Owner não é exigida) |
| Runtime APP | **ZERO** privilege direto (qualquer entrada ACL = falha) |
| Migrator | **ZERO** privilege direto (qualquer entrada ACL = falha) |
| PUBLIC | **ZERO** privilege direto (qualquer entrada ACL = falha) |

A ausência de privilégios é validada de forma genérica por catálogo
(`pg_class.relacl` / `aclexplode`). Qualquer entrada ACL de
`app_role`, `migrator_role` ou `PUBLIC` falha, sem enumerar
privileges nominais e sem depender de privileges introduzidos em
versões posteriores. Não exige PostgreSQL 17.

Tabelas de negócio futuras **continuam** recebendo o DML default de
`app_role`. O ledger é a exceção explícita, não uma mudança da
baseline 5.0D.6F.

## 5. Identidade e transação

Fluxo obrigatório da 0001 (e das migrations futuras), **uma única
transação**:

```
LOGIN migrator_role
-> BEGIN
-> prechecks
-> SET ROLE owner_role
-> CREATE TABLE app.schema_migrations
-> remover grants automaticos do ledger
-> inserir registro da propria migration
-> poschecks
-> RESET ROLE
-> COMMIT
```

Regras:

- Migrator autentica; nunca é runtime de aplicação.
- Owner cria objetos via `SET ROLE`; nunca autentica diretamente.
- Runtime APP nunca executa migration.
- Fail closed. `\set ON_ERROR_STOP on`.
- ZERO `\quit N`.
- ZERO interpolação psql dentro de `DO`.
- Padrão: `SELECT` → `\gset` → `\if` → `DO` estático.

Variáveis psql obrigatórias, sem default:

- `target_database`
- `owner_role`
- `migrator_role`
- `app_role`
- `migration_sha256`

## 6. Checksum

O SHA256 do próprio arquivo **não** é hardcoded dentro dele.

Antes de qualquer execução futura, o orquestrador calcula o SHA256
dos bytes exatos do arquivo (UTF-8 sem BOM, newline LF) e passa:

```
-v migration_sha256=<64 hex>
```

A 0001 valida o formato (64 caracteres hexadecimais) e armazena o
valor recebido em `checksum_sha256`.

Regras futuras (runner ainda não implementado):

- migration aplicada nunca é reexecutada;
- arquivo alterado depois de aplicado = erro de integridade
  (checksum do arquivo ≠ checksum no ledger);
- ausência de `migration_sha256` = aborto.

## 7. Precondições da 0001

Antes do `CREATE TABLE`, validar:

- database correto (`current_database() = target_database`);
- `session_user` e `current_user` = `migrator_role`;
- schema `app` existe; owner do schema = `owner_role`;
- `search_path` das 3 roles = `app, pg_catalog` (por database);
- `CREATE` no database = false nas 3 roles;
- Migrator → Owner: `admin=false`, `inherit=false`, `set=true`;
- APP sem membership Owner/Migrator;
- APP sem `SET ROLE` Owner/Migrator;
- schema `app`: Owner CREATE+USAGE; APP USAGE sem CREATE;
  PUBLIC sem CREATE/USAGE; Migrator sem grant direto;
- default ACL baseline 5.0D.6F intacta:
  - Owner exatamente 3 entradas: FUNCTIONS global `f`, TABLES `app`
    `r`, SEQUENCES `app` `S`;
  - APP TABLES = SELECT/INSERT/UPDATE/DELETE;
  - APP SEQUENCES = USAGE;
  - APP FUNCTIONS = nenhum EXECUTE;
  - Migrator/PUBLIC sem privilege inesperado nesses defaults;
- objetos atuais: `app` relations = 0, `app` routines = 0;
- `app.schema_migrations` **não** existe.

PostgreSQL mínimo: 16 (colunas `inherit_option` / `set_option` de
`pg_auth_members`; mesma baseline das fases 5.0D.6D–5.0D.6F). Não
exige PostgreSQL 17. A ausência de privilégios no ledger é validada
de forma genérica por ACL (`pg_class.relacl` / `aclexplode`), sem
depender nominamente de privileges introduzidos em versões
posteriores.

## 8. Poscondições da 0001

Antes do `COMMIT`, ainda na mesma transação:

- tabela existe; owner = `owner_role`;
- exatamente 1 registro; `migration_id` =
  `0001_create_migration_ledger`;
- checksum armazenado = parâmetro `migration_sha256`;
- `database_name` = database corrente = `target_database`;
- `applied_by_login` = `migrator_role` = `session_user` no INSERT;
- `applied_as_role` = `owner_role` = `current_user` no INSERT;
- APP, Migrator e PUBLIC sem qualquer privilege direto no ledger
  (validação genérica por `pg_class.relacl` / `aclexplode`; qualquer
  entrada ACL dessas identidades = falha). Owner: ownership, sem
  exigir ACL explícita;
- nenhuma sequence criada; nenhuma coluna IDENTITY; nenhum default
  `nextval`;
- `app` routines continua 0;
- `search_path`, memberships, DB `CREATE=false` e default ACL
  baseline intactos.

Depois: `RESET ROLE`. Confirmar `session_user` = `current_user` =
`migrator_role`. `COMMIT` somente se tudo passou.

## 9. Convenção para migrations futuras

Normativo para todo arquivo neste diretório:

- arquivos **imutáveis** após aplicação;
- `migration_id` único;
- SHA256 obrigatório, calculado fora do SQL;
- execução sequencial crescente;
- uma migration por transação;
- fail closed;
- Owner cria objetos;
- Migrator autentica e `SET ROLE` Owner;
- Runtime APP nunca executa migration;
- migration aplicada nunca é reexecutada;
- migration alterada depois de aplicada = erro de integridade;
- rollback futuro = nova migration **forward-fix**; não editar
  migration histórica aplicada;
- promoção `DEV → HOMOLOG → PROD`;
- nenhuma cópia bruta de banco entre ambientes.

Runner automático: **não implementado** nesta fase. Invocação futura
é manual/`psql -f`, um arquivo por vez, na ordem crescente, somente
após gate explícito.

## 10. Promoção entre ambientes

Herdado de `SCHEMA_SECURITY_SPEC.md`:

```
DEV → HOMOLOG → aprovação → PROD
```

O que é promovido: código, schema, migrations, releases, versões e
seeds versionados.

O que **não** é promovido: clientes, pedidos, dados operacionais,
dados de teste, dumps completos de banco.

## 11. Relação com fases anteriores

| Fase | Estado relativamente a 5.0D.6G |
|---|---|
| 5.0D.6C bootstrap schema `app` | Pré-requisito executado/auditado em DEV |
| 5.0D.6D `search_path` | Pré-requisito executado/auditado em DEV |
| 5.0D.6E default privileges FUNCTIONS | Pré-requisito executado/auditado em DEV |
| 5.0D.6F runtime APP grants | **CONCLUÍDO/AUDITADO EM DEV**; `003` não deve ser reexecutado em DEV |
| 5.0D.6G este draft | **Ainda NÃO executado** |

---

*Documento de controle. Nenhum comando executado contra DEV, HOMOLOG
ou PROD nesta fase. Execução real da 0001 exige tarefa específica,
gate e aprovação explícita.*
