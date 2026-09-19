# Especificação do Modelo de Dados do Catálogo — Amanteigados Lívia

> Revisão **R2** — nomenclatura oficial em português.
> Artefato DDL: `0002_criar_nucleo_catalogo`. Checksum esperado:
> `c745487eb9aa1af4d20add5a1f6a6600ed12780382303ed621794941626f4161`.
> Carga inicial de HOMOLOG (não é migration):
> `backend/database/releases/0001_catalogo_inicial.sql`.
> A 0001 permanece imutável.
> Complementa
> `docs/database/MIGRATION_FRAMEWORK_SPEC.md`,
> `docs/database/SCHEMA_SECURITY_SPEC.md`, `docs/catalog-spec.md` e
> `docs/PROJECT_MAP.md`.

---

## 1. Objetivo desta fase

Criar o **núcleo estrutural** do catálogo no schema `app`, alinhado aos
campos que o frontend atual realmente usa (`catalog-demo-data.js`,
`catalog-core.js`, `produtos.js`), sem inventar entidades de pedido,
estoque, fiscal, publicação ou administração.

Artefato DDL: `backend/database/migrations/0002_criar_nucleo_catalogo.sql`.

Identificador no ledger: `0002_criar_nucleo_catalogo`.

Estado: **pronta para aplicação oficial em HOMOLOG**. A 0001 permanece
imutável. Seed/demo **não** entra na 0002; a carga inicial é o release
`0001_catalogo_inicial.sql`.

## 2. Padrão oficial de nomenclatura

### Tabelas de negócio

```
app.tab_<nome_em_portugues>
```

Regras:

- schema `app`;
- prefixo `tab_`;
- nome em português;
- singular;
- `snake_case`;
- sem acentos;
- nomes autoexplicativos.

### Colunas

- português;
- `snake_case`;
- nomes claros e autoexplicativos;
- sem abreviações desnecessárias;
- PK/FK no padrão `id_<entidade>`;
- datas no padrão `data_<evento>`;
- booleanos com nomes compreensíveis.

### Exceção técnica

`app.schema_migrations` é tabela técnica interna do framework de
migrations já consolidado. **Não** recebe prefixo `tab_` e **não** é
renomeada nesta fase (nem em nenhuma correção da 0002). A 0001 é
imutável.

## 3. Inventário do catálogo atual (somente leitura)

Fonte demonstrativa (`window.CATALOG_DATA` em `catalog-demo-data.js`):

### Category (frontend)

| Campo | Uso atual | Destino na 0002 |
|---|---|---|
| `id` | chave de filtro / `categoryId` do produto | substituído por `id_categoria` uuid |
| `slug` | `?categoria=` em `/produtos` | `slug_categoria` |
| `name` | chips e busca | `nome_categoria` |
| `active` | só categorias ativas com produto ativo | `ativo` |
| `order` | ordenação dos chips | `ordem_exibicao` |

Não há `description` de categoria no demo; a coluna
`descricao_categoria` existe como `NULL` opcional para texto futuro,
sem seed.

### Product (frontend)

| Campo | Uso atual | Destino na 0002 |
|---|---|---|
| `id` | lookup, dialog, carrinho | substituído por `id_produto` uuid |
| `slug` | identificador estável de URL (ainda sem rota) | `slug_produto` |
| `name` | card, dialog, busca, ordenação | `nome_produto` |
| `categoryId` | filtro e nome da categoria | `id_categoria` |
| `description` | dialog | `descricao_produto` |
| `shortDescription` | card e busca | **fora desta migration** |
| `price` / `promotionalPrice` | `getEffectivePrice()` | `app.tab_produto_preco` |
| `image` | uma URL por produto | `app.tab_produto_imagem` |
| `featured` | flag editorial | `destaque` |
| `active` | listagem / `isUsableProduct` | `ativo` |
| `order` | ordenação de origem | `ordem_exibicao` |
| `unit`, `weight` | meta do card/dialog | **fora desta migration** |
| `customizable` | badge | **fora desta migration** |
| `minQuantity`, `quantityStep`, `maxQuantity` | seletor e carrinho | **fora desta migration** |
| `productionTime` | dialog | **fora desta migration** |
| `demo` | origem ilustrativa do frontend | **não é coluna de banco** |

A 0002 modela o núcleo (categoria, produto, imagens, preços). Campos
comerciais/operacionais acima permanecem no frontend demo até migrations
posteriores, se e quando forem necessários.

## 4. Modelo textual

```
tab_categoria
  1
  |
  N
tab_produto
  | \
  |  \
  N   N
tab_produto_imagem   tab_produto_preco
```

Cardinalidade:

- Uma categoria tem **N** produtos.
- Um produto pertence a **exatamente 1** categoria (`id_categoria` NOT NULL).
- Um produto tem **0..N** imagens.
- Um produto tem **0..N** preços.
- Ausência de imagem ou preço é válida (o frontend já trata placeholder
  e “sem preço”).

## 5. Estratégia de UUID

Todas as PKs são `uuid` **sem default gerador** no banco.

Motivos:

- zero sequence;
- zero extension adicional (`uuid-ossp` / `pgcrypto` não são exigidas);
- Node pode usar `crypto.randomUUID()`;
- IDs independentes entre DEV / HOMOLOG / PROD;
- facilita futuras publicações/versionamento.

Proibido nesta migration: `SERIAL`, `BIGSERIAL`, `IDENTITY`,
`CREATE SEQUENCE`, `gen_random_uuid()`, `uuid_generate_v4()`.

O frontend demo ainda usa ids string (`tradicional`, `classicos`). A
aplicação futura gera UUID e preserva `slug_categoria` / `slug_produto`
como chave de URL.

## 6. Tabelas

### 6.1 `app.tab_categoria`

Objetivo: taxonomia do cardápio (chips, filtro, busca por nome da
categoria).

| Coluna | Tipo | Nulo | Default | Papel |
|---|---|---|---|---|
| `id_categoria` | `uuid` | NÃO | — (app) | PK |
| `nome_categoria` | `text` | NÃO | — | nome visível |
| `slug_categoria` | `text` | NÃO | — | chave de URL |
| `descricao_categoria` | `text` | SIM | — | texto opcional |
| `ordem_exibicao` | `integer` | NÃO | `0` | ordem dos chips |
| `ativo` | `boolean` | NÃO | `true` | visibilidade |
| `data_criacao` | `timestamptz` | NÃO | `now()` | auditoria mínima |
| `data_atualizacao` | `timestamptz` | NÃO | `now()` | auditoria mínima |

Regras:

- `nome_categoria` não vazio (`btrim(nome_categoria) <> ''`);
- `slug_categoria` UNIQUE e normalizado: `^[a-z0-9]+(-[a-z0-9]+)*$`;
- `ordem_exibicao >= 0`.

Constraints nomeadas: `pk_tab_categoria`, `unq_tab_categoria_slug`,
`ck_tab_categoria_nome`, `ck_tab_categoria_slug`,
`ck_tab_categoria_ordem`.

Não há trigger de `data_atualizacao`. A aplicação atualiza o campo
explicitamente em UPDATEs.

### 6.2 `app.tab_produto`

Objetivo: item vendável do cardápio.

| Coluna | Tipo | Nulo | Default | Papel |
|---|---|---|---|---|
| `id_produto` | `uuid` | NÃO | — (app) | PK |
| `id_categoria` | `uuid` | NÃO | — | FK para `tab_categoria` |
| `nome_produto` | `text` | NÃO | — | nome visível |
| `slug_produto` | `text` | NÃO | — | chave de URL, UNIQUE global |
| `descricao_produto` | `text` | SIM | — | detalhe |
| `ativo` | `boolean` | NÃO | `true` | visibilidade |
| `destaque` | `boolean` | NÃO | `false` | destaque editorial (`featured`) |
| `ordem_exibicao` | `integer` | NÃO | `0` | ordem de origem |
| `data_criacao` | `timestamptz` | NÃO | `now()` | auditoria mínima |
| `data_atualizacao` | `timestamptz` | NÃO | `now()` | auditoria mínima |

FK:

```
id_categoria -> app.tab_categoria(id_categoria)
ON DELETE RESTRICT
```

Constraint: `fk_tab_produto_categoria`.

Não se apaga categoria que ainda tem produtos. Estoque, fiscal,
quantidade comercial e personalização **não** entram nesta tabela nesta
fase.

### 6.3 `app.tab_produto_imagem`

Objetivo: galeria por produto. O demo atual tem uma URL (`image`); o
núcleo já admite várias linhas, com no máximo **uma** principal.

| Coluna | Tipo | Nulo | Default | Papel |
|---|---|---|---|---|
| `id_imagem` | `uuid` | NÃO | — (app) | PK |
| `id_produto` | `uuid` | NÃO | — | FK para `tab_produto` |
| `url_imagem` | `text` | NÃO | — | URL/path da imagem |
| `texto_alternativo` | `text` | SIM | — | acessibilidade |
| `ordem_exibicao` | `integer` | NÃO | `0` | ordem na galeria |
| `principal` | `boolean` | NÃO | `false` | imagem principal do card |
| `data_criacao` | `timestamptz` | NÃO | `now()` | auditoria mínima |

FK:

```
id_produto -> app.tab_produto(id_produto)
ON DELETE CASCADE
```

Constraint: `fk_tab_produto_imagem_produto`.

UNIQUE INDEX parcial:

```
tab_produto_imagem_principal_unq
ON app.tab_produto_imagem (id_produto)
WHERE principal = true
```

Permite N imagens não principais; no máximo uma principal por produto.
Produto sem imagem (zero linhas) permanece válido.

### 6.4 `app.tab_produto_preco`

Objetivo: preço em **centavos inteiros**, com flag promocional e janela
opcional. Substitui o par float `price` / `promotionalPrice` do demo.

| Coluna | Tipo | Nulo | Default | Papel |
|---|---|---|---|---|
| `id_preco` | `uuid` | NÃO | — (app) | PK |
| `id_produto` | `uuid` | NÃO | — | FK para `tab_produto` |
| `valor_centavos` | `bigint` | NÃO | — | valor em centavos |
| `codigo_moeda` | `text` | NÃO | `'BRL'` | ISO-4217 de 3 letras |
| `promocional` | `boolean` | NÃO | `false` | preço promocional |
| `inicio_vigencia` | `timestamptz` | SIM | — | início da vigência |
| `fim_vigencia` | `timestamptz` | SIM | — | fim da vigência |
| `ativo` | `boolean` | NÃO | `true` | vigência lógica |
| `data_criacao` | `timestamptz` | NÃO | `now()` | auditoria mínima |

FK:

```
id_produto -> app.tab_produto(id_produto)
ON DELETE CASCADE
```

Constraint: `fk_tab_produto_preco_produto`.

Regras:

- `valor_centavos > 0` — ausência de preço = **nenhuma linha**, nunca zero;
- `codigo_moeda ~ '^[A-Z]{3}$'` (exatamente 3 letras uppercase);
- se `inicio_vigencia` e `fim_vigencia` estão preenchidos:
  `fim_vigencia > inicio_vigencia`.

Constraints: `ck_tab_produto_preco_valor`, `ck_tab_produto_preco_moeda`,
`ck_tab_produto_preco_vigencia`.

Sobreposição de períodos **não** é resolvida nesta migration. Fica para
regra de negócio/API futura. `getEffectivePrice()` no frontend (promo
estritamente menor que o preço-base) também permanece regra de
aplicação, não de banco.

## 7. Dinheiro em cents

Preços **não** são `numeric`/`float`/`money`.

- `19.90` BRL no demo → `1990` em `valor_centavos`;
- formatação `pt-BR` continua na aplicação (`Intl.NumberFormat`);
- evita erro de ponto flutuante em somas de carrinho futuras.

O frontend atual aceita `0` como preço válido (`isValidPrice`). O banco
recusa `valor_centavos = 0`. A ausência comercial continua sendo “sem
linha de preço”, alinhada a `docs/catalog-spec.md` (“nunca 0 para
ausente”).

## 8. Timestamps

- Tipo: `timestamptz`.
- `data_criacao` / `data_atualizacao` em categorias e produtos: default
  `now()` no INSERT.
- Sem trigger de `data_atualizacao`. UPDATE deve enviar o novo valor.
- Imagens e preços têm só `data_criacao` nesta fase (histórico mínimo;
  alteração de URL/preço pode ser nova linha em migrations futuras).

## 9. Slug

Formato único para categorias e produtos:

```
^[a-z0-9]+(-[a-z0-9]+)*$
```

- lowercase;
- hífen como separador;
- sem hífen inicial/final;
- sem hífens consecutivos;
- UNIQUE global na respectiva tabela (`slug_categoria`, `slug_produto`).

A aplicação gera o slug (não há função SQL nesta migration). O demo já
usa slugs nesse formato (`classicos`, `amanteigado` não composto, etc.).

## 10. Indexes (somente os justificados)

| Index | Tabela | Justificativa |
|---|---|---|
| `pk_tab_categoria` | `tab_categoria` | PK |
| `unq_tab_categoria_slug` | `tab_categoria` | UNIQUE de `slug_categoria`; lookup `?categoria=` |
| `pk_tab_produto` | `tab_produto` | PK |
| `unq_tab_produto_slug` | `tab_produto` | UNIQUE de `slug_produto` |
| `tab_produto_id_categoria_idx` | `tab_produto` | FK e listagem por categoria; o PostgreSQL **não** cria index automático no lado N da FK |
| `pk_tab_produto_imagem` | `tab_produto_imagem` | PK |
| `tab_produto_imagem_id_produto_idx` | `tab_produto_imagem` | FK e galeria por produto |
| `tab_produto_imagem_principal_unq` | `tab_produto_imagem` | no máximo uma principal (`WHERE principal = true`) |
| `pk_tab_produto_preco` | `tab_produto_preco` | PK |
| `tab_produto_preco_id_produto_idx` | `tab_produto_preco` | FK e preços por produto |

**Não criados** (excesso nesta fase):

- `(ativo, ordem_exibicao)` em `tab_categoria` — cardinalidade típica é
  pequena (o demo tem 4); PK + UNIQUE slug bastam;
- índice composto de listagem ativa em `tab_produto` — o filtro
  `ativo` + `id_categoria` cabe no index de FK + predicado; catálogo
  comercial esperado é pequeno;
- índice parcial `WHERE ativo = true` em `tab_produto_preco` —
  consulta parte de `id_produto`; o index da FK já cobre.

`schema_migrations_pkey` permanece da 0001.

## 11. Delete behavior

| Relação | ON DELETE | Motivo |
|---|---|---|
| `tab_produto.id_categoria` → `tab_categoria` | `RESTRICT` | não órfão; não apagar categoria com produtos |
| `tab_produto_imagem.id_produto` → `tab_produto` | `CASCADE` | imagens não existem sem produto |
| `tab_produto_preco.id_produto` → `tab_produto` | `CASCADE` | preços não existem sem produto |

Sem `ON DELETE SET NULL` (FKs NOT NULL). Sem cascade de categoria para
produto.

## 12. Runtime permissions

As 4 tabelas são criadas sob `owner_role` no schema `app`. A baseline
5.0D.6F (`ALTER DEFAULT PRIVILEGES ... GRANT SELECT, INSERT, UPDATE,
DELETE ON TABLES TO app_role`) deve conceder automaticamente o DML de
negócio.

A 0002 **não** executa `GRANT`/`REVOKE` de negócio nessas tabelas. Se o
catálogo PostgreSQL não mostrar exatamente o DML esperado, a migration
aborta (FAIL CLOSED).

Estado final obrigatório **em cada uma das 4 tabelas**:

| Identidade | Privilege |
|---|---|
| Owner | ownership das tabelas; ACL explícita do Owner não é exigida |
| Runtime APP | exatamente `SELECT`, `INSERT`, `UPDATE`, `DELETE` |
| Runtime APP | sem `TRUNCATE`, `REFERENCES`, `TRIGGER` |
| Runtime APP | sem grant option (`is_grantable=false`) |
| Migrator | zero privilege direto |
| PUBLIC | zero privilege |
| Qualquer outro grantee | zero — aborta a migration |

A validação de ACL de runtime é **fail-closed** e genérica por
OID/grantee (`relacl` + `aclexplode`). Somente Owner e Runtime APP
podem aparecer como grantees conforme a política acima. PUBLIC,
Migrator, role removida cujo OID permaneça na ACL, e qualquer outra
role inesperada bloqueiam a migration. A 0002 não enumera nomes de
roles desconhecidas: qualquer grantee cujo OID não seja o `relowner`
nem o da `app_role` falha.

O ledger `app.schema_migrations` **permanece** com zero privilege para
APP, Migrator e PUBLIC. A 0002 não reabre o ledger.

## 13. Migration ledger

A 0002 depende da 0001.

Pré-condição de conteúdo (após `SET ROLE owner_role`, porque Migrator
não lê o ledger):

- exatamente 1 registro;
- `migration_id = 0001_create_migration_ledger`;
- `checksum_sha256 = bb018fc0c74c17d8ee072fb0c0711d60ead28ce587c47e2bc1bc7dd0664991c0`;
- `0002_criar_nucleo_catalogo` ausente.

Pós-condição:

- exatamente 2 registros (`0001` + `0002`);
- checksum 0001 intacto;
- checksum 0002 = parâmetro `migration_sha256` (64 hex, **não**
  hardcoded no arquivo).

Único INSERT de dados desta migration: o registro 0002 no ledger.
Zero INSERT em `tab_categoria` / `tab_produto` / `tab_produto_imagem` /
`tab_produto_preco`. `catalog-demo-data.js` **não** é migrado.

## 14. Identidade e transação

Uma única transação:

```
LOGIN migrator_role
-> BEGIN
-> prechecks de catalogo/seguranca
-> SET ROLE owner_role
-> precheck do ledger 0001
-> CREATE das 4 tabelas
-> CREATE dos indexes autorizados
-> poschecks
-> INSERT ledger 0002
-> validar ledger
-> RESET ROLE
-> confirmar Migrator
-> COMMIT
```

A leitura do registro 0001 ocorre **depois** do `SET ROLE` porque o
Migrator não tem SELECT no ledger (proteção da 0001). A existência da
tabela e a ACL do ledger são validadas antes, via `pg_catalog`.

## 15. Ambientes Supabase (desta fase)

Nenhum SQL desta tarefa é executado contra qualquer ambiente.

| Ambiente | Projeto Supabase | Papel nesta fase |
|---|---|---|
| HOMOLOG | `amanteigados-livia-homolog` | destino oficial de validação |
| PROD | `amanteigados-livia-prod` | bloqueado até aprovação humana |

HOMOLOG permanece o destino oficial de validação após DEV. PROD
permanece bloqueado até aprovação humana explícita. Esta revisão R2
**não** aplica a 0002 em DEV, HOMOLOG ou PROD.

## 16. O que ficou FORA do escopo

Não criados nesta migration:

- customers, orders, carts, payments;
- stock / fiscal;
- releases / publications;
- admin users / audit logs;
- delivery / WhatsApp / loyalty;
- `shortDescription`, `unit`, `weight`, `customizable`;
- `minQuantity` / `quantityStep` / `maxQuantity` / `productionTime`;
- seed ou cópia de `catalog-demo-data.js`;
- trigger de `data_atualizacao`;
- exclusão de sobreposição de preços;
- runner automático;
- execução em DEV/HOMOLOG/PROD.

## 17. Futuras migrations esperadas (não desta fase)

Ordem ilustrativa, sujeita a gate:

1. Atributos comerciais do produto (unidade, peso, quantidade, prazo,
   personalização, descrição curta), se o negócio confirmar.
2. Seed versionado **homologado** — nunca o demo atual como catálogo
   real (`docs/catalog-homologation.md` continua PENDENTE).
3. Carrinho / pedidos / clientes.
4. Publicação/versionamento de catálogo (releases).
5. Painel admin e auditoria.

Promoção continua `DEV → HOMOLOG → aprovação → PROD`. HOMOLOG
(`amanteigados-livia-homolog`) é o destino oficial de validação. PROD
(`amanteigados-livia-prod`) permanece **bloqueado** até aprovação
humana.

---

*Documento de controle. Nenhum SQL executado contra DEV, HOMOLOG ou
PROD nesta fase. Execução real da 0002 exige tarefa específica, gate e
aprovação explícita.*
