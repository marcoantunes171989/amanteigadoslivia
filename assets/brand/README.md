# Identidade visual — arquivos de referência (Fase 1.1)

Esta pasta guarda **cópias de arquivo** dos ativos de marca reais, preservados
sem alteração. Eles não são usados pelo site (que continua lendo
`assets/logo.jpg` e `assets/footer-brand.png` diretamente) — servem apenas
como backup/preservação da versão original.

- `logo-original.jpg` — cópia idêntica de `assets/logo.jpg` (selo circular
  oficial: "Amanteigados Lívia", grinalda floral, "Sabor irresistível!",
  "Feitos com amor").
- `footer-brand-original.png` — cópia idêntica de `assets/footer-brand.png`
  (assinatura cursiva real, com transparência), usada agora no rodapé do site.

## Investigação de "master" (Fase 1.1)

Não existe, em nenhum lugar do projeto, um arquivo vetorial (SVG/AI/EPS/PDF)
com a arte original do logotipo — apenas os artes finais em raster já usadas
no site e os prints de referência em `docs/amanteigados-reference/assets/`.
A imagem de referência de maior resolução (`reference-desktop.jpg`,
1127×993px) contém o mesmo selo, mas o badge nela mede ~150×150px — ou seja,
resolução nativa equivalente à do `logo.jpg` atual (132×132px). Recortar
dessa fonte não traria ganho real de nitidez.

**Conclusão:** não é possível gerar uma vetorização fiel sem inventar
traços/formas que não existem no material de origem. Para uma vetorização
profissional futura, é necessário solicitar ao cliente/designer o arquivo
original (vetor ou raster em alta resolução, idealmente 800px+).
