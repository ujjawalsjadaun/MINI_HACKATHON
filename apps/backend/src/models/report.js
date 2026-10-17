import mongoose from 'mongoose';

// One student's report of an issue. A student can report an issue once (the unique index enforces it).
// `urgency_level` is the urgency as a number (0 normal, 1 urgent, 2 emergency), so the database can find
// the highest rating on an issue without any text comparison.
const reportSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  issue_id: { type: Number, required: true },
  user_id: { type: Number, required: true },
  description: { type: String, required: true },
  photo: { type: String, default: null },
  match_reason: { type: String, default: null },
  urgency: { type: String, default: 'normal' },
  urgency_level: { type: Number, default: 0 },
  created_at: { type: Number, required: true },
}, { versionKey: false });

reportSchema.index({ issue_id: 1, user_id: 1 }, { unique: true });
reportSchema.index({ user_id: 1 });

export const Report = mongoose.models.Report ?? mongoose.model('Report', reportSchema, 'reports');
