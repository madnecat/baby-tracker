import { reminderEmail } from './emailTemplates.js';

// A reminder is only sent while its dose became due within this window; anything older is skipped
// (the status is still visible in the app). It also bounds the damage of a long downtime or a
// first deploy: nothing that fell due hours ago is ever emailed.
export const REMINDER_WINDOW_MS = 30 * 60 * 1000;
// Intervals outside (0, MAX] hours are treated as "unknown" and never remind.
export const MAX_INTERVAL_HOURS = 168;
// Doses older than this can't still be inside the window, so the query never reads further back.
const LOOKBACK_MS = (MAX_INTERVAL_HOURS * 60 + 24 * 60) * 60 * 1000 + REMINDER_WINDOW_MS;
const RETRY_BASE_MS = 60 * 1000;
const RETRY_MAX_MS = 8 * 60 * 1000;
const KEEP_REMINDERS_MS = 30 * 24 * 60 * 60 * 1000;

function parseDetails(raw) {
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

/** Dose time + interval as epoch ms, or null if either is unusable. */
export function dueTimeMs(startedAt, intervalHours) {
  const startedMs = Date.parse(startedAt);
  if (Number.isNaN(startedMs)) return null;
  if (typeof intervalHours !== 'number' || !Number.isFinite(intervalHours)) return null;
  if (intervalHours <= 0 || intervalHours > MAX_INTERVAL_HOURS) return null;
  return startedMs + intervalHours * 3600000;
}

/**
 * Reminders that should go out right now for one household, as
 * [{ eventId, who, dueAt, recipients: [{ userId, email, language }] }]. Pure with respect to
 * `nowMs` (no email is sent here and nothing is written), so it is easy to test.
 *
 * Rules:
 * - only the newest dose of each (person, medication name) can remind — logging the same
 *   medication again before the interval ends supersedes the earlier dose;
 * - it must have become due within REMINDER_WINDOW_MS;
 * - Mum's doses go to Mum only (nobody if no Mum is configured), Baby's to every parent;
 * - only parents with reminders enabled, and only for doses that fell due after they enabled them;
 * - never twice for the same (dose, parent, due time).
 */
export function collectDueReminders(db, nowMs) {
  const prefs = db
    .prepare(
      `SELECT user_id AS userId, email, language, enabled_at AS enabledAt
       FROM notification_prefs WHERE enabled = 1 AND email <> ''`
    )
    .all();
  if (prefs.length === 0) return [];

  const momUserId = db.prepare(`SELECT mom_user_id AS id FROM settings WHERE id = 1`).get()?.id ?? null;
  const since = new Date(nowMs - LOOKBACK_MS).toISOString();
  const rows = db
    .prepare(
      `SELECT id, started_at AS startedAt, details FROM events
       WHERE type = 'medication' AND started_at >= ?`
    )
    .all(since);

  const latest = new Map();
  for (const row of rows) {
    const startedMs = Date.parse(row.startedAt);
    if (Number.isNaN(startedMs)) continue;
    const details = parseDetails(row.details);
    const who = details.who === 'baby' ? 'baby' : 'mom';
    const key = `${who}|${String(details.name ?? '').trim().toLowerCase()}`;
    const current = latest.get(key);
    if (!current || startedMs > current.startedMs || (startedMs === current.startedMs && row.id > current.id)) {
      latest.set(key, { id: row.id, startedMs, startedAt: row.startedAt, who, details });
    }
  }

  const alreadySent = db.prepare(
    `SELECT 1 FROM medication_reminders WHERE event_id = ? AND user_id = ? AND due_at = ?`
  );
  const due = [];
  for (const dose of latest.values()) {
    const dueMs = dueTimeMs(dose.startedAt, dose.details.intervalHours);
    if (dueMs == null || dueMs > nowMs || nowMs - dueMs > REMINDER_WINDOW_MS) continue;
    const dueAt = new Date(dueMs).toISOString();

    const recipients = prefs.filter((p) => {
      if (dose.who === 'mom' && (momUserId == null || p.userId !== momUserId)) return false;
      const enabledMs = Date.parse(p.enabledAt);
      if (Number.isNaN(enabledMs) || dueMs < enabledMs) return false;
      return !alreadySent.get(dose.id, p.userId, dueAt);
    });
    if (recipients.length > 0) {
      due.push({ eventId: dose.id, who: dose.who, dueAt, recipients });
    }
  }
  return due;
}

/** True if the dose still exists and still falls due at `dueAt` (it may have been edited/deleted). */
function stillDue(db, eventId, dueAt) {
  const row = db.prepare(`SELECT started_at AS startedAt, details FROM events WHERE id = ?`).get(eventId);
  if (!row) return false;
  const dueMs = dueTimeMs(row.startedAt, parseDetails(row.details).intervalHours);
  return dueMs != null && new Date(dueMs).toISOString() === dueAt;
}

/**
 * Sends whatever is due for one household. `retries` is an in-memory map of failed sends
 * (attempt count + earliest next try) so a down SMTP server is retried with growing pauses
 * instead of every tick, until the reminder's window closes. A send is recorded only after the
 * mail server accepted it, so a crash in between can duplicate a reminder but never lose one.
 */
export async function processHousehold({ slug, db, mailer, publicUrl, nowMs, retries, log = console }) {
  db.prepare(`DELETE FROM medication_reminders WHERE event_id NOT IN (SELECT id FROM events)`).run();
  db.prepare(`DELETE FROM medication_reminders WHERE sent_at < ?`).run(
    new Date(nowMs - KEEP_REMINDERS_MS).toISOString()
  );

  for (const reminder of collectDueReminders(db, nowMs)) {
    for (const recipient of reminder.recipients) {
      const key = `${slug}|${reminder.eventId}|${recipient.userId}|${reminder.dueAt}`;
      const retry = retries.get(key);
      if (retry && nowMs < retry.nextTryAt) continue;
      if (!stillDue(db, reminder.eventId, reminder.dueAt)) break;

      try {
        const { subject, text } = reminderEmail({
          who: reminder.who,
          language: recipient.language,
          publicUrl,
        });
        await mailer.send({ to: recipient.email, subject, text });
        db.prepare(
          `INSERT OR IGNORE INTO medication_reminders (event_id, user_id, due_at, sent_at) VALUES (?, ?, ?, ?)`
        ).run(reminder.eventId, recipient.userId, reminder.dueAt, new Date(nowMs).toISOString());
        retries.delete(key);
        log.log(`Reminder email sent (household ${slug}, user ${recipient.userId}, dose ${reminder.eventId})`);
      } catch (e) {
        // Never log the address or the server's message (it can echo the recipient).
        const attempts = (retry?.attempts ?? 0) + 1;
        retries.set(key, {
          attempts,
          nextTryAt: nowMs + Math.min(RETRY_BASE_MS * 2 ** attempts, RETRY_MAX_MS),
        });
        log.error(
          `Reminder email failed (household ${slug}, user ${recipient.userId}, dose ${reminder.eventId}, attempt ${attempts}): ${e?.code || 'send error'}`
        );
      }
    }
  }
}

/** One pass over every available household; each household is isolated from the others' errors. */
export async function runReminderTick({ getHouseholds, mailer, publicUrl, retries, nowMs = Date.now(), log = console }) {
  for (const { slug, db } of getHouseholds()) {
    try {
      await processHousehold({ slug, db, mailer, publicUrl, nowMs, retries, log });
    } catch (e) {
      log.error(`Reminder check failed for household "${slug}": ${e.message}`);
    }
  }
  for (const [key, retry] of retries) {
    if (nowMs - retry.nextTryAt > REMINDER_WINDOW_MS) retries.delete(key);
  }
}

/**
 * Starts the once-a-minute check. Ticks never overlap (a slow SMTP server can't pile them up),
 * and the timers are unref'd so they never keep the process alive. Does nothing without a mailer.
 */
export function startReminderScheduler({ getHouseholds, mailer, intervalMs = 60 * 1000, firstDelayMs = 20 * 1000 }) {
  if (!mailer) {
    console.log('Email reminders are off: SMTP is not configured.');
    return null;
  }
  const retries = new Map();
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runReminderTick({ getHouseholds, mailer, publicUrl: mailer.config.publicUrl, retries });
    } finally {
      running = false;
    }
  };

  const first = setTimeout(tick, firstDelayMs);
  first.unref();
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  console.log('Email reminders are on.');
  return { stop: () => (clearTimeout(first), clearInterval(timer)), tick };
}
