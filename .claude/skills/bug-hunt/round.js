export const meta = {
  name: 'bug-hunt-round',
  description: 'One bug-hunt round on one area: 5 hunters, 1 checker, 1 fixer, 1 fix checker',
  phases: [
    { title: 'Hunt', detail: '5 hunters, one angle each' },
    { title: 'Check', detail: 'is it real, what is the root cause' },
    { title: 'Fix', detail: 'one fresh fixer' },
    { title: 'Review', detail: 'fix checker reads the changes' },
  ],
}

const A = args
// Paths come from args so the script is not tied to one session's scratch folder.
const REPO = A.repo
const LOG = A.log
const CHECK = A.check

const CONTEXT = `You are part of round ${A.round} of a bug hunt on the DH Engineering job card app (repo ${REPO}, app code under jobcard-system/). Scope: ${A.scope || 'bugs only — wrong behaviour, permission leaks, wrong or lost data, crashes, broken house rules'}.
First read ${LOG} (the hunt's memory: rules, fixed bugs, decisions to leave alone, items waiting for the owner). Never re-report anything listed there.
AREA FOR THIS ROUND: ${A.area}
Where to start: ${A.focus}
Also read the matching docs/notes/*.md file(s) for this area before judging behaviour — they record intended behaviour and the reasons behind traps. Behaviour documented there as intended is NOT a bug.
You may follow calls outside the area when a bug crosses into it.`

const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          where: { type: 'string', description: 'file:line(s)' },
          steps: { type: 'string', description: 'exact steps/requests a person takes to trigger it' },
          expected: { type: 'string' },
          actual: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
        },
        required: ['title', 'where', 'steps', 'expected', 'actual', 'severity'],
      },
    },
  },
  required: ['findings'],
}

const HUNTERS = [
  { key: 'user-flow', q: 'Walk through what a person actually does in this area, step by step, reading the code path end to end (screen -> request -> server -> database -> reply -> screen). Where does what they see or get differ from what they would expect?' },
  { key: 'permissions', q: 'Can a worker (role user) or a manager see or do anything they should not per the Roles and permissions section of CLAUDE.md (pricing, activity trail, contact details, deleting jobs, admin accounts, system data, status changes)? Check what the server actually sends and accepts, not only what the screen hides. Also the reverse: is someone refused something they are allowed.' },
  { key: 'bad-data', q: 'Where can a stored or shown value end up wrong: dates/times shifted or in a non-UTC shape, money or hours rounded or summed wrong, something saved twice, an edit silently lost or overwritten, a history entry missing or in the wrong {from,to} shape, a startup conversion that is not idempotent?' },
  { key: 'awkward', q: 'What happens in awkward situations: empty lists, missing/deleted/archived records, archived or invoiced jobs, a running timer, two people editing the same record, a request failing half way, very long or odd input (blank, spaces, unicode, huge numbers), double clicks?' },
  { key: 'house-rules', q: 'Which of the project\'s written rules (CLAUDE.md and the docs/notes files) are broken in this area in a way that changes behaviour: saving while the person is still typing or on a timer, a write retried automatically, a pop-up where a field should be marked (or both), a modal setting page scroll itself, a clickable non-button, a suggestion list that loses keyboard behaviour, a missing audit record, inline SQL? Only rules whose breach a person would notice or that lose/leak data count.' },
]

phase('Hunt')
const hunted = await parallel(HUNTERS.map(h => () => agent(
  `${CONTEXT}

YOUR ANGLE (${h.key}): ${h.q}

Do NOT edit any file. Read the code carefully. Report only real, reproducible bugs with exact steps; "looks risky" is not a finding. Skip style, naming, repeated code and paper speed-ups. Zero findings is a fine answer. At most 8 findings, most serious first.`,
  { label: `hunt:${h.key}`, phase: 'Hunt', schema: FINDINGS })))

const all = hunted.filter(Boolean).flatMap((r, i) => r.findings.map(f => ({ ...f, angle: HUNTERS[i] ? HUNTERS[i].key : '?' })))
log(`Round ${A.round}: ${all.length} raw findings`)
if (!all.length && !(A.carried || []).length) return { round: A.round, area: A.area, raw: 0, verdicts: [], fixes: [], review: null }

phase('Check')
const VERDICTS = {
  type: 'object',
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ids: { type: 'array', items: { type: 'integer' }, description: 'finding numbers merged into this verdict (duplicates merged)' },
          title: { type: 'string' },
          decision: { type: 'string', enum: ['fix', 'owner', 'reject'] },
          reason: { type: 'string', description: 'for reject: why it is not a real bug. for fix/owner: confirmed evidence' },
          rootCause: { type: 'string', description: 'why this mistake was possible at all' },
          sameMistakeElsewhere: { type: 'string' },
          fixPlan: { type: 'string', description: 'for fix: the change that removes the cause (not just this instance)' },
          ownerProposal: { type: 'string', description: 'for owner: plain-language proposal of the design change, no code terms' },
          plainSummary: { type: 'string', description: 'one plain-language sentence: what the user expected vs what happens. No code names.' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
        },
        required: ['ids', 'title', 'decision', 'reason', 'plainSummary', 'severity'],
      },
    },
  },
  required: ['verdicts'],
}
const listing = all.map((f, i) => `#${i} [${f.severity}] (${f.angle}) ${f.title}\n  where: ${f.where}\n  steps: ${f.steps}\n  expected: ${f.expected}\n  actual: ${f.actual}`).join('\n\n')
const checked = await agent(
  `${CONTEXT}

You are the CHECKER. Below are the hunters' raw findings. Do NOT edit files.
For EACH finding (merge duplicates into one verdict):
1. Try hard to prove it is NOT a real bug: is it handled elsewhere, can the steps really happen, is it documented as intended in docs/notes or CLAUDE.md, is it already in the log? Default to reject when you cannot confirm it in the code.
2. If real: find the ROOT CAUSE — why was this mistake possible at all — and whether the same mistake exists elsewhere in the app.
3. Decide: "fix" if the root-cause fix fits within the existing design (it may touch several files); "owner" if removing the cause needs a design change (new table/flow/permission model, changing agreed behaviour, a large multi-area restructure) — then write a plain proposal; "reject" otherwise.
Low-severity cosmetic items with no data or permission impact: reject unless trivially fixable at the cause.

FINDINGS:
${listing}`,
  { label: 'checker', phase: 'Check', schema: VERDICTS })

const verdicts = (checked && checked.verdicts) || []
const toFix = verdicts.filter(v => v.decision === 'fix').concat((A.carried || []).map(c => ({ ...c, decision: 'fix' })))
const sev = { critical: 0, high: 1, medium: 2, low: 3 }
toFix.sort((a, b) => sev[a.severity] - sev[b.severity])
const batch = toFix.slice(0, 10)
const carried = toFix.slice(10)
if (carried.length) log(`${carried.length} confirmed fixes carried over to a later round (batch cap 10)`)
log(`Checker: ${toFix.length} to fix, ${verdicts.filter(v => v.decision === 'owner').length} for owner, ${verdicts.filter(v => v.decision === 'reject').length} rejected`)
if (!batch.length) return { round: A.round, area: A.area, raw: all.length, verdicts, fixes: [], carried, review: null }

phase('Fix')
const FIXES = {
  type: 'object',
  properties: {
    fixes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          status: { type: 'string', enum: ['fixed', 'not-fixed'] },
          files: { type: 'array', items: { type: 'string' } },
          whatChanged: { type: 'string', description: 'technical summary for the commit message' },
          plainChange: { type: 'string', description: 'plain-language new behaviour the user will see, no code names' },
          note: { type: 'string' },
        },
        required: ['title', 'status', 'files', 'whatChanged', 'plainChange'],
      },
    },
    checkOutput: { type: 'string' },
  },
  required: ['fixes', 'checkOutput'],
}
const fixList = batch.map((v, i) => `FIX ${i + 1} [${v.severity}] ${v.title}\n  evidence: ${v.reason}\n  root cause: ${v.rootCause || ''}\n  same mistake elsewhere: ${v.sameMistakeElsewhere || ''}\n  plan: ${v.fixPlan || ''}`).join('\n\n')
const fixPrompt = (extra) => `${CONTEXT}

You are the FIXER for this round. Fix the confirmed bugs below in the working tree of ${REPO}. Do NOT commit, do NOT push, do NOT run npm install.
- Fix the ROOT CAUSE, including the same mistake elsewhere when listed. No symptom patches, no special-case guards bolted on at one call site when the cause is upstream.
- Follow CLAUDE.md house style exactly (camelCase, shared rule files in server/src/shared for rules both sides need, prepared statements in database.js, recordHistory with {from,to}, startup conversion in runMigrations if a stored value's shape changes, update seed scripts too). Match surrounding code and comment density.
- Keep each fix minimal beyond what the cause needs. No unrelated tidying.
- If a docs/notes file or CLAUDE.md becomes wrong because of your fix, update it.
- If a fix turns out to need a design change, or you cannot fix it soundly, leave it undone and mark it not-fixed with the reason.
- When done, run ${CHECK} (builds the client and boots the server on throwaway data). It must print BUILD OK and SERVER BOOT OK. Paste its output in checkOutput. If it fails, fix what you broke.
${extra || ''}
BUGS TO FIX:
${fixList}`
let fixed = await agent(fixPrompt(''), { label: 'fixer', phase: 'Fix', schema: FIXES })

phase('Review')
const REVIEW = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          pass: { type: 'boolean' },
          problem: { type: 'string', description: 'if failed: exactly what is wrong and what would fix it' },
        },
        required: ['title', 'pass'],
      },
    },
  },
  required: ['results'],
}
const reviewPrompt = (fx) => `${CONTEXT}

You are the FIX CHECKER. There are no automated tests in this project, so you are the safety net. Do NOT edit files.
Run \`git -C ${REPO} diff\` and \`git -C ${REPO} status\` to see the uncommitted changes. For each fix listed below, decide pass/fail:
- Does it remove the ROOT CAUSE, or is it a patch that hides the symptom?
- Does it break anything else? For every changed function, value or reply shape, find every other caller/reader in the whole app (server and client) and check it still works.
- Does it change behaviour a person relies on beyond the bug? Does it break a CLAUDE.md rule? Is a docs/notes file now wrong?
- New bugs introduced by the change count as fail.
The fixer's claimed fixes:
${JSON.stringify(fx && fx.fixes, null, 1)}
Fixer check output:
${fx && fx.checkOutput}`
let review = await agent(reviewPrompt(fixed), { label: 'fix-checker', phase: 'Review', schema: REVIEW })

const failed = ((review && review.results) || []).filter(r => !r.pass)
if (failed.length) {
  log(`${failed.length} fix(es) failed review — one more attempt`)
  const second = await agent(fixPrompt(`
SECOND ATTEMPT: the fix checker rejected these of your earlier fixes (your earlier edits are still in the working tree):
${failed.map(f => `- ${f.title}: ${f.problem || ''}`).join('\n')}
Correct them. If you cannot make one sound, REVERT that fix's edits completely (leave the other fixes intact) and mark it not-fixed with the reason. Report the final state of ALL fixes in the batch.`), { label: 'fixer-2', phase: 'Fix', schema: FIXES })
  if (second) fixed = second
  review = await agent(reviewPrompt(fixed), { label: 'fix-checker-2', phase: 'Review', schema: REVIEW })
}

return { round: A.round, area: A.area, raw: all.length, verdicts, fixes: fixed && fixed.fixes, checkOutput: fixed && fixed.checkOutput, carried, review: review && review.results }
