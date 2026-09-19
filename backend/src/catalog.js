function centsToAmount(centavos) {
  if (centavos === null || centavos === undefined) return null;
  const asNumber = typeof centavos === 'bigint' ? Number(centavos) : Number(centavos);
  if (!Number.isFinite(asNumber)) return null;
  return asNumber / 100;
}

function asDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isPriceCurrent(row, now) {
  if (row.ativo !== true) return false;
  const start = asDate(row.inicio_vigencia);
  const end = asDate(row.fim_vigencia);
  if (start && start > now) return false;
  if (end && end <= now) return false;
  return true;
}

function pickCurrentPrice(rows, promotional, now) {
  const matches = rows
    .filter((row) => row.promocional === promotional && isPriceCurrent(row, now))
    .sort((a, b) => {
      const aTime = asDate(a.data_criacao)?.getTime() ?? 0;
      const bTime = asDate(b.data_criacao)?.getTime() ?? 0;
      return bTime - aTime;
    });
  return matches[0] ?? null;
}

function pickPrimaryImage(rows) {
  const sorted = rows.slice().sort((a, b) => {
    if (a.principal === true && b.principal !== true) return -1;
    if (b.principal === true && a.principal !== true) return 1;
    return (a.ordem_exibicao ?? 0) - (b.ordem_exibicao ?? 0);
  });
  return sorted[0] ?? null;
}

export function mapCatalogRows({
  categories = [],
  products = [],
  images = [],
  prices = [],
  now = new Date(),
} = {}) {
  const imagesByProduct = new Map();
  for (const image of images) {
    const key = String(image.id_produto);
    const list = imagesByProduct.get(key) || [];
    list.push(image);
    imagesByProduct.set(key, list);
  }

  const pricesByProduct = new Map();
  for (const price of prices) {
    const key = String(price.id_produto);
    const list = pricesByProduct.get(key) || [];
    list.push(price);
    pricesByProduct.set(key, list);
  }

  return {
    mode: 'live',
    categories: categories.map((category) => ({
      id: String(category.id_categoria),
      slug: category.slug_categoria,
      name: category.nome_categoria,
      active: category.ativo === true,
      order: category.ordem_exibicao ?? 0,
    })),
    products: products.map((product) => {
      const productId = String(product.id_produto);
      const image = pickPrimaryImage(imagesByProduct.get(productId) || []);
      const productPrices = pricesByProduct.get(productId) || [];
      const regular = pickCurrentPrice(productPrices, false, now);
      const promotional = pickCurrentPrice(productPrices, true, now);
      const description = product.descricao_produto || null;

      return {
        id: productId,
        slug: product.slug_produto,
        name: product.nome_produto,
        categoryId: String(product.id_categoria),
        shortDescription: description,
        description,
        price: centsToAmount(regular?.valor_centavos),
        promotionalPrice: centsToAmount(promotional?.valor_centavos),
        image: image?.url_imagem || null,
        featured: product.destaque === true,
        active: product.ativo === true,
        order: product.ordem_exibicao ?? 0,
        unit: null,
        weight: null,
        customizable: false,
        minQuantity: 1,
        quantityStep: 1,
        maxQuantity: null,
        productionTime: null,
        demo: false,
      };
    }),
  };
}

export async function getCatalogPayload(queryable) {
  const [categoriesResult, productsResult, imagesResult, pricesResult] = await Promise.all([
    queryable.query(`
      SELECT id_categoria, nome_categoria, slug_categoria, ordem_exibicao, ativo
      FROM app.tab_categoria
      ORDER BY ordem_exibicao ASC, nome_categoria ASC
    `),
    queryable.query(`
      SELECT id_produto, id_categoria, nome_produto, slug_produto, descricao_produto,
             destaque, ativo, ordem_exibicao
      FROM app.tab_produto
      ORDER BY ordem_exibicao ASC, nome_produto ASC
    `),
    queryable.query(`
      SELECT id_imagem, id_produto, url_imagem, texto_alternativo, ordem_exibicao, principal
      FROM app.tab_produto_imagem
      ORDER BY ordem_exibicao ASC
    `),
    queryable.query(`
      SELECT id_preco, id_produto, valor_centavos, codigo_moeda, promocional,
             inicio_vigencia, fim_vigencia, ativo, data_criacao
      FROM app.tab_produto_preco
    `),
  ]);

  return mapCatalogRows({
    categories: categoriesResult.rows,
    products: productsResult.rows,
    images: imagesResult.rows,
    prices: pricesResult.rows,
    now: new Date(),
  });
}
