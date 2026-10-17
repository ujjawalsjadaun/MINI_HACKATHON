import mongoose from 'mongoose';
import { STATUSES } from '../config/constants.js';

// One document per underlying problem. Many student reports can point at one issue.
const issueSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  title: { type: String, required: true },
  category: { type: String, required: true },
  location: { type: String, required: true },
  detail: { type: String, default: '' },
  description: { type: String, required: true },
  department: { type: String, required: true },
  status: { type: String, enum: STATUSES, default: 'open' },
  assigned_to: { type: String, default: null },
  assigned_user_id: { type: Number, default: null },
  created_at: { type: Number, required: true },
  updated_at: { type: Number, required: true },
  resolved_at: { type: Number, default: null },
  reopen_count: { type: Number, default: 0 },
  acknowledged_at: { type: Number, default: null },
  acknowledged_by: { type: String, default: null },
  pin_x: { type: Number, default: null },
  pin_y: { type: Number, default: null },
}, { versionKey: false });

// Duplicate detection looks for open issues of one category at one place.
issueSchema.index({ category: 1, location: 1, status: 1 });
issueSchema.index({ assigned_user_id: 1, status: 1 });

export const Issue = mongoose.models.Issue ?? mongoose.model('Issue', issueSchema, 'issues');
