// Creates the admin account and a small, realistic demo dataset.
// All reports go through the real services (dedupe, priority, timeline), so the
// demo shows genuine behaviour. Timestamps are shifted back so the dashboards have history.
//
//   npm run seed
//   ADMIN_EMAIL=you@college.edu ADMIN_PASSWORD=choose-one npm run seed
import { createUser } from '../server/auth.js';
import { openDb } from '../server/db.js';
import { updateIssue } from '../server/admin.js';
import { addMeToo, confirmFix, submitReport } from '../server/issues.js';

const DAY = 86_400_000;
const now = Date.now();
const ago = (days) => now - days * DAY;

const db = openDb();
const adminEmail = (process.env.ADMIN_EMAIL ?? 'admin@campusfix.local').toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD ?? 'admin1234';

if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(adminEmail)) {
  console.log(`Already seeded (${adminEmail} exists). Delete data/campusfix.db to start over.`);
  process.exit(0);
}

const admin = { id: createUser(db, { name: 'Campus Admin', email: adminEmail, password: adminPassword, role: 'admin' }), name: 'Campus Admin' };
const student = (name) => ({ id: createUser(db, { name, email: `${name.toLowerCase()}@campusfix.local`, password: 'student1234' }), name });
const [asha, bimal, chen, divya, esha] = ['Asha', 'Bimal', 'Chen', 'Divya', 'Esha'].map(student);

const report = (user, category, location, description, days, detail = '') =>
  submitReport(db, user, { category, location, detail, description }, null, ago(days)).issueId;

// An old CS Block light fault, fixed - so the same fault returning shows up as "recurring".
const oldLight = report(chen, 'electrical', 'CS Block', 'Tube light broken in the lab corridor', 12);
updateIssue(db, admin, oldLight, { assigned_to: 'Ramesh (electrician)' }, ago(11));
updateIssue(db, admin, oldLight, { status: 'awaiting_confirmation', note: 'Tube replaced' }, ago(10.5));
confirmFix(db, chen, oldLight, ago(10));

// The headline scenario: three students, one underlying issue.
const light = report(asha, 'electrical', 'CS Block', 'Tube light broken near the entrance', 4, 'Ground floor');
report(bimal, 'electrical', 'CS Block', 'Light not working in the corridor', 3);
addMeToo(db, divya, light, ago(2));
updateIssue(db, admin, light, { assigned_to: 'Ramesh (electrician)', note: 'Replacement ordered' }, ago(2));

report(divya, 'water', 'Boys Hostel', 'Water leaking from ceiling, exposed wire sparking nearby', 1, '2nd floor washroom');
const wifi = report(esha, 'wifi', 'Library', 'Wifi not working on the first floor reading area', 2);
report(asha, 'wifi', 'Library', 'Internet is down near the reading area', 1);
updateIssue(db, admin, wifi, { status: 'in_progress', assigned_to: 'IT helpdesk', note: 'Access point being replaced' }, ago(1));

// Waiting on its reporter: sign in as Bimal to see the confirm / reopen prompt.
const projector = report(bimal, 'classroom', 'Academic Block', 'Projector not working in room 204', 5, 'Room 204');
updateIssue(db, admin, projector, { status: 'awaiting_confirmation', assigned_to: 'AV technician', note: 'Lamp replaced' }, ago(0.3));
report(chen, 'furniture', 'Academic Block', 'Broken desk and loose bench in the seminar hall', 0.5);
const toilet = report(esha, 'sanitation', 'Girls Hostel', 'Washroom very dirty and no water for cleaning', 6);
updateIssue(db, admin, toilet, { status: 'awaiting_confirmation', note: 'Cleaned and water supply restored' }, ago(5.2));
confirmFix(db, esha, toilet, ago(5));

console.log(`Seeded.\n  Admin:   ${adminEmail} / ${process.env.ADMIN_PASSWORD ? '(your ADMIN_PASSWORD)' : adminPassword}\n  Student: asha@campusfix.local / student1234 (also bimal, chen, divya, esha)`);
