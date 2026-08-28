function serialize(row) {
  return {
    id: row.id,
    measuredAt: row.measured_at,
    weightKg: row.weight_kg,
    heightCm: row.height_cm,
    headCircumferenceCm: row.head_circumference_cm,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export function listGrowthMeasurements(db) {
  return db
    .prepare(`SELECT * FROM growth_measurements ORDER BY measured_at ASC`)
    .all()
    .map(serialize);
}

export function createGrowthMeasurement(
  db,
  { measuredAt, weightKg, heightCm, headCircumferenceCm, notes, createdBy }
) {
  if (!measuredAt) throw new Error('measuredAt is required');
  const result = db
    .prepare(
      `INSERT INTO growth_measurements
         (measured_at, weight_kg, height_cm, head_circumference_cm, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(measuredAt, weightKg ?? null, heightCm ?? null, headCircumferenceCm ?? null, notes ?? null, createdBy);
  return serialize(db.prepare(`SELECT * FROM growth_measurements WHERE id = ?`).get(result.lastInsertRowid));
}

export function updateGrowthMeasurement(
  db,
  id,
  { measuredAt, weightKg, heightCm, headCircumferenceCm, notes } = {}
) {
  const existing = db.prepare(`SELECT * FROM growth_measurements WHERE id = ?`).get(id);
  if (!existing) throw new Error('Growth measurement not found');
  db.prepare(
    `UPDATE growth_measurements
     SET measured_at = ?, weight_kg = ?, height_cm = ?, head_circumference_cm = ?, notes = ?
     WHERE id = ?`
  ).run(
    measuredAt ?? existing.measured_at,
    weightKg !== undefined ? weightKg : existing.weight_kg,
    heightCm !== undefined ? heightCm : existing.height_cm,
    headCircumferenceCm !== undefined ? headCircumferenceCm : existing.head_circumference_cm,
    notes !== undefined ? notes : existing.notes,
    id
  );
  return serialize(db.prepare(`SELECT * FROM growth_measurements WHERE id = ?`).get(id));
}

export function deleteGrowthMeasurement(db, id) {
  db.prepare(`DELETE FROM growth_measurements WHERE id = ?`).run(id);
}
