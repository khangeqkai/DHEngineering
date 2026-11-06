// Every look on screen comes from the named values in src/index.css — the spacing,
// type, weight, corner, line-height, timing, layer and colour scales — never from a
// number typed into one component. The scales were adopted by hand, file by file, and
// nothing stopped a new rule from typing `padding: 10px` or `color: #22c55e` again;
// the app had drifted to ~590 typed spacings once already, and a bright green typed
// for a word read at about 2:1 on white.
//
// This reads every client stylesheet (without running anything) and fails on:
//   - a named value used but defined nowhere (the rule silently falls back to nothing);
//   - a value defined in index.css that nothing uses (dead names invite the wrong pick);
//   - a typed number or colour where the scales have a name for it.
//
// A value that genuinely cannot come from a scale (a photo shown on true black, a
// printed page, a decorative glyph) says so where it sits: put `token-exempt` and the
// reason in a comment on the same line or on the comment line just above. A whole file
// that is deliberately outside the theme (the always-dark sign-in screen) says
// `token-exempt-file` in its opening comment. A component may still define its own
// named values (`--p-bg: rgba(...)`) — those are its token layer, and are not checked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
const TOKENS_FILE = path.join(src, 'index.css');

// Defined in index.css on purpose with no user yet, each with its reason. Keep it empty
// if you can: a name nobody uses is a rule nobody follows.
const RESERVED = {};

function walk(dir, exts) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, exts));
    else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

// Comments blanked to spaces, newlines kept, so positions still map to lines.
const blankComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
const lineOf = (t, index) => t.slice(0, index).split('\n').length;
const rel = (p) => path.relative(src, p);

const cssFiles = walk(src, ['.css']);
const scriptFiles = walk(src, ['.js', '.jsx']);

test('every named value used is defined, and every app-wide one is used', () => {
  const defined = new Set();
  const used = new Map();
  for (const f of cssFiles) {
    const t = blankComments(readFileSync(f, 'utf8'));
    for (const m of t.matchAll(/(?<![\w-])(--[\w-]+)\s*:/g)) defined.add(m[1]);
  }
  for (const f of [...cssFiles, ...scriptFiles]) {
    const t = readFileSync(f, 'utf8');
    // Values a screen sets itself (style={{ '--x': … }} or setProperty('--x', …)).
    if (!f.endsWith('.css')) {
      for (const m of t.matchAll(/['"`](--[\w-]+)['"`]\s*[:,]/g)) defined.add(m[1]);
    }
    for (const m of t.matchAll(/var\(\s*(--[\w-]+)/g)) {
      if (!used.has(m[1])) used.set(m[1], rel(f));
    }
  }
  const undefinedNames = [...used].filter(([n]) => !defined.has(n)).map(([n, f]) => `${n} (first used in ${f})`);
  assert.deepEqual(undefinedNames, [], 'named values used but defined nowhere');

  const tokens = blankComments(readFileSync(TOKENS_FILE, 'utf8'));
  const appWide = new Set([...tokens.matchAll(/(?<![\w-])(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const unused = [...appWide].filter((n) => !used.has(n) && !RESERVED[n]);
  assert.deepEqual(unused, [], 'index.css defines these but nothing uses them — remove them or use them');
});

// Each check: the property, and what an allowed value looks like.
const SPACING = /^(margin|padding|gap|row-gap|column-gap)(-(top|right|bottom|left|inline|block)(-(start|end))?)?$/;
const CHECKS = [
  { what: 'font size', prop: /^font-size$/, ok: (v) => /^(var\(|inherit$|1em$|100%$)/.test(v) },
  { what: 'font weight', prop: /^font-weight$/, ok: (v) => /^(var\(|inherit$)/.test(v) },
  { what: 'corner', prop: /^border(-(top|bottom)-(left|right))?-radius$/, ok: (v) => v.split(/\s+(?![^(]*\))/).every((p) => /^(var\(|calc\(var\(|0$|50%$|inherit$)/.test(p)) },
  { what: 'letter spacing', prop: /^letter-spacing$/, ok: (v) => /^(var\(|0$|normal$|inherit$)/.test(v) },
  { what: 'line height', prop: /^line-height$/, ok: (v) => /^(var\(|inherit$|normal$)/.test(v) },
  // Small numbers only order siblings inside one component; anything that has to
  // float over the page takes a --layer-* name (windows get theirs from the modal stack).
  { what: 'layer', prop: /^z-index$/, ok: (v) => /^var\(/.test(v) || (/^-?\d+$/.test(v) && Number(v) <= 30) },
  // A repeating rhythm (a pulse, a shimmer, the spinner) and the reduced-motion
  // slow-downs keep their own period; a one-off change takes a --duration-* name.
  { what: 'timing', prop: /^(transition|animation)$/, ok: (v) => /\binfinite\b/.test(v) || !/(^|[\s,(])(?!0+(\.0+)?m?s\b)\.?\d+(\.\d+)?m?s\b/.test(v) },
  {
    what: 'spacing', prop: SPACING,
    // Every length outside calc() is either 0 or a negative offset that cancels a border.
    ok: (v) => !/(^|[\s,])(?!-)\d*\.?\d+(px|rem|em)\b/.test(withoutCalc(v)),
  },
];
// A value with every bracketed group — calc(...), var(...) — folded away, innermost
// first, so a length inside calc() is never mistaken for a typed one.
function withoutCalc(v) {
  let out = v;
  for (let prev = ''; prev !== out;) { prev = out; out = out.replace(/\w*\([^()]*\)/g, ' '); }
  return out;
}
const TYPED_COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?)\(\s*\d/;

test('no typed number or colour where a scale has a name for it', () => {
  const problems = [];
  for (const f of cssFiles) {
    if (f === TOKENS_FILE) continue;
    const raw = readFileSync(f, 'utf8');
    if (/token-exempt-file/.test(raw.slice(0, 600))) continue;
    const rawLines = raw.split('\n');
    const exempt = (line) => {
      if (/token-exempt/.test(rawLines[line - 1])) return true;
      for (let i = line - 2; i >= 0; i--) {
        const prev = rawLines[i].trim();
        if (prev === '') continue;
        return /token-exempt/.test(prev) && (prev.endsWith('*/') || prev.startsWith('/*') || prev.startsWith('*'));
      }
      return false;
    };
    const t = blankComments(raw);
    for (const m of t.matchAll(/(?<=[{;\s])([a-z-]+)\s*:\s*([^;{}]+)/g)) {
      const [, prop, rawValue] = m;
      if (prop.startsWith('--')) continue;
      const value = rawValue.replace(/\s*!important\s*$/, '').trim();
      const first = lineOf(t, m.index);
      const last = first + rawValue.split('\n').length - 1;
      const isExempt = () => { for (let l = first; l <= last; l++) if (exempt(l)) return true; return false; };
      for (const c of CHECKS) {
        if (c.prop.test(prop) && !c.ok(value) && !isExempt()) {
          problems.push(`${rel(f)}:${first} typed ${c.what} — ${prop}: ${value.replace(/\s+/g, ' ')}`);
        }
      }
      if (TYPED_COLOUR.test(value) && !isExempt()) {
        problems.push(`${rel(f)}:${first} typed colour — ${prop}: ${value.replace(/\s+/g, ' ')}`);
      }
    }
  }
  assert.deepEqual(problems, [], 'use the matching name from src/index.css, or mark a real exception token-exempt with its reason');
});
