import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { loadEmergencyContacts } from '../services/emergency.js';

export function emergencyRoutes(file) {
  const router = express.Router();
  router.get('/emergency', authenticate, (_req, res) => {
    res.json(loadEmergencyContacts(file)); // read each time, so editing the file needs no restart
  });
  return router;
}
