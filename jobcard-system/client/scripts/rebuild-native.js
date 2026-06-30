const path = require('path');
const { execFileSync } = require('child_process');

// Resolve the Electron version reliably across electron-builder releases.
// `context.packager.electronVersion` is undefined in some versions, so fall
// back to the framework info and finally to the installed electron package.
function resolveElectronVersion(context) {
  return (
    context.packager.electronVersion ||
    context.packager.info?.framework?.version ||
    require(path.join(__dirname, '..', 'node_modules', 'electron', 'package.json')).version
  );
}

// electron-builder's Arch enum (ia32=0, x64=1, armv7l=2, arm64=3) → CPU string.
const ARCH_NAMES = { 0: 'ia32', 1: 'x64', 2: 'arm', 3: 'arm64' };

exports.default = async function(context) {
  // The bundled server ships better-sqlite3, a native module that must match
  // Electron's ABI, not the system Node ABI it was installed against. Pull the
  // matching prebuilt binary (no local C++ toolchain required) into the copied
  // server resources.
  const serverPath = path.join(context.appOutDir, 'resources', 'server');
  const moduleDir = path.join(serverPath, 'node_modules', 'better-sqlite3');
  const prebuildInstall = path.join(serverPath, 'node_modules', 'prebuild-install', 'bin.js');

  const electronVersion = resolveElectronVersion(context);
  const arch = ARCH_NAMES[context.arch] || 'x64';

  execFileSync(
    process.execPath,
    [prebuildInstall, '-r', 'electron', '-t', electronVersion, '--arch', arch],
    { cwd: moduleDir, stdio: 'inherit' }
  );
};
