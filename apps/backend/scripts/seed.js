// Creates the admin account and a small, realistic demo dataset (see src/services/seed.js).
//
//   npm run seed
//   ADMIN_EMAIL=you@nitap.ac.in ADMIN_PASSWORD=choose-one npm run seed
//   ADMIN_ONLY=1 ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run seed     only the admin account, no demo data (real use)
//
// In production (NODE_ENV=production) ADMIN_PASSWORD is required and must be strong: the demo password is public.
import { connectDb, disconnectDb } from '../src/db/connect.js';
import { SeedError, seedDatabase } from '../src/services/seed.js';

try {
  await connectDb();
  console.log(await seedDatabase({ adminOnly: Boolean(process.env.ADMIN_ONLY) }));
  await disconnectDb();
} catch (err) {
  if (err instanceof SeedError) console.error(err.message);
  else console.error(`Seeding failed: ${err.message}`);
  await disconnectDb().catch(() => {});
  process.exit(1);
}
