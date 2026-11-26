import { safeWebUrl, summaryPreview } from './launch-utils.js';

export function buildPanelContext({ context = '', filters = {}, providers = [] }) {
  const activeFilters = Object.entries(filters)
    .filter(([, value]) => typeof value === 'string' && value.trim() && !['Todos', 'Todas'].includes(value.trim()))
    .slice(0, 8)
    .map(([key, value]) => `${String(key).slice(0, 40)}: ${value.trim().slice(0, 100)}`);
  const configuredSources = providers
    .filter((provider) => provider.enabled)
    .slice(0, 20)
    .map((provider) => `${String(provider.name || '').slice(0, 120)}${provider.category ? ` (${String(provider.category).slice(0, 80)})` : ''}`);

  return [
    typeof context === 'string' && context.trim() ? `Foco configurado no LaunchScout: ${context.trim().slice(0, 2000)}` : '',
    activeFilters.length ? `Filtros ativos no painel: ${activeFilters.join('; ')}` : '',
    configuredSources.length ? `Fontes RSS ativas: ${configuredSources.join('; ')}` : ''
  ].filter(Boolean).join('\n').slice(0, 3000);
}

export function normalizeAgentResults(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 10).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const url = safeWebUrl(item.url || item.link || item.registration_url);
    const title = String(item.title || item.name || '').trim().slice(0, 300);
    if (!url || !title) return [];
    const summary = summaryPreview(item.summary || item.text || item.description || item.excerpt || '');
    const image = safeWebUrl(item.image || item.image_url || '');
    return [{
      title,
      url,
      summary,
      publisher: String(item.publisher || item.author || '').trim().slice(0, 200),
      publishedAt: String(item.publishedAt || item.publishedDate || item.date || '').trim().slice(0, 100),
      image
    }];
  });
}

export function parseAgentJsonResponse(content) {
  const raw = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const parsed = JSON.parse(raw);
    return {
      answer: String(parsed.answer || '').trim().slice(0, 4000),
      results: normalizeAgentResults(parsed.results)
    };
  } catch {
    throw new Error('agent_response_invalid');
  }
}
