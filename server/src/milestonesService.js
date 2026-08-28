export function getMilestoneCompletions(db) {
  const rows = db.prepare(`SELECT milestone_key, completed_at FROM milestone_completions`).all();
  return Object.fromEntries(rows.map((r) => [r.milestone_key, r.completed_at]));
}

export function setMilestoneCompletion(db, key, completed) {
  if (completed) {
    db.prepare(
      `INSERT INTO milestone_completions (milestone_key, completed_at) VALUES (?, datetime('now'))
       ON CONFLICT(milestone_key) DO UPDATE SET completed_at = excluded.completed_at`
    ).run(key);
  } else {
    db.prepare(`DELETE FROM milestone_completions WHERE milestone_key = ?`).run(key);
  }
}
