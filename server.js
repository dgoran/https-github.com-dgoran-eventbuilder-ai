
import express from 'express';
import dotenv from 'dotenv';
dotenv.config();
import cors from 'cors';
import axios from 'axios';
import path from 'path';
import { promises as fs } from 'fs';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { initDb, getDbConnection } from './db.js';

const app = express();
const PORT = process.env.PORT || 8080;
const JSON_DB_PATH = path.join(__dirname, 'database.json');
const APP_API_TOKEN = process.env.APP_API_TOKEN || '';
const JWT_SECRET = process.env.JWT_SECRET || '';
const JWT_ISSUER = process.env.JWT_ISSUER || '';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || '';
const OIDC_JWKS_URL = process.env.OIDC_JWKS_URL || '';
const OIDC_JWKS_CACHE_TTL_MS = Number(process.env.OIDC_JWKS_CACHE_TTL_MS || 10 * 60 * 1000);
const FORCE_SECURE_COOKIE = process.env.FORCE_SECURE_COOKIE === '1';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const APP_API_TOKEN_AUTO_COOKIE = process.env.APP_API_TOKEN_AUTO_COOKIE === '1';
const SESSION_COOKIE_NAME = 'app_session';
const SUPERADMIN_COOKIE_NAME = 'superadmin_session';
const MAGIC_LINK_TTL_MINUTES = Number(process.env.MAGIC_LINK_TTL_MINUTES || 20);
const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 30);
const SUPERADMIN_SESSION_TTL_HOURS = Number(process.env.SUPERADMIN_SESSION_TTL_HOURS || 12);
const OAUTH_STATE_TTL_MINUTES = Number(process.env.OAUTH_STATE_TTL_MINUTES || 10);
const PASSWORD_MIN_LENGTH = Number(process.env.PASSWORD_MIN_LENGTH || 8);
const MAGIC_LINK_DEBUG_LINKS = process.env.MAGIC_LINK_DEBUG_LINKS === '1';
const ALLOW_MOCK_EMAIL_FALLBACK = process.env.ALLOW_MOCK_EMAIL_FALLBACK === '1';

// Encryption Configuration
const ALGORITHM = 'aes-256-gcm';
let ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '';
if (!/^[0-9a-fA-F]{64}$/.test(ENCRYPTION_KEY)) {
  if (IS_PRODUCTION) {
    throw new Error('ENCRYPTION_KEY must be configured as 64 hex characters in production');
  }
  ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
  console.warn('ENCRYPTION_KEY missing/invalid. Using ephemeral development key; secrets will be unreadable after restart.');
}

// In-memory cache
let dbCache = null;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
}

function generateSecretToken() {
  return crypto.randomBytes(32).toString('hex');
}

function parseCookies(req) {
  const cookieHeader = req.headers.cookie || '';
  const cookies = {};
  String(cookieHeader)
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      const [key, ...rest] = item.split('=');
      if (!key) return;
      cookies[key] = decodeURIComponent(rest.join('=') || '');
    });
  return cookies;
}

function isHttpsRequest(req) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  return req.secure || forwardedProto.includes('https');
}

function isLoopbackRequest(req) {
  const hostHeader = String(req.headers.host || '').toLowerCase();
  const host = hostHeader.split(':')[0];
  const hostname = String(req.hostname || '').toLowerCase();
  const candidates = [host, hostname];
  return candidates.some((value) => (
    value === 'localhost' ||
    value === '127.0.0.1' ||
    value === '::1' ||
    value === '[::1]'
  ));
}

function appendAuthCookie(res, name, value, req, options = {}) {
  const secureAttr = (FORCE_SECURE_COOKIE || (IS_PRODUCTION && isHttpsRequest(req))) ? '; Secure' : '';
  const maxAgePart = Number.isFinite(options.maxAgeSeconds) ? `; Max-Age=${Math.max(0, Number(options.maxAgeSeconds))}` : '';
  const expiresPart = options.expiresAt instanceof Date ? `; Expires=${options.expiresAt.toUTCString()}` : '';
  const cookieValue = value == null ? '' : encodeURIComponent(String(value));
  const header = `${name}=${cookieValue}; Path=/; HttpOnly; SameSite=Lax${secureAttr}${maxAgePart}${expiresPart}`;
  res.append('Set-Cookie', header);
}

function toBase64Url(input) {
  return Buffer.from(input).toString('base64url');
}

function randomUrlToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function splitDisplayName(fullName) {
  const name = String(fullName || '').trim();
  if (!name) {
    return { firstName: '', lastName: '' };
  }
  const parts = name.split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts.slice(-1).join(' ')
  };
}

function isStrongEnoughPassword(password) {
  return String(password || '').trim().length >= PASSWORD_MIN_LENGTH;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const digest = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt:${salt}:${digest}`;
}

function verifyPassword(password, storedHash) {
  const value = String(storedHash || '');
  const parts = value.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const salt = parts[1];
  const expectedHex = parts[2];
  const actualHex = crypto.scryptSync(String(password), salt, 64).toString('hex');
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = Buffer.from(actualHex, 'hex');
  if (expected.length !== actual.length) {
    return false;
  }
  return crypto.timingSafeEqual(expected, actual);
}

async function createSessionForUser(userId, req, res) {
  const now = Date.now();
  const sessionToken = generateSecretToken();
  const sessionHash = hashToken(sessionToken);
  const expiresAt = now + (SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const sessionId = generateId();
  const db = await getDbConnection();
  await db.run(
    `INSERT INTO auth_sessions (id, user_id, session_token_hash, expires_at, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    sessionId,
    userId,
    sessionHash,
    expiresAt,
    now,
    now
  );

  appendAuthCookie(
    res,
    SESSION_COOKIE_NAME,
    sessionToken,
    req,
    { maxAgeSeconds: SESSION_TTL_DAYS * 24 * 60 * 60, expiresAt: new Date(expiresAt) }
  );
}

async function ensureSuperadminCredentials(db) {
  const usernameRow = await db.get('SELECT value FROM settings WHERE key = ?', 'superadminUsername');
  const passwordHashRow = await db.get('SELECT value FROM settings WHERE key = ?', 'superadminPasswordHash');
  if (!usernameRow?.value) {
    await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', 'superadminUsername', 'admin');
  }
  if (!passwordHashRow?.value) {
    await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', 'superadminPasswordHash', hashPassword('admin'));
  }
}

async function getSuperadminCredentials(db) {
  const usernameRow = await db.get('SELECT value FROM settings WHERE key = ?', 'superadminUsername');
  const passwordHashRow = await db.get('SELECT value FROM settings WHERE key = ?', 'superadminPasswordHash');
  return {
    username: String(usernameRow?.value || 'admin').trim() || 'admin',
    passwordHash: String(passwordHashRow?.value || '')
  };
}

async function createSuperadminSession(req, res, username) {
  const now = Date.now();
  const token = generateSecretToken();
  const tokenHash = hashToken(token);
  const expiresAt = now + (SUPERADMIN_SESSION_TTL_HOURS * 60 * 60 * 1000);
  const db = await getDbConnection();
  await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', 'superadminSessionTokenHash', tokenHash);
  await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', 'superadminSessionExpiresAt', String(expiresAt));
  await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', 'superadminSessionUsername', String(username || 'admin'));
  appendAuthCookie(
    res,
    SUPERADMIN_COOKIE_NAME,
    token,
    req,
    { maxAgeSeconds: SUPERADMIN_SESSION_TTL_HOURS * 60 * 60, expiresAt: new Date(expiresAt) }
  );
}

async function revokeSuperadminSession(req, res) {
  const db = await getDbConnection();
  await db.run('DELETE FROM settings WHERE key IN (?, ?, ?)', 'superadminSessionTokenHash', 'superadminSessionExpiresAt', 'superadminSessionUsername');
  appendAuthCookie(res, SUPERADMIN_COOKIE_NAME, '', req, { maxAgeSeconds: 0, expiresAt: new Date(0) });
}

async function resolveSuperadminSessionAuth(req) {
  const cookies = parseCookies(req);
  const token = String(cookies[SUPERADMIN_COOKIE_NAME] || '').trim();
  if (!token) {
    return null;
  }

  const db = await getDbConnection();
  const hashRow = await db.get('SELECT value FROM settings WHERE key = ?', 'superadminSessionTokenHash');
  const expiresAtRow = await db.get('SELECT value FROM settings WHERE key = ?', 'superadminSessionExpiresAt');
  const usernameRow = await db.get('SELECT value FROM settings WHERE key = ?', 'superadminSessionUsername');
  const storedHash = String(hashRow?.value || '').trim();
  const expiresAt = Number(expiresAtRow?.value || 0);
  if (!storedHash || !expiresAt || Date.now() >= expiresAt) {
    return null;
  }

  if (!safeEqualString(hashToken(token), storedHash)) {
    return null;
  }

  return {
    actorId: `superadmin:${String(usernameRow?.value || 'admin')}`,
    roles: ['superadmin'],
    authType: 'superadmin-session',
    user: {
      id: 'superadmin',
      email: '',
      firstName: 'Super',
      lastName: 'Admin',
      organizationName: ''
    }
  };
}

function isEncryptedValue(value) {
  if (!value || typeof value !== 'string') return false;
  const parts = value.split(':');
  return parts.length === 3;
}

function rgbToHex(r, g, b) {
  const toByte = (value) => {
    const n = Math.max(0, Math.min(255, Number(value || 0)));
    return n.toString(16).padStart(2, '0');
  };
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`.toUpperCase();
}

function extractColorsFromText(raw) {
  const text = String(raw || '');
  const hexMatches = text.match(/#([a-fA-F0-9]{6})\b/g) || [];
  const rgbMatches = [...text.matchAll(/rgb\s*\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*\)/gi)]
    .map((m) => rgbToHex(m[1], m[2], m[3]));
  const combined = [...hexMatches.map((h) => h.toUpperCase()), ...rgbMatches];
  const unique = Array.from(new Set(combined));
  return unique
    .filter((hex) => hex !== '#000000' && hex !== '#FFFFFF')
    .slice(0, 8);
}

function resolveGoogleSlidesCandidateUrls(slidesUrl) {
  const value = String(slidesUrl || '').trim();
  if (!value) return [];
  const urls = [];
  try {
    const input = new URL(value);
    urls.push(input.toString());
    const pathMatch = input.pathname.match(/\/presentation\/d\/([^/]+)/i);
    const id = pathMatch?.[1];
    if (id) {
      urls.push(`https://docs.google.com/presentation/d/${id}/preview`);
      urls.push(`https://docs.google.com/presentation/d/${id}/pub`);
      urls.push(`https://docs.google.com/presentation/d/${id}/export/pptx`);
    }
  } catch (_error) {
    return [];
  }
  return Array.from(new Set(urls));
}

function enforceReadableFormStyles(html) {
  const source = String(html || '');
  if (!source.trim()) return source;
  const styleBlock = `
<style id="eventbuilder-form-readability-fix">
  form, form label, form p, form span, form h1, form h2, form h3, form h4 { color: #0f172a !important; }
  form input, form select, form textarea {
    color: #0f172a !important;
    background: #ffffff !important;
    border: 1px solid #cbd5e1 !important;
  }
  form input::placeholder, form textarea::placeholder { color: #64748b !important; }
  form button { color: #ffffff !important; }
</style>`.trim();

  if (/<\/head>/i.test(source)) {
    return source.replace(/<\/head>/i, `${styleBlock}\n</head>`);
  }
  if (/<body[^>]*>/i.test(source)) {
    return source.replace(/<body[^>]*>/i, (match) => `${match}\n${styleBlock}`);
  }
  return `${styleBlock}\n${source}`;
}

async function backfillRegistrantsFromEvents(db) {
  const existingRegistrants = await db.get('SELECT count(*) as count FROM registrants');
  if (existingRegistrants.count > 0) {
    return;
  }

  const eventRows = await db.all('SELECT id, data FROM events');
  const stmt = await db.prepare(
    'INSERT OR IGNORE INTO registrants (id, event_id, email_normalized, data, registered_at) VALUES (?, ?, ?, ?, ?)'
  );
  for (const row of eventRows) {
    let event;
    try {
      event = JSON.parse(row.data);
    } catch (e) {
      continue;
    }
    const registrants = Array.isArray(event.registrants) ? event.registrants : [];
    for (const registrant of registrants) {
      const emailNormalized = normalizeEmail(registrant.email);
      if (!emailNormalized) continue;
      const registrantId = registrant.id || generateId();
      const registeredAt = registrant.registeredAt || Date.now();
      await stmt.run(
        registrantId,
        row.id,
        emailNormalized,
        JSON.stringify({ ...registrant, id: registrantId, registeredAt }),
        registeredAt
      );
    }
  }
  await stmt.finalize();
}

async function migrateSensitiveSettings(db) {
  const sensitiveKeys = [
    'bigMarkerApiKey',
    'zoomApiKey',
    'zoomAccountId',
    'zoomClientId',
    'zoomClientSecret',
    'vimeoApiKey',
    'geminiApiKey',
    'smtpPass',
    'smtp2goApiKey'
  ];
  for (const key of sensitiveKeys) {
    const row = await db.get('SELECT value FROM settings WHERE key = ?', key);
    if (!row?.value) continue;
    if (isEncryptedValue(row.value)) continue;
    await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, encrypt(row.value));
  }
}

async function initializeData() {
  await initDb();

  // Migration Logic: If SQLite is empty, check for JSON file
  const db = await getDbConnection();
  const eventCount = await db.get('SELECT count(*) as count FROM events');
  const settingsCount = await db.get('SELECT count(*) as count FROM settings');

  if (eventCount.count === 0 && settingsCount.count === 0) {
    console.log("Empty SQLite database detected. Checking for legacy database.json for migration...");
    try {
      await fs.access(JSON_DB_PATH);
      const data = await fs.readFile(JSON_DB_PATH, 'utf8');
      if (data && data.trim()) {
        const parsed = JSON.parse(data);
        console.log("Migrating data from database.json to SQLite...");

        // Migrate Settings
        const settingsToSave = { ...parsed };
        delete settingsToSave.events; // Separate events

        for (const [key, value] of Object.entries(settingsToSave)) {
          if (value && typeof value === 'string') {
            await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', key, value);
          }
        }

        // Migrate Events
        if (Array.isArray(parsed.events)) {
          for (const event of parsed.events) {
            await db.run('INSERT OR REPLACE INTO events (id, data, created_at) VALUES (?, ?, ?)',
              event.id, JSON.stringify(event), event.createdAt || Date.now());
          }
        }
        console.log("Migration complete.");
      }
    } catch (e) {
      console.log("No legacy database.json found or migration failed:", e.message);
    }
  }
  await backfillRegistrantsFromEvents(db);
  await migrateSensitiveSettings(db);
  await ensureSuperadminCredentials(db);
}

const appReady = initializeData().catch((error) => {
  console.error('Application initialization failed:', error);
  throw error;
});

// Enable Trust Proxy for Cloud Run / Load Balancers
app.set('trust proxy', true);

app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increased limit for images
app.use(express.urlencoded({ extended: true }));

// Ensure browser clients receive API token cookie even when index.html is served by express.static.
app.use((req, res, next) => {
  if (!APP_API_TOKEN || !APP_API_TOKEN_AUTO_COOKIE) {
    return next();
  }

  const hasCookie = typeof req.headers.cookie === 'string' && req.headers.cookie.includes('app_api_token=');
  if (!hasCookie) {
    appendAuthCookie(res, 'app_api_token', APP_API_TOKEN, req);
  }

  return next();
});

app.use(express.static(path.join(__dirname, 'dist')));

function readRequestToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }

  const headerToken = req.headers['x-api-token'];
  if (typeof headerToken === 'string') {
    return headerToken.trim();
  }

  if (Array.isArray(headerToken) && headerToken.length > 0) {
    return String(headerToken[0]).trim();
  }

  const cookies = parseCookies(req);
  if (cookies.app_api_token) {
    return String(cookies.app_api_token).trim();
  }

  return '';
}

async function resolveSessionAuth(req) {
  const cookies = parseCookies(req);
  const sessionToken = String(cookies[SESSION_COOKIE_NAME] || '').trim();
  if (!sessionToken) {
    return null;
  }

  const tokenHash = hashToken(sessionToken);
  const now = Date.now();
  const db = await getDbConnection();
  const sessionRow = await db.get(
    `SELECT s.id, s.user_id, u.email, u.role, u.first_name, u.last_name, u.organization_name
     FROM auth_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.session_token_hash = ?
       AND s.revoked_at IS NULL
       AND s.expires_at > ?`,
    tokenHash,
    now
  );

  if (!sessionRow) {
    return null;
  }

  await db.run('UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?', now, sessionRow.id);
  const resolvedRole = String(sessionRow.role || 'organizer').trim().toLowerCase();
  const allowedRole = ['organizer', 'admin', 'superadmin'].includes(resolvedRole) ? resolvedRole : 'organizer';
  return {
    actorId: `user:${sessionRow.user_id}`,
    roles: [allowedRole],
    authType: 'session',
    user: {
      id: sessionRow.user_id,
      email: sessionRow.email,
      firstName: sessionRow.first_name || '',
      lastName: sessionRow.last_name || '',
      organizationName: sessionRow.organization_name || ''
    }
  };
}

function decodeBase64UrlJson(segment) {
  try {
    const json = Buffer.from(segment, 'base64url').toString('utf8');
    return JSON.parse(json);
  } catch (error) {
    return null;
  }
}

const jwksCache = {
  fetchedAt: 0,
  keysByKid: new Map()
};

async function getJwksKeysByKid() {
  if (!OIDC_JWKS_URL) {
    return new Map();
  }

  const now = Date.now();
  if (now - jwksCache.fetchedAt < OIDC_JWKS_CACHE_TTL_MS && jwksCache.keysByKid.size > 0) {
    return jwksCache.keysByKid;
  }

  const response = await fetch(OIDC_JWKS_URL, { method: 'GET' });
  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS (${response.status})`);
  }
  const json = await response.json();
  const keys = Array.isArray(json?.keys) ? json.keys : [];
  const map = new Map();
  for (const jwk of keys) {
    if (jwk?.kid) {
      map.set(String(jwk.kid), jwk);
    }
  }

  jwksCache.fetchedAt = now;
  jwksCache.keysByKid = map;
  return map;
}

function safeEqualString(a, b) {
  const aBuf = Buffer.from(String(a || ''), 'utf8');
  const bBuf = Buffer.from(String(b || ''), 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function extractRoles(payload) {
  if (!payload || typeof payload !== 'object') return [];

  const roles = [];
  if (Array.isArray(payload.roles)) {
    roles.push(...payload.roles.map((r) => String(r)));
  }
  if (typeof payload.role === 'string') {
    roles.push(payload.role);
  }
  if (Array.isArray(payload.groups)) {
    roles.push(...payload.groups.map((g) => String(g)));
  }
  if (payload.realm_access && Array.isArray(payload.realm_access.roles)) {
    roles.push(...payload.realm_access.roles.map((r) => String(r)));
  }

  return roles.map((r) => r.toLowerCase());
}

function validateJwtClaims(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.nbf && now < Number(payload.nbf)) {
    return null;
  }
  if (payload.exp && now >= Number(payload.exp)) {
    return null;
  }
  if (JWT_ISSUER && payload.iss !== JWT_ISSUER) {
    return null;
  }
  if (JWT_AUDIENCE && payload.aud !== JWT_AUDIENCE) {
    return null;
  }

  return payload;
}

async function verifyJwtToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [headerSegment, payloadSegment, signatureSegment] = parts;
  const header = decodeBase64UrlJson(headerSegment);
  const payload = decodeBase64UrlJson(payloadSegment);
  if (!header || !payload || typeof header.alg !== 'string') {
    return null;
  }

  const signedData = `${headerSegment}.${payloadSegment}`;

  if (header.alg === 'HS256' && JWT_SECRET) {
    const expectedSignature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(signedData)
      .digest('base64url');
    if (!safeEqualString(signatureSegment, expectedSignature)) {
      return null;
    }
    return validateJwtClaims(payload);
  }

  if (header.alg === 'RS256' && OIDC_JWKS_URL) {
    if (!header.kid) {
      return null;
    }
    try {
      const keysByKid = await getJwksKeysByKid();
      const jwk = keysByKid.get(String(header.kid));
      if (!jwk) {
        return null;
      }
      const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
      const signature = Buffer.from(signatureSegment, 'base64url');
      const isValid = crypto.verify('RSA-SHA256', Buffer.from(signedData), publicKey, signature);
      if (!isValid) {
        return null;
      }
      return validateJwtClaims(payload);
    } catch (error) {
      console.error('JWKS verification failed:', error.message);
      return null;
    }
  }

  return null;
}

function getBearerToken(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    return '';
  }
  return auth.slice(7).trim();
}

async function requireProtectedApiAuth(req, res, next) {
  const superadminSessionAuth = await resolveSuperadminSessionAuth(req);
  if (superadminSessionAuth) {
    req.auth = {
      actorId: superadminSessionAuth.actorId,
      roles: superadminSessionAuth.roles,
      authType: superadminSessionAuth.authType
    };
    req.user = superadminSessionAuth.user;
    return next();
  }

  const sessionAuth = await resolveSessionAuth(req);
  if (sessionAuth) {
    req.auth = {
      actorId: sessionAuth.actorId,
      roles: sessionAuth.roles,
      authType: sessionAuth.authType
    };
    req.user = sessionAuth.user;
    return next();
  }

  const bearerToken = getBearerToken(req);
  const jwtPayload = await verifyJwtToken(bearerToken);
  if (jwtPayload) {
    req.auth = {
      actorId: String(jwtPayload.sub || jwtPayload.email || jwtPayload.client_id || 'jwt-user'),
      roles: extractRoles(jwtPayload),
      authType: 'jwt'
    };
    return next();
  }

  const token = readRequestToken(req);
  if (APP_API_TOKEN && token && safeEqualString(token, APP_API_TOKEN)) {
    req.auth = {
      actorId: 'api-token',
      roles: ['superadmin'],
      authType: 'token'
    };
    return next();
  }

  if (!APP_API_TOKEN && !JWT_SECRET) {
    if (IS_PRODUCTION) {
      return res.status(503).json({ error: 'Auth is not configured on server' });
    }
    req.auth = {
      actorId: 'dev-bypass',
      roles: ['superadmin'],
      authType: 'dev-bypass'
    };
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized' });
}

async function requireSuperadminSessionOnly(req, res, next) {
  try {
    const sessionAuth = await resolveSuperadminSessionAuth(req);
    if (!sessionAuth) {
      return res.status(401).json({ error: 'Superadmin login required' });
    }
    req.auth = {
      actorId: sessionAuth.actorId,
      roles: sessionAuth.roles,
      authType: sessionAuth.authType
    };
    req.user = sessionAuth.user;
    return next();
  } catch (error) {
    return res.status(500).json({ error: 'Failed to validate superadmin session' });
  }
}

function requireAnyRole(requiredRoles) {
  const allowed = requiredRoles.map((r) => String(r).toLowerCase());
  return (req, res, next) => {
    const roles = Array.isArray(req.auth?.roles) ? req.auth.roles.map((r) => String(r).toLowerCase()) : [];
    if (roles.some((role) => allowed.includes(role))) {
      return next();
    }
    return res.status(403).json({ error: 'Forbidden' });
  };
}

function getClientIdentity(req) {
  const actorId = req.auth?.actorId;
  if (actorId) return `actor:${actorId}`;
  return `ip:${req.ip || 'unknown'}`;
}

const AI_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const AI_RATE_LIMIT_MAX_REQUESTS = Number(process.env.AI_RATE_LIMIT_MAX_REQUESTS || 20);

async function aiRateLimit(req, res, next) {
  try {
    const now = Date.now();
    const windowStart = Math.floor(now / AI_RATE_LIMIT_WINDOW_MS) * AI_RATE_LIMIT_WINDOW_MS;
    const key = getClientIdentity(req);
    const db = await getDbConnection();

    await db.run(
      `INSERT INTO rate_limits (scope, key, window_start, count)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(scope, key) DO UPDATE SET
         count = CASE
           WHEN rate_limits.window_start = excluded.window_start THEN rate_limits.count + 1
           ELSE 1
         END,
         window_start = excluded.window_start`,
      'ai',
      key,
      windowStart
    );

    const rateState = await db.get(
      'SELECT count, window_start FROM rate_limits WHERE scope = ? AND key = ?',
      'ai',
      key
    );

    if (rateState && Number(rateState.count) > AI_RATE_LIMIT_MAX_REQUESTS) {
      const retryAfter = Math.ceil((Number(rateState.window_start) + AI_RATE_LIMIT_WINDOW_MS - now) / 1000);
      res.setHeader('Retry-After', String(Math.max(1, retryAfter)));
      return res.status(429).json({ error: 'Too many AI requests. Please retry shortly.' });
    }

    // Opportunistic cleanup of old buckets.
    if (Math.random() < 0.05) {
      await db.run(
        'DELETE FROM rate_limits WHERE scope = ? AND window_start < ?',
        'ai',
        now - (AI_RATE_LIMIT_WINDOW_MS * 2)
      );
    }

    return next();
  } catch (error) {
    console.error('Rate limiter error:', error);
    return res.status(500).json({ error: 'Rate limiter unavailable' });
  }
}

function writeAuditLog(req, res, durationMs) {
  const actorId = req.auth?.actorId || 'anonymous';
  const actorRole = Array.isArray(req.auth?.roles) ? req.auth.roles.join(',') : '';
  const requestId = req.headers['x-request-id'] ? String(req.headers['x-request-id']) : generateId();
  const ip = req.ip || '';
  const userAgent = req.headers['user-agent'] ? String(req.headers['user-agent']) : '';
  const safePath = (req.originalUrl || req.url || '').split('?')[0];

  getDbConnection()
    .then((db) => db.run(
      `INSERT INTO audit_logs (
        id, actor_id, actor_role, method, path, status_code, ip, user_agent, request_id, duration_ms, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      generateId(),
      actorId,
      actorRole,
      req.method,
      safePath,
      res.statusCode,
      ip,
      userAgent,
      requestId,
      durationMs,
      Date.now()
    ))
    .catch((error) => {
      console.error('Failed to write audit log:', error.message);
    });
}

function auditMiddleware(req, res, next) {
  const startedAt = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    writeAuditLog(req, res, durationMs);
  });
  next();
}

app.use(['/api/admin', '/api/ai', '/api/bigmarker', '/api/zoom', '/api/superadmin'], auditMiddleware);
app.use('/api/admin', requireSuperadminSessionOnly);
app.use('/api/ai', requireProtectedApiAuth, requireAnyRole(['superadmin', 'admin', 'organizer']), aiRateLimit);
app.use('/api/bigmarker', requireProtectedApiAuth, requireAnyRole(['superadmin', 'admin', 'organizer']));
app.use('/api/zoom', requireProtectedApiAuth, requireAnyRole(['superadmin', 'admin', 'organizer']));

// --- HELPERS ---

function encrypt(text) {
  if (!text) return '';
  try {
    const iv = crypto.randomBytes(12);
    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (error) {
    console.error("Encryption error:", error);
    return '';
  }
}

function decrypt(text) {
  if (!text) return '';
  try {
    const parts = text.split(':');
    if (parts.length !== 3) return '';
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    const key = Buffer.from(ENCRYPTION_KEY, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    return '';
  }
}

function decryptIfEncrypted(text) {
  if (!text) return '';
  if (!isEncryptedValue(text)) return text;
  const decrypted = decrypt(text);
  return decrypted || text;
}

function getConfiguredEmailRelay(db) {
  const smtp2goApiKey = decryptIfEncrypted(db.smtp2goApiKey || '');
  const smtpPass = decryptIfEncrypted(db.smtpPass || '');
  const hasSmtp2go = !!smtp2goApiKey;
  const hasSmtp = !!(db.smtpHost && db.smtpUser && smtpPass);

  if (hasSmtp2go) {
    return {
      provider: 'smtp2go',
      smtp2goApiKey
    };
  }

  if (hasSmtp) {
    return {
      provider: 'smtp',
      smtpPass
    };
  }

  return {
    provider: 'none'
  };
}

async function sendEmailWithRelay(db, payload) {
  const relay = getConfiguredEmailRelay(db);
  const toAddress = String(payload.to || '').trim();
  if (!toAddress) {
    throw new Error('Recipient email is required');
  }

  if (relay.provider === 'smtp2go') {
    const sender = String(payload.from || db.smtp2goFrom || db.smtpFrom || '').trim();
    if (!sender) {
      throw new Error('SMTP2GO sender (From) is required');
    }

    const response = await axios.post('https://api.smtp2go.com/v3/email/send', {
      api_key: relay.smtp2goApiKey,
      to: [toAddress],
      sender,
      subject: String(payload.subject || ''),
      text_body: payload.text || undefined,
      html_body: payload.html || undefined
    }, {
      headers: { 'Content-Type': 'application/json' },
      validateStatus: () => true
    });

    if (response.status < 200 || response.status >= 300) {
      const detail = typeof response.data === 'string' ? response.data : JSON.stringify(response.data || {});
      throw new Error(`SMTP2GO request failed (${response.status}): ${detail.slice(0, 300)}`);
    }

    if (response.data && response.data.data && Number(response.data.data.succeeded || 0) < 1) {
      const detail = JSON.stringify(response.data).slice(0, 300);
      throw new Error(`SMTP2GO rejected email: ${detail}`);
    }

    return { provider: 'smtp2go' };
  }

  if (relay.provider === 'smtp') {
    const transporter = nodemailer.createTransport({
      host: db.smtpHost,
      port: parseInt(db.smtpPort || '587', 10),
      secure: parseInt(db.smtpPort || '587', 10) === 465,
      auth: { user: db.smtpUser, pass: relay.smtpPass }
    });

    const fromAddress = String(payload.from || db.smtpFrom || `EventBuilder AI <${db.smtpUser}>`).trim();
    await transporter.sendMail({
      from: fromAddress,
      to: toAddress,
      subject: String(payload.subject || ''),
      text: payload.text || undefined,
      html: payload.html || undefined
    });
    return { provider: 'smtp' };
  }

  throw new Error('Email relay is not configured');
}

function createDefaultDb() {
  return {
    bigMarkerApiKey: '',
    bigMarkerChannelId: '',
    zoomApiKey: '',
    zoomAccountId: '',
    zoomClientId: '',
    zoomClientSecret: '',
    vimeoApiKey: '',
    geminiApiKey: '',
    defaultProxyUrl: '',
    smtpHost: '',
    smtpPort: '',
    smtpUser: '',
    smtpPass: '',
    smtpFrom: '',
    smtp2goApiKey: '',
    smtp2goFrom: '',
    events: []
  };
}

const zoomTokenCache = {
  accessToken: '',
  expiresAt: 0,
  credentialsHash: ''
};

function clearZoomTokenCache() {
  zoomTokenCache.accessToken = '';
  zoomTokenCache.expiresAt = 0;
  zoomTokenCache.credentialsHash = '';
}

function getZoomCredentialFingerprint(accountId, clientId, clientSecret) {
  return crypto
    .createHash('sha256')
    .update(`${accountId}|${clientId}|${clientSecret}`, 'utf8')
    .digest('hex');
}

function parseBearerToken(value) {
  const token = String(value || '').trim();
  if (!token.toLowerCase().startsWith('bearer ')) {
    return '';
  }
  return token.slice(7).trim();
}

function getStoredZoomConfig(db) {
  return {
    rawToken: decryptIfEncrypted(db.zoomApiKey || '').trim(),
    accountId: decryptIfEncrypted(db.zoomAccountId || '').trim(),
    clientId: decryptIfEncrypted(db.zoomClientId || '').trim(),
    clientSecret: decryptIfEncrypted(db.zoomClientSecret || '').trim()
  };
}

async function getZoomAccessTokenWithS2S(accountId, clientId, clientSecret, options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);
  const now = Date.now();
  const credentialsHash = getZoomCredentialFingerprint(accountId, clientId, clientSecret);

  if (
    !forceRefresh &&
    zoomTokenCache.accessToken &&
    zoomTokenCache.credentialsHash === credentialsHash &&
    zoomTokenCache.expiresAt - now > 60 * 1000
  ) {
    return zoomTokenCache.accessToken;
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64');
  const tokenResponse = await axios.post(
    'https://zoom.us/oauth/token',
    null,
    {
      params: {
        grant_type: 'account_credentials',
        account_id: accountId
      },
      headers: {
        Authorization: `Basic ${basic}`
      },
      validateStatus: () => true
    }
  );

  if (tokenResponse.status < 200 || tokenResponse.status >= 300) {
    const detail = typeof tokenResponse.data === 'string' ? tokenResponse.data : JSON.stringify(tokenResponse.data || {});
    throw new Error(`Zoom OAuth token request failed (${tokenResponse.status}): ${detail.slice(0, 300)}`);
  }

  const token = String(tokenResponse.data?.access_token || '').trim();
  const expiresInSec = Math.max(60, Number(tokenResponse.data?.expires_in || 3600));
  if (!token) {
    throw new Error('Zoom OAuth token request succeeded but returned no access token');
  }

  zoomTokenCache.accessToken = token;
  zoomTokenCache.credentialsHash = credentialsHash;
  zoomTokenCache.expiresAt = now + (expiresInSec * 1000);
  return token;
}

async function resolveZoomBearerToken(req, db, options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);
  const headerToken = parseBearerToken(req.headers.authorization);
  if (headerToken) {
    return { token: headerToken, source: 'request-header' };
  }

  const zoomConfig = getStoredZoomConfig(db);
  if (zoomConfig.rawToken) {
    return { token: zoomConfig.rawToken, source: 'stored-token' };
  }

  if (zoomConfig.accountId && zoomConfig.clientId && zoomConfig.clientSecret) {
    const oauthToken = await getZoomAccessTokenWithS2S(
      zoomConfig.accountId,
      zoomConfig.clientId,
      zoomConfig.clientSecret,
      { forceRefresh }
    );
    return { token: oauthToken, source: 'oauth-s2s' };
  }

  return { token: '', source: 'none' };
}

async function deleteZoomMeetingById(req, db, meetingId) {
  const cleanMeetingId = String(meetingId || '').trim();
  if (!cleanMeetingId) {
    return { skipped: true, reason: 'missing-meeting-id' };
  }

  const resolvedToken = await resolveZoomBearerToken(req, db);
  if (!resolvedToken.token) {
    return { skipped: false, status: 400, error: 'Zoom is not configured in SuperAdmin.' };
  }

  let response = await axios.delete(
    `https://api.zoom.us/v2/meetings/${encodeURIComponent(cleanMeetingId)}`,
    {
      headers: {
        Authorization: `Bearer ${resolvedToken.token}`
      },
      validateStatus: () => true
    }
  );

  if (response.status === 401 && resolvedToken.source === 'oauth-s2s') {
    const refreshed = await resolveZoomBearerToken(req, db, { forceRefresh: true });
    if (refreshed.token) {
      response = await axios.delete(
        `https://api.zoom.us/v2/meetings/${encodeURIComponent(cleanMeetingId)}`,
        {
          headers: {
            Authorization: `Bearer ${refreshed.token}`
          },
          validateStatus: () => true
        }
      );
    }
  }

  if (response.status === 204 || response.status === 200) {
    return { skipped: false, deleted: true, status: response.status };
  }

  // Treat "already gone" as non-blocking.
  if (response.status === 404) {
    return { skipped: false, deleted: true, alreadyMissing: true, status: response.status };
  }

  const details = typeof response.data === 'string' ? response.data : JSON.stringify(response.data || {});
  return {
    skipped: false,
    deleted: false,
    status: response.status,
    error: `Zoom delete failed: ${details.slice(0, 300)}`
  };
}

function resolveBigMarkerApiKey(db) {
  const stored = decryptIfEncrypted(db.bigMarkerApiKey || '').trim();
  const envKey = String(process.env.BIGMARKER_API_KEY || '').trim();
  return stored || envKey || '';
}

function resolveBigMarkerChannelId(db) {
  const stored = String(decryptIfEncrypted(db.bigMarkerChannelId || '') || '').trim();
  const envValue = String(process.env.BIGMARKER_CHANNEL_ID || '').trim();
  const resolved = stored || envValue || '';
  if (!resolved) {
    return '';
  }
  // BigMarker IDs are numeric in API docs, but we keep string transport-safe.
  return resolved.replace(/[^\d]/g, '') || resolved;
}

async function deleteBigMarkerConferenceById(db, conferenceId) {
  const cleanConferenceId = String(conferenceId || '').trim();
  if (!cleanConferenceId) {
    return { skipped: true, reason: 'missing-conference-id' };
  }

  const apiKey = resolveBigMarkerApiKey(db);
  if (!apiKey) {
    return { skipped: false, status: 400, error: 'BigMarker is not configured in SuperAdmin.' };
  }

  const response = await axios.delete(
    `https://www.bigmarker.com/api/v1/conferences/${encodeURIComponent(cleanConferenceId)}`,
    {
      headers: {
        'API-KEY': apiKey,
        Accept: 'application/json',
        'User-Agent': 'EventBuilder-AI-Server/1.0'
      },
      validateStatus: () => true
    }
  );

  if (response.status >= 200 && response.status < 300) {
    return { skipped: false, deleted: true, status: response.status };
  }
  if (response.status === 404) {
    return { skipped: false, deleted: true, alreadyMissing: true, status: response.status };
  }

  const details = typeof response.data === 'string' ? response.data : JSON.stringify(response.data || {});
  return {
    skipped: false,
    deleted: false,
    status: response.status,
    error: `BigMarker delete failed: ${details.slice(0, 300)}`
  };
}

function splitRegistrantName(nameRaw) {
  const fullName = String(nameRaw || '').trim();
  const firstSpace = fullName.indexOf(' ');
  const firstName = firstSpace === -1 ? fullName : fullName.slice(0, firstSpace);
  const lastName = firstSpace === -1 ? '.' : fullName.slice(firstSpace + 1).trim() || '.';
  return {
    fullName,
    firstName: firstName || '.',
    lastName: lastName || '.'
  };
}

async function registerBigMarkerRegistrantByConferenceId(db, conferenceId, registrantInput) {
  const cleanConferenceId = String(conferenceId || '').trim();
  if (!cleanConferenceId) {
    return { skipped: true, reason: 'missing-conference-id' };
  }

  const apiKey = resolveBigMarkerApiKey(db);
  if (!apiKey) {
    return { skipped: false, status: 400, error: 'BigMarker is not configured in SuperAdmin.' };
  }

  const email = normalizeEmail(registrantInput?.email);
  if (!email) {
    return { skipped: false, status: 400, error: 'Registrant email is required.' };
  }

  const nameParts = splitRegistrantName(
    registrantInput?.name ||
    `${registrantInput?.first_name || ''} ${registrantInput?.last_name || ''}`.trim()
  );
  const customFields = {};
  for (const [key, value] of Object.entries(registrantInput || {})) {
    if (!['name', 'email', 'first_name', 'last_name', 'id', 'registeredAt'].includes(key) && value !== undefined && value !== null && String(value) !== '') {
      customFields[key] = value;
    }
  }
  const firstName = String(registrantInput?.first_name || nameParts.firstName || '.');
  const lastName = String(registrantInput?.last_name || nameParts.lastName || '.');

  const formBody = new URLSearchParams();
  formBody.set('id', cleanConferenceId);
  formBody.set('email', email);
  formBody.set('first_name', firstName);
  formBody.set('last_name', lastName);
  formBody.set('show_full_data', 'true');
  if (Object.keys(customFields).length > 0) {
    formBody.set('custom_fields', JSON.stringify(customFields));
  }

  const response = await axios.put(
    'https://www.bigmarker.com/api/v1/conferences/register',
    formBody.toString(),
    {
      headers: {
        'API-KEY': apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'EventBuilder-AI-Server/1.0'
      },
      validateStatus: () => true
    }
  );

  if (response.status >= 200 && response.status < 300) {
    return { skipped: false, synced: true, status: response.status, providerResponse: response.data || {} };
  }

  const details = typeof response.data === 'string' ? response.data : JSON.stringify(response.data || {});
  if (response.status === 409 || /already|exists|duplicate|is registered/i.test(details)) {
    return { skipped: false, synced: true, duplicate: true, status: response.status, providerResponse: response.data || {} };
  }
  if (response.status === 401 || response.status === 403) {
    return {
      skipped: false,
      synced: false,
      status: response.status,
      error: `BigMarker auth failed: ${details.slice(0, 300)}`
    };
  }

  return {
    skipped: false,
    synced: false,
    status: response.status || 502,
    error: `BigMarker registration failed: ${details.slice(0, 300)}`
  };
}

async function getBigMarkerConferenceSummaryById(db, conferenceId) {
  const cleanConferenceId = String(conferenceId || '').trim();
  if (!cleanConferenceId) {
    return null;
  }

  const apiKey = resolveBigMarkerApiKey(db);
  if (!apiKey) {
    return null;
  }

  const response = await axios.get(
    `https://www.bigmarker.com/api/v1/conferences/${encodeURIComponent(cleanConferenceId)}`,
    {
      headers: {
        'API-KEY': apiKey,
        Accept: 'application/json',
        'User-Agent': 'EventBuilder-AI-Server/1.0'
      },
      validateStatus: () => true
    }
  );

  if (response.status < 200 || response.status >= 300) {
    return null;
  }

  const conference = response.data?.conference || response.data || {};
  return {
    conferenceId: String(conference.id || cleanConferenceId),
    title: String(conference.title || ''),
    startTime: String(conference.start_time || conference.starts_at || ''),
    timeZone: String(conference.time_zone || conference.timezone || ''),
    conferenceAddress: String(conference.conference_address || conference.webinar_url || '')
  };
}

const eventSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "Catchy title of the webinar/live stream" },
    description: { type: Type.STRING, description: "A comprehensive summary of the webinar" },
    theme: { type: Type.STRING, description: "The visual or conceptual theme" },
    imageKeyword: { type: Type.STRING, description: "A single English noun describing the visual theme (e.g., 'technology', 'conference', 'nature') for image generation" },
    targetAudience: { type: Type.STRING, description: "Who this event is for" },
    estimatedAttendees: { type: Type.INTEGER, description: "Projected number of attendees" },
    date: { type: Type.STRING, description: "Suggested date string (e.g., 'October 15, 2024')" },
    location: { type: Type.STRING, description: "Must be 'Live Stream' or 'Webinar Platform'" },
    marketingTagline: { type: Type.STRING, description: "A punchy marketing tagline" },
    speakers: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          name: { type: Type.STRING },
          role: { type: Type.STRING, description: "Job title or Role" },
          bio: { type: Type.STRING, description: "Short 1-sentence bio" }
        },
        required: ["id", "name", "role", "bio"]
      }
    },
    agenda: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          time: { type: Type.STRING, description: "Start time (e.g., '09:00 AM')" },
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          durationMinutes: { type: Type.INTEGER },
          type: { type: Type.STRING, enum: ['keynote', 'break', 'workshop', 'networking', 'panel', 'other'] },
          imageKeyword: { type: Type.STRING, description: "A single noun representing this agenda item topic (e.g. 'coffee', 'computer', 'handshake')" }
        },
        required: ["id", "time", "title", "description", "durationMinutes", "type", "imageKeyword"]
      }
    },
    tasks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          title: { type: Type.STRING },
          status: { type: Type.STRING, enum: ['pending', 'in-progress', 'completed'] },
          priority: { type: Type.STRING, enum: ['low', 'medium', 'high'] }
        },
        required: ["id", "title", "status", "priority"]
      }
    },
    budget: {
      type: Type.OBJECT,
      properties: {
        totalBudget: { type: Type.NUMBER },
        currency: { type: Type.STRING },
        items: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              category: { type: Type.STRING },
              amount: { type: Type.NUMBER },
              label: { type: Type.STRING }
            }
          }
        }
      },
      required: ["totalBudget", "currency", "items"]
    }
  },
  required: ["title", "description", "theme", "imageKeyword", "speakers", "agenda", "tasks", "budget", "marketingTagline"]
};

async function getGeminiApiKey() {
  const db = await getDbConnection();
  const row = await db.get('SELECT value FROM settings WHERE key = ?', 'geminiApiKey');
  const rawDbValue = String(row?.value || '').trim();
  let dbKey = '';
  if (rawDbValue) {
    if (isEncryptedValue(rawDbValue)) {
      dbKey = decrypt(rawDbValue).trim();
      if (!dbKey) {
        console.warn('Stored Gemini key exists but cannot be decrypted with current ENCRYPTION_KEY.');
      }
    } else {
      dbKey = rawDbValue;
    }
  }

  if (dbKey && isLikelyGeminiApiKey(dbKey)) {
    return dbKey;
  }

  // In production, SuperAdmin-stored key is the source of truth unless explicitly overridden.
  const allowEnvFallback = (!IS_PRODUCTION) || process.env.ALLOW_ENV_GEMINI_FALLBACK === '1';
  if (allowEnvFallback) {
    const envKey = String(process.env.GEMINI_API_KEY || '').trim();
    if (envKey && isLikelyGeminiApiKey(envKey)) {
      return envKey;
    }
  }

  return '';
}

async function getAiClient() {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    throw new Error('Gemini API key is not configured or unreadable. Re-save it in SuperAdmin > AI Configuration.');
  }
  return new GoogleGenAI({ apiKey });
}

// SQLite DB Getter
async function getDb() {
  try {
    const db = await getDbConnection();

    // Fetch Settings
    const settingsRows = await db.all('SELECT key, value FROM settings');
    const settings = {};
    settingsRows.forEach(row => {
      settings[row.key] = row.value;
    });

    // Fetch Events
    const eventRows = await db.all('SELECT id, data FROM events ORDER BY created_at DESC');
    const events = eventRows.map(row => {
      const parsed = JSON.parse(row.data);
      return { ...parsed, id: parsed.id || row.id };
    });

    // Fetch Registrants and attach to events from normalized table
    const registrantRows = await db.all('SELECT event_id, data FROM registrants ORDER BY registered_at DESC');
    const registrantsByEvent = new Map();
    for (const row of registrantRows) {
      try {
        const parsed = JSON.parse(row.data);
        if (!registrantsByEvent.has(row.event_id)) {
          registrantsByEvent.set(row.event_id, []);
        }
        registrantsByEvent.get(row.event_id).push(parsed);
      } catch (e) {
        continue;
      }
    }
    for (const event of events) {
      event.registrants = registrantsByEvent.get(event.id) || [];
    }

    // Merge with defaults to ensure structure
    const defaults = createDefaultDb();
    return { ...defaults, ...settings, events };

  } catch (e) {
    console.error("Critical DB Error:", e);
    return createDefaultDb();
  }
}

async function saveDb(data) {
  // Update cache immediately (Source of truth for the session)
  dbCache = data;

  try {
    const db = await getDbConnection();

    // Save Settings
    const settingsToSave = { ...data };
    delete settingsToSave.events;

    const settingsStmt = await db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    for (const [key, value] of Object.entries(settingsToSave)) {
      if (value !== undefined && value !== null) {
        await settingsStmt.run(key, String(value));
      }
    }
    await settingsStmt.finalize();

    // Save Events (Sync approach: Insert or Update all, Delete missing)
    if (Array.isArray(data.events)) {
      // Get current IDs in DB
      const existingIds = (await db.all('SELECT id FROM events')).map(r => r.id);
      const newIds = data.events.map(e => e.id);

      // Delete removed events
      const idsToDelete = existingIds.filter(id => !newIds.includes(id));
      if (idsToDelete.length > 0) {
        const placeholders = idsToDelete.map(() => '?').join(',');
        await db.run(`DELETE FROM events WHERE id IN (${placeholders})`, idsToDelete);
      }

      // Upsert current events
      const eventStmt = await db.prepare('INSERT OR REPLACE INTO events (id, data, created_at) VALUES (?, ?, ?)');
      const registrantStmt = await db.prepare(
        'INSERT OR REPLACE INTO registrants (id, event_id, email_normalized, data, registered_at) VALUES (?, ?, ?, ?, ?)'
      );
      for (const event of data.events) {
        const sanitizedEvent = { ...event };
        delete sanitizedEvent.registrants;
        await eventStmt.run(event.id, JSON.stringify(sanitizedEvent), event.createdAt || Date.now());

        await db.run('DELETE FROM registrants WHERE event_id = ?', event.id);
        const registrants = Array.isArray(event.registrants) ? event.registrants : [];
        for (const registrant of registrants) {
          const emailNormalized = normalizeEmail(registrant.email);
          if (!emailNormalized) continue;
          const registrantId = registrant.id || generateId();
          const registeredAt = registrant.registeredAt || Date.now();
          await registrantStmt.run(
            registrantId,
            event.id,
            emailNormalized,
            JSON.stringify({ ...registrant, id: registrantId, registeredAt }),
            registeredAt
          );
        }
      }
      await eventStmt.finalize();
      await registrantStmt.finalize();
    }

  } catch (e) {
    console.error("SQLite Save Error:", e);
  }
}

// --- ROUTES ---

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'online', timestamp: Date.now() });
});

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function isLikelyGeminiApiKey(key) {
  const value = String(key || '').trim();
  return /^AIza[0-9A-Za-z_-]{20,}$/.test(value);
}

function normalizeUserRole(role) {
  const value = String(role || '').trim().toLowerCase();
  return value === 'admin' ? 'admin' : 'organizer';
}

function getAppOrigin(req) {
  if (process.env.APP_BASE_URL) {
    return String(process.env.APP_BASE_URL).replace(/\/+$/, '');
  }
  return `${req.protocol}://${req.get('host')}`;
}

function getOAuthProviders(req) {
  const appOrigin = getAppOrigin(req);
  const microsoftTenant = process.env.OAUTH_MICROSOFT_TENANT_ID || 'common';
  const providers = [
    {
      id: 'google',
      label: 'Google',
      clientId: process.env.OAUTH_GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.OAUTH_GOOGLE_CLIENT_SECRET || '',
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      userInfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
      scopes: ['openid', 'profile', 'email'],
      usePkce: true
    },
    {
      id: 'microsoft',
      label: 'Microsoft',
      clientId: process.env.OAUTH_MICROSOFT_CLIENT_ID || '',
      clientSecret: process.env.OAUTH_MICROSOFT_CLIENT_SECRET || '',
      authUrl: `https://login.microsoftonline.com/${microsoftTenant}/oauth2/v2.0/authorize`,
      tokenUrl: `https://login.microsoftonline.com/${microsoftTenant}/oauth2/v2.0/token`,
      userInfoUrl: 'https://graph.microsoft.com/oidc/userinfo',
      scopes: ['openid', 'profile', 'email'],
      usePkce: true
    },
    {
      id: 'linkedin',
      label: 'LinkedIn',
      clientId: process.env.OAUTH_LINKEDIN_CLIENT_ID || '',
      clientSecret: process.env.OAUTH_LINKEDIN_CLIENT_SECRET || '',
      authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
      tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
      userInfoUrl: 'https://api.linkedin.com/v2/userinfo',
      scopes: ['openid', 'profile', 'email'],
      usePkce: false
    },
    {
      id: 'facebook',
      label: 'Facebook',
      clientId: process.env.OAUTH_FACEBOOK_CLIENT_ID || '',
      clientSecret: process.env.OAUTH_FACEBOOK_CLIENT_SECRET || '',
      authUrl: 'https://www.facebook.com/v20.0/dialog/oauth',
      tokenUrl: 'https://graph.facebook.com/v20.0/oauth/access_token',
      userInfoUrl: 'https://graph.facebook.com/me?fields=id,name,email',
      scopes: ['email', 'public_profile'],
      usePkce: false
    },
    {
      id: 'apple',
      label: 'Apple',
      clientId: process.env.OAUTH_APPLE_CLIENT_ID || '',
      clientSecret: process.env.OAUTH_APPLE_CLIENT_SECRET || '',
      authUrl: 'https://appleid.apple.com/auth/authorize',
      tokenUrl: 'https://appleid.apple.com/auth/token',
      userInfoUrl: '',
      scopes: ['name', 'email'],
      usePkce: false
    }
  ];

  return providers.map((provider) => ({
    ...provider,
    redirectUri: `${appOrigin}/api/auth/oauth/${provider.id}/callback`,
    enabled: Boolean(provider.clientId && provider.clientSecret)
  }));
}

function getOAuthProvider(req, providerId) {
  const providers = getOAuthProviders(req);
  return providers.find((p) => p.id === String(providerId || '').toLowerCase()) || null;
}

function sanitizeNextPath(nextPath) {
  const next = String(nextPath || '').trim();
  if (!next.startsWith('/') || next.startsWith('//')) {
    return '/';
  }
  return next;
}

async function exchangeOAuthCodeForToken(provider, code, codeVerifier) {
  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('client_id', provider.clientId);
  body.set('client_secret', provider.clientSecret);
  body.set('code', code);
  body.set('redirect_uri', provider.redirectUri);
  if (provider.usePkce && codeVerifier) {
    body.set('code_verifier', codeVerifier);
  }

  const response = await axios.post(provider.tokenUrl, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    validateStatus: () => true
  });

  if (response.status < 200 || response.status >= 300) {
    const detail = typeof response.data === 'string' ? response.data : JSON.stringify(response.data || {});
    throw new Error(`OAuth token exchange failed (${response.status}): ${detail.slice(0, 300)}`);
  }

  return response.data || {};
}

function decodeJwtPayloadWithoutVerify(jwt) {
  const parts = String(jwt || '').split('.');
  if (parts.length !== 3) {
    return null;
  }
  return decodeBase64UrlJson(parts[1]);
}

async function fetchOAuthUserProfile(provider, tokenData) {
  const idTokenPayload = decodeJwtPayloadWithoutVerify(tokenData.id_token);
  let profile = null;
  if (provider.userInfoUrl && tokenData.access_token) {
    const response = await axios.get(provider.userInfoUrl, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
      validateStatus: () => true
    });
    if (response.status >= 200 && response.status < 300) {
      profile = response.data || {};
    }
  }

  const raw = profile || idTokenPayload || {};
  const subject = raw.sub || raw.id || raw.user_id;
  const email = raw.email || idTokenPayload?.email || '';
  const displayName = raw.name || [raw.given_name, raw.family_name].filter(Boolean).join(' ') || '';
  const firstName = raw.given_name || splitDisplayName(displayName).firstName;
  const lastName = raw.family_name || splitDisplayName(displayName).lastName;

  return {
    subject: String(subject || '').trim(),
    email: String(email || '').trim(),
    firstName: String(firstName || '').trim(),
    lastName: String(lastName || '').trim()
  };
}

app.post('/api/auth/email-status', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim();
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    const db = await getDbConnection();
    const user = await db.get(
      `SELECT id, password_hash, email_verified_at
       FROM users
       WHERE email_normalized = ?`,
      normalizeEmail(email)
    );
    return res.json({
      exists: Boolean(user?.id),
      hasPassword: Boolean(user?.password_hash),
      emailVerified: Boolean(user?.email_verified_at)
    });
  } catch (error) {
    console.error('email-status error:', error);
    return res.status(500).json({ error: 'Failed to check email status' });
  }
});

app.post('/api/auth/request-magic-link', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim();
    const emailNormalized = normalizeEmail(email);
    const modeRaw = String(req.body?.mode || '').trim().toLowerCase();
    const mode = modeRaw === 'login' ? 'login' : 'signup';
    const firstName = String(req.body?.firstName || '').trim();
    const lastName = String(req.body?.lastName || '').trim();
    const organizationName = String(req.body?.organizationName || '').trim();
    const rawPassword = String(req.body?.password || '');

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (rawPassword && !isStrongEnoughPassword(rawPassword)) {
      return res.status(400).json({ error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` });
    }

    const now = Date.now();
    const db = await getDbConnection();
    let user = await db.get(
      'SELECT id, first_name, last_name, organization_name FROM users WHERE email_normalized = ?',
      emailNormalized
    );
    if (mode === 'login' && !user?.id) {
      return res.status(404).json({ error: 'Email is not registered. Create an account first.' });
    }
    if (mode === 'signup') {
      const userId = generateId();
      await db.run(
        `INSERT INTO users (id, email, email_normalized, first_name, last_name, organization_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(email_normalized) DO UPDATE SET
           email = excluded.email,
           first_name = CASE WHEN excluded.first_name <> '' THEN excluded.first_name ELSE users.first_name END,
           last_name = CASE WHEN excluded.last_name <> '' THEN excluded.last_name ELSE users.last_name END,
           organization_name = CASE WHEN excluded.organization_name <> '' THEN excluded.organization_name ELSE users.organization_name END,
           updated_at = excluded.updated_at`,
        userId,
        email,
        emailNormalized,
        firstName,
        lastName,
        organizationName,
        now,
        now
      );
      user = await db.get('SELECT id FROM users WHERE email_normalized = ?', emailNormalized);
    }
    if (!user?.id) {
      return res.status(500).json({ error: 'Failed to prepare user record' });
    }

    if (mode === 'signup' && rawPassword) {
      await db.run(
        'UPDATE users SET password_hash = ?, password_updated_at = ?, updated_at = ? WHERE id = ?',
        hashPassword(rawPassword),
        now,
        now,
        user.id
      );
    }

    await db.run('DELETE FROM magic_links WHERE email_normalized = ?', emailNormalized);

    const rawToken = generateSecretToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = now + (MAGIC_LINK_TTL_MINUTES * 60 * 1000);
    await db.run(
      'INSERT INTO magic_links (token_hash, user_id, email_normalized, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
      tokenHash,
      user.id,
      emailNormalized,
      expiresAt,
      now
    );

    const origin = req.get('origin') || `${req.protocol}://${req.get('host')}`;
    const magicLinkUrl = `${origin}/auth/verify?token=${encodeURIComponent(rawToken)}`;

    const settings = await getDb();
    const relay = getConfiguredEmailRelay(settings);
    let delivery = 'mock';
    let warning = '';

    if (relay.provider !== 'none') {
      try {
        await sendEmailWithRelay(settings, {
          to: email,
          from: settings.smtp2goFrom || settings.smtpFrom || undefined,
          subject: 'Your EventBuilder AI sign-in link',
          html: `
            <p>Hello${firstName ? ` ${firstName}` : ''},</p>
            <p>Use this secure magic link to sign in:</p>
            <p><a href="${magicLinkUrl}">Sign in to EventBuilder AI</a></p>
            <p>This link expires in ${MAGIC_LINK_TTL_MINUTES} minutes.</p>
          `
        });
        delivery = relay.provider;
      } catch (emailError) {
        if (IS_PRODUCTION && !ALLOW_MOCK_EMAIL_FALLBACK) {
          throw emailError;
        }
        warning = emailError instanceof Error ? emailError.message : 'Email delivery failed';
        console.warn('Email delivery failed; using magic-link debug fallback:', warning);
        console.log(`[MAGIC LINK] ${email} -> ${magicLinkUrl}`);
      }
    } else {
      console.log(`[MAGIC LINK] ${email} -> ${magicLinkUrl}`);
    }

    const shouldIncludeDebugLink = MAGIC_LINK_DEBUG_LINKS || !IS_PRODUCTION || delivery === 'mock';
    return res.json({
      success: true,
      delivery,
      ...(warning ? { warning } : {}),
      ...(shouldIncludeDebugLink ? { debugMagicLinkUrl: magicLinkUrl } : {})
    });
  } catch (error) {
    console.error('request-magic-link error:', error);
    return res.status(500).json({ error: 'Failed to send magic link' });
  }
});

app.post('/api/auth/verify-magic-link', async (req, res) => {
  try {
    const rawToken = String(req.body?.token || '').trim();
    if (!rawToken) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const now = Date.now();
    const db = await getDbConnection();
    const tokenHash = hashToken(rawToken);
    const magicLink = await db.get(
      `SELECT token_hash, user_id
       FROM magic_links
       WHERE token_hash = ?
         AND consumed_at IS NULL
         AND expires_at > ?`,
      tokenHash,
      now
    );

    if (!magicLink) {
      return res.status(401).json({ error: 'Invalid or expired magic link' });
    }

    await db.run('UPDATE magic_links SET consumed_at = ? WHERE token_hash = ?', now, tokenHash);
    await db.run(
      'UPDATE users SET email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?',
      now,
      now,
      magicLink.user_id
    );

    await createSessionForUser(magicLink.user_id, req, res);

    const user = await db.get(
      'SELECT id, email, first_name, last_name, organization_name FROM users WHERE id = ?',
      magicLink.user_id
    );

    return res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        organizationName: user.organization_name || ''
      }
    });
  } catch (error) {
    console.error('verify-magic-link error:', error);
    return res.status(500).json({ error: 'Failed to verify magic link' });
  }
});

app.post('/api/auth/login-password', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim();
    const password = String(req.body?.password || '');
    if (!isValidEmail(email) || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const db = await getDbConnection();
    const user = await db.get(
      `SELECT id, email, first_name, last_name, organization_name, password_hash
       FROM users WHERE email_normalized = ?`,
      normalizeEmail(email)
    );
    if (!user?.id || !user.password_hash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    await createSessionForUser(user.id, req, res);
    return res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        organizationName: user.organization_name || ''
      }
    });
  } catch (error) {
    console.error('login-password error:', error);
    return res.status(500).json({ error: 'Failed to sign in with password' });
  }
});

app.post('/api/auth/set-password', async (req, res) => {
  try {
    const sessionAuth = await resolveSessionAuth(req);
    if (!sessionAuth?.user?.id) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const currentPassword = String(req.body?.currentPassword || '');
    const newPassword = String(req.body?.newPassword || '');
    if (!isStrongEnoughPassword(newPassword)) {
      return res.status(400).json({ error: `New password must be at least ${PASSWORD_MIN_LENGTH} characters` });
    }

    const db = await getDbConnection();
    const user = await db.get('SELECT id, password_hash FROM users WHERE id = ?', sessionAuth.user.id);
    if (!user?.id) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.password_hash && !verifyPassword(currentPassword, user.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const now = Date.now();
    await db.run(
      'UPDATE users SET password_hash = ?, password_updated_at = ?, updated_at = ? WHERE id = ?',
      hashPassword(newPassword),
      now,
      now,
      user.id
    );
    return res.json({ success: true });
  } catch (error) {
    console.error('set-password error:', error);
    return res.status(500).json({ error: 'Failed to set password' });
  }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const sessionAuth = await resolveSessionAuth(req);
    if (!sessionAuth) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    return res.json({
      authenticated: true,
      user: sessionAuth.user
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to resolve session' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  try {
    const cookies = parseCookies(req);
    const sessionToken = String(cookies[SESSION_COOKIE_NAME] || '').trim();
    if (sessionToken) {
      const tokenHash = hashToken(sessionToken);
      const db = await getDbConnection();
      await db.run(
        'UPDATE auth_sessions SET revoked_at = ?, last_seen_at = ? WHERE session_token_hash = ? AND revoked_at IS NULL',
        Date.now(),
        Date.now(),
        tokenHash
      );
    }

    appendAuthCookie(res, SESSION_COOKIE_NAME, '', req, {
      maxAgeSeconds: 0,
      expiresAt: new Date(0)
    });
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to logout' });
  }
});

app.get('/api/superadmin/me', async (req, res) => {
  try {
    const sessionAuth = await resolveSuperadminSessionAuth(req);
    if (!sessionAuth) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    return res.json({
      authenticated: true,
      username: String(sessionAuth.actorId || '').replace(/^superadmin:/, '') || 'admin'
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to resolve superadmin session' });
  }
});

app.post('/api/superadmin/login', async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const db = await getDbConnection();
    await ensureSuperadminCredentials(db);
    const credentials = await getSuperadminCredentials(db);
    if (
      !safeEqualString(username, credentials.username) ||
      !credentials.passwordHash ||
      !verifyPassword(password, credentials.passwordHash)
    ) {
      return res.status(401).json({ error: 'Invalid superadmin credentials' });
    }

    await createSuperadminSession(req, res, credentials.username);
    return res.json({ success: true, username: credentials.username });
  } catch (error) {
    console.error('superadmin login error:', error);
    return res.status(500).json({ error: 'Failed to sign in as superadmin' });
  }
});

app.post('/api/superadmin/logout', async (req, res) => {
  try {
    await revokeSuperadminSession(req, res);
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to logout superadmin' });
  }
});

app.post('/api/superadmin/change-credentials', requireSuperadminSessionOnly, async (req, res) => {
  try {
    const currentPassword = String(req.body?.currentPassword || '');
    const newUsername = String(req.body?.newUsername || '').trim();
    const newPassword = String(req.body?.newPassword || '');
    const confirmPassword = String(req.body?.confirmPassword || '');

    if (!currentPassword || !newUsername || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'New password and confirmation do not match' });
    }
    if (!isStrongEnoughPassword(newPassword)) {
      return res.status(400).json({ error: `New password must be at least ${PASSWORD_MIN_LENGTH} characters` });
    }

    const db = await getDbConnection();
    await ensureSuperadminCredentials(db);
    const credentials = await getSuperadminCredentials(db);
    if (!credentials.passwordHash || !verifyPassword(currentPassword, credentials.passwordHash)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', 'superadminUsername', newUsername);
    await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', 'superadminPasswordHash', hashPassword(newPassword));
    await createSuperadminSession(req, res, newUsername);
    return res.json({ success: true, username: newUsername });
  } catch (error) {
    console.error('superadmin change-credentials error:', error);
    return res.status(500).json({ error: 'Failed to change superadmin credentials' });
  }
});

app.get('/api/auth/oauth/providers', (req, res) => {
  const providers = getOAuthProviders(req).map((provider) => ({
    id: provider.id,
    label: provider.label,
    enabled: provider.enabled
  }));
  return res.json({ providers });
});

app.get('/api/auth/oauth/:provider/start', async (req, res) => {
  try {
    const provider = getOAuthProvider(req, req.params.provider);
    if (!provider) {
      return res.status(404).json({ error: 'OAuth provider not found' });
    }
    if (!provider.enabled) {
      return res.status(503).json({ error: `${provider.label} OAuth is not configured` });
    }

    const now = Date.now();
    const stateRaw = randomUrlToken(24);
    const stateHash = hashToken(stateRaw);
    const codeVerifier = provider.usePkce ? randomUrlToken(48) : '';
    const codeChallenge = provider.usePkce
      ? toBase64Url(crypto.createHash('sha256').update(codeVerifier).digest())
      : '';
    const redirectAfter = sanitizeNextPath(req.query.next || '/');

    const db = await getDbConnection();
    await db.run(
      'INSERT INTO oauth_states (state_hash, provider, code_verifier, redirect_after, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      stateHash,
      provider.id,
      codeVerifier,
      redirectAfter,
      now + (OAUTH_STATE_TTL_MINUTES * 60 * 1000),
      now
    );

    const authUrl = new URL(provider.authUrl);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', provider.clientId);
    authUrl.searchParams.set('redirect_uri', provider.redirectUri);
    authUrl.searchParams.set('scope', provider.scopes.join(' '));
    authUrl.searchParams.set('state', stateRaw);
    if (provider.usePkce) {
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
    }

    return res.redirect(authUrl.toString());
  } catch (error) {
    console.error('oauth start error:', error);
    return res.status(500).json({ error: 'Failed to start OAuth sign-in' });
  }
});

app.all('/api/auth/oauth/:provider/callback', async (req, res) => {
  try {
    const provider = getOAuthProvider(req, req.params.provider);
    if (!provider) {
      return res.status(404).send('OAuth provider not found');
    }
    if (!provider.enabled) {
      return res.status(503).send('OAuth provider is not configured');
    }

    const incoming = req.method === 'POST' ? req.body : req.query;
    if (incoming.error) {
      return res.status(401).send(`OAuth error: ${incoming.error}`);
    }

    const code = String(incoming.code || '').trim();
    const stateRaw = String(incoming.state || '').trim();
    if (!code || !stateRaw) {
      return res.status(400).send('Missing OAuth callback parameters');
    }

    const db = await getDbConnection();
    const now = Date.now();
    const stateHash = hashToken(stateRaw);
    const stateRow = await db.get(
      `SELECT state_hash, provider, code_verifier, redirect_after
       FROM oauth_states
       WHERE state_hash = ?
         AND provider = ?
         AND consumed_at IS NULL
         AND expires_at > ?`,
      stateHash,
      provider.id,
      now
    );
    if (!stateRow) {
      return res.status(401).send('Invalid or expired OAuth state');
    }

    await db.run('UPDATE oauth_states SET consumed_at = ? WHERE state_hash = ?', now, stateHash);

    const tokenData = await exchangeOAuthCodeForToken(provider, code, stateRow.code_verifier || '');
    const profile = await fetchOAuthUserProfile(provider, tokenData);
    if (!profile.subject) {
      return res.status(400).send('OAuth profile is missing subject identifier');
    }
    if (!isValidEmail(profile.email)) {
      return res.status(400).send('OAuth provider did not return a valid email');
    }

    const emailNormalized = normalizeEmail(profile.email);
    const userIdCandidate = generateId();
    await db.run(
      `INSERT INTO users (id, email, email_normalized, first_name, last_name, created_at, updated_at, email_verified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(email_normalized) DO UPDATE SET
         email = excluded.email,
         first_name = CASE WHEN excluded.first_name <> '' THEN excluded.first_name ELSE users.first_name END,
         last_name = CASE WHEN excluded.last_name <> '' THEN excluded.last_name ELSE users.last_name END,
         email_verified_at = COALESCE(users.email_verified_at, excluded.email_verified_at),
         updated_at = excluded.updated_at`,
      userIdCandidate,
      profile.email,
      emailNormalized,
      profile.firstName,
      profile.lastName,
      now,
      now,
      now
    );

    const user = await db.get('SELECT id FROM users WHERE email_normalized = ?', emailNormalized);
    if (!user?.id) {
      return res.status(500).send('Failed to resolve authenticated user');
    }

    await db.run(
      `INSERT INTO oauth_accounts (id, user_id, provider, provider_subject, email_normalized, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(provider, provider_subject) DO UPDATE SET
         user_id = excluded.user_id,
         email_normalized = excluded.email_normalized,
         updated_at = excluded.updated_at`,
      generateId(),
      user.id,
      provider.id,
      profile.subject,
      emailNormalized,
      now,
      now
    );

    await createSessionForUser(user.id, req, res);

    const redirectPath = sanitizeNextPath(stateRow.redirect_after || '/');
    return res.redirect(redirectPath);
  } catch (error) {
    console.error('oauth callback error:', error);
    return res.status(500).send('OAuth sign-in failed');
  }
});

app.get('/api/admin/config', async (req, res) => {
  try {
    const db = await getDb();
    const relay = getConfiguredEmailRelay(db);
    res.json({
      defaultProxyUrl: db.defaultProxyUrl || '',
      geminiApiKey: '',
      bigMarkerApiKey: '',
      bigMarkerChannelId: '',
      zoomApiKey: '',
      zoomAccountId: '',
      zoomClientId: '',
      zoomClientSecret: '',
      vimeoApiKey: '',
      smtpHost: db.smtpHost || '',
      smtpPort: db.smtpPort || '',
      smtpUser: db.smtpUser || '',
      smtpFrom: db.smtpFrom || '',
      smtp2goFrom: db.smtp2goFrom || '',
      smtpPass: '',
      smtp2goApiKey: '',

      hasGeminiKey: !!db.geminiApiKey,
      hasBigMarkerKey: !!db.bigMarkerApiKey,
      hasBigMarkerChannelId: !!String(db.bigMarkerChannelId || '').trim(),
      hasZoomKey: !!db.zoomApiKey,
      hasZoomAccountId: !!db.zoomAccountId,
      hasZoomClientId: !!db.zoomClientId,
      hasZoomClientSecret: !!db.zoomClientSecret,
      hasVimeoKey: !!db.vimeoApiKey,
      hasSmtpPass: !!db.smtpPass,
      hasSmtp2goKey: !!db.smtp2goApiKey,
      activeEmailRelay: relay.provider
    });
  } catch (e) {
    res.status(500).json({ error: "Failed to load config" });
  }
});

app.post('/api/admin/config', async (req, res) => {
  try {
    const {
      bigMarkerApiKey, bigMarkerChannelId, zoomApiKey, zoomAccountId, zoomClientId, zoomClientSecret, vimeoApiKey, geminiApiKey, defaultProxyUrl,
      smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom, smtp2goApiKey, smtp2goFrom
    } = req.body;

    const db = await getDb();

    // In production, never allow key updates over insecure transport.
    const allowInsecureLocalKeyUpdates = process.env.ALLOW_INSECURE_LOCAL_ADMIN_UPDATES !== '0';
    const isInsecureRemote = !isHttpsRequest(req) && !(allowInsecureLocalKeyUpdates && isLoopbackRequest(req));
    if (
      IS_PRODUCTION &&
      isInsecureRemote &&
      (
        (geminiApiKey && geminiApiKey !== '********') ||
        (bigMarkerApiKey && bigMarkerApiKey !== '********') ||
        (zoomApiKey && zoomApiKey !== '********') ||
        (zoomAccountId && zoomAccountId !== '********') ||
        (zoomClientId && zoomClientId !== '********') ||
        (zoomClientSecret && zoomClientSecret !== '********') ||
        (vimeoApiKey && vimeoApiKey !== '********') ||
        (smtpPass && smtpPass !== '********') ||
        (smtp2goApiKey && smtp2goApiKey !== '********')
      )
    ) {
      return res.status(400).json({ error: 'Sensitive key updates require HTTPS in production (loopback localhost is allowed).' });
    }

    if (defaultProxyUrl !== undefined) db.defaultProxyUrl = defaultProxyUrl;
    if (smtpHost !== undefined) db.smtpHost = smtpHost;
    if (smtpPort !== undefined) db.smtpPort = smtpPort;
    if (smtpUser !== undefined) db.smtpUser = smtpUser;
    if (smtpFrom !== undefined) db.smtpFrom = smtpFrom;
    if (smtp2goFrom !== undefined) db.smtp2goFrom = smtp2goFrom;
    if (bigMarkerChannelId !== undefined) db.bigMarkerChannelId = String(bigMarkerChannelId || '').trim();

    // Encrypt sensitive fields if changed
    if (bigMarkerApiKey && bigMarkerApiKey !== '********') {
      db.bigMarkerApiKey = encrypt(bigMarkerApiKey.trim());
    }

    const previousZoomAccountId = decryptIfEncrypted(db.zoomAccountId || '');
    const previousZoomClientId = decryptIfEncrypted(db.zoomClientId || '');
    const previousZoomClientSecret = decryptIfEncrypted(db.zoomClientSecret || '');

    if (zoomApiKey && zoomApiKey !== '********') db.zoomApiKey = encrypt(zoomApiKey.trim());
    if (zoomAccountId && zoomAccountId !== '********') db.zoomAccountId = encrypt(zoomAccountId.trim());
    if (zoomClientId && zoomClientId !== '********') db.zoomClientId = encrypt(zoomClientId.trim());
    if (zoomClientSecret && zoomClientSecret !== '********') db.zoomClientSecret = encrypt(zoomClientSecret.trim());

    const updatedZoomAccountId = decryptIfEncrypted(db.zoomAccountId || '');
    const updatedZoomClientId = decryptIfEncrypted(db.zoomClientId || '');
    const updatedZoomClientSecret = decryptIfEncrypted(db.zoomClientSecret || '');
    if (
      previousZoomAccountId !== updatedZoomAccountId ||
      previousZoomClientId !== updatedZoomClientId ||
      previousZoomClientSecret !== updatedZoomClientSecret
    ) {
      clearZoomTokenCache();
    }

    if (vimeoApiKey && vimeoApiKey !== '********') db.vimeoApiKey = encrypt(vimeoApiKey);
    if (geminiApiKey && geminiApiKey !== '********') {
      const key = geminiApiKey.trim();
      if (!isLikelyGeminiApiKey(key)) {
        return res.status(400).json({ error: 'Gemini API key format is invalid.' });
      }
      db.geminiApiKey = encrypt(key);
    }
    if (smtpPass && smtpPass !== '********') db.smtpPass = encrypt(smtpPass);
    if (smtp2goApiKey && smtp2goApiKey !== '********') db.smtp2goApiKey = encrypt(String(smtp2goApiKey).trim());

    await saveDb(db);
    res.json({ success: true });
  } catch (e) {
    console.error("Save config failed:", e);
    res.status(500).json({ error: "Failed to save config" });
  }
});

app.get('/api/admin/users', async (req, res) => {
  try {
    const db = await getDbConnection();
    const users = await db.all(
      `SELECT
         u.id,
         u.email,
         u.role,
         u.first_name,
         u.last_name,
         u.organization_name,
         u.email_verified_at,
         u.password_updated_at,
         u.created_at,
         u.updated_at,
         (
           SELECT count(*)
           FROM auth_sessions s
           WHERE s.user_id = u.id
             AND s.revoked_at IS NULL
             AND s.expires_at > ?
         ) AS active_sessions,
         (
           SELECT group_concat(DISTINCT oa.provider)
           FROM oauth_accounts oa
           WHERE oa.user_id = u.id
         ) AS oauth_providers
       FROM users u
       ORDER BY u.created_at DESC`,
      Date.now()
    );

    return res.json({
      users: users.map((row) => ({
        id: row.id,
        email: row.email,
        role: normalizeUserRole(row.role),
        firstName: row.first_name || '',
        lastName: row.last_name || '',
        organizationName: row.organization_name || '',
        emailVerifiedAt: row.email_verified_at || null,
        hasPassword: Boolean(row.password_updated_at),
        passwordUpdatedAt: row.password_updated_at || null,
        activeSessions: Number(row.active_sessions || 0),
        oauthProviders: String(row.oauth_providers || '')
          .split(',')
          .map((provider) => provider.trim())
          .filter(Boolean),
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null
      }))
    });
  } catch (error) {
    console.error('admin users list error:', error);
    return res.status(500).json({ error: 'Failed to load users' });
  }
});

app.patch('/api/admin/users/:id', async (req, res) => {
  try {
    const userId = String(req.params.id || '').trim();
    if (!userId) {
      return res.status(400).json({ error: 'User id is required' });
    }

    const firstName = String(req.body?.firstName || '').trim();
    const lastName = String(req.body?.lastName || '').trim();
    const organizationName = String(req.body?.organizationName || '').trim();
    const role = normalizeUserRole(req.body?.role);

    const db = await getDbConnection();
    const existing = await db.get('SELECT id FROM users WHERE id = ?', userId);
    if (!existing?.id) {
      return res.status(404).json({ error: 'User not found' });
    }

    const now = Date.now();
    await db.run(
      `UPDATE users
       SET first_name = ?,
           last_name = ?,
           organization_name = ?,
           role = ?,
           updated_at = ?
       WHERE id = ?`,
      firstName,
      lastName,
      organizationName,
      role,
      now,
      userId
    );
    return res.json({ success: true });
  } catch (error) {
    console.error('admin users patch error:', error);
    return res.status(500).json({ error: 'Failed to update user' });
  }
});

app.post('/api/admin/users/:id/revoke-sessions', async (req, res) => {
  try {
    const userId = String(req.params.id || '').trim();
    if (!userId) {
      return res.status(400).json({ error: 'User id is required' });
    }

    const db = await getDbConnection();
    const now = Date.now();
    await db.run(
      `UPDATE auth_sessions
       SET revoked_at = ?, last_seen_at = ?
       WHERE user_id = ?
         AND revoked_at IS NULL`,
      now,
      now,
      userId
    );
    return res.json({ success: true });
  } catch (error) {
    console.error('admin revoke sessions error:', error);
    return res.status(500).json({ error: 'Failed to revoke user sessions' });
  }
});

app.post('/api/admin/users/:id/password', async (req, res) => {
  try {
    const userId = String(req.params.id || '').trim();
    if (!userId) {
      return res.status(400).json({ error: 'User id is required' });
    }

    const clearPassword = Boolean(req.body?.clearPassword);
    const newPassword = String(req.body?.newPassword || '');

    const db = await getDbConnection();
    const user = await db.get('SELECT id FROM users WHERE id = ?', userId);
    if (!user?.id) {
      return res.status(404).json({ error: 'User not found' });
    }

    const now = Date.now();
    if (clearPassword) {
      await db.run(
        'UPDATE users SET password_hash = NULL, password_updated_at = NULL, updated_at = ? WHERE id = ?',
        now,
        userId
      );
    } else {
      if (!isStrongEnoughPassword(newPassword)) {
        return res.status(400).json({ error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` });
      }
      await db.run(
        'UPDATE users SET password_hash = ?, password_updated_at = ?, updated_at = ? WHERE id = ?',
        hashPassword(newPassword),
        now,
        now,
        userId
      );
    }

    // Password changes should invalidate all active sessions.
    await db.run(
      `UPDATE auth_sessions
       SET revoked_at = ?, last_seen_at = ?
       WHERE user_id = ?
         AND revoked_at IS NULL`,
      now,
      now,
      userId
    );

    return res.json({ success: true });
  } catch (error) {
    console.error('admin user password error:', error);
    return res.status(500).json({ error: 'Failed to manage user password' });
  }
});

app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    const userId = String(req.params.id || '').trim();
    if (!userId) {
      return res.status(400).json({ error: 'User id is required' });
    }

    if (userId === 'superadmin') {
      return res.status(400).json({ error: 'Cannot delete superadmin session identity' });
    }

    const db = await getDbConnection();
    const user = await db.get('SELECT id, email FROM users WHERE id = ?', userId);
    if (!user?.id) {
      return res.status(404).json({ error: 'User not found' });
    }

    await db.run('DELETE FROM users WHERE id = ?', userId);
    return res.json({ success: true });
  } catch (error) {
    console.error('admin delete user error:', error);
    return res.status(500).json({ error: 'Failed to delete user' });
  }
});

app.post('/api/admin/test-zoom', async (req, res) => {
  try {
    const db = await getDb();

    const typedToken = String(req.body?.zoomApiKey || '').trim();
    const typedAccountId = String(req.body?.zoomAccountId || '').trim();
    const typedClientId = String(req.body?.zoomClientId || '').trim();
    const typedClientSecret = String(req.body?.zoomClientSecret || '').trim();
    const hasTypedS2S = !!(typedAccountId && typedClientId && typedClientSecret);

    let bearerToken = '';
    let source = 'none';

    if (hasTypedS2S) {
      bearerToken = await getZoomAccessTokenWithS2S(typedAccountId, typedClientId, typedClientSecret, { forceRefresh: true });
      source = 'typed-oauth-s2s';
    } else if (typedToken) {
      bearerToken = typedToken;
      source = 'typed-token';
    } else {
      const resolved = await resolveZoomBearerToken(req, db, { forceRefresh: true });
      bearerToken = resolved.token;
      source = resolved.source;
    }

    if (!bearerToken) {
      return res.status(400).json({
        error: 'Zoom credentials are missing. Provide Account ID + Client ID + Client Secret or API token.'
      });
    }

    const response = await axios.get('https://api.zoom.us/v2/users/me', {
      headers: { Authorization: `Bearer ${bearerToken}` },
      validateStatus: () => true
    });

    if (response.status < 200 || response.status >= 300) {
      const details = typeof response.data === 'string' ? response.data : JSON.stringify(response.data || {});
      return res.status(response.status).json({ error: `Zoom connection failed: ${details.slice(0, 300)}` });
    }

    const user = response.data || {};
    return res.json({
      success: true,
      source,
      user: {
        id: user.id || '',
        email: user.email || '',
        account_id: user.account_id || '',
        type: user.type || ''
      }
    });
  } catch (error) {
    console.error('Zoom test connection error:', error);
    return res.status(500).json({ error: 'Failed to test Zoom connection' });
  }
});

app.post('/api/admin/test-bigmarker', async (req, res) => {
  try {
    const db = await getDb();
    const typedApiKey = String(req.body?.bigMarkerApiKey || '').trim();
    const typedChannelId = String(req.body?.bigMarkerChannelId || '').trim();

    const apiKey = typedApiKey || resolveBigMarkerApiKey(db);
    const channelId = typedChannelId || resolveBigMarkerChannelId(db);
    if (!apiKey) {
      return res.status(400).json({ error: 'BigMarker API key is required.' });
    }

    let response;
    let source = 'conferences';
    if (channelId) {
      source = 'channel';
      response = await axios.get(
        `https://www.bigmarker.com/api/v1/channels/${encodeURIComponent(channelId)}`,
        {
          headers: {
            'API-KEY': apiKey,
            Accept: 'application/json',
            'User-Agent': 'EventBuilder-AI-Server/1.0'
          },
          validateStatus: () => true
        }
      );
    } else {
      response = await axios.get('https://www.bigmarker.com/api/v1/conferences?page=1&per_page=1', {
        headers: {
          'API-KEY': apiKey,
          Accept: 'application/json',
          'User-Agent': 'EventBuilder-AI-Server/1.0'
        },
        validateStatus: () => true
      });
    }

    if (response.status < 200 || response.status >= 300) {
      const details = typeof response.data === 'string' ? response.data : JSON.stringify(response.data || {});
      return res.status(response.status).json({ error: `BigMarker connection failed: ${details.slice(0, 300)}` });
    }

    return res.json({
      success: true,
      source,
      channelId: channelId || null
    });
  } catch (error) {
    console.error('BigMarker test connection error:', error);
    return res.status(500).json({ error: 'Failed to test BigMarker connection' });
  }
});

app.get('/api/admin/bigmarker/channels', async (req, res) => {
  try {
    const db = await getDb();
    const typedApiKey = String(req.query?.apiKey || '').trim();
    const queryName = String(req.query?.name || '').trim();
    const apiKey = typedApiKey || resolveBigMarkerApiKey(db);

    if (!apiKey) {
      return res.status(400).json({ error: 'BigMarker API key is required.' });
    }

    const response = await axios.get('https://www.bigmarker.com/api/v1/channels/', {
      headers: {
        'API-KEY': apiKey,
        Accept: 'application/json',
        'User-Agent': 'EventBuilder-AI-Server/1.0'
      },
      validateStatus: () => true
    });

    if (response.status < 200 || response.status >= 300) {
      const details = typeof response.data === 'string' ? response.data : JSON.stringify(response.data || {});
      return res.status(response.status).json({ error: `BigMarker channel lookup failed: ${details.slice(0, 300)}` });
    }

    const channelsRaw = Array.isArray(response.data?.channels) ? response.data.channels : [];
    const channels = channelsRaw.map((channel) => ({
      channel_id: String(channel?.channel_id || '').trim(),
      name: String(channel?.name || '').trim(),
      channel_url: String(channel?.channel_url || '').trim(),
      overview: String(channel?.overview || '').trim()
    })).filter((channel) => channel.channel_id);

    if (!queryName) {
      return res.json({ channels });
    }

    const queryLower = queryName.toLowerCase();
    const exactMatches = channels.filter((channel) => channel.name.toLowerCase() === queryLower);
    const partialMatches = channels.filter((channel) => channel.name.toLowerCase().includes(queryLower));
    const results = exactMatches.length > 0
      ? exactMatches
      : partialMatches;

    return res.json({
      query: queryName,
      total: channels.length,
      matches: results.slice(0, 25)
    });
  } catch (error) {
    console.error('BigMarker channel lookup error:', error);
    return res.status(500).json({ error: 'Failed to find BigMarker channels' });
  }
});

app.post('/api/admin/test-email', async (req, res) => {
  try {
    const { email } = req.body;
    const db = await getDb();
    const relay = getConfiguredEmailRelay(db);
    if (relay.provider === 'none') {
      return res.status(400).json({ error: "No email relay configured. Set SMTP2GO API key or legacy SMTP credentials." });
    }

    await sendEmailWithRelay(db, {
      to: email,
      from: db.smtp2goFrom || db.smtpFrom || undefined,
      subject: "SMTP Configuration Test",
      text: "This is a test email from WebinarHost."
    });

    res.json({ success: true, relay: relay.provider });
  } catch (error) {
    console.error("Test email error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/send-registration-email', async (req, res) => {
  try {
    const { email, name, eventTitle, eventDate, eventTime, customFields } = req.body;
    const db = await getDb();
    const relay = getConfiguredEmailRelay(db);
    if (relay.provider === 'none') {
      console.log(`[MOCK EMAIL] To: ${email}, Subject: ${eventTitle}`);
      return res.json({ success: true, mocked: true });
    }

    const customFieldsHtml = customFields
      ? Object.entries(customFields).map(([k, v]) => `<p><strong>${k}:</strong> ${v}</p>`).join('')
      : '';

    await sendEmailWithRelay(db, {
      to: email,
      from: db.smtp2goFrom || db.smtpFrom || undefined,
      subject: `Confirmed: ${eventTitle}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
          <h2 style="color: #0284c7;">You're In!</h2>
          <p>Hi ${name},</p>
          <p>You are registered for <strong>${eventTitle}</strong>.</p>
          <p><strong>Date:</strong> ${eventDate}<br><strong>Time:</strong> ${eventTime}</p>
          ${customFieldsHtml ? `<br><div>${customFieldsHtml}</div>` : ''}
          <p>Thank you!</p>
        </div>
      `
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Email error:", error);
    res.status(500).json({ error: "Failed to send email" });
  }

});

// --- EVENT ROUTES ---

app.get('/api/events', requireProtectedApiAuth, requireAnyRole(['superadmin', 'admin', 'organizer']), async (req, res) => {
  try {
    const db = await getDb();
    res.json(db.events || []);
  } catch (e) {
    res.status(500).json({ error: "Failed to load events" });
  }
});

app.post('/api/events', requireProtectedApiAuth, requireAnyRole(['superadmin', 'admin', 'organizer']), async (req, res) => {
  try {
    const newEvent = req.body;
    const db = await getDb();
    db.events = [newEvent, ...(db.events || [])];
    await saveDb(db);
    res.json(newEvent);
  } catch (e) {
    res.status(500).json({ error: "Failed to save event" });
  }
});

app.put('/api/events/:id', requireProtectedApiAuth, requireAnyRole(['superadmin', 'admin', 'organizer']), async (req, res) => {
  try {
    const { id } = req.params;
    const updatedEvent = req.body;
    const db = await getDb();
    const index = (db.events || []).findIndex(e => e.id === id);

    if (index !== -1) {
      db.events[index] = updatedEvent;
      await saveDb(db);
      res.json(updatedEvent);
    } else {
      // Return 404 if not found to allow client to decide whether to create
      res.status(404).json({ error: "Event not found" });
    }
  } catch (e) {
    res.status(500).json({ error: "Failed to update event" });
  }
});

app.delete('/api/events/:id', requireProtectedApiAuth, requireAnyRole(['superadmin', 'admin', 'organizer']), async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    const targetId = String(id).trim();

    const existingEvent = (db.events || []).find((e) => String(e.id).trim() === targetId);
    if (!existingEvent) {
      return res.status(404).json({ error: "Event not found" });
    }

    const integrationType = String(existingEvent?.integrationConfig?.type || '').toLowerCase();
    const zoomMeetingId = String(existingEvent?.integrationConfig?.platformId || '').trim();
    const bigMarkerConferenceId = String(existingEvent?.integrationConfig?.platformId || '').trim();
    if (integrationType === 'zoom' && zoomMeetingId) {
      const zoomDeleteResult = await deleteZoomMeetingById(req, db, zoomMeetingId);
      if (zoomDeleteResult?.deleted !== true) {
        return res.status(502).json({
          error: zoomDeleteResult?.error || 'Failed to delete Zoom meeting',
          meetingId: zoomMeetingId
        });
      }
    }
    if (integrationType === 'bigmarker' && bigMarkerConferenceId) {
      const bigMarkerDeleteResult = await deleteBigMarkerConferenceById(db, bigMarkerConferenceId);
      if (bigMarkerDeleteResult?.deleted !== true) {
        return res.status(502).json({
          error: bigMarkerDeleteResult?.error || 'Failed to delete BigMarker conference',
          conferenceId: bigMarkerConferenceId
        });
      }
    }

    db.events = (db.events || []).filter(e => String(e.id).trim() !== targetId);
    await saveDb(db);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete event" });
  }
});

app.post('/api/events/:id/registrants', async (req, res) => {
  try {
    const { id } = req.params;
    const registrant = req.body; // { id, name, email, ... }
    const emailNormalized = normalizeEmail(registrant.email);
    if (!emailNormalized) {
      return res.status(400).json({ error: "Email is required" });
    }

    const dbConn = await getDbConnection();
    const event = await dbConn.get('SELECT id, data FROM events WHERE id = ?', id);
    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const existing = await dbConn.get(
      'SELECT id FROM registrants WHERE event_id = ? AND email_normalized = ?',
      id,
      emailNormalized
    );
    if (existing) {
      res.json({ success: true, duplicate: true });
      return;
    }

    let eventData = null;
    try {
      eventData = JSON.parse(event.data || '{}');
    } catch (e) {
      eventData = null;
    }
    const integrationType = String(eventData?.integrationConfig?.type || '').toLowerCase();
    const bigMarkerConferenceId = String(eventData?.integrationConfig?.platformId || '').trim();

    let registrationMeta = null;
    if (integrationType === 'bigmarker' && bigMarkerConferenceId) {
      const db = await getDb();
      const syncResult = await registerBigMarkerRegistrantByConferenceId(db, bigMarkerConferenceId, registrant);
      if (syncResult?.synced !== true) {
        return res.status(syncResult?.status || 502).json({
          error: syncResult?.error || 'Failed to register attendee in BigMarker',
          provider: 'bigmarker'
        });
      }
      const providerResponse = syncResult?.providerResponse || {};
      const conferenceSummary = await getBigMarkerConferenceSummaryById(db, bigMarkerConferenceId);
      registrationMeta = {
        provider: 'bigmarker',
        uniqueLink: String(providerResponse?.conference_url || providerResponse?.enter_url || ''),
        conferenceId: conferenceSummary?.conferenceId || bigMarkerConferenceId,
        conferenceTitle: conferenceSummary?.title || String(eventData?.title || ''),
        conferenceStartTime: conferenceSummary?.startTime || '',
        conferenceTimezone: conferenceSummary?.timeZone || '',
        conferenceAddress: conferenceSummary?.conferenceAddress || ''
      };
    }

    const registrantId = registrant.id || generateId();
    const registeredAt = registrant.registeredAt || Date.now();
    const normalizedRegistrant = {
      ...registrant,
      id: registrantId,
      email: String(registrant.email).trim(),
      registeredAt
    };
    await dbConn.run(
      'INSERT INTO registrants (id, event_id, email_normalized, data, registered_at) VALUES (?, ?, ?, ?, ?)',
      registrantId,
      id,
      emailNormalized,
      JSON.stringify(normalizedRegistrant),
      registeredAt
    );
    res.json({
      success: true,
      registration: registrationMeta || undefined
    });
  } catch (e) {
    console.error('Add registrant error:', e);
    res.status(500).json({ error: "Failed to add registrant" });
  }
});

app.post('/api/ai/generate-event', async (req, res) => {
  try {
    const { userPrompt } = req.body;
    if (!userPrompt || !String(userPrompt).trim()) {
      return res.status(400).json({ error: 'userPrompt is required' });
    }

    const ai = await getAiClient();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Generate a detailed professional LIVE STREAM WEBINAR event plan based on this request: "${userPrompt}". 
      
      CRITICAL INSTRUCTIONS:
      1. This IS A VIRTUAL EVENT/WEBINAR. The location must reflect that (e.g., Zoom, Bigmarker).
      2. Ensure the agenda accounts for virtual attention spans (shorter blocks, interactive polls).
      3. Generate 2-4 fictitious but realistic speakers with diverse backgrounds.
      4. Tasks should focus on "tech check", "speaker lighting", "webinar setup", "email sequences".
      5. Budget should focus on "streaming software", "digital ads", "speaker fees" rather than venue catering.
      6. Provide 'imageKeyword' fields that are simple nouns for fetching placeholder images (e.g. use 'laptop' not 'person using laptop').
      
      Output strictly JSON.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: eventSchema,
        temperature: 0.7,
      },
    });

    const text = response.text;
    if (!text) {
      return res.status(502).json({ error: 'No response from AI model' });
    }

    const parsed = JSON.parse(text);
    parsed.id = parsed.id || generateId();
    parsed.createdAt = parsed.createdAt || Date.now();
    res.json(parsed);
  } catch (error) {
    console.error("AI generate-event error:", error);
    const message = String(error?.message || '');
    if (/api key|authentication|permission|unauthorized|invalid/i.test(message)) {
      return res.status(500).json({ error: "Gemini API authentication failed. Update the Gemini API key in SuperAdmin > AI Configuration." });
    }
    if (/quota|rate limit|resource exhausted/i.test(message)) {
      return res.status(429).json({ error: "Gemini quota/rate limit reached. Retry later or check billing/quota limits." });
    }
    res.status(500).json({ error: "Failed to generate event" });
  }
});

app.post('/api/ai/extract-slides-colors', async (req, res) => {
  try {
    const slidesUrl = String(req.body?.slidesUrl || '').trim();
    if (!slidesUrl) {
      return res.status(400).json({ error: 'slidesUrl is required' });
    }
    if (!/^https?:\/\/docs\.google\.com\/presentation\/d\/[^/]+/i.test(slidesUrl)) {
      return res.status(400).json({ error: 'Only Google Slides URLs are supported.' });
    }

    const candidates = resolveGoogleSlidesCandidateUrls(slidesUrl);
    let colors = [];

    for (const candidate of candidates) {
      try {
        const response = await axios.get(candidate, {
          timeout: 10000,
          responseType: candidate.endsWith('/export/pptx') ? 'arraybuffer' : 'text',
          validateStatus: (status) => status >= 200 && status < 500
        });
        if (response.status >= 400) {
          continue;
        }
        const bodyText = Buffer.isBuffer(response.data)
          ? new TextDecoder('utf-8', { fatal: false }).decode(response.data)
          : String(response.data || '');
        colors = extractColorsFromText(bodyText);
        if (colors.length > 0) {
          break;
        }
      } catch (_error) {
        continue;
      }
    }

    return res.json({ colors });
  } catch (error) {
    console.error('extract-slides-colors error:', error);
    return res.status(500).json({ error: 'Failed to extract colors from Google Slides.' });
  }
});

app.post('/api/ai/update-event', async (req, res) => {
  try {
    const { currentPlan, instruction } = req.body;
    if (!currentPlan || !instruction || !String(instruction).trim()) {
      return res.status(400).json({ error: 'currentPlan and instruction are required' });
    }

    const ai = await getAiClient();
    const { websiteHtml, headerImageUrl, ...planWithoutHeavyFields } = currentPlan;
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Current Webinar Plan JSON: ${JSON.stringify(planWithoutHeavyFields)}. 
      
      User Instruction for modification: "${instruction}".
      
      Return the FULLY updated Event Plan JSON structure reflecting the changes requested. 
      Keep existing data that shouldn't change. Maintain the exact same schema.
      Ensure 'speakers' and 'imageKeyword' fields are preserved or updated if relevant.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: eventSchema,
        temperature: 0.4,
      },
    });

    const text = response.text;
    if (!text) {
      return res.status(502).json({ error: 'No response from AI model' });
    }

    const updatedPlan = JSON.parse(text);
    updatedPlan.id = currentPlan.id;
    updatedPlan.createdAt = currentPlan.createdAt;
    if (websiteHtml) updatedPlan.websiteHtml = websiteHtml;
    if (headerImageUrl) updatedPlan.headerImageUrl = headerImageUrl;
    if (currentPlan.integrationConfig) updatedPlan.integrationConfig = currentPlan.integrationConfig;

    updatedPlan.speakers = (updatedPlan.speakers || []).map(s => {
      const existing = (currentPlan.speakers || []).find(ex => ex.id === s.id);
      if (existing && existing.customImageUrl) {
        return { ...s, customImageUrl: existing.customImageUrl };
      }
      return s;
    });

    res.json(updatedPlan);
  } catch (error) {
    console.error("AI update-event error:", error);
    res.status(500).json({ error: "Failed to update event" });
  }
});

app.post('/api/ai/generate-website', async (req, res) => {
  try {
    const { eventPlan, integration } = req.body;
    if (!eventPlan || !integration) {
      return res.status(400).json({ error: 'eventPlan and integration are required' });
    }

    const ai = await getAiClient();
    let integrationInstructions = "";
    const commonScript = `
      <script>
        document.addEventListener('DOMContentLoaded', () => {
          const form = document.querySelector('form');
          if (form) {
            let pendingRegistration = false;
            const submitBtn = form.querySelector('button[type="submit"]') || form.querySelector('button');

            const renderThankYou = (registration = {}) => {
              const uniqueLink = registration.uniqueLink || registration.conferenceAddress || '';
              const conferenceTitle = registration.conferenceTitle || '${String(eventPlan.title || '').replace(/'/g, "\\'")}';
              const conferenceStartTime = registration.conferenceStartTime || '';
              const conferenceTimezone = registration.conferenceTimezone || '';
              let dateLabel = 'Date/time to be announced';
              if (conferenceStartTime) {
                try {
                  const dt = new Date(conferenceStartTime);
                  if (!Number.isNaN(dt.getTime())) {
                    dateLabel = dt.toLocaleString([], {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      timeZone: conferenceTimezone || undefined
                    }) + (conferenceTimezone ? (' (' + conferenceTimezone + ')') : '');
                  }
                } catch (_) {}
              }

              document.body.innerHTML = \`
                <main style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f8fafc;padding:24px;font-family:Inter,system-ui,sans-serif;">
                  <section style="max-width:720px;width:100%;background:white;border-radius:18px;padding:28px;box-shadow:0 18px 50px rgba(15,23,42,0.12);border:1px solid #e2e8f0;">
                    <p style="display:inline-block;background:#dcfce7;color:#166534;font-weight:700;font-size:12px;padding:6px 10px;border-radius:999px;margin:0 0 10px 0;">Registration Confirmed</p>
                    <h1 style="font-size:30px;line-height:1.2;margin:0 0 10px 0;color:#0f172a;">Thank you for registering</h1>
                    <p style="margin:0 0 18px 0;color:#334155;font-size:16px;">You are registered for <strong>\${conferenceTitle}</strong>.</p>
                    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;margin-bottom:14px;">
                      <p style="margin:0 0 8px 0;color:#0f172a;font-weight:700;">Conference Date & Time</p>
                      <p style="margin:0;color:#334155;">\${dateLabel}</p>
                    </div>
                    \${uniqueLink ? \`<div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:12px;padding:14px 16px;">
                      <p style="margin:0 0 8px 0;color:#0c4a6e;font-weight:700;">Your Unique BigMarker Link</p>
                      <a href="\${uniqueLink}" target="_blank" rel="noopener noreferrer" style="word-break:break-all;color:#0369a1;text-decoration:underline;">\${uniqueLink}</a>
                    </div>\` : ''}
                  </section>
                </main>
              \`;
            };

            window.addEventListener('message', (event) => {
              const msg = event && event.data ? event.data : null;
              if (!msg || msg.type !== 'EVENT_REGISTRATION_RESULT' || msg.eventId !== '${eventPlan.id}') {
                return;
              }
              pendingRegistration = false;
              if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerText = 'Register Now';
              }

              if (msg.success) {
                renderThankYou(msg.registration || {});
                return;
              }

              const message = msg.error || 'Registration failed. Please try again.';
              alert(message);
            });

            form.addEventListener('submit', (e) => {
              e.preventDefault();
              if (pendingRegistration) return;
              pendingRegistration = true;
              const formData = new FormData(form);
              const data = Object.fromEntries(formData.entries());
              if (submitBtn) {
                submitBtn.innerText = 'Registering...';
                submitBtn.disabled = true;
              }
              if (window.parent) {
                window.parent.postMessage({
                  type: 'EVENT_REGISTRATION',
                  eventId: '${eventPlan.id}',
                  payload: {
                    ...data,
                    name: data.name || (data['first_name'] + ' ' + data['last_name']),
                    email: data.email,
                  }
                }, '*');
              }

              // If parent does not respond (e.g. standalone mode), show fallback success after timeout.
              window.setTimeout(() => {
                if (!pendingRegistration) return;
                pendingRegistration = false;
                renderThankYou({
                  conferenceTitle: '${String(eventPlan.title || '').replace(/'/g, "\\'")}'
                });
              }, 8000);
            });
          }
        });
      </script>
    `;

    if ((integration.type === 'bigmarker' || integration.type === 'zoom') && Array.isArray(integration.customFields) && integration.customFields.length > 0) {
      const formFieldsHtml = integration.customFields.map(field => {
        if (field.type === 'checkbox') {
          return `
            <div class="flex items-center mb-4">
              <input type="checkbox" name="${field.id}" id="${field.id}" ${field.required ? 'required' : ''} class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-gray-300">
              <label for="${field.id}" class="ml-2 text-sm text-gray-700">${field.label}</label>
            </div>`;
        }
        if (field.type === 'select') {
          const options = Array.isArray(field.options) ? field.options : [];
          const optionsHtml = options.length > 0
            ? options.map((option) => `<option value="${String(option).replace(/"/g, '&quot;')}">${String(option)}</option>`).join('')
            : '<option value="">Select an option</option>';
          return `
            <div class="mb-4">
              <label class="block text-gray-700 text-sm font-bold mb-2" for="${field.id}">
                ${field.label} ${field.required ? '*' : ''}
              </label>
              <select
                class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                id="${field.id}"
                name="${field.id}"
                ${field.required ? 'required' : ''}
              >
                ${field.required ? '<option value="">Select...</option>' : '<option value="">Optional</option>'}
                ${optionsHtml}
              </select>
            </div>`;
        }
        return `
          <div class="mb-4">
            <label class="block text-gray-700 text-sm font-bold mb-2" for="${field.id}">
              ${field.label} ${field.required ? '*' : ''}
            </label>
            <input
              class="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
              id="${field.id}"
              name="${field.id}"
              type="${field.type}"
              ${field.required ? 'required' : ''}
              placeholder="${field.label}"
            >
          </div>`;
      }).join('');

      integrationInstructions = `
        Use the exact HTML below for the Registration Form inside the registration area.
        Do not create your own form fields. Use these pre-configured fields that match the ${integration.type === 'zoom' ? 'Zoom' : 'BigMarker'} API:
        
        <form class="bg-white shadow-md rounded px-8 pt-6 pb-8 mb-4">
           ${formFieldsHtml}
           <div class="flex items-center justify-between">
            <button class="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline w-full" type="button">
              ${integration.type === 'zoom' ? 'Register via Zoom' : 'Save my Spot on BigMarker'}
            </button>
          </div>
        </form>

        Add the script tag provided below at the end of the body.
      `;
    } else if (integration.type === 'zoom') {
      integrationInstructions = `
        Create a registration form that simulates a Zoom Webinar Registration.
        Form fields: First Name (name="first_name"), Last Name (name="last_name"), Email (name="email").
        Button Text: "Register via Zoom".
        Add the script tag provided below at the end of the body.
      `;
    } else if (integration.type === 'bigmarker') {
      integrationInstructions = `
        Create a registration form that simulates a BigMarker Webinar Registration.
        Form fields: First Name (name="first_name"), Last Name (name="last_name"), Email (name="email").
        Button Text: "Save my Spot on BigMarker".
        Add the script tag provided below at the end of the body.
      `;
    } else {
      integrationInstructions = `
        Create a generic "No-Code" email registration form.
        Form fields: Name (name="name"), Email (name="email").
        Button Text: "Register Now".
        Add the script tag provided below at the end of the body.
      `;
    }

    const speakersHtml = (eventPlan.speakers || []).map(s => `
      <div class="bg-white p-6 rounded-xl shadow-md flex flex-col items-center text-center">
        <img src="${s.customImageUrl || `https://i.pravatar.cc/150?u=${s.id}`}" alt="${s.name}" class="w-24 h-24 rounded-full mb-4 object-cover border-4 border-indigo-50">
        <h3 class="text-xl font-bold text-slate-900">${s.name}</h3>
        <p class="text-indigo-600 font-medium mb-2">${s.role}</p>
        <p class="text-slate-600 text-sm">${s.bio}</p>
      </div>
    `).join('');

    const heroImageSrc = eventPlan.headerImageUrl || `https://picsum.photos/seed/${eventPlan.imageKeyword}/1200/600`;
    const agendaSummary = (eventPlan.agenda || []).slice(0, 5).map(i => i.time + ' - ' + i.title).join('; ');
    const agendaSourceText = String(eventPlan.agendaSourceText || '').trim();
    const brandPalette = Array.isArray(eventPlan.brandPalette) ? eventPlan.brandPalette.filter(Boolean).slice(0, 8) : [];
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Design a single-file HTML/Tailwind CSS landing page for this LIVE STREAM WEBINAR.
      
      Event Details:
      Title: ${eventPlan.title}
      Theme: ${eventPlan.theme}
      Date: ${eventPlan.date}
      Description: ${eventPlan.description}
      Tagline: ${eventPlan.marketingTagline}
      Agenda Summary: ${agendaSummary}...
      Agenda Source Upload/Paste: ${agendaSourceText || 'No additional uploaded agenda content provided.'}
      Preferred Brand Colors: ${brandPalette.length > 0 ? brandPalette.join(', ') : 'Infer a clean healthcare palette from theme and uploaded deck context.'}
      
      Integration Requirement:
      ${integrationInstructions}

      Content Requirements:
      1. Hero Section: Headline, Date, and the Registration Form side-by-side or prominent. Use a background image related to '${eventPlan.imageKeyword}'.
      2. Speakers Section: MUST include a specific section titled "Meet the Speakers" that displays these speakers. I will inject the HTML for them, just provide the container structure.
      3. Agenda Section: "What you'll learn".
      4. Footer.

      Technical Requirements:
      - DO NOT use any external CSS files other than Tailwind CDN.
      - Use <script src="https://cdn.tailwindcss.com"></script>
      - Design must be modern, high-conversion, focused on getting people to register.
      - Registration form readability is mandatory: never use white text on white backgrounds.
      - Ensure labels are dark, inputs have white background with dark text, and placeholders are medium gray.
      - If Preferred Brand Colors are provided, use them consistently for primary CTA, accents, and highlights.
      - Use "${heroImageSrc}" for the Hero background image (add overlay for text readability).
      - Return ONLY the raw HTML code. Do not include markdown formatting like \`\`\`html.
      
      Embed this raw HTML for the speakers list into the Speakers Section container:
      ${speakersHtml}

      IMPORTANT: Include this exact script logic at the end of the body for the registration handling:
      ${commonScript}
      `,
    });

    let text = response.text;
    if (!text) {
      return res.status(502).json({ error: 'No response from AI model' });
    }
    text = text.replace(/^```html/, '').replace(/```$/, '').trim();
    text = enforceReadableFormStyles(text);
    res.json({ html: text });
  } catch (error) {
    console.error("AI generate-website error:", error);
    res.status(500).json({ error: "Failed to generate website" });
  }
});

app.post('/api/zoom/create-meeting', async (req, res) => {
  try {
    const {
      title,
      description,
      startTime,
      durationMinutes,
      timezone,
      registrationRequired,
      chatNeeded = true,
      qnaNeeded = true,
      breakoutRoomsNeeded = false,
      recordingNeeded = true
    } = req.body || {};

    const topic = String(title || '').trim();
    if (!topic) {
      return res.status(400).json({ error: 'title is required' });
    }

    const db = await getDb();
    const resolvedToken = await resolveZoomBearerToken(req, db);
    if (!resolvedToken.token) {
      return res.status(400).json({
        error: 'Zoom is not configured. Set Zoom Server-to-Server OAuth (Account ID, Client ID, Client Secret) or Zoom API token in SuperAdmin > API Integrations.'
      });
    }

    const meetingStart = startTime
      ? new Date(startTime).toISOString()
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const meetingDuration = Math.max(15, Number(durationMinutes || 60));
    const tz = String(timezone || 'UTC');
    const needsRegistration = Boolean(registrationRequired);
    const needsChat = Boolean(chatNeeded);
    const needsQna = Boolean(qnaNeeded);
    const needsBreakouts = Boolean(breakoutRoomsNeeded);
    const needsRecording = Boolean(recordingNeeded);

    const buildPayload = (includeAdvanced) => {
      const settings = {
        approval_type: needsRegistration ? 0 : 2,
        registration_type: 1,
        registrants_email_notification: true,
        join_before_host: false,
        auto_recording: needsRecording ? 'cloud' : 'none',
        request_permission_to_unmute_participants: true
      };

      if (needsBreakouts) {
        settings.breakout_room = { enable: true };
      }

      if (includeAdvanced) {
        settings.meeting_chat = { enable: needsChat };
        settings.continuous_meeting_chat = { enable: needsChat };
        settings.question_and_answer = { enable: needsQna };
      }

      return {
        topic,
        type: 2,
        start_time: meetingStart,
        duration: meetingDuration,
        timezone: tz,
        agenda: String(description || ''),
        settings
      };
    };

    const createMeetingWithToken = async (token, payload) => axios.post(
      'https://api.zoom.us/v2/users/me/meetings',
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        validateStatus: () => true
      }
    );

    let usedAdvancedSettings = true;
    let response = await createMeetingWithToken(resolvedToken.token, buildPayload(true));

    // Retry with basic payload if advanced meeting options are rejected by Zoom account/version.
    if (response.status >= 400 && response.status < 500) {
      usedAdvancedSettings = false;
      response = await createMeetingWithToken(resolvedToken.token, buildPayload(false));
    }

    if (response.status === 401 && resolvedToken.source === 'oauth-s2s') {
      const refreshed = await resolveZoomBearerToken(req, db, { forceRefresh: true });
      if (refreshed.token) {
        response = await createMeetingWithToken(refreshed.token, buildPayload(usedAdvancedSettings));
        if (response.status >= 400 && response.status < 500 && usedAdvancedSettings) {
          usedAdvancedSettings = false;
          response = await createMeetingWithToken(refreshed.token, buildPayload(false));
        }
      }
    }

    if (response.status < 200 || response.status >= 300) {
      const details = typeof response.data === 'string' ? response.data : JSON.stringify(response.data || {});
      return res.status(response.status).json({ error: `Zoom meeting creation failed: ${details.slice(0, 300)}` });
    }

    const meeting = response.data || {};
    return res.json({
      id: meeting.id,
      join_url: meeting.join_url,
      start_url: meeting.start_url,
      password: meeting.password || '',
      registration_url: meeting.registration_url || '',
      start_time: meeting.start_time,
      duration: meeting.duration,
      timezone: meeting.timezone,
      options_applied: {
        chatNeeded: usedAdvancedSettings ? needsChat : false,
        qnaNeeded: usedAdvancedSettings ? needsQna : false,
        breakoutRoomsNeeded: needsBreakouts,
        recordingNeeded: needsRecording,
        requestPermissionToUnmuteParticipants: true
      }
    });
  } catch (error) {
    console.error('Zoom create-meeting error:', error);
    return res.status(500).json({ error: 'Failed to create Zoom meeting' });
  }
});

app.post('/api/bigmarker/create-conference', async (req, res) => {
  try {
    const {
      title,
      description,
      startTime,
      timezone,
      channelId,
      registrationRequired = true,
      scheduleType = 'one_time',
      webcastMode = 'webcast',
      audienceRoomLayout = 'classic',
      privacy = 'private',
      durationMinutes = 60
    } = req.body || {};

    const conferenceTitle = String(title || '').trim();
    if (!conferenceTitle) {
      return res.status(400).json({ error: 'title is required' });
    }

    const db = await getDb();
    const apiKey = resolveBigMarkerApiKey(db);
    if (!apiKey) {
      return res.status(400).json({
        error: 'BigMarker is not configured. Set BigMarker API key in SuperAdmin > API Integrations.'
      });
    }
    const resolvedChannelId = String(channelId || resolveBigMarkerChannelId(db) || '').trim();
    if (!resolvedChannelId) {
      return res.status(400).json({
        error: 'BigMarker Channel ID is required. Set it in SuperAdmin > API Integrations.'
      });
    }

    const parsedStart = startTime ? new Date(startTime) : null;
    const startsAt = (parsedStart && Number.isFinite(parsedStart.getTime()))
      ? parsedStart.toISOString()
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const tz = String(timezone || 'UTC');
    const needsRegistration = Boolean(registrationRequired);
    const resolvedScheduleType = ['one_time', 'multiple_times', '24_hour_room'].includes(String(scheduleType))
      ? String(scheduleType)
      : 'one_time';
    const resolvedWebcastMode = ['interactive', 'webcast', 'automatic', 'required', 'optional'].includes(String(webcastMode))
      ? String(webcastMode)
      : 'webcast';
    const resolvedRoomLayout = ['classic', 'modular'].includes(String(audienceRoomLayout))
      ? String(audienceRoomLayout)
      : 'classic';
    const isPublic = String(privacy) === 'public';

    const headers = {
      'API-KEY': apiKey,
      'api-key': apiKey,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'EventBuilder-AI-Server/1.0'
    };

    const durationSafe = Math.max(15, Number(durationMinutes || 60));
    const resolvedWebinarMode = resolvedWebcastMode === 'required' || resolvedWebcastMode === 'webcast'
      ? 'webcast'
      : resolvedWebcastMode === 'optional'
        ? 'interactive'
        : 'interactive';
    const payloadCandidates = [
      {
        channel_id: resolvedChannelId,
        title: conferenceTitle,
        description: String(description || ''),
        starts_at: startsAt,
        timezone: tz
      },
      {
        channel_id: resolvedChannelId,
        title: conferenceTitle,
        description: String(description || ''),
        starts_at: startsAt,
        timezone: tz,
        registration_required: needsRegistration
      },
      {
        channel_id: resolvedChannelId,
        title: conferenceTitle,
        description: String(description || ''),
        starts_at: startsAt,
        timezone: tz,
        registration_required: needsRegistration,
        schedule_type: resolvedScheduleType,
        webcast_mode: resolvedWebcastMode,
        webinar_mode: resolvedWebinarMode,
        audience_room_layout: resolvedRoomLayout,
        is_private: !isPublic,
        duration: durationSafe
      },
      {
        channel_id: resolvedChannelId,
        name: conferenceTitle,
        description: String(description || ''),
        start_time: startsAt,
        time_zone: tz,
        registration_required: needsRegistration,
        schedule_type: resolvedScheduleType,
        webinar_mode: resolvedWebinarMode,
        room_layout: resolvedRoomLayout,
        privacy: isPublic ? 'public' : 'private',
        duration: durationSafe
      },
      {
        channel_id: resolvedChannelId,
        title: conferenceTitle,
        starts_at: startsAt,
        timezone: tz,
        schedule_type: resolvedScheduleType
      }
    ];

    const createUrls = [
      'https://www.bigmarker.com/api/v1/conferences',
      'https://www.bigmarker.com/api/v1/conferences/create'
    ];

    let response = null;
    let lastAttemptMeta = { url: '', payloadIndex: -1 };
    for (const url of createUrls) {
      for (let i = 0; i < payloadCandidates.length; i += 1) {
        const payload = payloadCandidates[i];
        let attempt;
        try {
          attempt = await axios.post(
            url,
            payload,
            {
              headers,
              timeout: 15000,
              validateStatus: () => true
            }
          );
        } catch (requestError) {
          response = null;
          lastAttemptMeta = { url, payloadIndex: i };
          continue;
        }
        response = attempt;
        lastAttemptMeta = { url, payloadIndex: i };
        if (attempt.status >= 200 && attempt.status < 300) {
          break;
        }
        // Stop rotating payload shape on auth/config errors.
        if (attempt.status === 401 || attempt.status === 403) {
          break;
        }
      }
      if (response && response.status >= 200 && response.status < 300) {
        break;
      }
    }

    if (!response || response.status < 200 || response.status >= 300) {
      const details = typeof response?.data === 'string' ? response.data : JSON.stringify(response?.data || {});
      const status = response?.status || 502;
      return res.status(status).json({
        error: `BigMarker conference creation failed: ${details.slice(0, 400)}`,
        debug: {
          attemptedUrl: lastAttemptMeta.url,
          payloadVariant: lastAttemptMeta.payloadIndex
        }
      });
    }

    const conference = response.data || {};
    return res.json({
      id: conference.id,
      title: conference.title || conference.name || conferenceTitle,
      webinar_url: conference.webinar_url || conference.url || '',
      registration_url: conference.registration_url || '',
      starts_at: conference.starts_at || startsAt,
      timezone: conference.timezone || tz,
      channel_id: conference.channel_id || resolvedChannelId,
      options_applied: {
        channelId: resolvedChannelId,
        scheduleType: resolvedScheduleType,
        webcastMode: resolvedWebcastMode,
        audienceRoomLayout: resolvedRoomLayout,
        privacy: isPublic ? 'public' : 'private',
        durationMinutes: Math.max(15, Number(durationMinutes || 60))
      }
    });
  } catch (error) {
    const details = String(error?.message || '');
    const responseStatus = error?.response?.status;
    const responseBody = error?.response?.data;
    const responseDetails = typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody || {});
    console.error('BigMarker create-conference error:', error);
    return res.status(responseStatus || 500).json({
      error: `Failed to create BigMarker conference: ${(details || 'unknown error').slice(0, 180)}`,
      provider: responseDetails ? responseDetails.slice(0, 300) : undefined
    });
  }
});

app.post('/api/zoom/meetings/:meetingId/registrants', async (req, res) => {
  try {
    const meetingId = String(req.params.meetingId || '').trim();
    if (!meetingId) {
      return res.status(400).json({ error: 'meetingId is required' });
    }

    const email = normalizeEmail(req.body?.email);
    const firstName = String(req.body?.first_name || '').trim();
    const lastName = String(req.body?.last_name || '').trim();
    if (!email || !firstName || !lastName) {
      return res.status(400).json({ error: 'email, first_name, and last_name are required' });
    }

    const db = await getDb();
    const resolvedToken = await resolveZoomBearerToken(req, db);
    if (!resolvedToken.token) {
      return res.status(400).json({
        error: 'Zoom is not configured. Set Zoom credentials in SuperAdmin > API Integrations.'
      });
    }

    const payload = {
      email,
      first_name: firstName,
      last_name: lastName
    };
    const customQuestionsInput = Array.isArray(req.body?.custom_questions) ? req.body.custom_questions : [];
    const customQuestions = customQuestionsInput
      .map((item) => ({
        title: String(item?.title || '').trim(),
        value: String(item?.value || '').trim()
      }))
      .filter((item) => item.title && item.value);
    if (customQuestions.length > 0) {
      payload.custom_questions = customQuestions;
    }

    let response = await axios.post(
      `https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}/registrants`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${resolvedToken.token}`,
          'Content-Type': 'application/json'
        },
        validateStatus: () => true
      }
    );

    if (response.status === 401 && resolvedToken.source === 'oauth-s2s') {
      const refreshed = await resolveZoomBearerToken(req, db, { forceRefresh: true });
      if (refreshed.token) {
        response = await axios.post(
          `https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}/registrants`,
          payload,
          {
            headers: {
              Authorization: `Bearer ${refreshed.token}`,
              'Content-Type': 'application/json'
            },
            validateStatus: () => true
          }
        );
      }
    }

    if (response.status < 200 || response.status >= 300) {
      const details = typeof response.data === 'string' ? response.data : JSON.stringify(response.data || {});
      return res.status(response.status).json({ error: `Zoom registration failed: ${details.slice(0, 400)}` });
    }

    return res.json(response.data || { success: true });
  } catch (error) {
    console.error('Zoom register registrant error:', error);
    return res.status(500).json({ error: 'Failed to register attendee in Zoom' });
  }
});

app.get('/api/zoom/meetings/:meetingId/registration-fields', async (req, res) => {
  try {
    const meetingId = String(req.params.meetingId || '').trim();
    if (!meetingId) {
      return res.status(400).json({ error: 'meetingId is required' });
    }

    const db = await getDb();
    const resolvedToken = await resolveZoomBearerToken(req, db);
    if (!resolvedToken.token) {
      return res.status(400).json({
        error: 'Zoom is not configured. Set Zoom credentials in SuperAdmin > API Integrations.'
      });
    }

    const fetchQuestions = async (token) => axios.get(
      `https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}/registrants/questions`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        },
        validateStatus: () => true
      }
    );

    let response = await fetchQuestions(resolvedToken.token);
    if (response.status === 401 && resolvedToken.source === 'oauth-s2s') {
      const refreshed = await resolveZoomBearerToken(req, db, { forceRefresh: true });
      if (refreshed.token) {
        response = await fetchQuestions(refreshed.token);
      }
    }

    if (response.status < 200 || response.status >= 300) {
      const details = typeof response.data === 'string' ? response.data : JSON.stringify(response.data || {});
      return res.status(response.status).json({ error: `Zoom registration questions failed: ${details.slice(0, 400)}` });
    }

    const body = response.data || {};
    return res.json({
      questions: Array.isArray(body.questions) ? body.questions : [],
      custom_questions: Array.isArray(body.custom_questions) ? body.custom_questions : []
    });
  } catch (error) {
    console.error('Zoom registration-fields error:', error);
    return res.status(500).json({ error: 'Failed to load Zoom registration fields' });
  }
});

app.get('/api/zoom/meetings/:meetingId/details', async (req, res) => {
  try {
    const meetingId = String(req.params.meetingId || '').trim();
    if (!meetingId) {
      return res.status(400).json({ error: 'meetingId is required' });
    }

    const db = await getDb();
    const resolvedToken = await resolveZoomBearerToken(req, db);
    if (!resolvedToken.token) {
      return res.status(400).json({
        error: 'Zoom is not configured. Set Zoom credentials in SuperAdmin > API Integrations.'
      });
    }

    const getMeeting = async (token) => axios.get(
      `https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        },
        validateStatus: () => true
      }
    );

    let response = await getMeeting(resolvedToken.token);
    if (response.status === 401 && resolvedToken.source === 'oauth-s2s') {
      const refreshed = await resolveZoomBearerToken(req, db, { forceRefresh: true });
      if (refreshed.token) {
        response = await getMeeting(refreshed.token);
      }
    }

    if (response.status < 200 || response.status >= 300) {
      const details = typeof response.data === 'string' ? response.data : JSON.stringify(response.data || {});
      return res.status(response.status).json({ error: `Zoom meeting lookup failed: ${details.slice(0, 300)}` });
    }

    const meeting = response.data || {};
    return res.json({
      id: meeting.id || meetingId,
      topic: meeting.topic || '',
      host_id: meeting.host_id || '',
      start_time: meeting.start_time || '',
      duration: Number(meeting.duration || 0),
      timezone: meeting.timezone || '',
      join_url: meeting.join_url || '',
      start_url: meeting.start_url || '',
      registration_url: meeting.registration_url || '',
      status: meeting.status || '',
      settings: meeting.settings || {}
    });
  } catch (error) {
    console.error('Zoom meeting details error:', error);
    return res.status(500).json({ error: 'Failed to load Zoom meeting details' });
  }
});

app.get('/api/bigmarker/conferences/:conferenceId/details', async (req, res) => {
  try {
    const conferenceId = String(req.params.conferenceId || '').trim();
    if (!conferenceId) {
      return res.status(400).json({ error: 'conferenceId is required' });
    }

    const db = await getDb();
    const apiKey = resolveBigMarkerApiKey(db);
    if (!apiKey) {
      return res.status(400).json({ error: 'BigMarker is not configured. Set API key in SuperAdmin > API Integrations.' });
    }

    const response = await axios.get(
      `https://www.bigmarker.com/api/v1/conferences/${encodeURIComponent(conferenceId)}`,
      {
        headers: {
          'API-KEY': apiKey,
          Accept: 'application/json',
          'User-Agent': 'EventBuilder-AI-Server/1.0'
        },
        validateStatus: () => true
      }
    );

    if (response.status < 200 || response.status >= 300) {
      const details = typeof response.data === 'string' ? response.data : JSON.stringify(response.data || {});
      return res.status(response.status).json({ error: `BigMarker conference lookup failed: ${details.slice(0, 300)}` });
    }

    const conference = response.data || {};
    return res.json({
      id: conference.id || conferenceId,
      title: conference.title || conference.name || '',
      status: conference.status || '',
      starts_at: conference.starts_at || conference.start_time || '',
      timezone: conference.timezone || '',
      webinar_url: conference.webinar_url || conference.url || '',
      registration_url: conference.registration_url || '',
      host_name: conference.host_name || conference.owner_name || '',
      raw: conference
    });
  } catch (error) {
    console.error('BigMarker conference details error:', error);
    return res.status(500).json({ error: 'Failed to load BigMarker conference details' });
  }
});

// Proxy Routes
app.all('/api/bigmarker/*', async (req, res) => {
  try {
    const db = await getDb();
    const dbKey = decryptIfEncrypted(db.bigMarkerApiKey);
    const envKey = process.env.BIGMARKER_API_KEY;

    let requestKey = req.headers['api-key'] || dbKey || envKey;
    if (requestKey) requestKey = requestKey.trim();

    if (!requestKey) {
      return res.status(401).json({ error: 'Missing API Key' });
    }

    const originalUrl = req.originalUrl || req.url;
    let proxyPath = originalUrl.replace(/^\/api\/bigmarker/i, '');
    if (!proxyPath.startsWith('/')) proxyPath = '/' + proxyPath;
    proxyPath = proxyPath.replace(/^\/+/, '/');

    const targetUrl = `https://www.bigmarker.com${proxyPath}`;
    const data = (req.method === 'GET' || req.method === 'HEAD') ? undefined : req.body;

    const headers = {
      'API-KEY': requestKey,
      'Accept': 'application/json',
      'User-Agent': 'EventBuilder-AI-Proxy/1.0'
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      headers['Content-Type'] = 'application/json';
    }

    const response = await axios({
      method: req.method,
      url: targetUrl,
      headers: headers,
      data: data,
      validateStatus: () => true
    });

    const contentType = response.headers['content-type'] || '';
    if (contentType.includes('application/json') && typeof response.data === 'object') {
      return res.status(response.status).json(response.data);
    } else {
      const rawBody = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      const safeBody = rawBody.length > 500 ? rawBody.substring(0, 500) + '...' : rawBody;
      return res.status(response.status).json({
        error: `BigMarker API Error (${response.status})`,
        details: safeBody
      });
    }
  } catch (e) {
    res.status(500).json({ error: 'Proxy Error: ' + e.message });
  }
});

app.all('/api/zoom/*', async (req, res) => {
  try {
    const db = await getDb();
    let resolvedToken = await resolveZoomBearerToken(req, db);
    if (!resolvedToken.token) return res.status(401).json({ error: 'Missing Zoom credentials' });

    const targetUrl = `https://api.zoom.us/v2${req.path.replace(/^\/api\/zoom/i, '')}`;
    let response = await axios({
      method: req.method,
      url: targetUrl,
      headers: { 'Authorization': `Bearer ${resolvedToken.token}`, 'Content-Type': 'application/json' },
      data: req.body,
      validateStatus: () => true
    });

    if (response.status === 401 && resolvedToken.source === 'oauth-s2s') {
      resolvedToken = await resolveZoomBearerToken(req, db, { forceRefresh: true });
      if (resolvedToken.token) {
        response = await axios({
          method: req.method,
          url: targetUrl,
          headers: { 'Authorization': `Bearer ${resolvedToken.token}`, 'Content-Type': 'application/json' },
          data: req.body,
          validateStatus: () => true
        });
      }
    }
    res.status(response.status).json(response.data);
  } catch (e) {
    res.status(500).json({ error: 'Proxy Error' });
  }
});

// Handle React routing
app.get('*', async (req, res) => {
  try {
    if (APP_API_TOKEN && APP_API_TOKEN_AUTO_COOKIE) {
      appendAuthCookie(res, 'app_api_token', APP_API_TOKEN, req);
    }
    const indexFile = path.join(__dirname, 'dist', 'index.html');
    const html = await fs.readFile(indexFile, 'utf8');
    res.send(html);
  } catch (e) {
    console.error("Error serving index.html:", e);
    res.status(500).send("Error loading application");
  }
});

export { app, appReady };

export async function startServer(port = PORT) {
  await appReady;
  const server = app.listen(port, () => {
    const address = server.address();
    const boundPort = typeof address === 'object' && address ? address.port : port;
    console.log(`\nServer running at http://localhost:${boundPort}`);
  });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  startServer().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}
