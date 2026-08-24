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

O carrinho **não define uma regra própria** de quantidade — reaproveita
integralmente `getQuantityMin(product)`, `getQuantityStep(product)`,
`getQuantityMax(product)` e `clampQuantity(product, value)`, já existentes
em `produtos.js` desde a Fase 3 (ver seção 24 sobre onde essas funções
devem morar para serem compartilhadas sem duplicação).

**Validação de item armazenado (seção 19 do prompt):** todo item lido do
storage precisa ter `productId` (string não vazia) e `quantity` que seja
`number`, inteiro e `> 0` — qualquer violação descarta o item (não o
carrinho inteiro). Depois da validação estrutural, a quantidade é
normalizada para o produto real via `clampQuantity()` (min/max) e
arredondada para o `quantityStep` mais próximo (algoritmo na seção 13).

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

## 11. Promoção

Mesma regra já homologada e usada em `produtos.js` desde a Fase 3.1/3.3 —
não duplicada, apenas reaplicada: uma promoção só é considerada válida
quando `price` é válido **E** `promotionalPrice` é válido **E**
`promotionalPrice < price`. Quando válida, o item do carrinho apresenta o
preço-base riscado e o preço promocional em destaque (mesmo padrão visual
de `.product-price-strike`/`.product-price-promo` já usado no card e no
dialog — reaproveitar as classes/o helper `appendPriceMarkup()`
introduzido na Fase 3.3 em vez de recriar a lógica).

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

**Algoritmo de normalização (min/step/max) — aplicado sempre que a
quantidade de um item muda, seja por merge, seja por edição no carrinho:**

```
normalized = min + round((raw - min) / step) * step
normalized = clamp(normalized, min, max ?? Infinity)
```

Exemplo do prompt (`minQuantity: 10`, `quantityStep: 5`): valores válidos
são `10, 15, 20, 25, ...`; um valor bruto como `12` normaliza para `10`
(`round((12-10)/5)=0`); `13` normaliza para `15` (`round((13-10)/5)=1`).
Isso garante que o carrinho **nunca produz** uma quantidade fora da grade
definida pelo produto, mesmo somando duas adições que individualmente
eram válidas.

**Se a soma ultrapassar `maxQuantity`:** aplicar `clamp` no valor máximo
permitido (nunca criar quantidade inválida, nunca lançar erro — o
visitante simplesmente não consegue ultrapassar o limite já comunicado no
dialog de detalhes).

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
`getQuantityMax()`, `clampQuantity()`, e uma função nova,
`getProductById(id)` (hoje não existe em `produtos.js` — `/produtos` nunca
precisou buscar um produto único por id, apenas filtrar listas; o carrinho
precisa disso para resolver cada `productId` salvo). Nenhuma função de
renderização DOM entra nessa camada.

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
  regressão em `/produtos`. Cria `carrinho.html`, o botão no dialog, o
  badge no header, e liga tudo ao `cart.js` já testado.

**Justificativa:** mover código de um catálogo que já está em produção
(mesmo que em modo demo) é uma operação de risco não-trivial — um erro na
extração quebraria `/produtos`, não apenas o carrinho ainda inexistente.
Separar "mexer no que já funciona" (4A.1) de "construir o que é novo"
(4A.2) permite auditar e reverter a extração isoladamente, sem competir
com a superfície de bugs de uma UI nova. Uma fase única multiplicaria o
raio de explosão de qualquer erro de extração pela superfície inteira do
carrinho novo, dificultando isolar a causa de qualquer regressão.

## 26. Serviço de carrinho (`cart.js` — não implementado nesta fase)

Interface conceitual recomendada, consumindo `catalog-core.js`:

```
loadCart()          // lê sessionStorage com fallback defensivo (seção 8)
saveCart(cart)       // escreve sessionStorage, tolera falha (memória permanece fonte de verdade da página atual)
sanitizeCart(cart)    // remove productId inexistente/inativo, normaliza quantidades (seções 9, 13)
getCartItems()        // itens sanitizados, já resolvidos contra o catálogo atual (productId + Product + effectivePrice)
addItem(productId, quantity)     // merge se já existir (seção 13)
updateItem(productId, quantity)  // normaliza via min/step/max (seção 13)
removeItem(productId)
clearCart()
getCartCount()         // soma de quantidades (seção 17)
getCartSubtotal()      // soma dos subtotais válidos (seção 12)
```

**Evitar globals descontrolados:** se `cart.js` precisar expor algo em
`window` para ser consumido por `carrinho.html`/`produtos.html`, deve
expor um único namespace explícito — por exemplo `window.AmanteigadosCart`
— e não funções soltas no escopo global. Isso segue o mesmo padrão que
`catalog-demo-data.js` já usa hoje com `window.CATALOG_DATA` (um único
ponto de entrada nomeado, não dados espalhados).

## 27. Testes (a executar quando a Fase 4A for implementada)

**Serviço de carrinho:**

- Adicionar produto (carrinho vazio → 1 item).
- Adicionar produto repetido (merge, sem duplicar linha — seção 13).
- Quantidade: valor mínimo, no step, no máximo, acima do máximo (clamp).
- Produto com `productId` inválido/inexistente na fonte atual → sanitizado.
- Produto com `active !== true` → sanitizado.
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
- Produto sem `price` válido → não entra no subtotal (sanitizado ou
  subtotal do item omitido, a decidir na implementação, nunca `NaN`).
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
| Quantidade inválida (negativa, zero, não numérica, fracionária) persistida | Validação estrutural + normalização por min/step/max na leitura (seções 9, 13, 27). |
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
