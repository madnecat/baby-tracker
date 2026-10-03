import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { getChild, setChild } from '../childService.js';
import { sendServiceError } from './errorCodes.js';

export const childRouter = Router();
childRouter.use(requireAuth);

childRouter.get('/', (req, res) => {
  res.json(getChild(req.db));
});

childRouter.put('/', (req, res) => {
  try {
    res.json(setChild(req.db, req.body || {}));
  } catch (e) {
    sendServiceError(res, 400, e);
  }
});
