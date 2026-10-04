import crypto from 'node:crypto';
import fs from 'node:fs';
import multer from 'multer';
import { updateIssue } from './admin.js';
import { authenticate, requireAdmin } from './auth.js';
import { MAX_PHOTO_BYTES } from './config.js';
import { HttpError, wrap } from './http.js';
import { addMeToo, confirmFix, getIssueDetail, listIssues, nearbyIssues, rejectFix, submitReport, validateReportInput } from './issues.js';

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

export function issueRoutes(db, router, { uploadDir }) {
  const auth = authenticate(db);
  const upload = photoUpload(uploadDir);
  const removeUpload = (file) => file && fs.unlink(file.path, () => {});

  const handleUpload = (req, res, next) =>
    upload(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') return next(new HttpError(400, 'Photo must be under 5 MB'));
      next(err);
    });

  // Called as soon as a location is chosen, so students can join an existing issue
  // instead of filing a duplicate.
  router.get('/issues/nearby', auth, wrap((req, res) => {
    const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
    res.json(nearbyIssues(db, {
      location: text(req.query.location, 60),
      category: text(req.query.category, 30),
      detail: text(req.query.detail, 100),
      description: text(req.query.description, 600),
    }));
  }));

  router.post('/issues', auth, handleUpload, wrap((req, res) => {
    try {
      const input = validateReportInput(req.body);
      const result = submitReport(db, req.user, input, req.file ? `/uploads/${req.file.filename}` : null);
      res.status(result.merged ? 200 : 201).json(result);
    } catch (err) {
      removeUpload(req.file);
      throw err;
    }
  }));

  router.post('/issues/:id/me-too', auth, wrap((req, res) => {
    addMeToo(db, req.user, idParam(req));
    res.status(201).json({ ok: true });
  }));

  router.post('/issues/:id/confirm', auth, wrap((req, res) => {
    confirmFix(db, req.user, idParam(req));
    res.json({ ok: true });
  }));

  router.post('/issues/:id/reopen', auth, wrap((req, res) => {
    rejectFix(db, req.user, idParam(req), req.body?.note);
    res.json({ ok: true });
  }));

  router.get('/issues', auth, wrap((req, res) => {
    const { status, category, location, mine } = req.query;
    res.json(listIssues(db, { status, category, location, mineOf: mine === '1' ? req.user.id : undefined }));
  }));

  router.get('/issues/:id', auth, wrap((req, res) => res.json(getIssueDetail(db, idParam(req), req.user))));

  router.patch('/issues/:id', auth, requireAdmin, wrap((req, res) => {
    const id = idParam(req);
    updateIssue(db, req.user, id, req.body);
    res.json(getIssueDetail(db, id, req.user));
  }));
}
