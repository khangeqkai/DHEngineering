# One rule, one place — 2026-09-27

Frozen spec. A whole-codebase review found twelve rules written in more than one place.
The user asked for **root-cause fixes**: each rule ends up written once, and every copy is
deleted — not patched to agree. The numbers (F1–F12) match the review's findings.

House rules (CLAUDE.md) apply in full: camelCase JS, prepared statements only (no inline
`db.db.prepare` in routes), recordHistory `{ field: { from, to } }` with present-tense
actions, delete legacy code (no compatibility branches, no "kept for reference"), update
the matching docs/notes/*.md in the same change. Code comments stay at the density of
the surrounding code.

Environment constraints (every executor):
- node_modules is shared with a running Windows install. NEVER run npm install / npm ci /
  npm rebuild / seed / the server / vite build / vite dev. If something fails to load,
  report it — do not "fix" it by rebuilding. Verification = `node --check <file>` for
  every changed server .js file, plus careful re-reading of every hunk. Client .jsx cannot
  be node-checked; re-read imports/exports by hand and grep for every renamed/removed name.
- Do not commit. Touch only your group's allowed files — other executors work in the same
  tree at the same time. Needing a file outside your list = report, don't touch.
- A step that cannot be done as written is reported back, not improvised.
- Behaviour must not change except where a step says it does.

Report format (every executor): per step, what changed; anything reported instead of
done; `node --check` output for every changed server file; `git diff --stat` for your
files only (`git diff --stat -- <your files>`).

=======================================================================================
## WAVE 1 — four executors in parallel

---------------------------------------------------------------------------------------
### Group A — server: pricing, overtime, dates, rounding  (F3-server, F4, F7-server, F10-helper, F12-server part)

Allowed files (jobcard-system/server/src/…): utils/costingCompute.js,
utils/overtimeSplit.js, utils/officeTime.js, routes/statistics.js,
routes/statistics-helpers.js, routes/settings-overtime.js, db/schema.js, db/init.js,
NEW utils/costingDefaults.js, NEW utils/overtimeSettings.js, NEW utils/calendarDate.js,
NEW utils/round.js; docs/notes/time-and-costing.md, docs/notes/dates-and-timezones.md.
NOT jobcard-mutations.js / jobcards.js / search.js / jobcard-helpers.js (later waves).

A1. **One list of pricing defaults (F7).** NEW `utils/costingDefaults.js` exports one
frozen object `COSTING_DEFAULTS = { labourDefaultRate: 0, ot1Multiplier: 1.5,
ot2Multiplier: 2, holidayMultiplier: 2.5, materialsProfitPercent: 100,
subcontractorProfitPercent: 0 }` with a one-line comment: the only place the app's
starting pricing figures are written. Replace every literal copy with it:
costingCompute.js `DEFAULT_MULT` (delete it) and the `pickRaw(..., 100)` / `(..., 0)`
defaults; schema.js `job_costings` column DEFAULTs (build those DEFAULT clauses from the
constant — the schema is a JS template string, interpolate); init.js seed settings rows
(~594-603) and the migration fallbacks (~454-456). Grep the server for any other
1.5 / 2.5 / `100` markup literal in a pricing context and fold it in or report it.

A2. **One reader of the overtime settings (F4).** NEW `utils/overtimeSettings.js` owns
reading the company overtime setup. Move into it from costingCompute.js:
`parseSchedule`, `parseHolidays`, `DAYS`, `DEFAULT_DAY`, `num`, and `readOtSettings`
(rename `readOvertimeSettings`). Changes while moving:
- timezone comes from `officeTimeZone()` (utils/officeTime.js) — the app-wide rule —
  instead of `s.timezone || 'UTC'`.
- defaults come from COSTING_DEFAULTS.
Export `readOvertimeSettings`, `parseSchedule`, `parseHolidays`. costingCompute.js
imports them (wherever it parses a job's own captured schedule/holidays copy it must use
the same `parseSchedule`/`parseHolidays`). statistics.js: delete its own reading
(~31-45: the raw JSON.parse of labour_schedule / labour_public_holidays) and use
`readOvertimeSettings()` for the company rules; its per-job captured-copy parsing
(~179-192) uses `parseSchedule`/`parseHolidays` instead of its own try/JSON.parse. Net
behaviour change (intended): statistics now fills empty days the same way pricing does,
and a malformed stored schedule no longer turns the whole statistics page into an error.
Leave init.js's migration reads alone (migrations are the one place that may read raw
old shapes). Leave `splitHours` in overtimeSplit.js as is.

A3. **One "is this a real calendar day" check (F3, server side).** NEW
`utils/calendarDate.js` exports:
- `isCalendarDate(value)` — true only for a string `YYYY-MM-DD` that names a day that
  exists (build it with `Date.UTC(y, m-1, d)` and check the year/month/day read back
  unchanged; 2026-02-30 → false, 2028-02-29 → true, 2026-02-29 → false).
- `formatDayAu(isoDay)` — `'YYYY-MM-DD'` → `'DD/MM/YYYY'` by rearranging the string, no
  Date object, no time zone ('' for empty/invalid input). (Used by wave 2.)
Replace the regex + `Date.parse` checks in settings-overtime.js (~134, public holidays)
and statistics-helpers.js (~32, ~35, custom range) with `isCalendarDate`.

A4. **The office-day helper lives with the other office-time helpers (F10, helper part).**
Move `getLocalDateString` from statistics-helpers.js into utils/officeTime.js as
`officeDateString(moment, fmt = makeOfficeFormatter(officeTimeZone()))` → `'YYYY-MM-DD'`
of that moment in the office's zone (keep the optional pre-built formatter so the
statistics loops don't rebuild it). Update every caller in statistics.js /
statistics-helpers.js; delete the old function and its export. (Wave 2 uses it for the
printout and quality forms.) Update dates-and-timezones.md: list it with the other
officeTime helpers.

A5. **One rounding helper (F12, server part).** NEW `utils/round.js` exports
`roundTo(n, places)` = `Math.round((Number(n) || 0) * 10 ** places) / 10 ** places`.
Replace, in your allowed files only, every hand-written `Math.round(x * 10^k) / 10^k`
and every local `round2`/`round3`: costingCompute.js `round2`, overtimeSplit.js `round3`,
statistics-helpers.js `round2` (~205), and statistics.js's inline ones (~280, 408, 416,
474, 475, 531, 535, 536, 550, 551, 552, 562; a percent written `Math.round(r*1000)/10`
becomes `roundTo(r*100, 1)`; a whole percent `Math.round(r*100)` becomes
`roundTo(r*100, 0)`). **Keep every site's current number of decimals** — this is a
consolidation, not a precision change. Leave `daysDiff`'s whole-day Math.round alone
(different kind of rounding). Where a site relied on null/undefined producing null or
NaN rather than 0, keep that behaviour at the call site and say so in the report.
Do NOT start rounding money totals that aren't rounded today.

A6. Docs: time-and-costing.md — where it lists defaults / how settings are read, point at
the two new files. `node --check` every changed file.

---------------------------------------------------------------------------------------
### Group B — server: archive/restore, job numbers, settings names  (F2, F11)

Allowed files (jobcard-system/server/src/…): routes/machines.js, routes/suppliers.js,
routes/tags.js, routes/companies.js, routes/contacts.js, routes/auth.js,
routes/settings.js, db/helpers.js, db/queries/entities.js, db/queries/jobcard.js, the
history queries file under db/queries/ (find it), NEW utils/archiveToggle.js;
docs/notes/api-reference.md, docs/notes/customers-and-tags.md,
docs/notes/jobs-and-status.md. The client is NOT to change: every URL, method and
success response body stays exactly as it is today.

B1. **One archive/restore action (F2).** NEW `utils/archiveToggle.js` exporting
`setArchived(req, res, spec)`:
```
spec = {
  entityType,           // history entity type ('company', 'machine', …)
  load: () => row|null, // prepared-statement lookup
  notFound,             // 404 message the route uses today
  isArchived: (row) => boolean,
  archive: boolean,     // true = archive, false = restore
  write: (row) => void, // the prepared statement(s) + any side effect (e.g. user session kill)
  respond: (row) => body, // the success body the route sends today
  snapshot?: (row) => object
}
```
Behaviour: missing row → 404 `{ error: notFound }`. **Already in the target state → send
`respond(row)` with 200, write nothing, record no history.** Otherwise `write(row)`,
`recordHistory(entityType, id, archive ? 'archive' : 'unarchive', req.user.userId,
actorName(req), { status: { from, to } }, snapshot?.(row))` with the from/to labels every
route uses today (check they are identical across routes — if they differ, report and
use the companies.js wording), then `res.json(respond(freshRow))`. Errors: the existing
try/catch + logger.error pattern.

Convert every manual archive/restore route to it: companies archive/unarchive, contacts
archive/unarchive, machines DELETE /:id + POST /:id/activate, suppliers
POST /:id/deactivate + /:id/activate, tags DELETE /:id + POST /:id/activate, users
POST /users/:id/deactivate + /:id/activate (auth.js). Route-specific refusals stay in the
route, before the call: users' self-archive and admin-account guards, machines' "another
active machine now has this number" restore refusal. The user-archive session kill goes
in its `write`. Job cards' invoicing archive and POST /jobcards/:id/unarchive are NOT
in scope. The tags create route's "revive an archived tag of the same name" stays as is.
Also: if the `machines` and `tags` tables have an `updated_at` column, make their
archive/activate statements set it like the other entities do (UTC ISO form per
dates-and-timezones rules — copy the expression the other statements use); if not, leave
them.

B2. **One job-number reader (F11, job numbers).** Move the job-number knowledge out of
settings.js into db/helpers.js:
- `formatJobNumber(prefix, num, width)` = `prefix + String(num).padStart(width, '0')`;
  `peekNextJobNumber` uses it.
- `highestUsedJobNumber(prefix)` → `{ num, deleted }` or `null`: the current body of
  settings.js ~163-181 (existing jobs with this prefix + numbers kept in the delete
  trail), with its comment, using two NEW prepared statements (the prefix scan in
  db/queries/jobcard.js; the deleted-numbers query next to the other history queries).
settings.js keeps only the decision and the message, using both helpers (the padded
number in the message comes from `formatJobNumber`). No `db.db.prepare` left in
settings.js — grep.

B3. **One name per setting (F11, names).** settings.js PUT: delete the snake_case
fallbacks (`?? req.body.job_folders_base`, `inactivity_timeout_minutes`,
`job_number_prefix`, `job_number_next`). The client already sends only the camelCase
names (verified). Leave the admin-only/overtime key rejection logic alone (a later group
changes it). Update api-reference.md if it mentions the old names.

---------------------------------------------------------------------------------------
### Group C1 — client: service list, status change  (F1, F5)

Allowed files (jobcard-system/client/src/…): hooks/useTags.js,
components/TagManagement.jsx, components/SupplierManagement.jsx, the
CreatableTagSelect.jsx component (find its path), components/JobCardList.jsx,
components/jobcard/JobIdentityStrip.jsx, components/jobcard/jobCardPrompts.jsx, NEW
components/jobcard/changeJobStatus.js, services/api.js (tag methods only, if needed);
docs/notes/customers-and-tags.md, docs/notes/client-patterns.md.

C1-1. **Changing an option refreshes every list that shows it (F1).** Today every screen
that changes an option must remember to call `invalidateTagCache`, which only drops the
cache — lists already on screen keep the old options. Make the change itself do it:
- useTags.js gains a small subscriber set per category. Each mounted `useTags(category)`
  subscribes on mount / unsubscribes on unmount and re-fetches when notified.
- useTags.js exports `tagActions = { create(data), update(id, data), archive(tag),
  restore(tag) }` (tag = an object carrying `id` and `category`; for `update`, notify
  both the old and new category if the category changed — read how TagManagement uses
  it). Each calls the api method, then drops that category's cache and notifies its
  subscribers, then returns the api result. Failures propagate to the caller unchanged
  (the caller keeps its own toast).
- Delete the `invalidateTagCache` export. Every caller — TagManagement (create, update,
  archive, restore), CreatableTagSelect (create), SupplierManagement (add custom service,
  archive service) — uses `tagActions` instead of calling `api.createTag/updateTag/
  archiveTag/activateTag` directly. Afterwards those four api methods must be called
  from useTags.js ONLY — grep and show it in the report. Each screen's own local list
  update (e.g. SupplierManagement's `setServiceTags`) may stay.

C1-2. **One status-change flow (F5).** NEW `components/jobcard/changeJobStatus.js`
exporting `async function changeJobStatus(opts)`:
```
opts = {
  jobId, newStatus, showConfirm,
  prepareInvoice?: async () => ({ total, costingChangesSaved } | null), // null = cancel
  beforeSend?: async () => void,
  onApplied: async () => void,   // screen's own success handling (no toast)
  onJobClosed?: () => void,      // the job is closed (isJobClosedError)
  onFailed?: async () => void,   // after the shared error toast
}
```
Order (this is today's JobIdentityStrip order): if newStatus is INVOICED → run
`prepareInvoice` if given (null → stop), then `confirmMarkInvoiced(showConfirm,
{ total, costingChangesSaved })` (no → stop). `beforeSend`. Send
`api.updateJobcardStatus`. Success → `onApplied()` then the ONE success toast
`Status updated to <label>` (STATUS_LABELS). 409 with attachmentWarnings →
`confirmInvoiceAnyway` → resend with confirmation → same success/failure handling.
Closed-job error → `onJobClosed` if given, else treated as a failure. Any other failure
→ `toast.error(err.message || 'Failed to update status', { id: 'status-update-failed' })`
then `onFailed`. Also a per-job in-flight guard inside the module: a second call for a
job whose change is still running is ignored (the list has none today).
- JobIdentityStrip: its costing-invalid refusal, costing save and fresh-total fetch move
  into its `prepareInvoice`; `whenPartSavesSettled` is its `beforeSend`; its local
  field update + `onSuccess` is `onApplied`; `onJobClosed` as today. If `statusBusy`
  only served as the double-click guard, delete it; if the screen uses it (e.g. to
  disable the picker), keep it and say so.
- JobCardList: `onApplied` = its current applyLocally minus the toast (INVOICED →
  reload; else patch row + refreshMissingFiles); `onJobClosed` and `onFailed` = reload
  the list (today's behaviour). The list shows no total (it has no pricing access) —
  pass no `prepareInvoice`.
- Delete both old inline flows. Success toast wording becomes the list's
  `Status updated to <label>` in both places (intended).

---------------------------------------------------------------------------------------
### Group C2 — client: pricing figures, date check, rounding  (F7-client, F3-client, F12-client)

Allowed files (jobcard-system/client/src/…): components/jobcard/mappers.js,
components/jobcard/useCosting.js, components/jobcard/useJobCardCosting.js,
hooks/useLabourRates.js, components/Statistics.jsx, utils/formatters.js,
utils/excelExport.js, components/jobcard/tabs/CostingBreakdown.jsx,
components/jobcard/useTimeEntries.js, components/statistics/MachinesTab.jsx,
components/statistics/CustomersTab.jsx, components/jobcard/tabs/LineItemProgress.jsx,
components/jobcard/tabs/StopTimerForm.jsx (find exact paths).
NOT JobCardList.jsx / JobIdentityStrip.jsx (C1 owns them).

C2-1. **The server is the only source of pricing figures (F7).** The server's costing
reply always carries every figure filled in (verified: only the `*Override` fields may be
null, and null there means "follow the calculated figure").
- Merge `mapCostingResponseToData` (mappers.js ~259) and `formFromCosting`
  (useCosting.js ~52) into ONE reply→form mapping, with NO `?? 1.5 / 2 / 2.5 / 100 / 0`
  fallbacks. If the intermediate "data" shape is read by something other than the form,
  keep that reader working and say what it is; otherwise delete the intermediate shape.
- `getDefaultCostingForm` (the form before anything has loaded): figures become `null`,
  not the company defaults. Then check: can the pricing sheet be shown, edited or saved
  while it still holds the blank form (before the first load finishes, or after the
  reset at useCosting ~723)? If yes — report exactly how, do not change it. If no —
  say so.
- useLabourRates.js: the pre-load placeholders `useState('1.5')` / `'2'` / `'2.5'` become
  `''` (the page fills them from the loaded settings). Check the page does not save or
  validate those boxes before load; report if it does.

C2-2. **One calendar-day check (F3, client side).** In utils/formatters.js, next to
`todayIsoDate`, add `isCalendarDate(value)` — same rule as the server's (a `YYYY-MM-DD`
string naming a day that exists; build with `Date.UTC(y, m-1, d)` and check it reads
back; 2026-02-30 false, 2028-02-29 true). Replace the checks in Statistics.jsx (~82-83)
and useLabourRates.js (~240; today regex only). A comment on the helper names the
server twin `server/src/utils/calendarDate.js` (client and server can't share code; the
two must agree).

C2-3. **One rounding helper (F12, client part).** In utils/formatters.js add
`roundTo(n, places)` (same body as the server's). Replace hand-written
`Math.round(x * 10^k) / 10^k` in excelExport.js (~71), CostingBreakdown.jsx (~34),
useTimeEntries.js (~194), MachinesTab.jsx (~30, 36, 49, 152, 168, 226, 304, 338),
CustomersTab.jsx (~46, 84), LineItemProgress.jsx (~90), StopTimerForm.jsx (~243), and
any other in your files. Keep every site's decimals exactly. Do not touch `toFixed`
display formatting or `formatMoney`.

=======================================================================================
## WAVE 2 — one executor, after wave 1 is reviewed

### Group E — server: job details, customer hiding, printout dates, remaining rounding  (F8, F9, F10, F12 rest)

Allowed files (jobcard-system/server/src/…): routes/jobcard-mutations.js,
routes/jobcard-helpers.js, routes/search.js, routes/jobcards.js,
routes/jobcard-printout.js (only if the call into the printout view changes),
utils/qaTemplateProvisioning.js; docs/notes/files-and-qa.md,
docs/notes/dates-and-timezones.md, docs/notes/auth-and-security.md.
Uses wave-1 helpers: utils/calendarDate.js (`formatDayAu`), utils/officeTime.js
(`officeDateString`), utils/round.js (`roundTo`), utils/overtimeSettings.js,
utils/costingDefaults.js.

E1. **Quality forms are filled from the saved job (F8).** One function in
jobcard-helpers.js, `qaFillDataForJob(jobcardId, qualityLevelName)`, reads the job with
the prepared lookup (the same row shape `current` has in the QA-level-change path) and
builds the field list once: jobNumber, status, companyId, companyName, description,
priority ('NONE' when empty), dueDate, qualityLevel, poNumber, quoteReference, repeatJob
('Yes'/'No' from the saved flag), repeatJobReference — then passes through
`buildQaFillData` as today (fold `buildQaFillData` into it if nothing else calls it).
Both call sites (job create ~245 — after the job row is saved; QA level change ~414)
call it. Delete both inline field lists and every `current.x || data.x` fallback.
Check the create path: the row must be saved (transaction committed) before the call;
report if it isn't.

E2. **One "hide customer details" step (F9).** In jobcard-helpers.js,
`customerFields(row, canManage)` returns the six camelCase customer fields
(`CUSTOMER_HISTORY_FIELDS`: companyId, contactId, contactName, companyName,
contactPhone, contactEmail) from the row, or all `null` when `canManage` is false.
formatJobcard spreads it (replacing its inline block); search.js `formatJob` takes
`companyName`/`contactName` from it (keeping its current reply shape — no new fields);
the printout view (`buildJobCardView`) takes `company` from its `companyName` (`''` when
null, as today). Search's supplier results (`formatSupplier`): contact phone/email are
hidden from non-management the same way suppliers.js hides them — reuse suppliers.js's
formatting if it is exported, else gate in search with the same `canManage` and say so.

E3. **Printout and quality forms use the office's day (F10).** Delete `formatAuDate`.
- Created date (a moment) → `formatDayAu(officeDateString(new Date(created_at)))`.
- Due date (a bare calendar day) → `formatDayAu(due_date)` — no Date object, no zone.
- Both places that use them: buildJobCardView (~529-530) and buildQaFillData (~420-421).
- qaTemplateProvisioning.js ~88: the form's "date" → `formatDayAu(officeDateString(new Date()))`.
Update dates-and-timezones.md: the printout and quality forms follow the office day; a
due date is never passed through a Date.

E4. **Remaining rounding and settings reads (F12, F4 rest).** search.js ~130 and ~419,
jobcards.js ~465 → `roundTo` (same decimals). jobcard-mutations.js ~192
(`Number(getSettings().labour_default_rate) || 0`) → `readOvertimeSettings().defaultRate`.

=======================================================================================
## WAVE 3 — one executor, after wave 2 is reviewed

### Group D — who may do what is written once  (F6)

Today "is this person an admin" is typed out ~20 times on the client and ~15 on the
server, each spot deciding for itself that money / the activity trail / backups are
admin-only. Replace the role check with a named permission, and write the permission
table once.

D1. NEW `server/src/shared/permissions.json` (same folder and import mechanism as
jobStatuses.json — the client imports it the way components/jobcard/constants.js
imports jobStatuses.json):
```json
{
  "management":    ["admin", "manager"],
  "pricing":       ["admin"],
  "activityTrail": ["admin"],
  "systemData":    ["admin"],
  "adminAccounts": ["admin"],
  "deleteJob":     ["admin"],
  "stayLoggedIn":  ["admin"]
}
```
Meaning — pricing: the Costing tab and both costing routes, the Labour Rates page and the
labour/overtime settings keys, the Excel costing sheet, invoiced totals in customer
statistics. activityTrail: Activity Log page, /history routes, per-job Activity tab and
its route, the search activity scope. systemData: backup export/import, the job-folders
base path, the home-access card. adminAccounts: creating, promoting, editing,
archiving, restoring an admin account. deleteJob: deleting a job. stayLoggedIn: exempt
from the inactivity sign-out.

D2. Server middleware/auth.js: `can(role, permission)` (throws on an unknown permission
name, so a typo fails loudly), `requirePermission(permission)`; `isManagement(role)` =
`can(role, 'management')`; `MANAGEMENT_ROLES` comes from the JSON. Delete
`requireAdmin`. Client utils/roles.js: `can(user, permission)` and `isManagement(user)`
the same way, both from the JSON.

D3. Replace every hand-typed admin check and every `requireAdmin` with the permission
it actually gates (the full inventory is in the wave-1 research: App.jsx route guard,
JobCardListColumns delete button, JobCardList export, Layout nav links, SearchPage
scopes, UserManagement, JobCardModal + useJobCardCosting + useJobCardCloseGuard +
useJobCardTimerActions, CustomersTab, useSettings/Settings/HomeAccessCard,
AuthContext idle exemption; server auth.js user routes, settings.js GET strip and PUT
rejections, search.js activity scope, statistics.js invoiced totals, history.js,
jobcard-costing.js, jobcards.js history + delete, settings.js backup routes). Grep
`'admin'` afterwards on both sides: the only survivors may be places that talk about the
admin **role itself** — the role list, seeding the first account, the "target account
is an admin" test, the last-admin count, offering "Admin" in the role picker. List every
survivor in the report with why.
Props/variables named `isAdmin` that carry a permission are renamed for what they gate
(`canSeePricing`, `canSeeActivity`, …), matching the existing `canManage` convention.
App.jsx's admin-only route guard takes the permission as a parameter.

D4. Docs: CLAUDE.md "Roles and permissions" — the Role checks bullet names `can` /
`requirePermission` and the JSON file instead of `requireAdmin`; auth-and-security.md
likewise. No policy changes: every role must be able to do exactly what it can today.

Allowed files: every file named in D3, server/src/shared/permissions.json,
middleware/auth.js, client utils/roles.js, CLAUDE.md (Roles and permissions section
only), docs/notes/auth-and-security.md, docs/notes/api-reference.md.
