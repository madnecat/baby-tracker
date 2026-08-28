import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { createEvent, deleteEvent, getActiveEvent, listEvents, updateEvent } from '../eventsService.js';

export const eventsRouter = Router();
eventsRouter.use(requireAuth);

eventsRouter.get('/', (req, res) => {
  const { type, from, to } = req.query;
  res.json(listEvents(req.db, { type, from, to }));
});

eventsRouter.get('/active', (req, res) => {
  const { type } = req.query;
  if (!type) return res.status(400).json({ error: 'type query param is required' });
  res.json(getActiveEvent(req.db, type));
});

eventsRouter.post('/', (req, res) => {
  const { type, startedAt, endedAt, details } = req.body || {};
  try {
    const event = createEvent(req.db, { type, startedAt, endedAt, details, createdBy: req.user.id });
    res.status(201).json(event);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

eventsRouter.patch('/:id', (req, res) => {
  try {
    res.json(updateEvent(req.db, req.params.id, req.body || {}));
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
});

eventsRouter.delete('/:id', (req, res) => {
  deleteEvent(req.db, req.params.id);
  res.status(204).end();
});
