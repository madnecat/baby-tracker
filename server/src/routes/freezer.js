import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  FreezerError,
  createBag,
  discardBag,
  getFreezer,
  planFor,
  thawBags,
  undoThaw,
  undoThawMany,
  updateBag,
} from '../freezerService.js';

export const freezerRouter = Router();
freezerRouter.use(requireAuth);

function handle(res, fn) {
  try {
    fn();
  } catch (e) {
    if (e instanceof FreezerError) return res.status(e.status).json({ error: e.message, code: e.code });
    throw e;
  }
}

freezerRouter.get('/', (req, res) => {
  res.json(getFreezer(req.db));
});

freezerRouter.post('/', (req, res) => {
  handle(res, () => {
    res.status(201).json(createBag(req.db, { ...(req.body || {}), createdBy: req.user.id }));
  });
});

// Read-only suggestion; nothing changes until /thaw is called with the chosen bags.
freezerRouter.post('/plan', (req, res) => {
  handle(res, () => {
    res.json(planFor(req.db, (req.body || {}).targetMl));
  });
});

freezerRouter.post('/thaw', (req, res) => {
  handle(res, () => {
    res.json({ bags: thawBags(req.db, (req.body || {}).bagIds) });
  });
});

// All-or-nothing undo of a whole thaw (every bag that was thawed together).
freezerRouter.post('/undo', (req, res) => {
  handle(res, () => {
    res.json({ bags: undoThawMany(req.db, (req.body || {}).bagIds) });
  });
});

freezerRouter.patch('/:id', (req, res) => {
  handle(res, () => {
    res.json(updateBag(req.db, req.params.id, req.body || {}));
  });
});

freezerRouter.post('/:id/discard', (req, res) => {
  handle(res, () => {
    res.json(discardBag(req.db, req.params.id));
  });
});

freezerRouter.post('/:id/undo', (req, res) => {
  handle(res, () => {
    res.json(undoThaw(req.db, req.params.id));
  });
});
