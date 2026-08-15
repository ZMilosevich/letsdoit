import { execFileSync, spawn } from 'node:child_process';
import { existsSync, watch } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const vite = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite');
const children = [];
let shuttingDown = false;
let backend;
let rebuilding = false;
let restartPending = false;
let restartTimer;
let sourceWatcher;

if (!existsSync(join(root, 'node_modules'))) {
  console.error('Dependencies are missing. Run npm ci first.');
  process.exit(1);
}

const backendEnv = { ...process.env, PORT: process.env.PORT || '3000' };

console.log('Building the backend once before starting development mode...');
execFileSync(npm, ['run', 'build:backend'], { cwd: root, stdio: 'inherit' });

function startBackend() {
  backend = spawn(process.execPath, ['dist/main.js'], {
    cwd: root,
    env: backendEnv,
    stdio: 'inherit',
  });

  backend.on('exit', (code) => {
    if (!shuttingDown && !rebuilding && code !== 0) {
      console.error(`Backend exited unexpectedly with code ${code ?? 'unknown'}.`);
      stop(code || 1);
    }
  });
}

function rebuildBackend() {
  if (shuttingDown) return;
  if (rebuilding) {
    restartPending = true;
    return;
  }

  rebuilding = true;
  try {
    execFileSync(npm, ['run', 'build:backend'], { cwd: root, stdio: 'inherit' });
    const previous = backend;
    const launch = () => {
      rebuilding = false;
      if (!shuttingDown) startBackend();
      if (restartPending) {
        restartPending = false;
        scheduleBackendRestart();
      }
    };

    if (previous && previous.exitCode === null) {
      previous.once('exit', launch);
      previous.kill('SIGTERM');
    } else {
      launch();
    }
  } catch (error) {
    rebuilding = false;
    console.error('Backend build failed; keeping the current server running.');
    console.error(error.message);
  }
}

function scheduleBackendRestart() {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(rebuildBackend, 180);
}

startBackend();
sourceWatcher = watch(join(root, 'src'), scheduleBackendRestart);

children.push(spawn(vite, [], {
  cwd: join(root, 'frontend'),
  env: process.env,
  stdio: 'inherit',
}));

function stop(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearTimeout(restartTimer);
  sourceWatcher?.close();
  backend?.kill('SIGTERM');
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 250);
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

for (const child of children) {
  child.on('exit', (code) => {
    if (!shuttingDown && code !== 0) stop(code || 1);
  });
}

console.log('Frontend: http://localhost:5173');
console.log('Backend:  http://localhost:3000');
