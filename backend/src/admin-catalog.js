import { randomUUID } from 'node:crypto';
import { AdminError, mapDatabaseError } from './admin-errors.js';
import {
  assertSlug,
  formatCentavosToReais,
  parseBoolean,
  parseOrdem,
  parseReaisToCentavos,
  slugFromName,
} from './money.js';

export const SQL = {
  listCategorias: `-- op:list_categorias
    SELECT id_categoria, nome_categoria, slug_categoria, descricao_categoria,
           ordem_exibicao, ativo, data_criacao, data_atualizacao
    FROM app.tab_categoria
    ORDER BY ordem_exibicao ASC, nome_categoria ASC
  `,
  listProdutos: `-- op:list_produtos
    SELECT id_produto, id_categoria, nome_produto, slug_produto, descricao_produto,
           destaque, ativo, ordem_exibicao, data_criacao, data_atualizacao
    FROM app.tab_produto
    ORDER BY ordem_exibicao ASC, nome_produto ASC
  `,
  listImagens: `-- op:list_imagens
    SELECT id_imagem, id_produto, url_imagem, texto_alternativo, ordem_exibicao, principal, data_criacao
    FROM app.tab_produto_imagem
    ORDER BY ordem_exibicao ASC, data_criacao ASC
  `,
  listPrecos: `-- op:list_precos
    SELECT id_preco, id_produto, valor_centavos, codigo_moeda, promocional,
           inicio_vigencia, fim_vigencia, ativo, data_criacao
    FROM app.tab_produto_preco
    ORDER BY data_criacao ASC
  `,
  getCategoria: `-- op:get_categoria
    SELECT id_categoria, nome_categoria, slug_categoria, descricao_categoria,
           ordem_exibicao, ativo
    FROM app.tab_categoria
    WHERE id_categoria = $1
  `,
  insertCategoria: `-- op:insert_categoria
    INSERT INTO app.tab_categoria (
      id_categoria, nome_categoria, slug_categoria, descricao_categoria,
      ordem_exibicao, ativo
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id_categoria, nome_categoria, slug_categoria, descricao_categoria,
              ordem_exibicao, ativo
  `,
  updateCategoria: `-- op:update_categoria
    UPDATE app.tab_categoria
    SET nome_categoria = $2,
        slug_categoria = $3,
        descricao_categoria = $4,
        ordem_exibicao = $5,
        ativo = $6,
        data_atualizacao = now()
    WHERE id_categoria = $1
    RETURNING id_categoria, nome_categoria, slug_categoria, descricao_categoria,
              ordem_exibicao, ativo
  `,
  setCategoriaAtivo: `-- op:set_categoria_ativo
    UPDATE app.tab_categoria
    SET ativo = $2, data_atualizacao = now()
    WHERE id_categoria = $1
    RETURNING id_categoria, nome_categoria, slug_categoria, descricao_categoria,
              ordem_exibicao, ativo
  `,
  getProduto: `-- op:get_produto
    SELECT id_produto, id_categoria, nome_produto, slug_produto, descricao_produto,
           ativo, destaque, ordem_exibicao
    FROM app.tab_produto
    WHERE id_produto = $1
  `,
  insertProduto: `-- op:insert_produto
    INSERT INTO app.tab_produto (
      id_produto, id_categoria, nome_produto, slug_produto, descricao_produto,
      ativo, destaque, ordem_exibicao
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id_produto, id_categoria, nome_produto, slug_produto, descricao_produto,
              ativo, destaque, ordem_exibicao
  `,
  updateProduto: `-- op:update_produto
    UPDATE app.tab_produto
    SET id_categoria = $2,
        nome_produto = $3,
        slug_produto = $4,
        descricao_produto = $5,
        ativo = $6,
        destaque = $7,
        ordem_exibicao = $8,
        data_atualizacao = now()
    WHERE id_produto = $1
    RETURNING id_produto, id_categoria, nome_produto, slug_produto, descricao_produto,
              ativo, destaque, ordem_exibicao
  `,
  setProdutoAtivo: `-- op:set_produto_ativo
    UPDATE app.tab_produto
    SET ativo = $2, data_atualizacao = now()
    WHERE id_produto = $1
    RETURNING id_produto, id_categoria, nome_produto, slug_produto, descricao_produto,
              ativo, destaque, ordem_exibicao
  `,
  setProdutoDestaque: `-- op:set_produto_destaque
    UPDATE app.tab_produto
    SET destaque = $2, data_atualizacao = now()
    WHERE id_produto = $1
    RETURNING id_produto, id_categoria, nome_produto, slug_produto, descricao_produto,
              ativo, destaque, ordem_exibicao
  `,
  listPrecosProduto: `-- op:list_precos_produto
    SELECT id_preco, id_produto, valor_centavos, codigo_moeda, promocional,
           inicio_vigencia, fim_vigencia, ativo, data_criacao
    FROM app.tab_produto_preco
    WHERE id_produto = $1
    ORDER BY data_criacao DESC
  `,
  deactivatePrecos: `-- op:deactivate_precos
    UPDATE app.tab_produto_preco
    SET ativo = false
    WHERE id_produto = $1 AND promocional = $2 AND ativo = true
  `,
  insertPreco: `-- op:insert_preco
    INSERT INTO app.tab_produto_preco (
      id_preco, id_produto, valor_centavos, codigo_moeda, promocional, ativo
    ) VALUES ($1, $2, $3, 'BRL', $4, true)
    RETURNING id_preco, id_produto, valor_centavos, codigo_moeda, promocional, ativo, data_criacao
  `,
  listImagensProduto: `-- op:list_imagens_produto
    SELECT id_imagem, id_produto, url_imagem, texto_alternativo, ordem_exibicao, principal
    FROM app.tab_produto_imagem
    WHERE id_produto = $1
  `,
  clearPrincipal: `-- op:clear_principal
    UPDATE app.tab_produto_imagem
    SET principal = false
    WHERE id_produto = $1 AND principal = true
  `,
  updateImagem: `-- op:update_imagem
    UPDATE app.tab_produto_imagem
    SET url_imagem = $2, texto_alternativo = $3, principal = true
    WHERE id_imagem = $1
    RETURNING id_imagem, id_produto, url_imagem, texto_alternativo, ordem_exibicao, principal
  `,
  setImagemPrincipalFlag: `-- op:set_imagem_principal_flag
    UPDATE app.tab_produto_imagem
    SET principal = true, texto_alternativo = COALESCE($2, texto_alternativo)
    WHERE id_imagem = $1
    RETURNING id_imagem
  `,
  insertImagem: `-- op:insert_imagem
    INSERT INTO app.tab_produto_imagem (
      id_imagem, id_produto, url_imagem, texto_alternativo, ordem_exibicao, principal
    ) VALUES ($1, $2, $3, $4, 0, true)
    RETURNING id_imagem, id_produto, url_imagem, texto_alternativo, ordem_exibicao, principal
  `,
};

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

function pickCurrentPrice(rows, promotional, now = new Date()) {
  return rows
    .filter((row) => row.promocional === promotional && isPriceCurrent(row, now))
    .sort((a, b) => {
      const aTime = asDate(a.data_criacao)?.getTime() ?? 0;
      const bTime = asDate(b.data_criacao)?.getTime() ?? 0;
      return bTime - aTime;
    })[0] ?? null;
}

function pickPrimaryImage(rows) {
  return rows.slice().sort((a, b) => {
    if (a.principal === true && b.principal !== true) return -1;
    if (b.principal === true && a.principal !== true) return 1;
    return (a.ordem_exibicao ?? 0) - (b.ordem_exibicao ?? 0);
  })[0] ?? null;
}

function groupByProduct(rows, key = 'id_produto') {
  const map = new Map();
  for (const row of rows) {
    const id = String(row[key]);
    const list = map.get(id) || [];
    list.push(row);
    map.set(id, list);
  }
  return map;
}

function requiredText(value, label) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    throw new AdminError(400, 'validation_error', `${label} é obrigatório.`);
  }
  return text;
}

function optionalText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

function resolveSlug(name, slug, label) {
  const generated = slugFromName(name);
  const resolved = optionalText(slug) || generated;
  if (!resolved) {
    throw new AdminError(400, 'validation_error', `${label} é obrigatório.`);
  }
  return assertSlug(resolved, label);
}

function readCentavos(dados, reaisKeys, centavosKeys) {
  for (const key of centavosKeys) {
    if (dados[key] !== undefined && dados[key] !== null && dados[key] !== '') {
      const asNumber = Number(dados[key]);
      if (!Number.isInteger(asNumber) || asNumber <= 0) {
        throw new AdminError(400, 'validation_error', 'Preço inválido.');
      }
      return asNumber;
    }
  }
  for (const key of reaisKeys) {
    if (dados[key] !== undefined) {
      return parseReaisToCentavos(dados[key]);
    }
  }
  return undefined;
}

function normalizeCategoriaInput(dados = {}, { partial = false } = {}) {
  const nome = dados.nome_categoria ?? dados.nome;
  const slug = dados.slug_categoria ?? dados.slug;
  const descricao = dados.descricao_categoria ?? dados.descricao;
  const ordem = dados.ordem_exibicao ?? dados.ordem;
  const ativo = dados.ativo;

  const resolvedNome = partial && nome === undefined ? undefined : requiredText(nome, 'Nome');
  return {
    nome_categoria: resolvedNome,
    slug_categoria: resolvedNome === undefined && slug === undefined
      ? undefined
      : resolveSlug(resolvedNome || '', slug, 'Slug'),
    descricao_categoria: descricao === undefined ? (partial ? undefined : null) : optionalText(descricao),
    ordem_exibicao: ordem === undefined ? (partial ? undefined : 0) : parseOrdem(ordem, 0),
    ativo: ativo === undefined ? (partial ? undefined : true) : parseBoolean(ativo, true),
  };
}

function normalizeProdutoInput(dados = {}) {
  const nome = requiredText(dados.nome_produto ?? dados.nome, 'Nome');
  const idCategoria = requiredText(String(dados.id_categoria ?? dados.categoria ?? ''), 'Categoria');
  const descricao = optionalText(dados.descricao_produto ?? dados.descricao);
  const urlImagem = optionalText(dados.url_imagem_principal ?? dados.url_imagem ?? dados.imagem);
  const precoNormal = readCentavos(
    dados,
    ['preco_normal', 'preco'],
    ['preco_normal_centavos'],
  );
  const precoPromocional = readCentavos(
    dados,
    ['preco_promocional'],
    ['preco_promocional_centavos'],
  );
  const promocaoAtiva = dados.promocao_ativa === undefined
    ? precoPromocional != null
    : parseBoolean(dados.promocao_ativa, false);

  if (precoNormal == null) {
    throw new AdminError(400, 'validation_error', 'Preço normal é obrigatório.');
  }
  if (promocaoAtiva && precoPromocional == null) {
    throw new AdminError(400, 'validation_error', 'Informe o preço promocional.');
  }
  if (promocaoAtiva && precoPromocional >= precoNormal) {
    throw new AdminError(400, 'validation_error', 'Preço promocional deve ser menor que o preço normal.');
  }
  if (urlImagem && urlImagem.length > 2048) {
    throw new AdminError(400, 'validation_error', 'URL da imagem é inválida.');
  }

  return {
    id_categoria: idCategoria,
    nome_produto: nome,
    slug_produto: resolveSlug(nome, dados.slug_produto ?? dados.slug, 'Slug'),
    descricao_produto: descricao,
    ativo: parseBoolean(dados.ativo, true),
    destaque: parseBoolean(dados.destaque, false),
    ordem_exibicao: parseOrdem(dados.ordem_exibicao ?? dados.ordem, 0),
    preco_normal_centavos: precoNormal,
    preco_promocional_centavos: promocaoAtiva ? precoPromocional : null,
    promocao_ativa: promocaoAtiva,
    url_imagem_principal: urlImagem,
  };
}

async function withTransaction(pool, fn) {
  if (typeof pool.connect === 'function') {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // rollback best-effort
      }
      throw error;
    } finally {
      client.release();
    }
  }

  await pool.query('BEGIN');
  try {
    const result = await fn(pool);
    await pool.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await pool.query('ROLLBACK');
    } catch {
      // rollback best-effort
    }
    throw error;
  }
}

async function requireRow(result, message) {
  const row = result?.rows?.[0];
  if (!row) {
    throw new AdminError(404, 'not_found', message);
  }
  return row;
}

function toCentavosNumber(value) {
  if (value === null || value === undefined) return null;
  return typeof value === 'bigint' ? Number(value) : Number(value);
}

export function assembleAdminCatalog({ categories, products, images, prices, now = new Date() }) {
  const imagesByProduct = groupByProduct(images);
  const pricesByProduct = groupByProduct(prices);
  const categoriesById = new Map(categories.map((item) => [String(item.id_categoria), item]));

  const produtos = products.map((product) => {
    const productId = String(product.id_produto);
    const category = categoriesById.get(String(product.id_categoria));
    const productPrices = pricesByProduct.get(productId) || [];
    const regular = pickCurrentPrice(productPrices, false, now);
    const promotional = pickCurrentPrice(productPrices, true, now);
    const image = pickPrimaryImage(imagesByProduct.get(productId) || []);
    const precoNormal = toCentavosNumber(regular?.valor_centavos);
    const precoPromocional = toCentavosNumber(promotional?.valor_centavos);

    return {
      id_produto: productId,
      id_categoria: String(product.id_categoria),
      nome_produto: product.nome_produto,
      slug_produto: product.slug_produto,
      descricao_produto: product.descricao_produto || null,
      ativo: product.ativo === true,
      destaque: product.destaque === true,
      ordem_exibicao: product.ordem_exibicao ?? 0,
      nome_categoria: category?.nome_categoria || null,
      slug_categoria: category?.slug_categoria || null,
      preco_normal_centavos: precoNormal,
      preco_promocional_centavos: precoPromocional,
      preco_normal: formatCentavosToReais(precoNormal),
      preco_promocional: formatCentavosToReais(precoPromocional),
      promocao_ativa: precoPromocional != null,
      url_imagem_principal: image?.url_imagem || null,
    };
  });

  return {
    resumo: {
      categorias: categories.length,
      produtos: products.length,
      produtos_ativos: products.filter((item) => item.ativo === true).length,
      produtos_destaque: products.filter((item) => item.destaque === true).length,
    },
    categorias: categories.map((item) => ({
      id_categoria: String(item.id_categoria),
      nome_categoria: item.nome_categoria,
      slug_categoria: item.slug_categoria,
      descricao_categoria: item.descricao_categoria || null,
      ordem_exibicao: item.ordem_exibicao ?? 0,
      ativo: item.ativo === true,
    })),
    produtos,
  };
}

export async function getAdminCatalog(queryable) {
  const categories = await queryable.query(SQL.listCategorias);
  const products = await queryable.query(SQL.listProdutos);
  const images = await queryable.query(SQL.listImagens);
  const prices = await queryable.query(SQL.listPrecos);

  return assembleAdminCatalog({
    categories: categories.rows,
    products: products.rows,
    images: images.rows,
    prices: prices.rows,
  });
}

export async function createCategoria(queryable, dados) {
  const input = normalizeCategoriaInput(dados);
  try {
    const result = await queryable.query(SQL.insertCategoria, [
      dados.id_categoria || randomUUID(),
      input.nome_categoria,
      input.slug_categoria,
      input.descricao_categoria,
      input.ordem_exibicao,
      input.ativo,
    ]);
    return result.rows[0];
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function updateCategoria(queryable, id, dados) {
  if (!id) {
    throw new AdminError(400, 'validation_error', 'Categoria é obrigatória.');
  }
  const currentResult = await queryable.query(SQL.getCategoria, [id]);
  const current = await requireRow(currentResult, 'Categoria não encontrada.');
  const input = normalizeCategoriaInput({
    nome: dados.nome_categoria ?? dados.nome ?? current.nome_categoria,
    slug: dados.slug_categoria ?? dados.slug ?? current.slug_categoria,
    descricao: dados.descricao_categoria ?? dados.descricao ?? current.descricao_categoria,
    ordem: dados.ordem_exibicao ?? dados.ordem ?? current.ordem_exibicao,
    ativo: dados.ativo ?? current.ativo,
  });
  try {
    const result = await queryable.query(SQL.updateCategoria, [
      id,
      input.nome_categoria,
      input.slug_categoria,
      input.descricao_categoria,
      input.ordem_exibicao,
      input.ativo,
    ]);
    return await requireRow(result, 'Categoria não encontrada.');
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function setCategoriaAtivo(queryable, id, ativo) {
  if (!id) {
    throw new AdminError(400, 'validation_error', 'Categoria é obrigatória.');
  }
  try {
    const result = await queryable.query(SQL.setCategoriaAtivo, [id, parseBoolean(ativo, true)]);
    return await requireRow(result, 'Categoria não encontrada.');
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

async function syncPrecoNormal(client, idProduto, novoCentavos) {
  const currentRows = await client.query(SQL.listPrecosProduto, [idProduto]);
  const current = pickCurrentPrice(currentRows.rows, false);
  if (current && toCentavosNumber(current.valor_centavos) === novoCentavos) {
    return;
  }
  await client.query(SQL.deactivatePrecos, [idProduto, false]);
  await client.query(SQL.insertPreco, [randomUUID(), idProduto, novoCentavos, false]);
}

async function syncPrecoPromocional(client, idProduto, { promocaoAtiva, centavos }) {
  if (!promocaoAtiva || centavos == null) {
    await client.query(SQL.deactivatePrecos, [idProduto, true]);
    return;
  }
  const currentRows = await client.query(SQL.listPrecosProduto, [idProduto]);
  const current = pickCurrentPrice(currentRows.rows, true);
  if (current && toCentavosNumber(current.valor_centavos) === centavos) {
    return;
  }
  await client.query(SQL.deactivatePrecos, [idProduto, true]);
  await client.query(SQL.insertPreco, [randomUUID(), idProduto, centavos, true]);
}

async function syncImagemPrincipal(client, idProduto, url, alt) {
  if (!url) {
    return;
  }
  const existing = await client.query(SQL.listImagensProduto, [idProduto]);
  const rows = existing.rows;
  const sameUrl = rows.find((row) => row.url_imagem === url);
  const previousPrincipal = rows.find((row) => row.principal === true);
  await client.query(SQL.clearPrincipal, [idProduto]);
  if (sameUrl) {
    await client.query(SQL.setImagemPrincipalFlag, [sameUrl.id_imagem, alt]);
    return;
  }
  if (previousPrincipal) {
    await client.query(SQL.updateImagem, [previousPrincipal.id_imagem, url, alt]);
    return;
  }
  await client.query(SQL.insertImagem, [randomUUID(), idProduto, url, alt]);
}

export async function createProduto(pool, dados) {
  const input = normalizeProdutoInput(dados);
  try {
    return await withTransaction(pool, async (client) => {
      const categoria = await client.query(SQL.getCategoria, [input.id_categoria]);
      if (!categoria.rows[0]) {
        throw new AdminError(400, 'validation_error', 'Categoria inválida.');
      }
      const inserted = await client.query(SQL.insertProduto, [
        dados.id_produto || randomUUID(),
        input.id_categoria,
        input.nome_produto,
        input.slug_produto,
        input.descricao_produto,
        input.ativo,
        input.destaque,
        input.ordem_exibicao,
      ]);
      const produto = inserted.rows[0];
      await client.query(SQL.insertPreco, [
        randomUUID(),
        produto.id_produto,
        input.preco_normal_centavos,
        false,
      ]);
      if (input.promocao_ativa) {
        await client.query(SQL.insertPreco, [
          randomUUID(),
          produto.id_produto,
          input.preco_promocional_centavos,
          true,
        ]);
      }
      if (input.url_imagem_principal) {
        await client.query(SQL.insertImagem, [
          randomUUID(),
          produto.id_produto,
          input.url_imagem_principal,
          input.nome_produto,
        ]);
      }
      return produto;
    });
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function updateProduto(pool, id, dados) {
  if (!id) {
    throw new AdminError(400, 'validation_error', 'Produto é obrigatório.');
  }
  try {
    return await withTransaction(pool, async (client) => {
      const currentResult = await client.query(SQL.getProduto, [id]);
      const current = await requireRow(currentResult, 'Produto não encontrado.');
      const merged = {
        id_categoria: dados.id_categoria ?? dados.categoria ?? current.id_categoria,
        nome: dados.nome_produto ?? dados.nome ?? current.nome_produto,
        slug: dados.slug_produto ?? dados.slug ?? current.slug_produto,
        descricao: dados.descricao_produto ?? dados.descricao ?? current.descricao_produto,
        ativo: dados.ativo ?? current.ativo,
        destaque: dados.destaque ?? current.destaque,
        ordem: dados.ordem_exibicao ?? dados.ordem ?? current.ordem_exibicao,
        preco_normal: dados.preco_normal,
        preco_normal_centavos: dados.preco_normal_centavos,
        preco_promocional: dados.preco_promocional,
        preco_promocional_centavos: dados.preco_promocional_centavos,
        promocao_ativa: dados.promocao_ativa,
        url_imagem_principal: dados.url_imagem_principal ?? dados.url_imagem ?? dados.imagem,
      };
      if (merged.preco_normal === undefined && merged.preco_normal_centavos === undefined) {
        const prices = await client.query(SQL.listPrecosProduto, [id]);
        const currentNormal = pickCurrentPrice(prices.rows, false);
        merged.preco_normal_centavos = toCentavosNumber(currentNormal?.valor_centavos);
      }
      if (merged.promocao_ativa === undefined
        && merged.preco_promocional === undefined
        && merged.preco_promocional_centavos === undefined) {
        const prices = await client.query(SQL.listPrecosProduto, [id]);
        const currentPromo = pickCurrentPrice(prices.rows, true);
        merged.promocao_ativa = Boolean(currentPromo);
        merged.preco_promocional_centavos = toCentavosNumber(currentPromo?.valor_centavos);
      }
      const input = normalizeProdutoInput(merged);
      const updated = await client.query(SQL.updateProduto, [
        id,
        input.id_categoria,
        input.nome_produto,
        input.slug_produto,
        input.descricao_produto,
        input.ativo,
        input.destaque,
        input.ordem_exibicao,
      ]);
      const produto = await requireRow(updated, 'Produto não encontrado.');
      await syncPrecoNormal(client, id, input.preco_normal_centavos);
      await syncPrecoPromocional(client, id, {
        promocaoAtiva: input.promocao_ativa,
        centavos: input.preco_promocional_centavos,
      });
      if (input.url_imagem_principal) {
        await syncImagemPrincipal(client, id, input.url_imagem_principal, input.nome_produto);
      }
      return produto;
    });
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function setProdutoAtivo(queryable, id, ativo) {
  if (!id) {
    throw new AdminError(400, 'validation_error', 'Produto é obrigatório.');
  }
  try {
    const result = await queryable.query(SQL.setProdutoAtivo, [id, parseBoolean(ativo, true)]);
    return await requireRow(result, 'Produto não encontrado.');
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function setProdutoDestaque(queryable, id, destaque) {
  if (!id) {
    throw new AdminError(400, 'validation_error', 'Produto é obrigatório.');
  }
  try {
    const result = await queryable.query(SQL.setProdutoDestaque, [id, parseBoolean(destaque, false)]);
    return await requireRow(result, 'Produto não encontrado.');
  } catch (error) {
    throw mapDatabaseError(error);
  }
}

export async function executeAdminAction(pool, payload = {}) {
  const recurso = payload.recurso;
  const acao = payload.acao;
  const id = payload.id || payload.id_categoria || payload.id_produto;
  const dados = payload.dados || payload;

  if (recurso === 'categoria') {
    if (acao === 'criar') return { categoria: await createCategoria(pool, dados) };
    if (acao === 'editar') return { categoria: await updateCategoria(pool, id, dados) };
    if (acao === 'ativar') return { categoria: await setCategoriaAtivo(pool, id, true) };
    if (acao === 'desativar') return { categoria: await setCategoriaAtivo(pool, id, false) };
  }

  if (recurso === 'produto') {
    if (acao === 'criar') return { produto: await createProduto(pool, dados) };
    if (acao === 'editar') return { produto: await updateProduto(pool, id, dados) };
    if (acao === 'ativar') return { produto: await setProdutoAtivo(pool, id, true) };
    if (acao === 'desativar') return { produto: await setProdutoAtivo(pool, id, false) };
    if (acao === 'destacar') return { produto: await setProdutoDestaque(pool, id, true) };
    if (acao === 'remover_destaque') return { produto: await setProdutoDestaque(pool, id, false) };
  }

  throw new AdminError(400, 'validation_error', 'Ação administrativa inválida.');
}
