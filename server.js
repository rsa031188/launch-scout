import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.LAUNCHSCOUT_DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'launchscout.json');
const DIST_DIR = path.join(__dirname, 'dist');
const VERSION = '2.0.0';

function ensureStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ tokenHash: '', tokenCreatedAt: '', launches: [] }, null, 2));
}
function readStore() {
  ensureStore();
  try {
    const store = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (!store || typeof store !== 'object' || !Array.isArray(store.launches)) throw new Error('invalid_store_shape');
    return store;
  } catch {
    const backup = `${DATA_FILE}.corrupt-${Date.now()}`;
    try { fs.renameSync(DATA_FILE, backup); } catch { /* arquivo pode ter sido substituído por outro processo */ }
    ensureStore();
    return { tokenHash: '', tokenCreatedAt: '', launches: [] };
  }
}
function writeStore(store) {
  ensureStore();
  const temp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(store, null, 2), { mode: 0o600 });
  fs.renameSync(temp, DATA_FILE);
}
function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}
function tokenHash(token) { return crypto.createHash('sha256').update(token).digest('hex'); }
function createToken() { return `lr_${crypto.randomBytes(32).toString('hex')}`; }
function bearer(req) {
  const value = req.headers.authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}
function safeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}
function authorized(req, store) { return Boolean(store.tokenHash && safeEqual(tokenHash(bearer(req)), store.tokenHash)); }
function authError(res, status, code, message) { return json(res, status, { ok: false, error: { code, message } }); }
async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('invalid_json'); }
}
function text(value, fallback = '') { return String(value ?? fallback).trim().slice(0, 2000); }
function url(value) { try { const parsed = new URL(String(value)); return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : ''; } catch { return ''; } }
function normalizeLaunch(input, id = crypto.randomUUID()) {
  return { id, title: text(input.title), summary: text(input.summary), producer: text(input.producer), product_type: text(input.product_type || input.type), event_date: text(input.event_date || input.date), registration_url: url(input.registration_url || input.registration || input.url), image_url: url(input.image_url || input.image), source: text(input.source), category: text(input.category), country: text(input.country), language: text(input.language), score: Math.min(100, Math.max(0, Number(input.score || 0))), status: text(input.status || 'new'), discovered_at: text(input.discovered_at || new Date().toISOString()), updated_at: new Date().toISOString() };
}
function publicLaunch(item) { return { id: item.id, title: item.title, summary: item.summary, producer: item.producer, product_type: item.product_type, date: item.event_date, registration: item.registration_url, image: item.image_url, source: item.source, category: item.category, country: item.country, language: item.language, score: item.score, status: item.status, discoveredAt: item.discovered_at }; }
function searchLaunches(store, args = {}) {
  const query = text(args.query || args.event_name).toLowerCase();
  const matches = store.launches.filter((item) => {
    const haystack = [item.title, item.summary, item.producer, item.product_type, item.category, item.source].join(' ').toLowerCase();
    if (query && !haystack.includes(query)) return false;
    for (const key of ['source', 'product_type', 'category', 'status']) if (args[key] && !item[key].toLowerCase().includes(text(args[key]).toLowerCase())) return false;
    if (args.producer_name && !item.producer.toLowerCase().includes(text(args.producer_name).toLowerCase())) return false;
    if (args.date_from && item.event_date < text(args.date_from)) return false;
    if (args.date_to && item.event_date > `${text(args.date_to)} 23:59:59`) return false;
    if (args.date_window_days) { const date = new Date(item.event_date).getTime(); const now = Date.now(); if (!Number.isNaN(date) && (date < now || date > now + Math.abs(Number(args.date_window_days)) * 86400000)) return false; }
    return true;
  });
  const sort = args.sort_by || 'score';
  matches.sort((a, b) => sort === 'date' ? String(a.event_date).localeCompare(String(b.event_date)) : sort === 'name' ? a.title.localeCompare(b.title) : Number(b.score) - Number(a.score));
  const offset = Math.max(0, Number(args.offset || 0));
  const limit = Math.min(100, Math.max(1, Number(args.limit || 50)));
  const items = matches.slice(offset, offset + limit).map(publicLaunch);
  return { items, count: items.length, total: matches.length, next_offset: offset + items.length < matches.length ? offset + items.length : null };
}
function tools() {
  const object = { type: 'object', properties: {}, additionalProperties: false };
  return [
    { name: 'search_launches', description: 'Pesquisa lançamentos por nome, plataforma, produtor, tipo e período.', inputSchema: { type: 'object', properties: { query: { type: 'string' }, event_name: { type: 'string' }, source: { type: 'string' }, product_type: { type: 'string' }, category: { type: 'string' }, producer_name: { type: 'string' }, date_from: { type: 'string' }, date_to: { type: 'string' }, date_window_days: { type: 'integer' }, status: { type: 'string' }, limit: { type: 'integer' }, offset: { type: 'integer' }, sort_by: { type: 'string' } }, additionalProperties: false } },
    { name: 'get_platform_statistics', description: 'Retorna estatísticas do catálogo unificado.', inputSchema: object },
    { name: 'get_launch_details', description: 'Retorna os detalhes de um lançamento.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
    { name: 'save_launch', description: 'Cria ou atualiza um lançamento no catálogo unificado.', inputSchema: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, summary: { type: 'string' }, producer: { type: 'string' }, product_type: { type: 'string' }, event_date: { type: 'string' }, registration_url: { type: 'string' }, image_url: { type: 'string' }, source: { type: 'string' }, category: { type: 'string' }, score: { type: 'number' }, status: { type: 'string' } }, required: ['title'], additionalProperties: false } }
  ];
}
function rpcResult(id, result) { return { jsonrpc: '2.0', id, result }; }
function rpcError(id, code, message) { return { jsonrpc: '2.0', id, error: { code, message } }; }
function callTool(store, name, args) {
  if (name === 'search_launches') return searchLaunches(store, args);
  if (name === 'get_platform_statistics') {
    const upcoming = store.launches.filter((item) => item.event_date && new Date(item.event_date).getTime() >= Date.now()).length;
    const types = Object.fromEntries([...new Set(store.launches.map((item) => item.product_type).filter(Boolean))].map((type) => [type, store.launches.filter((item) => item.product_type === type).length]));
    return { published: store.launches.length, upcoming, types, generated_at: new Date().toISOString() };
  }
  if (name === 'get_launch_details') return { item: store.launches.find((item) => item.id === text(args.id)) ? publicLaunch(store.launches.find((item) => item.id === text(args.id))) : null };
  if (name === 'save_launch') {
    if (!text(args.title)) throw new Error('title_required');
    const existing = args.id ? store.launches.find((item) => item.id === text(args.id)) : null;
    const item = normalizeLaunch(args, existing?.id || crypto.randomUUID());
    if (existing) Object.assign(existing, item); else store.launches.unshift(item);
    writeStore(store);
    return { saved: true, item: publicLaunch(item) };
  }
  throw new Error('unknown_tool');
}
async function handleMcp(req, res, store) {
  if (req.method === 'GET') return json(res, 200, { status: 'ok', service: 'LaunchScout Unified MCP', version: VERSION, endpoint: '/api/mcp', authentication: 'Bearer token required for POST' });
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  if (!authorized(req, store)) return authError(res, 401, 'unauthorized', 'Bearer token inválido ou ausente.');
  let payload; try { payload = await body(req); } catch { return json(res, 400, { error: 'invalid_json' }); }
  const id = payload.id ?? null; const method = String(payload.method || ''); const params = payload.params || {};
  if (method === 'initialize') return json(res, 200, rpcResult(id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'LaunchScout Unified MCP', version: VERSION } }));
  if (method === 'ping') return json(res, 200, rpcResult(id, {}));
  if (method === 'tools/list') return json(res, 200, rpcResult(id, { tools: tools() }));
  if (method === 'tools/call') {
    try { const result = callTool(store, text(params.name), params.arguments || {}); return json(res, 200, rpcResult(id, { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result, isError: false })); } catch (error) { return json(res, 200, rpcError(id, -32602, error.message === 'unknown_tool' ? 'Ferramenta desconhecida.' : error.message)); }
  }
  return json(res, 200, rpcError(id, -32601, 'Método MCP não encontrado.'));
}
function serveStatic(req, res) {
  let requestPath = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
  if (requestPath === '/') requestPath = '/index.html';
  const file = path.normalize(path.join(DIST_DIR, requestPath));
  if (!file.startsWith(DIST_DIR)) return json(res, 403, { error: 'forbidden' });
  fs.readFile(file, (error, data) => { if (error) return fs.readFile(path.join(DIST_DIR, 'index.html'), (fallbackError, fallback) => fallbackError ? json(res, 404, { error: 'not_found' }) : (res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }), res.end(fallback))); const ext = path.extname(file); const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' }; res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' }); res.end(data); });
}
ensureStore();
const server = http.createServer(async (req, res) => {
  if (process.env.CORS_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN);
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.writeHead(204).end();
  const pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
  const store = readStore();
  if (pathname === '/api/mcp') return handleMcp(req, res, store);
  if (pathname === '/api/auth/status' && req.method === 'GET') return json(res, 200, { ok: true, configured: Boolean(store.tokenHash), createdAt: store.tokenCreatedAt || null, openGeneration: true });
  if (pathname === '/api/auth/generate' && req.method === 'POST') {
    const token = createToken(); store.tokenHash = tokenHash(token); store.tokenCreatedAt = new Date().toISOString(); writeStore(store); return json(res, 200, { token, createdAt: store.tokenCreatedAt, replaced: true, warning: 'A emissão aberta substituiu imediatamente o token anterior. Copie agora; ele não será exibido novamente.' });
  }
  if (pathname === '/api/auth/recover' && req.method === 'POST') {
    const token = createToken(); store.tokenHash = tokenHash(token); store.tokenCreatedAt = new Date().toISOString(); writeStore(store); return json(res, 200, { token, createdAt: store.tokenCreatedAt, replaced: true, warning: 'Recuperação aberta concluída e token anterior substituído. Copie agora.' });
  }
  if (pathname === '/api/auth/revoke' && req.method === 'POST') { store.tokenHash = ''; store.tokenCreatedAt = ''; writeStore(store); return json(res, 200, { ok: true, revoked: true, openOperation: true }); }
  return serveStatic(req, res);
});
server.listen(PORT, HOST, () => console.log(`LaunchScout Unified running on http://${HOST}:${PORT}`));
