// Every name the app's code uses must be defined somewhere it can reach: imported,
// required, declared, or a real global of the place the file runs. A clean-up once
// dropped `jobItemQueries` from the file routes' require list while two routes still
// used it. Nothing failed until someone opened a job's Files window: the list crashed
// on every job, so every upload looked lost. Loading the routes would not have caught
// it either, because the name is only looked up when that route runs.
//
// This reads every server and client source file (without running any of them) and
// lists each name used with no definition in reach. It reads the code with the same
// parser Vite's React plugin already installs (@babel/parser + @babel/traverse), so it
// adds nothing to install, and it runs under WSL, where the database library can't load.
//
// A failure names the file and the name. If the name really is a global of where that
// file runs (a new browser feature, say), add it to the matching list below.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Names a CommonJS file gets from Node's module wrapper rather than from globalThis.
const NODE_MODULE_NAMES = ['require', 'module', 'exports', '__dirname', '__filename'];
// Browser globals the screens use. Node's own globalThis already covers the language
// built-ins and the shared ones (fetch, URL, setTimeout, Blob, console, ...).
const BROWSER_NAMES = [
  'window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage',
  'FileReader', 'HTMLElement', 'Element', 'ResizeObserver', 'MutationObserver',
  'IntersectionObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'CSS',
  'getComputedStyle', 'matchMedia', 'Image', 'prompt', 'alert', 'confirm'
];

// Where each part of the app runs, and the extra names that place provides.
const AREAS = [
  { dir: 'server/index.js', extra: NODE_MODULE_NAMES },
  { dir: 'server/src', extra: NODE_MODULE_NAMES },
  { dir: 'server/scripts', extra: NODE_MODULE_NAMES },
  { dir: 'client/electron', extra: [...NODE_MODULE_NAMES, ...BROWSER_NAMES] },
  { dir: 'client/src', extra: BROWSER_NAMES }
];

const SOURCE = /\.(js|jsx|mjs|cjs)$/;

function sourceFiles(target) {
  const full = path.join(root, target);
  if (!statSync(full, { throwIfNoEntry: false })) return [];
  if (!statSync(full).isDirectory()) return [full];
  return readdirSync(full).flatMap((name) => {
    if (name === 'node_modules') return [];
    const child = path.join(full, name);
    if (statSync(child).isDirectory()) return sourceFiles(path.relative(root, child));
    return SOURCE.test(name) ? [child] : [];
  });
}

// The names a piece of code uses that nothing in it defines.
export function undefinedNames(code, allowed) {
  const ast = parse(code, { sourceType: 'unambiguous', plugins: ['jsx'] });
  let names = [];
  traverse(ast, {
    Program(p) {
      names = Object.keys(p.scope.globals).filter((name) => !(name in globalThis) && !allowed.has(name));
    }
  });
  return names.sort();
}

test('the check itself spots a name that was never brought in', () => {
  const allowed = new Set(NODE_MODULE_NAMES);
  const broken = "const { a } = require('./x');\nfunction list() { return jobItemQueries.getByJobcard.all(a); }\nmodule.exports = { list };";
  assert.deepEqual(undefinedNames(broken, allowed), ['jobItemQueries']);
  const fixed = "const { a, jobItemQueries } = require('./x');\nfunction list() { return jobItemQueries.getByJobcard.all(a); }\nmodule.exports = { list };";
  assert.deepEqual(undefinedNames(fixed, allowed), []);
  // A screen using a component or helper it never imported.
  const screen = "import { useState } from 'react';\nexport default function A() { const [x] = useState(useThing()); return <Missing value={x} />; }";
  assert.deepEqual(undefinedNames(screen, new Set(BROWSER_NAMES)), ['Missing', 'useThing']);
});

test('every name the server, the screens and the desktop app use is defined', () => {
  const missing = [];
  let checked = 0;
  for (const area of AREAS) {
    const allowed = new Set(area.extra);
    for (const file of sourceFiles(area.dir)) {
      checked++;
      const rel = path.relative(root, file);
      for (const name of undefinedNames(readFileSync(file, 'utf8'), allowed)) {
        missing.push(`${rel}: ${name}`);
      }
    }
  }
  // Guards against the folders moving and the check quietly reading nothing.
  assert.ok(checked > 200, `only ${checked} source files were found to check`);
  assert.deepEqual(missing, []);
});
