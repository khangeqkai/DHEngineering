'use strict';

// Turns the working tree's changes into a list of hunks the gate can reason
// about, one entry per contiguous block of edits.

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const REPO_ROOT = path.join(__dirname, '..', '..');

const MAX_HUNK_LINES = 160;   // beyond this a hunk is trimmed before it is sent
const MAX_NEW_FILE_LINES = 120;

// Noise: generated, vendored or machine-written files nobody reviews by hand.
const SKIP = [
  /(^|\/)node_modules\//,
  /(^|\/)graphify-out\//,
  /(^|\/)dist\//,
  /(^|\/)build\//,
  /(^|\/)release\//,
  /package-lock\.json$/,
  /\.(png|jpg|jpeg|gif|ico|svg|otf|ttf|woff2?|pdf|db|sqlite|zip|exe)$/i
];

function git(args) {
  return execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024
  });
}

function skipped(file) {
  return SKIP.some((re) => re.test(file));
}

function trim(lines, max) {
  if (lines.length <= max) return { text: lines.join('\n'), truncated: false };
  return {
    text: lines.slice(0, max).join('\n') + `\n... (${lines.length - max} more lines not shown)`,
    truncated: true
  };
}

// Parse unified diff text into { file, status, header, body, addedLines }.
function parseDiff(text) {
  const hunks = [];
  let file = null;
  let status = 'modified';
  let current = null;

  const push = () => {
    if (!current) return;
    if (!skipped(current.file)) {
      const { text: body, truncated } = trim(current.lines, MAX_HUNK_LINES);
      hunks.push({
        file: current.file,
        status: current.status,
        header: current.header,
        body,
        truncated,
        addedLines: current.lines.filter((l) => l.startsWith('+') && !l.startsWith('+++'))
          .map((l) => l.slice(1))
      });
    }
    current = null;
  };

  for (const line of text.split('\n')) {
    if (line.startsWith('diff --git ')) {
      push();
      const m = line.match(/ b\/(.+)$/);
      file = m ? m[1] : null;
      status = 'modified';
      continue;
    }
    if (line.startsWith('new file mode')) { status = 'added'; continue; }
    if (line.startsWith('deleted file mode')) { status = 'deleted'; continue; }
    if (line.startsWith('rename to ')) { status = 'renamed'; continue; }
    if (line.startsWith('Binary files')) { push(); continue; }
    if (line.startsWith('@@')) {
      push();
      current = { file, status, header: line, lines: [] };
      continue;
    }
    if (current && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' ') || line === '')) {
      current.lines.push(line);
    }
  }
  push();
  return hunks;
}

// Files that exist on disk but git has never been told about. They carry no
// diff, so each becomes a single "whole file is new" hunk.
function untrackedHunks() {
  const out = git(['ls-files', '--others', '--exclude-standard']).trim();
  if (!out) return [];
  return out.split('\n').filter((f) => f && !skipped(f)).map((file) => {
    let lines = [];
    try {
      lines = fs.readFileSync(path.join(REPO_ROOT, file), 'utf-8').split('\n');
    } catch {
      return null;
    }
    const { text: body, truncated } = trim(lines.map((l) => '+' + l), MAX_NEW_FILE_LINES);
    return {
      file,
      status: 'untracked',
      header: '@@ whole file is new @@',
      body,
      truncated,
      addedLines: lines
    };
  }).filter(Boolean);
}

function collect({ base = null, staged = false } = {}) {
  let args;
  if (base) args = ['diff', '--unified=3', `${base}...HEAD`];
  else if (staged) args = ['diff', '--unified=3', '--cached'];
  else args = ['diff', '--unified=3', 'HEAD'];

  const hunks = parseDiff(git(args));
  // Untracked files only matter when looking at the working tree.
  if (!base && !staged) hunks.push(...untrackedHunks());
  return hunks;
}

// Every distinct file touched, with its current length on disk.
function changedFiles(hunks) {
  const seen = new Map();
  for (const h of hunks) {
    if (!seen.has(h.file)) {
      let lineCount = null;
      try {
        lineCount = fs.readFileSync(path.join(REPO_ROOT, h.file), 'utf-8').split('\n').length;
      } catch {
        lineCount = null; // deleted
      }
      seen.set(h.file, { file: h.file, status: h.status, lineCount, hunks: 0 });
    }
    seen.get(h.file).hunks += 1;
  }
  return [...seen.values()];
}

module.exports = { collect, changedFiles, REPO_ROOT, git };
