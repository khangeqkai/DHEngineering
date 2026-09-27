# One copy per rule — 2026-09-27 (follow-up to the duplicated-rules review)

Frozen spec. A codebase review found 15 rules written out in more than one place. Every
fix below leaves exactly ONE copy that every caller reads, and deletes the others. The
user's decisions are recorded where they apply and are not to be re-litigated:

- Finding 7 (N/A answer) and 14a (machine list): **one shared reader, no storage change.**
  The stored value keeps its current shape; the shared reader becomes the only way
  anything reads it. No startup conversion.
- Finding 11 (small menus): Tab **closes the menu and lets focus move on** (standard
  menu-button behaviour). The status and assignee menus lose their keep-focus-inside
  behaviour.

House rules (CLAUDE.md) apply in full: camelCase JS, prepared statements (no inline
SQL), field errors via hooks/useFieldErrors.js + common/FieldError.jsx (never both a
field mark and a pop-up for one failure), lucide icons, spacing tokens, delete legacy
code (no leftover copies, no aliases), update the matching docs/notes/*.md in the same
change. Shared rule files follow the convention in CLAUDE.md "Shared rule files"
exactly (CommonJS, pure, only the allowed require/module.exports forms — the Vite
plugin throws otherwise).

Behaviour must not change except where a step says so. Where two copies disagree
today, the step says which one wins; if a step does not say and you find a
disagreement, report it — do not pick.

Environment constraints (every executor):
- node_modules is shared with a running Windows install. NEVER run npm install / npm ci /
  rebuild / seed / the server / vite build. Verification = `node --check <file>` for every
  changed server/shared .js file, plus `node -e "require('./server/src/shared/<file>')"`
  for each new shared file, plus careful re-reading of every hunk. Client .jsx cannot be
  node-checked.
- Do not commit. Touch only your group's allowed files — other executors work in the same
  tree at the same time.
- A step that cannot be done as written is reported back, not improvised.
- Report: each step number → what changed; `git diff --stat` pasted; any disagreement found.

=======================================================================================
## Group A — settings rules (findings 2, 3, 15)

Allowed files: server/src/shared/settingsRules.js (new), server/src/routes/settings.js,
server/src/routes/settings-overtime.js, server/src/utils/officeTime.js,
client/src/hooks/useSettings.js, client/src/context/AuthContext.jsx,
client/src/hooks/useInactivityTimer.js, the Settings screen component(s) that render the
inactivity and starting-job-number boxes (find them; list them in the report),
docs/notes/auth-and-security.md, docs/notes/dates-and-timezones.md, docs/notes/api-reference.md.

A1. New `server/src/shared/settingsRules.js` exporting:
    `INACTIVITY_MINUTES` = `{ min: 1, max: 60, defaultValue: 5 }`,
    `isInactivityMinutes(value)` (whole number within min..max — match the server's
    current check exactly), `isStartingJobNumber(value)` (digits only — match the server's
    current check exactly), and `STARTING_JOB_NUMBER_MESSAGE` (the current wording).
A2. settings.js: the range check (~line 141), the default (~line 218) and the job-number
    check (~line 156) read A1. Delete the local literals.
A3. useSettings.js (~lines 30, 67, 160, 179), AuthContext.jsx (~line 18),
    useInactivityTimer.js (~line 6): read A1. The screen-side fallback defaults are
    deleted and replaced by `INACTIVITY_MINUTES.defaultValue`.
A4. The starting-job-number failure on the Settings screen marks the box through
    useFieldErrors/FieldError instead of `toast.error`. No pop-up for that failure.
    If the inactivity range check on screen is also a pop-up today, it gets the same
    treatment.
A5. Finding 15: officeTime.js exports its "is this a real time zone" check (one
    function); settings-overtime.js (~line 79) imports and uses it and its own check is
    deleted. If the two checks disagree today, officeTime's wins — report the difference.
    If the client also checks a time zone anywhere, report it (do not move it).
A6. Update the notes that mention the 1–60 / 5-minute range or the time zone check.

=======================================================================================
## Group B — file rules (findings 4, 5, 12)

Allowed files: server/src/shared/jobFiles.js (new), server/src/routes/jobcard-files.js,
server/src/routes/jobcard-printout.js, client/src/components/jobcard/useJobFiles.js,
client/src/components/jobcard/paperworkHubHelpers.jsx,
client/src/components/QALevelManagement.jsx, client/src/services/api.js,
client/src/utils/fileData.js (new), docs/notes/files-and-qa.md.

B1. New `server/src/shared/jobFiles.js` exporting: `ALLOWED_FILE_EXTENSIONS` (the list at
    jobcard-files.js ~line 23 — identical to printout's today), `MAX_UPLOAD_BYTES`
    (30 MB), `MAX_PRINT_FILES` (20), and the category → folder-name map (jobcard-files.js
    ~line 46). Keep MIME_TYPES and MAX_PACKET_BYTES where they are (only one copy each).
B2. jobcard-files.js, jobcard-printout.js (~lines 17–18): read B1; delete local copies.
    Printout keeps a Set if it needs one — build it from the shared list.
B3. useJobFiles.js (~lines 5, 15, 17), paperworkHubHelpers.jsx (~line 12),
    QALevelManagement.jsx (~line 151): read B1; delete local copies. If the screen's
    folder list carries display headings, those headings stay on the screen but are keyed
    off the shared folder map.
B4. Finding 12: new `client/src/utils/fileData.js` with the file→text and text→file
    helpers (take the more complete of each pair). useJobFiles.js (~lines 19, 36),
    QALevelManagement.jsx (~line 172) and api.js (~line 472) import them; delete copies.

=======================================================================================
## Group C — status rule and time lock (findings 8, 13)

Allowed files: server/src/shared/jobStatus.js (new), server/src/middleware/auth.js,
client/src/components/jobcard/constants.js, client/src/components/JobCardListColumns.jsx,
client/src/components/jobcard/JobIdentityStrip.jsx,
client/src/components/jobcard/timeLock.js (new),
client/src/components/jobcard/useJobCardTimerActions.js,
client/src/components/jobcard/useTimeEntries.js, docs/notes/jobs-and-status.md,
docs/notes/auth-and-security.md, CLAUDE.md (only the sentence naming where canSetStatus
lives).

C1. New `server/src/shared/jobStatus.js` (requires `./jobStatuses.json`) exporting:
    `canSetStatus(canManage, fromStatus, toStatus)` — today's rule from auth.js ~line 122,
    taking a boolean instead of a role; `canChangeStatus(canManage, currentStatus)` and
    `settableStatusValues(canManage, currentStatus)` — moved from constants.js ~46/55;
    and the "only management is offered Invoiced" filter that JobCardListColumns.jsx
    ~278 and JobIdentityStrip.jsx ~166 each write today, as one function that returns
    the statuses to offer. Read both screen copies first; if they differ, report.
C2. auth.js: `canSetStatus(role, from, to)` becomes a thin call
    `sharedCanSetStatus(isManagement(role), from, to)` (or callers pass isManagement
    themselves — pick one, no second copy of the rule). Drop exports nobody imports.
C3. constants.js, JobCardListColumns.jsx, JobIdentityStrip.jsx: import from C1; delete
    the local rule and both local Invoiced filters.
C4. Finding 13: new `client/src/components/jobcard/timeLock.js` exporting
    `isTimeLocked(isInvoiced)` (or the job — whatever both hooks hold) and
    `showTimeLockedToast()` (the one message and id). Both hooks use it; delete both
    copies and the "kept in step" comment.

=======================================================================================
## Group D — saving-side rules (findings 1, 6, 7, 9, 10)

Allowed files: server/src/shared/pin.js (new), server/src/shared/lineItemAnswers.js (new),
server/src/middleware/validation.js, client/src/utils/formatters.js,
server/src/utils/tagSlug.js (new), server/src/routes/tags.js, server/src/db/seed-tags.js,
server/src/routes/jobcard-helpers.js, client/src/components/jobcard/tabs/ItemsTab.jsx,
server/src/utils/costingCompute.js, server/src/routes/statistics.js,
server/src/db/database.js (only to add a prepared statement for D4),
docs/notes/auth-and-security.md, docs/notes/files-and-qa.md,
docs/notes/customers-and-tags.md, docs/notes/time-and-costing.md.

D1. Finding 1: new `server/src/shared/pin.js` exporting `isValidPin(value)` and the
    message. validation.js (~line 6) and formatters.js (~line 25) use it; delete both
    copies and both "can't share a module" comments.
D2. Finding 6: new `server/src/utils/tagSlug.js` with the one name→code rule. tags.js
    (~line 12) and seed-tags.js (~line 3) import it. If the two differ, tags.js wins —
    report the difference.
D3. Finding 7: new `server/src/shared/lineItemAnswers.js` exporting `NA_ANSWER` ('N_A'),
    `splitAnswer(raw)` (comma split, trim, drop blanks — today's splitValues),
    `isNaAnswer(raw)` (empty, or exactly [N_A]), `declaresAnswer(raw)` (some value other
    than N_A), and `hasMixedNa(values)` for the validator. Semantics must match today's
    exactly. Every reader goes through it: jobcard-helpers.js ~47, ~385, ~440, ~477
    (splitValues deleted), ~502, ~517 (both inline copies deleted), validation.js ~693/699,
    and ItemsTab.jsx ~428/444 (`naValue={NA_ANSWER}`). No other code may split these
    fields or compare to 'N_A' — grep to confirm and paste the grep in the report.
D4. Finding 9: costingCompute.js (~line 34) exports its "this job's saved overtime rules,
    otherwise today's settings" lookup; statistics.js (~line 177) uses it and its inline
    query is deleted. Any query needed goes into database.js as a prepared statement.
D5. Finding 10: statistics.js — one function measures a single piece of logged work
    (hours, good parts, scrap, and whatever else both loops take); the totals loop
    (~290) and the trend loop (~447) both add up its result. Output numbers unchanged.

=======================================================================================
## Group E — screen helpers (findings 11, 14)

Allowed files: client/src/hooks/useDismissableMenu.js (new),
client/src/components/JobCardList.jsx, client/src/components/JobCardColumnsMenu.jsx,
client/src/components/jobcard/tabs/LineItemTagSelect.jsx,
server/src/shared/machineList.js (new),
client/src/components/jobcard/tabs/CostingBreakdown.jsx,
client/src/components/jobcard/tabs/TimeEntryCard.jsx,
client/src/components/jobcard/tabs/TimeEntryForm.jsx,
client/src/components/jobcard/tabs/LineItemSupplierPicker.jsx,
client/src/components/jobcard/tabs/LineItemTreatment.jsx,
client/src/utils/records.js (new, or an existing utils file if one clearly fits),
docs/notes/client-patterns.md.

E1. Finding 11: new `useDismissableMenu({ open, onClose, containerRef })` — closes on a
    press outside the container, on Escape (focus returns to the button that opened it),
    and on Tab leaving the menu (focus moves on normally). The four menus
    (JobCardList.jsx ~223 status, ~242 assignee, JobCardColumnsMenu.jsx ~16,
    LineItemTagSelect.jsx ~72) use it; delete their own listeners and focus-trapping.
    If LineItemTagSelect turns out to be a suggestion box (combobox) rather than a menu,
    do NOT touch it — report instead.
E2. Finding 14a: new `server/src/shared/machineList.js` exporting `splitMachineCodes(raw)`
    (split on comma, trim, drop blanks) and `joinMachineCodes(list)` if a joining copy
    exists anywhere. CostingBreakdown.jsx ~45, TimeEntryCard.jsx ~39, TimeEntryForm.jsx
    ~10 use it; delete the copies. Grep the whole repo for other splits of the machine
    field and report them.
E3. Finding 14b: one "is this option/supplier still active" helper; LineItemSupplierPicker
    ~6, LineItemTreatment ~7, CostingBreakdown ~80 use it. If the three differ, report.
