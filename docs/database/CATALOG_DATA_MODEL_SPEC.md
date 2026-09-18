# Especificação do Modelo de Dados do Catálogo — Amanteigados Lívia

> Fase **5.0D.6H BUSINESS MIGRATIONS / CATALOG MODEL - DRAFT**.
> **Somente draft.** A migration `0002_create_catalog_core` **não** foi
> executada. Nenhum comando SQL, `psql` ou conexão PostgreSQL desta fase
> alterou DEV, HOMOLOG ou PROD. Complementa
> `docs/database/MIGRATION_FRAMEWORK_SPEC.md`,
> `docs/database/SCHEMA_SECURITY_SPEC.md`, `docs/catalog-spec.md` e
> `docs/PROJECT_MAP.md`.

---

## 1. Objetivo desta fase

Criar o **núcleo estrutural** do catálogo no schema `app`, alinhado aos
campos que o frontend atual realmente usa (`catalog-demo-data.js`,
`catalog-core.js`, `produtos.js`), sem inventar entidades de pedido,
estoque, fiscal, publicação ou administração.

Artefato DDL: `backend/database/migrations/0002_create_catalog_core.sql`.

Estado: **DRAFT / NÃO EXECUTADA**.

## 2. Inventário do catálogo atual (somente leitura)

Fonte demonstrativa (`window.CATALOG_DATA` em `catalog-demo-data.js`):

### Category (frontend)

| Campo | Uso atual | Destino na 0002 |
|---|---|---|
| `id` | chave de filtro / `categoryId` do produto | substituído por `category_id` uuid |
| `slug` | `?categoria=` em `/produtos` | `slug` |
| `name` | chips e busca | `name` |
| `active` | só categorias ativas com produto ativo | `is_active` |
| `order` | ordenação dos chips | `sort_order` |

Não há `description` de categoria no demo; a coluna existe como `NULL`
opcional para texto futuro, sem seed.

### Product (frontend)

| Campo | Uso atual | Destino na 0002 |
|---|---|---|
| `id` | lookup, dialog, carrinho | substituído por `product_id` uuid |
| `slug` | identificador estável de URL (ainda sem rota) | `slug` |
| `name` | card, dialog, busca, ordenação | `name` |
| `categoryId` | filtro e nome da categoria | `category_id` |
| `description` | dialog | `description` |
| `shortDescription` | card e busca | **fora desta migration** |
| `price` / `promotionalPrice` | `getEffectivePrice()` | `app.product_prices` |
| `image` | uma URL por produto | `app.product_images` |
| `featured` | flag editorial | `is_featured` |
| `active` | listagem / `isUsableProduct` | `is_active` |
| `order` | ordenação de origem | `sort_order` |
| `unit`, `weight` | meta do card/dialog | **fora desta migration** |
| `customizable` | badge | **fora desta migration** |
| `minQuantity`, `quantityStep`, `maxQuantity` | seletor e carrinho | **fora desta migration** |
| `productionTime` | dialog | **fora desta migration** |
| `demo` | origem ilustrativa do frontend | **não é coluna de banco** |

A 0002 modela o núcleo (categoria, produto, imagens, preços). Campos
comerciais/operacionais acima permanecem no frontend demo até migrations
posteriores, se e quando forem necessários.

## 3. Modelo textual

```
categories
  1
  |
  N
products
  | \
  |  \
  N   N
images prices
```

Cardinalidade:

- Uma categoria tem **N** produtos.
- Um produto pertence a **exatamente 1** categoria (`category_id` NOT NULL).
- Um produto tem **0..N** imagens.
- Um produto tem **0..N** preços.
- Ausência de imagem ou preço é válida (o frontend já trata placeholder
  e “sem preço”).

## 4. Estratégia de UUID

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
aplicação futura gera UUID e preserva `slug` como chave de URL.

## 5. Tabelas

### 5.1 `app.categories`

Objetivo: taxonomia do cardápio (chips, filtro, busca por nome da
categoria).

| Coluna | Tipo | Nulo | Default | Papel |
|---|---|---|---|---|
| `category_id` | `uuid` | NÃO | — (app) | PK |
| `name` | `text` | NÃO | — | nome visível |
| `slug` | `text` | NÃO | — | chave de URL |
| `description` | `text` | SIM | — | texto opcional |
| `sort_order` | `integer` | NÃO | `0` | ordem dos chips |
| `is_active` | `boolean` | NÃO | `true` | visibilidade |
| `created_at` | `timestamptz` | NÃO | `now()` | auditoria mínima |
| `updated_at` | `timestamptz` | NÃO | `now()` | auditoria mínima |

Regras:

- `name` não vazio (`btrim(name) <> ''`);
- `slug` UNIQUE e normalizado: `^[a-z0-9]+(-[a-z0-9]+)*$`;
- `sort_order >= 0`.

Não há trigger de `updated_at`. A aplicação atualiza o campo
explicitamente em UPDATEs.

### 5.2 `app.products`

Objetivo: item vendável do cardápio.

| Coluna | Tipo | Nulo | Default | Papel |
|---|---|---|---|---|
| `product_id` | `uuid` | NÃO | — (app) | PK |
| `category_id` | `uuid` | NÃO | — | FK para `categories` |
| `name` | `text` | NÃO | — | nome visível |
| `slug` | `text` | NÃO | — | chave de URL, UNIQUE global |
| `description` | `text` | SIM | — | detalhe |
| `is_active` | `boolean` | NÃO | `true` | visibilidade |
| `is_featured` | `boolean` | NÃO | `false` | destaque editorial (`featured`) |
| `sort_order` | `integer` | NÃO | `0` | ordem de origem |
| `created_at` | `timestamptz` | NÃO | `now()` | auditoria mínima |
| `updated_at` | `timestamptz` | NÃO | `now()` | auditoria mínima |

FK:

```
category_id -> app.categories(category_id)
ON DELETE RESTRICT
```

Não se apaga categoria que ainda tem produtos. Estoque, fiscal,
quantidade comercial e personalização **não** entram nesta tabela nesta
fase.

### 5.3 `app.product_images`

Objetivo: galeria por produto. O demo atual tem uma URL (`image`); o
núcleo já admite várias linhas, com no máximo **uma** primária.

| Coluna | Tipo | Nulo | Default | Papel |
|---|---|---|---|---|
| `image_id` | `uuid` | NÃO | — (app) | PK |
| `product_id` | `uuid` | NÃO | — | FK para `products` |
| `image_url` | `text` | NÃO | — | URL/path da imagem |
| `alt_text` | `text` | SIM | — | acessibilidade |
| `sort_order` | `integer` | NÃO | `0` | ordem na galeria |
| `is_primary` | `boolean` | NÃO | `false` | imagem principal do card |
| `created_at` | `timestamptz` | NÃO | `now()` | auditoria mínima |

FK:

```
product_id -> app.products(product_id)
ON DELETE CASCADE
```

UNIQUE INDEX parcial:

```
(product_id) WHERE is_primary = true
```

Permite N imagens não primárias; no máximo uma primária por produto.
Produto sem imagem (zero linhas) permanece válido.

### 5.4 `app.product_prices`

Objetivo: preço em **centavos inteiros**, com flag promocional e janela
opcional. Substitui o par float `price` / `promotionalPrice` do demo.

| Coluna | Tipo | Nulo | Default | Papel |
|---|---|---|---|---|
| `price_id` | `uuid` | NÃO | — (app) | PK |
| `product_id` | `uuid` | NÃO | — | FK para `products` |
| `amount_cents` | `bigint` | NÃO | — | valor em centavos |
| `currency_code` | `text` | NÃO | `'BRL'` | ISO-4217 de 3 letras |
| `is_promotional` | `boolean` | NÃO | `false` | preço promocional |
| `starts_at` | `timestamptz` | SIM | — | início da vigência |
| `ends_at` | `timestamptz` | SIM | — | fim da vigência |
| `is_active` | `boolean` | NÃO | `true` | vigência lógica |
| `created_at` | `timestamptz` | NÃO | `now()` | auditoria mínima |

FK:

```
product_id -> app.products(product_id)
ON DELETE CASCADE
```

Regras:

- `amount_cents > 0` — ausência de preço = **nenhuma linha**, nunca zero;
- `currency_code ~ '^[A-Z]{3}$'`;
- se `starts_at` e `ends_at` estão preenchidos: `ends_at > starts_at`.

Sobreposição de períodos **não** é resolvida nesta migration. Fica para
regra de negócio/API futura. `getEffectivePrice()` no frontend (promo
estritamente menor que o preço-base) também permanece regra de
aplicação, não de banco.

## 6. Dinheiro em cents

Preços **não** são `numeric`/`float`/`money`.

- `19.90` BRL no demo → `1990` em `amount_cents`;
- formatação `pt-BR` continua na aplicação (`Intl.NumberFormat`);
- evita erro de ponto flutuante em somas de carrinho futuras.

O frontend atual aceita `0` como preço válido (`isValidPrice`). O banco
recusa `amount_cents = 0`. A ausência comercial continua sendo “sem
linha de preço”, alinhada a `docs/catalog-spec.md` (“nunca 0 para
ausente”).

## 7. Timestamps

- Tipo: `timestamptz`.
- `created_at` / `updated_at` em categorias e produtos: default `now()`
  no INSERT.
- Sem trigger de `updated_at`. UPDATE deve enviar o novo valor.
- Imagens e preços têm só `created_at` nesta fase (histórico mínimo;
  alteração de URL/preço pode ser nova linha em migrations futuras).

## 8. Slug

Formato único para categorias e produtos:

```
^[a-z0-9]+(-[a-z0-9]+)*$
```

- lowercase;
- hífen como separador;
- sem hífen inicial/final;
- sem hífens consecutivos;
- UNIQUE global na respectiva tabela.

A aplicação gera o slug (não há função SQL nesta migration). O demo já
usa slugs nesse formato (`classicos`, `amanteigado` não composto, etc.).

## 9. Indexes (somente os justificados)

| Index | Tabela | Justificativa |
|---|---|---|
| `categories_pkey` | `categories` | PK |
| `categories_slug_key` | `categories` | UNIQUE de `slug`; lookup `?categoria=` |
| `products_pkey` | `products` | PK |
| `products_slug_key` | `products` | UNIQUE de `slug` |
| `products_category_id_idx` | `products` | FK e listagem por categoria; o PostgreSQL **não** cria index automático no lado N da FK |
| `product_images_pkey` | `product_images` | PK |
| `product_images_product_id_idx` | `product_images` | FK e galeria por produto |
| `product_images_one_primary_per_product_idx` | `product_images` | no máximo uma primária (`WHERE is_primary = true`) |
| `product_prices_pkey` | `product_prices` | PK |
| `product_prices_product_id_idx` | `product_prices` | FK e preços por produto |

**Não criados** (excesso nesta fase):

- `(is_active, sort_order)` em `categories` — cardinalidade típica é
  pequena (o demo tem 4); PK + UNIQUE slug bastam;
- índice composto de listagem ativa em `products` — o filtro
  `is_active` + `category_id` cabe no index de FK + predicado; catálogo
  comercial esperado é pequeno;
- índice parcial `WHERE is_active = true` em `product_prices` —
  consulta parte de `product_id`; o index da FK já cobre.

`schema_migrations_pkey` permanece da 0001.

## 10. Delete behavior

| Relação | ON DELETE | Motivo |
|---|---|---|
| `products.category_id` → `categories` | `RESTRICT` | não órfão; não apagar categoria com produtos |
| `product_images.product_id` → `products` | `CASCADE` | imagens não existem sem produto |
| `product_prices.product_id` → `products` | `CASCADE` | preços não existem sem produto |

Sem `ON DELETE SET NULL` (FKs NOT NULL). Sem cascade de categoria para
produto.

## 11. Runtime permissions

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

## 12. Migration ledger

A 0002 depende da 0001.

Pré-condição de conteúdo (após `SET ROLE owner_role`, porque Migrator
não lê o ledger):

- exatamente 1 registro;
- `migration_id = 0001_create_migration_ledger`;
- `checksum_sha256 = bb018fc0c74c17d8ee072fb0c0711d60ead28ce587c47e2bc1bc7dd0664991c0`;
- `0002_create_catalog_core` ausente.

Pós-condição:

- exatamente 2 registros (`0001` + `0002`);
- checksum 0001 intacto;
- checksum 0002 = parâmetro `migration_sha256` (64 hex, **não**
  hardcoded no arquivo).

Único INSERT de dados desta migration: o registro 0002 no ledger.
Zero INSERT em categories/products/images/prices. `catalog-demo-data.js`
**não** é migrado.

## 13. Identidade e transação

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

## 14. O que ficou FORA do escopo

Não criados nesta migration:

- customers, orders, carts, payments;
- stock / fiscal;
- releases / publications;
- admin users / audit logs;
- delivery / WhatsApp / loyalty;
- `shortDescription`, `unit`, `weight`, `customizable`;
- `minQuantity` / `quantityStep` / `maxQuantity` / `productionTime`;
- seed ou cópia de `catalog-demo-data.js`;
- trigger de `updated_at`;
- exclusão de sobreposição de preços;
- runner automático;
- execução em DEV/HOMOLOG/PROD.

## 15. Futuras migrations esperadas (não desta fase)

Ordem ilustrativa, sujeita a gate:

1. Atributos comerciais do produto (unidade, peso, quantidade, prazo,
   personalização, descrição curta), se o negócio confirmar.
2. Seed versionado **homologado** — nunca o demo atual como catálogo
   real (`docs/catalog-homologation.md` continua PENDENTE).
3. Carrinho / pedidos / clientes.
4. Publicação/versionamento de catálogo (releases).
5. Painel admin e auditoria.

Promoção continua `DEV → HOMOLOG → aprovação → PROD`. HOMOLOG e PROD
permanecem **bloqueados** nesta fase.

---

*Documento de controle. Nenhum SQL executado contra DEV, HOMOLOG ou
PROD nesta fase. Execução real da 0002 exige tarefa específica, gate e
aprovação explícita.*
