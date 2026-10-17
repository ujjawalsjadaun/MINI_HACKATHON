import { CATEGORIES } from '../config/constants.js';
import { HttpError, requireString } from '../lib/http.js';
import { hashPassword } from '../lib/passwords.js';
import { Issue, User } from '../models/index.js';
import { createUser, endSessions, requireInstituteEmail } from './accounts.js';
import { logStatus } from './status-log.js';

export const DEPARTMENTS = [...new Set(Object.values(CATEGORIES).map((c) => c.department))];
const ASSIGNABLE_ROLES = ['staff', 'admin'];
export const MIN_STAFF_PASSWORD = 8;

const person = (u, openIssues = 0) => ({ id: u.id, name: u.name, email: u.email, role: u.role, department: u.department, active: u.active !== false, created_at: u.created_at, open_issues: openIssues });

const openIssuesOf = async (userId) => Issue.countDocuments({ assigned_user_id: userId, status: { $ne: 'resolved' } });

// Staff and admins, with how many unresolved issues each staff member holds. Students are only counted.
export async function listPeople() {
  const [users, held, students] = await Promise.all([
    User.find({ role: { $in: ASSIGNABLE_ROLES } }).select('-_id').lean(),
    Issue.find({ assigned_user_id: { $ne: null }, status: { $ne: 'resolved' } }).select('assigned_user_id -_id').lean(),
    User.countDocuments({ role: 'student' }),
  ]);
  const heldBy = new Map();
  for (const { assigned_user_id: id } of held) heldBy.set(id, (heldBy.get(id) ?? 0) + 1);
  const order = (u) => [u.role === 'admin' ? 0 : 1, u.active === false ? 1 : 0, u.department ?? '', u.name];
  users.sort((a, b) => {
    const [x, y] = [order(a), order(b)];
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
    return 0;
  });
  return { people: users.map((u) => person(u, heldBy.get(u.id) ?? 0)), students, departments: DEPARTMENTS };
}

function checkDepartment(role, department) {
  if (role === 'staff') {
    if (!DEPARTMENTS.includes(department)) throw new HttpError(400, 'Choose one of the departments');
    return department;
  }
  return null; // admins do not belong to a department
}

export async function createPerson(body = {}) {
  const name = requireString(body.name, 'Name', { min: 2, max: 80 });
  const email = requireInstituteEmail(body.email);
  const password = requireString(body.password, 'Password', { min: MIN_STAFF_PASSWORD, max: 100 });
  if (!ASSIGNABLE_ROLES.includes(body.role)) throw new HttpError(400, 'Role must be staff or admin');
  const department = checkDepartment(body.role, body.department);
  if (await User.exists({ email })) throw new HttpError(409, 'An account with this email already exists');
  const id = await createUser({ name, email, password, role: body.role, department });
  return person(await User.findOne({ id }).lean());
}

// Changes one person: active on/off, department, or a new password (which signs them out everywhere).
export async function updatePerson(actor, userId, body = {}, now = Date.now()) {
  const user = await User.findOne({ id: userId }).lean();
  if (!user || !ASSIGNABLE_ROLES.includes(user.role)) throw new HttpError(404, 'Person not found');
  let changed = false;

  // Check everything first, so a bad request changes nothing.
  const password = body.password !== undefined ? requireString(body.password, 'Password', { min: MIN_STAFF_PASSWORD, max: 100 }) : undefined;
  const department = body.department !== undefined && user.role === 'staff' ? checkDepartment('staff', body.department) : undefined;
  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean') throw new HttpError(400, 'active must be true or false');
    if (!body.active && user.active !== false) {
      if (userId === actor.id) throw new HttpError(400, 'You cannot deactivate your own account');
      if (user.role === 'admin' && (await User.countDocuments({ role: 'admin', active: true })) <= 1) {
        throw new HttpError(400, 'There must be at least one active admin');
      }
    }
  }

  if (password !== undefined) {
    const next = await hashPassword(password);
    await User.updateOne({ id: userId }, { $set: { password_hash: next.hash, salt: next.salt } });
    await endSessions(userId);
    changed = true;
  }

  if (department !== undefined) {
    await User.updateOne({ id: userId }, { $set: { department } });
    changed = true;
  }

  if (body.active !== undefined) {
    if (!body.active && user.active !== false) {
      await endSessions(userId);
      // Their unfinished work goes back to the queue so nothing sits with someone who can no longer act on it.
      const held = await Issue.find({ assigned_user_id: userId, status: { $ne: 'resolved' } }).select('id status -_id').lean();
      for (const issue of held) {
        const status = issue.status === 'awaiting_confirmation' ? issue.status : 'open';
        await Issue.updateOne({ id: issue.id }, { $set: { assigned_to: null, assigned_user_id: null, status, updated_at: now } });
        await logStatus(issue.id, status, `Unassigned: ${user.name} is no longer on the team`, actor.name, now);
      }
    }
    await User.updateOne({ id: userId }, { $set: { active: body.active } });
    changed = true;
  }

  if (!changed) throw new HttpError(400, 'Nothing to update');
  return person(await User.findOne({ id: userId }).lean(), await openIssuesOf(userId));
}
