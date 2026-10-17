// Starts both halves for development: the API (with auto-restart) and the Vite dev server (with hot reload).
//   npm run dev        then open http://localhost:5173
// The browser talks to Vite, which forwards /api and /uploads to the backend on port 3000.
import { spawn } from 'node:child_process';

const children = [
  ['api', ['run', 'dev', '--workspace', '@uniseva/backend']],
  ['web', ['run', 'dev', '--workspace', '@uniseva/frontend']],
].map(([name, args]) => {
  const child = spawn('npm', args, { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
  const show = (stream, out) => stream.on('data', (chunk) => String(chunk).split('\n').filter(Boolean).forEach((line) => out.write(`[${name}] ${line}\n`)));
  show(child.stdout, process.stdout);
  show(child.stderr, process.stderr);
  child.on('exit', (code) => {
    if (!stopping) { console.error(`[${name}] stopped (code ${code}); stopping the other one too.`); stop(code ?? 1); }
  });
  return child;
});

let stopping = false;
function stop(code = 0) {
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 500);
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
