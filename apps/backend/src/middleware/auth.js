import { HttpError } from '../lib/http.js';
import { Session, User } from '../models/index.js';
import { publicUser } from '../services/accounts.js';

// Resolves the bearer token into req.user, or rejects with 401.
export async function authenticate(req, _res, next) {
  try {
    const header = req.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new HttpError(401, 'Please sign in');
    const session = await Session.findOne({ token }).lean();
    const user = session && await User.findOne({ id: session.user_id }).lean();
    if (!session || !user || session.expires_at < Date.now()) throw new HttpError(401, 'Session expired, please sign in again');
    if (user.active === false) throw new HttpError(401, 'This account has been deactivated');
    req.user = publicUser(user);
    req.token = token;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdmin(req, _res, next) {
  next(req.user?.role === 'admin' ? undefined : new HttpError(403, 'Admin access required'));
}

export const requireRole = (...roles) => (req, _res, next) =>
  next(roles.includes(req.user?.role) ? undefined : new HttpError(403, 'You do not have access to this'));
