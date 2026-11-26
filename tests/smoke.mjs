import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { xmlValue } from '../src/feed-parser.js';
import { extractPreviewImage, summaryPreview } from '../src/launch-utils.js';
import { buildPanelContext, normalizeAgentResults, parseAgentJsonResponse } from '../src/agent-search.js';
import { collectAgentSearchResults } from '../src/mcp-agents.js';

assert.equal(xmlValue('<item><title lang="en">LaunchScout &amp; MCP</title></item>', 'title'), 'LaunchScout & MCP');
assert.equal(xmlValue('<item><description><![CDATA[<p>Local <b>feed</b></p>]]></description></item>', 'description'), 'Local feed');
assert.equal(summaryPreview('  A descrição   curta  '), 'A descrição curta');
assert.equal([...summaryPreview('a'.repeat(205))].length, 200);
assert.equal(summaryPreview('a'.repeat(205)).endsWith('…'), true);
assert.equal(extractPreviewImage('<meta content="/images/event.png?x=1&amp;y=2" property="og:image">', 'https://events.example/page'), 'https://events.example/images/event.png?x=1&y=2');
assert.match(buildPanelContext({ context: 'SaaS B2B', filters: { tipo: 'Workshop', fonte: 'Todas' }, providers: [{ name: 'Feed de produto', category: 'Tecnologia', enabled: true }] }), /SaaS B2B[\s\S]*tipo: Workshop[\s\S]*Feed de produto \(Tecnologia\)/);
assert.equal(normalizeAgentResults([{ title: 'Evento', url: 'https://events.example', summary: 'x'.repeat(220) }, { title: 'URL inválida', url: 'javascript:alert(1)' }]).length, 1);
assert.equal([...normalizeAgentResults([{ title: 'Evento', url: 'https://events.example', summary: 'x'.repeat(220) }])[0].summary].length, 200);
assert.equal(parseAgentJsonResponse('{"answer":"Resposta","results":[]}').answer, 'Resposta');
assert.throws(() => parseAgentJsonResponse('não é JSON'), /agent_response_invalid/);

const queriedAgents = [];
const agentSearch = await collectAgentSearchResults(
  [{ id: 'agent-one' }, { id: 'agent-two' }, { id: 'agent-offline' }, { id: 'agent-tool-error' }],
  async (connection, method, params) => {
    queriedAgents.push(connection.id);
    assert.equal(method, 'tools/call');
    assert.equal(params.name, 'search_launches');
    if (connection.id === 'agent-offline') throw new Error('offline');
    if (connection.id === 'agent-tool-error') return { isError: true };
    if (connection.id === 'agent-two') {
      return { content: [{ type: 'text', text: JSON.stringify({ items: [{ id: 'two', title: 'From agent two' }] }) }] };
    }
    return { structuredContent: { items: [{ id: 'one', title: 'From agent one' }] } };
  },
  { query: 'launch' },
  (item, _index, connection) => ({ ...item, id: `${connection.id}:${item.id}` })
);
assert.deepEqual(queriedAgents.sort(), ['agent-offline', 'agent-one', 'agent-tool-error', 'agent-two']);
assert.equal(agentSearch.successfulCount, 2);
assert.equal(agentSearch.failedCount, 2);
assert.deepEqual(agentSearch.items.map((item) => item.id).sort(), ['agent-one:one', 'agent-two:two']);

const port = 3900 + Math.floor(Math.random() * 500);
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'launchscout-test-'));
const launches = Array.from({ length: 305 }, (_, index) => ({
  id: `launch-${index}`,
  title: `Lançamento ${index}`,
  summary: '',
  producer: 'Produtor de teste',
  productType: 'Produto',
  eventDate: '',
  registrationUrl: `https://example.com/event-${index}`,
  imageUrl: '',
  source: 'Teste',
  category: 'Produto',
  country: '',
  language: '',
  score: 0,
  verification: 'unverified',
  discoveredAt: '',
  updatedAt: ''
}));
await fs.writeFile(path.join(dataDir, 'launchscout.json'), JSON.stringify({
  providers: [{ id: 'provider-test', name: 'Feed inicial', type: 'rss', url: 'https://example.com/feed.xml', enabled: true, status: 'not_tested' }],
  launches
}));
const env = { ...process.env, PORT: String(port), HOST: '127.0.0.1', LAUNCHSCOUT_DATA_DIR: dataDir, MCP_MASTER_KEY: '', LAUNCHSCOUT_DEFAULT_ADMIN: 'true' };
let child = spawn(process.execPath, ['server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
const base = `http://127.0.0.1:${port}`;
let cookie = '';
const stopServer = async () => {
  if (!child || child.exitCode !== null) return;
  await new Promise((resolve) => {
    child.once('exit', resolve);
    child.kill('SIGTERM');
  });
};
const waitForServer = async () => { for (let attempt = 0; attempt < 60; attempt += 1) { try { const response = await fetch(`${base}/health`); if (response.ok) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 100)); } throw new Error('server did not start'); };
const request = async (url, options = {}) => { const response = await fetch(`${base}${url}`, { ...options, headers: { Accept: 'application/json', ...(options.headers || {}), ...(cookie ? { Cookie: cookie } : {}) } }); const setCookie = response.headers.get('set-cookie'); if (setCookie) cookie = setCookie.split(';')[0]; const body = await response.json(); return { response, body }; };
try {
  await waitForServer();
  const health = await request('/health');
  assert.equal(health.body.runtime, 'node');
  const unauthenticatedPreview = await request(`/api/event-preview?url=${encodeURIComponent('https://events.example/page')}`);
  assert.equal(unauthenticatedPreview.response.status, 401);
  const unauthenticatedAgentSearch = await request('/api/agent-search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'Procuro eventos' }) });
  assert.equal(unauthenticatedAgentSearch.response.status, 401);
  const login = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'LaunchScout', password: 'Launch_admin' }) });
  assert.equal(login.response.status, 200);
  assert.ok(login.body.csrfToken);
  const firstCatalogPage = await request('/api/catalog?limit=300');
  assert.equal(firstCatalogPage.response.status, 200);
  assert.equal(firstCatalogPage.body.items.length, 300);
  assert.equal(firstCatalogPage.body.total, 305);
  assert.equal(firstCatalogPage.body.next_offset, 300);
  const secondCatalogPage = await request('/api/catalog?limit=300&offset=300');
  assert.equal(secondCatalogPage.body.items.length, 5);
  const initialAgentConfig = await request('/api/agent-search/config');
  assert.equal(initialAgentConfig.response.status, 200);
  assert.equal(initialAgentConfig.body.config.configured, false);
  const privateAgentEndpoint = await request('/api/agent-search/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': login.body.csrfToken },
    body: JSON.stringify({ provider: 'openai-compatible', endpoint: 'http://127.0.0.1/v1', model: 'test', apiKey: 'secret' })
  });
  assert.equal(privateAgentEndpoint.response.status, 400);
  const configuredAgent = await request('/api/agent-search/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': login.body.csrfToken },
    body: JSON.stringify({ provider: 'exa', context: 'Eventos de tecnologia', apiKey: 'test-api-key-secret' })
  });
  assert.equal(configuredAgent.response.status, 200);
  assert.equal(configuredAgent.body.config.configured, true);
  assert.equal(Object.hasOwn(configuredAgent.body.config, 'apiKey'), false);
  const persistedAgentConfig = JSON.parse(await fs.readFile(path.join(dataDir, 'launchscout.json'), 'utf8')).agentSearch;
  assert.notEqual(persistedAgentConfig.apiKey.ciphertext, 'test-api-key-secret');
  assert.equal(JSON.stringify(persistedAgentConfig).includes('test-api-key-secret'), false);
  const emptyAgentQuestion = await request('/api/agent-search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': login.body.csrfToken },
    body: JSON.stringify({ question: '  ' })
  });
  assert.equal(emptyAgentQuestion.response.status, 400);
  const privatePreview = await request(`/api/event-preview?url=${encodeURIComponent('http://127.0.0.1/event')}`);
  assert.equal(privatePreview.response.status, 400);
  assert.equal(privatePreview.body.error.code, 'event_preview_url_rejected');
  const restoredSession = await request('/api/auth/me');
  assert.equal(restoredSession.response.status, 200);
  assert.equal(restoredSession.body.authenticated, true);
  assert.equal(restoredSession.body.csrfToken, login.body.csrfToken);
  const account = await request('/api/account');
  assert.equal(account.body.account.email, 'LaunchScout');
  const providers = await request('/api/admin/providers');
  assert.equal(providers.response.status, 200);
  assert.equal(providers.body.providers[0].id, 'provider-test');
  const providerUpdated = await request('/api/admin/providers/provider-test', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': login.body.csrfToken }, body: JSON.stringify({ name: 'Feed atualizado', enabled: false }) });
  assert.equal(providerUpdated.response.status, 200);
  assert.equal(providerUpdated.body.provider.name, 'Feed atualizado');
  assert.equal(providerUpdated.body.provider.enabled, false);
  const providerImport = await request('/api/admin/providers/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': login.body.csrfToken },
    body: JSON.stringify([
      { name: 'Feed importado', url: 'https://example.com/feed.xml', category: 'Tecnologia', language: 'pt' },
      { name: 'Feed privado', url: 'http://127.0.0.1/feed.xml' },
      { url: 'https://example.com/missing-name.xml' }
    ])
  });
  assert.equal(providerImport.response.status, 200);
  assert.equal(providerImport.body.imported.length, 1);
  assert.equal(providerImport.body.imported[0].name, 'Feed importado');
  assert.deepEqual(providerImport.body.rejected.map(({ index }) => index), [2, 3]);
  assert.match(providerImport.body.rejected[0].reason, /endereço privado/);
  const providersAfterImport = await request('/api/admin/providers');
  const importedProvider = providersAfterImport.body.providers.find(({ name }) => name === 'Feed importado');
  assert.equal(importedProvider.url, 'https://example.com/feed.xml');
  assert.equal(importedProvider.category, 'Tecnologia');
  assert.equal(importedProvider.language, 'pt');
  const malformedProviderImport = await request('/api/admin/providers/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': login.body.csrfToken },
    body: JSON.stringify({ providers: [] })
  });
  assert.equal(malformedProviderImport.response.status, 400);
  assert.equal(malformedProviderImport.body.error.code, 'invalid_provider_list');
  const generated = await request('/api/auth/generate', { method: 'POST', headers: { 'X-CSRF-Token': restoredSession.body.csrfToken } });
  assert.equal(generated.response.status, 200);
  assert.match(generated.body.token, /^lr_[a-f0-9]{64}$/);
  const masterKey = await fs.readFile(path.join(dataDir, 'mcp-master.key'));
  assert.equal(masterKey.length, 32);
  await stopServer();
  child = spawn(process.execPath, ['server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  await waitForServer();
  assert.deepEqual(await fs.readFile(path.join(dataDir, 'mcp-master.key')), masterKey);
  const persistedTokenResponse = await request('/api/mcp', { method: 'POST', headers: { Authorization: `Bearer ${generated.body.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'ping' }) });
  assert.equal(persistedTokenResponse.response.status, 200);
  const firstToken = generated.body.token;
  const initialized = await request('/api/mcp', { method: 'POST', headers: { Authorization: `Bearer ${firstToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) });
  assert.equal(initialized.response.status, 200);
  assert.equal(initialized.body.result.serverInfo.name, 'LaunchScout Unified MCP');
  const listedTools = await request('/api/mcp', { method: 'POST', headers: { Authorization: `Bearer ${firstToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) });
  assert.equal(listedTools.response.status, 200);
  const searchTool = listedTools.body.result.tools.find((tool) => tool.name === 'search_launches');
  assert.ok(searchTool);
  assert.equal(searchTool.inputSchema.properties.limit.maximum, 300);
  const threeHundredSearch = await request('/api/mcp', { method: 'POST', headers: { Authorization: `Bearer ${firstToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'search_launches', arguments: { limit: 300 } } }) });
  assert.equal(threeHundredSearch.body.result.structuredContent.items.length, 300);
  assert.equal(threeHundredSearch.body.result.structuredContent.total, 305);
  const searched = await request('/api/mcp', { method: 'POST', headers: { Authorization: `Bearer ${firstToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'search_launches', arguments: { query: 'not-in-empty-catalog' } } }) });
  assert.equal(searched.response.status, 200);
  assert.equal(searched.body.result.isError, false);
  assert.equal(searched.body.result.structuredContent.total, 0);
  const rotated = await request('/api/auth/generate', { method: 'POST', headers: { 'X-CSRF-Token': login.body.csrfToken } });
  assert.equal(rotated.response.status, 200);
  assert.notEqual(rotated.body.token, firstToken);
  const oldTokenResponse = await request('/api/mcp', { method: 'POST', headers: { Authorization: `Bearer ${firstToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'ping' }) });
  assert.equal(oldTokenResponse.response.status, 401);
  const newTokenResponse = await request('/api/mcp', { method: 'POST', headers: { Authorization: `Bearer ${rotated.body.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'ping' }) });
  assert.equal(newTokenResponse.response.status, 200);
  assert.deepEqual(newTokenResponse.body.result, {});
  const revoked = await request('/api/auth/revoke', { method: 'POST', headers: { 'X-CSRF-Token': login.body.csrfToken } });
  assert.equal(revoked.response.status, 200);
  const revokedTokenResponse = await request('/api/mcp', { method: 'POST', headers: { Authorization: `Bearer ${rotated.body.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'ping' }) });
  assert.equal(revokedTokenResponse.response.status, 401);
  const updated = await request('/api/account', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': login.body.csrfToken }, body: JSON.stringify({ name: 'Administrador LaunchScout' }) });
  assert.equal(updated.response.status, 200);
  const password = await request('/api/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': login.body.csrfToken }, body: JSON.stringify({ currentPassword: 'Launch_admin', newPassword: 'Admin-password-2026!', confirmPassword: 'Admin-password-2026!' }) });
  assert.equal(password.response.status, 200);
  const registered = await request('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Utilizador Teste', email: `teste-${Date.now()}@example.org`, password: 'User-password-2026!', passwordConfirmation: 'User-password-2026!' }) });
  assert.equal(registered.response.status, 201);
  const registeredLogin = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: registered.body.user.email, password: 'User-password-2026!' }) });
  assert.equal(registeredLogin.response.status, 200);
  const userAgentConfig = await request('/api/agent-search/config');
  assert.equal(userAgentConfig.response.status, 200);
  assert.equal(userAgentConfig.body.config.configured, true);
  assert.equal(Object.hasOwn(userAgentConfig.body.config, 'context'), false);
  console.log('smoke tests passed');
} finally {
  await stopServer();
  await fs.rm(dataDir, { recursive: true, force: true });
}
