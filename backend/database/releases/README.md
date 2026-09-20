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

## 0002_conteudo_site_inicial.sql

Carga inicial do conteúdo institucional da Home, Encomendas, Festas e
Personalizados, usando os assets atuais do site.

- Idempotente: `INSERT ... ON CONFLICT (PK) DO NOTHING`
- Executor: Runtime APP (`amanteigados_homolog_app` em HOMOLOG)
- Não altera migrations estruturais
