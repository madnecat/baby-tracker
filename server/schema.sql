CREATE TABLE IF NOT EXISTS child (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  date_of_birth TEXT NOT NULL,
  sex TEXT NOT NULL CHECK (sex IN ('male','female'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  -- The person's app language (also used for their reminder emails). NULL = never chosen yet.
  language TEXT CHECK (language IN ('en','fr')),
  -- The person's colour theme (light | dark). NULL = follow the device's setting.
  theme TEXT CHECK (theme IN ('light','dark')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN
    ('diaper','bottle','breastfeeding','contraction','outing','temperature','medication','sleep')),
  started_at TEXT NOT NULL,
  ended_at TEXT,
  details TEXT NOT NULL DEFAULT '{}',
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_type_started ON events(type, started_at);
CREATE INDEX IF NOT EXISTS idx_events_started ON events(started_at);

CREATE TABLE IF NOT EXISTS api_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS milestone_completions (
  milestone_key TEXT PRIMARY KEY,
  completed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  hide_contractions INTEGER NOT NULL DEFAULT 0,
  hide_baby_medication INTEGER NOT NULL DEFAULT 0,
  -- Which parent is Mum; set from the add-on configuration on every boot (never from the web UI).
  mom_user_id INTEGER,
  -- Whether the app asks "How did the feed go?" after a breastfeed is stopped.
  feed_prompt INTEGER NOT NULL DEFAULT 1
);

-- Per-parent email reminder preferences. Off by default; enabled_at is when it was last switched
-- on, so doses that fell due before that never trigger a reminder.
CREATE TABLE IF NOT EXISTS notification_prefs (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 0,
  -- language is no longer used (the recipient's users.language decides); kept so old databases stay valid.
  language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en','fr')),
  enabled_at TEXT
);

-- One row per reminder email actually delivered. No foreign key to events on purpose: the events
-- table is rebuilt-and-swapped by some migrations, which would silently wipe or break a reference.
-- Orphans are purged by the reminder scheduler.
CREATE TABLE IF NOT EXISTS medication_reminders (
  event_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  due_at TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  PRIMARY KEY (event_id, user_id, due_at)
);

CREATE TABLE IF NOT EXISTS growth_measurements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  measured_at TEXT NOT NULL,
  weight_kg REAL,
  height_cm REAL,
  head_circumference_cm REAL,
  notes TEXT,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_growth_measured_at ON growth_measurements(measured_at);

-- Breast-milk bags in the freezer. frozen_on / expires_on are calendar dates (YYYY-MM-DD, household
-- local time); used_at is an instant. `reference` is the number written on the physical bag.
-- No foreign key to events on purpose (events is rebuilt-and-swapped by some migrations).
CREATE TABLE IF NOT EXISTS freezer_bags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference INTEGER NOT NULL CHECK (reference > 0),
  quantity_ml INTEGER NOT NULL CHECK (quantity_ml > 0 AND quantity_ml <= 500),
  frozen_on TEXT NOT NULL,
  expires_on TEXT NOT NULL,
  -- frozen: in the freezer; used: thawed (thawed milk is not tracked any further); expired: past its date or thrown away
  status TEXT NOT NULL DEFAULT 'frozen' CHECK (status IN ('frozen','used','expired')),
  used_at TEXT,
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Two bags in the freezer can't carry the same number (it would make the labels ambiguous).
CREATE UNIQUE INDEX IF NOT EXISTS idx_freezer_frozen_reference ON freezer_bags(reference) WHERE status = 'frozen';
CREATE INDEX IF NOT EXISTS idx_freezer_status_expires ON freezer_bags(status, expires_on);

-- Days on which the daily "bags about to expire" email check has already run (once a day, even
-- across add-on restarts).
CREATE TABLE IF NOT EXISTS freezer_alert_runs (
  run_on TEXT PRIMARY KEY
);
