# Landing PedidoPrime — especificação

Fonte visual obrigatória: `docs/referencia.html` (espelho de `landing-pedidoprime.html`).

## Objetivo

Landing de marketing do **PedidoPrime**: cardápio online com pedidos pelo WhatsApp. Página estática, sem dependências externas além de fontes do sistema.

## Rotas

- Domínio oficial da landing (único acesso público): `https://cardapio.pedidoprime.com.br`
- Em `cardapio.pedidoprime.com.br`, `/`, `/produtos`, `/carrinho` e `/acompanhar` redirecionam para `/landing` (nunca cardápio de loja)
- Qualquer `/landing` fora desse host redireciona (308) para `https://cardapio.pedidoprime.com.br/`
- Cardápio Amanteigados Lívia: `https://amanteigadoslivia.pedidoprime.com.br` → `/produtos`
- CTAs WhatsApp: `https://wa.me/5518996075887`

## Tokens (CSS variables)

| Token | Light | Dark |
|-------|-------|------|
| `--bg` | `#fbfaf7` | `#0f1713` |
| `--surface` | `#fff` | `#17221c` |
| `--text` | `#1d2b25` | `#eaf3ee` |
| `--muted` | `#5d6b64` | `#9db0a6` |
| `--brand` | `#128c4a` | `#2fd37a` |
| `--brand-d` | `#0b6b38` | `#25b565` |
| `--accent` | `#ffb703` | — |
| `--line` | `#e6e3da` | `#27362d` |
| `--soft` | `#e9f6ee` | `#16281e` |
| `--chat` / `--bubble` / `--out` | ver referência | ver referência |

Dark mode: `prefers-color-scheme: dark` e `data-theme="dark"`.

## Seções (ordem fixa)

1. **Header sticky** — logo `PedidoPrime`, links Como funciona / Recursos / Dúvidas, CTA WhatsApp.
2. **Hero** (`#topo`) — badge, H1, lead, CTAs (Quero meu cardápio + Ver como funciona), proofs, mock de 2 phones (cardápio + chat).
3. **Como funciona** (`#como`, `.alt`) — 3 cards numerados.
4. **Recursos** (`#recursos`) — 6 cards (ícone + título + texto).
5. **Acompanhamento** (`.alt` + `.split`) — status steps + ticks.
6. **Para todo tipo de negócio** — tags de segmentos.
7. **FAQ** (`#faq`) — 4 `<details>`.
8. **CTA final** — bloco `.final` verde escuro.
9. **Footer** — © 2026 + pedidoprime.com.br.

## Layout / responsivo

- `.wrap` max 1120px (1240px ≥1400px)
- Hero/split 2 colunas → 1 coluna ≤900px
- Grids g3/g4 → 2 cols ≤900px → 1 col ≤560px
- Links do nav (exceto `.btn`) ocultos ≤900px
- Safe-area + `prefers-reduced-motion`

## Critério de aceite

Implementação em `landing.html` deve espelhar `docs/referencia.html` seção a seção (estrutura, classes, textos e estilos). Após o build, comparar cada seção com a referência.
