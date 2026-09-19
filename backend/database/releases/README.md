# Releases de dados — Amanteigados Lívia

Artefatos versionados de **carga de dados**, separados das migrations
estruturais em `backend/database/migrations/`.

- Migrations (`0001`, `0002`, …) criam schema/tabelas.
- Releases inserem dados de negócio, com UUIDs estáveis e sem sequence.

## 0001_catalogo_inicial.sql

Carga inicial do cardápio de HOMOLOG, copiada do catálogo demonstrativo
atual (`catalog-demo-data.js`).

- Idempotente: `ON CONFLICT (PK) DO NOTHING`
- Executor: Runtime APP (`amanteigados_homolog_app` em HOMOLOG)
- Não altera `0001_create_migration_ledger` nem `0002_criar_nucleo_catalogo`

Contagens esperadas após a primeira aplicação: 4 categorias, 8 produtos,
8 imagens, 9 preços (incluindo 1 preço promocional do Mesclado).
