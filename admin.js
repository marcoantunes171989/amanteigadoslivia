(() => {
  'use strict';

  const loginView = document.getElementById('loginView');
  const appView = document.getElementById('appView');
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const loginButton = document.getElementById('loginButton');
  const logoutButton = document.getElementById('logoutButton');
  const overviewView = document.getElementById('overviewView');
  const categoriesView = document.getElementById('categoriesView');
  const productsView = document.getElementById('productsView');
  const viewTitle = document.getElementById('viewTitle');
  const viewEyebrow = document.getElementById('viewEyebrow');
  const statusMessage = document.getElementById('statusMessage');
  const formDialog = document.getElementById('formDialog');
  const resourceForm = document.getElementById('resourceForm');

  const state = {
    view: 'overview',
    catalog: { resumo: {}, categorias: [], produtos: [] },
    productQuery: '',
    productFilter: 'todos',
    slugManual: false,
  };

  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === 'className') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'htmlFor') node.htmlFor = value;
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
      else node.setAttribute(key, value === true ? '' : String(value));
    }
    for (const child of children) {
      if (child) node.append(child);
    }
    return node;
  }

  function showStatus(message, success = false) {
    statusMessage.hidden = !message;
    statusMessage.textContent = message || '';
    statusMessage.classList.toggle('is-success', success);
  }

  function slugFromName(name) {
    return String(name || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function isSafeImageUrl(url) {
    if (!url) return false;
    if (url.startsWith('assets/') || url.startsWith('/')) return true;
    try {
      const parsed = new URL(url, window.location.origin);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  function thumb(url, alt) {
    if (isSafeImageUrl(url)) {
      return el('img', { className: 'thumb', src: url, alt: alt || '' });
    }
    return el('div', { className: 'thumb placeholder', text: 'Sem imagem' });
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
      ...options,
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    if (!response.ok) {
      const error = new Error(payload?.message || payload?.error || 'request_failed');
      error.status = response.status;
      error.code = payload?.error || 'request_failed';
      throw error;
    }
    return payload;
  }

  async function loadCatalog() {
    const payload = await request('/api/admin/catalogo');
    state.catalog = payload;
    render();
  }

  function setView(view) {
    state.view = view;
    document.querySelectorAll('.nav-btn').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.view === view);
    });
    overviewView.classList.toggle('hidden', view !== 'overview');
    categoriesView.classList.toggle('hidden', view !== 'categories');
    productsView.classList.toggle('hidden', view !== 'products');
    const titles = {
      overview: ['Painel', 'Visão Geral'],
      categories: ['Catálogo', 'Categorias'],
      products: ['Catálogo', 'Produtos'],
    };
    viewEyebrow.textContent = titles[view][0];
    viewTitle.textContent = titles[view][1];
  }

  function badge(active) {
    return el('span', {
      className: active ? 'badge badge-ok' : 'badge badge-off',
      text: active ? 'Ativo' : 'Inativo',
    });
  }

  function renderOverview() {
    const resumo = state.catalog.resumo || {};
    overviewView.replaceChildren(
      el('div', { className: 'cards' }, [
        metric('Categorias', resumo.categorias),
        metric('Produtos', resumo.produtos),
        metric('Produtos ativos', resumo.produtos_ativos),
        metric('Produtos em destaque', resumo.produtos_destaque),
      ]),
    );
  }

  function metric(label, value) {
    return el('article', { className: 'card' }, [
      el('span', { text: label }),
      el('strong', { text: String(value ?? 0) }),
    ]);
  }

  function renderCategories() {
    const rows = state.catalog.categorias || [];
    const table = el('table', {}, [
      el('thead', {}, [
        el('tr', {}, [
          el('th', { text: 'Nome' }),
          el('th', { text: 'Slug' }),
          el('th', { text: 'Descrição' }),
          el('th', { text: 'Ordem' }),
          el('th', { text: 'Ativo' }),
          el('th', { text: 'Ações' }),
        ]),
      ]),
      el('tbody', {}, rows.map((category) => el('tr', {}, [
        el('td', { text: category.nome_categoria }),
        el('td', { text: category.slug_categoria }),
        el('td', { text: category.descricao_categoria || '—' }),
        el('td', { text: String(category.ordem_exibicao ?? 0) }),
        el('td', {}, [badge(category.ativo)]),
        el('td', {}, [categoryActions(category)]),
      ]))),
    ]);

    const cards = el('div', { className: 'category-cards' }, rows.map((category) => (
      el('article', { className: 'mobile-card' }, [
        el('strong', { text: category.nome_categoria }),
        el('span', { text: category.slug_categoria }),
        el('span', { text: category.descricao_categoria || 'Sem descrição' }),
        badge(category.ativo),
        categoryActions(category),
      ])
    )));

    categoriesView.replaceChildren(
      el('div', { className: 'toolbar' }, [
        el('p', { text: `${rows.length} categoria(s)` }),
        el('button', {
          className: 'btn btn-primary',
          type: 'button',
          text: '+ Nova categoria',
          onClick: () => openCategoryForm(),
        }),
      ]),
      el('div', { className: 'table-wrap' }, [
        rows.length ? table : el('p', { className: 'empty', text: 'Nenhuma categoria cadastrada.' }),
        rows.length ? cards : null,
      ]),
    );
  }

  function categoryActions(category) {
    return el('div', { className: 'actions' }, [
      el('button', {
        className: 'btn btn-ghost btn-small',
        type: 'button',
        text: 'Editar',
        onClick: () => openCategoryForm(category),
      }),
      el('button', {
        className: 'btn btn-ghost btn-small',
        type: 'button',
        text: category.ativo ? 'Desativar' : 'Ativar',
        onClick: () => { mutate('categoria', category.ativo ? 'desativar' : 'ativar', category.id_categoria).catch(() => {}); },
      }),
    ]);
  }

  function filteredProducts() {
    const query = state.productQuery.trim().toLowerCase();
    return (state.catalog.produtos || []).filter((product) => {
      if (state.productFilter === 'ativos' && !product.ativo) return false;
      if (state.productFilter === 'inativos' && product.ativo) return false;
      if (state.productFilter === 'destaques' && !product.destaque) return false;
      if (query && !String(product.nome_produto || '').toLowerCase().includes(query)) return false;
      return true;
    });
  }

  function renderProducts() {
    const rows = filteredProducts();
    const table = el('table', {}, [
      el('thead', {}, [
        el('tr', {}, [
          el('th', { text: 'Imagem' }),
          el('th', { text: 'Produto' }),
          el('th', { text: 'Categoria' }),
          el('th', { text: 'Preço' }),
          el('th', { text: 'Promoção' }),
          el('th', { text: 'Destaque' }),
          el('th', { text: 'Status' }),
          el('th', { text: 'Ações' }),
        ]),
      ]),
      el('tbody', {}, rows.map((product) => el('tr', {}, [
        el('td', {}, [thumb(product.url_imagem_principal, product.nome_produto)]),
        el('td', {}, [
          el('div', { className: 'product-cell' }, [
            el('div', {}, [
              el('strong', { text: product.nome_produto }),
              el('div', { className: 'hint', text: product.slug_produto }),
            ]),
          ]),
        ]),
        el('td', { text: product.nome_categoria || '—' }),
        el('td', { text: product.preco_normal ? `R$ ${product.preco_normal}` : '—' }),
        el('td', { text: product.promocao_ativa ? `R$ ${product.preco_promocional}` : '—' }),
        el('td', {}, [
          el('span', {
            className: product.destaque ? 'badge badge-warn' : 'badge badge-off',
            text: product.destaque ? 'Sim' : 'Não',
          }),
        ]),
        el('td', {}, [badge(product.ativo)]),
        el('td', {}, [productActions(product)]),
      ]))),
    ]);

    const cards = el('div', { className: 'product-cards' }, rows.map((product) => (
      el('article', { className: 'mobile-card' }, [
        el('div', { className: 'product-cell' }, [
          thumb(product.url_imagem_principal, product.nome_produto),
          el('div', {}, [
            el('strong', { text: product.nome_produto }),
            el('div', { className: 'hint', text: product.nome_categoria || 'Sem categoria' }),
          ]),
        ]),
        el('div', { text: product.preco_normal ? `Preço: R$ ${product.preco_normal}` : 'Sem preço' }),
        el('div', { text: product.promocao_ativa ? `Promoção: R$ ${product.preco_promocional}` : 'Sem promoção' }),
        badge(product.ativo),
        productActions(product),
      ])
    )));

    productsView.replaceChildren(
      el('div', { className: 'toolbar' }, [
        el('input', {
          className: 'search-input',
          type: 'search',
          placeholder: 'Buscar por nome',
          value: state.productQuery,
          onInput: (event) => {
            state.productQuery = event.target.value;
            renderProducts();
          },
        }),
        el('div', { className: 'filters' }, ['todos', 'ativos', 'inativos', 'destaques'].map((filter) => (
          el('button', {
            className: `chip${state.productFilter === filter ? ' is-active' : ''}`,
            type: 'button',
            text: filter[0].toUpperCase() + filter.slice(1),
            onClick: () => {
              state.productFilter = filter;
              renderProducts();
            },
          })
        ))),
        el('button', {
          className: 'btn btn-primary',
          type: 'button',
          text: '+ Novo produto',
          onClick: () => openProductForm(),
        }),
      ]),
      el('div', { className: 'table-wrap' }, [
        rows.length ? table : el('p', { className: 'empty', text: 'Nenhum produto encontrado.' }),
        rows.length ? cards : null,
      ]),
    );
  }

  function productActions(product) {
    return el('div', { className: 'actions' }, [
      el('button', {
        className: 'btn btn-ghost btn-small',
        type: 'button',
        text: 'Editar',
        onClick: () => openProductForm(product),
      }),
      el('button', {
        className: 'btn btn-ghost btn-small',
        type: 'button',
        text: product.ativo ? 'Desativar' : 'Ativar',
        onClick: () => { mutate('produto', product.ativo ? 'desativar' : 'ativar', product.id_produto).catch(() => {}); },
      }),
    ]);
  }

  function field(id, label, control, full = false) {
    return el('div', { className: full ? 'field full' : 'field' }, [
      el('label', { htmlFor: id, text: label }),
      control,
    ]);
  }

  function input(id, attrs = {}) {
    return el('input', { id, name: id, ...attrs });
  }

  function openCategoryForm(category) {
    state.slugManual = Boolean(category?.slug_categoria);
    resourceForm.replaceChildren(
      el('div', { className: 'dialog-body' }, [
        el('div', { className: 'dialog-header' }, [
          el('h2', { text: category ? 'Editar categoria' : 'Nova categoria' }),
          el('button', { className: 'btn btn-ghost btn-small', type: 'button', text: 'Fechar', value: 'cancel', onClick: () => formDialog.close() }),
        ]),
        el('input', { type: 'hidden', name: 'id_categoria', value: category?.id_categoria || '' }),
        field('nome', 'Nome *', input('nome', { required: true, value: category?.nome_categoria || '' })),
        field('slug', 'Slug *', input('slug', { required: true, value: category?.slug_categoria || '' })),
        field('descricao', 'Descrição', el('textarea', { id: 'descricao', name: 'descricao', rows: '3' })),
        field('ordem', 'Ordem', input('ordem', { type: 'number', min: '0', value: String(category?.ordem_exibicao ?? 0) })),
        el('div', { className: 'checkboxes' }, [
          checkbox('ativo', 'Ativo', category ? category.ativo : true),
        ]),
        el('p', { id: 'formError', className: 'form-error', hidden: true }),
        el('div', { className: 'dialog-actions' }, [
          el('button', { className: 'btn btn-ghost', type: 'button', text: 'Cancelar', onClick: () => formDialog.close() }),
          el('button', { className: 'btn btn-primary', type: 'submit', text: 'Salvar' }),
        ]),
      ]),
    );
    resourceForm.descricao.value = category?.descricao_categoria || '';
    bindSlugSync(resourceForm.nome, resourceForm.slug);
    resourceForm.dataset.kind = 'categoria';
    formDialog.showModal();
  }

  function openProductForm(product) {
    state.slugManual = Boolean(product?.slug_produto);
    const options = (state.catalog.categorias || []).map((category) => (
      el('option', {
        value: category.id_categoria,
        text: category.nome_categoria,
        selected: product?.id_categoria === category.id_categoria,
      })
    ));
    resourceForm.replaceChildren(
      el('div', { className: 'dialog-body' }, [
        el('div', { className: 'dialog-header' }, [
          el('h2', { text: product ? 'Editar produto' : 'Novo produto' }),
          el('button', { className: 'btn btn-ghost btn-small', type: 'button', text: 'Fechar', onClick: () => formDialog.close() }),
        ]),
        el('input', { type: 'hidden', name: 'id_produto', value: product?.id_produto || '' }),
        el('div', { className: 'form-grid' }, [
          field('id_categoria', 'Categoria *', el('select', { id: 'id_categoria', name: 'id_categoria', required: true }, [
            el('option', { value: '', text: 'Selecione' }),
            ...options,
          ]), true),
          field('nome', 'Nome *', input('nome', { required: true, value: product?.nome_produto || '' }), true),
          field('slug', 'Slug *', input('slug', { required: true, value: product?.slug_produto || '' })),
          field('ordem', 'Ordem de exibição', input('ordem', { type: 'number', min: '0', value: String(product?.ordem_exibicao ?? 0) })),
          field('descricao', 'Descrição', el('textarea', { id: 'descricao', name: 'descricao', rows: '3' }), true),
          field('preco_normal', 'Preço normal *', input('preco_normal', { required: true, inputmode: 'decimal', placeholder: '24,90', value: product?.preco_normal || '' })),
          field('preco_promocional', 'Preço promocional', input('preco_promocional', { inputmode: 'decimal', placeholder: '21,90', value: product?.preco_promocional || '' })),
          field('url_imagem', 'Imagem principal', input('url_imagem', { placeholder: 'https://... ou assets/...', value: product?.url_imagem_principal || '' }), true),
        ]),
        el('img', { id: 'imagePreview', className: 'preview hidden', alt: 'Pré-visualização da imagem' }),
        el('div', { className: 'checkboxes' }, [
          checkbox('promocao_ativa', 'Promoção ativa', Boolean(product?.promocao_ativa)),
          checkbox('destaque', 'Destaque', Boolean(product?.destaque)),
          checkbox('ativo', 'Ativo', product ? product.ativo : true),
        ]),
        el('p', { id: 'formError', className: 'form-error', hidden: true }),
        el('div', { className: 'dialog-actions' }, [
          el('button', { className: 'btn btn-ghost', type: 'button', text: 'Cancelar', onClick: () => formDialog.close() }),
          el('button', { className: 'btn btn-primary', type: 'submit', text: 'Salvar' }),
        ]),
      ]),
    );
    resourceForm.descricao.value = product?.descricao_produto || '';
    bindSlugSync(resourceForm.nome, resourceForm.slug);
    bindImagePreview(resourceForm.url_imagem, document.getElementById('imagePreview'));
    resourceForm.dataset.kind = 'produto';
    formDialog.showModal();
  }

  function checkbox(name, label, checked) {
    return el('label', {}, [
      el('input', { type: 'checkbox', name, checked }),
      document.createTextNode(label),
    ]);
  }

  function bindSlugSync(nameInput, slugInput) {
    nameInput.addEventListener('input', () => {
      if (!state.slugManual) slugInput.value = slugFromName(nameInput.value);
    });
    slugInput.addEventListener('input', () => {
      state.slugManual = true;
    });
  }

  function bindImagePreview(urlInput, preview) {
    const update = () => {
      const url = urlInput.value.trim();
      if (isSafeImageUrl(url)) {
        preview.src = url;
        preview.classList.remove('hidden');
      } else {
        preview.removeAttribute('src');
        preview.classList.add('hidden');
      }
    };
    urlInput.addEventListener('input', update);
    update();
  }

  function formError(message) {
    const node = document.getElementById('formError');
    if (!node) return;
    node.hidden = !message;
    node.textContent = message || '';
  }

  async function mutate(recurso, acao, id, dados) {
    showStatus('');
    try {
      await request('/api/admin/catalogo', {
        method: 'POST',
        body: JSON.stringify({ recurso, acao, id, dados }),
      });
      await loadCatalog();
      showStatus('Alteração salva com sucesso.', true);
    } catch (error) {
      showStatus(error.message || 'Não foi possível salvar.');
      throw error;
    }
  }

  resourceForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    formError('');
    const kind = resourceForm.dataset.kind;
    const data = new FormData(resourceForm);
    try {
      if (kind === 'categoria') {
        await mutate('categoria', data.get('id_categoria') ? 'editar' : 'criar', data.get('id_categoria') || undefined, {
          nome: String(data.get('nome') || ''),
          slug: String(data.get('slug') || ''),
          descricao: String(data.get('descricao') || ''),
          ordem: data.get('ordem'),
          ativo: resourceForm.ativo.checked,
        });
      } else {
        await mutate('produto', data.get('id_produto') ? 'editar' : 'criar', data.get('id_produto') || undefined, {
          id_categoria: String(data.get('id_categoria') || ''),
          nome: String(data.get('nome') || ''),
          slug: String(data.get('slug') || ''),
          descricao: String(data.get('descricao') || ''),
          preco_normal: String(data.get('preco_normal') || ''),
          preco_promocional: String(data.get('preco_promocional') || ''),
          promocao_ativa: resourceForm.promocao_ativa.checked,
          url_imagem_principal: String(data.get('url_imagem') || ''),
          destaque: resourceForm.destaque.checked,
          ativo: resourceForm.ativo.checked,
          ordem: data.get('ordem'),
        });
      }
      formDialog.close();
    } catch (error) {
      formError(error.message || 'Não foi possível salvar.');
    }
  });

  function render() {
    renderOverview();
    renderCategories();
    renderProducts();
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    loginError.hidden = true;
    loginButton.disabled = true;
    try {
      await request('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ senha: document.getElementById('adminPassword').value }),
      });
      loginForm.reset();
      await showApp();
    } catch (error) {
      loginError.hidden = false;
      loginError.textContent = error.status === 401
        ? 'Senha inválida. Tente novamente.'
        : 'Não foi possível entrar. Tente novamente.';
    } finally {
      loginButton.disabled = false;
    }
  });

  logoutButton.addEventListener('click', async () => {
    try {
      await request('/api/admin/logout', { method: 'POST' });
    } catch {
      // still return to login
    }
    showLogin();
  });

  document.querySelectorAll('.nav-btn').forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.view));
  });

  function showLogin() {
    appView.classList.add('hidden');
    loginView.classList.remove('hidden');
  }

  async function showApp() {
    await loadCatalog();
    loginView.classList.add('hidden');
    appView.classList.remove('hidden');
    setView(state.view);
  }

  async function boot() {
    try {
      await showApp();
    } catch (error) {
      showLogin();
      if (error.status && error.status !== 401) {
        loginError.hidden = false;
        loginError.textContent = 'Não foi possível carregar o painel.';
      }
    }
  }

  boot();
})();
