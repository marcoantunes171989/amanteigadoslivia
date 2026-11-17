# SaaS multi-estabelecimento

Fundação adicionativa. A loja **Amanteigados Lívia** permanece a empresa padrão; `/produtos` continua funcionando.

## Migrations (SQL Editor)

1. `0009_adicionar_empresa_saas.sql` — tabelas `public.tab_empresa` / `tab_empresa_tema`
2. `0010_empresa_vinculos_e_tipografia.sql` — tipografia + vínculos usuário/produto/categoria/venda

Rodar cada uma em **query nova**.

## URL por empresa

- `/loja/{slug}`
- `/loja/{slug}/produtos`
- `/loja/{slug}/carrinho`
- `/loja/{slug}/acompanhar`

Exemplo: `/loja/amanteigados-livia/produtos`

## Admin

- **Gestão → Empresas**: cadastrar, URL, ativar/desativar, selecionar no painel
- **Branding**: cores, logo, WhatsApp e tipografia da empresa ativa
- Usuários, produtos e vendas filtrados pela empresa selecionada

## Isolamento

Vínculos em `public`:
- `tab_usuario_empresa`
- `tab_categoria_empresa`
- `tab_produto_empresa`
- `tab_venda_empresa`

Sem misturar dados entre estabelecimentos.
