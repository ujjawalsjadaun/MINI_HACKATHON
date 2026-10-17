// Creates the admin account and a small, realistic demo dataset.
// All reports go through the real services (dedupe, priority, timeline), so the demo shows genuine behaviour.
// Timestamps are shifted back so the dashboards have history.
//
// In production (NODE_ENV=production) ADMIN_PASSWORD is required and must be strong: the demo password is public.
import { SECURITY_QUESTIONS } from '../config/constants.js';
import { Notification, User } from '../models/index.js';
import { createUser, isInstituteEmail } from './accounts.js';
import { submitFeedback } from './feedback.js';
import { updateIssue } from './issue-admin.js';
import { addMeToo, confirmFix, submitReport } from './issues.js';

// A setting that is wrong or missing; the message says how to fix it.
export class SeedError extends Error {}

const DAY = 86_400_000;

export const hasUsers = async () => Boolean(await User.exists({}));

// Creates the first admin and, unless `adminOnly`, the demo students, staff and issues.
// Returns the text to show the person who ran it.
export async function seedDatabase({ adminOnly = false, env = process.env } = {}) {
  const now = Date.now();
  const ago = (days) => now - days * DAY;

  const adminEmail = (env.ADMIN_EMAIL ?? 'admin@nitap.ac.in').toLowerCase();
  const adminPassword = env.ADMIN_PASSWORD ?? 'admin1234';

  if (adminOnly || env.NODE_ENV === 'production') {
    if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 10 || env.ADMIN_PASSWORD === 'admin1234') {
      throw new SeedError('Set ADMIN_PASSWORD to a private password of at least 10 characters (the demo password is public).');
    }
  }
  if (!isInstituteEmail(adminEmail)) {
    throw new SeedError(`ADMIN_EMAIL must end in @nitap.ac.in, or the admin could not sign in (got ${adminEmail}).`);
  }
  if (await User.exists({ email: adminEmail })) {
    return `Already seeded (${adminEmail} exists). Drop the database to start over.`;
  }

  const admin = { id: await createUser({ name: 'Campus Admin', email: adminEmail, password: adminPassword, role: 'admin' }), name: 'Campus Admin', role: 'admin' };
  if (adminOnly) return `Admin account created: ${adminEmail}. Sign in, then add staff on the People page.`;

  // Every demo student and staff member answers their security question with "nitap".
  const security = { question: SECURITY_QUESTIONS[2], answer: 'nitap' };
  const student = async (name) => ({ id: await createUser({ name, email: `${name.toLowerCase()}@nitap.ac.in`, password: 'student1234', security }), name });
  const students = [];
  for (const name of ['Asha', 'Bimal', 'Chen', 'Divya', 'Esha']) students.push(await student(name));
  const [asha, bimal, chen, divya, esha] = students;

  const staffMember = async (name, department) => ({
    id: await createUser({ name, email: `${name.toLowerCase()}@nitap.ac.in`, password: 'staff1234', role: 'staff', department, security }),
    name,
  });
  const ramesh = await staffMember('Ramesh', 'Electrical Maintenance');
  const priya = await staffMember('Priya', 'IT Services');
  await staffMember('Suresh', 'Civil & Plumbing');
  await staffMember('Kavita', 'Housekeeping');
  const arun = await staffMember('Arun', 'Academic Section');

  const report = async (user, category, location, description, days, detail = '', urgency = 'normal', pin = null) =>
    (await submitReport(user, { category, location, detail, description, urgency, pin }, null, ago(days))).issueId;

  // An old B-II light fault, fixed - so the same fault returning shows up as "recurring".
  const oldLight = await report(chen, 'electrical', 'B-II', 'Tube light broken in the lab corridor', 12);
  await updateIssue(admin, oldLight, { assignee_id: ramesh.id }, ago(11));
  await updateIssue(admin, oldLight, { status: 'awaiting_confirmation', note: 'Tube replaced' }, ago(10.5));
  await confirmFix(chen, oldLight, ago(10));
  await submitFeedback(chen, oldLight, { rating: 5, comment: 'Quick fix, thanks.' }, ago(9.5));

  // A third B-II electrical fault in 30 days (a different room), so the dashboard flags the block.
  const fan = await report(divya, 'electrical', 'B-II', 'Ceiling fan not working in the seminar room', 20, 'CS-102');
  await updateIssue(admin, fan, { assignee_id: ramesh.id }, ago(19));
  await updateIssue(admin, fan, { status: 'awaiting_confirmation', note: 'Capacitor replaced' }, ago(18.5));
  await confirmFix(divya, fan, ago(18));
  await submitFeedback(divya, fan, { rating: 3, comment: 'It works now, but the fan is noisier than before.' }, ago(17.5));

  // The headline scenario: three students, one underlying issue.
  const light = await report(asha, 'electrical', 'B-II', 'Tube light broken near the entrance', 4, 'Ground floor', 'normal', { x: 0.255, y: 0.2 });
  await report(bimal, 'electrical', 'B-II', 'Light not working in the corridor', 3);
  await addMeToo(divya, light, ago(2));
  await updateIssue(admin, light, { assignee_id: ramesh.id, note: 'Replacement ordered' }, ago(2));

  await report(divya, 'water', 'Lohit-1', 'Water leaking from ceiling, exposed wire sparking nearby', 1, '2nd floor washroom', 'emergency', { x: 0.735, y: 0.34 });
  const wifi = await report(esha, 'wifi', 'Central Library', 'Wifi not working on the first floor reading area', 2, '', 'urgent', { x: 0.13, y: 0.41 });
  await report(asha, 'wifi', 'Central Library', 'Internet is down near the reading area', 1);
  await updateIssue(admin, wifi, { status: 'in_progress', assignee_id: priya.id, note: 'Access point being replaced' }, ago(1));

  // Waiting on its reporter: sign in as Bimal to see the confirm / reopen prompt.
  const projector = await report(bimal, 'classroom', 'B-III', 'Projector not working in room 204', 5, 'Room 204');
  await updateIssue(admin, projector, { status: 'awaiting_confirmation', assignee_id: arun.id, note: 'Lamp replaced' }, ago(0.3));
  await report(chen, 'furniture', 'B-III', 'Broken desk and loose bench in the seminar hall', 0.5);
  const toilet = await report(esha, 'sanitation', 'Subansiri', 'Washroom very dirty and no water for cleaning', 6);
  await updateIssue(admin, toilet, { status: 'awaiting_confirmation', note: 'Cleaned and water supply restored' }, ago(5.2));
  await confirmFix(esha, toilet, ago(5));
  await submitFeedback(esha, toilet, { rating: 2, comment: 'Cleaned, but the water supply failed again after two days.' }, ago(4.5));

  // The history above ran through the real services, which raise notifications; nobody has missed anything yet.
  for (const n of await Notification.find({ read_at: null }).select('id created_at -_id').lean()) {
    await Notification.updateOne({ id: n.id }, { $set: { read_at: n.created_at } });
  }

  return [
    'Seeded.',
    `  Admin:   ${adminEmail} / ${env.ADMIN_PASSWORD ? '(your ADMIN_PASSWORD)' : adminPassword}`,
    '  Student: asha@nitap.ac.in / student1234 (also bimal, chen, divya, esha)',
    '  Staff:   ramesh@nitap.ac.in / staff1234 (also priya, suresh, kavita, arun)',
  ].join('\n');
}
