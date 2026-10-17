import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

// Passwords (and security answers) are stored as a salted scrypt hash. scrypt is deliberately slow, so it runs
// on a worker thread (the async version) and never blocks other requests.
export async function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = (await scrypt(password, salt, 64)).toString('hex');
  return { hash, salt };
}

export async function verifyPassword(password, salt, expectedHex) {
  const actual = await scrypt(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

// "Rani " and "rani" are the same answer.
export const normalizeAnswer = (answer) => String(answer).toLowerCase().trim().replace(/\s+/g, ' ');
