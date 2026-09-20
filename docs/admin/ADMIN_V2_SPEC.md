# Admin V2 — Homolog

Painel administrativo completo em HOMOLOG, no mesmo Supabase do catálogo público. PROD permanece bloqueado até aprovação humana.

## Ambientes

| Item | Valor |
|---|---|
| Supabase HML | `amanteigados-livia-homolog` (`ywlzswyepcawcgkllwlu`) |
| Database | `postgres` |
| Schema | `app` |
| Vercel HML | `amanteigados-livia-homolog` |
| URL | https://amanteigados-livia-homolog.vercel.app |
| PROD | não alterado nesta fase |

O PostgreSQL local continua apenas laboratório. A fonte oficial é o Supabase HOMOLOG.

## Autenticação

Login por e-mail + senha contra `app.tab_usuario_admin`.

- Hash: `crypto.scrypt` com salt aleatório por usuário (`senha_hash` + `senha_salt`)
- Comparação: `timingSafeEqual`
- Sessão: cookie HttpOnly, Secure, SameSite=Lax, HMAC SHA-256
- Payload: `id_usuario_admin`, `email`, `perfil`, `exp`
- Rate limit best-effort no login
- CSRF: Origin/Host em mutações admin
- Bootstrap do primeiro usuário: `scripts/criar-usuario-admin.mjs` (interativo, senha oculta)

`ADMIN_PASSWORD` não é mais o login operacional da tela.

## Auditoria

Tabela `app.tab_auditoria_admin`. Eventos de login, catálogo, vendas, usuários, agendamentos e publicação. Segredos nunca entram em `detalhes_json`.

## Catálogo, imagens e realtime

- CRUD de categorias/produtos/preços/imagens no painel
- Imagem por URL ou upload local (JPEG/PNG/WebP, máximo 2 MiB)
- Upload via signed URL para o bucket público `produto-imagens`
- Alteração imediata ou agendada (`app.tab_alteracao_agendada`, timezone `America/Sao_Paulo`)
- Worker interno `POST /api/interno/processar-alteracoes-agendadas` (`INTERNAL_JOB_SECRET`)
- `/api/catalogo` e `/api/catalogo/revisao` também aplicam alterações devidas automaticamente
- `/produtos` atualiza sem F5: Realtime Broadcast no canal `catalogo-homolog` + fallback `GET /api/catalogo/revisao` a cada 10s + timeout da próxima vigência

## Vendas e relatórios

`POST /api/vendas` captura o pedido na finalização do carrinho. Total recalculado no servidor. Idempotência por `chave_idempotencia`. Faturamento considera somente `CONFIRMADA`.

Relatórios: visão geral, vendas, produtos, catálogo, alterações e auditoria, com CSV.

## Publicação HML → PROD

Motor pronto, feature flag `PROMOCAO_PROD_HABILITADA=false`.

Enquanto false:

- dashboard e dry-run funcionam
- agendamento pode ser registrado
- "Publicar agora" devolve `409 production_not_enabled`
- nenhuma escrita em PROD
- worker `POST /api/interno/processar-publicacoes` marca `BLOQUEADA`

## Tabelas em `app`

- `schema_migrations` (ledger técnico)
- `tab_categoria`
- `tab_produto`
- `tab_produto_imagem`
- `tab_produto_preco`
- `tab_usuario_admin`
- `tab_auditoria_admin`
- `tab_alteracao_agendada`
- `tab_venda`
- `tab_venda_item`
- `tab_publicacao`

Migrations 0001 e 0002 são imutáveis. 0003 cria as tabelas do painel
(SHA256 `3b1db35ab9644b351668e4adc16a1ef167b4c70088f07add46d653ca76c4960a`).
