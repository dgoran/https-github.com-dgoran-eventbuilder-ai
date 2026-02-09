import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

let server;
let baseUrl;
let tmpDir;
let dbModule;

const ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const APP_API_TOKEN = 'test-app-token';
const JWT_SECRET = 'test-jwt-secret';

function signJwt(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createHmac('sha256', secret).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

async function request(pathname, options = {}) {
  return fetch(`${baseUrl}${pathname}`, options);
}

test.before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eventbuilder-sec-test-'));
  process.env.NODE_ENV = 'test';
  process.env.DB_PATH = path.join(tmpDir, 'test.sqlite');
  process.env.APP_API_TOKEN = APP_API_TOKEN;
  process.env.JWT_SECRET = JWT_SECRET;
  process.env.AI_RATE_LIMIT_MAX_REQUESTS = '2';
  process.env.ENCRYPTION_KEY = ENCRYPTION_KEY;
  process.env.GEMINI_API_KEY = '';

  const serverModule = await import('../server.js');
  dbModule = await import('../db.js');
  server = await serverModule.startServer(0);
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('rejects unauthenticated admin requests', async () => {
  const response = await request('/api/admin/config');
  assert.equal(response.status, 401);
});

test('rejects authenticated JWT without required role', async () => {
  const token = signJwt(
    {
      sub: 'viewer-user',
      role: 'viewer',
      exp: Math.floor(Date.now() / 1000) + 60
    },
    JWT_SECRET
  );
  const response = await request('/api/admin/config', {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(response.status, 401);
});

test('rejects app-token authenticated admin requests for superadmin-only routes', async () => {
  const response = await request('/api/admin/config', {
    headers: { Authorization: `Bearer ${APP_API_TOKEN}` }
  });
  assert.equal(response.status, 401);
});

test('allows superadmin session authenticated admin requests', async () => {
  const loginResponse = await request('/api/superadmin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin' })
  });
  assert.equal(loginResponse.status, 200);
  const cookies = loginResponse.headers.getSetCookie
    ? loginResponse.headers.getSetCookie()
    : [loginResponse.headers.get('set-cookie')].filter(Boolean);
  const cookieHeader = cookies.map((item) => item.split(';')[0]).join('; ');
  assert.ok(cookieHeader.includes('superadmin_session='));

  const response = await request('/api/admin/config', {
    headers: { Cookie: cookieHeader }
  });
  assert.equal(response.status, 200);
});

test('enforces AI rate limit with 429', async () => {
  const headers = {
    Authorization: `Bearer ${APP_API_TOKEN}`,
    'Content-Type': 'application/json'
  };

  const first = await request('/api/ai/generate-event', {
    method: 'POST',
    headers,
    body: JSON.stringify({})
  });
  assert.notEqual(first.status, 429);

  const second = await request('/api/ai/generate-event', {
    method: 'POST',
    headers,
    body: JSON.stringify({})
  });
  assert.notEqual(second.status, 429);

  const third = await request('/api/ai/generate-event', {
    method: 'POST',
    headers,
    body: JSON.stringify({})
  });
  assert.equal(third.status, 429);
  assert.ok(third.headers.get('retry-after'));
});

test('writes append-only audit logs for protected routes', async () => {
  const db = await dbModule.getDbConnection();
  const row = await db.get(
    "SELECT id FROM audit_logs WHERE path = '/api/admin/config' ORDER BY created_at DESC LIMIT 1"
  );
  assert.ok(row?.id);

  await assert.rejects(
    () => db.run("DELETE FROM audit_logs WHERE id = ?", row.id),
    /append-only/
  );
});
