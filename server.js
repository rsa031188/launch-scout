import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { xmlValue } from './src/feed-parser.js';
import { extractPreviewImage, safeWebUrl } from './src/launch-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.LAUNCHSCOUT_DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'launchscout.json');
const DIST_DIR = path.join(__dirname, 'dist');
const VERSION = '3.0.0';
const SESSION_COOKIE = 'launchscout_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const MAX_BODY = 1024 * 1024;
const MAX_PROVIDER_IMPORT = 100;
const rateBuckets = new Map();
const eventPreviewCache = new Map();

const now = () => new Date().toISOString();
const text = (value, fallback = '') => String(value ?? fallback).trim().slice(0, 4000);
const id = () => crypto.randomUUID();
const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const createSecret = (prefix = '') => `${prefix}${crypto.randomBytes(32).toString('base64url')}`;
const safeEqual = (left, right) => { const a = Buffer.from(String(left || '')); const b = Buffer.from(String(right || '')); return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b); };

function defaultStore() {
  return { version: 3, users: [], sessions: [], mcp: { ciphertext: '', iv: '', authTag: '', hash: '', createdAt: '', rotatedAt: '', revokedAt: '' }, launches: [], favorites: [], agents: [], providers: [], searchHistory: [], auditLog: [] };
}
function ensureStore() { fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 }); if (!fs.existsSync(DATA_FILE)) writeStore(defaultStore()); }
function readStore() {
  ensureStore();
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const base = defaultStore();
    return { ...base, ...parsed, mcp: { ...base.mcp, ...(parsed.mcp || {}) }, users: Array.isArray(parsed.users) ? parsed.users : [], sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [], launches: Array.isArray(parsed.launches) ? parsed.launches : [], favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [], agents: Array.isArray(parsed.agents) ? parsed.agents : [], providers: Array.isArray(parsed.providers) ? parsed.providers : [], searchHistory: Array.isArray(parsed.searchHistory) ? parsed.searchHistory : [], auditLog: Array.isArray(parsed.auditLog) ? parsed.auditLog : [] };
  } catch {
    const backup = `${DATA_FILE}.corrupt-${Date.now()}`;
    try { fs.renameSync(DATA_FILE, backup); } catch {}
    const fresh = defaultStore(); writeStore(fresh); return fresh;
  }
}
function writeStore(store) {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  const temp = `${DATA_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(store, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temp, DATA_FILE);
}
function audit(store, event, userId = null, metadata = {}) { store.auditLog.unshift({ id: id(), event, userId, at: now(), metadata }); store.auditLog = store.auditLog.slice(0, 500); }
function json(res, status, payload, extra = {}) { const body = JSON.stringify(payload); res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra }); res.end(body); }
function error(res, status, code, message) { return json(res, status, { ok: false, error: { code, message } }); }
function parseCookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').map((part) => part.trim().split('=').map(decodeURIComponent)).filter(([key, value]) => key && value)); }
function setCookie(res, name, value, options = {}) { const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax']; if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`); if (process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true') parts.push('Secure'); res.setHeader('Set-Cookie', parts.join('; ')); }
function clearCookie(res, name) { setCookie(res, name, '', { maxAge: 0 }); }
function csrfFrom(req) { return text(req.headers['x-csrf-token']); }
function getMasterKey() {
  const raw = process.env.MCP_MASTER_KEY || '';
  if (raw) {
    const decoded = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
    if (decoded.length !== 32) throw new Error('MCP_MASTER_KEY deve representar exatamente 32 bytes em hexadecimal ou base64.');
    return decoded;
  }

  const keyPath = path.join(DATA_DIR, 'mcp-master.key');
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  try {
    const stored = fs.readFileSync(keyPath);
    if (stored.length !== 32) throw new Error('O arquivo de chave MCP deve conter exatamente 32 bytes.');
    return stored;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const generated = crypto.randomBytes(32);
  try {
    fs.writeFileSync(keyPath, generated, { flag: 'wx', mode: 0o600 });
    console.warn('MCP_MASTER_KEY ausente; chave aleatória persistida em LAUNCHSCOUT_DATA_DIR. Mantenha esse armazenamento persistente.');
    return generated;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const stored = fs.readFileSync(keyPath);
    if (stored.length !== 32) throw new Error('O arquivo de chave MCP deve conter exatamente 32 bytes.');
    return stored;
  }
}
function encryptSecret(secret) { const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', getMasterKey(), iv); const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]); return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64') }; }
function decryptSecret(mcp) { if (!mcp?.ciphertext) return ''; const decipher = crypto.createDecipheriv('aes-256-gcm', getMasterKey(), Buffer.from(mcp.iv, 'base64')); decipher.setAuthTag(Buffer.from(mcp.authTag, 'base64')); return Buffer.concat([decipher.update(Buffer.from(mcp.ciphertext, 'base64')), decipher.final()]).toString('utf8'); }
function bearer(req) { const header = text(req.headers.authorization); return header.startsWith('Bearer ') ? header.slice(7).trim() : ''; }
function fixedMcpToken() { return text(process.env.MCP_FIXED_TOKEN); }
function validMcpToken(req, store) { const token = bearer(req); const fixed = fixedMcpToken(); return Boolean(token && ((fixed && fixed.length >= 32 && safeEqual(token, fixed)) || (store.mcp.hash && safeEqual(sha256(token), store.mcp.hash)))); }
function currentSession(req, store) { const raw = parseCookies(req)[SESSION_COOKIE]; if (!raw) return null; const hashed = sha256(raw); const session = store.sessions.find((item) => item.hash === hashed && new Date(item.expiresAt).getTime() > Date.now()); if (!session) return null; const user = store.users.find((item) => item.id === session.userId); return user ? { session, user } : null; }
function requireSession(req, res, store, role = null) { const auth = currentSession(req, store); if (!auth) { error(res, 401, 'authentication_required', 'É necessário iniciar sessão.'); return null; } if (role && auth.user.role !== role) { error(res, 403, 'admin_required', 'Esta operação requer uma sessão administrativa.'); return null; } if (req.method !== 'GET' && csrfFrom(req) !== auth.session.csrf) { error(res, 403, 'csrf_invalid', 'Token CSRF inválido ou ausente.'); return null; } return auth; }
function rateLimit(req, res, key, limit = 20, windowMs = 60000) { const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0]; const bucketKey = `${key}:${ip}`; const bucket = rateBuckets.get(bucketKey) || { count: 0, reset: Date.now() + windowMs }; if (Date.now() > bucket.reset) { bucket.count = 0; bucket.reset = Date.now() + windowMs; } bucket.count += 1; rateBuckets.set(bucketKey, bucket); if (bucket.count > limit) { res.setHeader('Retry-After', Math.ceil((bucket.reset - Date.now()) / 1000)); error(res, 429, 'rate_limited', 'Muitas tentativas. Aguarde antes de tentar novamente.'); return false; } return true; }
async function readBody(req) { let size = 0; const chunks = []; for await (const chunk of req) { size += chunk.length; if (size > MAX_BODY) throw new Error('body_too_large'); chunks.push(chunk); } if (!chunks.length) return {}; return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
function privateIp(address) { if (net.isIPv4(address)) { const parts = address.split('.').map(Number); return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168); } const normalized = address.toLowerCase(); return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:') || normalized === '::'; }
async function assertPublicUrl(value) { let parsed; try { parsed = new URL(String(value)); } catch { throw new Error('provider_url_invalid'); } if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('provider_url_invalid'); if (net.isIP(parsed.hostname) && privateIp(parsed.hostname)) throw new Error('provider_private_address'); if (parsed.port && !['80', '443', '8080', '8443'].includes(parsed.port)) throw new Error('provider_port_not_allowed'); const addresses = await dns.lookup(parsed.hostname, { all: true }); if (!addresses.length || addresses.some(({ address }) => privateIp(address))) throw new Error('provider_private_address'); return parsed.toString(); }
async function readPreviewHtml(response) {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > 512_000) throw new Error('event_preview_too_large');
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 512_000) {
        await reader.cancel().catch(() => {});
        throw new Error('event_preview_too_large');
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString('utf8');
}
async function fetchEventPreviewImage(value) {
  const pageUrl = safeWebUrl(value);
  if (!pageUrl) throw new Error('provider_url_invalid');
  const cached = eventPreviewCache.get(pageUrl);
  if (cached && cached.expiresAt > Date.now()) return cached.imageUrl;
  if (cached) eventPreviewCache.delete(pageUrl);

  const publicPageUrl = await assertPublicUrl(pageUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(publicPageUrl, {
      signal: controller.signal,
      redirect: 'error',
      headers: { Accept: 'text/html, application/xhtml+xml;q=0.9' }
    });
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !/^(text\/html|application\/xhtml\+xml)(?:;|$)/i.test(contentType)) {
      throw new Error('event_preview_unavailable');
    }
    const html = await readPreviewHtml(response);
    const imageUrl = extractPreviewImage(html, publicPageUrl);
    const publicImageUrl = imageUrl ? await assertPublicUrl(imageUrl) : '';
    if (eventPreviewCache.size >= 500) eventPreviewCache.delete(eventPreviewCache.keys().next().value);
    eventPreviewCache.set(pageUrl, { imageUrl: publicImageUrl, expiresAt: Date.now() + 60 * 60 * 1000 });
    return publicImageUrl;
  } finally {
    clearTimeout(timeout);
  }
}
function createProvider(input, publicUrl) { return { id: id(), name: text(input.name, 'Provedor RSS'), type: 'rss', url: publicUrl, category: text(input.category), language: text(input.language), enabled: input.enabled !== false, status: 'not_tested', createdAt: now(), lastSearchAt: '', lastError: '' }; }
function providerImportError(error) { return ({ provider_url_invalid: 'URL inválida; use http ou https sem credenciais.', provider_private_address: 'A URL aponta para um endereço privado e não é permitida.', provider_port_not_allowed: 'A porta indicada não é permitida.' })[error.message] || 'A URL não pôde ser validada.'; }
async function fetchProvider(provider) { const url = await assertPublicUrl(provider.url); const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), Math.min(15000, Math.max(1000, Number(provider.timeoutMs || 10000)))); try { const response = await fetch(url, { signal: controller.signal, redirect: 'error', headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/plain;q=0.8' } }); if (!response.ok) throw new Error(`provider_http_${response.status}`); const body = await response.text(); if (body.length > 2_000_000) throw new Error('provider_response_too_large'); const blocks = [...body.matchAll(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi)].map((match) => match[0]); return blocks.map((block, index) => { const title = xmlValue(block, 'title'); const linkMatch = block.match(/<link(?:\s+[^>]*)?>([\s\S]*?)<\/link>/i); const link = (linkMatch ? linkMatch[1] : '').replace(/<!\[CDATA\[|\]\]>/g, '').trim(); const date = xmlValue(block, 'pubDate') || xmlValue(block, 'published') || xmlValue(block, 'updated'); const summary = xmlValue(block, 'description') || xmlValue(block, 'summary') || xmlValue(block, 'content'); if (!title) return null; return normalizeLaunch({ title, summary, producer: provider.name, product_type: provider.category || 'Lançamento', event_date: date || '', registration_url: link || url, source: provider.name, category: provider.category || 'RSS', language: provider.language || '', verification: 'partial', discovered_at: now(), score: Math.max(1, 100 - index) }); }).filter(Boolean); } finally { clearTimeout(timeout); } }
async function discoverExternal(store, args = {}) { const enabled = store.providers.filter((provider) => provider.enabled && provider.type === 'rss' && provider.url); const results = []; const sources = []; const failures = []; await Promise.all(enabled.map(async (provider) => { try { const items = await fetchProvider(provider); provider.status = 'online'; provider.lastSearchAt = now(); provider.lastError = ''; sources.push({ id: provider.id, name: provider.name, type: provider.type, status: 'online', count: items.length }); results.push(...items); } catch (e) { provider.status = 'error'; provider.lastSearchAt = now(); provider.lastError = e.message; failures.push({ id: provider.id, name: provider.name, error: e.message }); } })); const query = text(args.query || args.event_name).toLowerCase(); const filtered = results.filter((item) => !query || [item.title, item.summary, item.producer, item.category].join(' ').toLowerCase().includes(query)); const unique = [...new Map(filtered.map((item) => [`${item.title.toLowerCase()}|${item.registrationUrl}`, item])).values()]; for (const item of unique) { const existing = store.launches.find((entry) => entry.registrationUrl === item.registrationUrl && entry.title.toLowerCase() === item.title.toLowerCase()); if (existing) Object.assign(existing, { ...item, id: existing.id }); else store.launches.unshift(item); } store.searchHistory.unshift({ id: id(), query: args.query || args.event_name || '', at: now(), providers: sources.length, results: unique.length, failures: failures.length }); store.searchHistory = store.searchHistory.slice(0, 200); writeStore(store); return { items: unique.map((item) => publicLaunch(item, null, store)), sources, failures, provider_status: enabled.length ? (failures.length ? 'partial' : 'online') : 'not_configured' }; }
function normalizeLaunch(input, existingId = id()) { const safeUrl = (value) => { try { const u = new URL(String(value)); return ['http:', 'https:'].includes(u.protocol) ? u.toString() : ''; } catch { return ''; } }; return { id: existingId, title: text(input.title), summary: text(input.summary), producer: text(input.producer), productType: text(input.productType || input.product_type || input.type), eventDate: text(input.eventDate || input.event_date || input.date), registrationUrl: safeUrl(input.registrationUrl || input.registration_url || input.registration || input.url), imageUrl: safeUrl(input.imageUrl || input.image_url || input.image), source: text(input.source), category: text(input.category), country: text(input.country), language: text(input.language), score: Math.min(100, Math.max(0, Number(input.score || 0))), verification: ['confirmed', 'partial', 'unverified', 'expired'].includes(input.verification) ? input.verification : 'unverified', discoveredAt: text(input.discoveredAt || input.discovered_at || now()), updatedAt: now() }; }
function publicLaunch(item, userId = null, store = null) { const saved = Boolean(userId && store?.favorites.some((fav) => fav.userId === userId && fav.launchId === item.id)); return { id: item.id, title: item.title, summary: item.summary, producer: item.producer, product_type: item.productType, date: item.eventDate, registration: item.registrationUrl, image: item.imageUrl, source: item.source, category: item.category, country: item.country, language: item.language, score: item.score, verification: item.verification, discoveredAt: item.discoveredAt, updatedAt: item.updatedAt, saved }; }
function searchLaunches(store, args = {}, userId = null) { const q = text(args.query || args.event_name).toLowerCase(); const items = store.launches.filter((item) => { const hay = [item.title, item.summary, item.producer, item.productType, item.category, item.source, item.country, item.language].join(' ').toLowerCase(); if (q && !hay.includes(q)) return false; if (args.producer_name && !item.producer.toLowerCase().includes(text(args.producer_name).toLowerCase())) return false; for (const [key, field] of [['source', 'source'], ['product_type', 'productType'], ['category', 'category'], ['verification', 'verification']]) if (args[key] && !String(item[field]).toLowerCase().includes(text(args[key]).toLowerCase())) return false; if (args.date_from && item.eventDate < text(args.date_from)) return false; if (args.date_to && item.eventDate > `${text(args.date_to)}T23:59:59`) return false; return true; }); const sort = args.sort_by || 'score'; items.sort((a, b) => sort === 'date' ? String(a.eventDate).localeCompare(String(b.eventDate)) : sort === 'name' ? a.title.localeCompare(b.title) : Number(b.score) - Number(a.score)); const offset = Math.max(0, Number(args.offset || 0)); const limit = Math.min(100, Math.max(1, Number(args.limit || 50))); const page = items.slice(offset, offset + limit).map((item) => publicLaunch(item, userId, store)); return { items: page, count: page.length, total: items.length, next_offset: offset + page.length < items.length ? offset + page.length : null }; }
function toolDefinitions() { const noArgs = { type: 'object', properties: {}, additionalProperties: false }; const searchSchema = { type: 'object', properties: { query: { type: 'string' }, event_name: { type: 'string' }, producer_name: { type: 'string' }, source: { type: 'string' }, product_type: { type: 'string' }, category: { type: 'string' }, date_from: { type: 'string' }, date_to: { type: 'string' }, verification: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 100 }, offset: { type: 'integer', minimum: 0 }, sort_by: { type: 'string', enum: ['score', 'date', 'name'] } }, additionalProperties: false }; return [
  { name: 'search_launches', description: 'Pesquisa lançamentos persistidos no catálogo com filtros e paginação.', inputSchema: searchSchema },
  { name: 'discover_launches', description: 'Executa a descoberta nos provedores externos habilitados; sem provedores configurados retorna estado explícito.', inputSchema: searchSchema },
  { name: 'search_web', description: 'Pesquisa web através dos provedores configurados pelo administrador.', inputSchema: searchSchema },
  { name: 'save_launch', description: 'Cria ou atualiza um lançamento com proveniência preservada.', inputSchema: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, summary: { type: 'string' }, producer: { type: 'string' }, product_type: { type: 'string' }, event_date: { type: 'string' }, registration_url: { type: 'string' }, image_url: { type: 'string' }, source: { type: 'string' }, category: { type: 'string' }, country: { type: 'string' }, language: { type: 'string' }, score: { type: 'number' }, verification: { type: 'string' } }, required: ['title'], additionalProperties: false } },
  { name: 'get_launch_details', description: 'Obtém os detalhes de um lançamento por ID.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false } },
  { name: 'get_platform_statistics', description: 'Retorna estatísticas calculadas a partir dos dados persistidos.', inputSchema: noArgs },
  { name: 'get_search_sources', description: 'Lista as fontes externas configuradas e o seu estado não sensível.', inputSchema: noArgs },
  { name: 'get_connection_status', description: 'Retorna o estado do serviço MCP e do catálogo.', inputSchema: noArgs },
  { name: 'get_search_history', description: 'Retorna o histórico de pesquisas realizadas.', inputSchema: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 100 } }, additionalProperties: false } },
  { name: 'get_launch_categories', description: 'Retorna categorias presentes no catálogo.', inputSchema: noArgs },
  { name: 'validate_launch', description: 'Valida campos e URLs de um lançamento sem o persistir.', inputSchema: { type: 'object', properties: { title: { type: 'string' }, registration_url: { type: 'string' }, event_date: { type: 'string' } }, required: ['title'], additionalProperties: false } },
  { name: 'get_platform_configuration', description: 'Retorna configuração pública não sensível da plataforma.', inputSchema: noArgs }
]; }
async function callTool(store, name, args, userId = null) { const match = toolDefinitions().find((tool) => tool.name === name); if (!match) throw new Error('unknown_tool'); if (name === 'discover_launches' || name === 'search_web') return discoverExternal(store, args); if (name === 'search_launches') { const result = searchLaunches(store, args, userId); return { ...result, sources: store.providers.filter((p) => p.enabled).map((p) => ({ id: p.id, name: p.name, type: p.type, status: p.status || 'configured' })) }; }
  if (name === 'save_launch') { if (!text(args.title)) throw new Error('title_required'); const existing = args.id && store.launches.find((item) => item.id === text(args.id)); const item = normalizeLaunch(args, existing?.id || id()); if (existing) Object.assign(existing, item); else store.launches.unshift(item); writeStore(store); return { saved: true, item: publicLaunch(item, userId, store) }; }
  if (name === 'get_launch_details') { const item = store.launches.find((entry) => entry.id === text(args.id)); return { item: item ? publicLaunch(item, userId, store) : null }; }
  if (name === 'get_platform_statistics') { const upcoming = store.launches.filter((item) => item.eventDate && new Date(item.eventDate).getTime() >= Date.now()).length; return { total: store.launches.length, upcoming, confirmed: store.launches.filter((item) => item.verification === 'confirmed').length, favorites: userId ? store.favorites.filter((item) => item.userId === userId).length : 0, active_sources: store.providers.filter((item) => item.enabled).length, generated_at: now() }; }
  if (name === 'get_search_sources') return { sources: store.providers.map(({ id, name, type, enabled, status, lastSearchAt }) => ({ id, name, type, enabled, status: status || 'not_tested', lastSearchAt: lastSearchAt || null })) };
  if (name === 'get_connection_status') return { service: 'LaunchScout Unified MCP', version: VERSION, token_configured: Boolean(store.mcp.hash), catalog_items: store.launches.length, providers_enabled: store.providers.filter((p) => p.enabled).length };
  if (name === 'get_search_history') return { history: store.searchHistory.slice(0, Math.min(100, Number(args.limit || 20))) };
  if (name === 'get_launch_categories') return { categories: [...new Set(store.launches.flatMap((item) => [item.category, item.productType]).filter(Boolean))].sort() };
  if (name === 'validate_launch') { const urlValue = text(args.registration_url); let validUrl = false; try { validUrl = ['http:', 'https:'].includes(new URL(urlValue).protocol); } catch {} return { valid: Boolean(text(args.title)) && (!urlValue || validUrl), checks: { title: Boolean(text(args.title)), registration_url: !urlValue || validUrl, event_date: !args.event_date || !Number.isNaN(new Date(args.event_date).getTime()) } }; }
  if (name === 'get_platform_configuration') return { name: 'LaunchScout', version: VERSION, mcp_endpoint: '/api/mcp', authentication: 'Bearer token', external_search: store.providers.some((p) => p.enabled) ? 'configured' : 'not_configured' };
  return {};
}
function rpcResult(idValue, result) { return { jsonrpc: '2.0', id: idValue, result }; }
function rpcError(idValue, code, message, data) { return { jsonrpc: '2.0', id: idValue, error: { code, message, ...(data ? { data } : {}) } }; }
async function handleMcp(req, res, store) { if (req.method === 'GET') return json(res, 200, { status: 'ok', service: 'LaunchScout Unified MCP', version: VERSION, endpoint: '/api/mcp', authentication: 'Bearer token required' }); if (req.method !== 'POST') return error(res, 405, 'method_not_allowed', 'Método não permitido.'); if (!validMcpToken(req, store)) return error(res, 401, 'unauthorized', 'Bearer token inválido ou ausente.'); let payload; try { payload = await readBody(req); } catch (e) { return error(res, 400, e.message === 'body_too_large' ? 'body_too_large' : 'invalid_json', 'Corpo JSON inválido.'); } const requestId = payload.id ?? null; const method = text(payload.method); if (method === 'initialize') return json(res, 200, rpcResult(requestId, { protocolVersion: '2024-11-05', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'LaunchScout Unified MCP', version: VERSION } })); if (method === 'ping') return json(res, 200, rpcResult(requestId, {})); if (method === 'tools/list') return json(res, 200, rpcResult(requestId, { tools: toolDefinitions() })); if (method === 'tools/call') { try { const result = await callTool(store, text(payload.params?.name), payload.params?.arguments || {}); return json(res, 200, rpcResult(requestId, { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result, isError: false })); } catch (e) { return json(res, 200, rpcError(requestId, e.message === 'unknown_tool' ? -32601 : -32602, e.message === 'unknown_tool' ? 'Ferramenta desconhecida.' : 'Parâmetros inválidos ou operação falhou.')); } } return json(res, 200, rpcError(requestId, -32601, 'Método MCP não encontrado.')); }
async function authRoute(req, res, store, pathname) {
  if (pathname === '/api/auth/bootstrap' && req.method === 'GET') return json(res, 200, { ok: true, required: store.users.length === 0, registration: true });
  if (pathname === '/api/auth/bootstrap' && req.method === 'POST') { if (!rateLimit(req, res, 'bootstrap', 5)) return; if (store.users.length) return error(res, 409, 'bootstrap_complete', 'O administrador inicial já foi criado.'); const secret = text(req.headers['x-bootstrap-secret']); if (!process.env.LAUNCHSCOUT_BOOTSTRAP_SECRET || !safeEqual(secret, process.env.LAUNCHSCOUT_BOOTSTRAP_SECRET)) return error(res, 403, 'bootstrap_denied', 'Segredo de bootstrap inválido.'); const input = await readBody(req).catch(() => null); if (!input || text(input.password).length < 12 || !text(input.email).includes('@')) return error(res, 400, 'invalid_admin', 'Informe nome, e-mail válido e password com pelo menos 12 caracteres.'); const user = { id: id(), name: text(input.name || 'Administrador'), email: text(input.email).toLowerCase(), passwordHash: await bcrypt.hash(text(input.password), 12), role: 'admin', createdAt: now() }; store.users.push(user); audit(store, 'admin_bootstrapped', user.id); writeStore(store); return json(res, 201, { ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } }); }
  if (pathname === '/api/auth/register' && req.method === 'POST') { if (!rateLimit(req, res, 'register', 8)) return; const input = await readBody(req).catch(() => null); if (!input || text(input.password).length < 12 || text(input.password) !== text(input.passwordConfirmation) || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text(input.email))) return error(res, 400, 'invalid_registration', 'Dados inválidos. Use password com pelo menos 12 caracteres e confirmação igual.'); const email = text(input.email).toLowerCase(); if (store.users.some((u) => u.email === email)) return error(res, 409, 'email_exists', 'Este e-mail já está registado.'); const user = { id: id(), name: text(input.name || 'Utilizador'), email, passwordHash: await bcrypt.hash(text(input.password), 12), role: 'user', createdAt: now() }; store.users.push(user); audit(store, 'user_registered', user.id); writeStore(store); return json(res, 201, { ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } }); }
  if (pathname === '/api/auth/login' && req.method === 'POST') { if (!rateLimit(req, res, 'login', 10, 900000)) return; const input = await readBody(req).catch(() => null); const loginValue = text(input?.email).toLowerCase(); const user = store.users.find((u) => text(u.email).toLowerCase() === loginValue); if (!user || !(await bcrypt.compare(text(input?.password), user.passwordHash))) return error(res, 401, 'invalid_credentials', 'E-mail ou password inválidos.'); const raw = createSecret(); const session = { id: id(), userId: user.id, hash: sha256(raw), csrf: createSecret('csrf_'), createdAt: now(), expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString() }; store.sessions = store.sessions.filter((s) => new Date(s.expiresAt).getTime() > Date.now()); store.sessions.push(session); audit(store, 'login', user.id); writeStore(store); setCookie(res, SESSION_COOKIE, raw, { maxAge: SESSION_TTL_MS / 1000 }); return json(res, 200, { ok: true, csrfToken: session.csrf, user: { id: user.id, name: user.name, email: user.email, role: user.role } }); }
  if (pathname === '/api/auth/password' && req.method === 'POST') { const auth = requireSession(req, res, store); if (!auth) return; const input = await readBody(req).catch(() => null); if (!input || text(input.newPassword).length < 12 || text(input.newPassword) !== text(input.confirmPassword)) return error(res, 400, 'invalid_password', 'A nova password deve ter pelo menos 12 caracteres e a confirmação deve coincidir.'); if (!(await bcrypt.compare(text(input.currentPassword), auth.user.passwordHash))) return error(res, 401, 'current_password_invalid', 'A password atual está incorreta.'); auth.user.passwordHash = await bcrypt.hash(text(input.newPassword), 12); auth.user.mustChangePassword = false; store.sessions = store.sessions.filter((session) => session.id === auth.session.id); audit(store, 'password_changed', auth.user.id); writeStore(store); return json(res, 200, { ok: true, message: 'Password alterada. As outras sessões foram encerradas.' }); }
  if (pathname === '/api/auth/logout' && req.method === 'POST') { const auth = requireSession(req, res, store); if (!auth) return; store.sessions = store.sessions.filter((s) => s.id !== auth.session.id); audit(store, 'logout', auth.user.id); writeStore(store); clearCookie(res, SESSION_COOKIE); return json(res, 200, { ok: true }); }
  if (pathname === '/api/auth/me' && req.method === 'GET') { const auth = currentSession(req, store); return json(res, 200, { ok: true, authenticated: Boolean(auth), user: auth ? { id: auth.user.id, name: auth.user.name, email: auth.user.email, role: auth.user.role } : null, csrfToken: auth?.session.csrf || '' }); }
  if (pathname === '/api/account' && req.method === 'GET') { const auth = requireSession(req, res, store); if (!auth) return; return json(res, 200, { ok: true, account: { id: auth.user.id, name: auth.user.name, email: auth.user.email, role: auth.user.role, createdAt: auth.user.createdAt } }); }
  if (pathname === '/api/account' && (req.method === 'PATCH' || req.method === 'POST')) { const auth = requireSession(req, res, store); if (!auth) return; const input = await readBody(req).catch(() => null); const name = text(input?.name); if (!name || name.length < 2) return error(res, 400, 'invalid_name', 'O nome deve ter pelo menos 2 caracteres.'); auth.user.name = name; audit(store, 'account_updated', auth.user.id); writeStore(store); return json(res, 200, { ok: true, account: { id: auth.user.id, name: auth.user.name, email: auth.user.email, role: auth.user.role } }); }
  if (pathname === '/api/auth/sessions' && req.method === 'DELETE') { const auth = requireSession(req, res, store); if (!auth) return; store.sessions = store.sessions.filter((s) => s.userId !== auth.user.id); audit(store, 'sessions_revoked', auth.user.id); writeStore(store); clearCookie(res, SESSION_COOKIE); return json(res, 200, { ok: true }); }
  return false;
}
function serveStatic(req, res) { let requestPath = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname; if (requestPath === '/') requestPath = '/index.html'; const file = path.normalize(path.join(DIST_DIR, requestPath)); if (!file.startsWith(DIST_DIR)) return error(res, 403, 'forbidden', 'Acesso negado.'); fs.readFile(file, (readError, data) => { if (readError) return fs.readFile(path.join(DIST_DIR, 'index.html'), (fallbackError, fallback) => fallbackError ? error(res, 404, 'not_found', 'Recurso não encontrado.') : (res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }), res.end(fallback))); const ext = path.extname(file); const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' }; res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' }); res.end(data); }); }
function ensureDefaultAdmin() { ensureStore(); const store = readStore(); if (process.env.LAUNCHSCOUT_DEFAULT_ADMIN !== 'false' && store.users.length) { const legacy = store.users.find((user) => text(user.email).toLowerCase() === 'admin' && user.mustChangePassword && bcrypt.compareSync('admin', user.passwordHash)); if (legacy) { legacy.email = 'LaunchScout'; legacy.passwordHash = bcrypt.hashSync('Launch_admin', 12); audit(store, 'default_admin_credentials_migrated', legacy.id); writeStore(store); console.warn('WARNING: credencial inicial migrada para LaunchScout/Launch_admin. Altere-a imediatamente e defina LAUNCHSCOUT_DEFAULT_ADMIN=false.'); } } if (!store.users.length && process.env.LAUNCHSCOUT_DEFAULT_ADMIN !== 'false') { const user = { id: id(), name: 'Administrador', email: 'LaunchScout', passwordHash: bcrypt.hashSync('Launch_admin', 12), role: 'admin', createdAt: now(), mustChangePassword: true }; store.users.push(user); audit(store, 'default_admin_created', user.id); writeStore(store); console.warn('WARNING: credencial inicial LaunchScout/Launch_admin ativa. Altere-a imediatamente e defina LAUNCHSCOUT_DEFAULT_ADMIN=false.'); } }
ensureDefaultAdmin();
const server = http.createServer(async (req, res) => { res.setHeader('X-Frame-Options', 'SAMEORIGIN'); res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()'); if (process.env.CORS_ORIGIN) { res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN); res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-CSRF-Token'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS'); res.setHeader('Vary', 'Origin'); } if (req.method === 'OPTIONS') return res.writeHead(204).end(); const pathname = new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname; const store = readStore(); try {
    if (pathname === '/api/mcp') return handleMcp(req, res, store);
    if ((pathname === '/health' || pathname === '/api/health') && req.method === 'GET') return json(res, 200, { ok: true, service: 'LaunchScout Unified', version: VERSION, runtime: 'node', api: true });
    if (pathname.startsWith('/api/auth/') || pathname === '/api/account') { const handled = await authRoute(req, res, store, pathname); if (handled !== false) return; }
    if (pathname === '/api/auth/status' && req.method === 'GET') { const auth = requireSession(req, res, store, 'admin'); if (!auth) return; const fixed = fixedMcpToken(); return json(res, 200, { ok: true, configured: Boolean(fixed || store.mcp.hash), fixed: Boolean(fixed), createdAt: store.mcp.createdAt || null, rotatedAt: store.mcp.rotatedAt || null, revokedAt: store.mcp.revokedAt || null, active: Boolean(fixed || store.mcp.hash) }); }
    if (pathname === '/api/auth/generate' && req.method === 'POST') { const auth = requireSession(req, res, store, 'admin'); if (!auth) return; const fixed = fixedMcpToken(); if (fixed) { if (fixed.length < 32) return error(res, 503, 'mcp_fixed_token_invalid', 'MCP_FIXED_TOKEN deve ter pelo menos 32 caracteres.'); return json(res, 200, { ok: true, token: fixed, fixed: true, replaced: false, warning: 'Token MCP fixo configurado no ambiente. Para o alterar, substitua MCP_FIXED_TOKEN e reinicie a aplicação.' }); } const wasConfigured = Boolean(store.mcp.hash); const token = `lr_${crypto.randomBytes(32).toString('hex')}`; let encrypted; try { encrypted = encryptSecret(token); } catch (e) { if (e.message?.startsWith('MCP_MASTER_KEY')) return error(res, 503, 'mcp_key_not_configured', `${e.message} Configure-a no ambiente do servidor e reinicie a aplicação.`); throw e; } const timestamp = now(); store.mcp = { ...store.mcp, ...encrypted, hash: sha256(token), createdAt: store.mcp.createdAt || timestamp, rotatedAt: timestamp, revokedAt: '' }; audit(store, wasConfigured ? 'mcp_token_rotated' : 'mcp_token_created', auth.user.id); writeStore(store); return json(res, 200, { ok: true, token, rotatedAt: timestamp, replaced: wasConfigured, warning: 'Copie o token agora. O servidor guarda a credencial cifrada e o hash, nunca o texto puro.' }); }
    if (pathname === '/api/auth/recover' && req.method === 'POST') { const auth = requireSession(req, res, store, 'admin'); if (!auth) return; const fixed = fixedMcpToken(); if (fixed) { if (fixed.length < 32) return error(res, 503, 'mcp_fixed_token_invalid', 'MCP_FIXED_TOKEN deve ter pelo menos 32 caracteres.'); return json(res, 200, { ok: true, token: fixed, fixed: true, replaced: false, warning: 'Token MCP fixo configurado no ambiente. Para o alterar, substitua MCP_FIXED_TOKEN e reinicie a aplicação.' }); } const token = `lr_${crypto.randomBytes(32).toString('hex')}`; const encrypted = encryptSecret(token); const timestamp = now(); store.mcp = { ...store.mcp, ...encrypted, hash: sha256(token), createdAt: store.mcp.createdAt || timestamp, rotatedAt: timestamp, revokedAt: '' }; audit(store, 'mcp_token_recovered', auth.user.id); writeStore(store); return json(res, 200, { ok: true, token, rotatedAt: timestamp, replaced: true, warning: 'Token recuperado e credencial anterior invalidada imediatamente.' }); }
    if (pathname === '/api/auth/revoke' && req.method === 'POST') { const auth = requireSession(req, res, store, 'admin'); if (!auth) return; if (fixedMcpToken()) return error(res, 409, 'mcp_fixed_token_configured', 'O token MCP é fixo e é gerido por MCP_FIXED_TOKEN. Altere a variável e reinicie a aplicação para o substituir.'); const timestamp = now(); store.mcp = { ciphertext: '', iv: '', authTag: '', hash: '', createdAt: store.mcp.createdAt, rotatedAt: store.mcp.rotatedAt, revokedAt: timestamp }; audit(store, 'mcp_token_revoked', auth.user.id); writeStore(store); return json(res, 200, { ok: true, revoked: true, revokedAt: timestamp }); }
    if (pathname === '/api/search/discover' && req.method === 'POST') { const auth = requireSession(req, res, store); if (!auth) return; const input = await readBody(req); const result = await discoverExternal(store, input || {}); return json(res, 200, { ok: true, ...result }); }
    if (pathname === '/api/event-preview' && req.method === 'GET') {
      const auth = requireSession(req, res, store);
      if (!auth) return;
      if (!rateLimit(req, res, 'event_preview', 120, 60000)) return;
      const pageUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`).searchParams.get('url');
      if (!pageUrl) return error(res, 400, 'event_preview_url_required', 'Informe a URL da página do evento.');
      try {
        const imageUrl = await fetchEventPreviewImage(pageUrl);
        if (!imageUrl) return error(res, 404, 'event_preview_not_found', 'A página não disponibiliza uma imagem de pré-visualização.');
        res.writeHead(302, { Location: imageUrl, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
        return res.end();
      } catch (e) {
        if (['provider_url_invalid', 'provider_private_address', 'provider_port_not_allowed'].includes(e.message)) return error(res, 400, 'event_preview_url_rejected', 'A URL da página ou da imagem não é permitida.');
        if (e.message === 'event_preview_too_large') return error(res, 413, 'event_preview_too_large', 'A página excede o limite de tamanho para pré-visualização.');
        return error(res, 502, 'event_preview_unavailable', 'Não foi possível carregar a pré-visualização desta página.');
      }
    }
    if (pathname === '/api/catalog' && req.method === 'GET') { const auth = requireSession(req, res, store); if (!auth) return; const result = searchLaunches(store, Object.fromEntries(new URL(req.url, `http://${req.headers.host}`).searchParams), auth.user.id); return json(res, 200, { ok: true, ...result }); }
    if (pathname === '/api/catalog' && req.method === 'POST') { const auth = requireSession(req, res, store); if (!auth) return; const input = await readBody(req); if (!text(input.title)) return error(res, 400, 'title_required', 'O título é obrigatório.'); const existing = input.id && store.launches.find((item) => item.id === text(input.id)); const item = normalizeLaunch(input, existing?.id || id()); if (existing) Object.assign(existing, item); else store.launches.unshift(item); audit(store, existing ? 'launch_updated' : 'launch_created', auth.user.id, { launchId: item.id }); writeStore(store); return json(res, existing ? 200 : 201, { ok: true, item: publicLaunch(item, auth.user.id, store) }); }
    const favoriteMatch = pathname.match(/^\/api\/catalog\/([^/]+)\/favorite$/);
    if (favoriteMatch && req.method === 'POST') { const auth = requireSession(req, res, store); if (!auth) return; const launchId = decodeURIComponent(favoriteMatch[1]); if (!store.launches.some((item) => item.id === launchId)) return error(res, 404, 'launch_not_found', 'Lançamento não encontrado.'); const existing = store.favorites.find((item) => item.userId === auth.user.id && item.launchId === launchId); if (existing) store.favorites = store.favorites.filter((item) => item !== existing); else store.favorites.push({ id: id(), userId: auth.user.id, launchId, createdAt: now() }); audit(store, existing ? 'favorite_removed' : 'favorite_added', auth.user.id, { launchId }); writeStore(store); return json(res, 200, { ok: true, saved: !existing }); }
    if (pathname === '/api/admin/providers' && req.method === 'GET') { const auth = requireSession(req, res, store, 'admin'); if (!auth) return; return json(res, 200, { ok: true, providers: store.providers.map(({ id, name, type, url, category, language, enabled, status, lastSearchAt, lastError }) => ({ id, name, type, url, category, language, enabled, status: status || 'not_tested', lastSearchAt: lastSearchAt || null, lastError: lastError || null })) }); }
    if (pathname === '/api/admin/providers' && req.method === 'POST') { const auth = requireSession(req, res, store, 'admin'); if (!auth) return; const input = await readBody(req); if (text(input.type || 'rss') !== 'rss' || !text(input.name) || !text(input.url)) return error(res, 400, 'invalid_provider', 'Configure um provedor RSS com nome e URL pública.'); let publicUrl; try { publicUrl = await assertPublicUrl(input.url); } catch (e) { return error(res, 400, e.message, 'A URL do provedor não é permitida ou aponta para um endereço privado.'); } const provider = createProvider(input, publicUrl); store.providers.push(provider); audit(store, 'provider_created', auth.user.id, { providerId: provider.id }); writeStore(store); return json(res, 201, { ok: true, provider: { ...provider, apiKey: undefined } }); }
    if (pathname === '/api/admin/providers/import' && req.method === 'POST') {
      const auth = requireSession(req, res, store, 'admin');
      if (!auth) return;
      let input;
      try { input = await readBody(req); } catch (e) { return error(res, 400, e.message === 'body_too_large' ? 'provider_import_too_large' : 'invalid_json', e.message === 'body_too_large' ? 'O arquivo excede o limite permitido.' : 'O conteúdo enviado não é JSON válido.'); }
      if (!Array.isArray(input) || input.length === 0) return error(res, 400, 'invalid_provider_list', 'Envie um array JSON com pelo menos uma fonte RSS.');
      if (input.length > MAX_PROVIDER_IMPORT) return error(res, 400, 'too_many_providers', `Importe no máximo ${MAX_PROVIDER_IMPORT} fontes por arquivo.`);
      const imported = [];
      const rejected = [];
      for (const [index, item] of input.entries()) {
        const row = index + 1;
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          rejected.push({ index: row, reason: 'Cada entrada deve ser um objeto com name e url.' });
          continue;
        }
        if ((item.type !== undefined && text(item.type).toLowerCase() !== 'rss') || !text(item.name) || !text(item.url)) {
          rejected.push({ index: row, name: text(item.name), reason: 'Informe name e url; type, quando indicado, deve ser rss.' });
          continue;
        }
        try {
          const publicUrl = await assertPublicUrl(item.url);
          const provider = createProvider(item, publicUrl);
          store.providers.push(provider);
          imported.push({ index: row, id: provider.id, name: provider.name });
        } catch (e) {
          rejected.push({ index: row, name: text(item.name), reason: providerImportError(e) });
        }
      }
      if (imported.length) {
        audit(store, 'provider_bulk_imported', auth.user.id, { count: imported.length, rejected: rejected.length });
        writeStore(store);
      }
      return json(res, 200, { ok: true, imported, rejected });
    }
    const providerMatch = pathname.match(/^\/api\/admin\/providers\/([^/]+)$/);
    if (providerMatch && (req.method === 'PATCH' || req.method === 'POST')) { const auth = requireSession(req, res, store, 'admin'); if (!auth) return; const provider = store.providers.find((item) => item.id === decodeURIComponent(providerMatch[1])); if (!provider) return error(res, 404, 'provider_not_found', 'Provedor não encontrado.'); const input = await readBody(req).catch(() => null) || {}; if (input.name !== undefined) provider.name = text(input.name, provider.name); if (input.enabled !== undefined) provider.enabled = Boolean(input.enabled); if (input.url !== undefined) { try { provider.url = await assertPublicUrl(input.url); } catch (e) { return error(res, 400, e.message, 'A URL do provedor não é permitida.'); } } provider.updatedAt = now(); audit(store, 'provider_updated', auth.user.id, { providerId: provider.id }); writeStore(store); return json(res, 200, { ok: true, provider: { ...provider, apiKey: undefined } }); }
    if (providerMatch && req.method === 'DELETE') { const auth = requireSession(req, res, store, 'admin'); if (!auth) return; const providerId = decodeURIComponent(providerMatch[1]); store.providers = store.providers.filter((provider) => provider.id !== providerId); audit(store, 'provider_deleted', auth.user.id, { providerId }); writeStore(store); return json(res, 200, { ok: true, deleted: true }); }
    if (pathname === '/api/admin/agents' && req.method === 'GET') { const auth = requireSession(req, res, store, 'admin'); if (!auth) return; return json(res, 200, { ok: true, agents: store.agents.map(({ id, name, role, endpoint, enabled, status, lastCommunicationAt, lastExecutionAt, errorCount }) => ({ id, name, role, endpoint, enabled, status: status || 'not_tested', lastCommunicationAt: lastCommunicationAt || null, lastExecutionAt: lastExecutionAt || null, errorCount: errorCount || 0 })) }); }
    if (pathname === '/api/admin/agents' && req.method === 'POST') { const auth = requireSession(req, res, store, 'admin'); if (!auth) return; const input = await readBody(req); if (!text(input.name) || !text(input.endpoint)) return error(res, 400, 'invalid_agent', 'Nome e endpoint são obrigatórios.'); let endpoint; try { endpoint = await assertPublicUrl(input.endpoint); } catch (e) { return error(res, 400, e.message, 'O endpoint do agente não é permitido ou aponta para um endereço privado.'); } const agent = { id: id(), name: text(input.name), role: text(input.role || 'Agente de descoberta'), endpoint, enabled: input.enabled !== false, status: 'not_tested', lastCommunicationAt: '', lastExecutionAt: '', errorCount: 0, createdAt: now() }; store.agents.push(agent); audit(store, 'agent_created', auth.user.id, { agentId: agent.id }); writeStore(store); return json(res, 201, { ok: true, agent }); }
    const agentMatch = pathname.match(/^\/api\/admin\/agents\/([^/]+)$/);
    if (agentMatch && (req.method === 'PATCH' || req.method === 'POST')) { const auth = requireSession(req, res, store, 'admin'); if (!auth) return; const agent = store.agents.find((item) => item.id === decodeURIComponent(agentMatch[1])); if (!agent) return error(res, 404, 'agent_not_found', 'Agente não encontrado.'); const input = await readBody(req).catch(() => null) || {}; if (input.name !== undefined) agent.name = text(input.name, agent.name); if (input.role !== undefined) agent.role = text(input.role, agent.role); if (input.enabled !== undefined) agent.enabled = Boolean(input.enabled); if (input.endpoint !== undefined) { try { agent.endpoint = await assertPublicUrl(input.endpoint); } catch (e) { return error(res, 400, e.message, 'O endpoint do agente não é permitido.'); } } agent.updatedAt = now(); audit(store, 'agent_updated', auth.user.id, { agentId: agent.id }); writeStore(store); return json(res, 200, { ok: true, agent }); }
    if (agentMatch && req.method === 'DELETE') { const auth = requireSession(req, res, store, 'admin'); if (!auth) return; const agentId = decodeURIComponent(agentMatch[1]); store.agents = store.agents.filter((agent) => agent.id !== agentId); audit(store, 'agent_deleted', auth.user.id, { agentId }); writeStore(store); return json(res, 200, { ok: true, deleted: true }); }
    if (pathname.startsWith('/api/')) return error(res, 404, 'api_route_not_found', 'API indisponível neste processo. Execute `npm run dev`, `npm start` ou `npm run start:production`; não use `vite preview` isolado.');
    return serveStatic(req, res);
  } catch (e) { console.error(`[${now()}] request_error`, e.message); return error(res, 500, 'internal_error', 'A operação não pôde ser concluída.'); }
});
server.listen(PORT, HOST, () => console.log(`LaunchScout Unified ${VERSION} running on http://${HOST}:${PORT}`));
