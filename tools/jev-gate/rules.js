'use strict';

// Two kinds of check.
//
// TEXT_CHECKS are plain pattern matches. They are exact, instant and free, so
// anything a search can settle never goes to the model.
//
// JUDGEMENT_RULES are the house rules from CLAUDE.md that no pattern can test,
// because they turn on what the code means rather than how it is spelled.
// Each becomes one yes/no question about the hunk it applies to.

// The house rules govern the product's own code. Build tooling and anything
// outside the app answer to nobody — a third party's field names are theirs.
const inApp = (f) => f.includes('jobcard-system/');
const isServer = (f) => f.includes('jobcard-system/server/');
const isClient = (f) => f.includes('jobcard-system/client/');
const isCode = (f) => /\.(js|jsx|cjs|mjs)$/.test(f);
const isStyle = (f) => /\.css$/.test(f);

const TEXT_CHECKS = [
  {
    id: 'stored-local-time',
    applies: (f) => isServer(f) && isCode(f),
    pattern: /datetime\('now'\)|CURRENT_TIMESTAMP/,
    message: "Stores a moment using the database clock. Every stored moment must be UTC in ISO-8601 form, or displayed times shift."
  },
  {
    id: 'phantom-font-weight',
    applies: (f) => isStyle(f) || isClient(f),
    pattern: /font-weight:\s*(500|600)\b|fontWeight:\s*['"]?(500|600)\b/,
    message: 'Asks for a font weight that does not exist in Pragmatica. It silently renders as something else.'
  },
  {
    id: 'raw-alert',
    applies: (f) => isClient(f) && isCode(f),
    pattern: /(^|[^.\w])alert\s*\(/,
    message: 'Uses a browser pop-up instead of the app toast.'
  },
  {
    id: 'modal-owns-scroll-lock',
    applies: (f) => isClient(f) && isCode(f),
    pattern: /document\.body\.style\.overflow/,
    message: 'Freezes the page directly. The shared modal stack owns the scroll lock — doing it here unfreezes the page while another modal is still open.'
  },
  {
    id: 'token-persisted',
    applies: (f) => isClient(f) && isCode(f),
    pattern: /(localStorage|sessionStorage)\.setItem\(\s*['"`][^'"`]*(token|jwt|auth)/i,
    message: 'Writes the sign-in pass into browser storage. The pass is memory-only by design — these are shared workstations.'
  },
  {
    id: 'past-tense-history',
    applies: (f) => isServer(f) && isCode(f),
    pattern: /recordHistory\([^)]*['"`](created|updated|deleted)['"`]/,
    message: "Audit trail action names are present tense: 'create', 'update', 'delete'."
  }
];

const JUDGEMENT_RULES = [
  {
    id: 'compat-branch',
    applies: (f) => inApp(f) && isCode(f),
    question: 'Does this change add backward-compatibility logic to live runtime code — an old-value fallback, a renamed alias, a dual read path, or a branch that handles both an old and a new data shape?',
    yes: 'Live code branches on an old shape or falls back to an old value.',
    no: 'Single path only, or the change is a one-time startup conversion, which is where old-shape handling belongs.',
    finding: 'Backward-compatibility branch in live code. Old shapes are folded in once at start-up; runtime code only ever sees the new shape.'
  },
  {
    id: 'guard-removed',
    applies: (f) => inApp(f) && isCode(f),
    question: 'Does this change remove or weaken an existing safety check — a permission check, a validation, an error guard, a confirmation step, or a condition that prevented an action?',
    yes: 'Something that used to block or verify an action is gone or now passes more cases.',
    no: 'No check was removed, or a check was added or tightened.',
    finding: 'A guard or check was removed or loosened. Removing one needs a stated reason in the work order.'
  },
  {
    id: 'hard-delete',
    applies: (f) => isServer(f) && isCode(f),
    question: 'Does this change permanently delete a customer, contact, supplier, dropdown option, tag or similar reference record, rather than marking it archived?',
    yes: 'A reference record is removed from the database outright.',
    no: 'Nothing is deleted, the record is archived instead, or what is deleted is a job-owned record such as a note or time entry.',
    finding: 'Permanently deletes a record that jobs may point at. Those are archived, never deleted, or every job that used it is stranded.'
  },
  {
    id: 'inline-sql',
    applies: (f) => isServer(f) && isCode(f),
    question: 'Does this change write SQL inline in a route or utility, instead of calling a prepared statement defined in the shared database module?',
    yes: 'A SQL string is written and run outside the shared database module.',
    no: 'All database access goes through named prepared statements, or the change is inside the database module itself.',
    finding: 'Inline SQL outside the database module. Queries live as prepared statements in one place.'
  },
  {
    id: 'technical-wording',
    applies: (f) => isClient(f) && isCode(f),
    question: 'Does this change add or edit text the user will read on screen — a message, label, button, error or toast — that uses developer wording rather than plain everyday words?',
    yes: 'On-screen wording names code things or uses jargon: field, record, payload, request failed, invalid, null, sync, token, endpoint.',
    no: 'On-screen wording is plain, or the change adds no user-facing text at all.',
    finding: 'On-screen wording reads like developer language. Screen text uses everyday words.'
  },
  {
    id: 'fake-button',
    applies: (f) => isClient(f) && /\.jsx$/.test(f),
    question: 'Does this change add a clickable element that is not a real button or link — for example a div or span with a click handler — without a keyboard-reachable equivalent?',
    yes: 'Something clickable is a plain element, so it cannot be reached by Tab or announced by a screen reader.',
    no: 'Everything clickable is a real button or link, or nothing clickable was added.',
    finding: 'Something clickable is not a real button, so the keyboard cannot reach it.'
  },
  {
    id: 'snake-case-leak',
    applies: (f) => inApp(f) && isCode(f),
    question: 'Does this change let a snake_case name cross the API boundary or live in JavaScript logic? Responses and request bodies must use camelCase; snake_case is correct only inside SQL text and when reading a column straight off a database row.',
    yes: 'A key on a JSON response, a field read off a request body, a variable, a prop or a form field name is snake_case.',
    no: 'Every snake_case name sits inside SQL text or is a column being read off a row and immediately renamed; everything else is camelCase.',
    finding: 'Database-style naming has leaked past the conversion boundary. JavaScript is camelCase throughout.'
  },
  {
    id: 'costing-touched',
    applies: (f) => inApp(f) && isCode(f),
    question: 'Does this change affect how money is calculated, stored, displayed or who can see it — labour rates, overtime tiers, materials, totals, invoicing, or access to costing?',
    yes: 'The change can alter a number a customer is billed, or who can see pricing.',
    no: 'No effect on any monetary figure or on who can see pricing.',
    finding: 'Touches money. Costing changes need the numbers checked by hand before they land.'
  }
];

function rulesFor(file) {
  return JUDGEMENT_RULES.filter((r) => r.applies(file));
}

function textFindings(hunk) {
  const found = [];
  for (const check of TEXT_CHECKS) {
    if (!check.applies(hunk.file)) continue;
    const hit = hunk.addedLines.find((line) => check.pattern.test(line));
    if (hit) found.push({ id: check.id, message: check.message, line: hit.trim().slice(0, 120) });
  }
  return found;
}

module.exports = { rulesFor, textFindings, JUDGEMENT_RULES, TEXT_CHECKS };
