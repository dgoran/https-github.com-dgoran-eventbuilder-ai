
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import path from 'path';
import { promises as fs } from 'fs';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
const DB_PATH = path.join(__dirname, 'database.json');

// Encryption Configuration
const ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'e1cba1603207319c8075907676972309e1cba1603207319c8075907676972309';

// In-memory cache
let dbCache = null;

// Enable Trust Proxy for Cloud Run / Load Balancers
app.set('trust proxy', true);

app.use(cors());
app.use(express.json({ limit: '10mb' })); // Increased limit for images
app.use(express.static(path.join(__dirname, 'dist')));

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

function createDefaultDb() {
  return {
    bigMarkerApiKey: '',
    zoomApiKey: '',
    vimeoApiKey: '',
    geminiApiKey: '',
    defaultProxyUrl: '',
    smtpHost: '',
    smtpPort: '',
    smtpUser: '',
    smtpPass: '',
    smtpFrom: '',
    events: []
  };
}

// Cached DB Getter
async function getDb() {
  // Return cache if available
  if (dbCache) return dbCache;

  try {
    // Try to read from disk
    try {
      await fs.access(DB_PATH);
      const data = await fs.readFile(DB_PATH, 'utf8');
      if (!data || data.trim() === '') {
        dbCache = createDefaultDb();
      } else {
        try {
          const parsed = JSON.parse(data);
          dbCache = (parsed && typeof parsed === 'object') ? parsed : createDefaultDb();
        } catch (jsonError) {
          console.warn("Database corrupted. Resetting defaults.");
          dbCache = createDefaultDb();
        }
      }
    } catch (err) {
      // File doesn't exist or cannot be accessed
      console.log("Database file not found or inaccessible. Creating new default DB in memory.");
      dbCache = createDefaultDb();
      // Try to save the new default to disk, but don't block if it fails (read-only fs)
      await saveDb(dbCache).catch(() => {}); 
    }
    return dbCache;
  } catch (e) {
    console.error("Critical DB Error:", e);
    return createDefaultDb();
  }
}

async function saveDb(data) {
  // Update cache immediately (Source of truth for the session)
  dbCache = data;
  
  try {
    // Attempt to persist to disk
    await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
  } catch (e) {
    // In Cloud Run or read-only environments, this will fail. 
    // We log it but don't throw, allowing the app to run with in-memory persistence for the session.
    console.warn("Storage Warning: Could not write to database.json. Data will be lost on restart. (This is expected in ephemeral environments without a mounted volume)", e.message);
  }
}

// --- ROUTES ---

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'online', timestamp: Date.now() });
});

app.get('/api/admin/config', async (req, res) => {
  try {
    const db = await getDb();
    res.json({
      defaultProxyUrl: db.defaultProxyUrl || '',
      geminiApiKey: db.geminiApiKey ? '********' : '',
      bigMarkerApiKey: db.bigMarkerApiKey ? '********' : '',
      zoomApiKey: db.zoomApiKey ? '********' : '',
      vimeoApiKey: db.vimeoApiKey ? '********' : '',
      smtpHost: db.smtpHost || '',
      smtpPort: db.smtpPort || '',
      smtpUser: db.smtpUser || '',
      smtpFrom: db.smtpFrom || '',
      smtpPass: db.smtpPass ? '********' : '',

      hasGeminiKey: !!db.geminiApiKey,
      hasBigMarkerKey: !!db.bigMarkerApiKey,
      hasZoomKey: !!db.zoomApiKey,
      hasVimeoKey: !!db.vimeoApiKey,
      hasSmtpPass: !!db.smtpPass
    });
  } catch (e) {
    res.status(500).json({ error: "Failed to load config" });
  }
});

app.post('/api/admin/config', async (req, res) => {
  try {
    const {
      bigMarkerApiKey, zoomApiKey, vimeoApiKey, geminiApiKey, defaultProxyUrl,
      smtpHost, smtpPort, smtpUser, smtpPass, smtpFrom
    } = req.body;

    const db = await getDb();

    if (defaultProxyUrl !== undefined) db.defaultProxyUrl = defaultProxyUrl;
    if (smtpHost !== undefined) db.smtpHost = smtpHost;
    if (smtpPort !== undefined) db.smtpPort = smtpPort;
    if (smtpUser !== undefined) db.smtpUser = smtpUser;
    if (smtpFrom !== undefined) db.smtpFrom = smtpFrom;

    // Encrypt sensitive fields if changed
    if (bigMarkerApiKey && bigMarkerApiKey !== '********') {
      db.bigMarkerApiKey = bigMarkerApiKey.trim();
    }
    
    if (zoomApiKey && zoomApiKey !== '********') db.zoomApiKey = encrypt(zoomApiKey);
    if (vimeoApiKey && vimeoApiKey !== '********') db.vimeoApiKey = encrypt(vimeoApiKey);
    if (geminiApiKey && geminiApiKey !== '********') db.geminiApiKey = encrypt(geminiApiKey);
    if (smtpPass && smtpPass !== '********') db.smtpPass = encrypt(smtpPass);

    await saveDb(db);
    res.json({ success: true });
  } catch (e) {
    console.error("Save config failed:", e);
    res.status(500).json({ error: "Failed to save config" });
  }
});

app.post('/api/admin/test-email', async (req, res) => {
  try {
    const { email } = req.body;
    const db = await getDb();

    if (!db.smtpHost || !db.smtpUser || !db.smtpPass) {
      return res.status(400).json({ error: "SMTP settings incomplete" });
    }

    const smtpPass = decrypt(db.smtpPass);
    const transporter = nodemailer.createTransport({
      host: db.smtpHost,
      port: parseInt(db.smtpPort || '587'),
      secure: parseInt(db.smtpPort) === 465,
      auth: { user: db.smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: db.smtpFrom || `WebinarHost <${db.smtpUser}>`,
      to: email,
      subject: "SMTP Configuration Test",
      text: "This is a test email from WebinarHost.",
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Test email error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/send-registration-email', async (req, res) => {
  try {
    const { email, name, eventTitle, eventDate, eventTime, customFields } = req.body;
    const db = await getDb();

    if (!db.smtpHost || !db.smtpUser || !db.smtpPass) {
      console.log(`[MOCK EMAIL] To: ${email}, Subject: ${eventTitle}`);
      return res.json({ success: true, mocked: true });
    }

    const smtpPass = decrypt(db.smtpPass);
    const transporter = nodemailer.createTransport({
      host: db.smtpHost,
      port: parseInt(db.smtpPort || '587'),
      secure: parseInt(db.smtpPort) === 465,
      auth: { user: db.smtpUser, pass: smtpPass },
    });

    const customFieldsHtml = customFields
      ? Object.entries(customFields).map(([k, v]) => `<p><strong>${k}:</strong> ${v}</p>`).join('')
      : '';

    await transporter.sendMail({
      from: db.smtpFrom || `"${eventTitle} Team" <${db.smtpUser}>`,
      to: email,
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

app.get('/api/events', async (req, res) => {
  try {
    const db = await getDb();
    res.json(db.events || []);
  } catch (e) {
    res.status(500).json({ error: "Failed to load events" });
  }
});

app.post('/api/events', async (req, res) => {
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

app.put('/api/events/:id', async (req, res) => {
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

app.delete('/api/events/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    db.events = (db.events || []).filter(e => e.id !== id);
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
    const db = await getDb();
    const index = (db.events || []).findIndex(e => e.id === id);
    
    if (index !== -1) {
      if (!db.events[index].registrants) db.events[index].registrants = [];
      
      // Prevent duplicates based on email
      if (!db.events[index].registrants.some(r => r.email === registrant.email)) {
        // Generate ID if missing
        if (!registrant.id) registrant.id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        if (!registrant.registeredAt) registrant.registeredAt = Date.now();
        
        db.events[index].registrants.push(registrant);
        await saveDb(db);
      }
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "Event not found" });
    }
  } catch (e) {
    res.status(500).json({ error: "Failed to add registrant" });
  }
});

// Proxy Routes
app.all('/api/bigmarker/*', async (req, res) => {
  try {
    const db = await getDb();
    const dbKey = db.bigMarkerApiKey; 
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
    const globalKey = decrypt(db.zoomApiKey);
    const requestToken = req.headers['authorization'] || (globalKey ? `Bearer ${globalKey}` : null);
    if (!requestToken) return res.status(401).json({ error: 'Missing Zoom Token' });

    const targetUrl = `https://api.zoom.us/v2${req.path.replace(/^\/api\/zoom/i, '')}`;
    const response = await axios({
      method: req.method,
      url: targetUrl,
      headers: { 'Authorization': requestToken, 'Content-Type': 'application/json' },
      data: req.body,
      validateStatus: () => true
    });
    res.status(response.status).json(response.data);
  } catch (e) {
    res.status(500).json({ error: 'Proxy Error' });
  }
});

// Handle React routing
// IMPORTANT: Inject API keys into the frontend at runtime
app.get('*', async (req, res) => {
  try {
    const db = await getDb();
    // Use Cloud Run env var if available, otherwise fallback to DB key (for local dev/admin override)
    // Note: We decrypt the DB key if it exists.
    const apiKey = process.env.GEMINI_API_KEY || (db.geminiApiKey ? decrypt(db.geminiApiKey) : '');
    
    const indexFile = path.join(__dirname, 'dist', 'index.html');
    let html = await fs.readFile(indexFile, 'utf8');
    
    // Inject the key into the window object so the React app can read it
    // This allows the app built in Docker (where the key wasn't present) to work at runtime.
    const injection = `<script>window.GEMINI_API_KEY = "${apiKey}";</script>`;
    
    // Insert before </head>
    html = html.replace('</head>', `${injection}</head>`);
    
    res.send(html);
  } catch(e) {
    console.error("Error serving index.html:", e);
    res.status(500).send("Error loading application");
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 Server running at http://localhost:${PORT}`);
});
