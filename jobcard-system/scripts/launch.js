#!/usr/bin/env node
/**
 * Cross-platform launcher. One entry point with subcommands:
 *   node scripts/launch.js lan         — server + Electron + LAN URL
 *   node scripts/launch.js seed        — wipe DB and seed full mock data
 *   node scripts/launch.js seed:empty  — wipe DB and seed without job cards
 *
 * All platform-specific work lives here (LAN IP, child process spawning,
 * Electron command names) so the .bat / shell wrappers are one-liners.
 */

const path = require('path');
const os = require('os');
const fs = require('fs');
const http = require('http');
const readline = require('readline');
const { spawn, execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';
const npxCmd = isWindows ? 'npx.cmd' : 'npx';

const COMMANDS = {
  lan: cmdLan,
  seed: () => cmdSeed([]),
  'seed:empty': () => cmdSeed(['--no-jobs'])
};

(async () => {
  const sub = process.argv[2];
  if (!sub || !(sub in COMMANDS)) {
    console.error('Usage: node scripts/launch.js <lan|seed|seed:empty>');
    process.exit(1);
  }
  try {
    await COMMANDS[sub]();
  } catch (err) {
    console.error(err && err.message ? err.message : err);
    process.exit(1);
  }
})();

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function runSetup() {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [path.join(ROOT, 'scripts', 'setup.js')], {
      stdio: 'inherit',
      cwd: ROOT
    });
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error('Setup failed'))
    );
  });
}

function findLanIp() {
  const ifaces = os.networkInterfaces();
  // Prefer common Wi-Fi / Ethernet names, then fall back to the first
  // non-internal IPv4 we see.
  const preferred = ['en0', 'en1', 'eth0', 'wlan0', 'Wi-Fi', 'Ethernet'];
  for (const name of preferred) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return null;
}

function buildClientIfNeeded(force = false) {
  const distIndex = path.join(ROOT, 'client', 'dist', 'index.html');
  const srcDir = path.join(ROOT, 'client', 'src');
  const indexHtmlSrc = path.join(ROOT, 'client', 'index.html');

  let reason = null;
  if (force) {
    reason = '--rebuild requested';
  } else if (!fs.existsSync(distIndex)) {
    reason = 'no existing build found';
  } else {
    const distMtime = fs.statSync(distIndex).mtimeMs;
    const newest = newestMtime(srcDir, distMtime);
    if (newest > distMtime) {
      reason = 'source files changed since last build';
    } else if (fs.existsSync(indexHtmlSrc) && fs.statSync(indexHtmlSrc).mtimeMs > distMtime) {
      reason = 'source files changed since last build';
    }
  }

  if (!reason) return;

  console.log(`\nBuilding client (${reason})...`);
  execSync(`${npmCmd} run build`, {
    cwd: path.join(ROOT, 'client'),
    stdio: 'inherit'
  });
}

// Walks a directory tree and returns the newest mtime found. Stops walking
// as soon as anything beats the cutoff (we only need a yes/no answer).
function newestMtime(dir, cutoff) {
  let newest = 0;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        stack.push(full);
      } else {
        const m = fs.statSync(full).mtimeMs;
        if (m > newest) newest = m;
        if (m > cutoff) return m;
      }
    }
  }
  return newest;
}

function waitForHealth(timeoutMs = 20000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const req = http.get('http://localhost:3000/health', (res) => {
        res.resume();
        if (res.statusCode === 200) resolve(true);
        else if (Date.now() - start > timeoutMs) resolve(false);
        else setTimeout(tick, 250);
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) resolve(false);
        else setTimeout(tick, 250);
      });
    };
    tick();
  });
}

function confirm(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

// ---------------------------------------------------------------------------
// Subcommand: lan
// ---------------------------------------------------------------------------

async function cmdLan() {
  await runSetup();

  const force = process.argv.includes('--rebuild') || process.argv.includes('-r');
  buildClientIfNeeded(force);

  const lanIp = findLanIp();

  console.log('\nStarting server on port 3000...');
  // On Windows, modern Node refuses to spawn npm/npx (.cmd shims) directly
  // (throws EINVAL) unless routed through the shell. shell:true fixes that and
  // is harmless elsewhere.
  const server = spawn(npmCmd, ['start'], {
    cwd: path.join(ROOT, 'server'),
    stdio: 'inherit',
    shell: isWindows
  });

  let serverExited = false;
  server.on('exit', () => { serverExited = true; });

  const healthy = await waitForHealth();
  if (serverExited || !healthy) {
    console.error('Server did not become ready.');
    try { server.kill(); } catch {}
    process.exit(1);
  }

  console.log('');
  console.log('================================');
  console.log('  Server is up.');
  console.log('');
  console.log('  On this machine:    http://localhost:3000');
  if (lanIp) {
    console.log(`  From another PC:    http://${lanIp}:3000`);
  } else {
    console.log('  From another PC:    (no LAN IP detected — check Wi-Fi)');
  }
  console.log('');
  console.log('  First run may prompt the OS to allow incoming');
  console.log('  network connections — click Allow.');
  console.log('');
  console.log('  Close the desktop window or press Ctrl+C here');
  console.log('  to stop the server.');
  console.log('================================');
  console.log('');

  const electron = spawn(npxCmd, ['electron', '.'], {
    cwd: path.join(ROOT, 'client'),
    stdio: 'inherit',
    shell: isWindows,
    env: { ...process.env, ELECTRON_LOAD_URL: 'http://localhost:3000' }
  });

  let shuttingDown = false;
  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    try { electron.kill(); } catch {}
    try { server.kill(); } catch {}
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  electron.on('exit', () => { shutdown(); process.exit(0); });
  server.on('exit', () => { shutdown(); process.exit(0); });
}

// ---------------------------------------------------------------------------
// Subcommand: seed / seed:empty
// ---------------------------------------------------------------------------

async function cmdSeed(extraArgs) {
  const empty = extraArgs.includes('--no-jobs');
  console.log('');
  console.log('================================');
  console.log(empty ? '  Seeding Mock Data (NO job cards)' : '  Seeding Mock Data');
  console.log('================================');
  console.log('');
  if (empty) {
    console.log('WARNING: This wipes all existing data and creates mock data');
    console.log('         WITHOUT any job cards (users, suppliers, contacts,');
    console.log('         machines, tags, QA levels only).');
  } else {
    console.log('WARNING: This wipes all existing data and creates mock data.');
  }
  console.log('');
  const ok = await confirm('Are you sure? (y/n): ');
  if (!ok) {
    console.log('Cancelled.');
    return;
  }
  console.log('');
  const seedScript = path.join(ROOT, 'server', 'scripts', 'seed-mock-data.js');
  await new Promise((resolve, reject) => {
    const child = spawn('node', [seedScript, ...extraArgs], {
      stdio: 'inherit',
      cwd: ROOT
    });
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`Seed exited with code ${code}`))
    );
  });
}
