// Navegação do Admin sem tela vazia: cache leve em memória, stale-while-revalidate e latest-view-wins.
// Módulo puro (sem DOM) para ser testado em node. Nada aqui persiste entre sessões nem vai para o armazenamento do navegador.

// Recursos de dados que cada view consome. Views que compartilham recurso reaproveitam o mesmo cache.
export const VIEW_RESOURCES = Object.freeze({
  overview: Object.freeze(['catalog', 'dashboard']),
  categories: Object.freeze(['catalog']),
  products: Object.freeze(['catalog']),
  branding: Object.freeze(['content']),
  homeContent: Object.freeze(['content']),
  encomendasContent: Object.freeze(['content']),
  festasContent: Object.freeze(['content']),
  personalizadosContent: Object.freeze(['content']),
  sales: Object.freeze(['sales']),
  requests: Object.freeze(['requests']),
  reports: Object.freeze(['reports']),
  publications: Object.freeze(['publications']),
  audit: Object.freeze(['audit']),
  users: Object.freeze(['users']),
});

// Janela em que um recurso já carregado é considerado atual (sem nova request ao reentrar na view).
// 0 = sempre revalida em background ao entrar (mostra o cache antes). Catálogo e conteúdo são compartilhados entre telas, por isso têm janela.
export const VIEW_CACHE_TTL_MS = Object.freeze({
  catalog: 30000,
  content: 30000,
  dashboard: 0,
  sales: 0,
  requests: 0,
  reports: 0,
  publications: 0,
  audit: 0,
  users: 0,
});

export function createViewCache({ now = () => Date.now(), ttl = VIEW_CACHE_TTL_MS } = {}) {
  // resource -> { key, at }. key identifica o filtro/período que gerou os dados.
  const entries = new Map();
  return {
    // Há dados desse recurso para essa chave (podem estar desatualizados).
    has(resource, key) {
      return entries.get(resource)?.key === key;
    },
    // Há dados e ainda estão dentro da janela de frescor.
    isFresh(resource, key) {
      const entry = entries.get(resource);
      return Boolean(entry) && entry.key === key && now() - entry.at < (ttl[resource] ?? 0);
    },
    mark(resource, key) {
      entries.set(resource, { key, at: now() });
    },
    // Mantém os dados (para renderizar já), mas marca todos como vencidos. Usado após qualquer escrita.
    invalidateAll() {
      for (const [resource, entry] of entries) entries.set(resource, { key: entry.key, at: -Infinity });
    },
    clear() {
      entries.clear();
    },
  };
}

// Views com edição não salva. Edição em background não pode substituir o que o usuário digitou.
export function createDirtyViews() {
  const dirty = new Set();
  return {
    mark(view) { dirty.add(view); },
    clear(view) { dirty.delete(view); },
    isDirty(view) { return dirty.has(view); },
    clearAll() { dirty.clear(); },
  };
}

// Campo de formulário (não conta busca nem botões de filtro como edição).
export function isFormField(target) {
  const tag = target?.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') return target.type !== 'search';
  return false;
}

// Controla a troca de view. Regras:
// - enter(view): renderiza na hora o que já está em cache (ou um esqueleto no primeiro acesso) e só depois revalida o que estiver vencido;
// - refresh(view): recarga explícita (ação do usuário ou escrita), sempre renderiza o resultado;
// - só a resposta da última navegação/recarga pode renderizar (latest-view-wins);
// - com edição não salva, enter não toca na view e a revalidação em background não a substitui;
// - erro com dados anteriores mantém a tela; sem dados, chama onError para mostrar o estado de erro.
export function createViewNavigator({
  cache,
  dirty,
  currentView,
  resourcesFor = (view) => VIEW_RESOURCES[view] || [],
  keyOf,
  load,
  paint,
  skeleton,
  onError,
}) {
  let latest = 0;

  function ticket(view) {
    latest += 1;
    const token = latest;
    return () => token === latest && currentView() === view;
  }

  async function run(view, names, toLoad, isCurrent, { force }) {
    try {
      await Promise.all(toLoad.map((name) => load(name, isCurrent)));
      if (!isCurrent()) return;
      if (dirty.isDirty(view) && !force) return;
      dirty.clear(view);
      paint(view);
    } catch (error) {
      if (!isCurrent()) return;
      onError(error, { view, hasData: names.every((name) => cache.has(name, keyOf(name))) });
    }
  }

  return {
    enter(view) {
      const names = resourcesFor(view);
      const isCurrent = ticket(view);
      // Edição em andamento: não repinta nem refaz a tela. Os dados atuais continuam os da própria view.
      if (dirty.isDirty(view)) return Promise.resolve();
      if (names.every((name) => cache.has(name, keyOf(name)))) paint(view);
      else skeleton(view);
      const toLoad = names.filter((name) => !cache.isFresh(name, keyOf(name)));
      if (!toLoad.length) return Promise.resolve();
      return run(view, names, toLoad, isCurrent, { force: false });
    },
    refresh(view) {
      const names = resourcesFor(view);
      return run(view, names, names, ticket(view), { force: true });
    },
  };
}
