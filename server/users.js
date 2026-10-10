import { CATEGORIES } from './config.js';
import { authenticate, createUser, hashPassword, requireInstituteEmail } from './auth.js';
import { transaction } from './db.js';
import { HttpError, requireString, wrap } from './http.js';

export const DEPARTMENTS = [...new Set(Object.values(CATEGORIES).map((c) => c.department))];
const ASSIGNABLE_ROLES = ['staff', 'admin'];
export const MIN_STAFF_PASSWORD = 8;

const person = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, department: u.department, active: u.active === 1, created_at: u.created_at, open_issues: u.open_issues ?? 0 });

// Staff and admins, with how many unresolved issues each staff member holds. Students are only counted.
export function listPeople(db) {
  const people = db.prepare(`
    SELECT u.*, (SELECT COUNT(*) FROM issues i WHERE i.assigned_user_id = u.id AND i.status != 'resolved') AS open_issues
    FROM users u WHERE u.role IN ('staff', 'admin') ORDER BY u.role = 'admin' DESC, u.active DESC, u.department, u.name`).all();
  const students = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'student'").get().n;
  return { people: people.map(person), students, departments: DEPARTMENTS };
}

function checkDepartment(role, department) {
  if (role === 'staff') {
    if (!DEPARTMENTS.includes(department)) throw new HttpError(400, 'Choose one of the departments');
    return department;
  }
  return null; // admins do not belong to a department
}

export function createPerson(db, body = {}) {
  const name = requireString(body.name, 'Name', { min: 2, max: 80 });
  const email = requireInstituteEmail(body.email);
  const password = requireString(body.password, 'Password', { min: MIN_STAFF_PASSWORD, max: 100 });
  if (!ASSIGNABLE_ROLES.includes(body.role)) throw new HttpError(400, 'Role must be staff or admin');
  const department = checkDepartment(body.role, body.department);
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'An account with this email already exists');
  const id = createUser(db, { name, email, password, role: body.role, department });
  return person(db.prepare('SELECT * FROM users WHERE id = ?').get(id));
}

// Changes one person: active on/off, department, or a new password (which signs them out everywhere).
export function updatePerson(db, actor, userId, body = {}, now = Date.now()) {
  return transaction(db, () => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user || !ASSIGNABLE_ROLES.includes(user.role)) throw new HttpError(404, 'Person not found');
    let changed = false;

    if (body.password !== undefined) {
      const password = requireString(body.password, 'Password', { min: MIN_STAFF_PASSWORD, max: 100 });
      const next = hashPassword(password);
      db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').run(next.hash, next.salt, userId);
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
      changed = true;
    }

    if (body.department !== undefined && user.role === 'staff') {
      db.prepare('UPDATE users SET department = ? WHERE id = ?').run(checkDepartment('staff', body.department), userId);
      changed = true;
    }

    if (body.active !== undefined) {
      if (typeof body.active !== 'boolean') throw new HttpError(400, 'active must be true or false');
      if (!body.active && user.active === 1) {
        if (userId === actor.id) throw new HttpError(400, 'You cannot deactivate your own account');
        if (user.role === 'admin' && db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1").get().n <= 1) {
          throw new HttpError(400, 'There must be at least one active admin');
        }
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
        // Their unfinished work goes back to the queue so nothing sits with someone who can no longer act on it.
        const held = db.prepare("SELECT id, status FROM issues WHERE assigned_user_id = ? AND status != 'resolved'").all(userId);
        for (const issue of held) {
          const status = issue.status === 'awaiting_confirmation' ? issue.status : 'open';
          db.prepare('UPDATE issues SET assigned_to = NULL, assigned_user_id = NULL, status = ?, updated_at = ? WHERE id = ?').run(status, now, issue.id);
          db.prepare('INSERT INTO status_log (issue_id, status, note, actor, created_at) VALUES (?, ?, ?, ?, ?)')
            .run(issue.id, status, `Unassigned: ${user.name} is no longer on the team`, actor.name, now);
        }
      }
      db.prepare('UPDATE users SET active = ? WHERE id = ?').run(body.active ? 1 : 0, userId);
      changed = true;
    }

    if (!changed) throw new HttpError(400, 'Nothing to update');
    return person(db.prepare('SELECT * FROM users WHERE id = ?').get(userId));
  });
}

export function userRoutes(db, router, requireAdmin) {
  const auth = authenticate(db);
  router.get('/people', auth, requireAdmin, (_req, res) => res.json(listPeople(db)));
  router.post('/people', auth, requireAdmin, wrap((req, res) => res.status(201).json(createPerson(db, req.body))));
  router.patch('/people/:id', auth, requireAdmin, wrap((req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw new HttpError(400, 'Invalid id');
    res.json(updatePerson(db, req.user, id, req.body));
  }));
}
