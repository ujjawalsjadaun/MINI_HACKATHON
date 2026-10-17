import mongoose from 'mongoose';

// An alert for one person about one issue. Stored as a kind plus details (not finished English), so each
// person reads it in the language they chose.
const notificationSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  user_id: { type: Number, required: true },
  issue_id: { type: Number, required: true },
  kind: { type: String, required: true },
  params: { type: mongoose.Schema.Types.Mixed, default: {} },
  created_at: { type: Number, required: true },
  read_at: { type: Number, default: null },
}, { versionKey: false, minimize: false });

notificationSchema.index({ user_id: 1, read_at: 1, created_at: -1 });

export const Notification = mongoose.models.Notification ?? mongoose.model('Notification', notificationSchema, 'notifications');
