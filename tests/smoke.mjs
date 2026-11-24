import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const port = 3900 + Math.floor(Math.random() * 500);
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'launchscout-test-'));
const env = { ...process.env, PORT: String(port), HOST: '127.0.0.1', LAUNCHSCOUT_DATA_DIR: dataDir, MCP_MASTER_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=', LAUNCHSCOUT_DEFAULT_ADMIN: 'true' };
const child = spawn(process.execPath, ['server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
const base = `http://127.0.0.1:${port}`;
let cookie = '';
const waitForServer = async () => { for (let attempt = 0; attempt < 60; attempt += 1) { try { const response = await fetch(`${base}/health`); if (response.ok) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 100)); } throw new Error('server did not start'); };
const request = async (url, options = {}) => { const response = await fetch(`${base}${url}`, { ...options, headers: { Accept: 'application/json', ...(options.headers || {}), ...(cookie ? { Cookie: cookie } : {}) } }); const setCookie = response.headers.get('set-cookie'); if (setCookie) cookie = setCookie.split(';')[0]; const body = await response.json(); return { response, body }; };
try {
  await waitForServer();
  const health = await request('/health');
  assert.equal(health.body.runtime, 'node');
  const login = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin', password: 'admin' }) });
  assert.equal(login.response.status, 200);
  assert.ok(login.body.csrfToken);
  const account = await request('/api/account');
  assert.equal(account.body.account.email, 'admin');
  const updated = await request('/api/account', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': login.body.csrfToken }, body: JSON.stringify({ name: 'Administrador LaunchScout' }) });
  assert.equal(updated.response.status, 200);
  const password = await request('/api/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': login.body.csrfToken }, body: JSON.stringify({ currentPassword: 'admin', newPassword: 'Admin-password-2026!', confirmPassword: 'Admin-password-2026!' }) });
  assert.equal(password.response.status, 200);
  const registered = await request('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Utilizador Teste', email: `teste-${Date.now()}@example.org`, password: 'User-password-2026!', passwordConfirmation: 'User-password-2026!' }) });
  assert.equal(registered.response.status, 201);
  const registeredLogin = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: registered.body.user.email, password: 'User-password-2026!' }) });
  assert.equal(registeredLogin.response.status, 200);
  console.log('smoke tests passed');
} finally {
  child.kill('SIGTERM');
  await fs.rm(dataDir, { recursive: true, force: true });
}
