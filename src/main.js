import './styles.css';
import { collectAgentSearchResults } from './mcp-agents.js';

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
  auth: null,
  csrfToken: '',
  authError: '',
  authMode: 'login',
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
  providers: [],
  editingProviderId: '',
  pendingToken: '',
  tokenGenerating: false,
  tokenNotice: '',
  syncStatus: 'idle',
  syncError: '',
  lastSync: localStorage.getItem('launchscout-last-sync') || 'agora mesmo',
  config: JSON.parse(localStorage.getItem('launchscout-config') || 'null') || {
    agentName: 'LaunchScout Scout',
    connections: [{ id: 'primary', name: 'LaunchScout Core', role: 'Catálogo unificado', endpoint: INTERNAL_MCP_ENDPOINT, token: '', connected: true }]
  }
};

const MCP_SESSION_TOKENS_KEY = 'launchscout-mcp-session-tokens';
const readSessionTokens = () => {
  try {
    const value = JSON.parse(sessionStorage.getItem(MCP_SESSION_TOKENS_KEY) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch { return {}; }
};
const writeSessionTokens = (connections) => {
  try {
    const tokens = Object.fromEntries(connections.filter((connection) => connection.id && connection.token).map((connection) => [connection.id, connection.token]));
    sessionStorage.setItem(MCP_SESSION_TOKENS_KEY, JSON.stringify(tokens));
  } catch {}
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
const sessionTokens = readSessionTokens();
state.config.connections = state.config.connections.map((connection) => ({ ...connection, token: sessionTokens[connection.id] || '' }));
const activeConnections = () => state.config.connections.filter((connection) => connection.connected && connection.endpoint);
const activeConnection = () => activeConnections()[0] || state.config.connections[0];
state.launches = state.launches.filter((item) => !String(item.registration || '').includes('example.com') && item.source !== 'demo.launchscout');

const app = document.querySelector('#app');
const saveState = () => {
  localStorage.setItem('launchscout-launches', JSON.stringify(state.launches));
  localStorage.setItem('launchscout-config', JSON.stringify({ ...state.config, connections: state.config.connections.map((connection) => ({ ...connection, token: '' })) }));
  writeSessionTokens(state.config.connections);
};
const esc = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const field = document.createElement('textarea');
  field.value = value;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand('copy');
  field.remove();
  if (!copied) throw new Error('clipboard_unavailable');
}
const formatDate = (value, compact = false) => { if (!value || Number.isNaN(new Date(value).getTime())) return 'Data desconhecida'; return new Intl.DateTimeFormat('pt-PT', compact ? { day: '2-digit', month: 'short' } : { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)).replace('.', ''); };
const daysUntil = (value) => { if (!value || Number.isNaN(new Date(value).getTime())) return null; return Math.ceil((new Date(value).getTime() - Date.now()) / 86400000); };
const relativeDate = (value) => {
  const days = daysUntil(value);
  if (days === null) return 'Data desconhecida';
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
        <div class="sync-card-top"><span class="signal-bars"><i></i><i></i><i></i></span><span>${state.syncStatus === 'loading' ? 'A sincronizar' : state.syncStatus === 'error' ? 'Atenção necessária' : state.syncStatus === 'synced' ? 'Scout sincronizado' : 'Scout pronto'}</span></div>
        <p>Última varredura<br><strong>${esc(state.lastSync)}</strong></p>
        <button class="text-button" data-action="discover">${icon('spark', 14)} Buscar novidades</button>
      </div>
      <button class="nav-item settings-link" data-action="settings">${icon('settings')}<span>Configurações MCP</span></button>
      <div class="profile-chip"><div class="avatar">${esc((state.auth?.name || state.auth?.email || 'U').split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase())}</div><div><strong>${esc(state.auth?.name || state.auth?.email || 'Utilizador')}</strong><small>${esc(state.auth?.role || 'Conta')}</small></div><button class="profile-more profile-action" data-action="logout" aria-label="Terminar sessão">Sair</button></div>
    </div>
  </aside>`;
}

function renderTopbar(title, eyebrow = 'RADAR PESSOAL') {
  return `<header class="topbar"><div class="topbar-heading"><div class="eyebrow">${eyebrow}</div><h1>${title}</h1></div><div class="topbar-actions"><div class="quick-search">${icon('search', 17)}<input data-field="query" value="${esc(state.query)}" placeholder="Buscar lançamentos..." aria-label="Buscar lançamentos"/><kbd>/</kbd></div><button class="icon-button notification-button" aria-label="Notificações">${icon('bell')}<span class="notification-dot"></span></button><button class="avatar small" data-action="settings" aria-label="Abrir configurações da conta">${esc((state.auth?.name || state.auth?.email || 'U').split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase())}</button></div></header>`;
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
  const featured = [...state.launches].filter((item) => daysUntil(item.date) === null || daysUntil(item.date) >= 0).sort((a, b) => (daysUntil(a.date) ?? 99999) - (daysUntil(b.date) ?? 99999)).slice(0, 3);
  const categories = state.launches.reduce((acc, item) => { const key = item.type || 'Outros'; acc[key] = (acc[key] || 0) + 1; return acc; }, {});
  const topCategory = Object.entries(categories).sort((a, b) => b[1] - a[1])[0];
  const categoryShare = topCategory ? Math.round((topCategory[1] / Math.max(1, state.launches.length)) * 100) : 0;
  const insight = topCategory ? `A categoria mais frequente é ${topCategory[0]}, com ${topCategory[1]} de ${state.launches.length} sinais (${categoryShare}%).` : 'Ainda não existem dados suficientes para gerar uma leitura do radar.';
  return `${renderTopbar('Visão geral', 'SISTEMA DE DESCOBERTA')}${renderStats()}${renderHero()}<section class="dashboard-lower"><div class="mini-list"><div class="section-heading compact"><div><div class="eyebrow">PRÓXIMOS SINAIS</div><h2>Na sua linha de visão</h2></div><button class="text-button" data-view="catalog">Ver todos ${icon('arrow', 14)}</button></div>${featured.map((item) => `<button class="mini-launch" data-id="${esc(item.id)}" data-action="focus-card"><span class="mini-cover" style="background-image:url('${item.image || ''}')"></span><span class="mini-info"><strong>${esc(item.title)}</strong><small>${esc(item.producer)} · ${relativeDate(item.date)}</small></span><span class="mini-type">${esc(item.type)}</span>${icon('arrow', 15)}</button>`).join('')}</div><div class="insight-card"><div class="eyebrow lime">LEITURA DO RADAR · ${state.launches.length} SINAIS</div><h3>${esc(insight)}</h3><p>Leitura calculada a partir do catálogo sincronizado. Não é uma previsão; representa apenas a distribuição atual dos dados recebidos.</p><div class="insight-bars"><span style="height:${Math.max(8, categoryShare)}%"><i>${esc(topCategory?.[0] || 'SEM DADOS')}</i></span><span style="height:${Math.max(8, Math.round(state.launches.filter((item) => item.saved).length / Math.max(1, state.launches.length) * 100))}%"><i>SALVOS</i></span></div></div></section>`;
}

function renderSettingsModal() {
  if (!state.settingsOpen) return '';
  const editing = state.editingConnectionId === 'new' ? null : state.config.connections.find((connection) => connection.id === state.editingConnectionId) || state.config.connections[0];
  const connections = state.config.connections.map((connection) => `<div class="connection-row ${connection.id === editing?.id ? 'selected' : ''}"><button type="button" class="connection-main" data-action="edit-connection" data-id="${esc(connection.id)}"><span class="connection-avatar">${icon('link', 14)}</span><span><strong>${esc(connection.name)}</strong><small>${esc(connection.endpoint)}</small></span><i class="connection-state ${connection.connected ? 'online' : ''}"></i></button><button type="button" class="remove-connection" data-action="remove-connection" data-id="${esc(connection.id)}" aria-label="Remover ${esc(connection.name)}">${icon('close', 14)}</button></div>`).join('');
  const currentName = editing?.name || '';
  const currentRole = editing?.role || 'Agente de descoberta';
  const currentEndpoint = editing?.endpoint || '';
  const currentToken = editing?.token || (editing?.id === 'primary' ? state.pendingToken : '') || '';
  const currentConnected = editing ? editing.connected !== false : false;
  const isCore = editing?.id === 'primary';
  const tokenControls = isCore ? `<div class="token-actions"><button type="button" class="ghost-button token-button" data-action="generate-token" ${state.tokenGenerating ? 'disabled' : ''}>${icon('spark', 14)} ${state.tokenGenerating ? 'Gerando token...' : currentToken ? 'Gerar novo token e substituir' : 'Gerar token interno'}</button>${currentToken ? `<button type="button" class="ghost-button token-button" data-action="copy-stored-token">Copiar token MCP para o agente</button>` : ''}<button type="button" class="danger-button token-button" data-action="revoke-token">Revogar token interno</button></div>` : '<div class="settings-note external-token-note">Credencial exclusiva deste agente externo. Ela não altera o LaunchScout Core.</div>';
  const adminRecovery = isCore ? '<div class="settings-note open-token-note">A emissão do token é aberta: gerar um novo token substitui imediatamente o token anterior. Use esta operação somente quando quiser fazer a rotação da credencial.</div>' : '';
  const tokenNotice = isCore && state.tokenNotice ? `<div class="token-reveal"><strong>Novo token MCP — copie para o agente</strong><code>${esc(state.tokenNotice)}</code><button type="button" class="ghost-button" data-action="copy-token">Copiar token MCP</button><small>Não compartilhe a MCP_MASTER_KEY; o agente recebe apenas este token. O navegador mantém o token até você gerar outro ou revogá-lo.</small></div>` : '';
  const settingsForm = `<form class="settings-form" data-form="settings"><label>Nome do agente<input name="agentName" value="${esc(currentName)}" placeholder="Agente de descoberta" required /></label><label>Função do agente<input name="role" value="${esc(currentRole)}" placeholder="Catálogo, eventos, produtos..." required /></label><label>Endpoint MCP<input name="endpoint" value="${esc(currentEndpoint)}" placeholder="/api/mcp" required /></label><label>Token de acesso <span class="label-note">hash salvo no servidor; exibido apenas uma vez</span><input name="token" type="password" value="${esc(currentToken)}" placeholder="${isCore ? 'Gere um token abaixo' : 'Token do agente externo'}" autocomplete="off" />${tokenControls}</label>${adminRecovery}${tokenNotice}<div class="settings-note">${icon('link', 15)} <span>A busca chama <strong>todos os agentes habilitados em paralelo</strong>. O token interno é gerado por este Node e o endpoint padrão é <strong>/api/mcp</strong>.</span></div><div class="modal-actions"><button type="button" class="ghost-button" data-action="${editing ? 'close-settings' : 'cancel-new-connection'}">${editing ? 'Fechar' : 'Cancelar'}</button><button type="submit" class="primary-button">${icon('check', 15)} ${editing ? 'Salvar alterações' : 'Criar agente'}</button></div></form>`;
  const agentDialog = editing ? '' : `<div class="agent-dialog-backdrop" data-action="cancel-new-connection" data-stop-click="true"><section class="agent-dialog" role="dialog" aria-modal="true" aria-labelledby="new-agent-title" data-stop-click="true"><div class="modal-head"><div><div class="eyebrow lime">NOVA CONEXÃO MCP</div><h2 id="new-agent-title">Adicionar agente</h2><p>Informe o endpoint MCP e as credenciais do agente externo.</p></div><button type="button" class="icon-button" data-action="cancel-new-connection" aria-label="Cancelar">${icon('close')}</button></div>${settingsForm}</section></div>`;
  return `<div class="modal-backdrop" data-action="close-settings"><section class="settings-modal" role="dialog" aria-modal="${editing ? 'true' : 'false'}" aria-labelledby="settings-title" data-stop-click="true"><div class="modal-head"><div><div class="eyebrow lime">CONFIGURAÇÃO DO SCOUT</div><h2 id="settings-title">Conexões MCP</h2><p>O LaunchScout Core já possui MCP, persistência e token no mesmo servidor.</p></div><button class="icon-button" data-action="close-settings" aria-label="Fechar">${icon('close')}</button></div><div class="connection-list"><div class="list-heading"><span>Agentes configurados <b>${state.config.connections.length}</b></span><button type="button" class="text-button" data-action="new-connection">${icon('plus', 14)} Adicionar agente</button></div>${connections || '<div class="no-connections">Nenhuma fonte configurada ainda.</div>'}</div><div class="account-panel"><div class="list-heading"><span>Configurações da conta</span><span class="label-note">Sessão autenticada</span></div><div class="account-summary"><strong>${esc(state.auth.name || state.auth.email)}</strong><small>${esc(state.auth.email)} · ${esc(state.auth.role)}</small></div><form class="password-form" data-form="password"><label>Password atual<input name="currentPassword" type="password" autocomplete="current-password" required /></label><label>Nova password<input name="newPassword" type="password" autocomplete="new-password" minlength="12" required /><small>Use pelo menos 12 caracteres.</small></label><label>Confirmar nova password<input name="confirmPassword" type="password" autocomplete="new-password" minlength="12" required /></label><button class="ghost-button" type="submit">Alterar password</button></form></div><div class="provider-panel"><div class="list-heading"><span>Pesquisa externa</span><span class="label-note">RSS público, validado contra SSRF</span></div><form class="provider-form" data-form="provider"><input name="name" placeholder="Nome da fonte" required /><input name="url" type="url" placeholder="https://exemplo.org/feed.xml" required /><button class="ghost-button" type="submit">Adicionar fonte</button></form><small class="provider-help">Sem provedor configurado, o radar não inventa resultados.</small></div><div class="connection-status ${currentConnected ? 'online' : 'offline'}"><span class="status-dot"></span><div><strong>${currentConnected ? 'Agente habilitado' : 'Agente pausado'}</strong><small>${esc(currentEndpoint || 'Preencha um endpoint MCP abaixo')}</small></div><button class="text-button" data-action="test-connection">Testar agora</button><button class="text-button" data-action="toggle-connection">${currentConnected ? 'Pausar' : 'Ativar'}</button></div>${editing ? settingsForm : ''}</section>${agentDialog}</div>`;
}

function renderProviderManagement() {
  const panel = app.querySelector('.provider-panel');
  if (!panel) return;
  if (state.auth?.role !== 'admin') {
    panel.remove();
    return;
  }

  panel.querySelector('.provider-management')?.remove();
  const section = document.createElement('div');
  section.className = 'provider-management';
  const providers = state.providers.map((provider) => `<div class="provider-row"><div><strong>${esc(provider.name)}</strong><small>${esc(provider.url)}</small><small>${provider.enabled ? 'Ativo' : 'Desativado'} · ${esc(provider.status || 'não testado')}</small></div><button type="button" class="text-button" data-action="edit-provider" data-id="${esc(provider.id)}">Editar</button></div>`).join('');
  section.innerHTML = `<div class="list-heading"><span>Provedores configurados <b>${state.providers.length}</b></span></div>${providers}`;

  const provider = state.providers.find((item) => item.id === state.editingProviderId);
  if (provider) {
    const form = document.createElement('form');
    form.className = 'provider-edit-form';
    form.dataset.form = 'provider-edit';
    form.innerHTML = `<input type="hidden" name="id" value="${esc(provider.id)}" /><label>Nome do provedor<input name="name" value="${esc(provider.name)}" required /></label><label>URL do feed RSS<input name="url" type="url" value="${esc(provider.url)}" required /></label><label class="provider-enabled"><input name="enabled" type="checkbox" ${provider.enabled ? 'checked' : ''} /> Provedor ativo</label><div class="modal-actions"><button type="button" class="ghost-button" data-action="cancel-provider-edit">Cancelar</button><button type="submit" class="primary-button">Salvar provedor</button></div>`;
    section.append(form);
  }
  panel.append(section);
  const emptyHint = panel.querySelector('.provider-help');
  if (emptyHint && state.providers.length) emptyHint.remove();
}

function renderAuth() {
  const registering = state.authMode === 'register';
  return `<main class="auth-screen"><section class="auth-panel"><div class="brand-lockup"><div class="brand-mark">${icon('radar', 24)}</div><div><div class="brand-name">LaunchScout</div><div class="brand-kicker">personal launch radar</div></div></div><div class="eyebrow lime">${registering ? 'NOVA CONTA' : 'ACESSO PROTEGIDO'}</div><h1>${registering ? 'Crie o seu radar.' : 'Entre no seu radar.'}</h1><p>${registering ? 'Crie a sua conta para começar a guardar sinais e configurar as suas fontes.' : 'A área de administração e as credenciais MCP ficam disponíveis apenas após autenticação.'}</p><div class="auth-tabs" role="tablist"><button type="button" class="auth-tab ${!registering ? 'active' : ''}" data-action="auth-login">Iniciar sessão</button><button type="button" class="auth-tab ${registering ? 'active' : ''}" data-action="auth-register">Criar conta</button></div><form class="auth-form" data-form="${registering ? 'register' : 'login'}">${registering ? '<label>Nome<input name="name" type="text" autocomplete="name" required placeholder="O seu nome" /></label>' : ''}<label>${registering ? 'E-mail' : 'E-mail ou utilizador'}<input name="email" type="text" autocomplete="username" required placeholder="${registering ? 'nome@exemplo.com' : 'admin'}" /></label><label>Password<input name="password" type="password" autocomplete="${registering ? 'new-password' : 'current-password'}" minlength="${registering ? '12' : '1'}" required placeholder="A sua password" /></label>${registering ? '<label>Confirmar password<input name="passwordConfirmation" type="password" autocomplete="new-password" minlength="12" required placeholder="Repita a password" /></label>' : ''}${state.authError ? `<div class="auth-error">${esc(state.authError)}</div>` : ''}<button class="primary-button" type="submit">${icon('arrow', 15)} ${registering ? 'Criar conta e entrar' : 'Iniciar sessão'}</button></form><small class="auth-footnote">${registering ? 'A password deve ter pelo menos 12 caracteres.' : 'Pode criar uma nova conta no separador acima. A conta admin inicial é temporária e deve alterar a password.'}</small></section></main>`;
}

function renderApp() {
  if (!state.auth) { app.innerHTML = renderAuth(); return; }
  if (state.view === 'saved') {
    app.innerHTML = `<div class="app-shell">${renderSidebar()}<main class="main-content">${renderSavedView()}</main>${renderSettingsModal()}<div class="toast-region" aria-live="polite"></div></div>`;
    renderProviderManagement();
    return;
  }
  if (state.view === 'dashboard') {
    app.innerHTML = `<div class="app-shell">${renderSidebar()}<main class="main-content">${renderDashboard()}</main>${renderSettingsModal()}<div class="toast-region" aria-live="polite"></div></div>`;
    renderProviderManagement();
    return;
  }
  app.innerHTML = `<div class="app-shell">${renderSidebar()}<main class="main-content">${renderTopbar('Radar de lançamentos', 'DESCOBERTA CONTÍNUA')}${renderStats()}${renderCatalog()}</main>${renderSettingsModal()}<div class="toast-region" aria-live="polite"></div></div>`;
  renderProviderManagement();
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
  try { return raw ? JSON.parse(raw) : {}; } catch { throw new Error(`A aplicação Node da Hostinger não devolveu JSON válido (HTTP ${response.status}). Confirme que o arranque usa server.js ou npm run start:production, e não apenas vite preview.`); }
}

async function loadExternalProviders() {
  if (state.auth?.role !== 'admin') return;
  try {
    const response = await fetch('/api/admin/providers', { headers: { Accept: 'application/json' } });
    const payload = await parseJsonResponse(response);
    if (!response.ok) throw new Error(payload.error?.message || 'Não foi possível carregar os provedores.');
    state.providers = payload.providers || [];
    if (state.settingsOpen) renderApp();
  } catch (error) {
    toast(`Não foi possível carregar provedores externos: ${error.message}`);
  }
}

async function hydrateCatalog() {
  if (!state.auth) return;
  state.syncStatus = 'loading'; state.syncError = ''; renderApp();
  try {
    const response = await fetch('/api/catalog?limit=100');
    const payload = await parseJsonResponse(response);
    if (!response.ok) throw new Error(payload.error?.message || 'Não foi possível carregar o catálogo.');
    state.launches = (payload.items || []).map((raw, index) => { const item = normalizeMcpItem(raw, index, { endpoint: INTERNAL_MCP_ENDPOINT }); return item ? { ...item, saved: Boolean(raw.saved), status: raw.verification === 'confirmed' ? 'confirmed' : item.status } : null; }).filter(Boolean);
    state.syncStatus = 'synced'; state.lastSync = 'agora mesmo';
    saveState();
    renderApp();
  } catch (error) { state.syncStatus = 'error'; state.syncError = error.message; renderApp(); toast(`Catálogo não sincronizado: ${error.message}`); }
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
  return { id: `mcp-${connection.id || endpointHost}-${raw.id || raw.slug || `${Date.now()}-${index}`}`, title, producer, type, date, discoveredAt: new Date().toISOString(), source: raw.source || endpointHost, sourceType: 'MCP / LaunchRadar', registration, image, accent: ['#8FEA64', '#72a4ff', '#ffbe5c', '#d18bff'][index % 4], summary: raw.summary || raw.description || raw.excerpt || 'Sinal recebido de uma fonte MCP conectada.', tags, saved: false, status: 'new' };
}

async function runDiscovery() {
  const button = document.querySelector('[data-action="discover"]');
  if (button) { button.disabled = true; button.innerHTML = `${icon('radar', 16)} Escaneando...`; }
  toast('Escaneando fontes conectadas…');
  let localItems = [];
  let localSourceCount = 0;
  let localError = '';
  if (state.auth) {
    try {
      const localResponse = await fetch('/api/search/discover', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': state.csrfToken }, body: JSON.stringify({ query: state.query || undefined, event_name: state.eventName || undefined, category: state.type !== 'Todos' ? state.type : undefined, limit: state.searchLimit }) });
      const localPayload = await parseJsonResponse(localResponse);
      if (!localResponse.ok) throw new Error(localPayload.error?.message || `HTTP ${localResponse.status}`);
      localItems = (localPayload.items || []).map((item, index) => normalizeMcpItem(item, index, { id: 'local-rss', endpoint: INTERNAL_MCP_ENDPOINT })).filter(Boolean);
      localSourceCount = (localPayload.sources || []).length;
    } catch (error) {
      localError = error.message;
    }
  }
  const connectedSources = activeConnections();
  if (!connectedSources.length && !localItems.length && !localSourceCount) {
    renderApp();
    toast(localError ? `Pesquisa local falhou: ${localError}. Configure e ative pelo menos um agente MCP.` : 'Configure e ative pelo menos um agente MCP antes de pesquisar.');
    return;
  }
  try {
    const argumentsForSearch = { query: state.query || undefined, event_name: state.eventName || undefined, product_type: state.type !== 'Todos' ? state.type : undefined, producer_name: state.producer !== 'Todos' ? state.producer : undefined, source: state.platform !== 'Todas' ? state.platform : undefined, date_window_days: state.period === 'Próximos 7 dias' ? 7 : state.period === 'Este mês' ? 31 : 90, limit: state.searchLimit, sort_by: state.sort === 'date' ? 'date' : 'score' };
    const agentSearch = await collectAgentSearchResults(connectedSources, callMcp, argumentsForSearch, normalizeMcpItem);
    const uniqueItems = [...new Map([...localItems, ...agentSearch.items].map((item) => [`${item.title.toLowerCase()}|${item.date}|${item.producer.toLowerCase()}`, item])).values()];
    if (uniqueItems.length) {
      const uniqueKeys = new Set(uniqueItems.map((item) => `${item.title.toLowerCase()}|${item.date}|${item.producer.toLowerCase()}`));
      state.launches = [...uniqueItems, ...state.launches.filter((item) => !uniqueKeys.has(`${item.title.toLowerCase()}|${item.date}|${item.producer.toLowerCase()}`))];
      state.lastSync = 'agora mesmo';
      localStorage.setItem('launchscout-last-sync', state.lastSync);
      saveState();
      renderApp();
      const agentSummary = connectedSources.length ? `${agentSearch.successfulCount}/${connectedSources.length} agentes` : 'nenhum agente MCP';
      const localSummary = localSourceCount ? `, ${localSourceCount} fonte(s) RSS` : '';
      toast(`${uniqueItems.length} sinais recebidos de ${agentSummary}${localSummary}.`, 'success');
    } else {
      state.lastSync = 'agora mesmo';
      localStorage.setItem('launchscout-last-sync', state.lastSync);
      renderApp();
      toast(agentSearch.failedCount ? `Nenhum agente respondeu. Falhas: ${agentSearch.failedCount}. Verifique endpoint, token e CORS.${localError ? ` Pesquisa local: ${localError}.` : ''}` : localError ? `Pesquisa local falhou: ${localError}. MCP respondeu, mas não encontrou lançamentos.` : connectedSources.length ? 'MCP respondeu, mas não encontrou lançamentos para esta busca.' : 'Nenhum resultado verificável encontrado nas fontes RSS configuradas.');
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
  if (action === 'auth-login') { state.authMode = 'login'; state.authError = ''; renderApp(); return; }
  if (action === 'auth-register') { state.authMode = 'register'; state.authError = ''; renderApp(); return; }
  if (action === 'logout') { fetch('/api/auth/logout', { method: 'POST', headers: { Accept: 'application/json', 'X-CSRF-Token': state.csrfToken } }).finally(() => { state.auth = null; state.csrfToken = ''; state.settingsOpen = false; renderApp(); }); return; }
  if (action === 'settings') { state.settingsOpen = true; state.editingConnectionId = state.config.connections[0]?.id || 'new'; state.editingProviderId = ''; renderApp(); loadExternalProviders(); return; }
  if (action === 'close-settings') { state.settingsOpen = false; renderApp(); return; }
  if (action === 'edit-provider') { state.editingProviderId = actionTarget.dataset.id; renderApp(); return; }
  if (action === 'cancel-provider-edit') { state.editingProviderId = ''; renderApp(); return; }
  if (action === 'new-connection') {
    state.editingConnectionId = 'new';
    renderApp();
    app.querySelector('[data-form="settings"] [name="agentName"]')?.focus();
    return;
  }
  if (action === 'cancel-new-connection') {
    if (state.config.connections.length) state.editingConnectionId = state.config.connections[0].id;
    else state.settingsOpen = false;
    renderApp();
    return;
  }
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
    if (state.tokenGenerating) return;
    const connection = state.config.connections.find((item) => item.id === 'primary');
    const form = document.querySelector('[data-form="settings"]');
    const currentToken = form?.elements?.token?.value || connection?.token || '';
    const headers = { Accept: 'application/json', 'X-CSRF-Token': state.csrfToken };
    state.tokenGenerating = true;
    const button = actionTarget;
    button.disabled = true;
    button.textContent = 'Gerando token...';
    toast('Gerando token seguro no servidor…');
    fetch('/api/auth/generate', { method: 'POST', headers }).then(async (response) => { const payload = await parseJsonResponse(response); if (!response.ok) { const error = payload.error; throw new Error(error?.message || payload.message || error || `HTTP ${response.status}`); } return payload; }).then((payload) => {
      state.tokenGenerating = false;
      state.pendingToken = payload.token;
      state.tokenNotice = payload.token;
      if (connection) connection.token = payload.token;
      saveState();
      button.disabled = false;
      button.innerHTML = `${icon('spark', 14)} Gerar novo token e substituir`;
      const tokenInput = document.querySelector('[data-form="settings"] input[name="token"]');
      if (tokenInput) { tokenInput.value = payload.token; tokenInput.type = 'text'; }
      const formElement = document.querySelector('[data-form="settings"]');
      if (formElement && !formElement.querySelector('.token-reveal')) { const notice = document.createElement('div'); notice.className = 'token-reveal'; notice.innerHTML = `<strong>Novo token MCP — copie para o agente</strong><code>${esc(payload.token)}</code><button type="button" class="ghost-button" data-action="copy-token">Copiar token MCP</button><small>Não compartilhe a MCP_MASTER_KEY; o agente recebe apenas este token.</small>`; formElement.insertBefore(notice, formElement.querySelector('.settings-note')); }
      toast('Token gerado. Copie e guarde-o agora.', 'success');
    }).catch((error) => { state.tokenGenerating = false; button.disabled = false; button.textContent = connection?.token ? 'Gerar novo token e substituir' : 'Gerar token interno'; toast(`Geração de token falhou: ${error.message}`); });
    return;
  }
  if (action === 'copy-token') {
    const form = document.querySelector('[data-form="settings"]');
    const connection = state.config.connections.find((item) => item.id === 'primary');
    const token = state.tokenNotice || state.pendingToken || form?.elements?.token?.value || connection?.token || '';
    if (!token) { toast('Nenhum token novo disponível para copiar.'); return; }
    copyText(token).then(() => toast('Token MCP copiado para colar no agente de IA.', 'success')).catch(() => toast('Não foi possível copiar automaticamente; selecione o token exibido.'));
    return;
  }
  if (action === 'copy-stored-token') {
    const connection = state.config.connections.find((item) => item.id === 'primary');
    const token = document.querySelector('[data-form="settings"] input[name="token"]')?.value || connection?.token || '';
    if (!token) { toast('Nenhum token interno armazenado. Gere um token primeiro.'); return; }
    copyText(token).then(() => toast('Token MCP copiado para colar no agente de IA.', 'success')).catch(() => toast('Não foi possível copiar automaticamente; selecione o token no campo.'));
    return;
  }
  if (action === 'revoke-token') {
    const form = document.querySelector('[data-form="settings"]');
    const connection = state.config.connections.find((item) => item.id === 'primary');
    const currentToken = form?.elements?.token?.value || connection?.token || '';
    fetch('/api/auth/revoke', { method: 'POST', headers: { Accept: 'application/json', 'X-CSRF-Token': state.csrfToken } }).then(async (response) => { const payload = await parseJsonResponse(response); if (!response.ok) { const error = payload.error; throw new Error(error?.message || payload.message || error || `HTTP ${response.status}`); } return payload; }).then(() => { if (connection) connection.token = ''; state.pendingToken = ''; state.tokenNotice = ''; saveState(); const input = document.querySelector('[data-form="settings"] input[name="token"]'); if (input) { input.value = ''; input.type = 'password'; } document.querySelector('.token-reveal')?.remove(); toast('Token interno revogado imediatamente.', 'success'); }).catch((error) => toast(`Revogação falhou: ${error.message}`));
    return;
  }
  if (action === 'toggle-save') {
    const item = state.launches.find((launch) => launch.id === actionTarget.dataset.id);
    if (item) { const previous = item.saved; item.saved = !item.saved; item.status = item.saved ? 'interested' : 'new'; saveState(); renderApp(); fetch(`/api/catalog/${encodeURIComponent(item.id)}/favorite`, { method: 'POST', headers: { Accept: 'application/json', 'X-CSRF-Token': state.csrfToken } }).then(async (response) => { const payload = await parseJsonResponse(response); if (!response.ok) throw new Error(payload.error?.message || 'Não foi possível guardar o favorito.'); toast(payload.saved ? 'Adicionado à sua lista.' : 'Removido da sua lista.', 'success'); }).catch((error) => { item.saved = previous; saveState(); renderApp(); toast(`Favorito não guardado: ${error.message}`); }); }
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
  if (event.target.matches('[data-form="login"]') || event.target.matches('[data-form="register"]')) {
    event.preventDefault();
    const form = new FormData(event.target);
    const registering = event.target.matches('[data-form="register"]');
    const endpoint = registering ? '/api/auth/register' : '/api/auth/login';
    const body = registering ? { name: form.get('name'), email: form.get('email'), password: form.get('password'), passwordConfirmation: form.get('passwordConfirmation') } : { email: form.get('email'), password: form.get('password') };
    const submit = event.target.querySelector('button[type="submit"]'); if (submit) { submit.disabled = true; submit.textContent = registering ? 'A criar conta…' : 'A iniciar sessão…'; }
    fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) }).then(async (response) => { const payload = await parseJsonResponse(response); if (!response.ok) throw new Error(payload.error?.message || (registering ? 'Não foi possível criar a conta.' : 'Não foi possível iniciar sessão.')); return payload; }).then(async (payload) => {
      if (registering) {
        const loginResponse = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ email: body.email, password: body.password }) });
        const loginPayload = await parseJsonResponse(loginResponse); if (!loginResponse.ok) throw new Error(loginPayload.error?.message || 'Conta criada, mas não foi possível iniciar a sessão automaticamente.'); payload = loginPayload;
      }
      state.auth = payload.user; state.csrfToken = payload.csrfToken; state.authError = ''; state.authMode = 'login'; renderApp(); await hydrateCatalog(); toast(registering ? 'Conta criada e sessão iniciada.' : `Sessão iniciada para ${payload.user.name}.`, 'success');
    }).catch((error) => { state.authError = error.message; renderApp(); });
    return;
  }
  if (event.target.matches('[data-form="password"]')) {
    event.preventDefault();
    const form = new FormData(event.target);
    fetch('/api/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': state.csrfToken }, body: JSON.stringify({ currentPassword: form.get('currentPassword'), newPassword: form.get('newPassword'), confirmPassword: form.get('confirmPassword') }) }).then(async (response) => { const payload = await parseJsonResponse(response); if (!response.ok) throw new Error(payload.error?.message || 'Não foi possível alterar a password.'); return payload; }).then(() => { event.target.reset(); toast('Password alterada com sucesso.', 'success'); }).catch((error) => toast(`Alteração não concluída: ${error.message}`));
    return;
  }
  if (event.target.matches('[data-form="provider"]')) {
    event.preventDefault();
    const form = new FormData(event.target);
    fetch('/api/admin/providers', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': state.csrfToken }, body: JSON.stringify({ name: form.get('name'), url: form.get('url'), type: 'rss', enabled: true }) }).then(async (response) => { const payload = await parseJsonResponse(response); if (!response.ok) throw new Error(payload.error?.message || 'Não foi possível adicionar a fonte.'); return payload; }).then(async () => { event.target.reset(); await loadExternalProviders(); toast('Fonte RSS adicionada. Execute uma nova busca para consultar dados reais.', 'success'); }).catch((error) => toast(`Fonte não adicionada: ${error.message}`));
    return;
  }
  if (event.target.matches('[data-form="provider-edit"]')) {
    event.preventDefault();
    const form = new FormData(event.target);
    const providerId = String(form.get('id'));
    fetch(`/api/admin/providers/${encodeURIComponent(providerId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': state.csrfToken },
      body: JSON.stringify({ name: form.get('name'), url: form.get('url'), enabled: form.get('enabled') === 'on' })
    }).then(async (response) => {
      const payload = await parseJsonResponse(response);
      if (!response.ok) throw new Error(payload.error?.message || 'Não foi possível atualizar o provedor.');
      return payload;
    }).then(async () => {
      state.editingProviderId = '';
      await loadExternalProviders();
      toast('Provedor externo atualizado.', 'success');
    }).catch((error) => toast(`Edição do provedor falhou: ${error.message}`));
    return;
  }
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

fetch('/api/auth/me').then((response) => response.json()).then(async (payload) => { state.auth = payload.authenticated ? payload.user : null; state.csrfToken = state.auth ? payload.csrfToken || '' : ''; renderApp(); if (state.auth) await hydrateCatalog(); }).catch(() => { state.auth = null; state.csrfToken = ''; renderApp(); });
