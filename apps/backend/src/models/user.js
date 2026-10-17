import mongoose from 'mongoose';

// Students register themselves; staff and admins are added by an admin. Passwords are never stored,
// only a salted scrypt hash. The security answer is hashed the same way.
const userSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password_hash: { type: String, required: true },
  salt: { type: String, required: true },
  role: { type: String, enum: ['student', 'staff', 'admin'], default: 'student' },
  department: { type: String, default: null },
  active: { type: Boolean, default: true },
  created_at: { type: Number, required: true },
  security_question: { type: String, default: null },
  security_hash: { type: String, default: null },
  security_salt: { type: String, default: null },
}, { versionKey: false });

export const User = mongoose.models.User ?? mongoose.model('User', userSchema, 'users');
