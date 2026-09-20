#!/usr/bin/env node
'use strict';

// jev-gate — a fast screen over the current changes, before a human reads them.
//
//   1. Scope   every hunk is checked against the recorded work order
//   2. Rules   the CLAUDE.md house rules no pattern can test
//   3. Risk    what deserves a careful read, and what can be skimmed
//
// It finds no bugs. It answers cheap questions often, so the slow review only
// has to run when this says something is off.

const fs = require('fs');
const path = require('path');

const { ask, pool, usage } = require('./jev.js');
const { collect, changedFiles, REPO_ROOT } = require('./diff.js');
const { rulesFor, textFindings } = require('./rules.js');
const { render } = require('./report.js');

const INTENT_FILE = path.join(REPO_ROOT, '.jev', 'intent.md');

// A hunk is called out of scope only when the model is fairly sure, and a rule
// break only when it is more likely than not. Tuned to keep noise low: a gate
// that cries wolf gets ignored, which is worse than no gate.
const THRESHOLDS = { scope: 0.65, rule: 0.6, block: 0.75 };

const RISK_LEVELS = [
  'Cosmetic only: spacing, colour, wording, icons, layout. Getting it wrong looks bad and nothing more.',
  'Ordinary behaviour: what a screen shows, how a list sorts or filters, how a form is filled in. A mistake annoys someone and is easily spotted.',
  'Money, recorded hours, job status, stored data, permissions, or who can see what. A mistake here bills the wrong amount, loses work, or exposes something it should not.'
];

function readIntent() {
  const fromFlag = argValue('--intent');
  if (fromFlag) return fromFlag;
  const fromFile = argValue('--intent-file');
  if (fromFile) return fs.readFileSync(fromFile, 'utf-8').trim();
  try {
    const t = fs.readFileSync(INTENT_FILE, 'utf-8').trim();
    return t || null;
  } catch {
    return null;
  }
}

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function setIntent(text) {
  fs.mkdirSync(path.dirname(INTENT_FILE), { recursive: true });
  fs.writeFileSync(INTENT_FILE, text.trim() + '\n', 'utf-8');
  console.log(`Work order recorded. The gate will check every change against:\n\n  ${text.trim()}\n`);
}

// One request per hunk carrying every question that applies to it — they share
// the same state, so they run together and cost one call.
function questionsFor(hunk, intent) {
  const questions = {};

  if (intent) {
    questions.inScope = {
      type: 'noul',
      instructions: {
        work_order: intent,
        question: 'Is this specific code change part of carrying out `work_order`, or reasonably required to make it work?'
      },
      criteria: {
        true: 'The change carries out the work order, or is a necessary consequence of it — a caller updated to match, an import added, a test covering the new behaviour.',
        false: 'The change is unrelated tidying, a rename for neatness, a refactor nobody asked for, a removed check, a reordered call, or a second feature slipped in alongside.'
      }
    };
  }

  questions.risk = {
    type: 'score',
    instructions: 'How much damage could this change do if it is wrong?',
    criteria: RISK_LEVELS
  };

  for (const rule of rulesFor(hunk.file)) {
    questions[rule.id] = {
      type: 'noul',
      instructions: rule.question,
      criteria: { true: rule.yes, false: rule.no }
    };
  }
  return questions;
}

function stateFor(hunk) {
  return {
    file: hunk.file,
    change_type: hunk.status,
    location: hunk.header,
    note: 'Lines starting + are being added, lines starting - are being removed, the rest is surrounding context that is not changing.',
    diff: hunk.body
  };
}

async function main() {
  if (process.argv[2] === 'intent') {
    const text = process.argv.slice(3).join(' ');
    if (!text.trim()) {
      console.error('Give the work order: gate.js intent "add a print column to the job list"');
      process.exit(2);
    }
    setIntent(text);
    return;
  }

  const started = Date.now();
  const intent = readIntent();
  const hunks = collect({ base: argValue('--base'), staged: hasFlag('--staged') });

  if (hunks.length === 0) {
    console.log('\nJEV GATE  nothing has changed.\n');
    return;
  }

  const capped = hunks.slice(0, Number(argValue('--max-hunks') || 60));

  const answers = await pool(
    capped.map((hunk) => () => ask(stateFor(hunk), questionsFor(hunk, intent))),
    Number(argValue('--concurrency') || 6)
  );

  const scope = [];
  const rules = [];
  const perFileRisk = new Map();
  const texts = [];

  capped.forEach((hunk, i) => {
    for (const t of textFindings(hunk)) texts.push({ ...t, file: hunk.file });

    const result = answers[i];
    if (!result || !result.ok) return;
    const a = result.value;

    if (a.inScope) {
      scope.push({
        file: hunk.file,
        header: hunk.header,
        probability: a.inScope.noul,
        flagged: a.inScope.noul < (1 - THRESHOLDS.scope)
      });
    }

    if (a.risk) {
      const level = Math.min(2, Math.round(a.risk.score));
      const prev = perFileRisk.get(hunk.file);
      if (prev === undefined || level > prev) perFileRisk.set(hunk.file, level);
    }

    for (const rule of rulesFor(hunk.file)) {
      const ans = a[rule.id];
      if (!ans) continue;
      if (ans.noul >= THRESHOLDS.rule) {
        rules.push({
          file: hunk.file,
          id: rule.id,
          finding: rule.finding,
          probability: ans.noul,
          flagged: true
        });
      }
    }
  });

  // Keep the loudest finding per file+rule, so a change spread over five hunks
  // is reported once rather than five times.
  const seen = new Set();
  const dedupedRules = rules
    .sort((a, b) => b.probability - a.probability)
    .filter((r) => {
      const key = `${r.file}::${r.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const files = changedFiles(capped);
  const risk = files
    .map((f) => ({ ...f, level: perFileRisk.get(f.file) ?? 0 }))
    .sort((a, b) => b.level - a.level || a.file.localeCompare(b.file));

  usage.ms = Date.now() - started;

  const { text, blocking } = render({
    intent, hunks: capped, scope, rules: dedupedRules,
    risk, textFindings: texts, usage, thresholds: THRESHOLDS
  });

  if (hasFlag('--json')) {
    console.log(JSON.stringify({ intent, scope, rules: dedupedRules, risk, textFindings: texts, usage }, null, 2));
  } else {
    console.log(text);
  }

  if (blocking && hasFlag('--strict')) process.exit(1);
}

main().catch((err) => {
  console.error('\nJEV GATE could not run:\n  ' + err.message + '\n');
  process.exit(hasFlag('--strict') ? 1 : 0);
});
