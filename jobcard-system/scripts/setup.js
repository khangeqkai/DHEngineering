const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT_DIR = path.join(__dirname, '..');
const PLATFORM = os.platform();

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkCommand(cmd) {
  try {
    if (PLATFORM === 'win32') {
      spawnSync('where', [cmd], { stdio: 'pipe' });
    } else {
      spawnSync('which', [cmd], { stdio: 'pipe' });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if node_modules was installed for the current platform.
 * Uses a .platform marker file to detect cross-platform mismatches
 * (e.g. installed in WSL/Linux but running from Windows).
 */
function checkPlatformMatch(nodeModulesPath) {
  const markerPath = path.join(nodeModulesPath, '.platform');
  if (!fs.existsSync(markerPath)) return false;
  try {
    const installed = fs.readFileSync(markerPath, 'utf8').trim();
    return installed === PLATFORM;
  } catch {
    return false;
  }
}

function writePlatformMarker(nodeModulesPath) {
  try {
    fs.writeFileSync(path.join(nodeModulesPath, '.platform'), PLATFORM);
  } catch {
    // Non-critical
  }
}

function installDependencies(dir, name) {
  const fullPath = path.join(ROOT_DIR, dir);
  const nodeModulesPath = path.join(fullPath, 'node_modules');
  const packageJsonPath = path.join(fullPath, 'package.json');

  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`package.json not found in ${dir}`);
  }

  let needsInstall = false;

  if (!fs.existsSync(nodeModulesPath)) {
    needsInstall = true;
  } else if (!checkPlatformMatch(nodeModulesPath)) {
    // node_modules was installed on a different platform (e.g. WSL vs Windows)
    log(`  ${name}: dependencies were installed for a different platform, reinstalling...`, 'yellow');
    needsInstall = true;
  } else {
    // Check if package.json is newer than node_modules (dependencies changed)
    const packageJsonMtime = fs.statSync(packageJsonPath).mtimeMs;
    const nodeModulesMtime = fs.statSync(nodeModulesPath).mtimeMs;

    if (packageJsonMtime > nodeModulesMtime) {
      log(`  Package.json changed, updating ${name} dependencies...`, 'yellow');
      needsInstall = true;
    }
  }

  if (needsInstall) {
    log(`  Installing ${name} dependencies...`, 'yellow');
    try {
      execSync('npm install', {
        cwd: fullPath,
        stdio: 'inherit'
      });
      writePlatformMarker(nodeModulesPath);
    } catch (err) {
      throw new Error(`Failed to install ${name} dependencies`);
    }
  }
  return 'OK';
}

function checkNativeModules() {
  const serverDir = path.join(ROOT_DIR, 'server');
  const betterSqlitePath = path.join(serverDir, 'node_modules', 'better-sqlite3');
  if (!fs.existsSync(betterSqlitePath)) return 'OK (not yet installed)';

  // Check the .node binary format directly — PE (MZ) for Windows, ELF for Linux
  const nodeBinary = path.join(betterSqlitePath, 'build', 'Release', 'better_sqlite3.node');
  let needsReinstall = false;

  if (!fs.existsSync(nodeBinary)) {
    needsReinstall = true;
  } else {
    const header = Buffer.alloc(4);
    const fd = fs.openSync(nodeBinary, 'r');
    fs.readSync(fd, header, 0, 4, 0);
    fs.closeSync(fd);

    const magic = header.toString('hex', 0, 4);
    if (PLATFORM === 'win32' && header.toString('ascii', 0, 2) !== 'MZ') {
      // Not a Windows PE binary
      needsReinstall = true;
    } else if (PLATFORM === 'darwin' && magic !== 'cffaedfe' && magic !== 'cefaedfe' && magic !== 'cafebabe') {
      // Not a macOS Mach-O binary (64-bit, 32-bit, or universal)
      needsReinstall = true;
    } else if (PLATFORM === 'linux' && magic !== '7f454c46') {
      // Not a Linux ELF binary
      needsReinstall = true;
    }
  }

  if (!needsReinstall) return 'OK';

  log('  Native module was built for a different platform, reinstalling...', 'yellow');
  try {
    fs.rmSync(betterSqlitePath, { recursive: true, force: true });
    execSync('npm install better-sqlite3', {
      cwd: serverDir,
      stdio: 'inherit'
    });
    return 'reinstalled';
  } catch (err) {
    throw new Error('Failed to install native modules. On Windows, you may need build tools: npm install -g windows-build-tools');
  }
}

/**
 * Ensure the Chrome that Puppeteer uses to render the printable job card to PDF
 * is downloaded. The standalone server (development / server-only run) relies on
 * Puppeteer's own Chrome; without it, combined packets silently drop the job-card
 * page. (The packaged desktop app uses Electron's built-in Chromium instead, so
 * this only matters when running the server outside Electron.) Auto-downloads the
 * version pinned by the installed Puppeteer if it's missing.
 */
async function checkPdfBrowser() {
  const serverDir = path.join(ROOT_DIR, 'server');
  const puppeteerPath = path.join(serverDir, 'node_modules', 'puppeteer');
  if (!fs.existsSync(puppeteerPath)) return 'OK (not yet installed)';

  // Pin the browser to the project folder (server/.chrome), matching
  // server/.puppeteerrc.cjs. setup.js runs from the repo root, so the runtime's
  // config file (resolved from server/'s cwd) wouldn't apply here — without this the
  // check below would look in the default per-user cache while the install writes to
  // the pinned folder, and they'd disagree. Setting the env makes both the
  // resolution and the install (which inherits this env) agree on server/.chrome.
  process.env.PUPPETEER_CACHE_DIR = path.join(serverDir, '.chrome');

  let execPath = null;
  try {
    const puppeteer = require(puppeteerPath);
    // Newer Puppeteer returns a Promise from executablePath(); awaiting a plain
    // string is harmless, so this covers both.
    execPath = await puppeteer.executablePath();
  } catch {
    // Couldn't resolve the path — fall through and let the install fix it.
  }

  if (execPath && fs.existsSync(execPath)) return 'OK';

  log('  Chrome for PDF rendering is missing, downloading (one-time)...', 'yellow');
  try {
    execSync('npx puppeteer browsers install chrome', {
      cwd: serverDir,
      stdio: 'inherit'
    });
    return 'installed';
  } catch {
    throw new Error('Could not download Chrome for PDF rendering. Run manually: cd server && npx puppeteer browsers install chrome');
  }
}

function ensureDataDir() {
  const dataDir = path.join(ROOT_DIR, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return 'OK';
}

const checks = [
  {
    name: 'Node.js version',
    check: () => {
      const major = parseInt(process.versions.node.split('.')[0], 10);
      if (major < 18) {
        throw new Error(`Node.js 18+ required, found v${process.versions.node}`);
      }
      return `v${process.versions.node}`;
    }
  },
  {
    name: 'npm',
    check: () => {
      const version = execSync('npm -v', { encoding: 'utf8' }).trim();
      return `v${version}`;
    }
  },
  {
    name: 'Operating System',
    check: () => {
      const release = os.release();
      const platformNames = {
        darwin: 'macOS',
        win32: 'Windows',
        linux: 'Linux'
      };
      return `${platformNames[PLATFORM] || PLATFORM} ${release}`;
    }
  },
  {
    name: 'Data directory',
    check: ensureDataDir
  },
  {
    name: 'Server dependencies',
    check: () => installDependencies('server', 'server')
  },
  {
    name: 'Client dependencies',
    check: () => installDependencies('client', 'client')
  },
  {
    name: 'Native modules',
    check: checkNativeModules
  },
  {
    name: 'Browser for PDF rendering',
    check: checkPdfBrowser
  }
];

async function runChecks() {
  log('\n========================================', 'cyan');
  log('  System Requirements Check', 'cyan');
  log('========================================\n', 'cyan');

  let allPassed = true;

  for (const { name, check } of checks) {
    try {
      const result = await check();
      log(`  ✓ ${name}: ${result}`, 'green');
    } catch (err) {
      log(`  ✗ ${name}: ${err.message}`, 'red');
      allPassed = false;
    }
  }

  console.log('');

  if (allPassed) {
    log('========================================', 'green');
    log('  All checks passed!', 'green');
    log('========================================\n', 'green');
  } else {
    log('========================================', 'red');
    log('  Some checks failed. Please fix the', 'red');
    log('  issues above and try again.', 'red');
    log('========================================\n', 'red');
    process.exit(1);
  }
}

runChecks();
