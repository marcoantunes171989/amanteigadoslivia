// ===================== DADOS DOS PRODUTOS =====================
// Estrutura centralizada — trocar por dados reais/API sem alterar a renderização.
// Product = { id, name, description, price, weight, image, category, bestSeller }
const PRODUCTS = [
  {
    id: 'goiabada',
    name: 'Amanteigado com Goiabada',
    description: 'Clássico e irresistível, com goiabada selecionada.',
    price: 29.90,
    weight: '250g',
    image: 'assets/encomendas.jpg',
    category: 'Tradicionais',
    bestSeller: true,
  },
  {
    id: 'chocolate',
    name: 'Amanteigado de Chocolate',
    description: 'Massa amanteigada com toque de chocolate e sabor marcante.',
    price: 29.90,
    weight: '250g',
    image: 'assets/festas.jpg',
    category: 'Tradicionais',
    bestSeller: true,
  },
  {
    id: 'coco',
    name: 'Amanteigado de Coco',
    description: 'Leve, crocante e com o sabor delicado do coco.',
    price: 29.90,
    weight: '250g',
    image: 'assets/personalizados.jpg',
    category: 'Tradicionais',
  },
  {
    id: 'goiaba',
    name: 'Amanteigado de Goiaba',
    description: 'Recheado com goiabada cremosa e sabor inconfundível.',
    price: 32.90,
    weight: '250g',
    image: 'assets/encomendas.jpg',
    category: 'Recheados',
    bestSeller: true,
  },
  {
    id: 'mesclado',
    name: 'Amanteigado Mesclado',
    description: 'A combinação perfeita entre baunilha e chocolate.',
    price: 32.90,
    weight: '250g',
    image: 'assets/festas.jpg',
    category: 'Especiais',
  },
  {
    id: 'limao',
    name: 'Amanteigado de Limão',
    description: 'Sabor cítrico suave com toque refrescante de limão.',
    price: 29.90,
    weight: '250g',
    image: 'assets/personalizados.jpg',
    category: 'Tradicionais',
  },
  {
    id: 'gotas',
    name: 'Amanteigado com Gotas',
    description: 'Tradicional com gotas de chocolate que derretem na boca.',
    price: 32.90,
    weight: '250g',
    image: 'assets/encomendas.jpg',
    category: 'Especiais',
  },
  {
    id: 'especial',
    name: 'Amanteigado Especial',
    description: 'Uma seleção especial para momentos que pedem carinho.',
    price: 34.90,
    weight: '250g',
    image: 'assets/festas.jpg',
    category: 'Especiais',
  },
  {
    id: 'personalizado',
    name: 'Amanteigado Personalizado',
    description: 'Com iniciais, mensagens ou tema especial para sua ocasião.',
    price: 36.90,
    weight: '250g',
    image: 'assets/personalizados.jpg',
    category: 'Personalizados',
  },
];

const WHATSAPP_NUMBER = '5500000000000';

function buildOrderLink(productName) {
  const text = encodeURIComponent(`Olá! Tenho interesse no ${productName}.`);
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${text}`;
}

function formatPrice(value) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ===================== ESTADO =====================
let activeCategory = 'Todos os produtos';
let activeSort = 'bestseller';

const grid = document.getElementById('productsGrid');
const emptyMsg = document.getElementById('productsEmpty');
const sortSelect = document.getElementById('sortSelect');
const filterButtons = document.querySelectorAll('#filterCats .pill');

function getVisibleProducts() {
  const list = activeCategory === 'Todos os produtos'
    ? PRODUCTS.slice()
    : PRODUCTS.filter((p) => p.category === activeCategory);

  switch (activeSort) {
    case 'price-asc':
      list.sort((a, b) => a.price - b.price);
      break;
    case 'price-desc':
      list.sort((a, b) => b.price - a.price);
      break;
    case 'name-asc':
      list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      break;
    default: // bestseller (Mais vendidos)
      list.sort((a, b) => (b.bestSeller ? 1 : 0) - (a.bestSeller ? 1 : 0));
      break;
  }
  return list;
}

function renderProducts() {
  const list = getVisibleProducts();
  grid.innerHTML = '';

  if (!list.length) {
    emptyMsg.hidden = false;
    return;
  }
  emptyMsg.hidden = true;

  const frag = document.createDocumentFragment();
  list.forEach((p) => {
    const article = document.createElement('article');
    article.className = 'card product-card';
    article.innerHTML = `
      <div class="card-img"><img src="${p.image}" alt="${p.name}" loading="lazy" /></div>
      <div class="card-foot">
        <div class="product-info">
          <h3 class="product-name">${p.name}</h3>
          <p class="product-desc">${p.description}</p>
          <div class="product-meta">
            <span class="product-price">${formatPrice(p.price)}</span>
            ${p.weight ? `<span class="product-weight">/ ${p.weight}</span>` : ''}
          </div>
        </div>
        <a class="btn btn-primary product-cta" href="${buildOrderLink(p.name)}" target="_blank" rel="noopener" aria-label="Ver detalhes de ${p.name}">
          Ver detalhes <svg class="ico"><use href="#i-arrow"/></svg>
        </a>
      </div>`;
    frag.appendChild(article);
  });
  grid.appendChild(frag);
}

filterButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    filterButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    activeCategory = btn.dataset.category;
    renderProducts();
  });
});

sortSelect.addEventListener('change', () => {
  activeSort = sortSelect.value;
  renderProducts();
});

renderProducts();
