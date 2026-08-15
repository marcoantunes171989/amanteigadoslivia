# Proposta de Página — Amanteigados Lívia
### Blueprint de conteúdo e design (para aprovação)

> Documento que reescreve, de forma estruturada, **todas as informações contidas
> na imagem de referência** (gerada no ChatGPT). Serve como especificação fiel
> para o desenvolvimento — nada é inventado além do que a imagem comunica.

---

## 1. Conceito visual

Landing page **clean e elegante** de uma confeitaria artesanal de biscoitos
amanteigados. Tom afetivo e delicado ("feitos com amor"), com muito espaço em
branco, fotografia protagonista e uma paleta quente e acolhedora.

| Princípio | Aplicação |
|-----------|-----------|
| **Respiro / whitespace** | Seções arejadas, margens generosas |
| **Fotografia protagonista** | Biscoitos em destaque no topo e nos cards |
| **Hierarquia serifada** | Títulos em serifa clássica; corpo em sans limpa |
| **Detalhes florais** | Tulipas e traços florais discretos como assinatura |

---

## 2. Identidade visual

### Cores
| Papel | Cor | Hex |
|-------|-----|-----|
| Primária (coral) | Botões, destaques, banner | `#e1574f` |
| Fundo creme | Base do site | `#fbf4e8` |
| Tinta (texto) | Títulos e leitura | `#2f2a27` |
| Cinza suave | Textos de apoio | `#7c736c` |
| Branco | Cards | `#ffffff` |

### Tipografia
| Uso | Fonte | Estilo |
|-----|-------|--------|
| Títulos (H1, H2, H3) | **Playfair Display** | Serifada, elegante |
| Corpo, menu, botões | **Poppins** | Sans-serif, limpa |
| Assinatura da marca | **Dancing Script** | Manuscrita |

---

## 3. Estrutura e conteúdo (seção por seção)

### 3.1 Cabeçalho (fixo no topo)
- **Logo (selo circular):** "SABOR IRRESISTÍVEL!" · **Amanteigados Lívia** · "FEITOS COM AMOR"
- **Menu:** Início · Produtos · Festas · Personalizados · Contato
- **Botão (coral):** 🛍️ Fazer pedido

### 3.2 Hero (topo)
- **Título:** Amanteigados **feitos com amor** *(2ª linha em coral)*
- **Subtítulo:** Sabores irresistíveis para presentear, celebrar e compartilhar.
- **Botões:** `Ver produtos →` (coral) · `Conheça nosso trabalho` (contorno)
- **Imagem:** prato de biscoitos amanteigados + tulipas + caixa de presente kraft

### 3.3 Seção "Para cada momento" (3 cards)
| Card | Título | Texto |
|------|--------|-------|
| 1 | **Encomendas** | Perfeitos para presentear e adoçar o dia de quem você ama. |
| 2 | **Festas** | Deixe sua celebração ainda mais especial e saborosa. |
| 3 | **Personalizados** | Detalhes únicos que tornam cada momento inesquecível. |

*Cada card: foto + título + descrição + ícone de tulipa.*

### 3.4 Barra de diferenciais (3 itens)
| Ícone | Título | Texto |
|-------|--------|-------|
| 🥣 | **Produção artesanal** | Feito à mão, com ingredientes selecionados. |
| 🤍 | **Feitos com carinho** | Receitas tradicionais que conquistam corações. |
| 📅 | **Sob encomenda** | Tudo preparado especialmente para você. |

### 3.5 Faixa de chamada (banner coral)
- **Título:** Seu momento merece um sabor especial
- **Texto:** Encomende com facilidade e receba com todo carinho.
- **Botão (branco):** Fazer meu pedido →

### 3.6 Rodapé
- **Marca:** *Amanteigados Lívia* · FEITOS COM AMOR
- **Frase:** Amanteigados feitos com amor para adoçar seus melhores momentos.
- **Redes:** Siga-nos → Instagram · Fale conosco → WhatsApp

---

## 4. Comportamento responsivo

| Elemento | Desktop | Celular |
|----------|---------|---------|
| Menu | Links na horizontal | Menu hambúrguer + botão de sacola |
| Hero | Texto à esquerda, imagem à direita | Empilhado (texto → botões → imagem) |
| Cards | 3 colunas (foto em cima) | Lista vertical (foto ao lado do texto) |
| Diferenciais | 3 colunas com divisórias | 3 colunas compactas (ícone + título) |
| Banner / Rodapé | Em linha | Empilhado |

---

## 5. Observações profissionais (20+ anos de design)

- **Fidelidade:** layout, grid, cores, tipografia e espaçamentos replicam a
  referência 1:1. Validado em telas desktop (1440px) e mobile (390px).
- **Imagens:** o topo e os cards têm *encaixes* prontos para as **fotos reais**
  dos biscoitos — é só inserir na pasta `/assets` (ver `assets/README.md`).
  Enquanto não chegam, ilustrações vetoriais elegantes ocupam o lugar.
- **Performance/robustez:** HTML + CSS + JS puro, ícones e ilustrações em SVG
  inline — carregamento rápido e sem dependências que quebram.
- **Acessibilidade:** textos alternativos, contraste adequado e navegação por
  teclado no menu.
- **Escalabilidade:** estrutura preparada para virar páginas internas
  (Produtos, Contato) e integração de pedidos por WhatsApp.

---

*Aprovado o conteúdo acima, o desenvolvimento entrega a página idêntica à
imagem — como já está publicada em produção.*
