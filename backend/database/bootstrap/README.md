# Bootstrap administrativo do schema `app`

> Fase 5.0D.6C — DRAFT. Estes artefatos **não foram executados** contra
> nenhum ambiente (DEV, HOMOLOG ou PROD). Complementa
> `docs/database/SCHEMA_SECURITY_SPEC.md` (especificação de privilégios) e
> `docs/PROJECT_MAP.md` (estado geral do projeto).

## Finalidade

Este diretório contém o **bootstrap administrativo** que prepara o schema
`app` para receber, em fases futuras, o framework de migrations e as
tabelas de negócio. Ele é deliberadamente **separado das migrations de
negócio**:

- Nenhuma tabela, view, sequence, função ou outro objeto de negócio é
  criado aqui.
- Nenhum `schema_version` / ledger de migrations é criado aqui.
- O único efeito estrutural produzido pelo conjunto dos três scripts é a
  existência do schema `app`, vazio, com o ownership e os grants mínimos
  descritos em `docs/database/SCHEMA_SECURITY_SPEC.md`.

O framework de migrations de negócio (diretório próprio, ledger,
versionamento) é objeto de uma fase futura — ver
`docs/database/SCHEMA_SECURITY_SPEC.md`, seção "Futuro framework de
migrations".

## Ordem obrigatória de execução

1. `001_admin_prepare_app_schema.sql`
2. `002_migrator_create_app_schema.sql`
3. `003_admin_finalize_app_schema.sql`

Os scripts **não** devem ser executados fora desta ordem, e **não** devem
ser executados nesta fase (fase atual é apenas de criação de artefatos —
ver `docs/PROJECT_MAP.md`, gates G1–G3).

## Identidades esperadas por script

| Script | Identidade que executa | Papel |
|---|---|---|
| `001_admin_prepare_app_schema.sql` | Administrador do ambiente | Valida precondições e concede `CREATE ON DATABASE` **temporário** ao Owner |
| `002_migrator_create_app_schema.sql` | Migrator do ambiente (login real) | `SET ROLE` Owner, cria o schema `app`, aplica hardening imediato, `RESET ROLE` |
| `003_admin_finalize_app_schema.sql` | Administrador do ambiente (mesma identidade do 001) | Remove o `CREATE ON DATABASE` temporário e valida o estado final |

O Runtime APP (`app_role`) **nunca** é usado para executar qualquer um
destes scripts.

## Variáveis psql (portabilidade DEV/HOMOLOG/PROD)

Nenhum script hardcoda nomes de database ou de role. Todos os três exigem
as mesmas quatro variáveis psql, obrigatórias e sem valor default:

| Variável | Significado |
|---|---|
| `target_database` | Nome do database alvo no ambiente |
| `owner_role` | Role Owner do schema `app` no ambiente (NOLOGIN, dono do schema) |
| `migrator_role` | Role Migrator do ambiente (login real, `SET ROLE` para Owner) |
| `app_role` | Role Runtime APP do ambiente (login real, sem DDL) |

Um script que não receber alguma dessas variáveis falha fechado, antes de
qualquer instrução SQL: o teste de existência é feito via `\if :{?variavel}`
(sintaxe psql que verifica se a variável foi definida, sem depender do seu
valor) e, no ramo `\else`, o script executa `\echo` com uma mensagem clara
indicando qual variável está ausente, seguido de um bloco
`DO $$ BEGIN RAISE EXCEPTION '...'; END $$;` que força um erro SQL real.
Combinado com `\set ON_ERROR_STOP on`, esse erro interrompe o script
imediatamente com código de saída não-zero — antes de qualquer
`GRANT`/`REVOKE`/`CREATE`. Nenhum script usa `\quit` com argumento de
exit-code: no psql do PostgreSQL 18, `\quit` não é um mecanismo de
exit-code customizado, e a rejeição de variável ausente é feita
inteiramente via erro SQL controlado (`RAISE EXCEPTION` + `ON_ERROR_STOP`),
sem shell, sem backticks e sem `\!`.

Exemplo de invocação (nomes de **DEV** usados apenas como ilustração —
não são segredo, mas também não são reafirmados como valor operacional
fixo dentro da lógica dos scripts):

```
psql -v ON_ERROR_STOP=1 \
     -v target_database=amanteigados_dev \
     -v owner_role=amanteigados_dev_owner \
     -v migrator_role=amanteigados_dev_migrator \
     -v app_role=amanteigados_dev_app \
     -d amanteigados_dev \
     -U <identidade_administrativa> \
     -f 001_admin_prepare_app_schema.sql
```

O mesmo padrão de invocação, apenas trocando os valores das variáveis e a
identidade de conexão, é reutilizável em HOMOLOG e futuramente em PROD.

### Disciplina operacional: `-d` e `target_database`

O database indicado na conexão psql (`-d`) e o valor passado em
`target_database` **devem sempre se referir ao mesmo ambiente/database**.
Os scripts validam `current_database() = target_database` como
precondição/validação, mas essa checagem só confirma consistência *depois*
que a conexão já foi aberta — é responsabilidade do executor garantir, antes
de invocar `psql`, que o `-d` usado corresponde ao ambiente pretendido. Os
scripts não trocam de database em nenhum momento.

### Quoting de identificadores

Nomes de database e de role interpolados em DDL/GRANT/REVOKE usam a forma
`:"variavel"` do psql (quoting de identificador via `quote_ident`), nunca
concatenação manual de string. Comparações de valor (ex.:
`current_database()`) usam a forma `:'variavel'` (quoting de literal via
`quote_literal`). Nenhum script usa `EXECUTE` com concatenação de texto
para montar identificadores.

### Interpolação psql e blocos `DO`

O psql interpola variáveis (`:var`, `:'var'`, `:"var"`) apenas em SQL
top-level — nunca dentro do corpo de um bloco `DO $tag$ ... $tag$`, que é
um literal dollar-quoted resolvido inteiramente no servidor. Por isso,
toda validação parametrizada (existência de role, atributos, privilégios,
owner do schema, contagens etc.) é feita via `SELECT` top-level seguido de
`\gset` e `\if`; blocos `DO` são usados somente para `RAISE EXCEPTION` com
mensagem estática (sem variável psql), servindo apenas como mecanismo de
aborto da transação depois que o `\echo` já emitiu o detalhe com os
valores reais das variáveis.

## Requisito mínimo de PostgreSQL

Estes scripts exigem **PostgreSQL 16 ou superior**. Motivo: as validações de
membership Migrator → Owner em `001`, `002` e `003` consultam diretamente
`pg_auth_members` e exigem a combinação exata `admin_option = false`,
`inherit_option = false`, `set_option = true` — as colunas
`pg_auth_members.admin_option`, `pg_auth_members.inherit_option` e
`pg_auth_members.set_option` são todas lidas diretamente nessas validações.
As colunas `inherit_option` e `set_option` foram introduzidas no
PostgreSQL 16 (antes dessa versão, a concessão de role membership não
distinguia a opção `SET` da opção `INHERIT` por linha de `pg_auth_members`).
O ambiente DEV atual roda PostgreSQL 18.6, mas a lógica dos três scripts não
hardcoda essa versão — apenas assume o baseline mínimo 16.

## O que NÃO está armazenado aqui

- Nenhuma senha.
- Nenhuma connection string real.
- Nenhum host privado, project ref do Supabase, token ou service role key.

Credenciais são informadas interativamente pelo executor/orquestrador no
momento da execução (fora do escopo desta fase — nenhum runner é criado
aqui).

## Escopo desta fase (o que os scripts fazem e não fazem)

- Schema `app` permanece **fora da Supabase Data API** inicialmente.
- `public` continua sem objetos de negócio — os scripts apenas validam
  essa precondição, não a alteram.
- `search_path` **não** é alterado por nenhum destes scripts. A decisão
  final de `search_path` está documentada em
  `docs/database/SCHEMA_SECURITY_SPEC.md`, seção 6, e será aplicada em
  fase futura.
- `DEFAULT PRIVILEGES` **não** são configurados por nenhum destes
  scripts. Especificação em `SCHEMA_SECURITY_SPEC.md`, seção 7; aplicação
  futura.
- Nenhum DML é concedido — Runtime APP não recebe `SELECT`/`INSERT`/
  `UPDATE`/`DELETE` nesta fase.
- Runtime APP nunca recebe `CREATE` no schema `app`, em nenhuma fase.

## Cleanup do privilégio temporário (crítico)

O script `001` concede `CREATE ON DATABASE` ao Owner de forma
**temporária**, apenas para permitir que o `CREATE SCHEMA app
AUTHORIZATION <owner>` do script `002` seja executado sob a identidade do
Owner (via `SET ROLE`).

**Se `001` for concluído e qualquer problema impedir a execução de `002`
ou `003`, o privilégio `CREATE` temporário do Owner deve ser removido
imediatamente.**

O script `003` é o **mecanismo oficial de cleanup**: ele remove o
`CREATE ON DATABASE` do Owner e **commita esse `REVOKE` antes de rodar
qualquer validação**. Isso significa que `003` pode — e deve — ser
executado para limpar o privilégio temporário mesmo quando `002` nunca
rodou ou foi interrompido no meio:

- Se o schema `app` não existir quando `003` rodar, o cleanup do
  `CREATE ON DATABASE` ainda é aplicado e commitado, e a validação final
  falha de forma explícita (o script **não** recria o schema
  automaticamente). Como a FASE A já removeu o `CREATE ON DATABASE`
  temporário do Owner, **reexecutar apenas o `002` não é suficiente**
  nesse cenário — `002` depende do `CREATE ON DATABASE` temporário
  concedido pelo `001`. A recuperação correta é reexecutar a sequência
  completa **`001` → `002` → `003`**.
- Se o schema `app` existir e estiver corretamente configurado, `003`
  confirma o estado final e conclui com sucesso.

## Transacionalidade e falha fechada

- `001` e `002` executam suas alterações estruturais dentro de uma única
  transação; qualquer falha de precondição ou de asserção aborta a
  transação antes do `COMMIT`, então nenhuma alteração parcial persiste.
- `003` separa deliberadamente o cleanup (FASE A, commitado
  imediatamente) da validação final (FASE B, somente leitura), na ordem
  exigida por este documento.
- Todos os scripts usam `\set ON_ERROR_STOP on`: qualquer erro interrompe
  a execução imediatamente.

## Ambientes

Estes scripts são **logicamente reutilizáveis** em DEV, HOMOLOG e PROD
através das variáveis psql descritas acima. Nesta fase, **nenhum deles é
executado em nenhum ambiente** — DEV, HOMOLOG e PROD permanecem
bloqueados até os gates G1–G5 descritos em `docs/PROJECT_MAP.md`.
