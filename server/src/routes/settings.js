import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { getSettings, setSettings } from '../settingsService.js';

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

settingsRouter.get('/', (req, res) => {
  res.json(getSettings(req.db));
});

settingsRouter.patch('/', (req, res) => {
  res.json(setSettings(req.db, req.body || {}));
});
