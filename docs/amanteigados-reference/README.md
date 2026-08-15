# Handoff visual — Amanteigados Lívia

Este pacote foi preparado a partir da referência fornecida em JPG (1536×1024).

## Conteúdo
- `assets/reference-full.jpg`: referência completa.
- `assets/reference-desktop.jpg`: recorte da composição desktop.
- `assets/reference-mobile.jpg`: recorte da composição mobile.
- `assets/reference-desktop-*.jpg`: recortes por seção para conferência visual.
- `assets/svg/`: ícones vetoriais auxiliares recriados.
- `design-spec.json`: tokens, estrutura, conteúdo e proporções aproximadas.
- `CLAUDE-PROMPT.md`: instrução pronta para Claude Code.

## Limitação técnica importante
O arquivo de origem é um JPG rasterizado. Portanto, não é possível “exportar” do JPG:
- SVG original do logotipo;
- SVG original dos ornamentos;
- fotografia original sem composição;
- família tipográfica exata;
- camadas independentes que não existam no arquivo raster.

Os SVGs deste pacote são recriações funcionais. Para fidelidade máxima, entregue também ao Claude Code os arquivos reais de logo e fotografias se estiverem no projeto.

## Estratégia recomendada
Use a imagem completa como referência visual e deixe a página real ser reconstruída em HTML/CSS/React. Não use a screenshot inteira como background da página.
