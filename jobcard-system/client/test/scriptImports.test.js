// The seed and check scripts in server/scripts can't be run here (the database library
// doesn't load under WSL), so a name renamed or removed in server/src that a script still
// asks for went unnoticed until someone re-seeded on Windows (review round 7: the seed
// still asked for a part-summary helper renamed in round 6). This reads each script's
// `const { a, b } = require('../src/…')` lines and checks every name against the target
// file's `module.exports = { … }` list, without loading either file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const scriptsDir = path.join(root, 'server/scripts');

const REQUIRE = /const\s*\{([^}]+)\}\s*=\s*require\(\s*'(\.\.\/src\/[^']+)'\s*\)/g;

// The names in a file's single `module.exports = { … }` block, or null when it has none
// or uses a form this check can't read (a spread, `exports.x = …`).
function exportedNames(file) {
  const text = readFileSync(file, 'utf8');
  const m = /module\.exports\s*=\s*\{([^}]*)\}/.exec(text);
  if (!m || m[1].includes('...')) return null;
  return new Set(m[1]
    .split(',')
    .map((s) => s.replace(/\/\/.*$/gm, '').trim())
    .filter(Boolean)
    .map((s) => s.split(':')[0].trim()));
}

test('every name a server script asks for still exists', () => {
  const missing = [];
  for (const name of readdirSync(scriptsDir).filter((f) => f.endsWith('.js'))) {
    const text = readFileSync(path.join(scriptsDir, name), 'utf8');
    for (const [, names, rel] of text.matchAll(REQUIRE)) {
      const base = path.resolve(scriptsDir, rel);
      const target = existsSync(`${base}.js`) ? `${base}.js` : path.join(base, 'index.js');
      if (!existsSync(target)) { missing.push(`${name}: ${rel} (no such file)`); continue; }
      const exported = exportedNames(target);
      assert.ok(exported, `${name}: can't read the exports of ${rel}`);
      for (const wanted of names.split(',').map((s) => s.split(':')[0].trim()).filter(Boolean)) {
        if (!exported.has(wanted)) missing.push(`${name}: ${wanted} from ${rel}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});
