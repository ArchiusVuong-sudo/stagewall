import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

export type DB = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  track           TEXT NOT NULL,
  body            TEXT NOT NULL,
  removed         TEXT NOT NULL DEFAULT '[]',
  display_consent INTEGER NOT NULL CHECK (display_consent = 1),
  recap_consent   INTEGER NOT NULL CHECK (recap_consent IN (0, 1)),
  status          TEXT NOT NULL CHECK (status IN ('screening', 'live', 'held', 'hidden')),
  decided_by      TEXT CHECK (decided_by IN ('policy', 'producer', 'seed')),
  verdict         TEXT,
  screener        TEXT,
  rules_version   INTEGER,
  manage_hash     TEXT UNIQUE,
  created_at      TEXT NOT NULL,
  decided_at      TEXT,
  live_at         TEXT,
  expires_at      TEXT NOT NULL,
  seed            INTEGER NOT NULL DEFAULT 0,
  synthetic       INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS messages_status ON messages (status, live_at);

CREATE TABLE IF NOT EXISTS traces (
  message_id    TEXT PRIMARY KEY REFERENCES messages (id) ON DELETE CASCADE,
  screener      TEXT NOT NULL,
  model         TEXT,
  input         TEXT NOT NULL,
  tool_args     TEXT,
  latency_ms    INTEGER NOT NULL,
  input_tokens  INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd      REAL NOT NULL,
  rules_version INTEGER NOT NULL,
  threshold     REAL NOT NULL,
  policy_status TEXT NOT NULL,
  policy_rule   TEXT NOT NULL,
  error         TEXT,
  created_at    TEXT NOT NULL
);

-- Content-free on purpose: what happened, who did it, when. No text, no ids.
CREATE TABLE IF NOT EXISTS audit (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  actor  TEXT NOT NULL CHECK (actor IN ('fan', 'policy', 'producer', 'retention', 'system')),
  at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS eval_runs (
  id              TEXT PRIMARY KEY,
  screener        TEXT NOT NULL,
  model           TEXT,
  started_at      TEXT NOT NULL,
  duration_ms     INTEGER NOT NULL,
  total           INTEGER NOT NULL,
  correct         INTEGER NOT NULL,
  false_approvals INTEGER NOT NULL,
  false_holds     INTEGER NOT NULL,
  cost_usd        REAL NOT NULL,
  results         TEXT NOT NULL
);
`;

export function dataDir(): string {
  // Runtime path, not a build input: keep the bundler from tracing the whole project.
  return path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR ?? path.join(process.cwd(), "data"));
}

export function dbPath(): string {
  return path.join(dataDir(), "stagewall.db");
}

export function openDb(file: string): DB {
  if (file !== ":memory:") mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  // Deleted rows are overwritten with zeros instead of lingering in free pages.
  db.pragma("secure_delete = ON");
  db.pragma("busy_timeout = 3000");
  db.exec(SCHEMA);
  return db;
}

const g = globalThis as typeof globalThis & { __stagewallDb?: { file: string; db: DB } };

/** One connection per process, kept on globalThis so dev reloads reuse it. */
export function getDb(): DB {
  const file = dbPath();
  if (!g.__stagewallDb || g.__stagewallDb.file !== file || !g.__stagewallDb.db.open) {
    g.__stagewallDb = { file, db: openDb(file) };
  }
  return g.__stagewallDb.db;
}

export function closeDb(): void {
  if (g.__stagewallDb?.db.open) g.__stagewallDb.db.close();
  g.__stagewallDb = undefined;
}

/** Fold the WAL back into the main file and truncate it, so deleted text leaves both. */
export function checkpoint(db: DB): void {
  db.pragma("wal_checkpoint(TRUNCATE)");
}
