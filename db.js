
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'database.sqlite');

let dbPromise = null;

export const getDbConnection = () => {
    if (!dbPromise) {
        dbPromise = open({
            filename: DB_PATH,
            driver: sqlite3.Database
        });
    }
    return dbPromise;
};

export const initDb = async () => {
    const db = await getDbConnection();

    await db.exec('PRAGMA foreign_keys = ON;');

    // Create Tables
    await db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      data TEXT,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS registrants (
      id TEXT PRIMARY KEY,
      event_id TEXT,
      email_normalized TEXT,
      data TEXT,
      registered_at INTEGER,
      FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT,
      actor_role TEXT,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      ip TEXT,
      user_agent TEXT,
      request_id TEXT,
      duration_ms INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rate_limits (
      scope TEXT NOT NULL,
      key TEXT NOT NULL,
      window_start INTEGER NOT NULL,
      count INTEGER NOT NULL,
      PRIMARY KEY (scope, key)
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      email_normalized TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'organizer',
      first_name TEXT,
      last_name TEXT,
      organization_name TEXT,
      password_hash TEXT,
      password_updated_at INTEGER,
      email_verified_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS magic_links (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      email_normalized TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      consumed_at INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      revoked_at INTEGER,
      created_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS oauth_accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_subject TEXT NOT NULL,
      email_normalized TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(provider, provider_subject),
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS oauth_states (
      state_hash TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      code_verifier TEXT,
      redirect_after TEXT,
      expires_at INTEGER NOT NULL,
      consumed_at INTEGER,
      created_at INTEGER NOT NULL
    );
  `);

    const registrantColumns = await db.all('PRAGMA table_info(registrants)');
    const hasEmailNormalized = registrantColumns.some(col => col.name === 'email_normalized');
    if (!hasEmailNormalized) {
      await db.exec('ALTER TABLE registrants ADD COLUMN email_normalized TEXT');
    }

    const refreshedRegistrantColumns = await db.all('PRAGMA table_info(registrants)');
    const eventIdColumn = refreshedRegistrantColumns.find(col => col.name === 'event_id');
    const emailNormalizedColumn = refreshedRegistrantColumns.find(col => col.name === 'email_normalized');
    const needsRegistrantNotNullMigration =
      !eventIdColumn || !emailNormalizedColumn || Number(eventIdColumn.notnull) !== 1 || Number(emailNormalizedColumn.notnull) !== 1;

    if (needsRegistrantNotNullMigration) {
      await db.exec('BEGIN');
      try {
        await db.exec(`
          CREATE TABLE registrants_new (
            id TEXT PRIMARY KEY,
            event_id TEXT NOT NULL,
            email_normalized TEXT NOT NULL,
            data TEXT,
            registered_at INTEGER,
            FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE
          );
        `);

        await db.exec(`
          INSERT INTO registrants_new (id, event_id, email_normalized, data, registered_at)
          SELECT id, event_id, email_normalized, data, registered_at
          FROM registrants
          WHERE event_id IS NOT NULL
            AND trim(COALESCE(event_id, '')) <> ''
            AND email_normalized IS NOT NULL
            AND trim(COALESCE(email_normalized, '')) <> '';
        `);

        await db.exec('DROP TABLE registrants');
        await db.exec('ALTER TABLE registrants_new RENAME TO registrants');
        await db.exec('COMMIT');
      } catch (migrationError) {
        await db.exec('ROLLBACK');
        throw migrationError;
      }
    }

    await db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_registrants_event_email
      ON registrants (event_id, email_normalized)
      WHERE email_normalized IS NOT NULL AND email_normalized <> ''
    `);
    await db.exec('CREATE INDEX IF NOT EXISTS idx_registrants_event_id ON registrants (event_id)');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at)');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start ON rate_limits (window_start)');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_users_email_normalized ON users (email_normalized)');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_magic_links_email_normalized ON magic_links (email_normalized)');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_magic_links_expires_at ON magic_links (expires_at)');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions (user_id)');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions (expires_at)');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user_id ON oauth_accounts (user_id)');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_oauth_accounts_email_normalized ON oauth_accounts (email_normalized)');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_oauth_states_expires_at ON oauth_states (expires_at)');

    const userColumns = await db.all('PRAGMA table_info(users)');
    const hasPasswordHash = userColumns.some(col => col.name === 'password_hash');
    if (!hasPasswordHash) {
      await db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT');
    }
    const hasRole = userColumns.some(col => col.name === 'role');
    if (!hasRole) {
      await db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'organizer'");
    }
    const hasPasswordUpdatedAt = userColumns.some(col => col.name === 'password_updated_at');
    if (!hasPasswordUpdatedAt) {
      await db.exec('ALTER TABLE users ADD COLUMN password_updated_at INTEGER');
    }
    await db.exec("UPDATE users SET role = 'organizer' WHERE role IS NULL OR trim(COALESCE(role, '')) = ''");
    await db.exec('CREATE INDEX IF NOT EXISTS idx_users_role ON users (role)');
    await db.exec('CREATE INDEX IF NOT EXISTS idx_users_password_updated_at ON users (password_updated_at)');

    await db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_audit_logs_no_update
      BEFORE UPDATE ON audit_logs
      BEGIN
        SELECT RAISE(FAIL, 'audit_logs is append-only');
      END;
    `);
    await db.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_audit_logs_no_delete
      BEFORE DELETE ON audit_logs
      BEGIN
        SELECT RAISE(FAIL, 'audit_logs is append-only');
      END;
    `);

    console.log('SQLite Database Initialized');
    return db;
};
