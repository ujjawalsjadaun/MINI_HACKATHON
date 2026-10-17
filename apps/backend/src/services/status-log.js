import { createWithId } from '../db/ids.js';
import { StatusLog } from '../models/index.js';

// One line on the timeline students see. `actor` is a person's name, or 'system' / 'reporter'.
export const logStatus = (issueId, status, note, actor, now = Date.now()) =>
  createWithId(StatusLog, { issue_id: issueId, status, note, actor, created_at: now });
