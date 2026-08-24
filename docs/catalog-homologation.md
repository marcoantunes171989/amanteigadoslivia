# Homologação do Catálogo — Amanteigados Lívia

> Matriz oficial de homologação comercial (Fase 3.2). Documento de
> controle — não altera comportamento do site. Nenhum dado aqui pode
> entrar em `produtos.js` sem primeiro constar nesta matriz como
> **HOMOLOGADO**, com origem registrada.

**CATÁLOGO HOMOLOGADO PARA PUBLICAÇÃO: NÃO**

Motivo: até o momento desta fase, nenhum dado comercial real (categoria,
produto, preço, contato, política de entrega/retirada) foi fornecido pelo
responsável da Amanteigados Lívia através de uma origem válida (ver seção
5 do prompt desta fase). Tudo abaixo está classificado como **PENDENTE**.

Desde a Fase 3.3, `PRODUCTS` e `CATEGORIES` em produção **não estão mais
vazios** — `/produtos` roda em **modo demonstração** (`CATALOG_DATA.mode =
'demo'`), com 4 categorias e 8 produtos fictícios, autorizados
expressamente pelo responsável apenas para fins de demonstração de
frontend (ver seção 17 abaixo). Isso é uma decisão de arquitetura, não uma
homologação: nenhum desses dados conta para a matriz de homologação
comercial deste documento.

---

## 1. Status geral

| Item | Status |
|---|---|
| Categorias homologadas | 0 |
| Produtos totalmente homologados | 0 |
| Produtos parcialmente homologados | 0 |
| Produtos pendentes (nenhum ainda submetido) | 0 |
| WhatsApp oficial | PENDENTE |
| Instagram oficial | PENDENTE |
| Política de entrega | PENDENTE |
| Política de retirada | PENDENTE |

Nenhum produto do catálogo antigo (`goiabada`, `chocolate`, `coco`,
`goiaba`, `mesclado`, `limao`, `gotas`, `especial`, `personalizado` —
ver `docs/catalog-spec.md`, seção 2) foi reaproveitado. Preços antigos
(`29.90`/`32.90`/`34.90`/`36.90`), peso `250g` e a flag `bestSeller` **não
foram usados como base** — permanecem sem homologação, exatamente como já
concluído na Fase 2.2.

---

## 2. Categorias homologadas

**Quantidade: 0**

| ID | Nome | Slug | Ativa | Ordem | Status | Origem |
|----|------|------|-------|-------|--------|--------|
| — | — | — | — | — | — | Nenhuma categoria homologada até o momento |

As categorias antigas (`Tradicionais`, `Recheados`, `Especiais`,
`Personalizados`) **não foram reativadas automaticamente** — só voltam se
forem homologadas comercialmente pelo responsável, com a mesma origem
exigida de qualquer categoria nova.

---

## 3. Produtos homologados

**Quantidade: 0**

| Produto | Categoria | Preço | Promo | Unidade | Peso | Foto | Personalizável | Min | Step | Max | Prazo | Status |
|---------|-----------|-------|-------|---------|------|------|----------------|-----|------|-----|-------|--------|
| — | — | — | — | — | — | — | — | — | — | — | — | Nenhum produto homologado até o momento |

---

## 4. Produtos pendentes

**Quantidade: 0**

Nenhum produto foi submetido para homologação nesta fase — a tabela
acima está vazia porque ainda não há candidatos, não porque existam
candidatos reprovados. Assim que o responsável fornecer dados reais
(mesmo que parciais), cada produto entra aqui com o campo faltante
explícito, seguindo o modelo da seção "Dados necessários" ao final deste
documento.

---

## 5. Contatos

| Canal | Status | Valor atual no site | Origem |
|---|---|---|---|
| WhatsApp | PENDENTE | `5500000000000` (placeholder, `wa.me`) — presente apenas na Home; removido de `/produtos` na Fase 3 | Nenhuma — número de exemplo, nunca confirmado como oficial |
| Instagram | PENDENTE | `https://instagram.com` (genérico, sem usuário) — presente apenas na Home; removido de `/produtos` na Fase 3 | Nenhuma |

Formato técnico esperado quando homologado — WhatsApp: `55DDDNÚMERO` sem
espaços (ex. estrutural `5518999999999` — **não é um dado real**, apenas
ilustra o formato). Instagram: `https://instagram.com/USUARIO` completo.

---

## 6. Política de entrega

**Existe entrega: PENDENTE**

A versão anterior de `/produtos` continha a alegação "Entrega rápida",
removida na Fase 3 por não existir política comercial homologada — já
classificada como **NÃO HOMOLOGADA** desde a Fase 2.2. Nenhuma política de
entrega (região, taxa, prazo, forma de cálculo, transportador
próprio/terceirizado) foi confirmada.

| Campo | Status |
|---|---|
| Existe entrega (SIM/NÃO) | PENDENTE |
| Região atendida | PENDENTE |
| Taxa | PENDENTE |
| Cálculo da taxa | PENDENTE |
| Prazo | PENDENTE |
| Limite (raio, valor mínimo etc.) | PENDENTE |
| Própria ou terceirizada | PENDENTE |
| Condições adicionais | PENDENTE |

---

## 7. Política de retirada

**Existe retirada: PENDENTE**

| Campo | Status |
|---|---|
| Existe retirada (SIM/NÃO) | PENDENTE |
| Local | PENDENTE — **não publicar endereço sem confirmação explícita de que é comercial e pode ser divulgado** (privacidade, seção 36 do prompt) |
| Horário | PENDENTE |
| Agendamento necessário | PENDENTE |
| Observações | PENDENTE |

---

## 8. Regras de preço (definidas nesta fase, aguardando dados reais)

- `price`: `number` ou `null`. Nunca string (`"R$ 29,90"` é inválido no
  modelo). Nunca estimado — só entra quando fornecido como oficial.
- `promotionalPrice`: só é uma promoção válida quando `price` também é
  válido **e** `promotionalPrice < price`. `promotionalPrice >= price` é
  inválido (ignorado). `price === null` com `promotionalPrice` preenchido
  **não** cria uma promoção ativa — regra já implementada em
  `getEffectivePrice()` (Fase 3.1) e reconfirmada aqui.
- **Ordenação por preço**: continua exigindo `price`-base válido em
  **100%** dos produtos ativos considerados (`hasCompleteValidPrices()`,
  Fase 3.1) — um catálogo parcialmente precificado nunca oferece "Menor
  preço"/"Maior preço".
- **Pendência identificada nesta fase**: a comparação usada em
  `sortProducts()` para `price-asc`/`price-desc` hoje ordena por
  `product.price` (preço-base), não pelo preço efetivamente cobrado
  (`getEffectivePrice()`). A seção 15 abaixo detalha a regra correta e a
  recomendação — **nenhum código foi alterado nesta fase**, por ser
  exclusivamente documental.
- Nenhum preço foi homologado até o momento.

## 9. Regras de quantidade (definidas, aguardando dados reais)

- `minQuantity`: inteiro > 0. Padrão técnico seguro `1`; só muda com
  regra comercial confirmada (ex.: `unit: "caixa"` não implica
  automaticamente `minQuantity` diferente de 1 — "1 caixa" já é válido
  como mínimo de 1).
- `quantityStep`: inteiro > 0. Só diferente de 1 com regra confirmada.
- `maxQuantity`: `null` por padrão; só um inteiro `>= minQuantity` quando
  houver limite comercial/operacional real.
- Nenhuma quantidade foi homologada até o momento.

## 10. Imagens

- Uma foto só é vinculada a um produto quando é especificamente daquele
  produto, ou o responsável declara explicitamente a correspondência.
- `assets/encomendas.jpg`, `assets/festas.jpg`, `assets/personalizados.jpg`
  **não devem ser vinculadas a produtos** — continuam de uso
  exclusivamente institucional (Home). Esta regra evita repetir o problema
  identificado na auditoria da Fase 2.2 (as mesmas 3 fotos reutilizadas
  em 9 "sabores" diferentes).
- Produto homologado sem foto própria: `image: null` — a interface já
  renderiza o placeholder "Imagem em atualização" (Fase 3), sem 404 e sem
  reaproveitar foto de outro produto.
- Nenhuma imagem foi homologada para produto até o momento.

---

## 11. Pendências

Lista objetiva do que falta para avançar:

1. Lista de categorias oficiais (nome, ordem, ativa).
2. Lista de produtos oficiais com todos os campos do modelo (seção
   "Dados necessários" abaixo).
3. Preços oficiais por produto (e promocionais, se houver).
4. Pesos/unidades reais por produto.
5. Fotografias específicas por produto (arquivo + confirmação de
   correspondência).
6. Regras de personalização (quais produtos, condições, se houver).
7. Quantidade mínima/incremento/máximo por produto, se diferente do
   padrão.
8. Prazo de produção por produto, se houver.
9. Número de WhatsApp oficial.
10. Perfil de Instagram oficial.
11. Definição de política de entrega (SIM/NÃO) e seus detalhes.
12. Definição de política de retirada (SIM/NÃO) e seus detalhes.
13. Confirmação se algum produto é vendido "sob orçamento" (ver seção 16
    abaixo, decisão sobre `pricingMode`).

## 12. Riscos

- **Publicar antes da homologação completa**: maior risco identificado
  desde a Fase 2.2 — preço/peso/foto incorretos induzem o cliente a erro.
  Mitigado por manter `PRODUCTS=[]` até homologação real.
- **Reaproveitar fotos institucionais como fotos de produto**: já ocorreu
  no catálogo antigo: mitigado pela regra da seção 10 acima.
- **Ordenação por preço usando preço-base em vez de efetivo**: gap técnico
  encontrado nesta auditoria (seção 8); não corrigido agora por a fase ser
  documental — recomendado para a próxima fase de código.
- **Dado pessoal/privado exposto por engano** (ex. endereço residencial
  usado como ponto de retirada sem autorização): mitigado pela regra
  explícita da seção 7.
- **Pressão para publicar parcialmente com dados "prováveis"**: mitigado
  pela regra absoluta da seção 5 — nenhum dado plausível, antigo ou
  inferido entra em produção sem origem confirmada.

## 13. Decisão de liberação

**CATÁLOGO HOMOLOGADO PARA PUBLICAÇÃO: NÃO.**

Não há, nesta data, nenhuma categoria ou produto que atenda ao critério
mínimo da seção 51 do prompt (id, slug, name, categoryId válido, active e
origem confirmada). `CATEGORIES_HOMOLOGATED` e `PRODUCTS_HOMOLOGATED`
(seção 15 abaixo) permanecem vazios.

---

## 14. Arquitetura de dados — conceitual (sem dados reais ainda)

```js
// CATEGORIES_HOMOLOGATED — vazio: nenhuma categoria homologada até o momento
const CATEGORIES_HOMOLOGATED = [];

// PRODUCTS_HOMOLOGATED — vazio: nenhum produto homologado até o momento
const PRODUCTS_HOMOLOGATED = [];
```

Modelo de referência para quando houver dados (idêntico ao já definido em
`docs/catalog-spec.md`, seção 12 — repetido aqui só como lembrete de
formato, não como dado):

```js
// Category
{ id: "", slug: "", name: "", active: true, order: 10 }

// Product
{
  id: "", slug: "", name: "", shortDescription: "", description: "",
  categoryId: "", price: null, promotionalPrice: null, unit: null,
  weight: null, image: null, images: [], customizable: false,
  minQuantity: 1, quantityStep: 1, maxQuantity: null, productionTime: null,
  featured: false, active: true, order: 10,
}
```

## 15. Regra de ordenação por preço — definição oficial

Documentando a regra pedida nesta fase (sem alterar código):

- **Disponibilidade** da ordenação por preço: continua exigindo que
  **100% dos produtos ativos considerados** tenham `price` (preço-base)
  válido — `hasCompleteValidPrices()`, já implementado na Fase 3.1. Isso
  garante uma base sempre comparável, mesmo quando alguns produtos têm
  promoção e outros não.
- **Comparação** usada para ordenar: deve ser o preço **efetivamente
  oferecido ao cliente**, ou seja `effectivePrice = promotionalPrice`
  quando válido (`isValidPrice(promotionalPrice) && promotionalPrice <
  price`), senão `price`. Exemplo do próprio prompt: Produto A
  (`price:30, promo:20`) deve aparecer antes do Produto B (`price:25, sem
  promo`) em "Menor preço", porque `20 < 25`.
- **Gap encontrado**: `sortProducts()` (Fase 3/3.1) hoje compara por
  `product.price` puro nos casos `price-asc`/`price-desc`, não por
  `getEffectivePrice()`. Isso não é um bug de segurança nem afeta o total
  do dialog (já corrigido na Fase 3.1) — é uma inconsistência apenas na
  ORDEM de exibição quando existem promoções válidas.
- **Recomendação**: na próxima fase de código autorizada (não nesta,
  que é exclusivamente documental), trocar a base de comparação de
  `price-asc`/`price-desc` em `sortProducts()` de `a.price`/`b.price` para
  `getEffectivePrice(a)`/`getEffectivePrice(b)`, mantendo o gate de
  disponibilidade (`hasCompleteValidPrices`) inalterado — baseado em
  `price`, não em `promotionalPrice`.

## 16. Necessidade de `pricingMode` ("fixed" | "quote")

**IMPLEMENTAÇÃO: NÃO** (nesta fase, nem em nenhuma anterior).
**NECESSIDADE COMERCIAL: PENDENTE DE CONFIRMAÇÃO.**

Estes são dois status distintos e não devem ser confundidos: a ausência de
evidência de produtos "sob orçamento" no material do projeto (mockup
original, `PROPOSTA.md`, catálogo de demonstração — todos tratando os
amanteigados como itens de preço fixo por unidade/peso) justifica **não
implementar `pricingMode` agora**, mas **não prova** que todos os produtos
reais terão preço fixo — essa é uma pergunta comercial ainda em aberto,
não uma conclusão. Adicionar o campo hoje seria estender o modelo sem
necessidade comprovada (contraria a regra geral do projeto de não
adicionar campos sem necessidade demonstrada); por isso a pergunta
"Vendido sob orçamento (sim/não)" permanece no formulário de coleta
abaixo — se o responsável confirmar que algum item é sob orçamento, a
extensão `pricingMode: "fixed" | "quote"` deve ser formalmente recomendada
e submetida à aprovação antes de qualquer implementação.

---

## 17. MODO DEMONSTRAÇÃO FRONTEND (Fase 3.3)

**Este documento e o modo demonstrativo tratam de duas coisas diferentes —
não confundir uma com a outra:**

- Este documento (`catalog-homologation.md`) é a matriz de **homologação
  comercial**: registra o que já foi confirmado pelo responsável como dado
  real e pode ser publicado como oficial.
- O **modo demonstração** é uma decisão de **arquitetura de frontend**,
  autorizada expressamente pelo responsável da Amanteigados Lívia (contexto
  do prompt da Fase 3.3), para popular `/produtos` com produtos, categorias,
  preços, descrições e ilustrações **fictícios**, com a finalidade exclusiva
  de desenvolver e demonstrar a experiência visual/funcional do Cardápio
  Digital (navegação, busca, filtros, ordenação, dialog de detalhes,
  quantidade) enquanto o catálogo real não é fornecido.

**Isso NÃO altera o status de homologação em nenhum ponto acima.** Nenhuma
categoria, produto, preço, foto, contato ou política listados nas seções
1–16 passa a ser considerado HOMOLOGADO por existir em modo demo — o
catálogo comercial continua **NÃO HOMOLOGADO PARA PUBLICAÇÃO** (linha 8
deste documento).

### Como funciona

- `produtos.js` lê os dados através de `window.CATALOG_DATA`, uma fonte
  externa carregada por `catalog-demo-data.js` (script incluído antes de
  `produtos.js` em `produtos.html`).
- `CATALOG_DATA.mode = 'demo'` identifica explicitamente a origem dos
  dados como demonstrativa (distinta de um futuro modo `'live'`/`'api'`).
- Cada produto demonstrativo carrega `demo: true`, e a interface usa essa
  marca para: (a) descrever as imagens como "Ilustração demonstrativa de
  [nome]" no `alt`, nunca como fotografia real; (b) exibir a legenda
  discreta "Imagem ilustrativa" sobre a própria imagem.
- Um aviso visual fixo — "Catálogo demonstrativo. Produtos, imagens e
  valores apresentados nesta versão são ilustrativos." — aparece no topo de
  `/produtos`, usando o Design System (fundo Baunilha, texto Cacau/Bordô).
- `produtos.html` inclui `<meta name="robots" content="noindex,follow">`
  **somente nesta página**, para que mecanismos de busca não indexem
  produtos/preços fictícios como se fossem conteúdo oficial da marca. A
  Home **não** recebe essa diretiva.

### Dados demonstrativos atuais

4 categorias (`Clássicos`, `Especiais`, `Presentes`, `Personalizados`) e 8
produtos fictícios (nomes, preços, pesos, descrições e ilustrações SVG
locais em `assets/demo-products/`) — todos com `demo: true`, todos
inventados especificamente para esta demonstração, sem qualquer pretensão
de refletir o catálogo real. Nenhum reaproveita os placeholders antigos da
Fase 2.2 como base de valor (mesmo quando os nomes de sabor coincidem, os
preços, pesos e descrições foram recriados do zero para este propósito
demonstrativo).

### Antes do catálogo real entrar em produção (checklist para uma fase futura)

- [ ] Substituir `catalog-demo-data.js` (ou `window.CATALOG_DATA`) pela
      fonte real — idealmente uma função equivalente a `loadCatalogData()`
      consumindo API/banco, sem exigir mudanças em `produtos.js`.
- [ ] Remover o aviso "Catálogo demonstrativo" de `produtos.html`.
- [ ] Remover `assets/demo-products/*.svg` e todo produto com `demo: true`.
- [ ] Revisar/remover `<meta name="robots" content="noindex,follow">` de
      `produtos.html`.
- [ ] Preencher WhatsApp, Instagram, entrega e retirada reais (seções 5–7
      deste documento).
- [ ] Validar o catálogo completo com a fonte de dados real antes de
      publicar (repetir os testes funcionais desta e das fases anteriores).

---

## DADOS NECESSÁRIOS PARA HOMOLOGAÇÃO

Modelos copiáveis para o responsável da Amanteigados Lívia preencher.

### Modelo — Categoria

```
Nome:
Ordem:
Ativa (sim/não):
Observações:
```

### Modelo — Produto

```
Nome oficial:
Categoria:
Descrição curta:
Descrição completa:
Preço:
Preço promocional (se houver):
Unidade:
Peso:
Foto (arquivo/anexo):
Personalizável (sim/não):
Quantidade mínima:
Incremento:
Quantidade máxima (se houver):
Prazo de produção:
Destaque editorial (sim/não):
Ativo (sim/não):
Vendido sob orçamento (sim/não):
Observações:
```

### Modelo — Contatos

```
WhatsApp oficial:
Instagram oficial:
```

### Modelo — Entrega

```
Possui entrega (sim/não):
Região:
Taxa:
Prazo:
Condições:
```

### Modelo — Retirada

```
Possui retirada (sim/não):
Local (confirmar que pode ser público):
Horário:
Agendamento (sim/não):
Observações:
```
