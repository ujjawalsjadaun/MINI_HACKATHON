import crypto from 'node:crypto';
import { EMAIL_DOMAIN, SECURITY_QUESTIONS, SESSION_TTL_MS } from '../config/constants.js';
import { createWithId } from '../db/ids.js';
import { HttpError, requireString } from '../lib/http.js';
import { hashPassword, normalizeAnswer } from '../lib/passwords.js';
import { Session, User } from '../models/index.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// An institute address: something before the @ and exactly @nitap.ac.in after it (any letter case).
export const isInstituteEmail = (email) => EMAIL_RE.test(email) && email.toLowerCase().endsWith(`@${EMAIL_DOMAIN}`);

// Reads the email field, lower-cased, and rejects anything that is not an institute address.
export function requireInstituteEmail(value) {
  const email = requireString(value, 'Email', { max: 120 }).toLowerCase();
  if (!isInstituteEmail(email)) throw new HttpError(400, 'Use your NIT Arunachal Pradesh email address (ending in @nitap.ac.in)');
  return email;
}

export function validateSecurity(question, answer) {
  if (!SECURITY_QUESTIONS.includes(question)) throw new HttpError(400, 'Choose one of the security questions');
  const cleaned = normalizeAnswer(answer ?? '');
  if (cleaned.length < 3 || cleaned.length > 60) throw new HttpError(400, 'The security answer must be 3 to 60 characters');
  return { question, answer: cleaned };
}

export async function setSecurityQuestion(userId, question, answer) {
  const { hash, salt } = await hashPassword(normalizeAnswer(answer));
  await User.updateOne({ id: userId }, { $set: { security_question: question, security_hash: hash, security_salt: salt } });
}

export async function createUser({ name, email, password, role = 'student', department = null, security = null }) {
  const { hash, salt } = await hashPassword(password);
  const { id } = await createWithId(User, { name, email, password_hash: hash, salt, role, department, created_at: Date.now() });
  if (security) await setSecurityQuestion(id, security.question, security.answer);
  return id;
}

export async function startSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  await Session.create({ token, user_id: userId, expires_at: Date.now() + SESSION_TTL_MS });
  return token;
}

// What the browser may know about an account. Never password material.
export const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, department: u.department, security_set: Boolean(u.security_hash) });

// Expired sign-in sessions are useless rows; the server clears them at start-up and then hourly.
export async function purgeExpiredSessions(now = Date.now()) {
  return (await Session.deleteMany({ expires_at: { $lt: now } })).deletedCount;
}

// Signs a person out everywhere, or everywhere except one device.
export const endSessions = (userId, exceptToken) =>
  Session.deleteMany({ user_id: userId, ...(exceptToken && { token: { $ne: exceptToken } }) });
