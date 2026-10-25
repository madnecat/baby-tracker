import { freezerExpiryEmail } from './emailTemplates.js';
import { daysBetween, hourInHousehold, todayInHousehold } from './freezerDates.js';
import { expireOverdue } from './freezerService.js';

/** Bags are announced this many days before they expire (one email on each of these days). */
export const ALERT_DAYS = [7, 2];
/** The check runs once a day, from this hour (household local time). */
export const ALERT_HOUR = 7;

/**
 * Frozen bags that are exactly 7 or 2 days from their date today, soonest first. Pure with respect
 * to `today`, so it is easy to test.
 */
export function bagsToAnnounce(db, today) {
  return db
    .prepare(`SELECT reference, quantity_ml AS quantityMl, expires_on AS expiresOn FROM freezer_bags WHERE status = 'frozen'`)
    .all()
    .map((b) => ({ ...b, daysLeft: daysBetween(today, b.expiresOn) }))
    .filter((b) => ALERT_DAYS.includes(b.daysLeft))
    .sort((a, b) => a.daysLeft - b.daysLeft || a.reference - b.reference);
}

function recipients(db) {
  return db
    .prepare(
      `SELECT p.user_id AS userId, p.email, u.language
       FROM notification_prefs p JOIN users u ON u.id = p.user_id
       WHERE p.enabled = 1 AND p.email <> ''
       ORDER BY p.user_id`
    )
    .all();
}

/**
 * The daily freezer check for one household: tidies bags past their date, then, at most once per
 * day and not before ALERT_HOUR, sends one summary email to each parent who has email reminders on.
 * The day is recorded even if a send fails: missing a day is acceptable, a mail loop every minute
 * is not. Returns what happened, for logs and tests.
 */
export async function processFreezerHousehold({ slug, db, mailer, publicUrl, now = new Date(), log = console }) {
  const today = todayInHousehold(now);
  expireOverdue(db, today);
  if (hourInHousehold(now) < ALERT_HOUR) return { ran: false, reason: 'too-early' };
  if (db.prepare(`SELECT 1 FROM freezer_alert_runs WHERE run_on = ?`).get(today)) {
    return { ran: false, reason: 'already-ran' };
  }

  db.prepare(`INSERT INTO freezer_alert_runs (run_on) VALUES (?)`).run(today);
  db.prepare(`DELETE FROM freezer_alert_runs WHERE run_on < ?`).run(
    new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );

  const bags = bagsToAnnounce(db, today);
  if (bags.length === 0) return { ran: true, bags: 0, sent: 0 };

  let sent = 0;
  for (const recipient of recipients(db)) {
    try {
      const { subject, text } = freezerExpiryEmail({ bags, language: recipient.language, publicUrl });
      await mailer.send({ to: recipient.email, subject, text });
      sent += 1;
    } catch (e) {
      // Never log the address or the server's message (it can echo the recipient).
      log.error(`Freezer email failed (household ${slug}, user ${recipient.userId}): ${e?.code || 'send error'}`);
    }
  }
  log.log(`Freezer expiry check (household ${slug}): ${bags.length} bag(s), ${sent} email(s) sent`);
  return { ran: true, bags: bags.length, sent };
}
