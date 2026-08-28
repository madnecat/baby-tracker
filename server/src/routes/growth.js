import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  createGrowthMeasurement,
  deleteGrowthMeasurement,
  listGrowthMeasurements,
  updateGrowthMeasurement,
} from '../growthService.js';

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
    res.status(400).json({ error: e.message });
  }
});

growthRouter.patch('/:id', (req, res) => {
  try {
    res.json(updateGrowthMeasurement(req.db, req.params.id, req.body || {}));
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

growthRouter.delete('/:id', (req, res) => {
  deleteGrowthMeasurement(req.db, req.params.id);
  res.status(204).end();
});
