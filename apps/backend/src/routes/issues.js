import crypto from 'node:crypto';
import express from 'express';
import fs from 'node:fs';
import multer from 'multer';
import { MAX_PHOTO_BYTES } from '../config/constants.js';
import { HttpError, wrap } from '../lib/http.js';
import { authenticate, requireAdmin, requireRole } from '../middleware/auth.js';
import { User } from '../models/index.js';
import { submitFeedback } from '../services/feedback.js';
import { acknowledgeIssue, updateIssue } from '../services/issue-admin.js';
import { addMeToo, confirmFix, getIssueDetail, listIssues, nearbyIssues, rejectFix, submitReport, validateReportInput } from '../services/issues.js';

const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

function photoUpload(uploadDir) {
  fs.mkdirSync(uploadDir, { recursive: true });
  return multer({
    storage: multer.diskStorage({
      destination: uploadDir,
      filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${IMAGE_TYPES[file.mimetype]}`),
    }),
    limits: { fileSize: MAX_PHOTO_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
      const ok = Boolean(IMAGE_TYPES[file.mimetype]);
      cb(ok ? null : new HttpError(400, 'Photo must be a JPG, PNG or WebP image'), ok);
    },
  }).single('photo');
}

const idParam = (req) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'Invalid issue id');
  return id;
};

// Reporting, the queue, an issue's detail, and everything a team does to an issue.
export function issueRoutes({ uploadDir }) {
  const router = express.Router();
  const upload = photoUpload(uploadDir);
  const removeUpload = (file) => file && fs.unlink(file.path, () => {});

  const handleUpload = (req, res, next) =>
    upload(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') return next(new HttpError(400, 'Photo must be under 5 MB'));
      next(err);
    });

  // Called as soon as a location is chosen, so students can join an existing issue instead of filing a duplicate.
  router.get('/issues/nearby', authenticate, wrap(async (req, res) => {
    const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
    res.json(await nearbyIssues({
      location: text(req.query.location, 60),
      category: text(req.query.category, 30),
      detail: text(req.query.detail, 100),
      description: text(req.query.description, 600),
    }));
  }));

  router.post('/issues', authenticate, requireRole('student'), handleUpload, wrap(async (req, res) => {
    try {
      const input = validateReportInput(req.body);
      const result = await submitReport(req.user, input, req.file ? `/uploads/${req.file.filename}` : null);
      res.status(result.merged ? 200 : 201).json(result);
    } catch (err) {
      removeUpload(req.file);
      throw err;
    }
  }));

  router.post('/issues/:id/me-too', authenticate, requireRole('student'), wrap(async (req, res) => {
    await addMeToo(req.user, idParam(req));
    res.status(201).json({ ok: true });
  }));

  router.post('/issues/:id/confirm', authenticate, requireRole('student'), wrap(async (req, res) => {
    await confirmFix(req.user, idParam(req));
    res.json({ ok: true });
  }));

  router.post('/issues/:id/feedback', authenticate, requireRole('student'), wrap(async (req, res) => {
    const id = idParam(req);
    await submitFeedback(req.user, id, req.body);
    res.status(201).json((await getIssueDetail(id, req.user)).feedback);
  }));

  router.post('/issues/:id/reopen', authenticate, requireRole('student'), wrap(async (req, res) => {
    await rejectFix(req.user, idParam(req), req.body?.note);
    res.json({ ok: true });
  }));

  router.get('/issues', authenticate, wrap(async (req, res) => {
    const { status, category, location, mine } = req.query;
    res.json(await listIssues({
      status, category, location,
      mineOf: mine === '1' ? req.user.id : undefined,
      assignedTo: req.user.role === 'staff' ? req.user.id : undefined, // staff only ever see their own queue
    }));
  }));

  router.get('/issues/:id', authenticate, wrap(async (req, res) => res.json(await getIssueDetail(idParam(req), req.user))));

  router.get('/staff', authenticate, requireAdmin, wrap(async (_req, res) => {
    res.json(await User.find({ role: 'staff', active: true }).sort({ department: 1, name: 1 }).select('id name department -_id').lean());
  }));

  router.post('/issues/:id/acknowledge', authenticate, requireRole('admin', 'staff'), wrap(async (req, res) => {
    const id = idParam(req);
    await acknowledgeIssue(req.user, id);
    res.json(await getIssueDetail(id, req.user));
  }));

  router.patch('/issues/:id', authenticate, requireRole('admin', 'staff'), wrap(async (req, res) => {
    const id = idParam(req);
    await updateIssue(req.user, id, req.body);
    res.json(await getIssueDetail(id, req.user));
  }));

  return router;
}
