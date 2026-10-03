function serialize(row) {
  return {
    hideContractions: !!row?.hide_contractions,
    hideBabyMedication: !!row?.hide_baby_medication,
    // On by default, including before the settings row exists.
    feedPrompt: row ? !!row.feed_prompt : true,
  };
}

export function getSettings(db) {
  return serialize(db.prepare(`SELECT * FROM settings WHERE id = 1`).get());
}

// Only real booleans change a setting; anything else (e.g. the string "false", which is truthy)
// is ignored instead of being stored as "on".
const flag = (value, fallback) => (typeof value === 'boolean' ? value : fallback);

export function setSettings(db, patch) {
  const current = getSettings(db);
  const hideContractions = flag(patch.hideContractions, current.hideContractions);
  const hideBabyMedication = flag(patch.hideBabyMedication, current.hideBabyMedication);
  const feedPrompt = flag(patch.feedPrompt, current.feedPrompt);
  db.prepare(
    `INSERT INTO settings (id, hide_contractions, hide_baby_medication, feed_prompt) VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       hide_contractions = excluded.hide_contractions,
       hide_baby_medication = excluded.hide_baby_medication,
       feed_prompt = excluded.feed_prompt`
  ).run(hideContractions ? 1 : 0, hideBabyMedication ? 1 : 0, feedPrompt ? 1 : 0);
  return getSettings(db);
}
