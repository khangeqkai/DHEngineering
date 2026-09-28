# Critical sign-off: which runs it covers, and invoicing with gaps (2026-09-28)

## Decision (owner, 2026-09-28 — bug-hunt round 11)
1. **Each work run remembers whether its job was Critical when the run was finished.**
   Only those runs need the four inspection answers. Runs finished while the job was
   Standard can be corrected freely, even after the job becomes Critical. Runs finished
   under Critical keep needing answers even if the job later goes back to Standard.
2. **Invoicing a job that has finished runs needing a sign-off but missing answers warns,
   names the runs, and asks for confirmation** (like the missing-attachment question). Only
   management can invoice, so that is the manager's confirm. It is not a hard refusal.
   The job screen marks those runs "Sign-off missing".

Out of scope: warning when a job with logged work is switched to Critical.

All app paths are relative to `jobcard-system/`. Follow CLAUDE.md (camelCase in JS, snake_case
in DB, prepared statements in `db/queries/*`, `recordHistory` changes in `{field:{from,to}}`
shape, all stored moments UTC ISO, shared rules in `server/src/shared/*.js` by the shared-file
convention, a startup conversion for existing data, seed scripts produce the new shape,
field marks not pop-ups, icons from lucide-react, ink tokens for coloured words).

## Steps

1. **New column** `time_entries.critical_at_finish INTEGER` — 1 = the job was Critical when
   this run got its finish time, 0 = it was not, NULL = the run has no finish time yet.
   - Add it to the `CREATE TABLE time_entries` in `server/src/db/schema.js` (with a one-line
     comment) and to `server/src/db/columnMigrations.js`.
   - Add it to every INSERT/UPDATE in `server/src/db/queries/operations.js` (or wherever time
     entries are written) and fix every caller's bound arguments.

2. **Set it at the moment a run is finished, and never change it after.** Server,
   `server/src/routes/jobcard-time-entries.js` (and any other place that writes a finish
   time — search for every write of `end_time`, including the stop route, manual create,
   manual edit, sign-out / auto-stop paths, and anything in `utils/timeEntryHelpers.js`):
   - When a write gives a run its **first** finish time (it had none before, or it is created
     already finished), store `critical_at_finish = isCriticalJob(jobcardId) ? 1 : 0`.
   - When a run already has a finish time, keep its stored value (moving the finish time does
     not re-decide it).
   - If an edit removes a finish time (if that is possible), set it back to NULL.
   - A tiny helper for this belongs in `utils/timeEntryHelpers.js` next to `isCriticalJob`.

3. **The sign-off check reads the run, not today's level.** Change
   `checkCriticalInspection` in `utils/timeEntryHelpers.js` so its "does this run need the
   answers?" input is the run's own `critical_at_finish` value as it will be after this
   write (per step 2), not `isCriticalJob(jobcardId)`. Keep its refusal body exactly as is
   (the `code` / `fields` shape round 11 added — the forms rely on it). Update both callers.

4. **Reply carries it.** Every place a time entry is formatted for the client adds
   `signOffRequired: row.critical_at_finish === 1` (camelCase). Search the server for the
   existing time-entry formatter(s).

5. **Startup conversion (existing data)** in `server/src/db/legacyMigrations.js`
   (`runLegacyMigrations`), idempotent: for every time entry with a finish time and
   `critical_at_finish IS NULL`, decide the job's level at that run's finish time from the
   job's own activity trail, then store 1 or 0:
   - Collect the job's history rows (entity `jobcard`, that job id) whose `changes` contain
     `qualityLevel` (parse JSON; skip unparseable), ordered by time.
   - Level at finish = the `to` of the latest such change at or before the run's finish
     time; if there is none before it but there are later ones, the `from` of the earliest
     later one; if the job has no such changes, the job's current `quality_level`.
   - Judge "Critical" with the shared `isCriticalLevel` (old free-text names like
     "Critical " count, the same as the existing fold conversion).
   - One read of history per job, not per run. Do all updates in one transaction. Do not
     touch `updated_at`, and write no trail entry per run (it's a derived fact, not a
     change anyone made); log the count. A second run finds nothing to do.
   - Make sure it runs after a backup restore too (the restore already re-runs the startup
     conversion pass — confirm, don't assume).
   - Read the history table's actual column names and time format before writing this.

6. **Invoicing checkpoint.** `checkInvoicing` in `server/src/routes/jobcard-helpers.js` gets
   a second soft checkpoint **after** the attachment one, with its own confirm flag
   `confirmMissingInspection` (read from the request body wherever
   `confirmMissingAttachments` is read today — both status routes: `routes/jobcards.js`
   PATCH status and `routes/jobcard-mutations.js`; update `api.js` to send it):
   - Runs that count: finish time set, `critical_at_finish = 1`, any of the four inspection
     answers NULL. Add a prepared query for this in the time-entry queries file.
   - If any, and the flag isn't `true`: refuse 409 with
     `{ error: 'MISSING_INSPECTION', inspectionWarnings: [{ id, workerName, startTime, endTime, itemNumber }] }`
     (whatever the query can join cheaply; times as stored UTC ISO — the client formats them).
   - When the job is invoiced with such runs confirmed away, fold a change into the invoicing
     trail entry: `inspectionSignOff: { from: '<N> run(s) unanswered', to: 'invoiced anyway' }`.
     Look at how `applyInvoicingArchive` builds its changes and follow that pattern; if the
     attachment confirm is recorded somewhere, mirror it.
   - Document the new flag/refusal in `docs/notes/api-reference.md` if that note covers the
     status routes.

7. **Client confirm.** `client/src/components/jobcard/changeJobStatus.js`: the send path
   handles either 409 in turn — attachment warnings → existing `confirmInvoiceAnyway`, then
   inspection warnings → a new `confirmInvoiceWithoutSignOff(warnings, showConfirm)` in
   `jobCardPrompts.jsx`, written like `confirmInvoiceAnyway` (title "Inspection sign-off
   missing", a line per run: worker, date and time range in local time using the existing
   date formatters, part number when known; "Invoice anyway" / "Go back", warning variant).
   Each confirmed flag stays set on the resend, so answering both questions sends both flags
   true. Going back on either stops, sends nothing more. Keep the existing closed-job and
   failure handling for every resend. Check every caller of `api.updateJobcardStatus` (job
   list badge, job screen) goes through this flow.

8. **Job screen mark.** In the job screen's logged-work list (find where time entries are
   listed on the Details tab), a finished run with `signOffRequired` and any of the four
   answers null shows a small "Sign-off missing" mark: lucide `AlertTriangle` at size 14,
   `--warning-ink` text, spacing tokens only, styles in the component's `.css` file.

9. **Forms use the run's flag.** Where the stop-timer form and the hand-entry/edit form
   decide whether to show the checklist:
   - Editing an existing finished run: show it when that run's `signOffRequired` is true.
   - Stop form: the run was just finished by the stop, so use the stopped run's
     `signOffRequired` from the stop reply (or the reloaded entry), not the job level read
     when the form opened.
   - Brand-new hand entry: the job's current level (as today).
   - Keep round 11's handling of the `CRITICAL_INSPECTION_REFUSED` refusal as the safety net.

10. **Seed** (`server/scripts/seed-mock-data.js`): set `critical_at_finish` on seeded
    finished runs to 1 on Critical jobs, 0 otherwise, NULL on running ones. Leave a couple of
    Critical-job runs unanswered so the new mark and the invoicing question can be tried.

11. **Docs.** Rewrite the Critical sign-off paragraph in `docs/notes/files-and-qa.md`
    (the rule is now per run, set at finish; the startup conversion; the invoicing
    question). Add a line to `docs/notes/jobs-and-status.md` where invoicing checkpoints are
    described. Mention `time_entries.critical_at_finish` wherever the notes list
    time_entries columns, if they do.

## Gate
- Allowed files: the ones named above, plus any other writer of `end_time` or time-entry
  formatter that step 2/4 finds (list them in the report with why).
- Run `.claude/skills/bug-hunt/check.sh` — must print `BUILD OK` and `SERVER BOOT OK`.
  Also `node --check` every changed server file.
- Report: each step → the files and hunks that do it; anything you could not do as written
  (report it, do not improvise); `git diff --stat`.
- Do not commit.
