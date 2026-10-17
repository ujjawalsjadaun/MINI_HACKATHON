import mongoose from 'mongoose';

// The timeline students see: one entry per change to an issue.
const statusLogSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  issue_id: { type: Number, required: true, index: true },
  status: { type: String, required: true },
  note: { type: String, default: '' },
  actor: { type: String, required: true },
  created_at: { type: Number, required: true },
}, { versionKey: false });

export const StatusLog = mongoose.models.StatusLog ?? mongoose.model('StatusLog', statusLogSchema, 'status_log');
