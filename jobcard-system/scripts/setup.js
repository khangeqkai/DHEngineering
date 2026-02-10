const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT_DIR = path.join(__dirname, '..');

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
    if (os.platform() === 'win32') {
      spawnSync('where', [cmd], { stdio: 'pipe' });
    } else {
      spawnSync('which', [cmd], { stdio: 'pipe' });
    }
    return true;
  } catch {
    return false;
  }
}

function installDependencies(dir, name) {
  const fullPath = path.join(ROOT_DIR, dir);
  const nodeModulesPath = path.join(fullPath, 'node_modules');
  const packageJsonPath = path.join(fullPath, 'package.json');
  const packageLockPath = path.join(fullPath, 'package-lock.json');

  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`package.json not found in ${dir}`);
  }

  let needsInstall = false;

  // Check if node_modules exists
  if (!fs.existsSync(nodeModulesPath)) {
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
    } catch (err) {
      throw new Error(`Failed to install ${name} dependencies`);
    }
  }
  return 'OK';
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
      const platform = os.platform();
      const release = os.release();
      const platformNames = {
        darwin: 'macOS',
        win32: 'Windows',
        linux: 'Linux'
      };
      return `${platformNames[platform] || platform} ${release}`;
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
  }
];

async function runChecks() {
  log('\n========================================', 'cyan');
  log('  System Requirements Check', 'cyan');
  log('========================================\n', 'cyan');

  let allPassed = true;

  for (const { name, check } of checks) {
    try {
      const result = check();
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
