# Amanteigados Lívia 🌷

Landing page e cardápio da confeitaria artesanal **Amanteigados Lívia**.

## Ambientes

| Ambiente | Papel |
|---|---|
| **DEV** | Laboratório local (Git, schema, API, frontend) |
| **HOMOLOG** | Validação oficial (Vercel `homologacao` + Supabase `amanteigados-livia-homolog`) |
| **PROD** | Cliente/público (Vercel + Supabase prod). Bloqueado até aprovação |

Fluxo:

```
DEV → GitHub → Vercel HOMOLOG → Supabase HOMOLOG → teste/aprovação → Vercel PROD + Supabase PROD
```

Produção não é publicada automaticamente.

## Cardápio

A tela `/produtos` carrega categorias, produtos, imagens e preços via
`GET /api/catalogo` (backend Node, variável server-side `DATABASE_URL`).
O navegador nunca recebe a connection string.

## 🚀 Como rodar o frontend localmente

Basta abrir o `index.html` no navegador, ou servir a pasta:

```bash
python3 -m http.server 8000
# acesse http://localhost:8000
```

A API de catálogo (`/api/catalogo`) no HOMOLOG é a função Vercel em
`api/catalogo.js`. Localmente, o backend Express em `backend/` expõe a
mesma rota quando configurado.

## ✨ Recursos

- **Hero** com chamada principal e ilustração dos biscoitos em SVG
- Seção **"Para cada momento"** — Encomendas, Festas e Personalizados
- Barra de diferenciais — Produção artesanal, Feitos com carinho, Sob encomenda
- **Banner CTA** com link direto para pedido via WhatsApp
- Rodapé com redes sociais (Instagram + WhatsApp)
- Menu mobile (hambúrguer) e navegação com destaque ao rolar

## 🛠️ Tecnologias

- HTML5 semântico
- CSS3 puro (Grid, Flexbox, variáveis, media queries)
- JavaScript vanilla (menu mobile + scrollspy)
- Ilustrações e ícones em SVG inline (sem dependências externas de imagem)
- Fontes: Playfair Display, Poppins e Dancing Script (Google Fonts)

## 🎨 Paleta

| Cor | Hex |
|-----|-----|
| Coral (primária) | `#e1574f` |
| Creme (fundo) | `#fbf4e8` |
| Tinta (texto) | `#2f2a27` |

## 📁 Estrutura

```
.
├── index.html   # marcação + ilustrações SVG
├── styles.css   # estilos e responsividade
├── app.js       # menu mobile e scrollspy
└── README.md
```

## 📞 Personalização

Troque o número do WhatsApp (`5500000000000`) e o link do Instagram no
`index.html` pelos dados reais da loja.

---

Feito com 🤍 para adoçar seus melhores momentos.
