import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { sendServiceError } from './errorCodes.js';
import { createEvent, deleteEvent, getActiveEvent, listEvents, updateEvent } from '../eventsService.js';

export const eventsRouter = Router();
eventsRouter.use(requireAuth);

eventsRouter.get('/', (req, res) => {
  const { type, from, to } = req.query;
  res.json(listEvents(req.db, { type, from, to }));
});

eventsRouter.get('/active', (req, res) => {
  const { type } = req.query;
  if (!type) return res.status(400).json({ error: 'type query param is required', code: 'EVENT_TYPE_REQUIRED' });
  res.json(getActiveEvent(req.db, type));
});

eventsRouter.post('/', (req, res) => {
  const { type, startedAt, endedAt, details } = req.body || {};
  try {
    const event = createEvent(req.db, { type, startedAt, endedAt, details, createdBy: req.user.id });
    res.status(201).json(event);
  } catch (e) {
    sendServiceError(res, 400, e);
  }
});

eventsRouter.patch('/:id', (req, res) => {
  try {
    res.json(updateEvent(req.db, req.params.id, req.body || {}));
  } catch (e) {
    sendServiceError(res, 404, e);
  }
});

eventsRouter.delete('/:id', (req, res) => {
  deleteEvent(req.db, req.params.id);
  res.status(204).end();
});
