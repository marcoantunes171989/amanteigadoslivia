# Especificação do Cardápio Digital — Amanteigados Lívia

> Documento de especificação técnica (Fase 2.2). Não altera comportamento do
> site. Serve como contrato técnico para a implementação futura da Fase 3.
> Nenhum dado comercial deste documento deve ser tratado como confirmado a
> menos que explicitamente marcado como **CONFIRMADO**.

---

## 1. Diagnóstico do catálogo atual

Arquitetura encontrada, sem framework/backend/banco:

```
index.html      → Home
produtos.html    → /produtos (catálogo atual)
produtos.js      → dados + filtro + ordenação (100% client-side, array hardcoded)
styles.css       → estilos compartilhados (Home + Produtos)
app.js           → lógica compartilhada do menu mobile entre Home e Produtos;
                   contém também o scroll-spy, cujo efeito prático é
                   utilizado na Home
```

`produtos.html` carrega `app.js` e `produtos.js`, nessa ordem
(`<script src="app.js"></script>` seguido de
`<script src="produtos.js"></script>`) — ou seja, `app.js` **é** usado por
`/produtos`, não é exclusivo da Home. O `scroll-spy` de `app.js` (que marca
o link ativo do menu com base nos ids `#inicio`/`#encomendas`/
`#festas-momentos`/`#personalizados-historia`) só produz efeito visível na
Home porque `/produtos` não possui nenhum desses ids — mas o menu mobile
(abrir/fechar, ESC, fechar ao clicar em link) roda igualmente nas duas
páginas a partir do mesmo arquivo. **Qualquer alteração futura em `app.js`
deverá ser validada obrigatoriamente em `/` e em `/produtos`** — a lógica do
menu não deve ser duplicada exclusivamente em `produtos.js`.

`produtos.js` mantém um array `PRODUCTS` com 9 registros fixos no código-fonte,
renderizados via `innerHTML` diretamente no DOM, com filtro por `category`
(string livre) e ordenação por `bestSeller`/preço/nome. Não há `id` estável
além de uma string de slug informal, não há `slug` dedicado, não há
`categoryId`, não há `active`/`featured`, não há imagem específica por
produto (ver seção 10).

---

## 2. Auditoria de produtos

Busquei em todo o repositório (`PROPOSTA.md`, `README.md`,
`docs/amanteigados-reference/content-map.txt`,
`docs/amanteigados-reference/design-spec.json`, histórico do git) por
qualquer menção a produtos individuais, preços, pesos ou categorias de
cardápio. **Nenhum dos três documentos de referência do projeto menciona um
catálogo de produtos** — todos descrevem apenas a Home (Hero, "Para cada
momento", diferenciais, CTA, footer). O commit que introduziu `produtos.js`
(`ef94cca`, "Adiciona tela de Produtos") descreve a criação de um "catalogo
centralizado (9 itens)" sem citar nenhuma fonte externa. **Não foi
encontrada origem comercial/documental que permita homologar os 9 produtos
atuais** — os registros foram criados durante a implementação do catálogo de
demonstração e não possuem lastro documental/comercial identificável no
repositório.

Evidências adicionais de que os dados são placeholder:
- Todos os 9 produtos têm peso idêntico (`250g`) — uniformidade típica de
  dado de demonstração, não de catálogo real.
- As imagens não são fotografias específicas: apenas 3 arquivos
  (`assets/encomendas.jpg`, `assets/festas.jpg`, `assets/personalizados.jpg`
  — as mesmas 3 fotos da seção "Para cada momento" da Home) são reutilizados,
  cada um em exatamente 3 produtos "diferentes" — nenhuma foto retrata o
  sabor que anuncia.
- `bestSeller: true` aparece em apenas 3 dos 9 registros, sem qualquer dado
  de vendas associado — é uma flag de demonstração para exercitar a opção
  "Mais vendidos" do seletor de ordenação.
- Preços (`29.90` / `32.90` / `34.90` / `36.90`) e categorias (`Tradicionais`
  / `Recheados` / `Especiais` / `Personalizados`) não aparecem em nenhum
  documento do projeto.

### Tabela de auditoria

| Produto (id) | Nome confirmado? | Preço confirmado? | Peso confirmado? | Categoria confirmada? | Imagem específica? | Descrição confirmada? | BestSeller comprovado? | Origem encontrada? |
|---|---|---|---|---|---|---|---|---|
| `goiabada` | Não (placeholder) | Não (placeholder) | Não (placeholder) | Não (placeholder) | Não — reutiliza `encomendas.jpg` (foto genérica da Home) | Não (placeholder) | Não (sem dado de vendas) | Nenhuma |
| `chocolate` | Não (placeholder) | Não (placeholder) | Não (placeholder) | Não (placeholder) | Não — reutiliza `festas.jpg` | Não (placeholder) | Não (sem dado de vendas) | Nenhuma |
| `coco` | Não (placeholder) | Não (placeholder) | Não (placeholder) | Não (placeholder) | Não — reutiliza `personalizados.jpg` | Não (placeholder) | — (não marcado) | Nenhuma |
| `goiaba` | Não (placeholder) | Não (placeholder) | Não (placeholder) | Não (placeholder) | Não — reutiliza `encomendas.jpg` | Não (placeholder) | Não (sem dado de vendas) | Nenhuma |
| `mesclado` | Não (placeholder) | Não (placeholder) | Não (placeholder) | Não (placeholder) | Não — reutiliza `festas.jpg` | Não (placeholder) | — (não marcado) | Nenhuma |
| `limao` | Não (placeholder) | Não (placeholder) | Não (placeholder) | Não (placeholder) | Não — reutiliza `personalizados.jpg` | Não (placeholder) | — (não marcado) | Nenhuma |
| `gotas` | Não (placeholder) | Não (placeholder) | Não (placeholder) | Não (placeholder) | Não — reutiliza `encomendas.jpg` | Não (placeholder) | — (não marcado) | Nenhuma |
| `especial` | Não (placeholder) | Não (placeholder) | Não (placeholder) | Não (placeholder) | Não — reutiliza `festas.jpg` | Não (placeholder) | — (não marcado) | Nenhuma |
| `personalizado` | Não (placeholder) | Não (placeholder) | Não (placeholder) | Não (placeholder) | Não — reutiliza `personalizados.jpg` | Não (placeholder) | — (não marcado) | Nenhuma |

### Classificação

Todos os campos de todos os 9 produtos: **PLACEHOLDER** (dados plausíveis,
criados para demonstrar a UI de filtro/ordenação, sem lastro comercial ou
documental).

```
PRODUTOS ANALISADOS: 9
PRODUTOS COM DADOS COMERCIAIS TOTALMENTE CONFIRMADOS: 0
PRODUTOS COM DADOS PARCIAIS: 0
PRODUTOS PLACEHOLDER/NÃO HOMOLOGADOS: 9
```

**Conclusão:** nenhum dos 9 produtos atuais está apto a ir para produção
como está. A Fase 3 deve implementar a arquitetura funcional (busca, filtro,
cards, detalhe, quantidade) usando o **estado vazio seguro** enquanto dados
reais não forem fornecidos — nunca publicar estes 9 registros como cardápio
real.

---

## 3. Categorias

Categorias atuais (`Tradicionais`, `Recheados`, `Especiais`,
`Personalizados`) existem apenas como **strings hardcoded** duplicadas em
dois lugares (`data-category` nos botões de `produtos.html` e `category` nos
objetos de `produtos.js`), casadas por igualdade de string — não são uma
entidade própria, não têm origem documental, e não confirmadas pelo negócio.

**Modelo recomendado** (`categoryId`, não `category` livre):

```js
const CATEGORIES = [
  { id: "tradicionais",   name: "Tradicionais",   slug: "tradicionais",   active: true, order: 10 },
  { id: "recheados",      name: "Recheados",      slug: "recheados",      active: true, order: 20 },
  { id: "especiais",      name: "Especiais",      slug: "especiais",      active: true, order: 30 },
  { id: "personalizados", name: "Personalizados", slug: "personalizados", active: true, order: 40 },
];
```

Regras: a interface mostra apenas categorias `active` com pelo menos um
produto `active` associado; sempre existe a opção "Todos"; nenhuma categoria
vazia aparece por padrão. Os 4 nomes acima são apenas exemplo estrutural
herdado da UI atual — não confirmados como taxonomia oficial do negócio.

---

## 4. Busca

Especificação funcional confirmada:
- Campo de texto único, placeholder `Buscar amanteigados...`.
- Compara contra `name`, `shortDescription`, `description` e `categoryId`
  (nome da categoria resolvido).
- **Case-insensitive** e **accent-insensitive**: normalizar com
  `string.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()`
  (API nativa do JS, sem biblioteca externa) antes de comparar — assim
  `"limao"` encontra `"Limão"`.
- Não sincroniza a URL a cada tecla (apenas no carregamento inicial, via
  `?q=`, seção 12).

---

## 5. Filtros combinados

Categoria e busca operam em conjunto (AND lógico). Ordem de pipeline a
adotar na implementação:

```
produtos ativos → filtro de categoria → filtro de busca → ordenação → renderização
```

`getActiveProducts()` → `filterByCategory()` → `filterBySearch()` →
`sortProducts()` → `renderProducts()`, evitando lógica duplicada entre
funções.

---

## 6. Ordenação

Sem preços homologados, usar apenas opções neutras: **Nome A–Z** / **Nome
Z–A**. Se e quando existir tabela de preços oficial, adicionar **Menor
preço** / **Maior preço**. **Não** implementar "Mais vendidos" (opção atual
do seletor) nem qualquer ordenação por popularidade sem dado de vendas real
— hoje ela ordena por uma flag `bestSeller` sem lastro (seção 2).

---

## 7. Contador de resultados

Exibir contagem real pós-filtro (`"8 produtos"` / `"1 produto"`), tom
discreto (não é um destaque visual). Catálogo totalmente vazio usa o estado
específico da seção 9.1, não "0 produtos" como mensagem principal.

---

## 8. Anatomia do card

```
[ imagem ]
Categoria
Nome do produto
Descrição curta (shortDescription, 2–3 linhas)
Peso/Unidade — somente se existir
Preço — somente se existir (nunca "R$ 0,00" para ausência)
"Personalizável" — somente se customizable === true
Ver detalhes →
```

Nenhum campo ausente é renderizado com texto de preenchimento — campo sem
dado simplesmente não aparece no card.

---

## 9. Imagens

- Uma foto só representa um produto se houver evidência razoável de
  correspondência real; hoje **nenhum dos 9 produtos atende esse critério**
  (seção 2) — todos reutilizam as 3 fotos genéricas da Home.
- Produto sem imagem específica: **placeholder visual local** (fundo
  Creme/Baunilha do Design System + ornamento discreto + texto "Imagem em
  atualização"), nunca a foto de outro produto, nunca imagem externa/gerada.
- `loading="lazy"` + `decoding="async"` nos cards (Hero da Home continua
  `eager`, fora do escopo deste documento).

### 9.1 Estados vazios (3 obrigatórios)

**Catálogo sem dados** — título "Nosso cardápio está sendo atualizado";
texto "Estamos preparando as informações dos nossos amanteigados para
apresentar cada opção com todos os detalhes."; sem prazo/WhatsApp/produto
fictício.

**Categoria sem produtos** — título "Ainda não temos produtos nesta
categoria"; ação "Ver todos os produtos" (volta `category` para `all`).

**Busca sem resultado** — `Nenhum amanteigado encontrado para "{termo}"`
(termo inserido via `textContent`/nó de texto, nunca concatenado em
`innerHTML`); ação "Limpar busca".

---

## 10. Detalhes do produto (dialog)

Sem rota `/produto/:slug` nesta fase — visualização local via `<dialog>`
nativo (fallback para modal/drawer acessível em JS vanilla apenas se um
limite técnico real do `<dialog>` for identificado na implementação;
nenhuma biblioteca externa).

Conteúdo: apenas campos existentes, entre imagem, categoria, nome,
descrição, preço, preço promocional, peso, unidade, personalização,
quantidade mínima, prazo de produção — campo ausente não é renderizado, e
não se usa "Não informado" em massa.

Acessibilidade obrigatória: fechar com ESC, botão fechar com label, título
associado (`aria-labelledby`), foco inicial controlado, foco preso ao
dialog enquanto aberto, foco restaurado ao elemento que abriu ao fechar,
conteúdo por trás não navegável (`<dialog>` nativo resolve isso via
top-layer + `::backdrop`).

Ações permitidas no dialog nesta fase: **Fechar** e controles de
quantidade. **Nenhuma** ação de "Comprar" / "Adicionar ao carrinho" /
"Pedir pelo WhatsApp" — carrinho não existe ainda.

---

## 11. Quantidade

```
minQuantity: 1
quantityStep: 1
maxQuantity: null
```

Seletor `− 1 +`, inicia em `minQuantity` (nunca abaixo dele). Suporta
incremento diferente de 1 (`quantityStep`) e mínimo diferente de 1
(`minQuantity`), ex.: `minQuantity: 10, quantityStep: 5` → 10, 15, 20, 25.
`maxQuantity` só é definido quando existir limite real; `null` = sem limite
imposto artificialmente. Com preço confirmado, calcular total local
(`preço × quantidade`) como informação, sem gerar pedido/carrinho/checkout.

---

## 12. Modelo de dados recomendado

```js
// Product
{
  id: "",                    // estável, não é o índice do array
  slug: "",                  // ex.: "amanteigado-goiabada" — sem rota ainda
  name: "",
  shortDescription: "",      // card (2–3 linhas)
  description: "",           // detalhe (texto completo)
  categoryId: "",            // referencia Category.id
  price: null,                // number | null — nunca 0 para "ausente"
  promotionalPrice: null,
  unit: null,                 // "un" | "caixa" | "kit" | ...
  weight: null,                // ex.: "250 g" — independente de unit
  image: null,
  images: [],
  customizable: false,
  minQuantity: 1,
  quantityStep: 1,
  maxQuantity: null,
  productionTime: null,        // só preencher com dado oficial
  featured: false,              // destaque editorial ≠ bestSeller
  active: true,                  // false = oculto ao cliente
  order: 10,
}

// Category
{
  id: "",
  slug: "",
  name: "",
  active: true,
  order: 10,
}
```

`bestSeller` fica de fora da arquitetura inicial (seção 2: sem dado de
vendas confiável hoje). `featured` é destaque editorial manual, não deve ser
confundido com "mais vendido".

### Estado de interface (referência)

```js
const state = { query: "", category: "all", sort: "name-asc", selectedProductId: null, quantity: 1 };
```

Sem framework de estado — objeto simples, funções puras
(`getActiveProducts`, `filterProducts`, `sortProducts`, `renderCategories`,
`renderProducts`, `renderEmptyState`, `openProductDetails`,
`closeProductDetails`, `updateQuantity`, `syncFromUrl`), cada uma com
responsabilidade única.

---

## 13. Segurança de renderização

O catálogo é candidato a receber dados menos controlados no futuro
(planilha, CMS, API). A implementação futura deve preferir
`document.createElement()` + `textContent` + `setAttribute()` para
conteúdo dinâmico do produto, evitando `innerHTML` com template strings
interpolando `name`/`description`/termo de busca (padrão atualmente usado
em `produtos.js:147-161`, que deve ser revisto na Fase 3). Markup estático
confiável (ícones SVG do sprite) pode continuar como está.

---

## 14. URL (categoria e busca)

`/produtos?categoria=personalizados` seleciona a categoria se ela existir
entre as `active`; se não existir, cai em "Todos" silenciosamente (sem
erro). `/produtos?q=goiabada` pré-preenche a busca no carregamento; não é
necessário sincronizar a URL a cada caractere digitado.

---

## 15. Responsividade

Breakpoints a validar: 320/375/390/430/768/1024/1280/1440/1920, prioridade
390px. Grid: 1 coluna até 768px inclusive, 2 colunas entre ~769–1279px
(dependendo da largura efetiva do card), 3 colunas em 1280px+. Nunca 2
colunas espremidas em telas pequenas. Categorias no mobile em faixa
horizontal (`overflow-x:auto`, sem quebrar em múltiplas linhas, sem gerar
overflow horizontal na página). Modal: ~800–900px de largura máxima no
desktop; `calc(100% - 24px)` no mobile. Touch targets ≥ 44×44px em todos os
controles interativos (categorias, quantidade, fechar, limpar busca, "Ver
detalhes").

---

## 16. Acessibilidade e performance

1 único H1 por página, hierarquia H1→H2→H3 sem saltos, `focus-visible`,
navegação por teclado completa, contraste AA, `aria-live` curto e objetivo
para o contador de resultados (não relê o catálogo inteiro a cada tecla),
`prefers-reduced-motion` cobrindo modal/hover/entrada de cards/transições.
Zero dependência nova (sem jQuery/React/Swiper/Bootstrap/Tailwind/biblioteca
de modal ou busca) — JavaScript nativo é suficiente para todo o escopo
descrito.

---

## 17. Pendências comerciais (bloqueiam a publicação de dados reais)

1. **WhatsApp**: número atual é `5500000000000` (`produtos.js`,
   `produtos.html` ×3, `index.html` ×1) — placeholder auto-documentado no
   próprio `README.md` ("Troque o número do WhatsApp... pelos dados reais
   da loja"). Não substituir por número inventado. **Regra definitiva por
   página:**
   - **Home**: a Fase 3 não deve alterar a Home só para corrigir contatos.
     O placeholder permanece na Home, documentado como pendência comercial,
     até que o número oficial seja fornecido.
   - **Produtos**: como `/produtos` será reconstruída na Fase 3, a nova
     experiência **não deve** apresentar nenhuma ação funcional apontando
     para `https://wa.me/5500000000000` como se fosse um contato oficial —
     a ação deve ser removida/não renderizada em `/produtos` enquanto não
     houver número real. Não substituir por outro telefone, `#`,
     `javascript:void(0)` ou qualquer destino inválido; não criar botão
     visualmente ativo sem destino válido.
2. **Instagram**: link atual `https://instagram.com`, sem usuário — não é
   um perfil oficial confirmado. Mesma regra por página do item acima:
   permanece documentado como pendência na Home; em `/produtos`, a Fase 3
   não deve apresentá-lo como perfil oficial (remover/não renderizar essa
   ação ali). Quando os contatos oficiais forem fornecidos, ambos serão
   restaurados/atualizados nas páginas cabíveis.
3. **Alegação de entrega**: "Entrega rápida — Receba no conforto da sua
   casa com segurança e agilidade" (`produtos.html`, faixa de benefícios) —
   nenhuma documentação do projeto confirma um serviço de entrega real.
   **Recomendação: remover na Fase 3** até existir política de entrega
   documentada.
4. **Catálogo real**: nomes, preços, pesos, categorias, fotos por sabor,
   tempo de produção, quantidade mínima/incremento por produto,
   personalização real — tudo isto precisa ser fornecido pela Amanteigados
   Lívia antes de qualquer publicação.

---

## 18. Riscos identificados para a Fase 3

- Publicar os 9 produtos atuais como se fossem reais (preço/peso/foto
  incorretos induzindo o cliente a erro) — mitigado ao adotar o estado
  vazio seguro por padrão.
- Reaproveitar as 3 fotos genéricas da Home para múltiplos "sabores"
  diferentes no novo card, repetindo o problema atual.
- Categoria como string livre (em vez de `categoryId`) dificultando qualquer
  evolução futura (filtros, i18n, reordenação) — mitigado pelo modelo de
  dados recomendado (seção 12).
- `innerHTML` com interpolação de string (padrão atual) — abre superfície
  de risco caso dados deixem de ser 100% estáticos/controlados no futuro.

---

## 19. Recomendação

**FASE 3 PODE SER INICIADA: SIM**, somente sob as seguintes condições:

1. Os 9 produtos atuais não podem ser publicados como catálogo oficial —
   permanecem classificados como PLACEHOLDER/NÃO HOMOLOGADO (seção 2).
2. Enquanto não existirem produtos homologados, `/produtos` deverá utilizar
   o estado seguro "Nosso cardápio está sendo atualizado" (seção 9.1).
3. A Fase 3 pode implementar toda a arquitetura — categorias, busca,
   filtros, ordenação segura, cards, dialog, quantidades, estados vazios,
   responsividade, modelo `Product`, modelo `Category`, renderização
   segura — mesmo com `PRODUCTS` vazio.
4. Nenhum carrinho, checkout, pagamento ou pedido será criado nesta fase.
5. Nenhuma ação comercial de produto em `/produtos` utilizará o WhatsApp
   placeholder (`5500000000000`) como se fosse contato oficial (seção 17,
   item 1).
6. O Instagram genérico (`https://instagram.com`) não será apresentado como
   perfil oficial em `/produtos` (seção 17, item 2).
7. A Home não será redesenhada nesta fase — os placeholders de WhatsApp e
   Instagram que já existem nela permanecem como estão, documentados como
   pendência comercial.
8. `app.js` continua sendo código compartilhado entre Home e Produtos;
   qualquer alteração nele deverá ser validada obrigatoriamente em `/` e em
   `/produtos` (seção 1).
9. A alegação "Entrega rápida" deverá ser removida de `/produtos` na Fase 3
   enquanto não houver política comercial de entrega confirmada (seção 17,
   item 3).
