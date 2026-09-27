# Review fixes — 2026-09-27

Frozen spec. Fixes the 16 verified findings from the 2026-09-26/27 6-round review loop.
Every fix is at the root cause. Follow CLAUDE.md house rules (camelCase JS, prepared
statements in the queries layer, recordHistory `{ field: { from, to } }` format, toasts vs
field errors via hooks/useFieldErrors.js + common/FieldError.jsx, startup conversions in
runMigrations, delete legacy code, spacing tokens, lucide icons, on-screen "part" wording,
update the matching docs/notes/*.md in the same change when it becomes wrong).

Environment constraints (all executors):
- node_modules is shared with a running Windows install. NEVER run npm install / npm ci /
  rebuild / seed / the server / vite build. Verification = `node --check <file>` for every
  changed server .js file, plus careful reading. Client .jsx cannot be node-checked; re-read
  your hunks.
- Do not commit. Do not touch files outside your group's allowed list. Four executors work
  in the same tree at once on disjoint files — touching another group's file breaks them.
- A step that cannot be done as written is reported back, not improvised.

---------------------------------------------------------------------------------------
## Group A — money and quantity entry (executor A)

Allowed files: jobcard-system/client/src/components/jobcard/useCosting.js,
client/src/components/jobcard/tabs/CostingTab.jsx,
client/src/components/jobcard/tabs/ItemsTab.jsx, docs/notes/time-and-costing.md,
docs/notes/client-patterns.md.

A1. Clearing a costing money box saves $0.
    Root cause: handleCostingChange (useCosting.js ~159-194) only treats a blank box
    specially for fields in OVERRIDE_FLAG; for labourRate, materialsCost,
    materialsProfitPercent, subcontractorCost, subcontractorProfitPercent,
    labourSpecialHours, labourSpecialRate a blank falls through to `Math.max(min, typed || 0)`
    and becomes 0, which the 1s autosave (~424) or the sheet's blur save then sends.
    Required behaviour:
    - Emptying one of those boxes leaves it visibly BLANK (form holds '' for that field), not 0.
    - While any of those boxes is blank, no save is sent (neither the countdown nor the
      blur save). The on-screen totals may treat blank as 0 for display, but nothing blank
      is ever sent to the server.
    - When the person leaves a still-blank box, it goes back to the figure it held just before
      it was emptied (not 0), and no save is triggered by that restore alone (if nothing else
      changed, the sheet is not dirty afterwards).
    - Typing a real number resumes the normal autosave.
    - Do NOT change the override-flag boxes' existing "blank = drop the override" behaviour,
      and do NOT remove the 1s autosave or the blur save.
    Check every other place that reads costingForm (totals compute, the "opened at $X · put
    it back" hint, the unsaved-work guard, save payload builder) copes with '' for those
    fields. Update time-and-costing.md where it describes blank boxes.

A2. Part quantity box turns "1e5" into "15".
    Root cause: ItemsTab.jsx ~338-347 uses type="number" plus a digit-stripping regex; the
    browser accepts exponent syntax, so the strip mangles it.
    Fix: make it a text box like the app's other whole-count boxes (look at the stop-timer
    good/scrap boxes for the house pattern — type="text", inputMode="numeric", pattern if they
    use one) so only digits can be entered. Keep min-1 validation, ids, aria and the
    onFieldType/onFieldBlur wiring exactly as they are.

---------------------------------------------------------------------------------------
## Group B — server guards and checks (executor B)

Allowed files: jobcard-system/server/src/routes/auth.js, routes/jobcards.js (assignee
routes only), routes/jobcard-mutations.js (POST / validator chain only),
middleware/validation.js, routes/contacts.js, routes/settings-overtime.js,
routes/settings.js (backup import only), db/init.js (only to export/reuse the whole-hour
helper), utils/timeEntryHelpers.js (only if reusing refuseIfArchived needs an export),
docs/notes/auth-and-security.md, docs/notes/jobs-and-status.md,
docs/notes/customers-and-tags.md, docs/notes/time-and-costing.md, docs/notes/api-reference.md.

B1. Assignees change on invoiced/archived jobs.
    All four routes in jobcards.js (~150-346: POST/DELETE /:id/assignees/self,
    PUT/DELETE /:id/assignees/:userId) must refuse when the job is archived, before any write
    or history entry. Reuse refuseIfArchived (utils/timeEntryHelpers.js) if its message and
    status fit; otherwise the same status code with a plain message such as
    "This job is invoiced and closed. Its workers can't be changed." Document in
    jobs-and-status.md (Assignees section) and api-reference.md if it lists these routes.

B2. Workers can rename their own account.
    PUT /auth/users/:id (auth.js ~365-484): a caller who is not management may not change
    `name` or `email` on any account including their own → 403 with a plain message. Keep
    everything management can do today unchanged, and keep the existing password/role rules.
    If after this a non-management caller can do nothing useful on this route, make the
    route management-only the way other routes do it (requireManagement), but only if you
    confirm no client code calls it for a non-management user. Update auth-and-security.md.

B3. PUT /auth/users/:id has no field checks.
    Add a validator chain matching validateCreateUser for the fields the update accepts
    (optionalEmail for email, same name length cap, username rules only if the route accepts
    username) — define it in validation.js next to validateCreateUser, reusing its helpers.

B4. New job's typed contact details aren't checked.
    POST /jobcards (jobcard-mutations.js ~28, fields stored ~159-162): add to the route's
    validator chain the same checks POST /contacts uses — optionalEmail('contactEmail'),
    optionalPhone('contactPhone'), optionalString for contactName with the contacts name cap.
    Add them in validation.js (extend validateJobcardEnums or a new small chain used only on
    this route — do not affect PUT). Emails lower-cased only, never normalized (house rule).
    The validation error body must name the field the same way the other validators do, so
    group C can map it to the box.

B5. People can be added under an archived customer.
    POST /contacts (contacts.js ~19): if the company is archived → 409 "That customer is
    archived. Restore it before adding people." (match the wording style of the existing
    archived-customer refusal on job creation). Check PUT /contacts/:id: if moving a person
    INTO an archived company is possible, refuse that the same way. Update customers-and-tags.md.

B6. Restoring a backup brings back sub-hour overtime boundaries.
    (a) settings-overtime.js validateSchedule (~40): refuse any block start whose minutes are
        not "00", with a plain message.
    (b) Backup import (settings.js import-backup): after the settings table is restored, snap
        the imported labour schedule to whole hours using the SAME helper the one-time startup
        conversion uses (init.js ~290-322, scheduleDayToWholeHours) — export/reuse it, don't
        copy it. Keep it inside the import's transaction.
    Update time-and-costing.md.

B7. Failed sign-in records never swept.
    auth.js loginFailures (~20-72): add a periodic sweep that deletes entries whose window
    has passed, using the same expiry test checkLoginRateLimit uses (factor it into one
    helper). Timer must be .unref()'d so it never holds the process open. Every 15 minutes
    is fine.

---------------------------------------------------------------------------------------
## Group C — job list, job screen, customers, export (executor C)

Allowed files: jobcard-system/client/src/components/JobCardList.jsx,
client/src/components/JobCardListColumns.jsx, client/src/components/JobCardListFilters.jsx,
client/src/hooks/useJobCardSort.js, client/src/components/jobcard/useJobCardForm.js,
client/src/components/jobcard/JobCardModal.jsx, client/src/components/jobcard/tabs/DetailsTab.jsx
(assignee lock + new-job contact field errors only), client/src/components/contacts/CompanyPeople.jsx,
client/src/components/ContactManagement.jsx, client/src/utils/excelExport.js,
client/src/components/common/ExportButton.jsx, any CSS file next to those components,
docs/notes/client-patterns.md, docs/notes/jobs-and-status.md (only the client-side line for C1).

C1. Assignee controls on invoiced/archived jobs (client side of B1).
    Job list Assigned To column (JobCardListColumns.jsx ~128-212) and the job screen's people
    controls (useJobCardForm.js toggleAssignee ~235-266 and wherever they render): on an
    archived/invoiced job, show the assignees read-only (no assign/unassign), the same way the
    status badge already goes read-only (see `changeable` ~221). toggleAssignee must also
    refuse early for such a job. Server refusals still surface as a toast.

C2. Workers can't search the job list by worker name.
    JobCardList.jsx ~346: drop the canManage gate on the assignee-name match only (contact and
    company matches stay management-only). Update the non-management search placeholder
    (JobCardListFilters.jsx ~22) to mention workers/assignees.

C3. Sort by Assigned To.
    useJobCardSort.js ~20: sort key = the job's assignee names, lower-cased, sorted
    alphabetically, joined — so jobs showing the same people sort together regardless of who
    was added first. Unassigned jobs keep sorting as they do now (empty string).

C4. Add person under an archived customer (client side of B5).
    CompanyPeople.jsx ~79 / ContactManagement.jsx ~298-336: when the company being edited is
    archived, hide the Add person button and show a short line saying to restore the
    customer first. Server refusal still surfaces as a toast.

C5. New job contact fields: mark the box, not a pop-up (client side of B4).
    DetailsTab.jsx ~360-376 new-job contact name/phone/email: check the email format (and
    phone, if the app has a client-side phone rule elsewhere — reuse it, don't invent one)
    before Create, marking the field with useFieldErrors/FieldError exactly as the other
    new-job required-field checks do. If the server still returns a field error for these,
    map it onto the same box instead of a toast.

C6. Export shows no progress.
    JobCardList.jsx ~483-484 passes undefined as onProgress; ExportButton shows one static
    "Exporting…" toast. Wire the export's progress messages into that same loading toast
    (update it in place by id) so it steps through the stages. Where a stage works through
    jobs in batches (excelExport.js fetchInBatches ~295), include "n of N" in the message.
    Do not add a cancel button and do not change what is fetched.

---------------------------------------------------------------------------------------
## Group D — activity wording, previous-job search, notes (executor D)

Allowed files: jobcard-system/server/src/routes/jobcard-audit-text.js,
client/src/utils/formatters.js, client/src/components/ActivityLog.jsx,
client/src/components/jobcard/tabs/ActivityLogTab.jsx,
client/src/components/jobcard/useJobSearch.js, server/src/routes/search.js (only if D2 needs
it), client/src/services/api.js (only if D2 needs a new call), the component that renders the
Previous Job box (only the wiring to useJobSearch), docs/notes/customers-and-tags.md (line
~31 only), docs/notes/client-patterns.md, docs/notes/api-reference.md.

D1. Activity history shows internal codes.
    (a) Display: formatHistoryValue (client/src/utils/formatters.js ~76-87) translates
        `status` and `priority` field values through the existing STATUS_LABELS /
        PRIORITY_LABELS (import from wherever the job list gets them). Unknown values fall
        back to the raw text. This fixes old and new entries alike.
    (b) Part summaries: jobcard-audit-text.js itemSummary/treatmentsToText (~9-31) write the
        option's display name (via the existing tagName() lookup used by the printout) instead
        of the stored code, for job type, material, drawings, customer property, treatment.
        Existing history rows are an audit record and are NOT rewritten — no conversion.
    Make sure the call sites of itemSummary can reach the tag lookup without a new query per
    part (reuse whatever the printout does).

D2. "Previous Job" box loads every job ever.
    useJobSearch.js ~19-37 fetches all active + all archived jobs on focus. Replace with a
    search-as-you-type call (debounced, like the app's other search boxes) that returns at
    most ~10 matches across active AND invoiced jobs, matching on job number and description
    (and company name only for management — the server must never return customer/company
    data to non-management). Prefer the existing search route's jobs scope
    (server/src/routes/search.js ~240-260 supports includeArchived + limit) if its role rules
    and payload fit; otherwise report back before adding a new route. Keep the box's keyboard
    behaviour (combobox rules in CLAUDE.md UI conventions) exactly as it is. Delete the old
    load-everything code and its 30s cache.

D3. Supplier box note is wrong.
    docs/notes/customers-and-tags.md ~31: rewrite the sentence to say what the box does: an
    empty box lists suppliers tagged for the part's treatment; typing searches all active
    suppliers; any supplier may be chosen. (Check LineItemSupplierPicker.jsx to word it
    exactly; do not edit that file.)

---------------------------------------------------------------------------------------
## Report (every executor)

- Per step: what changed, in one or two lines, or why it was not done.
- `git diff --stat` pasted.
- `node --check` output for each changed server file.
- Anything you noticed but did not touch.
