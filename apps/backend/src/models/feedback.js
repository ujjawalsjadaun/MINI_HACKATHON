import mongoose from 'mongoose';

// A student's rating of a resolved issue's fix (1 to 5): one per student per issue, editable.
const feedbackSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  issue_id: { type: Number, required: true },
  user_id: { type: Number, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, default: '' },
  created_at: { type: Number, required: true },
  updated_at: { type: Number, required: true },
}, { versionKey: false });

feedbackSchema.index({ issue_id: 1, user_id: 1 }, { unique: true });

export const Feedback = mongoose.models.Feedback ?? mongoose.model('Feedback', feedbackSchema, 'feedback');
