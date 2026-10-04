import os from 'node:os';

// Optional settings (SMTP for reset emails, OLLAMA_MODEL, PORT) can live in a local, git-ignored .env file.
try { process.loadEnvFile('.env'); } catch { /* no .env file: use the real environment only */ }

const port = Number(process.env.PORT) || 3000;

// node:sqlite needs a recent Node; explain that instead of crashing with an obscure import error.
let openDb, createApp;
try {
  ({ openDb } = await import('./db.js'));
  ({ createApp } = await import('./app.js'));
} catch (err) {
  if (err.code === 'ERR_UNKNOWN_BUILTIN_MODULE') {
    console.error(`CampusFix needs Node.js 22.13 or newer (found ${process.version}). Install it from https://nodejs.org and try again.`);
    process.exit(1);
  }
  throw err;
}

const db = openDb();
if (!db.prepare('SELECT 1 FROM users LIMIT 1').get()) {
  console.warn('No accounts exist yet, so nobody can sign in. Run "npm run seed" first.');
}

const server = createApp(db).listen(port, () => {
  console.log(`CampusFix running at http://localhost:${port}`);
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets ?? []) {
      if (net.family === 'IPv4' && !net.internal) console.log(`On your network:        http://${net.address}:${port}`);
    }
  }
});
server.on('error', (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  console.error(`Port ${port} is already in use. Stop the other server or run with a different port, e.g. PORT=3001 npm start.`);
  process.exit(1);
});
