# Root-cause fixes — 2026-09-27 (follow-up to review-fixes-2026-09-27.md)

Frozen spec. The previous round fixed 16 findings; five of those fixes were patches over a
cause left in place. This spec replaces those five patches with root-cause fixes. The
user's decisions are recorded under each group and are not to be re-litigated.

House rules (CLAUDE.md) apply in full: camelCase JS, prepared statements, recordHistory
`{ field: { from, to } }`, field errors via hooks/useFieldErrors.js + common/FieldError.jsx
(never both a field mark and a pop-up for one failure), spacing tokens, lucide icons,
startup conversions in runMigrations, delete legacy code (no compatibility branches),
update the matching docs/notes/*.md in the same change.

Environment constraints (every executor):
- node_modules is shared with a running Windows install. NEVER run npm install / npm ci /
  rebuild / seed / the server / vite build. Verification = `node --check <file>` for every
  changed server .js file, plus careful re-reading of every hunk. Client .jsx cannot be
  node-checked.
- Do not commit. Touch only your group's allowed files — other executors work in the same
  tree at the same time.
- A step that cannot be done as written is reported back, not improvised.

=======================================================================================
## Group S — server (executor S)

Allowed files: jobcard-system/server/index.js, server/src/middleware/closedJob.js (new),
server/src/middleware/validation.js, server/src/utils/timeEntryHelpers.js,
server/src/routes/jobcard-time-entries.js, server/src/routes/jobcards.js,
server/src/routes/jobcard-mutations.js, server/src/db/init.js, server/src/routes/settings.js,
docs/notes/jobs-and-status.md, docs/notes/time-and-costing.md, docs/notes/api-reference.md,
docs/notes/auth-and-security.md, docs/notes/customers-and-tags.md, CLAUDE.md (the one
"Work drives job status…" invariant line only).

### S1. One lock for a closed (invoiced/archived) job
User decision: **once a job is invoiced, nothing on it can change until it is unarchived.**
Today the lock is written route by route (four time routes via refuseIfArchived, four
assignee routes via pasted inline checks, a status-only check in PUT /:id and PATCH
/:id/status) and parts, comments, files, pricing and the job's own fields are open.

1. New `server/src/middleware/closedJob.js` exporting `closedJobGuard`. It is mounted
   ONCE in server/index.js as `app.use('/api/jobcards/:id', closedJobGuard)` placed before
   the four `app.use('/api/jobcards', …)` lines, so every job write — including any route
   added later — is locked by default.
2. Behaviour: GET/HEAD/OPTIONS pass. Any other method: look the job up by
   `req.params.id` through jobcardQueries (prepared statement). No such job → `next()`
   (the route answers its own 404; this also lets `POST /api/jobcards/attachment-warnings`
   through). Job `archived === 1` and the request is NOT on the allow-list → 409
   `{ error: 'This job is invoiced and closed. Unarchive it to make changes.', code: 'JOB_CLOSED' }`.
3. Allow-list, matched on method + the path remaining under /:id — and nothing else:
   - `POST /unarchive` — the way out of the lock
   - `DELETE /` (the job itself; admin-only in its route)
   - `POST /time-entries/:entryId/stop` — CLAUDE.md invariant: stopping always works
   - `POST /printed` and `POST /saved` — they record that paperwork was printed/saved,
     they do not change the job
   Keep the allow-list as one named constant with a one-line reason per entry.
4. Authentication: the guard runs before each route's own `authenticate`, so an anonymous
   caller could learn a job is archived. Read middleware/auth.js `authenticate`: if running
   it twice on one request has no side effects (no session touch, no counter, no history),
   mount as `app.use('/api/jobcards/:id', authenticate, closedJobGuard)`. If it does have
   side effects, mount without it and say so in the report.
5. Delete what the guard replaces: `refuseIfArchived` in utils/timeEntryHelpers.js (and
   its export, and its four call sites in jobcard-time-entries.js), the four inline
   archived checks in jobcards.js's assignee routes, the archived status check in
   PATCH /:id/status and in PUT /:id (jobcard-mutations.js ~295-302, including its comment
   saying other fields stay editable). Check jobcards.js ~93 and utils/jobStatusAuto.js ~71
   — those are reads/no-ops, leave them.
6. The invoicing path itself (PUT /:id or PATCH /:id/status setting INVOICED on a job
   that is not yet archived) is unaffected — the guard only sees already-archived jobs.
7. Docs: rewrite the lock text in jobs-and-status.md ("An archived … job is
   status-locked…", the assignee paragraph's refusal sentence, the item-endpoints
   "no archived-job lock" parenthesis) into one statement of the new rule with the
   allow-list; same in time-and-costing.md where it describes the archived time lock;
   api-reference.md if it lists per-route archived refusals; update the CLAUDE.md
   invariant line "Invoiced is terminal and archives the job; … an archived job's time
   can't be started, added, edited, resumed or deleted (stopping always works)" to say an
   archived job can't be changed at all until unarchived (stopping a timer, printing and
   unarchiving still work).

### S2. Backup restore runs the full startup conversion pass
Today the import hand-picks conversions (normalizeStoredTimestamps, foldGoodPiecesToWhole,
renameLegacyPrintTrail, the schedule snap added last round). The overtime-hours bug was a
conversion missing from that list.

1. In db/init.js, factor the conversion part of boot into one exported function
   `runStartupConversions()` = the timestamp normalisation block (currently inline in
   initializeDatabase, with its try/catch) followed by `runMigrations()`. initializeDatabase
   calls it in the same position as today.
2. settings.js import-backup: replace the four hand-picked conversion blocks (timestamps,
   good pieces, print trail, the labour-schedule snap) with a single
   `runStartupConversions()` call at the same point, AFTER the kept print cutover is
   written back (order matters for renameLegacyPrintTrail — keep it). Keep a try/catch
   around it with the existing "records restored; next restart will retry" style log.
   Rationale in a comment: a restore must end in exactly the state a restart would produce.
3. Read every block in runMigrations: each must either be idempotent or guarded by a
   settings flag, and each must catch its own errors (so one failing conversion can't
   abort a restore). A block that doesn't catch its own error → wrap it; a block that is
   neither idempotent nor flag-guarded → report, don't change it.
4. Delete `scheduleToWholeHours`'s export and the other now-unused exports from init.js
   (foldGoodPiecesToWhole / renameLegacyPrintTrail / PRINT_NAMING_CUTOVER_KEY stay exported
   only if something else still imports them — grep).
5. Keep validateSchedule's "minutes must be 00" check in settings-overtime.js as is (that
   is the entry rule, not a patch).

### S3. A picked contact's details come from the saved contact
User decision: **picking a saved person copies their stored phone/email as-is, no
re-check; only details typed for the job are checked.**

1. POST /jobcards (jobcard-mutations.js): when `contactId` is given, each of
   contactName / contactPhone / contactEmail that is ABSENT from the body (undefined) is
   taken from the saved contact row. A field present in the body is what was typed for
   this job and is stored as sent (already validated).
2. validation.js: delete `isPickedContactsOwnPhone`, `getContactQueries` and the
   `onlyIf` parameter added to `optionalPhone`. validateJobcardContactFields becomes a
   plain chain (optionalString contactName 200, optionalEmail contactEmail,
   optionalPhone contactPhone) that checks whatever the body carries.
3. The client (group C) will stop sending a picked person's untouched details.

### S4. Validation errors name their field
`handleValidationErrors` (validation.js ~51): keep `error` and `details` exactly as they
are, and add `fields: errors.array().map(e => ({ field: e.path, message: e.msg }))`.
(Confirm the express-validator version in server/package.json exposes `path`; older
versions call it `param` — use whichever it has.) Document the shape in api-reference.md.

Report: per step what changed; `node --check` output for every changed server file;
`git diff --stat`.

=======================================================================================
## Group P — pricing sheet boxes (executor P)

Allowed files: jobcard-system/client/src/components/jobcard/useCosting.js,
client/src/components/jobcard/useJobCardCosting.js,
client/src/components/jobcard/tabs/CostingTab.jsx,
client/src/components/jobcard/tabs/CostingBreakdown.jsx (and any other file under
jobcard/tabs/ that renders a costing input — list it in the report),
client/src/components/jobcard/useJobCardCloseGuard.js,
client/src/components/jobcard/JobIdentityStrip.jsx (invoicing path only),
client/src/components/jobcard/mappers.js (getDefaultCostingForm only, if needed),
CSS files next to those components, docs/notes/time-and-costing.md,
docs/notes/client-patterns.md.
Do NOT touch JobCardModal.jsx (group C owns it this round). If the tab-switch question in
P5 needs a change there, describe the exact hunk in the report instead.

### The cause
Every keystroke in a pricing box is parsed and coerced into a number in the saved form
(`handleCostingChange`: `Math.max(min, typed || 0)`). The box therefore can't hold what
the person is actually typing — blank, half-typed, below the floor — so last round bolted
on a remembered-figure ref (`blankRestoreRef`, `NUMERIC_HOLD_FIELDS`), a pre-send patch in
runSave, a move-forward after each save, reply-refill exceptions and a "can't happen"
toast. Since saving now only happens on leaving a box, the right shape is: **a box holds
the text being typed; leaving the box is the single moment that text is judged and
committed.**

### User decisions (behaviour contract)
| Situation | Behaviour |
|---|---|
| Plain box (labour rate, special hours/rate, materials cost/%, subcontractor cost/%) left blank | Commits **0** and saves. |
| Override box (normal/OT1/OT2/holiday hours, OT1/OT2 multiplier) left blank | Unchanged: drops the hand figure, follows the logged/company figure, saves. |
| Figure below the box's floor (negative anywhere; multiplier below ×1) or not a number | Box keeps the typed text, is marked red with a message under it (FieldError). **Nothing saves** until fixed. |
| Escape in a box | Counts as leaving: commit + save (house rule). |
| Enter in a box | Commits that box and saves, cursor stays. |
| While typing | Totals (tier totals, grand total, header running total) update live from what is typed. Nothing is sent. |
| Red box + close the job / leave the Pricing tab | Ask: "This pricing figure isn't saved — fix it or discard it?" Fix = go back to the box. Discard = drop the typed text, the box shows the last saved figure. |
| Red box + invoice | Refused. Say so, go to the Pricing tab and bring the red box into view. The job is never billed on a figure the admin didn't mean. |

### P1. Drafts, not coerced figures
1. useCosting keeps two things: the **committed** form (numbers and flags, as today —
   the only thing a save ever sends) and a **drafts** map `{ [fieldName]: text }` for boxes
   being typed in. Every typed box on the sheet — number AND the three description text
   boxes — writes to drafts on change; nothing else happens on a keystroke (no markEdited,
   no clamp, no toast).
2. What the sheet shows in a box = the draft if one exists, else the committed value.
   Expose this as the form the sheet renders so callers don't have to merge.
3. Live totals: calculateCostingTotals reads committed values overlaid with parsed drafts
   (blank plain → 0, blank override → its Calculated figure, unparseable → treat as 0 for
   display only). The save payload's totals are computed from the committed form only.
4. Number boxes become `type="text" inputMode="decimal"` (the part quantity box pattern),
   because a `type="number"` box reports junk like "1-" as '' and junk would then commit
   as 0. Keep every id, name, aria and label wiring as it is.

### P2. Leaving a box commits it — one function
`commitBox(name)` is the single place a draft becomes a figure. Called by the box's blur
(which already covers Tab, click-away, Escape-then-close, tab switch), and by Enter.
1. No draft for this box → nothing to do.
2. Text field → apply the existing leave-time tidy (capitalise-first — find where it runs
   today and fold it in here), commit, drop the draft.
3. Number field → trim. Blank: plain box → 0; override box → drop the override flag and
   take the Calculated figure. Otherwise must match a plain non-negative decimal
   (`/^\d+(\.\d+)?$|^\.\d+$/` or equivalent); not matching → red "Enter a number."; below
   FIELD_MIN → red with the floor in words ("Can't be below ×1." / "Can't be negative.").
   Red: keep the draft, set the field error, do not commit, do not save.
4. Valid → clear the field's error, drop the draft, and if the committed value actually
   changes, markEdited + commit (+ set the override flag for an override box) and request
   the save. Unchanged → just drop the draft (no save, sheet not dirtied).
5. Field errors use hooks/useFieldErrors.js; render with common/FieldError.jsx under the
   box, and wire aria-invalid/aria-describedby with its helpers.

### P3. Delete the patch machinery
Remove entirely: NUMERIC_HOLD_FIELDS, blankRestoreRef and every read/write of it, the
blank-patch block in runSave, the "move forward after save" loop, the reply-refill
exceptions for hold fields AND for TEXT_FIELDS (drafts make both unnecessary: a reply
only ever touches committed values, never a box being typed in), the
'costing-blank-box' toast, the 'costing-min-clamp' toast, the clamp in the change
handler, and the fieldName-dependent branch in saveOnBoxBlur. `revertField`, the
reset-to-logged links, "use company default" and "Reset all to auto" set committed values
directly, drop that box's draft and error, and request the save as they do today.

### P4. Unsaved state
1. `costingDirty` keeps meaning "committed figures not yet stored". Add `costingInvalid`
   (true while any box is red) and expose the first red field's name.
2. flushCosting (leaving the tab, closing, invoicing): first commit the box that has
   focus if it is a pricing box (or all drafts — pick one, state it); then if
   costingInvalid → return a result that says so and which field, without saving;
   otherwise behave as today. Update its callers to the new result shape.
3. The save status line shows a distinct state while a box is red, e.g. "Not saved — fix
   the red box" (use --danger-ink for the words).
4. The window-refresh leave-page question must also fire while a draft or red box exists.

### P5. Close, tab switch, invoice with a red box
1. Close (useJobCardCloseGuard.js): after its existing blur + settle wait, if pricing is
   invalid, ask the fix-or-discard question (useConfirmDialog, same component the guard
   already uses). Fix → stay open on the Pricing tab with the box focused. Discard →
   `discardCostingDrafts()` (drops drafts + errors) and close.
2. Leaving the Pricing tab (useJobCardCosting.js's leave-tab flush): same question. If
   the tab switch cannot be cancelled from where that flush runs, report exactly what the
   JobCardModal.jsx hunk needs to be; do not edit JobCardModal.jsx.
3. Invoicing (JobIdentityStrip.jsx ~212): if pricing is invalid, refuse before any
   request, show a toast "Fix the red pricing figure before invoicing.", and call back to
   switch to the Pricing tab and scroll the box into view (scrollFieldIntoView). If
   switching tabs needs a prop JobIdentityStrip doesn't have, report the JobCardModal hunk.

### P6. Docs
time-and-costing.md: replace the blank-box / backstop / clamp descriptions with the
behaviour contract table above in prose. client-patterns.md: record the pattern — "a box
that saves on leave holds its typed text as a draft; leaving is the one moment it is
judged and committed; a server reply never touches a draft".

Report: per step; the list of costing input components touched; any JobCardModal.jsx
hunk needed (exact code); `git diff --stat`.

=======================================================================================
## Group C — client lock + contact boxes (executor C, runs AFTER P and S land)

Allowed files: client/src/utils/jobLock.js (new), client/src/components/JobCardList*.jsx
+ JobCardList.css, client/src/components/jobcard/** EXCEPT useCosting.js,
client/src/components/jobcard/mappers.js (payload + formFromApi only),
client/src/services/api.js (only if the error object doesn't already carry `data.fields`),
docs/notes/client-patterns.md, docs/notes/jobs-and-status.md (client lines).

### C1. One client rule for a closed job
1. `utils/jobLock.js` exports `isJobClosed(job)` → `Boolean(job?.archived)` — the same
   flag the server lock keys on. Every "can this job still be changed?" test in the client
   uses it and nothing else. Make sure the job screen's loaded job carries `archived`
   (check the API mapper; add it if missing).
2. Replace the three current tests: JobCardListColumns.jsx's `showArchived` proxy for the
   assignee column AND the status badge's `!showArchived` in `changeable` (both use the
   card's own flag instead); DetailsTab.jsx `assigneesLocked` (`status === 'INVOICED'`);
   useJobCardForm.js toggleAssignee's status test. Find any other `'INVOICED'` or
   archived test used to decide editability (e.g. the time-entry lock added last round)
   and switch it.
3. Job screen when closed — for EVERY role including admin: every field, part, worker,
   comment box, file upload/assign/delete control, pricing box and time control is
   read-only or hidden (follow how each area already renders read-only for workers where
   such a mode exists; reuse it). One line at the top of the job screen: "This job is
   invoiced and closed. Unarchive it to make changes." Printing still works.
4. A 409 with `code: 'JOB_CLOSED'` from any job write (the job was invoiced from another
   PC while this screen was open) shows that same sentence as a toast with a stable id and
   reloads the job so the screen goes read-only.

### C2. Contact boxes on a new job
1. Delete the client copies of the server's rules added last round: CONTACT_PHONE_FORMAT,
   CONTACT_EMAIL_FORMAT and the handleFormSubmit wrapper in JobCardModal.jsx (restore
   `onSubmit={handleSubmit}`), and the trim added in mappers.js's contactEmail line is
   kept only if the other two contact fields are trimmed the same way.
2. buildJobcardPayload: when a saved person is picked, send contactName / contactPhone /
   contactEmail only for the ones that differ from the picked person (detailChanges);
   leave the others out so the server copies them from the saved record (server S3). With
   no person picked, send all three as today.
3. Map server field errors onto the boxes: when Create fails with a 400 whose
   `data.fields` contains contactName / contactPhone / contactEmail (job route) or
   contactName / phone / email (the contact routes called first by "Update contact" /
   "Add as new person" in jobCardContact.jsx), mark the matching box with
   useFieldErrors/FieldError and scroll it into view — no pop-up for those. Any other
   failure stays a toast. Keep the field-error props DetailsTab.jsx gained last round.
4. The email box stays `type="text" inputMode="email"`.

Report: per step; every file touched; `git diff --stat`.

### C0. Wire group P into the job screen (do this first)
Group P rebuilt the pricing boxes but could not edit JobCardModal.jsx or useUnsavedGuard.js.
Apply exactly these (group P's report), adapting line positions only:
1. JobCardModal.jsx, next to `showDetailsTab`:
   - `revealCosting = useCallback((fieldName) => { setActiveTab('costing'); if (fieldName) requestAnimationFrame(() => scrollFieldIntoView(fieldName)); }, [])`
     (scrollFieldIntoView is already imported — keep that import even after C2 removes the
     contact check that also used it; if nothing else uses useFieldErrors there after C2,
     drop that import).
   - `handleTabChange = useCallback(async (tab) => { if (activeTab === 'costing' && tab !== 'costing' && isAdmin) { const { proceed } = await costingHook.guardLeaveCosting(showConfirm); if (!proceed) return; } setActiveTab(tab); }, [activeTab, isAdmin, costingHook, showConfirm])`
   - pass `revealCosting` into useJobCardCloseGuard alongside `revealDetails`.
2. The three tab buttons call `handleTabChange('details'|'costing'|'activity')` instead of setActiveTab. Check for any other place that switches away from the costing tab by the person's action (e.g. keyboard shortcuts) and route it through handleTabChange too.
3. JobIdentityStrip props: add `costingInvalid={isAdmin && costingHook.costingInvalid}`, `invalidCostingField={costingHook.firstInvalidCostingField}`, `revealCosting={revealCosting}`.
4. CostingTab props: add `costingFieldError={costingHook.costingFieldError}`, `costingFieldProps={costingHook.costingFieldProps}`, `costingErrorProps={costingHook.costingErrorProps}` (confirm these names exist in useCosting.js's return; if named differently, use the real names).
5. useUnsavedGuard.js: accept `costingUnsettled = false` and fold it into the "has work to lose" test next to `costingDirty`, so a refresh/close-window with a draft or red pricing box asks first.
6. On a closed job (C1) the pricing tab is read-only, so none of the above can fire there — no special-casing needed.
