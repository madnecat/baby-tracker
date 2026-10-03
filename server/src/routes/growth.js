import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  createGrowthMeasurement,
  deleteGrowthMeasurement,
  listGrowthMeasurements,
  updateGrowthMeasurement,
} from '../growthService.js';
import { sendServiceError } from './errorCodes.js';

export const growthRouter = Router();
growthRouter.use(requireAuth);

growthRouter.get('/', (req, res) => {
  res.json(listGrowthMeasurements(req.db));
});

growthRouter.post('/', (req, res) => {
  try {
    const entry = createGrowthMeasurement(req.db, { ...req.body, createdBy: req.user.id });
    res.status(201).json(entry);
  } catch (e) {
    sendServiceError(res, 400, e);
  }
});

growthRouter.patch('/:id', (req, res) => {
  try {
    res.json(updateGrowthMeasurement(req.db, req.params.id, req.body || {}));
  } catch (e) {
    sendServiceError(res, 404, e);
  }
});

growthRouter.delete('/:id', (req, res) => {
  deleteGrowthMeasurement(req.db, req.params.id);
  res.status(204).end();
});
