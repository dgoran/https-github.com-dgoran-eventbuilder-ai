
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import path from 'path';
import multer from 'multer';
import fs from 'fs';
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
    bigMarkerApiKey: process.env.BIGMARKER_API_KEY || '',
    zoomApiKey: process.env.ZOOM_API_KEY ? encrypt(process.env.ZOOM_API_KEY) : '',
    vimeoApiKey: process.env.VIMEO_API_KEY ? encrypt(process.env.VIMEO_API_KEY) : '',
    geminiApiKey: process.env.GEMINI_API_KEY ? encrypt(process.env.GEMINI_API_KEY) : '',
    defaultProxyUrl: process.env.DEFAULT_PROXY_URL || '',
    smtpHost: process.env.SMTP_HOST || '',
    smtpPort: process.env.SMTP_PORT || '',
    smtpUser: process.env.SMTP_USER || '',
    smtpPass: process.env.SMTP_PASS ? encrypt(process.env.SMTP_PASS) : '',
    smtpFrom: process.env.SMTP_FROM || '',
    events: [],
    users: []
  };
}

// Cached DB Getter
async function getDb() {
  // Return cache if available
  if (dbCache) return dbCache;

  try {
    // Try to read from disk
    try {
      await fs.promises.access(DB_PATH);
      const data = await fs.promises.readFile(DB_PATH, 'utf8');
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
      await saveDb(dbCache).catch(() => { });
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
    await fs.promises.writeFile(DB_PATH, JSON.stringify(data, null, 2));
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

    // ... existing test-email endpoint ...
    res.json({ success: true });
  } catch (error) {
    console.error("Test email error:", error);
    res.status(500).json({ error: error.message });
  }
});

// --- AUTH ROUTES ---
import session from 'express-session';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as MicrosoftStrategy } from 'passport-microsoft';
import { Strategy as LinkedInStrategy } from 'passport-linkedin-oauth2';

// Session Configuration (for Passport state, though we are stateless via Magic Link flow logic)
app.use(session({
  secret: process.env.ENCRYPTION_KEY || 'keyboard cat',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

app.use(passport.initialize());
app.use(passport.session()); // Persistent login sessions (optional if we just redirect to token)

// Passport Serialization
passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

// Google Strategy
// Only initialize if keys are present to avoid startup crashes
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/api/auth/google/callback"
  },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const db = await getDb();
        if (!db.users) db.users = [];

        const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
        if (!email) return done(new Error("No email found in Google profile"));

        // Find or create user
        let userIndex = db.users.findIndex(u => u.email === email);

        // Generate a fresh token for this "login"
        const token = crypto.randomBytes(32).toString('hex');
        const expires = Date.now() + 3600000; // 1 hour

        if (userIndex === -1) {
          // Create new user
          db.users.push({
            email,
            name: profile.displayName,
            googleId: profile.id,
            token,
            tokenExpires: expires,
            isAuthenticated: true, // They authenticated with Google
            avatar: profile.photos && profile.photos[0] ? profile.photos[0].value : null
          });
        } else {
          // Update existing user
          db.users[userIndex].token = token;
          db.users[userIndex].tokenExpires = expires;
          db.users[userIndex].isAuthenticated = true; // Refresh status
          db.users[userIndex].googleId = profile.id;
          if (!db.users[userIndex].avatar && profile.photos && profile.photos[0]) {
            db.users[userIndex].avatar = profile.photos[0].value;
          }
        }

        await saveDb(db);

        // Return user with the token so we can redirect
        const user = userIndex === -1 ? db.users[db.users.length - 1] : db.users[userIndex];
        return done(null, user);

      } catch (err) {
        return done(err);
      }
    }
  ));
}

// Microsoft Strategy
if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET) {
  passport.use(new MicrosoftStrategy({
    clientID: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    callbackURL: "/api/auth/microsoft/callback",
    scope: ['user.read']
  },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const db = await getDb();
        if (!db.users) db.users = [];

        const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
        if (!email) return done(new Error("No email found in Microsoft profile"));

        let userIndex = db.users.findIndex(u => u.email === email);
        const token = crypto.randomBytes(32).toString('hex');
        const expires = Date.now() + 3600000;

        if (userIndex === -1) {
          db.users.push({
            email,
            name: profile.displayName,
            microsoftId: profile.id,
            token,
            tokenExpires: expires,
            isAuthenticated: true,
            avatar: null
          });
        } else {
          db.users[userIndex].token = token;
          db.users[userIndex].tokenExpires = expires;
          db.users[userIndex].isAuthenticated = true;
          db.users[userIndex].microsoftId = profile.id;
        }
        await saveDb(db);
        const user = userIndex === -1 ? db.users[db.users.length - 1] : db.users[userIndex];
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  ));
}

// LinkedIn Strategy
if (process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET) {
  passport.use(new LinkedInStrategy({
    clientID: process.env.LINKEDIN_CLIENT_ID,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
    callbackURL: "/api/auth/linkedin/callback",
    scope: ['r_emailaddress', 'r_liteprofile']
  },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const db = await getDb();
        if (!db.users) db.users = [];

        const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
        if (!email) return done(new Error("No email found in LinkedIn profile"));

        let userIndex = db.users.findIndex(u => u.email === email);
        const token = crypto.randomBytes(32).toString('hex');
        const expires = Date.now() + 3600000;

        if (userIndex === -1) {
          db.users.push({
            email,
            name: profile.displayName,
            linkedinId: profile.id,
            token,
            tokenExpires: expires,
            isAuthenticated: true,
            avatar: profile.photos && profile.photos[0] ? profile.photos[0].value : null
          });
        } else {
          db.users[userIndex].token = token;
          db.users[userIndex].tokenExpires = expires;
          db.users[userIndex].isAuthenticated = true;
          db.users[userIndex].linkedinId = profile.id;
          if (!db.users[userIndex].avatar && profile.photos && profile.photos[0]) {
            db.users[userIndex].avatar = profile.photos[0].value;
          }
        }
        await saveDb(db);
        const user = userIndex === -1 ? db.users[db.users.length - 1] : db.users[userIndex];
        return done(null, user);
      } catch (err) {
        return done(err);
      }
    }
  ));
}

// Google Auth Handlers
app.get('/api/auth/google', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(500).send("Google Auth not configured on server.");
  }
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

app.get('/api/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    // Successful authentication
    const user = req.user;
    // Redirect to home with token param, reusing the magic link logic
    res.redirect(`/?token=${user.token}`);
  }
);

// Auth Handlers (Microsoft)
app.get('/api/auth/microsoft', (req, res, next) => {
  if (!process.env.MICROSOFT_CLIENT_ID) return res.status(500).send("Microsoft Auth not configured.");
  passport.authenticate('microsoft', { prompt: 'select_account' })(req, res, next);
});

app.get('/api/auth/microsoft/callback',
  passport.authenticate('microsoft', { failureRedirect: '/' }),
  (req, res) => res.redirect(`/?token=${req.user.token}`)
);

// Auth Handlers (LinkedIn)
app.get('/api/auth/linkedin', (req, res, next) => {
  if (!process.env.LINKEDIN_CLIENT_ID) return res.status(500).send("LinkedIn Auth not configured.");
  passport.authenticate('linkedin')(req, res, next);
});

app.get('/api/auth/linkedin/callback',
  passport.authenticate('linkedin', { failureRedirect: '/' }),
  (req, res) => res.redirect(`/?token=${req.user.token}`)
);


app.post('/api/auth/magic-link', async (req, res) => {
  try {
    const { email, firstName, lastName, orgName } = req.body;
    const db = await getDb();

    // Generate token
    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + 3600000; // 1 hour

    // Save user/token to DB (simplistic auth store)
    if (!db.users) db.users = [];

    // Remove existing pending tokens for this email
    db.users = db.users.filter(u => u.email !== email);

    db.users.push({
      email,
      name: `${firstName || ''} ${lastName || ''}`.trim(),
      orgName,
      token,
      tokenExpires: expires,
      isAuthenticated: false
    });

    await saveDb(db);

    const link = `http://localhost:${PORT}/verify?token=${token}`;

    console.log(`[MAGIC LINK] ${link} (For: ${email})`);

    // Send Email if SMTP configured
    if (db.smtpHost && db.smtpUser && db.smtpPass) {
      const smtpPass = decrypt(db.smtpPass);
      const transporter = nodemailer.createTransport({
        host: db.smtpHost,
        port: parseInt(db.smtpPort || '587'),
        secure: parseInt(db.smtpPort) === 465,
        auth: { user: db.smtpUser, pass: smtpPass },
      });

      await transporter.sendMail({
        from: db.smtpFrom || `"${db.smtpUser}" <${db.smtpUser}>`,
        to: email,
        subject: "Your EventBuilder Login Link",
        html: `
            <div style="font-family: sans-serif; padding: 20px;">
               <h2>Welcome to EventBuilder!</h2>
               <p>Click the link below to sign in:</p>
               <a href="${link}" style="display:inline-block; padding: 12px 24px; background: #4f46e5; color: white; text-decoration: none; border-radius: 8px;">Sign In to EventBuilder</a>
               <p style="margin-top:20px; color: #666; font-size: 12px;">Link expires in 1 hour.</p>
            </div>
          `
      });
    }

    res.json({ success: true, message: 'Magic link sent' });

  } catch (e) {
    console.error("Auth error:", e);
    res.status(500).json({ error: "Failed to send magic link" });
  }
});

app.post('/api/auth/verify', async (req, res) => {
  try {
    const { token } = req.body;
    const db = await getDb();

    if (!db.users) {
      return res.status(401).json({ error: "Invalid token" });
    }

    const userIndex = db.users.findIndex(u => u.token === token && u.tokenExpires > Date.now());

    if (userIndex === -1) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    // Mark authenticated and clear token so it can't be reused immediately (optional, or keep for session)
    // For this simple JWT-less flow, we just return success and client sets state.
    const user = db.users[userIndex];
    user.isAuthenticated = true;
    user.token = null; // Consume token

    await saveDb(db);

    res.json({
      success: true,
      user: {
        email: user.email,
        name: user.name,
        orgName: user.orgName,
        isAuthenticated: true
      }
    });

  } catch (e) {
    res.status(500).json({ error: "Verification failed" });
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

// --- FILE UPLOAD ROUTES ---
// --- FILE UPLOAD ROUTES ---

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, 'uploads');
try {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    console.log(`Created uploads directory at: ${UPLOADS_DIR}`);
  } else {
    console.log(`Uploads directory exists at: ${UPLOADS_DIR}`);
  }
} catch (err) {
  console.error("Failed to create uploads dir:", err);
}

// Serve uploads statically
app.use('/uploads', express.static(UPLOADS_DIR));

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    // Sanitize filename and append unique ID
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, uniqueSuffix + '-' + sanitized);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

app.post('/api/events/:id/files', upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const db = await getDb();
    const eventIndex = (db.events || []).findIndex(e => e.id === id);

    if (eventIndex === -1) {
      // Clean up orphaned file
      fs.promises.unlink(req.file.path).catch(() => { });
      return res.status(404).json({ error: "Event not found" });
    }

    const newFile = {
      id: Date.now().toString(),
      name: req.file.originalname,
      type: req.file.mimetype,
      size: req.file.size,
      url: `/uploads/${req.file.filename}`,
      uploadedAt: Date.now()
    };

    if (!db.events[eventIndex].files) db.events[eventIndex].files = [];
    db.events[eventIndex].files.push(newFile);
    await saveDb(db);

    res.json(newFile);
  } catch (e) {
    console.error("Upload error:", e);
    res.status(500).json({ error: "Failed to upload file" });
  }
});

app.delete('/api/events/:id/files/:fileId', async (req, res) => {
  try {
    const { id, fileId } = req.params;
    const db = await getDb();
    const eventIndex = (db.events || []).findIndex(e => e.id === id);

    if (eventIndex !== -1 && db.events[eventIndex].files) {
      const fileIndex = db.events[eventIndex].files.findIndex(f => f.id === fileId);
      if (fileIndex !== -1) {
        const file = db.events[eventIndex].files[fileIndex];
        // Try to delete from disk
        const filePath = path.join(__dirname, 'uploads', path.basename(file.url));
        fs.promises.unlink(filePath).catch(err => console.warn("Failed to delete local file:", err));

        // Remove from DB
        db.events[eventIndex].files.splice(fileIndex, 1);
        await saveDb(db);
      }
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete file" });
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
    let html = await fs.promises.readFile(indexFile, 'utf8');

    // Inject the key into the window object so the React app can read it
    // This allows the app built in Docker (where the key wasn't present) to work at runtime.
    const injection = `<script>window.GEMINI_API_KEY = "${apiKey}";</script>`;

    // Insert before </head>
    html = html.replace('</head>', `${injection}</head>`);

    res.send(html);
  } catch (e) {
    console.error("Error serving index.html:", e);
    res.status(500).send("Error loading application");
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 Server running at http://localhost:${PORT}`);
});
