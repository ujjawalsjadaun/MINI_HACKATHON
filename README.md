# CampusFix

**Problem 2: The Campus Issue Management Gap** (Hackathon Arunachal 2026)

CampusFix replaces WhatsApp messages and verbal complaints with one place to report, group, prioritise, assign and track campus problems until a reporter confirms they are fixed.

## What it does

| Problem in the brief | How CampusFix handles it |
|---|---|
| Students don't know who to report to | Pick a category and location. The issue is **auto-routed** to the right team (Electrical, IT, Civil & Plumbing, Housekeeping, ...). |
| Exact locations are hard to describe | **QR location tags.** Print a sticker per block or room; scanning it opens the report form with the location already filled in. |
| The same problem is reported many times | **Prevented before filing.** As soon as a location is chosen, the form lists what is already open there ("reported by 3 people, is this yours?"). One tap on **Me too** joins that issue. |
| ...and any that still slip through | **Grouped automatically.** An open issue with the same category and location (and not a different room) absorbs the new report if the wording is similar. The reason is stored and shown to admins. |
| Which issues need attention first? | A transparent **priority score** (see below). Admins see the exact breakdown behind every ranking. |
| Nothing happens after reporting | **SLA deadlines per category** (water 24h, electrical 48h, furniture 7 days...). Past the deadline an issue is flagged **overdue** and its priority rises. |
| "Resolved" tickets that are not | A team can only mark an issue **awaiting confirmation**. A **reporter confirms** the fix (closing it) or **reopens** it. A new report or "me too" on an unconfirmed fix also reopens it. |
| No way to track a complaint | Students see a status timeline (open, assigned, in progress, awaiting confirmation, resolved) with team notes. |
| No central view for administration | Admin **queue** sorted by priority with filters, all merged reports, reporter names and photos, and assignment to a named staff member. |
| No visibility into recurring problems | **Insights:** hotspots by location, recurring faults (3+ in 30 days), average time to resolve per category, overdue and stuck issues, workload per team, claimed fixes that were reopened, and duplicates merged. |

### Roles

| Role | Can do |
|---|---|
| **Student** | Report issues (with photo), join existing issues, track their complaints, confirm or reopen a claimed fix. Sees only their own report text, never other students' names. |
| **Staff** | Sees **only issues assigned to them**; updates status and adds notes. Cannot assign, close, see other work, see reporter names, or view insights. |
| **Admin** | Sees everything, assigns issues to named staff, views insights, prints QR tags. Cannot close an issue on a reporter's behalf. |

### How priority is computed

`server/priority.js`. Every score comes with its reasons, which are shown in the admin views:

```
category severity (x10)          electrical / water / sanitation highest
+ 12 * log2(reports + 1), max 30 more reporters = more urgent
+ 25                             danger words: spark, flood, smoke, exposed wire ...
+ 4 per day unresolved, max 20   age
+ 20                             past the category SLA deadline
+ 15 per reopening, max 30       a claimed fix did not hold
```

The label is critical (60+), high (45+), medium (25+) or low. The SLA clock pauses while a fix awaits confirmation and stops when resolved.

### How duplicate detection works

`server/dedupe.js`. A new report is compared only with **active** issues that have the same **category and location** and do not name a **different room** (so CS-101 and CS-102 never merge). Text is normalised (stop words removed, synonyms mapped, so "broken", "dead" and "not working" count as the same fault) and scored with an overlap coefficient against the issue and every report already merged into it. A score of 0.34 or more merges the report, and the percentage is stored as the explanation. The rule is deliberately simple and explainable rather than a black box, so an admin can always see why two reports were grouped.

## Run it

Requires **Node.js 22.5 or newer** (uses the built-in `node:sqlite`). No database server and no API keys are needed.

```bash
npm install
npm run seed      # creates demo accounts and data
npm start         # http://localhost:3000  (use PORT=3001 npm start if 3000 is taken)
```

If you pulled a newer version, delete the `data/` folder before `npm run seed`, because the schema has changed.

Demo accounts created by the seed (change the admin with `ADMIN_EMAIL` / `ADMIN_PASSWORD`):

| Role | Email | Password |
|---|---|---|
| Admin | `admin@campusfix.local` | `admin1234` |
| Student | `asha@campusfix.local` | `student1234` (also bimal, chen, divya, esha) |
| Staff | `ramesh@campusfix.local` | `staff1234` (also priya, suresh, kavita, arun) |

Run the tests with `npm test`.

Optional environment variables: `PORT` (default 3000), `DB_FILE` (default `data/campusfix.db`).

### QR tags on a phone

Sign in as admin, open **QR tags**, and enter the address phones can reach this computer at (for example `http://192.168.1.20:3000`, since phones cannot open `localhost`). Print the page or scan a sticker directly from the screen. A scan while signed out goes through sign-in and then lands on the pre-filled form.

## 3-minute demo script

1. Open **QR tags** as admin and scan the **CS Block** sticker with a phone (or open its link). Sign in as **Asha**: the form opens with CS Block filled in and already lists "Tube light broken near the entrance, reported by 3 people". Tap **Me too, this is mine**.
2. Sign in as **Admin**. That issue is **critical** and **overdue**, and the breakdown shows why (3 reports, severity, age, past deadline). Open it to see the merged reports with reporter names, then assign it to **Ramesh** from the list of named staff.
3. Sign in as **Ramesh** (staff): his queue shows only that issue. Set it to *in progress*, then *Fixed - ask reporters to confirm*.
4. Back as **Bimal**, open *My complaints*: the projector fix is waiting for him. Choose **No, reopen it** and see it return to the team's queue with higher priority. (Or confirm it to close it.)
5. Open **Insights**: CS Block electrical is a **recurring problem** (3 in 30 days), plus overdue issues, reopened fixes, resolution time per category and duplicates merged.

## Architecture

```
public/            Vanilla ES-module frontend (no build step)
  app.js router.js api.js dom.js
  views/           auth, report, issues (student), admin (admin + staff), insights, qr, shared
server/
  app.js           Express app, security headers, error handling
  auth.js          scrypt password hashing, sessions, roles, login throttling
  issues.js        reporting, merging, me-too, nearby issues, confirm/reopen, listing, detail
  issue-routes.js  HTTP layer, role checks, validated photo upload (multer)
  admin.js         status and assignment updates with a timeline entry for each change
  dedupe.js        duplicate matching          priority.js  priority score and SLA
  insights.js      aggregate queries           db.js        SQLite schema
  qr.js            QR code rendering           config.js    categories, routing, SLAs, locations
scripts/seed.js    accounts and demo data (uses the real services)
test/              unit tests (logic) and API integration tests
```

Data model: `issues` (one per underlying problem) have many `reports` (one per student per issue), plus a `status_log` that powers the student-visible timeline. Staff are `users` with a role and department, and issues point at their assignee.

## Security and reliability

- Passwords hashed with scrypt and a per-user salt; random session tokens with expiry; role checks enforced **on the server** for every route (students, staff and admins each have their own boundary, covered by tests).
- Failed-login throttling (5 attempts, 10 minute lock per email and IP).
- All input validated on the server (lengths, known categories and locations, known staff); SQL is fully parameterised.
- Photo uploads: JPG, PNG or WebP only, 5 MB limit, random server-side filenames, served with `nosniff`.
- The UI builds the DOM with `textContent`, so user text cannot inject HTML. A CSP restricts scripts to the same origin; other security headers are set too.
- Staff and students never see reporter names; students see only their own report text.
- No secrets in the repo; `.env`, the database and uploads are git-ignored.

## Known limitations (MVP)

- Duplicate matching is rule-based, not semantic, and does not compare photos. It can miss duplicates described in very different words. Admins cannot yet merge issues by hand.
- "Following" an issue means it appears in the student's My complaints with live status; there are no email or push notifications.
- A claimed fix stays open until a reporter responds; there is no auto-close timer.
- Staff and admin accounts are created by the seed script; there is no account-management UI, email verification or password reset.
- Not built on purpose: AI auto-categorisation and anonymous reporting. Both risk being decoration or misleading without more time.

## Possible next steps

Embedding-based text and photo matching, manual merge for admins, notifications, an auto-close timer for unanswered fixes, anonymous reporting for sensitive categories, and account management.

## Credits

Express, multer, qrcode, and Node's built-in `node:sqlite`. Built during Hackathon Arunachal 2026.

## Submission details

- **Project:** CampusFix (Problem 2, Campus Issue Management)
- **Tech stack:** Node.js, Express, SQLite, vanilla JavaScript
- **Deployment:** none; runs on localhost as described above
