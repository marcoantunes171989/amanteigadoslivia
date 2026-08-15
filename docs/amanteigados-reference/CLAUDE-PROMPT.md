# Prompt de execução — Amanteigados Lívia

Atue como frontend engineer sênior + UI engineer especializado em reprodução pixel-perfect.

## Objetivo
Reescreva a página pública atual para ficar visualmente o mais próxima possível da referência `assets/reference-full.jpg`, preservando apenas a infraestrutura necessária do projeto (framework, build, rotas e integrações existentes que forem indispensáveis). A referência contém simultaneamente a aparência desktop e mobile e deve ser a fonte de verdade visual.

## Antes de alterar
1. Inspecione a estrutura atual do projeto.
2. Identifique framework, entrypoint, rota da landing page, componentes reutilizados e assets existentes.
3. Procure primeiro pelos arquivos originais de:
   - logotipo Amanteigados Lívia;
   - fotos dos produtos;
   - fotos de embalagem;
   - fontes já configuradas.
4. Se os assets reais existirem, use-os. Não substitua fotos reais por ilustrações, gradientes ou imagens artificiais.
5. Faça backup lógico via Git antes da alteração e trabalhe em uma mudança coesa.

## Fonte de verdade
- Referência completa: `assets/reference-full.jpg`
- Recortes de conferência: `assets/reference-desktop-*.jpg` e `assets/reference-mobile.jpg`
- Tokens/medidas: `design-spec.json`
- SVGs auxiliares recriados: `assets/svg/*.svg`

IMPORTANTE: os JPGs são referência visual. Não monte a página como uma única imagem. A UI deve ser HTML/CSS/React real, acessível e responsiva.

## Layout desktop
Reproduza:
- container externo claro, cantos arredondados e sombra suave;
- header horizontal com logotipo grande à esquerda sobrepondo parcialmente a área inferior;
- navegação central: Início, Produtos, Festas, Personalizados, Contato;
- estado ativo em vermelho/coral com sublinhado fino;
- botão “Fazer pedido” no canto direito com ícone de sacola;
- hero em duas colunas;
- copy do hero à esquerda;
- título serifado grande em duas linhas:
  - “Amanteigados”
  - “feitos com amor” em coral;
- subtítulo exatamente conforme `design-spec.json`;
- dois CTAs lado a lado;
- fotografia principal ocupando a metade direita com integração orgânica ao fundo;
- seção “Para cada momento” centralizada com ornamentos florais delicados;
- três cards iguais: Encomendas, Festas, Personalizados;
- imagem no topo do card, texto abaixo e ícone floral no canto inferior direito;
- barra de benefícios com 3 colunas;
- faixa CTA coral/vermelha;
- footer compacto com marca, frase, Instagram e WhatsApp.

## Layout mobile
A versão mobile NÃO deve ser apenas o desktop comprimido.
Reproduza a composição observada em `assets/reference-mobile.jpg`:
- header compacto com logo esquerda;
- ícone menu e botão sacola à direita;
- hero em uma coluna;
- título 2 linhas;
- CTAs empilhados em largura total;
- fotografia abaixo dos botões;
- “Para cada momento” abaixo da imagem;
- cards convertidos para cards horizontais compactos:
  imagem ~36%, texto ao centro e ícone floral à direita;
- benefícios em 3 colunas pequenas;
- CTA coral;
- footer reduzido.

## Responsividade
Implementar no mínimo:
- mobile: 320–639 px;
- tablet: 640–899 px;
- desktop: >= 900 px;
- testar também 1024, 1280, 1440, 1536 e 1920 px.
Nenhum overflow horizontal.
Não cortar textos.
Não distorcer fotos.
Use `object-fit: cover` e `object-position` específicos quando necessário.

## Design tokens
Carregue `design-spec.json` e aplique os valores como referência. Visualmente, priorize:
- fundo creme `#F8F4EC`;
- superfície branca quente;
- coral/vermelho próximo de `#E55A53`;
- títulos marrom escuro;
- bordas bege muito claras;
- serif editorial no display;
- sans limpa no corpo;
- pouca sombra;
- grande uso de espaço em branco;
- estética artesanal, delicada e premium.

## Imagens
Não use os recortes da screenshot como imagens finais de produto se os arquivos reais existirem no projeto.
Se não existirem assets originais suficientes, mantenha placeholders claramente identificados no código e relacione os arquivos faltantes no final da execução.
Nunca “inventar” detalhes visuais de produto para mascarar ausência de asset real.

## SVGs
Utilize os SVGs do pacote para sacola, menu, seta, coração, calendário, produção artesanal, Instagram, WhatsApp e flor quando forem compatíveis com a referência.
Aplique `currentColor` para controle por CSS.
Traço delicado e consistente.

## Implementação
- Evite dependências desnecessárias.
- Use componentes semânticos e simples.
- Não criar carrossel se a referência não mostrar interação necessária.
- Não adicionar seções, textos, badges, números ou recursos que não aparecem na referência.
- Não manter conteúdo legado que conflite visualmente com a referência.
- Preservar links/ações reais existentes quando fizer sentido, ajustando apenas apresentação.
- Se a landing atual estiver fragmentada, prefira reescrever os componentes da página em vez de empilhar patches CSS.

## Validação visual obrigatória
Após implementar:
1. Execute o projeto.
2. Gere screenshots nas larguras:
   - 390 px;
   - 430 px;
   - 768 px;
   - 1024 px;
   - 1440 px.
3. Compare lado a lado com a referência.
4. Faça pelo menos 2 ciclos de refinamento visual.
5. Corrija:
   - espaçamentos;
   - tamanho de fonte;
   - line-height;
   - altura do hero;
   - proporção das imagens;
   - largura dos cards;
   - raio;
   - cores;
   - alinhamentos.
6. Só finalize quando não houver overflow e a hierarquia/composição estiver muito próxima da imagem.

## Critério de conclusão
Entregar:
- página funcional;
- desktop e mobile fiéis;
- sem conteúdo legado conflitante;
- sem console errors;
- sem overflow horizontal;
- sem imagens esticadas;
- build/lint da área alterada sem erro;
- resumo dos arquivos alterados;
- lista objetiva dos assets originais eventualmente ausentes.

Se o projeto já estiver conectado ao GitHub/Vercel, NÃO force mudanças de configuração de deploy sem necessidade. Conclua a implementação e informe exatamente o que foi alterado.
