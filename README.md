# CampusFix

**Problem 2: The Campus Issue Management Gap** (Hackathon Arunachal 2026)

CampusFix replaces WhatsApp messages and verbal complaints with one place to report, group, prioritise, assign and track campus problems until they are fixed.

## What it does

| Problem in the brief | How CampusFix handles it |
|---|---|
| Students don't know who to report to | Pick a category and location. The issue is **auto-routed** to the right team (Electrical, IT, Civil & Plumbing, Housekeeping, ...). |
| Same problem reported many times | **Duplicates are grouped.** An open issue with the same category and location, and similar wording, absorbs the new report instead of creating a second ticket. The match reason is stored and shown to admins. |
| Duplicates are better prevented than merged | While a student types, a live check shows "this may already be reported" with a one-click **Me too**. |
| Which issues need attention first? | A transparent **priority score**: category severity, number of reports, safety keywords (sparking, flooding, exposed wire...) and how long it has been unresolved. Admins see exactly why an issue ranks where it does. |
| No way to track a complaint | Students get **My complaints** with a status timeline (open, assigned, in progress, resolved) and admin notes. |
| No central view for administration | Admin **queue** sorted by priority, filterable by status, category and location, with all merged reports, reporter names and photos. |
| No visibility into recurring problems | **Insights**: hotspots by location, recurring faults, issues stuck for days, workload per team, average time to resolve, and duplicates merged. |

## Run it

Requires **Node.js 22.5 or newer** (uses the built-in `node:sqlite`). No database server and no API keys are needed.

```bash
npm install
npm run seed      # creates the admin account and demo data
npm start         # http://localhost:3000
```

Demo accounts created by the seed (change the admin with `ADMIN_EMAIL` / `ADMIN_PASSWORD`):

| Role | Email | Password |
|---|---|---|
| Admin | `admin@campusfix.local` | `admin1234` |
| Student | `asha@campusfix.local` | `student1234` (also bimal, chen, divya, esha) |

Run the tests with `npm test`.

Optional environment variables: `PORT` (default 3000), `DB_FILE` (default `data/campusfix.db`).

## 3-minute demo script

1. Sign in as **Asha**. Open *Report issue*, choose **Electrical / CS Block** and type "light not working".
2. The live check shows the existing "Tube light broken near the entrance" issue (3 reports). Click **Me too**: the count and priority rise instead of a duplicate being created.
3. Sign in as **Admin**. The queue shows that issue as **critical**, with the reasoning ("3 reports", category severity, age). Open it to see the merged reports with reporter names and the auto-group reason.
4. Assign it and mark it in progress with a note, then switch back to Asha: *My complaints* shows the new status on the timeline.
5. Open **Insights**: CS Block electrical is flagged as a **recurring problem**, and the tiles show how many duplicate complaints were merged.

## How duplicate detection works

`server/dedupe.js`. A new report is only compared with **active** issues that have the same **category and location**. Text is then normalised (stop words removed, synonyms mapped, so "broken", "dead" and "not working" count as the same fault) and scored with an overlap coefficient against the issue and all reports already merged into it. A score of 0.34 or more merges the report; the percentage is stored as the explanation. The rule is deliberately simple and explainable rather than a black box, so an admin can always see why two reports were grouped.

## Architecture

```
public/            Vanilla ES-module frontend (no build step)
  app.js router.js api.js dom.js
  views/           auth, report, issues (student), admin, insights, shared
server/
  app.js           Express app, security headers, error handling
  auth.js          scrypt password hashing, sessions, roles, login throttling
  issues.js        report submission, merging, me-too, listing, detail
  issue-routes.js  HTTP layer + validated photo upload (multer)
  admin.js         status / assignment updates with audit timeline
  dedupe.js        duplicate matching          priority.js  priority scoring
  insights.js      aggregate queries           db.js        SQLite schema
  config.js        categories, routing, locations
scripts/seed.js    admin + demo data (uses the real services)
test/              unit tests (logic) and API integration tests
```

Data model: `issues` (one per underlying problem) have many `reports` (one per student per issue), plus a `status_log` that powers the student-visible timeline.

## Security and reliability

- Passwords hashed with scrypt and per-user salt; random session tokens with expiry; role checks on every admin route.
- Failed-login throttling (5 attempts, 10 minute lock per email and IP).
- All input validated on the server (lengths, known categories and locations); SQL is fully parameterised.
- Photo uploads: JPG, PNG or WebP only, 5 MB limit, random server-side filenames, served with `nosniff`.
- The UI builds the DOM with `textContent`, so user text cannot inject HTML. A CSP restricts scripts to the same origin.
- Students never see other students' names, and only see their own report text.
- No secrets in the repo; `.env`, the database and uploads are git-ignored.

## Known limitations (MVP)

- Matching is rule-based, not semantic, and does not use photos or GPS. It can miss duplicates described in very different words.
- Sessions and login throttling are in memory / SQLite on a single server; there is no email verification or password reset, and no email or push notifications yet.
- Admin accounts are created by the seed script; there is no admin management UI.

## Possible next steps

Embedding-based matching for text and photos, map-pin locations, SLA timers with escalation, notifications, and per-department admin accounts.

## Credits

Express, multer, and Node's built-in `node:sqlite`. Built during Hackathon Arunachal 2026.

## Submission details

- **Project:** CampusFix (Problem 2, Campus Issue Management)
- **Tech stack:** Node.js, Express, SQLite, vanilla JavaScript
- **Deployment:** none; runs on localhost as described above
