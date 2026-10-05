# UniSeva Portal

**Problem 2: The Campus Issue Management Gap** (Hackathon Arunachal 2026)

**Designed and developed by Ujjawal Singh.**

UniSeva Portal replaces WhatsApp messages and verbal complaints with one place to report, group, prioritise, assign and track campus problems until a reporter confirms they are fixed.

## What it does

| Problem in the brief | How UniSeva Portal handles it |
|---|---|
| Students don't know who to report to | Pick a category, a place from the NIT Arunachal Pradesh campus map (blocks, hostels, residences, facilities) and a floor. The issue is **auto-routed** to the right team (Electrical, IT, Civil & Plumbing, Housekeeping, ...). |
| Exact locations are hard to describe | **QR location tags.** Print a sticker per block or room; scanning it opens the report form with the location already filled in. |
| The same problem is reported many times | **Prevented before filing.** As soon as a location is chosen, the form lists what is already open there ("reported by 3 people, is this yours?"). One tap on **Me too** joins that issue. |
| ...and any that still slip through | **Grouped automatically.** An open issue with the same category and location (and not a different room) absorbs the new report if the wording is similar. The reason is stored and shown to admins. |
| Which issues need attention first? | A transparent **priority score** (see below). Admins see the exact breakdown behind every ranking. |
| How urgent is it, really? | The reporter rates a problem **Normal, Urgent or Emergency**. The highest rating on an issue adds a visible amount to its priority (once, not per reporter, so a crowd cannot inflate it), and the team sees every rating. |
| Where exactly is it? | A **schematic campus map**: tap a building to pick the place and tap anywhere to drop a **pin** on the exact spot. A **Problem map** page shows every open problem as a pin coloured by priority, and each issue page shows where it is. |
| Hard to find what matters in a long list | The **Campus feed** has **Open** and **Solved** tabs, category chips with counts, a place filter, and problems grouped under their category (most urgent group first). |
| Was it really fixed well? | After a fix is confirmed, the students who reported it **rate it 1 to 5 stars** with an optional comment and can change it later. Staff read the comments (without names), admins also see who wrote them, and **Insights** shows the average rating, the rating per category and the lowest-rated fixes. |
| Who do I call right now? | An **Emergency contacts** page (call-to-tap numbers, printable). A report rated **Emergency** shows a "call for help first" box with 112, the doctors, ambulance drivers and security in-charge; hostel problems show the hostel office; and the staff issue page lists the engineering cell, hostel office or emergency numbers that fit the issue. |
| Not everyone reads English | A **language switcher** (English, Hindi, Assamese, Bengali, Odia) in the menu bar. The whole interface switches at once and the choice is remembered. |
| Nothing happens after reporting | **SLA deadlines per category** (water 24h, electrical 48h, furniture 7 days...). Past the deadline an issue is flagged **overdue** and its priority rises. |
| "Resolved" tickets that are not | A team can only mark an issue **awaiting confirmation**. A **reporter confirms** the fix (closing it) or **reopens** it. A new report or "me too" on an unconfirmed fix also reopens it. |
| No way to track a complaint | Students see a status timeline (open, assigned, in progress, awaiting confirmation, resolved) with team notes. |
| No central view for administration | Admin **queue** sorted by priority with filters, all merged reports, reporter names and photos, and assignment to a named staff member. |
| No visibility into recurring problems | **Insights:** hotspots by location, recurring faults (3+ in 30 days), average time to resolve per category, overdue and stuck issues, workload per team, claimed fixes that were reopened, and duplicates merged. |

### Roles

| Role | Can do |
|---|---|
| **Student** | Report issues (with photo), join existing issues, track their complaints, confirm or reopen a claimed fix, rate a confirmed fix. Sees only their own report text, never other students' names. |
| **Staff** | Sees **only issues assigned to them**; updates status and adds notes. Cannot assign, close, see other work, see reporter names, or view insights. |
| **Admin** | Sees everything, assigns issues to named staff, views insights, prints QR tags. Cannot close an issue on a reporter's behalf. |

### How priority is computed

`server/priority.js`. Every score comes with its reasons, which are shown in the admin views:

```
category severity (x10)          electrical / water / sanitation highest
+ 12 * log2(reports + 1), max 30 from 2+ reports: more reporters = more urgent
+ 10 / 25                       reporter rated it urgent / emergency (highest rating counts once)
+ 25                             danger words: spark, flood, smoke, exposed wire ...
+ 4 per day unresolved, max 20   age
+ 20                             past the category SLA deadline
+ 15 per reopening, max 30       a claimed fix did not hold
```

The label is critical (60+), high (45+), medium (25+) or low. The SLA clock pauses while a fix awaits confirmation and stops when resolved.

### How duplicate detection works

`server/dedupe.js`. A new report is compared only with **active** issues that have the same **category and location** and do not name a **different room** (so CS-101 and CS-102 never merge). Text is normalised (stop words removed, synonyms mapped, so "broken", "dead" and "not working" count as the same fault) and scored with an overlap coefficient against the issue and every report already merged into it. A score of 0.34 or more merges the report, and the percentage is stored as the explanation. The rule is deliberately simple and explainable rather than a black box, so an admin can always see why two reports were grouped.

## Interface and accessibility

- Plain HTML, CSS and JavaScript (no build step) with an institutional look: a navy and gold theme, the host institute's logo and a clear "student project, not an official service" notice on every page.
- Responsive down to phone width, light and dark themes (the page background is the institute's own campus photo, softened under a translucent overlay, and darkened in dark mode), and a print stylesheet for the QR stickers.
- Five languages (English, Hindi, Assamese, Bengali, Odia). The English text in the code is the lookup key and falls back to itself, so a missing translation shows English instead of breaking the page. A test fails if any text in the code, the HTML or the server's fixed messages lacks a translation in any of the four languages. Names that are not translated on purpose: building names and issue titles or descriptions (written by users), the institute's official notice titles, and server messages that have a name or number built in. The Hindi, Assamese, Bengali and Odia text was written by an AI assistant and **should be reviewed by native speakers** before real use.
- Keyboard and screen-reader friendly: skip link, labelled form fields, visible focus rings, live regions for results, text alternatives for images and QR codes, and status shown as text as well as colour.

## Run it

Requires **Node.js 22.13 or newer** (uses the built-in `node:sqlite`). No database server and no API keys are needed.

**On Windows, just double-click `start.bat`.** It installs the packages the first time, creates the demo accounts and data on the first run, opens the browser at http://localhost:3000, and restarts the site by itself if it ever stops. Keep its window open (minimise it); closing the window stops the site.

To have the site **start by itself whenever you sign in to Windows**, double-click `autostart-on.bat` once. It puts a shortcut in your Startup folder that runs `start.bat` in a minimised window; `autostart-off.bat` removes it.

Or from a terminal, on any system:

```bash
npm install
npm start         # http://localhost:3000  (use PORT=3001 npm start if 3000 is taken)
```

The first start fills an empty database with the demo accounts and issues (set `NO_AUTO_SEED=1` to start empty); `npm run seed` does the same by hand. If you pulled a newer version, delete the `data/` folder first, because the schema has changed.

Demo accounts created by the seed (change the admin with `ADMIN_EMAIL` / `ADMIN_PASSWORD`; the email must end in `@nitap.ac.in`):

| Role | Email | Password |
|---|---|---|
| Admin | `admin@nitap.ac.in` | `admin1234` |
| Student | `asha@nitap.ac.in` | `student1234` (also bimal, chen, divya, esha) |
| Staff | `ramesh@nitap.ac.in` | `staff1234` (also priya, suresh, kavita, arun) |

Every demo student and staff member has the security question "favourite school teacher" with the answer **`nitap`** (used by Forgot password below). The admin account has none and cannot be reset that way.

Run the tests with `npm test` (unit tests for matching, priority and SLA rules, and API tests covering the report, confirm, staff and admin flows and the role boundaries).

The seeded admin password is public in this README. Set your own with `ADMIN_PASSWORD=... npm run seed` before sharing the app with anyone.

Optional environment variables: `PORT` (default 3000), `DB_FILE` (default `data/campusfix.db`).

### Forgot password (security question)

No email service is needed. When registering, a user picks one of six security questions and gives an answer. If they forget their password, **Forgot your password?** on the sign-in page asks for their email, shows their question, and a correct answer plus a new password completes the reset.

- The answer is stored only as a salted hash (scrypt) and compared ignoring case and extra spaces.
- Five wrong answers lock resets for that account for 10 minutes (and 30 per IP address), so an answer cannot be guessed at. A successful reset signs the user out on every device.
- The page cannot be used to find out who has an account: an unknown email gets a question too (always the same one for the same email), and a wrong answer gives one generic message.
- **Admin accounts are excluded** because a guessable answer is not enough protection for the most powerful account; an admin password is reset by re-running the seed on a fresh database.
- Accounts created before this feature see a banner and can add a question from **Security** in the menu (after confirming their current password).

Security questions are weaker than an emailed link, since someone who knows the answer (a friend, a classmate) could reset the account. That trade-off is the price of needing no mail server.

### Emergency contacts

The institute's emergency directory (names and personal mobile numbers of doctors, nurses, drivers and staff) is **not stored in the repository**, because the repository is public. The code ships only the public numbers (112 and the Itanagar police and fire control rooms). The full directory is read from a git-ignored file and is only ever sent to signed-in users:

```bash
mkdir private
cp server/emergency-contacts.example.json private/emergency-contacts.json   # then replace the fake entries
```

Each entry has a `role`, a `name`, a list of `phones` and `tags` that decide where it is offered: `emergency` (shown when a report is rated Emergency), `hostel`, `engineering` (building faults), `medical`, `ambulance`, `security`, `police`, `fire`, `night`. Phone numbers are validated before they become `tel:` links, a broken file is ignored with a warning, and the file is re-read on every request, so edits need no restart. Set `EMERGENCY_FILE` to keep it somewhere else. Keep the numbers current: UniSeva Portal only displays them and never places calls or messages.

### Smart suggestions on the report form

**Smart suggest** reads the student's rough description and proposes a category, a tidier wording and a safety warning. Nothing is applied until the student taps **Use this**. It needs no account, no API key and no internet.

- **Built-in rules (default).** Keyword lists per category, the same danger words the priority score uses, and light tidying of the text. It never invents details, and the reason it gives ("Matched "leak", "pipe"") is always explainable. This is rule-based matching, not a language model.
- **Optional local model.** If you run [Ollama](https://ollama.com) on the same computer, `OLLAMA_MODEL=llama3.2 npm start` (set `OLLAMA_URL` if it is not on `http://127.0.0.1:11434`) makes the helper ask that model first. Its answer is re-validated on the server (the category must be a real one), and any failure falls back to the rules. Text never leaves your machine.

The helper is student-only and limited to 20 requests a minute per student. The box shows which engine produced the suggestion.

### Opening it from another computer or phone

`npm start` prints an `On your network:` address such as `http://192.168.1.20:3000`. Other devices must use that address, never `localhost` (which means their own machine), and must be on the same Wi-Fi. Allow Node.js through the Windows firewall if asked. Some campus or public Wi-Fi blocks device-to-device traffic; a phone hotspot works as a fallback.

On a fresh clone, `start.bat` (or `npm install` then `npm start`) sets everything up, including the demo accounts. The `On your network:` address changes when the computer joins a different Wi-Fi, so print QR stickers from the address shown at the time.

### QR tags on a phone

Sign in as admin and open **QR tags**. When you are on `localhost`, the page fills in this computer's network address by itself (phones cannot open `localhost`) and lists any other addresses it found; it warns if the address is still `localhost`. Print the page or scan a sticker directly from the screen. A scan while signed out goes through sign-in and then lands on the pre-filled form.

## 3-minute demo script

The seed is built for this walk-through (reset with a fresh `data/` folder and `npm run seed` before presenting).

1. **Scan to report.** As admin, open **QR tags** and show the **B-II** sticker (scan it with a phone on the same Wi-Fi, or open its link). Sign in as **Chen**: the form opens with B-II already filled in, and lists "Tube light broken near the entrance, reported by 3 people". Tap **Me too, this is mine**. The report count goes to 4 instead of a duplicate being filed.
2. **Prioritise and assign.** Sign in as **Admin**. The queue is sorted by priority: the sparking-wire water leak and the tube light (now 4 reports, overdue) are **critical**. Open the water leak to show the score breakdown (severity, danger words, past deadline), then assign it to **Suresh** from the named staff list.
3. **Staff see only their work.** Sign in as **Suresh**: his queue shows only that leak. Set it to *in progress*, then *Fixed - ask reporters to confirm*. Note he has no Insights or QR links.
4. **Nobody closes a ticket for the reporter.** Sign in as **Divya** (who reported the leak): *My complaints* asks whether it is really fixed. Also try **Bimal**, whose projector fix is waiting: choose **No, reopen it** and watch it return to the team with higher priority.
5. **Insights.** As admin, open **Insights**: B-II electrical is a **recurring problem** (3 in 30 days), plus overdue issues, reopened fixes, resolution time per category and duplicates merged.

## Architecture

```
public/            Vanilla ES-module frontend (no build step)
  index.html styles.css   page shell, theme, print styles
  app.js router.js api.js dom.js i18n.js   i18n.js: language switching, lang/ holds the Hindi, Assamese, Bengali and Odia dictionaries
  assets/          host institute logo (see Credits)
  views/           auth, security, report, issues (student), admin (admin + staff), insights, qr, shared,
                   place-picker (area / place / floor), campus-map (schematic SVG map and pins), map (problem map page)
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
- Only institute addresses: registering, signing in and resetting a password all require an email ending exactly in `@nitap.ac.in` (any letter case). The server enforces it; the forms also say so as you type. Look-alikes such as `@nitap.ac.in.evil.com` or `@fake-nitap.ac.in` are rejected. Databases seeded before this rule have their `@campusfix.local` demo accounts moved to `@nitap.ac.in` automatically on startup.
- Failed-login throttling (5 attempts, 10 minute lock per email and IP).
- All input validated on the server (lengths, known categories and locations, known staff); SQL is fully parameterised.
- Photo uploads: JPG, PNG or WebP only, 5 MB limit, random server-side filenames, served with `nosniff`.
- The UI builds the DOM with `textContent`, so user text cannot inject HTML. A CSP restricts scripts to the same origin; other security headers are set too.
- Staff and students never see reporter names; students see only their own report text.
- No secrets or personal data in the repo; `.env`, `private/` (the emergency directory), the database and uploads are git-ignored.

## Known limitations (MVP)

- Duplicate matching is rule-based, not semantic, and does not compare photos. It can miss duplicates described in very different words. Admins cannot yet merge issues by hand.
- "Following" an issue means it appears in the student's My complaints with live status; there are no email or push notifications.
- A claimed fix stays open until a reporter responds; there is no auto-close timer.
- Staff and admin accounts are created by the seed script; there is no account-management UI or email verification. The `@nitap.ac.in` rule checks the address format only; without an email service it cannot prove the person owns that mailbox. Password reset uses security questions, which are convenient but weaker than an emailed link.
- The campus map is a schematic drawing laid out by area, not a survey: building positions are illustrative and not to scale. Issues without a dropped pin are shown faded inside their building.
- Translations: error messages that have a name or number built in (for example a field-length message) stay in English, dates use the browser's own formatting, and the Hindi, Assamese, Bengali and Odia text needs review by native speakers.
- Smart suggest only suggests; it never files or changes a report by itself, and it can be wrong. By default it is keyword rules, not a language model. Anonymous reporting was left out on purpose.

## Possible next steps

Embedding-based text and photo matching, manual merge for admins, notifications, an auto-close timer for unanswered fixes, anonymous reporting for sensitive categories, and account management.

## Information from the official site

The sign-in page shows facts about the host institute that were copied from [nitap.ac.in](https://www.nitap.ac.in) (status, establishment, address, vision and mission) with their source pages and retrieval date, kept in `server/institute.js`. The **Latest notices** list is fetched live from the site's home page, cached for an hour and simply hidden if the site cannot be reached. The campus map's hostel names (Lohit, Subansiri, Papum) follow the institute's hostel admission notice. None of this makes UniSeva Portal an official service.

## Credits

**Developer: Ujjawal Singh .** UniSeva Portal was designed and built by Ujjawal Singh  during Hackathon Arunachal 2026, using Express, multer, qrcode and Node's built-in `node:sqlite`.

The code is released under the [MIT License](LICENSE), copyright (c) 2026 Ujjawal Singh . The license allows reuse, but **every copy must keep that copyright notice**, so removing the developer credit from the project or from any copy of it breaks the license. The credit is also shown in the footer of every page, and an automated test (`test/credit.test.js`) fails if it is removed. Changes to this repository need the owner's approval (`.github/CODEOWNERS`).

The NIT Arunachal Pradesh logo in `public/assets/nitap-logo.png` is the institute's own, downloaded from [nitap.ac.in](https://www.nitap.ac.in) and shown unmodified. It is the property of the institute and is used only to identify the hackathon's host institution. UniSeva Portal is a student project and is **not** an official service of NIT Arunachal Pradesh; every page says so.

The background photo `public/assets/nitap-campus.jpg` (Academic Block III) is the hero image on the institute's home page, downloaded from [nitap.ac.in](https://www.nitap.ac.in/images/panorama.jpg). It is the institute's property; the only changes are scaling it down to 1920 px wide and compressing it, and it is shown under a translucent overlay. It is credited in the page footer and used only to show the host campus.

## Submission details

- **Project:** UniSeva Portal ( Campus Issue Management)
- **Developer:** Ujjawal Singh 
- **Tech stack:** Node.js, Express, SQLite, vanilla JavaScript
- **Deployment:** none; runs on localhost as described above
