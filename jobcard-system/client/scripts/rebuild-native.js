const { rebuild } = require('@electron/rebuild');
const path = require('path');

exports.default = async function(context) {
  // Rebuild native modules (better-sqlite3) in the bundled server
  const serverPath = path.join(context.appOutDir, 'resources', 'server');
  await rebuild({
    buildPath: serverPath,
    electronVersion: context.packager.electronVersion,
    arch: context.arch
  });
};
