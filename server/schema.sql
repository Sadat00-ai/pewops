-- PewOps database (Cloudflare D1 / SQLite). Safe to run again: every statement uses IF NOT EXISTS.
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  username_lc TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_login INTEGER,
  save TEXT,
  save_updated INTEGER
);
CREATE TABLE IF NOT EXISTS scores (
  user_id INTEGER NOT NULL,
  mode TEXT NOT NULL,
  score INTEGER NOT NULL,
  kills INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, mode)
);
CREATE INDEX IF NOT EXISTS idx_scores_mode ON scores (mode, score DESC);
CREATE TABLE IF NOT EXISTS devices (
  device_id TEXT PRIMARY KEY,
  first_seen INTEGER NOT NULL,
  first_day TEXT NOT NULL,
  last_seen INTEGER NOT NULL,
  country TEXT,
  platform TEXT,
  version TEXT,
  user_id INTEGER
);
CREATE INDEX IF NOT EXISTS idx_devices_first_day ON devices (first_day);
CREATE INDEX IF NOT EXISTS idx_devices_seen ON devices (last_seen);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  day TEXT NOT NULL,
  device_id TEXT NOT NULL,
  name TEXT NOT NULL,
  mode TEXT,
  value INTEGER
);
CREATE INDEX IF NOT EXISTS idx_events_day ON events (day, name);
CREATE INDEX IF NOT EXISTS idx_events_device ON events (device_id, day);
CREATE TABLE IF NOT EXISTS rate (
  key TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated INTEGER NOT NULL
);
