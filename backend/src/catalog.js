import { getCatalogRevision } from './catalog-revision.js';

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

  const mappedCategories = categories.map((category) => ({
    id: String(category.id_categoria),
    slug: category.slug_categoria,
    name: category.nome_categoria,
    active: category.ativo === true,
    order: category.ordem_exibicao ?? 0,
  }));

  const mappedProducts = products.map((product) => {
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
  });

  const publicCategories = mappedCategories.filter((item) => item.active);
  const publicCategoryIds = new Set(publicCategories.map((item) => item.id));

  return {
    mode: 'live',
    categories: publicCategories,
    products: mappedProducts.filter((item) => item.active && publicCategoryIds.has(item.categoryId)),
  };
}

export async function getCatalogPayload(queryable) {
  const result = await queryable.query(`
      SELECT
        COALESCE((
          SELECT json_agg(to_jsonb(c) ORDER BY c.ordem_exibicao, c.nome_categoria)
          FROM (
            SELECT id_categoria, nome_categoria, slug_categoria, ordem_exibicao, ativo
            FROM app.tab_categoria
            WHERE ativo = true
          ) c
        ), '[]'::json) AS categories,
        COALESCE((
          SELECT json_agg(to_jsonb(p) ORDER BY p.ordem_exibicao, p.nome_produto)
          FROM (
            SELECT id_produto, id_categoria, nome_produto, slug_produto, descricao_produto,
                   destaque, ativo, ordem_exibicao
            FROM app.tab_produto
            WHERE ativo = true
          ) p
        ), '[]'::json) AS products,
        COALESCE((
          SELECT json_agg(to_jsonb(i) ORDER BY i.ordem_exibicao)
          FROM (
            SELECT id_imagem, id_produto, url_imagem, texto_alternativo, ordem_exibicao, principal
            FROM app.tab_produto_imagem
          ) i
        ), '[]'::json) AS images,
        COALESCE((
          SELECT json_agg(to_jsonb(pr))
          FROM (
            SELECT id_preco, id_produto, valor_centavos, codigo_moeda, promocional,
                   inicio_vigencia, fim_vigencia, ativo, data_criacao
            FROM app.tab_produto_preco
          ) pr
        ), '[]'::json) AS prices
    `);

  const row = result.rows[0] || {};
  const payload = mapCatalogRows({
    categories: row.categories || [],
    products: row.products || [],
    images: row.images || [],
    prices: row.prices || [],
    now: new Date(),
  });

  try {
    const revision = await getCatalogRevision(queryable);
    payload.revisao_catalogo = revision.revisao;
    payload.proxima_atualizacao = revision.proxima_atualizacao;
    payload.realtime = revision.realtime;
  } catch {
    payload.revisao_catalogo = String(Date.now());
    payload.proxima_atualizacao = null;
    payload.realtime = null;
  }

  return payload;
}
