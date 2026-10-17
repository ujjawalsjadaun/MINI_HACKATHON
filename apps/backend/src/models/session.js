import mongoose from 'mongoose';

// A signed-in browser: a random bearer token that expires after a week (SESSION_TTL_MS).
const sessionSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  user_id: { type: Number, required: true, index: true },
  expires_at: { type: Number, required: true },
}, { versionKey: false });

export const Session = mongoose.models.Session ?? mongoose.model('Session', sessionSchema, 'sessions');
