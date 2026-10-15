// The one name rule (name if not empty, else username) is written in exactly two places:
// displayName in server/src/shared/names.js and DISPLAY_NAME_SQL in
// server/src/db/displayNameSql.js. This fails if any other source file writes the
// fallback out by hand — the copies are what drifted apart in review rounds 1-4
// (a missing trim, a raw name in a search or a picker).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { cleanName, displayName } from '../../server/src/shared/names.js';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCAN = ['server/src', 'client/src'].map((d) => path.join(root, d));
const RULE_FILES = new Set(['server/src/shared/names.js', 'server/src/db/displayNameSql.js']);

// Each pattern is one way of spelling "name, else username".
const HAND_WRITTEN = [
  /\bname\s*(\|\||\?\?)\s*[\w$.?]*username\b/,   // name || username, u.name ?? row.username
  /\busername\s*(\|\||\?\?)\s*[\w$.?]*\bname\b/, // username || name
  /\buserName\s*(\|\||\?\?)\s*[\w$.?]*\busername\b/, // a.userName || a.username
  /\|\|\s*[\w$]+\??\.username\b/,                // ... || u.username
  /TRIM\(\s*[\w$]+\.name\s*\)/i,                 // TRIM(u.name)
  /NULLIF\(\s*TRIM\(/i                           // NULLIF(TRIM(...), '')
];

// Lines that may match, each with the reason. Empty today.
const ALLOWED = [];

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') yield* sourceFiles(full);
    } else if (/\.(js|jsx|mjs)$/.test(entry.name)) {
      yield full;
    }
  }
}

test('nobody writes the name fallback by hand', () => {
  const found = [];
  for (const dir of SCAN) {
    for (const file of sourceFiles(dir)) {
      const rel = path.relative(root, file).split(path.sep).join('/');
      if (RULE_FILES.has(rel)) continue;
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '');
        if (!HAND_WRITTEN.some((re) => re.test(code))) return;
        if (ALLOWED.some((a) => a.file === rel && code.includes(a.text))) return;
        found.push(`${rel}:${i + 1}: ${line.trim()}`);
      });
    }
  }
  assert.deepEqual(found, [], 'use displayName (shared/names.js) or DISPLAY_NAME_SQL (db/displayNameSql.js):\n' + found.join('\n'));
});

test('the guard itself catches each spelling', () => {
  for (const sample of ['x.name || x.username', 'u.name ?? u.username', 'a.userName || a.username', 'p.username || p.name',
    'foo || u.username', 'TRIM(u.name)', "NULLIF(TRIM(u.name), '')"]) {
    assert.ok(HAND_WRITTEN.some((re) => re.test(sample)), sample);
  }
});

test('cleanName trims, collapses inner whitespace and turns blank into null', () => {
  assert.equal(cleanName('  Jane\tDoe '), 'Jane Doe');
  assert.equal(cleanName('Jane'), 'Jane');
  assert.equal(cleanName(' '), null);
  assert.equal(cleanName('\u00a0'), null);
  assert.equal(cleanName(null), null);
  assert.equal(cleanName(undefined), null);
});

test('displayName is the name if not empty, else the username', () => {
  assert.equal(displayName({ name: 'Jane Doe', username: 'jd' }), 'Jane Doe');
  assert.equal(displayName({ name: null, username: 'jd' }), 'jd');
  assert.equal(displayName({ name: '', username: 'jd' }), 'jd');
});
