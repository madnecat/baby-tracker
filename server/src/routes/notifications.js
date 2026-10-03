import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { adminMomRequestEmail, testEmail } from '../emailTemplates.js';
import {
  PrefsError,
  createRateLimiter,
  getMomUserId,
  getPrefs,
  getUserLanguage,
  savePrefs,
} from '../notificationsService.js';

// Cookie sessions only (requireAuth): API tokens are for the MCP, and must not be able to point
// reminder emails at an address.
export function notificationsRouter(mailer) {
  const router = Router();
  router.use(requireAuth);

  const allowTest = createRateLimiter(3, 60 * 60 * 1000);
  // Recorded only after a successful send, so a transient SMTP failure doesn't lock a household out for a day.
  const adminRequestedAt = new Map();

  router.get('/', (req, res) => {
    const momUserId = getMomUserId(req.db);
    res.json({
      available: !!mailer,
      momConfigured: momUserId != null,
      isMom: momUserId === req.user.id,
      canAskAdmin: !!mailer?.config.adminEmail,
      ...getPrefs(req.db, req.user.id),
      // Kept for older web builds that still read it: it is now the account's app language.
      language: getUserLanguage(req.db, req.user.id),
    });
  });

  router.put('/', (req, res) => {
    const { enabled, email, language } = req.body || {};
    // Older web builds sent the reminder language here. It is the same thing as the account's app
    // language now, so a valid value updates the account and an invalid one is still rejected.
    if (language !== undefined && language !== 'en' && language !== 'fr') {
      return res.status(400).json({ error: 'language must be "en" or "fr".', code: 'LANGUAGE_INVALID' });
    }
    if (enabled === true && !mailer) {
      return res.status(409).json({ error: 'Email reminders are not set up on this server.', code: 'MAIL_NOT_CONFIGURED' });
    }
    try {
      const saved = savePrefs(req.db, req.user.id, { enabled, email });
      if (language !== undefined) {
        req.db.prepare(`UPDATE users SET language = ? WHERE id = ?`).run(language, req.user.id);
      }
      res.json({ ...saved, language: getUserLanguage(req.db, req.user.id) });
    } catch (e) {
      if (e instanceof PrefsError) return res.status(400).json({ error: e.message, code: e.code });
      throw e;
    }
  });

  router.post('/test', async (req, res) => {
    if (!mailer) return res.status(409).json({ error: 'Email reminders are not set up on this server.', code: 'MAIL_NOT_CONFIGURED' });
    const prefs = getPrefs(req.db, req.user.id);
    if (!prefs.email) return res.status(400).json({ error: 'Save an email address first.', code: 'MAIL_EMAIL_NOT_SAVED' });
    if (!allowTest(req.user.username)) {
      return res.status(429).json({ error: 'Too many test emails — try again in an hour.', code: 'RATE_LIMITED' });
    }
    try {
      await mailer.send({
        to: prefs.email,
        ...testEmail({ language: getUserLanguage(req.db, req.user.id), publicUrl: mailer.config.publicUrl }),
      });
      res.status(204).end();
    } catch (e) {
      console.error(`Test email failed (user ${req.user.id}): ${e?.code || 'send error'}`);
      res.status(502).json({ error: 'The test email could not be sent. Check the server mail settings.', code: 'MAIL_SEND_FAILED' });
    }
  });

  // Households can't define Mum themselves (the administrator does, in the add-on configuration),
  // so this just emails the administrator a request.
  router.post('/request-mom', async (req, res) => {
    if (!mailer?.config.adminEmail) {
      return res.status(409).json({ error: 'There is no administrator contact set up on this server.', code: 'ADMIN_CONTACT_MISSING' });
    }
    if (getMomUserId(req.db) != null) {
      return res.status(409).json({ error: 'Mum is already set up for this household.', code: 'MOM_ALREADY_SET' });
    }
    if (Date.now() - (adminRequestedAt.get(req.householdSlug) ?? 0) < 24 * 60 * 60 * 1000) {
      return res.status(429).json({ error: 'A request was already sent today.', code: 'ADMIN_REQUEST_ALREADY_SENT' });
    }
    try {
      await mailer.send({
        to: mailer.config.adminEmail,
        ...adminMomRequestEmail({ householdSlug: req.householdSlug, requestedBy: req.user.displayName }),
      });
      adminRequestedAt.set(req.householdSlug, Date.now());
      res.status(204).end();
    } catch (e) {
      console.error(`Admin request email failed (household ${req.householdSlug}): ${e?.code || 'send error'}`);
      res.status(502).json({ error: 'The request could not be sent.', code: 'ADMIN_REQUEST_FAILED' });
    }
  });

  return router;
}
