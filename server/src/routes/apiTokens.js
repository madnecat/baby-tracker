import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { createApiToken, listApiTokens, revokeApiToken } from '../apiTokens.js';

export const apiTokensRouter = Router();
apiTokensRouter.use(requireAuth);

apiTokensRouter.get('/', (req, res) => {
  res.json(
    listApiTokens(req.user.id).map((t) => ({
      id: t.id,
      label: t.label,
      createdAt: t.created_at,
      lastUsedAt: t.last_used_at,
    }))
  );
});

apiTokensRouter.post('/', (req, res) => {
  const { label } = req.body || {};
  if (!label || !label.trim()) {
    return res.status(400).json({ error: 'label is required' });
  }
  const { id, token } = createApiToken(req.user.id, label.trim());
  res.status(201).json({ id, token });
});

apiTokensRouter.delete('/:id', (req, res) => {
  revokeApiToken(req.user.id, req.params.id);
  res.status(204).end();
});
