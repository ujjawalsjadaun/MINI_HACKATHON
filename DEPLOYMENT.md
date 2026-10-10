# Running UniSeva Portal for real

This guide is for the person at the college who will host and look after the site. It assumes no knowledge of the code.

## What you need

- A small always-on computer or cloud server (1 CPU and 1 GB of memory is enough) that you control, with **Docker** installed. A campus virtual machine or a $5 a month cloud server both work.
- A web address for it, for example `issues.nitap.ac.in`, that your IT office points at the server. Phones, laptops and the QR stickers all use this one address.
- Ports **80 and 443** open to the internet (or to the campus network, if the site is only for the campus).
- A private password for the first admin account.

## Start it (about 10 minutes)

```bash
git clone https://github.com/ujjawalsjadaun/MINI_HACKATHON.git
cd MINI_HACKATHON
cp .env.example .env
```

Open `.env` and set:

| Setting | What to put |
|---|---|
| `ADMIN_EMAIL` | The admin's institute address, ending in `@nitap.ac.in` |
| `ADMIN_PASSWORD` | A private password, at least 10 characters. It only needs to be in `.env` for the first start; the site stores it as a hash, and the admin can change it later on the **Security** page |
| `SITE_ADDRESS` | The address of the site, such as `issues.nitap.ac.in` |

Then:

```bash
docker compose up -d --build
```

Within a minute the site is at `https://your-address`. HTTPS is set up automatically (the certificate is obtained and renewed by itself). Sign in as the admin and open **People** to add the staff.

If you cannot use Docker, `npm install` then `NODE_ENV=production npm start` runs the same site, but you must put your own HTTPS proxy in front of it and set `TRUST_PROXY=1`.

## First day

1. **Add the team** on the **People** page: one account per staff member, with their department. Give each the starting password in person or by phone and ask them to change it from **Security**.
2. **Print the QR stickers** (admin menu, **QR tags**). The page uses the site's address, so open it at the real `https://` address, not from the server's own screen.
3. **Add the emergency directory** if you have one (see below).
4. **Try a full report** yourself: register a test student, report a fault, assign it, mark it fixed, confirm it.

The site starts with only the admin. There are no demo students or issues. (Setting `SEED_DEMO=1` creates demonstration data; use that only for demos.)

## Who can sign in

- **Students** register themselves. Only addresses ending in `@nitap.ac.in` are accepted.
- **Staff and admins** are created by an admin on the **People** page. They cannot register themselves.
- The site checks that an address *looks* institutional. Without an email service it cannot prove the person owns that mailbox. If that matters to the college, the next step is to connect the college's mail or Google sign-in (see "Possible next steps" in the README).
- Passwords are stored only as salted hashes. Forgotten student passwords are reset through the security question chosen at registration; an admin resets staff passwords on the **People** page.

## Backups

The site makes a backup **every day** (database and photos) and keeps the newest 14, in the `data` volume under `backups/`. Change this with `BACKUP_KEEP` and `BACKUP_EVERY_HOURS` in `.env`.

A backup on the same disk does not protect against the disk failing, so also copy it elsewhere regularly. For example, a nightly job on the server:

```bash
docker compose cp app:/data/backups ./offsite-copy      # then copy ./offsite-copy to another machine or storage
```

**Do a restore drill once, before you need it:**

```bash
docker compose stop app
docker compose run --rm app npm run restore                  # lists the backups
docker compose run --rm app npm run restore -- backup-20261010-020000
docker compose start app
```

A restore keeps the data it replaced next to it (`*.before-restore-<time>`), so it can be undone. To take a backup right now: `docker compose exec app npm run backup`.

## Updating to a new version

```bash
git pull
docker compose up -d --build
```

The site restarts in a few seconds and your data is untouched. Take a backup first if you want to be careful (`docker compose exec app npm run backup`).

## Keeping an eye on it

- **Is it up?** `https://your-address/api/health` answers `{"ok":true}`. Point a free uptime checker (for example UptimeRobot) at it to be told when it is down.
- **Logs:** `docker compose logs -f app`. Each request is one line (method, path, status, time). Query strings and sign-in tokens are never logged, but IP addresses are, as in any web server log.
- **Restarts:** the containers restart themselves after a crash or a server reboot. The site finishes the requests in progress before it stops.

## Day-to-day jobs

| Job | How |
|---|---|
| A new staff member joins | **People > Add a staff member or admin** |
| Someone leaves the team | **People > Deactivate**. They are signed out at once and their unfinished issues go back to the queue |
| Someone forgot their staff password | **People > Reset password** |
| Students cannot sign in | Check the address ends in `@nitap.ac.in`; they can reset with their security question |
| Reprint stickers after a change of address | **QR tags**, then print |

## Emergency directory

The full directory (names and personal phone numbers) is deliberately not in the code. Without it the site shows only the public numbers (112, police and fire). To add it, create a file in the format of `server/emergency-contacts.example.json`, put it inside the `data` volume, and set `EMERGENCY_FILE=/data/emergency-contacts.json` in `.env`. It is only ever sent to signed-in users. Keep it out of Git and keep it current.

## Privacy

The site stores names, institute email addresses, hashed passwords, complaint text, optional photos and location pins. Decide and publish who can see complaints (admins see everything, staff see only issues assigned to them, students see only their own and the shared campus feed without reporter names) and how long you keep resolved complaints. Notifications are removed after 90 days. Deleting old data is currently done on the server by an administrator; there is no automatic retention rule for issues.

## Security summary

- HTTPS only through the proxy, with HSTS; security headers and a strict content policy on every response.
- Passwords hashed with scrypt; roles enforced on the server for every request; failed sign-ins are rate limited; the whole API and account creation are rate limited per connection address (generous, so a hostel behind one Wi-Fi address is not blocked).
- The container runs as an unprivileged user. Secrets live only in `.env` on the server.
- Production refuses to create an admin with a missing, short or public (`admin1234`) password.

## Limits to be aware of

- One server, one database file: this is built for a campus, not for thousands of requests per second. Restore from backup if the server is lost; there is no automatic failover.
- No email: no email notifications and no email-based password reset. Notifications appear in the site (the bell).
- The map is a drawing, not a survey.
- The translations (Hindi, Assamese, Bengali, Odia) were written by an AI assistant and should be reviewed by native speakers.

## Go-live checklist

- [ ] Domain points at the server and `https://` works with a valid certificate
- [ ] `.env` has a private `ADMIN_PASSWORD`; `.env` is not in Git
- [ ] Signed in as admin; staff accounts created; a test report went through the whole cycle
- [ ] QR stickers printed from the real address and scanned from a phone
- [ ] Uptime checker pointed at `/api/health`
- [ ] A backup exists, a copy is stored elsewhere, and a restore has been tried once
- [ ] Someone is named to look at the queue every working day, and a policy exists for deadlines
- [ ] Privacy note published (who sees what, how long it is kept)
- [ ] Pilot with one hostel and one block for two to four weeks before the whole campus
