import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  sender_name TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  list_size INTEGER NOT NULL,
  audience TEXT NOT NULL,
  status TEXT NOT NULL,
  review_json TEXT,
  review_provider TEXT,
  risk_tier TEXT,
  bond_cents INTEGER,
  bond_breakdown_json TEXT,
  paypal_order_id TEXT,
  authorization_id TEXT,
  sent_at INTEGER,
  sim_hours REAL NOT NULL DEFAULT 0,
  settled_at INTEGER,
  settlement_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS personas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  paypal_email TEXT
);
CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  persona_id TEXT NOT NULL,
  reaction TEXT NOT NULL DEFAULT 'none',
  reply_text TEXT,
  reply_json TEXT,
  counts_as_complaint INTEGER NOT NULL DEFAULT 0,
  reacted_at INTEGER,
  UNIQUE (campaign_id, persona_id)
);
CREATE TABLE IF NOT EXISTS payouts (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  persona_id TEXT NOT NULL,
  paypal_email TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  batch_id TEXT,
  item_id TEXT,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  campaign_id TEXT,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  data_json TEXT
);
CREATE TABLE IF NOT EXISTS ai_cache (
  key TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  response TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`;

const globalForDb = globalThis as unknown as { senderbondDb?: DatabaseSync };

export function db(): DatabaseSync {
  if (!globalForDb.senderbondDb) {
    const dir = process.env.DATA_DIR || path.join(process.cwd(), "data");
    mkdirSync(dir, { recursive: true });
    const database = new DatabaseSync(path.join(dir, "senderbond.db"));
    database.exec("PRAGMA journal_mode = WAL;");
    database.exec(SCHEMA);
    globalForDb.senderbondDb = database;
  }
  return globalForDb.senderbondDb;
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export function logEvent(campaignId: string | null, kind: string, message: string, data?: unknown) {
  db()
    .prepare("INSERT INTO events (ts, campaign_id, kind, message, data_json) VALUES (?, ?, ?, ?, ?)")
    .run(Date.now(), campaignId, kind, message, data === undefined ? null : JSON.stringify(data));
}
