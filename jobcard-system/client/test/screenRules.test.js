// The house rules for how screens look and behave (CLAUDE.md, "UI conventions") that can
// be checked by reading the code. Each one was broken at least once before it was written
// down, and each break only showed up when someone looked at the screen:
//   - a hint showing a sample value ("DH-00001") reads as already filled in;
//   - a per-box wheel guard was forgotten on one box, and the wheel rewrote a quantity;
//   - a window that unlocked the page scroll itself unfroze the page under the job window;
//   - a style block inside a screen only exists while that screen is open;
//   - a bright signal colour used for words reads at about 2:1;
//   - a per-theme colour used as a solid fill turned pastel under white text in dark mode.
// A failure names the file, the line and the rule. Fix the screen, not the test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');

function walk(dir, exts) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, exts));
    else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(src, p);
const lineOf = (t, i) => t.slice(0, i).split('\n').length;
const blankComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
const blankLineComments = (t) => t.replace(/(^|[^:])\/\/[^\n]*/g, (c, lead) => lead + ' '.repeat(c.length - lead.length));

const screens = walk(src, ['.jsx', '.js']);
const sheets = walk(src, ['.css']);

function findAll(files, rx, why, { prepare = (t) => t } = {}) {
  const hits = [];
  for (const f of files) {
    const t = prepare(readFileSync(f, 'utf8'));
    for (const m of t.matchAll(rx)) hits.push(`${rel(f)}:${lineOf(t, m.index)} ${why} — ${m[0].trim().slice(0, 80)}`);
  }
  return hits;
}

test('a box hint says what to do, never shows a sample value', () => {
  const hits = findAll(screens, /placeholder=\{?["'`](e\.g\.|eg\b|for example)[^"'`]*["'`]/gi, 'sample value as a hint');
  assert.deepEqual(hits, []);
});

test('the mouse wheel is guarded once, app-wide — no per-box wheel handlers', () => {
  const hits = findAll(screens, /\bonWheel\s*=/g, 'per-box wheel handler', { prepare: blankLineComments });
  assert.deepEqual(hits, []);
});

test('only the shared modal stack locks and unlocks the page scroll', () => {
  const others = screens.filter((f) => !f.endsWith(path.join('common', 'modalStack.js')));
  const hits = findAll(others, /document\.body\.style\.overflow/g, 'page scroll set by a window itself', { prepare: blankLineComments });
  assert.deepEqual(hits, []);
});

test('styles live in a stylesheet, never in a style block inside a screen', () => {
  // A print document (a new window's own page) is not a screen of this app.
  const hits = findAll(screens.filter((f) => !/print|workbook|excel/i.test(f)), /<style[\s>]/g, 'style block in a screen', { prepare: blankLineComments });
  assert.deepEqual(hits, []);
});

test('icons are drawn at 14 (inline), 16 (controls) or 18 (navigation); larger only for headers, empty states and bubbles', () => {
  const hits = findAll(screens, /\bsize=\{(\d+)\}/g, 'off-scale icon size', { prepare: blankLineComments })
    .filter((h) => { const n = Number(h.match(/size=\{(\d+)\}/)[1]); return n < 14 || n === 15 || n === 17 || n === 19; });
  assert.deepEqual(hits, []);
});

// The bright signal colours and the per-theme blue are for shapes. Words take an ink.
const FILL_ONLY = '(success|warning|danger|info)-color|primary-accent|fill-(accent|danger|success|warning)(-hover)?|history-dot-[a-z]+|status-[a-z-]+-dot';

test('words are never coloured with a fill-only colour', () => {
  const css = findAll(sheets, new RegExp(`(?<![-\\w])color:\\s*var\\(--(${FILL_ONLY})\\)`, 'g'), 'word in a fill colour — use the matching ink', { prepare: blankComments });
  const inline = findAll(screens, new RegExp(`(?<![-\\w])color:\\s*['"\`]var\\(--(${FILL_ONLY})\\)`, 'g'), 'word in a fill colour — use the matching ink', { prepare: blankLineComments });
  // A colour table a screen uses to tint words (the activity action words).
  const tables = findAll([path.join(src, 'utils', 'activityColors.js')], new RegExp(`var\\(--(${FILL_ONLY})\\)`, 'g'), 'action word tinted with a fill colour');
  assert.deepEqual([...css, ...inline, ...tables], []);
});

test('a solid fill carrying white text is a --fill-* colour, the same in both themes', () => {
  const PER_THEME = new Set(['--primary-accent', '--success-color', '--warning-color', '--danger-color', '--info-color']);
  const hits = [];
  for (const f of sheets) {
    const t = blankComments(readFileSync(f, 'utf8'));
    for (const m of t.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const body = m[2];
      const bg = body.match(/background(?:-color)?:\s*var\((--[\w-]+)\)/);
      if (bg && PER_THEME.has(bg[1]) && /(?<![-\w])color:\s*var\(--text-on-saturated\)/.test(body)) {
        hits.push(`${rel(f)}:${lineOf(t, m.index + m[1].length)} white text on ${bg[1]} — use the matching --fill-* colour`);
      }
    }
  }
  assert.deepEqual(hits, []);
});
