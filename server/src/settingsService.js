function serialize(row) {
  return { hideContractions: !!row?.hide_contractions };
}

export function getSettings(db) {
  return serialize(db.prepare(`SELECT * FROM settings WHERE id = 1`).get());
}

export function setSettings(db, patch) {
  const current = getSettings(db);
  const hideContractions = patch.hideContractions ?? current.hideContractions;
  db.prepare(
    `INSERT INTO settings (id, hide_contractions) VALUES (1, ?)
     ON CONFLICT(id) DO UPDATE SET hide_contractions = excluded.hide_contractions`
  ).run(hideContractions ? 1 : 0);
  return getSettings(db);
}
