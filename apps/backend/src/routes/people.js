import express from 'express';
import { HttpError, wrap } from '../lib/http.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { createPerson, listPeople, updatePerson } from '../services/people.js';

// Admin only: the team behind the queue. Accounts are created here instead of by a script.
export function peopleRoutes() {
  const router = express.Router();
  router.get('/people', authenticate, requireAdmin, wrap(async (_req, res) => res.json(await listPeople())));
  router.post('/people', authenticate, requireAdmin, wrap(async (req, res) => res.status(201).json(await createPerson(req.body))));
  router.patch('/people/:id', authenticate, requireAdmin, wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new HttpError(400, 'Invalid id');
    res.json(await updatePerson(req.user, id, req.body));
  }));
  return router;
}
