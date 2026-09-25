# Whole-codebase review fixes — 2026-09-25

Frozen spec. Paths are relative to `jobcard-system/`. Read `/mnt/c/Users/khang/Code/DHEngineering/CLAUDE.md` first (house rules: camelCase JS, prepared statements in db/queries, `recordHistory` with `{field:{from,to}}`, UTC ISO dates, toasts via react-hot-toast, never auto-resend a write, no backward-compat branches in live code, update the matching `docs/notes/*.md` in the same change).

Two executors split the work by file ownership:
- **SERVER** executor: steps S1–S9 (server files + docs notes).
- **CLIENT** executor: steps C1–C6 (client files only).
Do not touch a file owned by the other executor. If a step needs one, report it.

---

## SERVER steps

### S1 — Worker status rule (server)
Decision: a non-management user (`!isManagement(req.user.role)`) may change a job's status ONLY when
- the target status is `IN_PROGRESS` or `AWAITING_MATERIAL`, AND
- the job's current status is one of `OPEN`, `IN_PROGRESS`, `AWAITING_MATERIAL`.
Anything else from a non-management user → 403 `{ error: 'Only management can set that status' }`.
Reason: In Progress and Done are driven by logged work automatically; a worker only needs to flag "waiting on material" and clear it. Office statuses stay with management.

- Put the rule in ONE exported helper (e.g. `WORKER_SETTABLE_STATUSES`, `WORKER_STATUS_FROM` and `canSetStatus(role, fromStatus, toStatus)`) in a sensible shared server place (e.g. `server/src/utils/jobStatusAuto.js` or `middleware/auth.js` — pick the one that fits best) and use it in BOTH:
  - `server/src/routes/jobcards.js` `PATCH /:id/status` (currently only guards INVOICED, ~line 358). Check must run after `existing` is loaded, before any write. Keep the existing INVOICED management check (it's covered by the helper, so replace it in place with the helper call; same position).
  - `server/src/routes/jobcard-mutations.js` `PUT /:id` (~line 294, currently blocks every status change by non-management) — replace in place with the helper call.
- No-op (same status) stays allowed as today.
- Update `docs/notes/jobs-and-status.md` (and `docs/notes/auth-and-security.md` if it lists status permissions) to state the rule.

### S2 — Awaiting-details flag cleared only by the worker's form (or resume)
Today `timeEntryQueries.update` (`server/src/db/queries/operations.js` ~line 36-47) always sets `awaiting_details = 0`, so a manager's edit of the block ends the wait and lets invoicing through mid-form.
- Change the update query to take awaiting_details as a parameter (keep single query; add a `?` for `awaiting_details`).
- In `PUT /:id/time-entries/:entryId` (`server/src/routes/jobcard-time-entries.js` ~350, update call ~464): compute the new value:
  - `0` when the body carries `detailsConfirmed === true` (sent ONLY by the stop-timer form's save — CLIENT step C4 adds it),
  - `0` when the save clears the finish time (resume: `endTime` null/absent-to-null on a stopped block — a running block is already blocked by the running-timer check),
  - otherwise keep `existing.awaiting_details` unchanged.
- Add `detailsConfirmed` as an optional boolean in `validateManualTimeEntry` (`server/src/middleware/validation.js` ~383) if the validator rejects unknown fields; otherwise just read it.
- Fix the comment above the query and the paragraph in `docs/notes/jobs-and-status.md` ("cleared to 0 by any save of that block (the worker's own stop-timer form, or a manager's edit)") and in `docs/notes/time-and-costing.md` if mentioned, to the new rule.

### S3 — Suppliers use the shared checks
`server/src/routes/suppliers.js` POST (~76) and PUT (~124) have no validation middleware and no duplicate-name guard.
- Add `validateCreateSupplier` / `validateUpdateSupplier` in `middleware/validation.js` mirroring `validateCreateContact`/`validateUpdateContact` (~234-248): name required & non-blank (trimmed), `optionalEmail('contactEmail')`, `optionalPhone('contactPhone')`. Wire them into both routes.
- Add `supplierQueries.getByName` in `server/src/db/queries/entities.js` mirroring `companyQueries.getByName` (case-insensitive). On create, and on update when the name changes to one used by ANOTHER supplier, respond 409 with the same shape/wording pattern `companies.js` uses (~51-58, archived-aware: if the clash is archived, say it's archived so they restore it).
- Do NOT add a UNIQUE constraint / migration (existing DBs may already hold duplicates).
- Note the rule in `docs/notes/customers-and-tags.md`.

### S4 — Upload checks the part is still on the job
`server/src/routes/jobcard-files.js` upload route (~442) trusts `itemId`. Apply the same membership check the `/assign` route uses (~499-506, `parts.some(it => it.id === itemId)`) before saving; on failure respond 409 `{ error: "That part was removed from the job, so the file wasn't attached." }`. Put the check where both callers of `saveFile` that accept an `itemId` get it (inside `saveFile` if every caller passes itemId through it; otherwise in the route). Check camera/capture routes that also pass `itemId`.

### S5 — Archived-costing backfill retries failures
`server/src/db/init.js` ~316-335: the `archived_costing_backfill_at` flag is written even when a job failed. Remove the flag entirely and let the query (`archived = 1 AND id NOT IN (SELECT jobcard_id FROM job_costings)`) be the idempotence guard — it's naturally a no-op once every archived job has a row, and retries failures next boot. Leave an existing stored flag row alone (harmless) — do not add code that reads it. Keep the logging.

### S6 — File move logged with readable names
`server/src/routes/jobcard-files.js` ~527: `reassign_file` history uses raw stored names with the id tag. Record `{ file: { from: stripStorageTag(filename), to: stripStorageTag(newName) } }` and add a `part: { from: <old part label or null>, to: <new part label or null> }` change so the log says which part it moved between. Use the part description the way `jobcard-audit-text.js` / items history names parts (by description). If the old part can't be resolved, use null.

### S7 — Normal-hours total in the pricing log
`server/src/routes/jobcard-costing.js` ~70-91 `fieldsToTrack`: add `['labour_total', 'labourTotal']` next to the other tier totals.

### S8 — Managers don't receive the job-folders path
`server/src/routes/settings.js` GET (~63): for non-admin also `delete settings.job_folders_base` (next to the OVERTIME_DB_KEYS strip). Check nothing a manager uses on the client needs `jobFoldersBase` (grep client; the Folders card is admin-only). Update `docs/notes/auth-and-security.md` / CLAUDE-referenced note if it describes what GET /settings strips.

### S9 — Uploaded file names cleaned for Windows
`server/src/routes/jobcard-files.js` `buildStorageFilename` (~214): run the base name through `sanitizeFolderName` from `utils/folderCreation.js` (the same util `qa-levels.js:290` uses). If the sanitized base is empty, use `file`. Also make `sanitizeFolderName` refuse Windows reserved device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9, case-insensitive, with or without extension) by appending `_` — this covers QA template uploads too. Keep the extension from the original name (already validated against VALID_EXTENSIONS).

---

## CLIENT steps

### C1 — Worker status choices on screen
Mirror S1 on screen. In `client/src/components/jobcard/constants.js` export the same rule (`WORKER_SETTABLE_STATUSES = ['IN_PROGRESS','AWAITING_MATERIAL']`, `WORKER_STATUS_FROM = ['OPEN','IN_PROGRESS','AWAITING_MATERIAL']`) plus a small helper returning the options a user may pick given `canManage` and the current status.
- `client/src/components/JobCardListColumns.jsx` status popover (~216-249) and `client/src/components/jobcard/JobIdentityStrip.jsx` status select (~135-140, ~398-408): for non-management, offer only the allowed targets (plus the current status as the selected value); when the current status isn't in `WORKER_STATUS_FROM`, the control is not changeable for them (badge is not a button / select disabled, with a title like "Only management can change this status").
- The list badge must stay a real `<button>` when it's clickable (UI rule); when not clickable render it as plain non-interactive text.

### C2 — Pricing refresh ignores replies for a job no longer on screen
`client/src/components/jobcard/useCosting.js` `refreshCosting` (~488-524): capture the job id at call time and drop the reply if `jobCardIdRef.current` differs when it lands (same guard `runSave` uses at ~359). Also drop it if a newer refresh was started (sequence counter), so two quick timer actions can't land out of order.

### C3 — Worker added only when the timer actually started
`client/src/components/jobcard/useTimer.js` `startTimerWithConflictCheck` (~131-228): make it resolve `true` when a timer was started and `false` on every failure/cancel path (keep all existing toasts; do not throw). `client/src/components/jobcard/useJobCardTimerActions.js` `handleStartItemTimer` (~69-81): only call `creditAssignee` when it returned true. Check every other caller of `startTimerWithConflictCheck` still works with a boolean return.

### C4 — Stop-timer form save marks the details confirmed
`client/src/components/jobcard/useTimer.js` the two stop-form saves (~320 and ~375 `api.updateTimeEntry(...)`): add `detailsConfirmed: true` to the body. Nothing else sends it (not the manual edit form in useTimeEntries.js, not the resume at ~420).

### C5 — Status change waits for part saves in flight
`client/src/components/jobcard/useSaveQueue.js`: add `whenSettled()` returning a promise that resolves once every write queued so far has settled (e.g. `Promise.allSettled(Object.values(chains.current))`; never rejects). Export it in the returned object (~201).
`client/src/components/jobcard/JobIdentityStrip.jsx` status change (~225-275): after the confirm dialogs and before `api.updateJobcardStatus`, `await whenSettled()` (thread it in via props from `JobCardModal.jsx` the same way other saveQueue things reach it). The existing `statusBusy` lock stays held across the wait. Then remove the now-false claim "a slow reply can never undo a status the user has since picked" in the comments in `useInstantItems.js` (~172-175) and `useJobCardInstantSaves.js` (~24-30), replacing with an accurate one (the status change waits for part saves already in flight).
Also update `docs/notes/client-patterns.md` if it describes status/part-save ordering — CLIENT executor may edit `docs/notes/client-patterns.md` only.

### C6 — "Part was removed" doesn't count as a save
`client/src/components/jobcard/useInstantItems.js`: `writeItemField`'s 404 "Part not found" branch (~208-213) must `return NOT_LANDED`; `createItemFromRow`'s "already real or removed" early-out (~233-236) must `return Promise.resolve(NOT_LANDED)`. Import `NOT_LANDED` from `useSaveQueue.js` if not already imported.

---

## Gate (both executors)
- Only the files named in your steps (plus docs notes named for your side). Anything else → report, don't improvise.
- Server: run `cd server && node -e "require('./src/routes/jobcards.js');require('./src/routes/suppliers.js');require('./src/routes/jobcard-files.js');require('./src/routes/jobcard-time-entries.js');require('./src/routes/settings.js');require('./src/routes/jobcard-costing.js')"` — if it fails ONLY because better-sqlite3's native binary can't load under WSL, say so and instead run `node --check` on each changed file. NEVER run npm install / npm rebuild (it breaks the user's running app).
- Client: run `cd client && npx vite build` if it works without installing anything; otherwise `node --check` is not valid for JSX — report and skip.
- Report: one line per step (done / not done + why), and paste `git diff --stat`.
