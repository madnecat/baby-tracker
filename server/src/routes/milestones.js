import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { getMilestoneCompletions, setMilestoneCompletion } from '../milestonesService.js';

export const milestonesRouter = Router();
milestonesRouter.use(requireAuth);

milestonesRouter.get('/completions', (req, res) => {
  res.json(getMilestoneCompletions());
});

milestonesRouter.put('/completions/:key', (req, res) => {
  setMilestoneCompletion(req.params.key, Boolean((req.body || {}).completed));
  res.status(204).end();
});
