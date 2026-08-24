# Especificação Funcional do Carrinho Demonstrativo — Amanteigados Lívia

> Contrato técnico e funcional do carrinho de compras **demonstrativo** de
> frontend (Fase 4A.0). Documento de controle — **não altera comportamento
> do site**. Nenhuma linha de código de carrinho deve ser escrita sem
> primeiro estar coberta por uma decisão registrada aqui. Commit-base
> auditado: `2cde1bf5e46e1f17eaf347b65a6481b1ab8b4ea1`.

**IMPLEMENTAÇÃO NESTA FASE: NENHUMA.** Este documento não cria
`carrinho.html`, `cart.js`, `catalog-core.js` nem altera `produtos.js`,
`produtos.html`, `styles.css`, `app.js` ou `vercel.json`.

---

## 1. Objetivo

Definir, antes de qualquer linha de código, o contrato funcional e técnico
de um carrinho de compras **exclusivamente demonstrativo** para o Cardápio
Digital: permitir que um visitante monte uma simulação de pedido
(adicionar, ajustar quantidade, remover, ver subtotal) inteiramente no
frontend, sem gerar pedido real, sem backend e sem dado comercial real —
consistente com o modo `demo` já estabelecido em `/produtos` na Fase 3.3.

## 2. Escopo

Cobertos por esta especificação (para implementação em fase futura):

- Adicionar produto ao carrinho a partir do dialog de detalhes de `/produtos`.
- Página `/carrinho`: listar itens, alterar quantidade, remover item,
  limpar carrinho, ver subtotal.
- Modelo de estado do carrinho e regra de persistência entre `/produtos`
  e `/carrinho`.
- Regras de preço/promoção/quantidade reaproveitadas do catálogo (nunca
  duplicadas com lógica divergente).
- Acessibilidade, responsividade, segurança de renderização e aviso de
  modo demonstrativo no carrinho.
- Arquitetura de compartilhamento de helpers entre `produtos.js` e o
  futuro `cart.js`.

## 3. Fora de escopo

Explicitamente **não** cobertos nesta fase nem na futura Fase 4A:

- Checkout, dados pessoais (nome/telefone/e-mail/endereço/CPF), pagamento,
  geração de pedido real, envio por WhatsApp.
- Backend, API, banco de dados, autenticação, painel administrativo.
- Frete, taxa, cupom, imposto, serviço, total final de pedido.
- Definição detalhada de campos de entrega/retirada/checkout (pertence à
  Fase 4B — apenas dependências são registradas na seção 27).
- Qualquer dado comercial real (preço, produto, contato, política).

## 4. Fluxo

```
/produtos
  → abrir dialog de um produto (já existente)
  → escolher quantidade (stepper já existente no dialog)
  → "Adicionar ao carrinho" (novo, dentro do dialog)
  → feedback discreto (aria-live + toast curto)
  → visitante pode continuar navegando ou ir para /carrinho

/carrinho
  → lista de itens (produto resolvido pela fonte de catálogo atual)
  → alterar quantidade por item (mesmas regras de min/step/max do catálogo)
  → remover item
  → limpar carrinho (com confirmação)
  → ver subtotal geral
  → "Continuar escolhendo" → volta para /produtos
```

Nenhum passo posterior a "Continuar escolhendo" existe nesta fase — não há
"Finalizar compra", "Finalizar pedido" nem qualquer ação que sugira um
pedido real em andamento.

## 5. Rota

**Decisão: `/carrinho`, servida por `carrinho.html`.**

Já suportado sem mudança de configuração: `vercel.json` tem
`"cleanUrls": true`, o mesmo mecanismo que hoje mapeia `/produtos` →
`produtos.html`. Motivos para o nome (reafirmando o prompt desta fase):
nome inequívoco em português, não afirma que existe um pedido em
andamento, separa claramente carrinho de checkout, e é adequado ao
estágio atual do produto (Fase 4A, sem checkout).

## 6. Estado do carrinho

**Modelo mínimo (decisão adotada):**

```js
{
  version: 1,
  items: [
    { productId: "mesclado", quantity: 2 }
  ]
}
```

**O que o carrinho NUNCA armazena como snapshot:** nome, descrição, foto,
preço, promoção, categoria, peso/unidade. Apenas `productId` (identidade)
e `quantity` (intenção do visitante). Todo o restante é resolvido, a cada
leitura, a partir da fonte de catálogo atualmente carregada
(`CATALOG_DATA`/`window.CATALOG_DATA`).

Motivo: evitar dois lugares de verdade para o mesmo dado. Um preço
"congelado" no storage divergindo silenciosamente do preço atual do
catálogo seria uma inconsistência pior do que recalcular sempre — e essa
divergência é exatamente o tipo de bug que a Fase 3.2.1 já corrigiu uma
vez para a ordenação (`getEffectivePrice()` como única fonte de verdade de
preço). O carrinho segue o mesmo princípio.

## 7. Persistência

**Decisão: `sessionStorage`.**

| Alternativa | Avaliação |
|---|---|
| Memória JS (variável em runtime) | Perde o carrinho ao navegar entre `/produtos` e `/carrinho` (páginas estáticas, sem SPA/roteador) — inviável para o fluxo descrito na seção 4. |
| `localStorage` | Sobrevive ao fechamento do navegador e a novas sessões — para dados **demonstrativos** e fictícios, isso é justamente o problema: um carrinho demo pode persistir indefinidamente e ser confundido, semanas depois, com uma intenção real. |
| `sessionStorage` (escolhida) | Sobrevive à navegação entre páginas na mesma aba (cobre o fluxo `/produtos` ↔ `/carrinho`), não exige backend, e se autolimpa ao fechar a aba — apropriado para uma demonstração que não deve deixar resíduo permanente no navegador do visitante. |

## 8. Segurança do storage

**Chave (decisão): `amanteigadosLivia.demoCart.v1`.**

- Namespaced (prefixo da marca) para não colidir com outras chaves.
- Inclui `demoCart` explicitamente — nunca `cart`/`carrinho`/`items`
  genéricos — para que, ao migrar para um catálogo `live`/API, a chave do
  carrinho demonstrativo seja trivialmente identificável e **não seja
  reaproveitada automaticamente** como se fosse um carrinho real (ver
  seção 27).
- Sufixo `.v1` documenta a versão do formato; uma mudança incompatível de
  modelo usa `.v2`, e o parser (seção 18) descarta silenciosamente
  qualquer `version` que não reconheça.

**Fallback sem `sessionStorage` (navegador com storage bloqueado/indisponível):**
o carrinho deve continuar funcionando **em memória** durante a página
atual — sem erro fatal, sem interface quebrada. A única degradação
aceitável é a perda do carrinho ao navegar/recarregar. Toda leitura e
escrita no storage deve ser envolvida em `try/catch`; uma falha de escrita
não impede a operação de continuar funcionando em memória para o restante
da sessão de página.

**Parse defensivo:** `JSON.parse` sempre em `try/catch`. Qualquer uma
destas condições resulta em carrinho vazio (nunca em exceção propagada):
JSON inválido, estrutura sem `items` array, `version` ausente ou diferente
de `1`.

## 9. Regras de quantidade

### Definição — produto utilizável pelo carrinho (Fase 4A.0.1)

Um produto só é **utilizável pelo carrinho** (adicionável via `addItem()`,
mantido por `sanitizeCart()`, retornado por `getCartItems()`, contado em
`getCartSubtotal()`) quando **todas** as condições abaixo são verdadeiras
ao mesmo tempo:

1. existe na fonte de catálogo atual (`getProductById(productId)` resolve
   para um objeto);
2. `product.active === true`;
3. possui `id`/`productId` válido (`string`/`number` não vazio — mesmo
   critério de `isValidProduct()` em `produtos.js`);
4. `getEffectivePrice(product)` é válido (`isValidPrice(...)`, ver seção
   10 para a regra congelada);
5. possui **regras de quantidade coerentes** (`minQuantity`,
   `quantityStep`, `maxQuantity` formam uma grade consistente — regra
   congelada na seção 13).

Falhar em **qualquer um** desses critérios torna o produto **não
utilizável pelo carrinho nesta fase** — o item correspondente é rejeitado
(se for uma tentativa de adição) ou sanitizado/removido (se já estiver
persistido). Não há estado intermediário ("parcialmente utilizável").

### Regras de quantidade — mecânica

O carrinho **não define uma regra própria** de quantidade — reaproveita
integralmente `getQuantityMin(product)`, `getQuantityStep(product)`,
`getQuantityMax(product)` e `clampQuantity(product, value)`, já existentes
em `produtos.js` desde a Fase 3 (ver seção 24 sobre onde essas funções
devem morar para serem compartilhadas sem duplicação).

**Validação de item armazenado (seção 19 do prompt da Fase 4A.0; regra
reforçada na Fase 4A.0.2 — ver seção 13):** todo item lido do storage
precisa ter `productId` (string não vazia) e `quantity` que seja
`number`, finito, inteiro e `> 0` — qualquer violação descarta o item
(não o carrinho inteiro; ver seção 13 para a lista explícita de valores
rejeitados: `NaN`, `Infinity`, `-Infinity`, string, `null`, `undefined`,
fracionário). Depois da validação estrutural, a quantidade só é aceita se
o produto for **utilizável** (definição acima) **e** a quantidade
pertencer **exatamente** à grade min/step/max do produto real —
**o storage nunca é normalizado, apenas validado**: uma quantidade
persistida fora da grade não é "corrigida" para o valor válido mais
próximo, o item inteiro é removido (algoritmo/distinção congelados na
seção 13).

**Produto inexistente ou inativo:** se `productId` não existir na fonte de
catálogo atual, ou existir mas `active !== true`, o item é **removido do
carrinho automaticamente na próxima leitura** (não apenas ocultado —
sanitizado do estado persistido). Nenhum "produto fantasma" é exibido, e
ele não entra no subtotal. Essa sanitização também cobre o caso de um
catálogo recarregado com produtos diferentes (ex.: dados demo trocados).

## 10. Regras de preço

O preço de cada item no carrinho é **sempre** `getEffectivePrice(product)`
recalculado a partir do produto resolvido pela fonte atual — nunca um
valor lido do storage. Isso significa que, se a página for recarregada
após uma mudança no catálogo (por exemplo, uma troca de `catalog-demo-data.js`
ou, futuramente, um novo preço vindo de API), **o carrinho reflete o preço
atual, não o preço no momento em que o item foi adicionado**. Isso é
aceitável e correto para um carrinho demonstrativo, que não é um pedido
confirmado (ver seção 21 sobre o motivo disso mudar em um pedido real).

### Regra congelada — produto sem preço efetivo válido (Fase 4A.0.1)

**Na Fase 4A, todo item do carrinho deve possuir `getEffectivePrice(product)`
válido.** Se `getEffectivePrice(product)` retornar `null` (ou qualquer
valor que `isValidPrice()` rejeite), o produto **não é utilizável** pelo
carrinho (ver definição na seção 9) e:

- **`addItem(productId, quantity)`** — não adiciona o produto. A operação
  é recusada (ver matriz de testes, seção 27, caso D).
- **`sanitizeCart()`** — remove qualquer item previamente persistido cujo
  produto, resolvido na fonte atual, não possua mais preço efetivo válido
  (ex.: o campo `price` do produto passou a `null`/`undefined` em uma
  atualização do catálogo).
- **`getCartItems()`** — nunca retorna esse item.
- **`getCartSubtotal()`** — nunca recebe esse item; ele não contribui para
  a soma.

Nenhuma linha do carrinho com preço vazio é mantida na Fase 4A. Em
particular, a UI **não** apresenta rótulos como "Consultar preço", "Sob
orçamento" ou "Preço indisponível" nesta fase — esses rótulos pressupõem
um modelo de precificação (`pricingMode`) que continua **não implementado**
(ver `docs/catalog-homologation.md`, seção 16: "IMPLEMENTAÇÃO: NÃO;
NECESSIDADE COMERCIAL: PENDENTE DE CONFIRMAÇÃO"). Se no futuro existir
venda sob orçamento, essa é uma extensão comercial formal separada, a ser
especificada e aprovada antes de qualquer implementação — não uma decisão
que o carrinho toma sozinho.

**Precisão sobre preço zero (Fase 4A.0.2 — `isValidPrice()` não muda):**
"preço válido"/"preço efetivo válido" nesta especificação segue
estritamente a semântica já existente em `produtos.js`:
`isValidPrice(value) = typeof value === 'number' && Number.isFinite(value)
&& value >= 0`. Isso significa que **`price: 0` é, por essa definição,
tecnicamente um preço válido** — um produto com `price: 0` (e sem
promoção) tem `getEffectivePrice() === 0`, é **utilizável** pelo carrinho,
e seu subtotal de item é `0 × quantity = 0`. "Preço ausente/inválido"
significa exclusivamente `null`, `undefined`, `NaN`, `Infinity`,
`-Infinity`, um tipo não numérico, ou qualquer outro valor que
`isValidPrice()` rejeite — **nunca** o número `0`. Esta especificação não
altera `isValidPrice()`; apenas documenta sua semântica já vigente para
que nenhuma implementação futura do carrinho trate `0` como sinônimo de
"sem preço".

## 11. Promoção

Mesma regra já homologada e usada em `produtos.js` desde a Fase 3.1/3.3 —
não duplicada, apenas reaplicada: uma promoção só é considerada válida
quando `price` é válido **E** `promotionalPrice` é válido **E**
`promotionalPrice < price`. Essa regra de validade vive **exclusivamente**
dentro de `getEffectivePrice()` (camada `catalog-core.js`, seção 24) —
nem `cart.js` nem a futura `carrinho.js` reimplementam a comparação
`promo < price`.

**Correção de arquitetura (Fase 4A.0.1, refinada na Fase 4A.0.2):** a
versão original deste documento sugeria que o carrinho reaproveitasse
`appendPriceMarkup()` de `produtos.js` diretamente — corrigido na Fase
4A.0.1 para "o carrinho cria sua própria marcação DOM". Essa segunda
formulação ainda era imprecisa: ela não distinguia `cart.js` (serviço,
sem DOM — seção 26) da futura `carrinho.js` (UI da página `/carrinho` —
seção 25). Correção definitiva (Fase 4A.0.2): **quem cria marcação DOM é
exclusivamente a futura `carrinho.js`, nunca `cart.js`.**

**Regra definitiva das três camadas envolvidas no preço:**

- `catalog-core.js` — funções puras `getEffectivePrice()`/`formatPrice()`,
  únicas donas da regra comercial (o que é preço, o que é promoção
  válida). Sem DOM.
- `cart.js` — usa esses valores apenas para **cálculo e retorno de
  dados** (ex.: `getCartItems()` devolvendo cada item já com seu
  `effectivePrice` resolvido, `getCartSubtotal()` somando esses valores).
  Sem DOM, sem markup, sem HTML.
- **A futura `carrinho.js`** (Fase 4A.2, ainda não criada) — consome
  `catalog-core.js` **e** `cart.js`, e é a única camada que cria a
  marcação DOM do carrinho: preço-base riscado, preço promocional em
  destaque, preço normal. Consome exclusivamente os *valores* já
  calculados por `getEffectivePrice()`/`formatPrice()` — nunca
  reimplementa `promo < price`.
- `produtos.js` mantém seu `appendPriceMarkup()` existente sem alteração
  — é a camada de apresentação de `/produtos`, equivalente ao papel que
  `carrinho.js` terá para `/carrinho`.

Resumindo: **markup DOM diferente por página é permitido; duplicar a
regra `promo < price` em qualquer camada além de `catalog-core.js` é
proibido — e a camada que efetivamente cria esse markup é sempre uma
camada de UI (`produtos.js` ou a futura `carrinho.js`), nunca `cart.js`.**

## 12. Subtotal

- **Subtotal do item** = `getEffectivePrice(product) × quantity`.
- **Subtotal geral** = soma dos subtotais de todos os itens **válidos**
  (produto existente, ativo, com preço válido). Um item sanitizado (seção
  9) não entra na soma.
- Rótulo obrigatório: **"Subtotal"**. Nunca "Total do pedido" — não há
  frete, taxa, desconto, cupom, imposto ou serviço nesta fase, e usar
  "Total" sugeriria um valor final que esta fase não calcula.

## 13. Adição e merge

**Adicionar produto novo:** carrinho vazio + adicionar Mesclado, qty 2 →
`{ version: 1, items: [{ productId: "mesclado", quantity: 2 }] }`.

**Adicionar produto já existente no carrinho (regra: mesclar, nunca
duplicar linha):** Mesclado já com `quantity: 2`; adicionar novamente com
`quantity: 3` → resultado `quantity: 5` na mesma linha (nunca duas linhas
do mesmo `productId`).

### Consistência de grade — pré-condição antes de normalizar (Fase 4A.0.1)

**Congelado:** quando `maxQuantity !== null`, ele só é um limite comercial
válido se, além de inteiro e `>= minQuantity`, **pertencer à mesma grade**
definida por `minQuantity`/`quantityStep`:

```
(maxQuantity - minQuantity) % quantityStep === 0
```

Exemplos válidos: `min 10, step 5, max 25` (grade `10, 15, 20, 25`); `min
1, step 1, max 10` (grade `1..10`). Exemplo **inválido**: `min 10, step 5,
max 12` — `12` nunca pertence à grade `10, 15, 20, ...`, então esse trio
de valores é uma configuração comercialmente inconsistente, não um
produto com regras de quantidade normais.

**Um produto cuja configuração de quantidade viole essa condição (ou
qualquer outra que impeça garantir min/step/max de forma coerente) não é
utilizável pelo carrinho** (ver definição na seção 9): não é adicionável
via `addItem()`, e se já estiver persistido, `sanitizeCart()` remove o
item. **O clamp nunca é aplicado para "consertar" silenciosamente um
`maxQuantity` fora da grade** — isso mascararia uma inconsistência
comercial (ex.: um cadastro futuro de produto com dados errados) fazendo
o sistema aceitar uma quantidade que a própria regra de negócio do produto
não permite. É preferível recusar o produto a inventar uma normalização.

Os 8 produtos demonstrativos atuais (`minQuantity: 1`, `quantityStep: 1`,
`maxQuantity: null`) já satisfazem trivialmente essa condição (sem `max`,
não há grade a violar) — nenhuma alteração de dados é necessária. Esta
regra é preventiva, para quando uma fonte real/API trouxer combinações
de min/step/max mais complexas.

### Duas fronteiras diferentes (Fase 4A.0.2 — distinção congelada)

O tratamento de quantidade **não é uma regra única** — depende de onde o
valor está entrando:

| Fronteira | O que é | Comportamento diante de valor fora da grade |
|---|---|---|
| **Entrada do storage** (`sanitizeCart()`, toda leitura de `sessionStorage`) | Dado **não confiável** — pode ter sido adulterado manualmente, corrompido, ou ficado obsoleto após uma mudança no catálogo/produto | **Valida e remove.** Nunca normaliza, nunca "adivinha" a intenção do visitante. |
| **Operação interna controlada** (`addItem()`, `updateItem()`, merge) | Dado gerado pela própria aplicação (ex.: soma de uma quantidade já válida no carrinho com uma quantidade nova válida escolhida no dialog) | Pode **normalizar** o resultado para a grade válida mais próxima, desde que o resultado final pertença exatamente a ela. |

Essa distinção existe porque normalizar um valor vindo do storage
equivaleria a inventar uma quantidade que o visitante nunca escolheu —
aceitável para o resultado de uma soma que a própria aplicação acabou de
calcular, mas não para um dado que pode ter sido editado fora do fluxo
normal da página (ex.: via DevTools).

### Storage fora da grade — `sanitizeCart()` valida, nunca normaliza

**Congelado:** um item recuperado de `sessionStorage` só é aceito quando
**todas** as condições abaixo são verdadeiras (além do produto ser
utilizável — seção 9):

```
quantity >= minQuantity
AND (quantity - minQuantity) % quantityStep === 0
AND (maxQuantity === null OR quantity <= maxQuantity)
```

Se qualquer condição falhar, **o item é removido** — `sanitizeCart()`
nunca converte o valor persistido para o ponto de grade mais próximo.

Exemplo (`minQuantity: 10`, `quantityStep: 5`, `maxQuantity: 25` — grade
`10, 15, 20, 25`):

| `quantity` no storage | Resultado |
|---|---|
| `10`, `15`, `20`, `25` | mantém (pertence à grade) |
| `9`, `11`, `12`, `14`, `17`, `22`, `26` | **remove** o item |

`12` **não** vira `10`; `17` **não** vira `15` ou `20`. `sessionStorage` é
entrada não confiável — a aplicação não deve adivinhar qual quantidade o
visitante "quis dizer" diante de um estado adulterado ou corrompido; é
preferível remover o item e deixar o visitante adicioná-lo novamente pela
UI (que só produz valores já dentro da grade).

### Algoritmo de normalização (min/step/max) — apenas para operações internas controladas

**Aplica-se exclusivamente a `addItem()`, `updateItem()` e ao merge
interno** (nunca a uma leitura de storage — ver distinção acima), e
somente a um produto já confirmado utilizável (grade consistente, seção
anterior):

```
n = round((raw - min) / step)          // n é inteiro >= 0
normalized = min + n * step
normalized = clamp(normalized, min, max ?? Infinity)
```

**Convenção de arredondamento (empate exato em `.5`):** `round()` segue o
comportamento nativo de `Math.round()` em JavaScript — `.5` arredonda para
cima (`round(2.5) = 3`, não `2`). Essa convenção deve ser a mesma em toda
a implementação futura (`addItem()`, `updateItem()`, merge) — nunca variar
o critério de desempate entre operações.

Uma quantidade válida sempre pertence a `min + n × step` (com `n` inteiro
`>= 0`) e, quando `max` existe, satisfaz `quantity <= max`. Como `max`
(quando existir) já foi validado como parte da grade na etapa anterior, o
`clamp` final nunca pode produzir um valor fora dela — ele apenas
restringe `n` ao maior múltiplo de `step` que ainda cabe entre `min` e
`max`, nunca introduz um valor "solto" como `12` no exemplo `min 10, step
5, max 12` (que, aliás, já teria sido recusado antes de chegar aqui, por
não ser uma configuração de produto válida).

Exemplo do prompt (`minQuantity: 10`, `quantityStep: 5`, sem `max`): valores
válidos são `10, 15, 20, 25, ...`; um valor bruto **gerado internamente**
(ex.: resultado de um merge) como `12` normaliza para `10`
(`round((12-10)/5)=0`); `13` normaliza para `15` (`round((13-10)/5)=1`).
Isso garante que uma operação interna **nunca produz** uma quantidade fora
da grade, mesmo somando duas quantidades que individualmente eram válidas
— mas essa normalização só se aplica ao *resultado de uma operação da
aplicação*, nunca a um valor lido diretamente do storage.

**Entrada de `addItem()`/`updateItem()` — apenas números finitos:** antes
de qualquer normalização, os valores `NaN`, `Infinity`, `-Infinity`,
`string`, `null`, `undefined`, `0`, negativo, ou um valor fracionário
quando a quantidade exige inteiro, **nunca** viram uma quantidade válida
silenciosamente — a operação é **rejeitada** (não há normalização "de
emergência" para um valor estruturalmente inválido). Isso é distinto de
um item já persistido no storage com um desses valores, que é sanitizado
(removido) por `sanitizeCart()` na próxima leitura, conforme a fronteira
acima (ver matriz de testes, seção 27).

**Merge (`addItem()` em produto já existente no carrinho):**
`rawTotal = existingQuantity + addedQuantity`. Se `rawTotal` já pertence à
grade, ele é usado diretamente; caso contrário, é normalizado pelo
algoritmo acima. Em ambos os casos, o resultado final está **sempre**
dentro da grade e **sempre** `<= maxQuantity` quando este existir (nunca
criar quantidade inválida, nunca lançar erro — o visitante simplesmente
não consegue ultrapassar o limite já comunicado no dialog de detalhes).
`updateItem()` segue a mesma fronteira: entrada estruturalmente inválida
é rejeitada; entrada numericamente válida é normalizada conforme a grade
quando necessário — o resultado final pertence sempre a ela.

## 14. Remoção

Ação "Remover" por item deve, na mesma operação:

1. excluir o item do estado em memória;
2. persistir o novo estado no `sessionStorage` (best-effort, ver seção 8);
3. recalcular o subtotal geral;
4. atualizar o contador do carrinho (seção 17);
5. emitir uma mensagem curta na região `aria-live` (ex.: "Produto removido
   do carrinho.").

**Diminuir quantidade até `minQuantity`:** o botão de diminuir fica
`disabled` ao atingir o mínimo — o item **não é removido automaticamente**.
Remoção é sempre uma ação explícita e separada ("Remover"), nunca um
efeito colateral de clicar em "−" repetidamente.

**Aumentar quantidade até `maxQuantity`:** quando `maxQuantity !== null`,
o botão de aumentar fica `disabled` ao atingir o máximo (mesmo padrão já
usado no stepper do dialog em `produtos.js`).

## 15. Limpar carrinho

Ação "Limpar carrinho" **exige confirmação** antes de executar — remover
todos os itens de uma vez é uma ação destrutiva e irreversível para o
visitante dentro daquela sessão de aba.

**Recomendação de mecanismo:** `window.confirm()` nesta primeira
implementação, não um `<dialog>` nativo dedicado. O projeto já usa
`<dialog>` para o detalhe de produto, e reaproveitar esse padrão para uma
confirmação simples de "sim/não" adicionaria complexidade (novo elemento,
novo foco a gerenciar, novo ciclo de abrir/fechar) para um ganho de UX
marginal frente a um `confirm()` nativo, que já é acessível via teclado e
leitor de tela por padrão do navegador. Se o produto evoluir para exigir
um padrão visual consistente com o Design System nessa confirmação, isso
pode ser revisto em uma fase futura — não é uma decisão definitiva, é a
opção de menor complexidade para a Fase 4A. **Não implementado nesta
fase.**

## 16. Estado vazio

```
H2/H3: "Seu carrinho está vazio"
Texto: "Escolha seus amanteigados no cardápio para montar uma
        demonstração do seu pedido."
CTA:   "Ver cardápio" → /produtos
```

Nunca sugerir que um pedido real foi concluído ou está em andamento.

## 17. Contador

**Decisão: soma das quantidades dos itens, não número de linhas.**

Exemplo do prompt: Produto A (qty 2) + Produto B (qty 3) → badge **5**
(não **2**). Isso comunica corretamente "quantos amanteigados estão no
carrinho", que é a pergunta que o visitante está fazendo ao olhar o badge
— o número de produtos *distintos* é uma informação secundária, já visível
ao abrir `/carrinho`.

## 18. Header/mobile

Planejar um acesso ao carrinho visível no header de `/produtos` e
`/carrinho` — por exemplo, um item adicional na `.nav`/`.header-actions`
já existente, com rótulo equivalente a "Carrinho (5)" ou um ícone com
badge numérico acessível (não apenas cor: o número deve estar em texto,
não só em uma bolinha colorida, para não depender de percepção de cor).

**Mobile:** não criar uma barra fixa inferior por padrão — é uma mudança
estrutural maior e não foi demonstrada necessária ainda. Recomenda-se
manter o acesso ao carrinho no mesmo header compacto/menu que já existe
(`#menuToggle`/`#mainNav`), com o badge visível tanto no ícone do header
quanto, opcionalmente, como uma linha no menu mobile expandido. Reavaliar
a necessidade de uma barra fixa apenas se o teste de usabilidade real
apontar baixa descoberta do carrinho no mobile — não implementar
preventivamente.

**Dependência arquitetural a registrar:** `app.js` hoje assume que
`#menuToggle` e `#mainNav` existem na página (não há checagem defensiva —
`toggle.addEventListener` quebraria se `toggle` fosse `null`). A futura
`carrinho.html` **precisa reaproveitar o mesmo header** (`site-header`,
`#menuToggle`, `#mainNav`) usado em `produtos.html`/`index.html` para que
`app.js` continue funcionando sem modificação nessa página. Isso não é uma
mudança nesta fase — é uma restrição a respeitar na implementação futura.

## 19. Página /carrinho

Estrutura planejada (mesma armação de `produtos.html`: header, main,
footer, mesmo sprite de ícones):

```
Header (reaproveitado de /produtos)
Hero/Título compacto — H1: "Seu carrinho"
Aviso de demonstração (.demo-notice, mesmo componente da Fase 3.3)
Lista de itens (ou estado vazio, seção 16)
Resumo (Subtotal)
Ações ("Continuar escolhendo" [+ nota sobre checkout futuro], "Limpar carrinho")
Footer (reaproveitado)
```

## 20. Modo demo

Enquanto `CATALOG_DATA.mode === 'demo'`, `/carrinho` deve exibir o mesmo
padrão de aviso já estabelecido em `/produtos` (Fase 3.3), adaptado ao
contexto:

```
"Carrinho demonstrativo. Esta experiência utiliza produtos e valores
ilustrativos e não gera um pedido real."
```

Mesmo componente visual (`.demo-notice`: fundo Baunilha, texto Cacau/Bordô,
ícone informativo) para manter consistência com `/produtos`.

## 21. SEO/noindex

Recomendação: `<meta name="robots" content="noindex,follow">` também em
`/carrinho`, pelo mesmo motivo já documentado para `/produtos` na Fase
3.3 — evitar que um carrinho com dados fictícios seja indexado como
conteúdo comercial real. **Nunca** aplicar essa diretiva na Home.

## 22. Acessibilidade

Requisitos obrigatórios para a implementação futura (mesmo padrão já
validado em `/produtos` desde a Fase 3):

- H1 único na página (`/carrinho`), hierarquia H2/H3 sem saltos.
- Todo botão de ação (remover, +/−, limpar) com `aria-label` claro.
- Região `aria-live="polite"` para: item adicionado, item removido,
  quantidade alterada, carrinho limpo — mensagens curtas, sem repetir o
  nome completo do produto desnecessariamente.
- `:focus-visible` em todos os controles interativos.
- `disabled` real (atributo HTML, não apenas classe visual) nos botões de
  quantidade ao atingir min/max.
- Links semânticos (`<a href="/produtos">`, não `<button>` com navegação
  via JS) para "Ver cardápio"/"Continuar escolhendo".
- Contraste AA (reaproveitar os tokens do Design System já validados).
- Operável 100% por teclado (Tab, Enter/Espaço, sem armadilha de foco).

## 23. Segurança DOM

Mesma regra do catálogo, sem exceção: dados do produto (resolvidos da
fonte de catálogo) e dados do storage (nunca confiáveis por padrão — ver
seção 8) nunca são interpolados em `innerHTML`. Toda renderização usa
`createElement`, `textContent`, `setAttribute`, `replaceChildren` — os
mesmos helpers seguros já em uso em `produtos.js` desde a Fase 3.

## 24. Arquitetura compartilhada

**Situação atual:** `catalog-demo-data.js` define `window.CATALOG_DATA`;
`produtos.js` é o único consumidor, e contém tanto os helpers de dados
(`getEffectivePrice`, `isValidPrice`, `formatPrice`, `getQuantityMin/Step/Max`,
`clampQuantity`, `loadCatalogSource`) quanto toda a lógica de renderização
DOM específica de `/produtos` (cards, dialog, estados vazios) misturados
no mesmo arquivo.

**Problema que isso cria para o carrinho:** a futura `/carrinho` precisa
resolver `productId → Product` e calcular preço/quantidade exatamente com
as mesmas regras — sem copiar essas funções para um novo arquivo (o que
criaria duas fontes de verdade para a mesma regra de negócio, o tipo de
duplicação que a Fase 3.2.1 já teve que corrigir uma vez).

**Recomendação: sim, extrair uma camada compartilhada (`catalog-core.js`,
seção 25) — não implementada nesta fase.** Essa camada teria somente
`loadCatalogSource()`, `priceFormatter`, `isValidPrice()`, `formatPrice()`,
`getEffectivePrice()`, `getQuantityMin()`, `getQuantityStep()`,
`getQuantityMax()`, `clampQuantity()`, `getProductById(id)` (hoje não
existe em `produtos.js` — `/produtos` nunca precisou buscar um produto
único por id, apenas filtrar listas; o carrinho precisa disso para
resolver cada `productId` salvo), e um novo helper puro de validação —
algo equivalente a `isUsableProduct(product)`/`isConsistentQuantityRange(product)`
— que encapsula a definição de "produto utilizável" (seção 9) e a
consistência de grade min/step/max (seção 13), para que `sanitizeCart()`
e `addItem()` não reimplementem esses critérios cada um a seu modo.

**Regra definitiva de camadas (Fase 4A.0.1, com a fronteira de `cart.js`
precisada na Fase 4A.0.2 — sem ambiguidade):** `catalog-core.js` é e
permanece **sem DOM**. Nunca entram nessa camada: `createElement`,
`textContent`, `replaceChildren`, `appendPriceMarkup()`,
`renderProductImage()`, ou qualquer outra função de renderização visual.
Isso vale tanto hoje quanto em qualquer refactor futuro: se uma função
toca o DOM, ela pertence a uma camada de apresentação — `produtos.js`
(já existente) para `/produtos`, ou a futura `carrinho.js` (Fase 4A.2)
para `/carrinho` — **nunca a `catalog-core.js`, e nunca a `cart.js`**
(que também é sem DOM — ver seção 26, regra reforçada na Fase 4A.0.2).
`produtos.js` continua livre para manter `appendPriceMarkup()` como está;
quem constrói a marcação DOM do carrinho é exclusivamente a futura
`carrinho.js`, consumindo apenas os valores de
`getEffectivePrice()`/`formatPrice()` (ver seção 11) — nunca `cart.js`,
que devolve dados, não elementos de página.

### Cadeia de camadas — arquitetura final documentada (Fase 4A.0.2)

```
catalog-demo-data.js   (dados temporários — window.CATALOG_DATA)
        ↓
catalog-core.js        (regras puras do catálogo — sem DOM)
        ↓
   ┌────┴────┐
produtos.js   cart.js  (UI de /produtos)   (serviço do carrinho — sem DOM)
                            ↓
                       carrinho.js         (UI de /carrinho, Fase 4A.2)
```

- `catalog-demo-data.js` — fonte de dados demonstrativa temporária.
- `catalog-core.js` — regras puras do catálogo (preço, quantidade,
  resolução de produto por id). Sem DOM.
- `produtos.js` — UI exclusiva de `/produtos`. Continua responsável só
  por renderizar o catálogo; na Fase 4A.2 poderá também chamar
  `window.AmanteigadosCart.addItem(...)` (ou interface equivalente
  exposta por `cart.js`) a partir do botão "Adicionar ao carrinho" do
  dialog, **sem que sua própria renderização seja transferida para
  `cart.js`** — `produtos.js` continua desenhando os cards e o dialog do
  catálogo, apenas passa a notificar o serviço de carrinho quando o
  visitante adiciona um item.
- `cart.js` — serviço/estado do carrinho (Fase 4A.1). Consome
  `catalog-core.js`. Sem DOM.
- `carrinho.js` — **futura** UI exclusiva de `/carrinho` (Fase 4A.2, não
  criada nesta fase nem na 4A.1). Consome `catalog-core.js` e `cart.js`;
  é a única camada que cria markup, responde a cliques, renderiza o
  aviso demo, o subtotal visual e o `aria-live` do carrinho.

## 25. Estratégia de implementação

**Decisão: dividir em duas fases (não uma fase única).**

- **Fase 4A.1 — Extração mínima (`catalog-core.js`) + serviço `cart.js`.**
  Move os helpers listados na seção 24 de `produtos.js` para
  `catalog-core.js` **sem alterar seu comportamento**, atualiza
  `produtos.js` para consumir a nova camada (import via `<script>` na
  mesma ordem: `catalog-demo-data.js` → `catalog-core.js` → `produtos.js`),
  e testa exaustivamente que `/produtos` continua idêntico (regressão
  completa: busca, filtro, ordenação, dialog, total, responsividade,
  console). Cria `cart.js` (funções da seção 26) consumindo
  `catalog-core.js`, mas **ainda sem UI de carrinho** — apenas a camada de
  serviço, testável isoladamente.
- **Fase 4A.2 — UI de `/carrinho` + botão "Adicionar ao carrinho".**
  Só começa depois que a Fase 4A.1 estiver auditada e confirmada sem
  regressão em `/produtos`. Cria `carrinho.html` e **`carrinho.js`** (a UI
  exclusiva de `/carrinho` — renderização de itens, markup de preço,
  botões +/−/Remover/Limpar, aviso demo, subtotal visual, `aria-live`,
  badge do carrinho), adiciona o botão "Adicionar ao carrinho" e o badge
  no header de `produtos.html`, e liga tudo ao `cart.js` já testado na
  Fase 4A.1 (`cart.js` em si **não muda** nesta fase — apenas passa a ter
  consumidores de UI).

**Justificativa:** mover código de um catálogo que já está em produção
(mesmo que em modo demo) é uma operação de risco não-trivial — um erro na
extração quebraria `/produtos`, não apenas o carrinho ainda inexistente.
Separar "mexer no que já funciona" (4A.1) de "construir o que é novo"
(4A.2) permite auditar e reverter a extração isoladamente, sem competir
com a superfície de bugs de uma UI nova. Uma fase única multiplicaria o
raio de explosão de qualquer erro de extração pela superfície inteira do
carrinho novo, dificultando isolar a causa de qualquer regressão.

## 26. Serviço de carrinho (`cart.js` — não implementado nesta fase)

**`cart.js` é um serviço — não uma camada de UI (Fase 4A.0.2, sem
ambiguidade).** Ele **nunca** conterá, nem na Fase 4A.1 nem depois:

- `document.createElement`, `innerHTML`
- `textContent`, `replaceChildren` (ou qualquer manipulação de nós DOM)
- `querySelector`/`getElementById` (ou qualquer busca por elemento de
  página)
- event listeners de UI (clique de botão, input, etc.)
- renderização de qualquer tipo (cards, listas, itens)
- toast visual, badge visual
- markup de preço (preço-base riscado, preço promocional em destaque)
- qualquer manipulação de elementos HTML

`cart.js` **não conhece elementos de página** — apenas estado e dados. A
camada que faz tudo isso é a futura `carrinho.js` (Fase 4A.2, seção 24),
que **consome** `cart.js`, nunca o contrário.

Interface conceitual recomendada, consumindo `catalog-core.js`:

```
loadCart()          // lê sessionStorage com fallback defensivo (seção 8)
saveCart(cart)       // escreve sessionStorage, tolera falha (memória permanece fonte de verdade da página atual)
sanitizeCart(cart)    // VALIDA e REMOVE item inválido/fora da grade — nunca normaliza estado do storage (seção 13)
getCartItems()        // itens já sanitizados, resolvidos contra o catálogo atual (productId + Product + effectivePrice) — nenhuma quantity fora da grade chega aqui
addItem(productId, quantity)     // rejeita entrada estruturalmente inválida; merge se já existir, normalizando o RESULTADO da operação (seção 13)
updateItem(productId, quantity)  // mesma fronteira de addItem — rejeita entrada inválida, normaliza o resultado da operação (seção 13)
removeItem(productId)
clearCart()
getCartCount()         // soma de quantidades dos itens já sanitizados (seção 17)
getCartSubtotal()      // soma dos subtotais válidos, apenas itens que sobreviveram à sanitização (seção 12)
```

**Evitar globals descontrolados:** se `cart.js` precisar expor algo em
`window` para ser consumido por `carrinho.js`/`produtos.js`, deve expor
um único namespace explícito — por exemplo `window.AmanteigadosCart` — e
não funções soltas no escopo global. Isso segue o mesmo padrão que
`catalog-demo-data.js` já usa hoje com `window.CATALOG_DATA` (um único
ponto de entrada nomeado, não dados espalhados).

## 27. Testes (a executar quando a Fase 4A for implementada)

**Matriz de teste — adicionar (`addItem`), casos A–E (Fase 4A.0.1):**

| Caso | Cenário | Resultado esperado |
|---|---|---|
| A | Produto ativo + `effectivePrice` válido + quantidade válida | Adiciona |
| B | `productId` inexistente na fonte atual | Rejeita |
| C | Produto existente com `active !== true` | Rejeita |
| D | Produto ativo, `getEffectivePrice(product) === null` | Rejeita (seção 10) |
| E | Produto com configuração de quantidade inconsistente (grade violada — seção 13) | Rejeita |

**Matriz de teste — sanitização (`sanitizeCart`), mesmos critérios
aplicados a itens já persistidos:**

Um item no storage cujo produto, resolvido pela fonte atual, **não
exista**, **esteja inativo**, **não possua preço efetivo válido**, ou
**tenha quantidade estruturalmente inválida/fora da grade** deve ser
**removido** na leitura. Nenhum desses itens entra no contador (seção 17)
ou no subtotal (seção 12) — nunca parcialmente, nunca com valor
substituto.

**Testes obrigatórios — storage fora da grade (Fase 4A.0.2, `sanitizeCart`
VALIDA e REMOVE, nunca normaliza — ver seção 13):** produto `min 10, step
5, max 25` (grade `10, 15, 20, 25`):

| `quantity` no `sessionStorage` | Resultado |
|---|---|
| `10` | mantém |
| `15` | mantém |
| `20` | mantém |
| `25` | mantém |
| `9` | **remove** |
| `11` | **remove** |
| `12` | **remove** (nunca vira `10`) |
| `14` | **remove** |
| `17` | **remove** (nunca vira `15` ou `20`) |
| `22` | **remove** |
| `26` | **remove** |

**Teste de grade — operação interna controlada (`addItem`/merge), distinto
da tabela acima:** produto `min 10, step 5, max 25` — um valor bruto
gerado internamente (ex.: resultado de merge) como `12` é **normalizado**
para `10` pelo algoritmo da seção 13; o resultado final de qualquer
operação interna nunca produz `11, 12, 14, 17, 22` ou `26` como quantidade
armazenada. Note a diferença: `sanitizeCart()` nunca normaliza (tabela
acima), mas `addItem()`/`updateItem()` normalizam o *resultado da
operação* antes de persistir.

**Teste de max inconsistente:** produto `min 10, step 5, max 12` — `(12 -
10) % 5 = 2 !== 0`, portanto configuração **inválida** para o carrinho
(seção 13). Resultado: não adicionável via `addItem()`; se já persistido
por algum motivo, `sanitizeCart()` remove o item.

**Teste de preço ausente:** produto com `price: null` e
`promotionalPrice: null` → `getEffectivePrice()` retorna `null` →
**não adicionável** (regra congelada, seção 10).

**Teste de promoção sem base:** produto com `price: null` e
`promotionalPrice: 20` → `getEffectivePrice()` retorna `null` (a mesma
regra da Fase 3.1: promocional isolado, sem preço-base válido, nunca é
tratado como preço real) → **não adicionável**.

**Testes obrigatórios — merge:**

- Amanteigado Mesclado demo (`minQuantity: 1`, `quantityStep: 1`,
  `maxQuantity: null`): adicionar 2, depois adicionar 3 → resultado
  **quantity 5**, uma única linha (preservado das fases anteriores).
- Teste conceitual com grade não trivial — produto `min 3, step 2`
  (quantidades válidas: `3, 5, 7, 9, ...`): carrinho com `quantity: 3`;
  merge de mais `quantity: 2` → `rawTotal = 5`, já pertence à grade → usa
  `5` diretamente. Merge de mais `quantity: 3` a partir daí →
  `rawTotal = 8`, **não** pertence à grade (`(8-3) % 2 = 1`) → normaliza
  usando `round((8-3)/2) = round(2.5)`. Convenção adotada (mesma de
  `Math.round` em JS): `.5` arredonda para cima, logo `round(2.5) = 3` →
  `normalized = 3 + 3×2 = 9`. O objetivo do teste não é fixar esse valor
  exato para toda implementação, e sim confirmar duas coisas: (1)
  **qualquer resultado interno final de merge pertence à grade** — nunca
  `8`; (2) a convenção de arredondamento em caso de empate exato (`.5`)
  deve estar documentada e ser consistente em toda a implementação futura
  — não pode variar entre `addItem()`/`updateItem()`.

**Serviço de carrinho — demais casos:**

- Adicionar produto (carrinho vazio → 1 item).
- Adicionar produto repetido (merge, sem duplicar linha — seção 13).
- Quantidade: valor mínimo, no step, no máximo, acima do máximo (clamp
  dentro da grade).
- `sessionStorage[key] = '{abc'` (JSON corrompido) → carrinho vazio, 0
  exceções fatais.
- `sessionStorage` indisponível (bloqueado pelo navegador) → carrinho
  funcional em memória, 0 exceções fatais.
- Limpar carrinho (com e sem confirmação aceita/recusada).
- Remover item único, remover todos os itens um a um.
- Reload da página com carrinho preenchido → estado preservado (mesma
  aba, `sessionStorage`).

**Preço:**

- Produto com `price` normal, sem promoção.
- Produto com promoção válida (`promo < price`).
- Produto com promoção inválida (`promo >= price`) → usa `price`.
- Produto sem `price` válido → **rejeitado em `addItem()` e removido por
  `sanitizeCart()`** (regra congelada, seção 10 — não há mais ambiguidade
  entre "sanitizar" ou "omitir do subtotal": o item nunca chega a existir
  no estado do carrinho).
- Preço alterado no catálogo entre duas visitas/reloads → carrinho reflete
  o preço **atual**, não o preço no momento da adição (seção 10).

**Casos de aceite explícitos do prompt desta fase:**

- Amanteigado Mesclado, `effectivePrice = 21.90`, `quantity = 2` →
  subtotal do item **R$ 43,80**.
- Mesclado: adicionar 2, depois adicionar 3 → resultado **quantity 5**,
  uma única linha.
- `quantity` inválida no storage (`-2`, `0`, `"abc"`, `NaN`, `1.5`) →
  **removida/sanitizada**, nunca aceita silenciosamente como está — um
  valor não-inteiro ou não-positivo nunca deve chegar à UI ou ao
  subtotal.

## 28. Migração futura para backend

Quando um pedido real existir, o backend deve **revalidar tudo** — o
carrinho do navegador é apenas uma intenção, nunca uma fonte confiável:

- `productId` existe e está ativo no catálogo real (server-side).
- Preço e promoção atuais no servidor (nunca o preço que o navegador
  calculou).
- Quantidade dentro de `min`/`step`/`max` vigentes.
- Disponibilidade/estoque, se existir.
- Regras comerciais adicionais (mínimo de pedido, região de entrega etc.).

Nesse momento, o backend pode gerar um **snapshot** de nome, preço,
promoção, quantidade e subtotal — congelado no momento da confirmação do
pedido. Esse snapshot **não pertence à Fase 4A**: o carrinho demonstrativo
nunca resolve preço/nome no storage (seção 6), justamente para não ser
confundido, arquiteturalmente, com esse futuro snapshot de pedido real.

Ao migrar `CATALOG_DATA.mode` de `'demo'` para `'live'`/`'api'`, os dados
salvos sob a chave `amanteigadosLivia.demoCart.v1` **não devem ser
migrados automaticamente** para um carrinho real — a chave é
propositalmente segregada (seção 8) para que essa transição não herde
carrinhos de teste como se fossem intenções de compra reais.

## 29. Riscos

| Risco | Mitigação planejada |
|---|---|
| Duplicar `getEffectivePrice`/`isValidPrice`/`formatPrice`/helpers de quantidade em `cart.js` | Extrair para `catalog-core.js` (seção 24) antes de escrever `cart.js`; nunca copiar. |
| Dados de carrinho **demo** persistindo indefinidamente no navegador | `sessionStorage` (não `localStorage`) + chave com `demoCart` explícito (seções 7–8). |
| Storage corrompido/indisponível quebrando a página | `try/catch` em toda leitura/escrita, fallback para memória e carrinho vazio (seção 8). |
| Preço "adulterado" no navegador sendo tratado como confiável | Subtotal sempre recalculado client-side a partir do catálogo para exibição; nenhuma confiança nesse valor no momento de um pedido real — revalidação server-side obrigatória (seção 28). |
| Produto removido/desativado na fonte enquanto está no carrinho | Sanitização automática na leitura (seção 9) — nunca exibir produto fantasma. |
| Promoção alterada/expirada entre adição e visualização do carrinho | Preço sempre recalculado da fonte atual (seção 10) — nunca há "preço congelado" a ficar desatualizado. |
| Quantidade inválida (negativa, zero, não numérica, fracionária, ou fora da grade) persistida no storage | Validação estrutural + remoção do item na leitura (`sanitizeCart()` **nunca** normaliza estado do storage — seções 9, 13, 27). Normalização só ocorre no resultado de operações internas controladas (`addItem()`/`updateItem()`). |
| Produto com `minQuantity`/`quantityStep`/`maxQuantity` comercialmente inconsistentes (`maxQuantity` fora da grade) | Produto tratado como não utilizável (seção 9); nunca normalizado/mascarado silenciosamente (seção 13). |
| Produto sem preço efetivo válido sendo aceito no carrinho | Regra congelada: rejeitado em `addItem()`, removido por `sanitizeCart()`, nunca aparece em `getCartItems()`/subtotal (seção 10). |
| Duplicar a lógica de validade de promoção (`promo < price`) em `cart.js` | Regra vive só em `getEffectivePrice()` (`catalog-core.js`); carrinho consome apenas o valor resultante, nunca reimplementa a comparação (seção 11). |
| Regressão em `/produtos` ao extrair helpers para `catalog-core.js` | Extração isolada em fase própria (4A.1) com regressão completa antes de qualquer UI nova (seção 25). |
| Overflow/quebra de layout no carrinho em mobile | Mesma metodologia de teste em 9 breakpoints já usada nas fases anteriores (seção 30). |
| Confusão entre carrinho demonstrativo e pedido real | Aviso obrigatório e visualmente consistente em `/carrinho` enquanto `mode === 'demo'` (seção 20); nenhuma ação de finalização/pagamento existe nesta fase (seção 3). |

## 30. Critérios de aceite

Esta especificação é considerada completa quando permite implementar a
Fase 4A **sem que nenhuma decisão de comportamento precise ser inventada
durante a escrita do código** — toda regra de merge, sanitização,
normalização de quantidade, rótulo de UI, rota, chave de storage e divisão
de fases já está registrada acima com uma decisão explícita, não uma
sugestão em aberto.

---

## Próxima fase recomendada

**Fase 4A.1 — Extração de `catalog-core.js` + serviço `cart.js`** (seção
25), com regressão completa de `/produtos` antes de prosseguir para a
Fase 4A.2 (UI de `/carrinho`). Nenhuma das duas está implementada por este
documento.
