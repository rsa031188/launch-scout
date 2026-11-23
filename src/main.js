import './styles.css';

const icon = (name, size = 18) => {
  const paths = {
    radar: '<circle cx="12" cy="12" r="8.5"/><path d="M12 12 18.5 5.5M12 4a8 8 0 0 1 8 8M4 12a8 8 0 0 1 8-8M12 20a8 8 0 0 1-8-8"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/>',
    settings: '<path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/><circle cx="12" cy="12" r="4"/>',
    grid: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
    bookmark: '<path d="M6 4.8A1.8 1.8 0 0 1 7.8 3h8.4A1.8 1.8 0 0 1 18 4.8V21l-6-3.6L6 21V4.8Z"/>',
    arrow: '<path d="M5 12h13M13 6l6 6-6 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    spark: '<path d="m12 3 1.3 5.7L19 10l-5.7 1.3L12 17l-1.3-5.7L5 10l5.7-1.3L12 3ZM19 16l.6 2.4L22 19l-2.4.6L19 22l-.6-2.4L16 19l2.4-.6L19 16Z"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.1.1l1.8-1.8a5 5 0 0 0-7.1-7.1L10.7 5.3"/><path d="M14 11a5 5 0 0 0-7.1-.1l-1.8 1.8a5 5 0 0 0 7.1 7.1l1.1-1.1"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>'
  };
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.spark}</svg>`;
};

const INTERNAL_MCP_ENDPOINT = `${window.location.origin}/api/mcp`;
const state = {
  launches: JSON.parse(localStorage.getItem('launchscout-launches') || 'null') || [],
  query: '',
  eventName: '',
  platform: 'Todas',
  type: 'Todos',
  period: 'Todos',
  producer: 'Todos',
  status: 'Todos',
  sort: 'relevance',
  searchLimit: 50,
  view: 'catalog',
  settingsOpen: false,
  editingConnectionId: 'primary',
  pendingToken: '',
  lastSync: localStorage.getItem('launchscout-last-sync') || 'agora mesmo',
  config: JSON.parse(localStorage.getItem('launchscout-config') || 'null') || {
    agentName: 'LaunchScout Scout',
    connections: [{ id: 'primary', name: 'LaunchScout Core', role: 'Catálogo unificado', endpoint: INTERNAL_MCP_ENDPOINT, token: '', connected: true }]
  }
};

if (!Array.isArray(state.config.connections)) {
  state.config.connections = [{
    id: 'primary',
    name: state.config.agentName || 'LaunchScout Scout',
    endpoint: state.config.endpoint || INTERNAL_MCP_ENDPOINT,
    token: state.config.token || '',
    connected: state.config.connected !== false,
    role: 'Catálogo principal'
  }];
}
state.config.connections = state.config.connections.map((connection) => (connection.endpoint?.includes('mcp.launchscout.local') || connection.endpoint?.includes('sculpted-orange-giraffe-25.hostingersite.com')) ? { ...connection, endpoint: INTERNAL_MCP_ENDPOINT, token: '', name: connection.id === 'primary' ? 'LaunchScout Core' : connection.name } : connection);
const activeConnections = () => state.config.connections.filter((connection) => connection.connected && connection.endpoint);
const activeConnection = () => activeConnections()[0] || state.config.connections[0];
state.launches = state.launches.filter((item) => !String(item.registration || '').includes('example.com') && item.source !== 'demo.launchscout');

const app = document.querySelector('#app');
const saveState = () => {
  localStorage.setItem('launchscout-launches', JSON.stringify(state.launches));
  localStorage.setItem('launchscout-config', JSON.stringify(state.config));
};
const esc = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
const formatDate = (value, compact = false) => new Intl.DateTimeFormat('pt-BR', compact ? { day: '2-digit', month: 'short' } : { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)).replace('.', '');
const daysUntil = (value) => Math.ceil((new Date(value).getTime() - Date.now()) / 86400000);
const relativeDate = (value) => {
  const days = daysUntil(value);
  if (days <= 0) return 'Hoje';
  if (days === 1) return 'Amanhã';
  if (days < 7) return `Em ${days} dias`;
  return formatDate(value, true);
};
const unique = (items) => [...new Set(items)].sort((a, b) => a.localeCompare(b));

function getFilteredLaunches() {
  const q = state.query.trim().toLowerCase();
  const eventName = state.eventName.trim().toLowerCase();
  return state.launches.filter((item) => {
    const matchesQuery = !q || [item.title, item.producer, item.type, item.summary, item.tags.join(' ')].join(' ').toLowerCase().includes(q);
    const matchesEventName = !eventName || item.title.toLowerCase().includes(eventName);
    const matchesType = state.type === 'Todos' || item.type === state.type;
    const matchesProducer = state.producer === 'Todos' || item.producer === state.producer;
    const matchesPlatform = state.platform === 'Todas' || item.source === state.platform;
    const matchesStatus = state.status === 'Todos' || (state.status === 'Salvos' ? item.saved : item.status === 'new');
    const days = daysUntil(item.date);
    const now = new Date();
    const itemDate = new Date(item.date);
    const matchesPeriod = state.period === 'Todos' || (state.period === 'Próximos 7 dias' ? days <= 7 && days >= 0 : state.period === 'Este mês' ? itemDate.getMonth() === now.getMonth() && itemDate.getFullYear() === now.getFullYear() : days > 7);
    return matchesQuery && matchesEventName && matchesType && matchesProducer && matchesPlatform && matchesStatus && matchesPeriod;
  }).sort((a, b) => {
    if (state.sort === 'date') return new Date(a.date) - new Date(b.date);
    if (state.sort === 'discovered') return new Date(b.discoveredAt) - new Date(a.discoveredAt);
    if (state.sort === 'saved') return Number(b.saved) - Number(a.saved);
    return Number(b.saved) - Number(a.saved) || new Date(a.date) - new Date(b.date);
  });
}

function statCards() {
  const upcoming = state.launches.filter((item) => daysUntil(item.date) >= 0 && daysUntil(item.date) <= 30).length;
  const saved = state.launches.filter((item) => item.saved).length;
  const sources = unique(state.launches.map((item) => item.source)).length;
  return [
    { label: 'No radar', value: state.launches.length, delta: `${state.launches.length ? 'dados MCP sincronizados' : 'aguardando primeira pesquisa'}`, tone: 'lime' },
    { label: 'A seguir', value: saved, delta: `${saved ? 'Curadoria ativa' : 'Comece agora'}`, tone: 'violet' },
    { label: 'Próximos 30 dias', value: upcoming, delta: 'janela de oportunidade', tone: 'orange' },
    { label: 'Fontes ativas', value: sources, delta: `sync ${state.lastSync}`, tone: 'blue' }
  ];
}

function renderSidebar() {
  return `<aside class="sidebar">
    <div class="brand-lockup">
      <div class="brand-mark">${icon('radar', 24)}</div>
      <div><div class="brand-name">LaunchScout</div><div class="brand-kicker">personal launch radar</div></div>
    </div>
    <div class="workspace-label">Workspace <span class="status-dot"></span></div>
    <nav class="main-nav" aria-label="Navegação principal">
      <button class="nav-item ${state.view === 'dashboard' ? 'active' : ''}" data-view="dashboard">${icon('grid')}<span>Visão geral</span><kbd>G</kbd></button>
      <button class="nav-item ${state.view === 'catalog' ? 'active' : ''}" data-view="catalog">${icon('radar')}<span>Radar de lançamentos</span><b class="nav-count">${state.launches.length}</b></button>
      <button class="nav-item ${state.view === 'saved' ? 'active' : ''}" data-view="saved">${icon('bookmark')}<span>Minha lista</span><b class="nav-count">${state.launches.filter((item) => item.saved).length}</b></button>
    </nav>
    <div class="sidebar-bottom">
      <div class="sync-card">
        <div class="sync-card-top"><span class="signal-bars"><i></i><i></i><i></i></span><span>Scout online</span></div>
        <p>Última varredura<br><strong>${esc(state.lastSync)}</strong></p>
        <button class="text-button" data-action="discover">${icon('spark', 14)} Buscar novidades</button>
      </div>
      <button class="nav-item settings-link" data-action="settings">${icon('settings')}<span>Configurações MCP</span></button>
      <div class="profile-chip"><div class="avatar">RA</div><div><strong>Ronaldo Alves</strong><small>Curador pessoal</small></div><span class="profile-more">•••</span></div>
    </div>
  </aside>`;
}

function renderTopbar(title, eyebrow = 'RADAR PESSOAL') {
  return `<header class="topbar"><div class="topbar-heading"><div class="eyebrow">${eyebrow}</div><h1>${title}</h1></div><div class="topbar-actions"><div class="quick-search">${icon('search', 17)}<input data-field="query" value="${esc(state.query)}" placeholder="Buscar lançamentos..." aria-label="Buscar lançamentos"/><kbd>/</kbd></div><button class="icon-button notification-button" aria-label="Notificações">${icon('bell')}<span class="notification-dot"></span></button><button class="avatar small">RA</button></div></header>`;
}

function renderStats() {
  return `<section class="stats-grid">${statCards().map((stat) => `<article class="stat-card"><div class="stat-card-head"><span>${stat.label}</span><span class="stat-spark ${stat.tone}">${icon('spark', 15)}</span></div><strong>${stat.value}</strong><small>${stat.delta}</small></article>`).join('')}</section>`;
}

function renderHero() {
  const next = [...state.launches].sort((a, b) => new Date(a.date) - new Date(b.date))[0];
  return `<section class="hero-panel"><div class="hero-copy"><div class="eyebrow lime">SINAL EM DESTAQUE <span class="live-pulse"></span></div><h2>Encontre o próximo<br><em>movimento.</em></h2><p>Seu radar reúne oportunidades independentes antes que elas se percam no ruído. Explore, salve e decida com calma.</p><div class="hero-actions"><button class="primary-button" data-action="discover">${icon('spark', 16)} Executar nova busca</button><button class="ghost-button" data-view="catalog">Explorar radar ${icon('arrow', 15)}</button></div></div><div class="hero-signal"><div class="orb orb-one"></div><div class="orb orb-two"></div><div class="radar-ring ring-one"></div><div class="radar-ring ring-two"></div><div class="radar-ring ring-three"></div><div class="radar-cross horizontal"></div><div class="radar-cross vertical"></div><div class="radar-blip blip-a"></div><div class="radar-blip blip-b"></div><div class="radar-blip blip-c"></div><div class="next-signal"><span>PRÓXIMO SINAL</span><strong>${esc(next?.title || 'Aguardando dados')}</strong><small>${next ? formatDate(next.date) : '—'}</small></div></div></section>`;
}

function renderLaunchCard(item) {
  return `<article class="launch-card" data-id="${esc(item.id)}"><div class="launch-cover" style="--accent:${item.accent};background-image:linear-gradient(180deg,rgba(0,0,0,.02),rgba(5,7,10,.78)),url('${item.image}')"><div class="cover-top"><span class="type-pill">${esc(item.type)}</span><button class="save-button ${item.saved ? 'saved' : ''}" data-action="toggle-save" data-id="${esc(item.id)}" aria-label="${item.saved ? 'Remover dos salvos' : 'Salvar lançamento'}">${icon('bookmark', 17)}</button></div><div class="cover-date"><span>${relativeDate(item.date)}</span><strong>${formatDate(item.date, true)}</strong></div><div class="cover-accent"></div></div><div class="launch-card-body"><div class="producer-line"><span class="producer-avatar" style="--accent:${item.accent}">${esc(item.producer.split(' ').map((part) => part[0]).slice(0, 2).join(''))}</span><span>${esc(item.producer)}</span><span class="source-dot">·</span><span>${esc(item.sourceType)}</span></div><h3>${esc(item.title)}</h3><p>${esc(item.summary)}</p><div class="card-tags">${item.tags.map((tag) => `<span>#${esc(tag)}</span>`).join('')}</div><div class="card-footer"><span class="discovered">Descoberto ${formatDate(item.discoveredAt, true)}</span><a href="${esc(item.registration)}" target="_blank" rel="noreferrer" class="register-link">Ver lançamento ${icon('arrow', 14)}</a></div></div></article>`;
}

function renderFilters() {
  const types = ['Todos', ...unique(state.launches.map((item) => item.type))];
  const producers = ['Todos', ...unique(state.launches.map((item) => item.producer))];
  const platforms = ['Todas', ...unique(state.launches.map((item) => item.source))];
  const select = (label, key, values) => `<label class="filter-select"><span>${label}</span><select data-filter="${key}">${values.map((value) => `<option ${state[key] === value ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select></label>`;
  return `<div class="advanced-search-panel"><div class="filter-label">${icon('radar', 15)} Pesquisa abrangente</div><div class="search-fields"><label class="search-field"><span>Nome do evento ou lançamento</span><input data-field="eventName" value="${esc(state.eventName)}" placeholder="Ex.: Product Summit, SaaS..." /></label><label class="search-field"><span>Busca livre</span><input data-field="query" value="${esc(state.query)}" placeholder="Tema, resumo, tag..." /></label></div><div class="filter-row">${select('Plataforma / fonte', 'platform', platforms)}${select('Tipo de evento', 'type', types)}${select('Produtor', 'producer', producers)}${select('Período', 'period', ['Todos', 'Próximos 7 dias', 'Este mês', 'Depois'])}${select('Interesse', 'status', ['Todos', 'Salvos', 'Novos'])}<div class="filter-spacer"></div><label class="sort-select"><span>Ordenar</span><select data-filter="sort"><option value="relevance" ${state.sort === 'relevance' ? 'selected' : ''}>Relevância</option><option value="date" ${state.sort === 'date' ? 'selected' : ''}>Data mais próxima</option><option value="discovered" ${state.sort === 'discovered' ? 'selected' : ''}>Mais recentes</option><option value="saved" ${state.sort === 'saved' ? 'selected' : ''}>Minha lista</option></select></label></div></div>`;
}

function renderCatalog() {
  const launches = getFilteredLaunches();
  return `<section class="catalog-section"><div class="section-heading"><div><div class="eyebrow">CATÁLOGO AO VIVO</div><h2>Radar de lançamentos <span>${launches.length}</span></h2></div><button class="view-toggle" data-action="settings">${icon('settings', 15)} Conexões <span class="connection-badge">${state.config.connections.filter((connection) => connection.connected).length}/${state.config.connections.length}</span></button></div>${renderFilters()}${launches.length ? `<div class="launch-grid">${launches.map(renderLaunchCard).join('')}</div>` : `<div class="empty-state">${icon('radar', 32)}<h3>Nenhum sinal encontrado</h3><p>Tente remover um filtro ou execute uma nova busca no radar.</p><button class="primary-button" data-action="clear-filters">Limpar filtros</button></div>`}</section>`;
}

function renderSavedView() {
  state.status = 'Salvos';
  return `${renderTopbar('Minha lista', 'CURADORIA PESSOAL')}${renderStats()}<section class="catalog-section"><div class="section-heading"><div><div class="eyebrow">SINAIS GUARDADOS</div><h2>O que merece sua atenção <span>${state.launches.filter((item) => item.saved).length}</span></h2></div><button class="ghost-button" data-view="catalog">Voltar ao radar ${icon('arrow', 15)}</button></div>${getFilteredLaunches().length ? `<div class="launch-grid">${getFilteredLaunches().map(renderLaunchCard).join('')}</div>` : `<div class="empty-state">${icon('bookmark', 32)}<h3>Sua lista está vazia</h3><p>Salve os lançamentos que despertarem uma hipótese.</p><button class="primary-button" data-view="catalog">Explorar radar</button></div>`}</section>`;
}

function renderDashboard() {
  state.status = 'Todos';
  const featured = [...state.launches].sort((a, b) => new Date(a.date) - new Date(b.date)).slice(0, 3);
  return `${renderTopbar('Visão geral', 'SISTEMA DE DESCOBERTA')}${renderStats()}${renderHero()}<section class="dashboard-lower"><div class="mini-list"><div class="section-heading compact"><div><div class="eyebrow">PRÓXIMOS SINAIS</div><h2>Na sua linha de visão</h2></div><button class="text-button" data-view="catalog">Ver todos ${icon('arrow', 14)}</button></div>${featured.map((item) => `<button class="mini-launch" data-id="${esc(item.id)}" data-action="focus-card"><span class="mini-cover" style="background-image:url('${item.image}')"></span><span class="mini-info"><strong>${esc(item.title)}</strong><small>${esc(item.producer)} · ${relativeDate(item.date)}</small></span><span class="mini-type">${esc(item.type)}</span>${icon('arrow', 15)}</button>`).join('')}</div><div class="insight-card"><div class="eyebrow lime">LEITURA DO RADAR</div><h3>Há mais sinais em <em>ofertas e audiência</em> nesta semana.</h3><p>O padrão mais recorrente entre suas fontes é o de workshops enxutos com inscrição antecipada.</p><div class="insight-bars"><span style="height:72%"><i>OFERTA</i></span><span style="height:52%"><i>AUDIÊNCIA</i></span><span style="height:38%"><i>PRODUTO</i></span><span style="height:24%"><i>LIVE</i></span></div></div></section>`;
}

function renderSettingsModal() {
  if (!state.settingsOpen) return '';
  const editing = state.editingConnectionId === 'new' ? null : state.config.connections.find((connection) => connection.id === state.editingConnectionId) || state.config.connections[0];
  const connections = state.config.connections.map((connection) => `<div class="connection-row ${connection.id === editing?.id ? 'selected' : ''}"><button type="button" class="connection-main" data-action="edit-connection" data-id="${esc(connection.id)}"><span class="connection-avatar">${icon('link', 14)}</span><span><strong>${esc(connection.name)}</strong><small>${esc(connection.endpoint)}</small></span><i class="connection-state ${connection.connected ? 'online' : ''}"></i></button><button type="button" class="remove-connection" data-action="remove-connection" data-id="${esc(connection.id)}" aria-label="Remover ${esc(connection.name)}">${icon('close', 14)}</button></div>`).join('');
  const currentName = editing?.name || '';
  const currentRole = editing?.role || 'Agente de descoberta';
  const currentEndpoint = editing?.endpoint || '';
  const currentToken = editing?.token || state.pendingToken || '';
  const currentConnected = editing?.connected !== false;
  return `<div class="modal-backdrop" data-action="close-settings"><section class="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" data-stop-click="true"><div class="modal-head"><div><div class="eyebrow lime">CONFIGURAÇÃO DO SCOUT</div><h2 id="settings-title">Conexões MCP</h2><p>O LaunchScout Core já possui MCP, persistência e token no mesmo servidor.</p></div><button class="icon-button" data-action="close-settings" aria-label="Fechar">${icon('close')}</button></div><div class="connection-list"><div class="list-heading"><span>Agentes configurados <b>${state.config.connections.length}</b></span><button type="button" class="text-button" data-action="new-connection">${icon('plus', 14)} Adicionar agente</button></div>${connections || '<div class="no-connections">Nenhuma fonte configurada ainda.</div>'}</div><div class="connection-status ${currentConnected ? 'online' : 'offline'}"><span class="status-dot"></span><div><strong>${currentConnected ? 'Agente habilitado' : 'Agente pausado'}</strong><small>${esc(currentEndpoint || 'Preencha um endpoint MCP abaixo')}</small></div><button class="text-button" data-action="test-connection">Testar agora</button><button class="text-button" data-action="toggle-connection">${currentConnected ? 'Pausar' : 'Ativar'}</button></div><form class="settings-form" data-form="settings"><label>Nome do agente<input name="agentName" value="${esc(currentName)}" placeholder="Agente de descoberta" required /></label><label>Função do agente<input name="role" value="${esc(currentRole)}" placeholder="Catálogo, eventos, produtos..." required /></label><label>Endpoint MCP<input name="endpoint" value="${esc(currentEndpoint)}" placeholder="/api/mcp" required /></label><label>Token de acesso <span class="label-note">hash salvo no servidor; exibido apenas uma vez</span><input name="token" type="password" value="${esc(currentToken)}" placeholder="Gere um token abaixo" /><button type="button" class="ghost-button token-button" data-action="generate-token">${icon('spark', 14)} Gerar token no LaunchScout Core</button></label><div class="settings-note">${icon('link', 15)} <span>A busca chama <strong>todos os agentes habilitados em paralelo</strong>. O token interno é gerado por este Node e o endpoint padrão é <strong>/api/mcp</strong>.</span></div><div class="modal-actions"><button type="button" class="ghost-button" data-action="close-settings">Cancelar</button><button type="submit" class="primary-button">${icon('check', 15)} ${editing ? 'Salvar alterações' : 'Criar agente'}</button></div></form></section></div>`;
}

function renderApp() {
  if (state.view === 'saved') {
    app.innerHTML = `<div class="app-shell">${renderSidebar()}<main class="main-content">${renderSavedView()}</main>${renderSettingsModal()}<div class="toast-region" aria-live="polite"></div></div>`;
    return;
  }
  if (state.view === 'dashboard') {
    app.innerHTML = `<div class="app-shell">${renderSidebar()}<main class="main-content">${renderDashboard()}</main>${renderSettingsModal()}<div class="toast-region" aria-live="polite"></div></div>`;
    return;
  }
  app.innerHTML = `<div class="app-shell">${renderSidebar()}<main class="main-content">${renderTopbar('Radar de lançamentos', 'DESCOBERTA CONTÍNUA')}${renderStats()}${renderCatalog()}</main>${renderSettingsModal()}<div class="toast-region" aria-live="polite"></div></div>`;
}

function toast(message, tone = 'default') {
  const region = document.querySelector('.toast-region');
  if (!region) return;
  const item = document.createElement('div');
  item.className = `toast ${tone}`;
  item.innerHTML = `${icon(tone === 'success' ? 'check' : 'spark', 15)} ${esc(message)}`;
  region.appendChild(item);
  setTimeout(() => item.classList.add('visible'), 10);
  setTimeout(() => { item.classList.remove('visible'); setTimeout(() => item.remove(), 220); }, 2800);
}

async function parseJsonResponse(response) {
  const raw = await response.text();
  try { return raw ? JSON.parse(raw) : {}; } catch { throw new Error(`O servidor retornou uma resposta que não é JSON válido (HTTP ${response.status}). Execute o LaunchScout com npm run dev ou npm start, não com vite preview isolado.`); }
}

async function callMcp(connection, method, params = {}) {
  if (!connection?.endpoint) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(connection.endpoint, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(connection.token ? { Authorization: `Bearer ${connection.token}` } : {}) },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`MCP HTTP ${response.status}`);
    const payload = await parseJsonResponse(response);
    if (payload.error) throw new Error(payload.error.message || 'MCP JSON-RPC error');
    return payload.result || null;
  } finally {
    clearTimeout(timeout);
  }
}

async function testConnection(connection) {
  const result = await callMcp(connection, 'initialize', {});
  if (!result?.serverInfo) throw new Error('O endpoint não respondeu ao handshake MCP.');
  return result.serverInfo;
}

function normalizeMcpItem(raw, index, connection) {
  const title = raw.title || raw.name || raw.event_name || raw.product_name;
  if (!title) return null;
  const endpointHost = (() => { try { return new URL(connection.endpoint).hostname; } catch { return 'MCP source'; } })();
  const rawDate = raw.date || raw.start_date || raw.launch_date || raw.event_date || raw.start_at || raw.published_at;
  const date = rawDate || new Date(Date.now() + (index + 1) * 86400000).toISOString();
  const rawType = String(raw.type || raw.product_type || raw.category || 'launch').toLowerCase();
  const type = rawType.includes('workshop') ? 'Workshop' : rawType.includes('summit') ? 'Virtual Summit' : rawType.includes('live') ? 'Free Live' : rawType.includes('product') || rawType.includes('saas') ? 'Produto' : 'Lançamento';
  const producer = raw.producer || raw.producer_name || raw.organizer || raw.creator || 'Fonte MCP';
  const registration = raw.registration || raw.registration_url || raw.url || raw.link || raw.checkout_url || '#';
  const image = raw.image || raw.image_url || raw.cover_image || raw.cover || '';
  const tags = Array.isArray(raw.tags) ? raw.tags.slice(0, 3) : [raw.category || 'Descoberta'];
  return { id: `mcp-${raw.id || raw.slug || `${Date.now()}-${index}`}`, title, producer, type, date, discoveredAt: new Date().toISOString(), source: raw.source || endpointHost, sourceType: 'MCP / LaunchRadar', registration, image, accent: ['#8FEA64', '#72a4ff', '#ffbe5c', '#d18bff'][index % 4], summary: raw.summary || raw.description || raw.excerpt || 'Sinal recebido de uma fonte MCP conectada.', tags, saved: false, status: 'new' };
}

async function runDiscovery() {
  const button = document.querySelector('[data-action="discover"]');
  if (button) { button.disabled = true; button.innerHTML = `${icon('radar', 16)} Escaneando...`; }
  toast('Escaneando fontes conectadas…');
  const connectedSources = activeConnections();
  if (!connectedSources.length) {
    renderApp();
    toast('Configure e ative pelo menos um agente MCP antes de pesquisar.');
    return;
  }
  try {
    const argumentsForSearch = { query: state.query || undefined, event_name: state.eventName || undefined, product_type: state.type !== 'Todos' ? state.type : undefined, producer_name: state.producer !== 'Todos' ? state.producer : undefined, source: state.platform !== 'Todas' ? state.platform : undefined, date_window_days: state.period === 'Próximos 7 dias' ? 7 : state.period === 'Este mês' ? 31 : 90, limit: state.searchLimit, sort_by: state.sort === 'date' ? 'date' : 'score' };
    const responses = await Promise.allSettled(connectedSources.map(async (connection) => ({ connection, result: await callMcp(connection, 'tools/call', { name: 'search_launches', arguments: argumentsForSearch }) })));
    const remoteItems = [];
    let failedAgents = 0;
    responses.forEach((response) => {
      if (response.status !== 'fulfilled') { failedAgents += 1; return; }
      const { connection, result } = response.value;
      let items = result?.structuredContent?.items;
      if (!Array.isArray(items) && Array.isArray(result?.content)) {
        try { items = JSON.parse(result.content.find((part) => part.type === 'text')?.text || '{}').items; } catch { items = []; }
      }
      (Array.isArray(items) ? items : []).forEach((item, index) => {
        const normalized = normalizeMcpItem(item, index + remoteItems.length, connection);
        if (normalized) remoteItems.push(normalized);
      });
    });
    const uniqueItems = [...new Map(remoteItems.map((item) => [`${item.title.toLowerCase()}|${item.date}|${item.producer.toLowerCase()}`, item])).values()];
    if (uniqueItems.length) {
      const remoteIds = new Set(uniqueItems.map((item) => item.id));
      state.launches = [...uniqueItems, ...state.launches.filter((item) => !remoteIds.has(item.id))];
      state.lastSync = 'agora mesmo';
      localStorage.setItem('launchscout-last-sync', state.lastSync);
      saveState();
      renderApp();
      toast(`${uniqueItems.length} sinais recebidos de ${connectedSources.length - failedAgents}/${connectedSources.length} agentes.`, 'success');
    } else {
      state.lastSync = 'agora mesmo';
      localStorage.setItem('launchscout-last-sync', state.lastSync);
      renderApp();
      toast(failedAgents ? `Nenhum agente respondeu. Falhas: ${failedAgents}. Verifique endpoint, token e CORS.` : 'MCP respondeu, mas não encontrou lançamentos para esta busca.');
    }
  } catch (error) {
    renderApp();
    toast(`Pesquisa MCP falhou: ${error.message || 'erro de conexão'}`);
  }
}

app.addEventListener('click', (event) => {
  const actionTarget = event.target.closest('[data-action], [data-view]');
  if (!actionTarget) return;
  const insideModal = event.target.closest('[data-stop-click]');
  const modalControl = insideModal && event.target.closest('[data-action], [data-view]');
  if (insideModal && (!modalControl || !insideModal.contains(modalControl))) return;
  const action = actionTarget.dataset.action;
  const view = actionTarget.dataset.view;
  if (view) {
    state.view = view;
    if (view !== 'saved') state.status = 'Todos';
    renderApp();
    return;
  }
  if (action === 'settings') { state.settingsOpen = true; state.editingConnectionId = state.config.connections[0]?.id || 'new'; renderApp(); return; }
  if (action === 'close-settings') { state.settingsOpen = false; renderApp(); return; }
  if (action === 'new-connection') { state.editingConnectionId = 'new'; renderApp(); return; }
  if (action === 'edit-connection') { state.editingConnectionId = actionTarget.dataset.id; renderApp(); return; }
  if (action === 'remove-connection') {
    state.config.connections = state.config.connections.filter((connection) => connection.id !== actionTarget.dataset.id);
    state.editingConnectionId = state.config.connections[0]?.id || 'new';
    saveState();
    renderApp();
    toast('Fonte MCP removida.');
    return;
  }
  if (action === 'toggle-connection') {
    const connection = state.config.connections.find((item) => item.id === state.editingConnectionId);
    if (connection) { connection.connected = !connection.connected; saveState(); renderApp(); toast(connection.connected ? 'Conexão ativada.' : 'Conexão pausada.'); }
    return;
  }
  if (action === 'test-connection') {
    const connection = state.config.connections.find((item) => item.id === state.editingConnectionId);
    if (!connection?.endpoint) { toast('Preencha o endpoint MCP antes de testar.'); return; }
    toast('Executando handshake MCP…');
    testConnection(connection).then((server) => toast(`Conectado: ${server.name || 'servidor MCP'} v${server.version || '—'}`, 'success')).catch((error) => toast(`Falha no handshake: ${error.message}`));
    return;
  }
  if (action === 'generate-token') {
    const connection = state.config.connections.find((item) => item.id === state.editingConnectionId);
    const headers = connection?.token ? { Authorization: `Bearer ${connection.token}` } : {};
    toast('Gerando token seguro no servidor…');
    fetch('/api/auth/generate', { method: 'POST', headers }).then(async (response) => { const payload = await parseJsonResponse(response); if (!response.ok) throw new Error(payload.message || payload.error || `HTTP ${response.status}`); return payload; }).then((payload) => { state.pendingToken = payload.token; if (connection) connection.token = payload.token; saveState(); renderApp(); toast('Token gerado. Copie e guarde-o agora.', 'success'); }).catch((error) => toast(`Geração de token falhou: ${error.message}`));
    return;
  }
  if (action === 'toggle-save') {
    const item = state.launches.find((launch) => launch.id === actionTarget.dataset.id);
    if (item) { item.saved = !item.saved; item.status = item.saved ? 'interested' : 'new'; saveState(); renderApp(); toast(item.saved ? 'Adicionado à sua lista.' : 'Removido da sua lista.'); }
    return;
  }
  if (action === 'clear-filters') { state.query = ''; state.eventName = ''; state.platform = 'Todas'; state.type = 'Todos'; state.period = 'Todos'; state.producer = 'Todos'; state.status = 'Todos'; renderApp(); return; }
  if (action === 'discover') { runDiscovery(); return; }
  if (action === 'focus-card') { state.view = 'catalog'; state.query = ''; renderApp(); setTimeout(() => { const card = document.querySelector(`[data-id="${CSS.escape(actionTarget.dataset.id)}"]`); card?.scrollIntoView({ behavior: 'smooth', block: 'center' }); card?.classList.add('highlight-card'); }, 50); }
});

app.addEventListener('input', (event) => {
  if (event.target.matches('[data-field="query"]')) { state.query = event.target.value; renderApp(); const input = document.querySelector('[data-field="query"]'); input?.focus(); input?.setSelectionRange(state.query.length, state.query.length); }
  if (event.target.matches('[data-field="eventName"]')) { state.eventName = event.target.value; renderApp(); const input = document.querySelector('[data-field="eventName"]'); input?.focus(); input?.setSelectionRange(state.eventName.length, state.eventName.length); }
});

app.addEventListener('change', (event) => {
  const filter = event.target.dataset.filter;
  if (filter) { state[filter] = event.target.value; renderApp(); }
});

app.addEventListener('submit', (event) => {
  if (!event.target.matches('[data-form="settings"]')) return;
  event.preventDefault();
  const form = new FormData(event.target);
  const values = { name: form.get('agentName'), role: form.get('role'), endpoint: form.get('endpoint'), token: form.get('token'), connected: true };
  if (state.editingConnectionId === 'new' || !state.config.connections.some((connection) => connection.id === state.editingConnectionId)) {
    state.config.connections.unshift({ ...values, id: `connection-${Date.now()}` });
    state.editingConnectionId = state.config.connections[0].id;
  } else {
    const connection = state.config.connections.find((item) => item.id === state.editingConnectionId);
    Object.assign(connection, values);
  }
  state.config.agentName = values.name;
  saveState();
  state.settingsOpen = false;
  renderApp();
  toast('Configuração MCP salva.', 'success');
});

document.addEventListener('keydown', (event) => {
  if (event.key === '/' && document.activeElement?.tagName !== 'INPUT') { event.preventDefault(); document.querySelector('[data-field="query"]')?.focus(); }
  if (event.key.toLowerCase() === 'g' && document.activeElement?.tagName !== 'INPUT') { state.view = 'dashboard'; renderApp(); }
  if (event.key === 'Escape' && state.settingsOpen) { state.settingsOpen = false; renderApp(); }
});

renderApp();
