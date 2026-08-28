import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { getChild, setChild } from '../childService.js';

export const childRouter = Router();
childRouter.use(requireAuth);

childRouter.get('/', (req, res) => {
  res.json(getChild(req.db));
});

childRouter.put('/', (req, res) => {
  try {
    res.json(setChild(req.db, req.body || {}));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
