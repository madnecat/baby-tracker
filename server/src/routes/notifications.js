import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { adminMomRequestEmail, testEmail } from '../emailTemplates.js';
import {
  PrefsError,
  createRateLimiter,
  getMomUserId,
  getPrefs,
  savePrefs,
} from '../notificationsService.js';

// Cookie sessions only (requireAuth): API tokens are for the MCP, and must not be able to point
// reminder emails at an address.
export function notificationsRouter(mailer) {
  const router = Router();
  router.use(requireAuth);

  const allowTest = createRateLimiter(3, 60 * 60 * 1000);
  const allowAdminRequest = createRateLimiter(1, 24 * 60 * 60 * 1000);

  router.get('/', (req, res) => {
    const momUserId = getMomUserId(req.db);
    res.json({
      available: !!mailer,
      momConfigured: momUserId != null,
      isMom: momUserId === req.user.id,
      canAskAdmin: !!mailer?.config.adminEmail,
      ...getPrefs(req.db, req.user.id),
    });
  });

  router.put('/', (req, res) => {
    const { enabled, email, language } = req.body || {};
    if (enabled === true && !mailer) {
      return res.status(409).json({ error: 'Email reminders are not set up on this server.' });
    }
    try {
      res.json(savePrefs(req.db, req.user.id, { enabled, email, language }));
    } catch (e) {
      if (e instanceof PrefsError) return res.status(400).json({ error: e.message });
      throw e;
    }
  });

  router.post('/test', async (req, res) => {
    if (!mailer) return res.status(409).json({ error: 'Email reminders are not set up on this server.' });
    const prefs = getPrefs(req.db, req.user.id);
    if (!prefs.email) return res.status(400).json({ error: 'Save an email address first.' });
    if (!allowTest(req.user.username)) {
      return res.status(429).json({ error: 'Too many test emails — try again in an hour.' });
    }
    try {
      await mailer.send({
        to: prefs.email,
        ...testEmail({ language: prefs.language, publicUrl: mailer.config.publicUrl }),
      });
      res.status(204).end();
    } catch (e) {
      console.error(`Test email failed (user ${req.user.id}): ${e?.code || 'send error'}`);
      res.status(502).json({ error: 'The test email could not be sent. Check the server mail settings.' });
    }
  });

  // Households can't define Mum themselves (the administrator does, in the add-on configuration),
  // so this just emails the administrator a request.
  router.post('/request-mom', async (req, res) => {
    if (!mailer?.config.adminEmail) {
      return res.status(409).json({ error: 'There is no administrator contact set up on this server.' });
    }
    if (getMomUserId(req.db) != null) {
      return res.status(409).json({ error: 'Mum is already set up for this household.' });
    }
    if (!allowAdminRequest(req.householdSlug)) {
      return res.status(429).json({ error: 'A request was already sent today.' });
    }
    try {
      await mailer.send({
        to: mailer.config.adminEmail,
        ...adminMomRequestEmail({ householdSlug: req.householdSlug, requestedBy: req.user.displayName }),
      });
      res.status(204).end();
    } catch (e) {
      console.error(`Admin request email failed (household ${req.householdSlug}): ${e?.code || 'send error'}`);
      res.status(502).json({ error: 'The request could not be sent.' });
    }
  });

  return router;
}
