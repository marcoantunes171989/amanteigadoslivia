# Framework de migrations — Amanteigados Lívia

> Fase **5.0D.6G MIGRATION FRAMEWORK DRAFT**. Este diretório e o
> artefato `0001_create_migration_ledger.sql` são **DRAFT**. **Não
> executar** nesta fase. Nenhum runner automático é implementado aqui.
> Complementa `docs/database/MIGRATION_FRAMEWORK_SPEC.md` (especificação
> normativa) e `docs/database/SCHEMA_SECURITY_SPEC.md` (modelo de
> privilégios). Estado geral: `docs/PROJECT_MAP.md`.

## Finalidade

Este diretório contém as **migrations versionadas** do schema `app`.
Elas são deliberadamente **separadas** do bootstrap administrativo
(`backend/database/bootstrap/`) e da configuração de runtime
(`backend/database/config/`):

- Bootstrap cria o schema `app` vazio.
- Config 001/002/003 fixa `search_path`, `DEFAULT PRIVILEGES` de
  FUNCTIONS e grants de runtime para tabelas/sequences **futuras**.
- Migrations criam (e evoluem) objetos reais dentro de `app`,
  começando pelo ledger `app.schema_migrations`.

O Runtime APP **nunca** executa migration.

## Naming

```
NNNN_descricao_snake_case.sql
```

- `NNNN` é inteiro zero-padded de 4 dígitos, crescente, único.
- `migration_id` registrado no ledger = nome do arquivo **sem** `.sql`.
- Primeiro artefato: `0001_create_migration_ledger.sql`
  (`migration_id = 0001_create_migration_ledger`).

Arquivos aplicados são **imutáveis**. Correção posterior é sempre uma
nova migration forward-fix; nunca editar migration histórica já
aplicada.

## Ledger

Tabela: `app.schema_migrations`.

Não se cria schema administrativo nesta fase. Motivo:

- o schema `app` já existe e é controlado pelo Owner;
- evita conceder `CREATE` no database;
- evita novo schema administrativo;
- Runtime APP não pode acessar o ledger (revoke explícito na 0001).

Chave primária textual: `migration_id`. Sem `SERIAL`, `BIGSERIAL`,
`IDENTITY` ou sequence.

## Identidade e transação

Fluxo obrigatório de cada migration (uma única transação):

```
LOGIN migrator_role
-> BEGIN
-> prechecks
-> SET ROLE owner_role
-> DDL / DML da migration
-> poschecks
-> RESET ROLE
-> COMMIT
```

- Migrator autentica.
- Owner cria objetos (via `SET ROLE`).
- Fail closed: variável ausente, precondição falha ou poscondição
  falha aborta a transação. Nenhum `\quit N`.
- Padrão psql: `SELECT` → `\gset` → `\if` → `DO` estático.
- Zero interpolação psql dentro de `DO`.

## Checksum

Toda migration recebe `migration_sha256` via `psql -v`. O SHA256 **não**
é hardcoded no próprio arquivo. O valor é calculado **fora do SQL**,
sobre os bytes exatos do arquivo (UTF-8 sem BOM, LF), **antes** da
execução futura.

Formato obrigatório: 64 caracteres hexadecimais.

Migration já aplicada cujo arquivo foi alterado = erro de integridade
(checksum diverge). Não reexecutar migration aplicada.

## Variáveis psql obrigatórias

Nenhum valor default. Ausência = aborto antes de qualquer DDL.

| Variável | Significado |
|---|---|
| `target_database` | Database alvo |
| `owner_role` | Owner do schema `app` |
| `migrator_role` | Login da sessão (Migrator) |
| `app_role` | Runtime APP (nunca executor) |
| `migration_sha256` | SHA256 do arquivo, calculado fora do SQL |

Exemplo de invocação **futura** (DEV ilustrativo; **não executar agora**):

```
psql -v ON_ERROR_STOP=1 \
     -v target_database=amanteigados_dev \
     -v owner_role=amanteigados_dev_owner \
     -v migrator_role=amanteigados_dev_migrator \
     -v app_role=amanteigados_dev_app \
     -v migration_sha256=<sha256 hex 64 calculado fora do SQL> \
     -d amanteigados_dev \
     -U <migrator_role> \
     -f 0001_create_migration_ledger.sql
```

O `-d` e `target_database` devem referir o mesmo database. Os scripts
não trocam de database.

## Convenções

- Execução sequencial crescente (`0001`, depois `0002`, …).
- Uma migration por transação.
- Migration aplicada nunca é reexecutada.
- Runtime APP nunca executa migration e permanece com **zero**
  privilege em `app.schema_migrations`.
- Compatível com PostgreSQL >= 16 (baseline do projeto; colunas
  `inherit_option` / `set_option` de `pg_auth_members`). Não exige
  PostgreSQL 17.
- Pós-check de privilégios do ledger: ausência de qualquer privilege
  direto de `app_role`, `migrator_role` e `PUBLIC` via ACL de
  catálogo (`pg_class.relacl` / `aclexplode`). Não enumera privileges
  nominais e não depende de privileges introduzidos em versões
  posteriores.
- Tabelas de negócio futuras continuam recebendo DML default de
  `app_role` (fase 5.0D.6F). O ledger é a exceção explícita.
- Promoção: `DEV → HOMOLOG → PROD`. Nenhuma cópia bruta de banco
  entre ambientes.
- Rollback futuro = nova migration forward-fix.
- Runner automático: **não implementado** nesta fase.

## O que NÃO está armazenado aqui

- Nenhuma senha.
- Nenhuma connection string real.
- Nenhum host privado, project ref, token ou service role key.
- Nenhum SHA256 hardcoded da própria 0001.

## Ambientes

Estes artefatos são logicamente reutilizáveis em DEV, HOMOLOG e PROD
via variáveis psql. Nesta fase o draft existe apenas no Git.
**HOMOLOG** e **PROD** permanecem bloqueados. Business migrations e
modelo de catálogo permanecem bloqueados até execução auditada da
0001 em DEV e gates posteriores.

---

*Documento de controle. Nenhum SQL deste diretório foi executado
nesta fase.*
