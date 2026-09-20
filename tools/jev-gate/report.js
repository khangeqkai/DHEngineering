'use strict';

const useColour = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code) => (s) => (useColour ? `\x1b[${code}m${s}\x1b[0m` : s);
const red = c('31'), amber = c('33'), green = c('32'), dim = c('2'), bold = c('1'), cyan = c('36');

const RISK_PIPS = ['●  ', '●● ', '●●●'];
const RISK_WORD = ['skim', 'worth a look', 'read this properly'];

function bar(label, width = 46) {
  return bold(label) + ' ' + dim('─'.repeat(Math.max(2, width - label.length)));
}

function render({ intent, hunks, scope, rules, risk, textFindings, usage, thresholds }) {
  const out = [];
  const outOfScope = scope.filter((s) => s.flagged);
  const ruleHits = rules.filter((r) => r.flagged);
  const total = hunks.length;

  out.push('');
  out.push(bar('JEV GATE'));

  // ---- 1. scope ----------------------------------------------------------
  if (!intent) {
    out.push(`${amber('○')} Scope   ${dim('skipped — no work order recorded (see: gate.js intent "...")')}`);
  } else if (scope.length === 0) {
    out.push(`${dim('○')} Scope   ${dim('nothing to check')}`);
  } else if (outOfScope.length === 0) {
    out.push(`${green('✓')} Scope   all ${total} change${total === 1 ? '' : 's'} match what was asked for`);
  } else {
    out.push(`${red('✗')} Scope   ${bold(String(outOfScope.length))} of ${total} change${total === 1 ? '' : 's'} ${red('not asked for')}`);
    for (const s of outOfScope) {
      out.push(`          ${red('•')} ${cyan(s.file)} ${dim(s.header)}`);
      out.push(`            ${dim(`${Math.round((1 - s.probability) * 100)}% sure this was not in the work order`)}`);
    }
  }

  // ---- 2. house rules ----------------------------------------------------
  const textCount = textFindings.length;
  if (ruleHits.length === 0 && textCount === 0) {
    out.push(`${green('✓')} Rules   nothing breaks the house rules`);
  } else {
    out.push(`${red('✗')} Rules   ${bold(String(ruleHits.length + textCount))} possible break${ruleHits.length + textCount === 1 ? '' : 's'}`);
    for (const t of textFindings) {
      out.push(`          ${red('•')} ${cyan(t.file)} ${dim(`[${t.id}]`)} ${dim('exact match')}`);
      out.push(`            ${t.message}`);
      out.push(`            ${dim(t.line)}`);
    }
    for (const r of ruleHits) {
      out.push(`          ${amber('•')} ${cyan(r.file)} ${dim(`[${r.id}] ${Math.round(r.probability * 100)}% sure`)}`);
      out.push(`            ${r.finding}`);
    }
  }

  // ---- 3. risk -----------------------------------------------------------
  if (risk.length === 0) {
    out.push(`${dim('○')} Risk    ${dim('nothing to rank')}`);
  } else {
    out.push(`${dim('·')} Risk    what to read first`);
    for (const f of risk) {
      const pips = RISK_PIPS[f.level];
      const paint = f.level === 2 ? red : f.level === 1 ? amber : dim;
      const oversize = f.lineCount && f.lineCount > 600 && !/\.css$/.test(f.file)
        ? dim(`  ⚠ ${f.lineCount} lines — over the 600 limit`) : '';
      out.push(`          ${paint(pips)} ${cyan(f.file.replace(/^jobcard-system\//, ''))} ${dim(RISK_WORD[f.level])}${oversize}`);
    }
  }

  // ---- footer ------------------------------------------------------------
  const cents = (usage.cost * 100).toFixed(3);
  const failed = usage.failures ? amber(`  ${usage.failures} check${usage.failures === 1 ? '' : 's'} could not run`) : '';
  out.push(dim(`         ${usage.calls} call${usage.calls === 1 ? '' : 's'} · ${cents}¢ · ${usage.ms}ms`) + failed);
  out.push('');

  const blocking = outOfScope.length > 0 || textCount > 0
    || ruleHits.some((r) => r.probability >= thresholds.block);
  return { text: out.join('\n'), blocking };
}

module.exports = { render };
