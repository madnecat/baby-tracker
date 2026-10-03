// Realistic household rows, written with raw INSERTs exactly as the app of that era stored them
// (details JSON as the web client built it, ISO timestamps, datetime('now')-style created_at).
// Only columns that exist in EVERY historical schema (v2 .. v5) are written, so the same rows can
// be loaded into any of the frozen schema-vN.sql files. Used by upgradeFromProduction.test.js.

export const FIXTURE_DOSE = {
  // Legacy dose without `who` (written before baby medication existed): Mum's, due 14:00Z.
  paracetamolStartedAt: '2026-09-20T08:00:00.000Z',
  paracetamolIntervalHours: 6,
};

/**
 * @param db        better-sqlite3 handle on a database whose schema is already created
 * @param opts.suffix      appended to usernames so households never share a username
 * @param opts.hashes      [bcryptHashForUser1, bcryptHashForUser2]
 * @param opts.validExpiry / expiredExpiry   ISO strings for the two kinds of session
 */
export function populateProductionRows(db, { suffix, hashes, validExpiry, expiredExpiry }) {
  const user = db.prepare(
    `INSERT INTO users (username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?)`
  );
  user.run(`alice-${suffix}`, 'Alice', hashes[0], '2026-08-01 09:00:00');
  user.run(`bob-${suffix}`, 'Bob', hashes[1], '2026-08-01 09:05:00');

  const session = db.prepare(
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`
  );
  session.run(`valid-alice-${suffix}`, 1, '2026-09-01 10:00:00', validExpiry);
  session.run(`valid-bob-${suffix}`, 2, '2026-09-02 10:00:00', validExpiry);
  session.run(`expired-alice-${suffix}`, 1, '2025-01-01 10:00:00', expiredExpiry);

  const token = db.prepare(
    `INSERT INTO api_tokens (user_id, label, token_hash, created_at, last_used_at) VALUES (?, ?, ?, ?, ?)`
  );
  token.run(1, 'Home Assistant', `hash-ha-${suffix}`, '2026-08-15 12:00:00', '2026-09-30 07:00:00');
  token.run(2, 'Claude (MCP)', `hash-mcp-${suffix}`, '2026-09-10 12:00:00', null);

  db.prepare(`INSERT INTO child (id, name, date_of_birth, sex) VALUES (1, ?, ?, ?)`).run(
    'Zoé', '2026-08-02', 'female'
  );

  const event = db.prepare(
    `INSERT INTO events (type, started_at, ended_at, details, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const add = (type, startedAt, endedAt, details, by = 1) =>
    event.run(type, startedAt, endedAt, JSON.stringify(details), by, '2026-09-20 00:00:00', '2026-09-20 00:00:00');

  // medication WITHOUT `who` (the app had no baby medication yet) - names are stored text
  add('medication', FIXTURE_DOSE.paracetamolStartedAt, FIXTURE_DOSE.paracetamolStartedAt,
    { name: 'Paracetamol', doseAmount: 1, doseUnit: 'g', intervalHours: FIXTURE_DOSE.paracetamolIntervalHours });
  add('medication', '2026-09-20T03:00:00.000Z', '2026-09-20T03:00:00.000Z',
    { name: 'Ibuprofen', doseAmount: 400, doseUnit: 'mg', intervalHours: 6 });
  add('medication', '2026-09-19T21:30:00.000Z', '2026-09-19T21:30:00.000Z',
    { name: 'Gaviscon Advance (custom)', doseAmount: null, doseUnit: null, intervalHours: 4 }, 2);
  add('breastfeeding', '2026-09-20T06:00:00.000Z', '2026-09-20T06:18:00.000Z', { side: 'left' });
  add('breastfeeding', '2026-09-20T09:30:00.000Z', '2026-09-20T09:52:00.000Z', { side: 'both' }, 2);
  add('breastfeeding', '2026-09-20T12:00:00.000Z', null, { side: 'right' }); // timer still running
  add('bottle', '2026-09-20T07:15:00.000Z', '2026-09-20T07:15:00.000Z', { volumeMl: 120, contents: 'formula' });
  add('bottle', '2026-09-19T22:00:00.000Z', '2026-09-19T22:00:00.000Z', { volumeMl: 90, contents: 'breast_milk' }, 2);
  add('bottle', '2026-09-19T18:00:00.000Z', '2026-09-19T18:00:00.000Z', { volumeMl: 60, contents: 'mixed' });
  add('diaper', '2026-09-20T05:45:00.000Z', '2026-09-20T05:45:00.000Z', { wet: true, dirty: true, consistency: 'soft' });
  add('diaper', '2026-09-20T08:30:00.000Z', '2026-09-20T08:30:00.000Z', { wet: true, dirty: false, consistency: null }, 2);
  add('sleep', '2026-09-19T20:00:00.000Z', '2026-09-20T01:30:00.000Z', {});
  add('sleep', '2026-09-20T10:00:00.000Z', null, {}); // currently asleep
  add('temperature', '2026-09-20T07:00:00.000Z', '2026-09-20T07:00:00.000Z', { who: 'baby', valueC: 37.2, notes: null });
  add('temperature', '2026-09-20T07:10:00.000Z', '2026-09-20T07:10:00.000Z', { who: 'mom', valueC: 36.8, notes: 'after a shower' }, 2);
  add('contraction', '2026-08-01T22:00:00.000Z', '2026-08-01T22:01:10.000Z', { intensity: 'mild' });
  add('contraction', '2026-08-01T22:09:00.000Z', '2026-08-01T22:10:30.000Z', { intensity: 'strong' });
  add('contraction', '2026-08-01T22:20:00.000Z', null, {}); // unfinished
  add('outing', '2026-09-18T14:00:00.000Z', '2026-09-18T15:30:00.000Z', { location: 'Café Crème, Hampstead', notes: 'first walk' });
  add('outing', '2026-09-19T11:00:00.000Z', null, { location: null, notes: null });

  const growth = db.prepare(
    `INSERT INTO growth_measurements (measured_at, weight_kg, height_cm, head_circumference_cm, notes, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  growth.run('2026-08-02', 3.4, 50, 34.5, 'birth', 1, '2026-08-02 18:00:00');
  growth.run('2026-08-16', 3.7, null, null, 'health visitor', 2, '2026-08-16 11:00:00');
  growth.run('2026-09-13', 4.6, 55.5, 37, null, 1, '2026-09-13 11:00:00');

  const completion = db.prepare(`INSERT INTO milestone_completions (milestone_key, completed_at) VALUES (?, ?)`);
  completion.run('red-book', '2026-08-02 20:00:00');
  completion.run('register-birth', '2026-08-10 09:00:00');
  completion.run('vaccines-8w', '2026-09-27 15:00:00');
  completion.run('growth-spurt-3w', '2026-08-25 08:00:00');

  db.prepare(`INSERT INTO settings (id, hide_contractions) VALUES (1, 1)`).run();
}
