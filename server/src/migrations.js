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
