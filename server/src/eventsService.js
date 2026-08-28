export const EVENT_TYPES = [
  'diaper',
  'bottle',
  'breastfeeding',
  'contraction',
  'outing',
  'temperature',
  'medication',
  'sleep',
];

export function serializeEvent(row) {
  return {
    id: row.id,
    type: row.type,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    details: JSON.parse(row.details),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listEvents(db, { type, from, to } = {}) {
  const clauses = [];
  const params = [];
  if (type) {
    clauses.push('type = ?');
    params.push(type);
  }
  if (from) {
    clauses.push('started_at >= ?');
    params.push(from);
  }
  if (to) {
    clauses.push('started_at <= ?');
    params.push(to);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return db
    .prepare(`SELECT * FROM events ${where} ORDER BY started_at DESC`)
    .all(...params)
    .map(serializeEvent);
}

export function getActiveEvent(db, type) {
  const row = db
    .prepare(
      `SELECT * FROM events WHERE type = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1`
    )
    .get(type);
  return row ? serializeEvent(row) : null;
}

export function createEvent(db, { type, startedAt, endedAt, details, createdBy }) {
  if (!EVENT_TYPES.includes(type)) {
    throw new Error(`type must be one of ${EVENT_TYPES.join(', ')}`);
  }
  if (!startedAt) {
    throw new Error('startedAt is required');
  }
  const result = db
    .prepare(
      `INSERT INTO events (type, started_at, ended_at, details, created_by)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(type, startedAt, endedAt || null, JSON.stringify(details || {}), createdBy);
  const row = db.prepare(`SELECT * FROM events WHERE id = ?`).get(result.lastInsertRowid);
  return serializeEvent(row);
}

export function getEvent(db, id) {
  const row = db.prepare(`SELECT * FROM events WHERE id = ?`).get(id);
  return row ? serializeEvent(row) : null;
}

export function updateEvent(db, id, { startedAt, endedAt, details } = {}) {
  const existing = db.prepare(`SELECT * FROM events WHERE id = ?`).get(id);
  if (!existing) throw new Error('Event not found');
  const merged = {
    started_at: startedAt !== undefined ? startedAt : existing.started_at,
    ended_at: endedAt !== undefined ? endedAt : existing.ended_at,
    details: details !== undefined ? JSON.stringify(details) : existing.details,
  };
  db.prepare(
    `UPDATE events SET started_at = ?, ended_at = ?, details = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(merged.started_at, merged.ended_at, merged.details, id);
  return serializeEvent(db.prepare(`SELECT * FROM events WHERE id = ?`).get(id));
}

export function deleteEvent(db, id) {
  db.prepare(`DELETE FROM events WHERE id = ?`).run(id);
}
