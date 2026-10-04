// Creates the admin account and a small, realistic demo dataset.
// All reports go through the real services (dedupe, priority, timeline), so the
// demo shows genuine behaviour. Timestamps are shifted back so the dashboards have history.
//
//   npm run seed
//   ADMIN_EMAIL=you@college.edu ADMIN_PASSWORD=choose-one npm run seed
import { createUser } from '../server/auth.js';
import { SECURITY_QUESTIONS } from '../server/config.js';
import { openDb } from '../server/db.js';
import { updateIssue } from '../server/admin.js';
import { addMeToo, confirmFix, submitReport } from '../server/issues.js';

const DAY = 86_400_000;
const now = Date.now();
const ago = (days) => now - days * DAY;

const db = openDb();
// Every demo student and staff member answers their security question with "nitap".
const security = { question: SECURITY_QUESTIONS[2], answer: 'nitap' };
const adminEmail = (process.env.ADMIN_EMAIL ?? 'admin@campusfix.local').toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD ?? 'admin1234';

if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(adminEmail)) {
  console.log(`Already seeded (${adminEmail} exists). Delete data/campusfix.db to start over.`);
  process.exit(0);
}

const admin = { id: createUser(db, { name: 'Campus Admin', email: adminEmail, password: adminPassword, role: 'admin' }), name: 'Campus Admin', role: 'admin' };
const student = (name) => ({ id: createUser(db, { name, email: `${name.toLowerCase()}@campusfix.local`, password: 'student1234', security }), name });
const [asha, bimal, chen, divya, esha] = ['Asha', 'Bimal', 'Chen', 'Divya', 'Esha'].map(student);

const staffMember = (name, department) => ({
  id: createUser(db, { name, email: `${name.toLowerCase()}@campusfix.local`, password: 'staff1234', role: 'staff', department, security }),
  name,
});
const ramesh = staffMember('Ramesh', 'Electrical Maintenance');
const priya = staffMember('Priya', 'IT Services');
staffMember('Suresh', 'Civil & Plumbing');
staffMember('Kavita', 'Housekeeping');
const arun = staffMember('Arun', 'Academic Section');

const report = (user, category, location, description, days, detail = '') =>
  submitReport(db, user, { category, location, detail, description }, null, ago(days)).issueId;

// An old B-II light fault, fixed - so the same fault returning shows up as "recurring".
const oldLight = report(chen, 'electrical', 'B-II', 'Tube light broken in the lab corridor', 12);
updateIssue(db, admin, oldLight, { assignee_id: ramesh.id }, ago(11));
updateIssue(db, admin, oldLight, { status: 'awaiting_confirmation', note: 'Tube replaced' }, ago(10.5));
confirmFix(db, chen, oldLight, ago(10));

// A third B-II electrical fault in 30 days (a different room), so the dashboard flags the block.
const fan = report(divya, 'electrical', 'B-II', 'Ceiling fan not working in the seminar room', 20, 'CS-102');
updateIssue(db, admin, fan, { assignee_id: ramesh.id }, ago(19));
updateIssue(db, admin, fan, { status: 'awaiting_confirmation', note: 'Capacitor replaced' }, ago(18.5));
confirmFix(db, divya, fan, ago(18));

// The headline scenario: three students, one underlying issue.
const light = report(asha, 'electrical', 'B-II', 'Tube light broken near the entrance', 4, 'Ground floor');
report(bimal, 'electrical', 'B-II', 'Light not working in the corridor', 3);
addMeToo(db, divya, light, ago(2));
updateIssue(db, admin, light, { assignee_id: ramesh.id, note: 'Replacement ordered' }, ago(2));

report(divya, 'water', 'Lohit-1', 'Water leaking from ceiling, exposed wire sparking nearby', 1, '2nd floor washroom');
const wifi = report(esha, 'wifi', 'Central Library', 'Wifi not working on the first floor reading area', 2);
report(asha, 'wifi', 'Central Library', 'Internet is down near the reading area', 1);
updateIssue(db, admin, wifi, { status: 'in_progress', assignee_id: priya.id, note: 'Access point being replaced' }, ago(1));

// Waiting on its reporter: sign in as Bimal to see the confirm / reopen prompt.
const projector = report(bimal, 'classroom', 'B-III', 'Projector not working in room 204', 5, 'Room 204');
updateIssue(db, admin, projector, { status: 'awaiting_confirmation', assignee_id: arun.id, note: 'Lamp replaced' }, ago(0.3));
report(chen, 'furniture', 'B-III', 'Broken desk and loose bench in the seminar hall', 0.5);
const toilet = report(esha, 'sanitation', 'Subansiri', 'Washroom very dirty and no water for cleaning', 6);
updateIssue(db, admin, toilet, { status: 'awaiting_confirmation', note: 'Cleaned and water supply restored' }, ago(5.2));
confirmFix(db, esha, toilet, ago(5));

console.log(`Seeded.\n  Admin:   ${adminEmail} / ${process.env.ADMIN_PASSWORD ? '(your ADMIN_PASSWORD)' : adminPassword}\n  Student: asha@campusfix.local / student1234 (also bimal, chen, divya, esha)\n  Staff:   ramesh@campusfix.local / staff1234 (also priya, suresh, kavita, arun)`);
