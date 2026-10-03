/**
 * SQLite can't ALTER a CHECK constraint in place, so widening the `events.type`
 * allow-list needs a rebuild-and-swap.
 */
function rebuildEventsWithTypes(db, types) {
  const typeList = types.map((t) => `'${t}'`).join(',');
  db.transaction(() => {
    db.exec(`
      CREATE TABLE events_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK (type IN (${typeList})),
        started_at TEXT NOT NULL,
        ended_at TEXT,
        details TEXT NOT NULL DEFAULT '{}',
        created_by INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO events_new SELECT * FROM events;
      DROP TABLE events;
      ALTER TABLE events_new RENAME TO events;
      CREATE INDEX IF NOT EXISTS idx_events_type_started ON events(type, started_at);
      CREATE INDEX IF NOT EXISTS idx_events_started ON events(started_at);
    `);
  })();
}

// Each step is guarded by its own PRAGMA user_version so it only ever runs once
// per household database.
const MIGRATIONS = [
  {
    version: 1,
    run: (db) =>
      rebuildEventsWithTypes(db, [
        'diaper',
        'bottle',
        'breastfeeding',
        'contraction',
        'outing',
        'temperature',
        'medication',
      ]),
    log: 'Migrated events.type to allow medication entries',
  },
  {
    version: 2,
    run: (db) =>
      rebuildEventsWithTypes(db, [
        'diaper',
        'bottle',
        'breastfeeding',
        'contraction',
        'outing',
        'temperature',
        'medication',
        'sleep',
      ]),
    log: 'Migrated events.type to allow sleep entries',
  },
  {
    version: 3,
    run: (db) => {
      // Fresh databases already get this column from schema.sql, so only add it when missing.
      const columns = db.prepare(`PRAGMA table_info(settings)`).all();
      if (!columns.some((c) => c.name === 'hide_baby_medication')) {
        db.exec(`ALTER TABLE settings ADD COLUMN hide_baby_medication INTEGER NOT NULL DEFAULT 0`);
      }
    },
    log: 'Added settings.hide_baby_medication',
  },
  {
    version: 4,
    run: (db) => {
      // The notification_prefs / medication_reminders tables come from schema.sql (CREATE IF NOT
      // EXISTS on every open); only the new settings column needs an explicit ALTER.
      const columns = db.prepare(`PRAGMA table_info(settings)`).all();
      if (!columns.some((c) => c.name === 'mom_user_id')) {
        db.exec(`ALTER TABLE settings ADD COLUMN mom_user_id INTEGER`);
      }
    },
    log: 'Added settings.mom_user_id for email reminders',
  },
  {
    version: 5,
    run: (db) => {
      const columns = db.prepare(`PRAGMA table_info(settings)`).all();
      if (!columns.some((c) => c.name === 'feed_prompt')) {
        db.exec(`ALTER TABLE settings ADD COLUMN feed_prompt INTEGER NOT NULL DEFAULT 1`);
      }
    },
    log: 'Added settings.feed_prompt',
  },
  {
    version: 6,
    run: (db) => {
      const columns = db.prepare(`PRAGMA table_info(users)`).all();
      if (!columns.some((c) => c.name === 'language')) {
        db.exec(`ALTER TABLE users ADD COLUMN language TEXT CHECK (language IN ('en','fr'))`);
      }
      // A reminder language picked in an earlier build is the same preference as the app
      // language now: keep a French choice instead of silently going back to English emails.
      const hasPrefs = db
        .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'notification_prefs'`)
        .get();
      if (hasPrefs) {
        db.exec(
          `UPDATE users SET language = 'fr'
           WHERE language IS NULL
             AND id IN (SELECT user_id FROM notification_prefs WHERE language = 'fr')`
        );
      }
    },
    log: 'Added users.language',
  },
];

export function runMigrations(db) {
  const currentVersion = db.pragma('user_version', { simple: true });
  for (const migration of MIGRATIONS) {
    if (currentVersion >= migration.version) continue;
    migration.run(db);
    db.pragma(`user_version = ${migration.version}`);
    console.log(migration.log);
  }
}
