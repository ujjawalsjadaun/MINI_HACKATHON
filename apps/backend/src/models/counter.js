import mongoose from 'mongoose';

// One row per collection, holding the last numeric id handed out (see db/ids.js).
const counterSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 },
}, { versionKey: false });

export const Counter = mongoose.models.Counter ?? mongoose.model('Counter', counterSchema, 'counters');
