function serialize(row) {
  return {
    hideContractions: !!row?.hide_contractions,
    hideBabyMedication: !!row?.hide_baby_medication,
  };
}

export function getSettings(db) {
  return serialize(db.prepare(`SELECT * FROM settings WHERE id = 1`).get());
}

export function setSettings(db, patch) {
  const current = getSettings(db);
  const hideContractions = patch.hideContractions ?? current.hideContractions;
  const hideBabyMedication = patch.hideBabyMedication ?? current.hideBabyMedication;
  db.prepare(
    `INSERT INTO settings (id, hide_contractions, hide_baby_medication) VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       hide_contractions = excluded.hide_contractions,
       hide_baby_medication = excluded.hide_baby_medication`
  ).run(hideContractions ? 1 : 0, hideBabyMedication ? 1 : 0);
  return getSettings(db);
}
