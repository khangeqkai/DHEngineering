# Review fixes — 2026-09-26 (second pass)

Frozen spec. Fixes the findings from the 6-round whole-codebase review loop.
Every fix is at the root cause. Follow CLAUDE.md house rules (camelCase JS, prepared
statements in the queries layer, recordHistory format, toasts vs field errors,
startup conversions in runMigrations, delete legacy code, spacing tokens, lucide icons,
update the matching docs/notes/*.md in the same change when it becomes wrong).

Environment constraints (all executors):
- node_modules is shared with a running Windows install. NEVER run npm install / npm ci /
  rebuild / seed / the server / vite build. Verification = `node --check <file>` for every
  changed server .js file, plus careful reading. Client .jsx cannot be node-checked; re-read
  your hunks.
- Do not commit. Do not touch files outside your group's allowed list.

---------------------------------------------------------------------------------------
## Group A — server guards (executor A)

Allowed files: jobcard-system/server/src/routes/qa-levels.js, routes/machines.js,
routes/jobcard-mutations.js, routes/jobcard-files.js, utils/timeEntryHelpers.js,
routes/jobcard-time-entries.js (only if the conflict helper's signature changes),
client/src/components/QALevelManagement.jsx (only if needed for A1's message),
client/src/services/api.js ONLY if A4 removes a now-dead client method,
docs/notes/files-and-qa.md, docs/notes/jobs-and-status.md, docs/notes/api-reference.md.

A1. Deleting a quality level's last template while "requires returned form" is on.
    Root cause: the invalid state "requires a returned form + zero templates" is blocked on
    the level-edit route (qa-levels.js ~194-199) but reachable via DELETE /:id/templates/:tid
    (~399-420). Fix: in the delete route, if the level has requires_returned_form on and this
    is its last template, refuse with 409 and a plain message, e.g. "This is the only form
    for a level that needs a completed form back. Upload the replacement first, or turn off
    'needs a completed form back', then delete this one." Check before removing the row or
    the file. Make sure the management screen shows the server's message (toast.error with
    the server text) — check QALevelManagement.jsx handleDeleteTemplate; change only if it
    swallows the message. Update files-and-qa.md where it describes the requirement rule.

A2. PUT /machines/:id missing machine number.
    Fix: same guard as POST (machines.js ~48): trimmed machineNumber empty/missing → 400
    "Machine number is required". Match POST's exact trimming/wording.

A3. Quality-template upload has no size cap.
    Root cause: the 30 MB cap lives only in jobcard-files.js. Fix: export the cap constants
    (MAX_UPLOAD_BYTES / MAX_FILE_DATA_CHARS or equivalent) from ONE place (keep them in
    jobcard-files.js and export, or move to a small util if jobcard-files is a router-only
    module — your call, one definition only) and apply the same check + same "too large"
    message in POST /qa-levels/:id/templates before decoding.

A4. Dead permission code in PUT /jobcards/:id (jobcard-mutations.js ~275-307).
    Facts from review: non-management callers are 403'd unless body is photos-only, so the
    canSetStatus call below is unreachable for workers and always true for management; no
    client code sends `photos` through updateJobcard.
    Verify first: grep the client for every caller of updateJobcard / PUT /jobcards/:id and
    confirm none can run for a non-management user and none sends photos. Also check whether
    the route even persists `photos` anywhere.
    If confirmed: make the route management-only the same way the other management routes do
    it (requireManagement middleware), delete the photos allow-list branch and the unreachable
    canSetStatus call on this route, and keep the live canSetStatus on PATCH /:id/status
    untouched. Update jobs-and-status.md where it says both status routes call canSetStatus
    (and auth-and-security.md if it mentions the photos allow-list — you may edit that note
    for this line only).
    If NOT confirmed (a worker path really uses PUT): stop and report, change nothing for A4.

A5. Timer-clash detection too broad (timeEntryHelpers.js ~79-81 isOpenTimerConflict).
    Fix: match only the one-open-timer unique index violation (code SQLITE_CONSTRAINT_UNIQUE
    and the message naming that index / the columns it covers — check schema.js ~410 for the
    exact index definition and what better-sqlite3's message says for a partial unique index).
    Any other failure falls through to the route's normal error handling.

---------------------------------------------------------------------------------------
## Group B — server data & speed (executor B)

Allowed files: jobcard-system/server/src/db/schema.js, db/init.js, db/queries/*.js,
routes/statistics.js, routes/statistics-helpers.js, routes/search.js, routes/history.js,
client/src/services/api.js (history export method only), client/src/components/ActivityLog.jsx,
docs/notes/api-reference.md, docs/notes/time-and-costing.md (only if statistics text changes).

B1. Missing indexes. Add to schema.js's index block (CREATE INDEX IF NOT EXISTS — runs on
    every boot so existing databases get them):
    - time_entries(item_id)
    - time_entries(start_time)
    - job_assignees(user_id)
    - history(created_at)
    - history: make the per-user and per-entity lookups sort-covered: (user_id, created_at)
      and (entity_type, entity_id, created_at). These supersede idx_history_user and
      idx_history_entity: remove those two from schema.js and add an idempotent
      `DROP INDEX IF EXISTS` for each in runMigrations() (init.js), per the startup-conversion
      rule. Check every query on history first (grep) and confirm each one is served by the
      new set; if any query needs something else, add it and say why.

B2. Activity export walks the trail with OFFSET (ActivityLog.jsx ~80-84) — cost grows with
    the square of the trail. Fix: the export pages with a cursor instead: each page asks for
    rows strictly older than the last row it received, ordered by (created_at DESC, id DESC),
    with the same filters the page uses. Implement as an optional cursor parameter on the
    existing history list route (a `before` cursor of created_at+id), used only by the export;
    normal on-screen paging keeps offset. Make sure the ORDER BY includes id as tie-breaker so
    rows with the same timestamp are never skipped or doubled. Queries go in the queries layer,
    not inline. Validate the cursor input.

B3. Statistics reads every job ever (statistics.js ~48, ~61-72).
    Fix: first read exactly how allJobs and costingsRows are used for every statistic,
    including the "all time" preset and on-time judgement (last logged work / done history).
    Push a WHERE into SQL that is a SUPERSET of what the JS keeps for the chosen range (so
    every figure stays identical), and fetch costings only for the jobs returned (batched IN or
    a join, not N+1). For the "all" preset no bound. State in your report, per statistic, why
    the output cannot change.

B4. People search (search.js ~264-289) loads every customer/contact/supplier then slices.
    Fix: page in SQL like the other scopes — a UNION ALL of the two sources with the same
    columns, same filter, same ordering as today, a COUNT(*) for total, and LIMIT/OFFSET.
    Output shape and order must be identical to today's for the same query. Queries in the
    queries layer if that's where the other search scopes keep theirs (follow the file's
    existing convention).

---------------------------------------------------------------------------------------
## Group C — client screens (executor C)

Allowed files: jobcard-system/client/src/components/jobcard/StopTimerForm.jsx (+ its .css),
client/src/components/JobCardList.jsx, client/src/hooks/ (one new hook file allowed),
client/src/components/common/DataTable.jsx (+ its .css), client/src/components/SearchPage.jsx,
client/src/App.css (only if the shared .row-link-btn needs a tweak),
docs/notes/client-patterns.md.

C1. Stop-timer form hides the Critical inspection on any load failure
    (StopTimerForm.jsx ~110-139, ~187-189, ~387, ~440).
    Root cause: one Promise.all loads the job and the machines, and its catch assumes
    "not Critical". Fix:
    - Load the job details and the machines separately. A machines failure only affects the
      machine picker (its own short message); it never touches the Critical decision.
    - While the job details are loading, and if they fail, the form does NOT assume
      "not Critical": Submit stays disabled, and the form shows an inline message in the form
      body ("Couldn't load this job's checks.") with a Retry button (real <button>, lucide icon
      at 16) that re-runs the job-details load. No toast for this failure (the message is in
      the form). Remove the old misleading "You can still record the time" toast.
    - Once loaded, behaviour is unchanged.
    Keep late replies from a previous open from overwriting state (follow the file's existing
    pattern for stale responses if it has one; otherwise add a simple ignore-if-closed guard).

C2. Job list left open overnight never flips jobs to overdue (JobCardList.jsx ~321-346).
    Fix: a small shared hook (e.g. hooks/useLocalToday.js) returning today's local date string
    in the same format todayIsoDate() gives; it re-schedules a timer for the next local
    midnight and also re-checks on window focus / visibilitychange; cleans up on unmount.
    JobCardList uses it and includes it in the filtered-list memo dependencies so the list,
    the overdue filter and its counts all move at midnight. If JobCardListTable computes
    today separately per row, pass the hook's value down instead so there's one source.

C3. Clickable DataTable rows lose table semantics (DataTable.jsx ~156-168; only SearchPage
    ~470 passes onRowClick).
    Fix: the <tr> keeps its native row role — remove role="button", tabIndex and onKeyDown
    from it. Mouse click anywhere on the row still opens it (onClick on the row stays).
    Keyboard/screen-reader access comes from a real <button type="button"> rendered inside
    the row's first cell, wrapping that cell's content, using the shared .row-link-btn class,
    with an aria-label saying what pressing it opens. Its click must not double-fire with the
    row click (stopPropagation or equivalent). Let DataTable accept an optional per-row label
    function prop for the aria-label; SearchPage supplies labels ("Open job 1234", "Open
    customer X", etc. — check what each scope's row opens).

---------------------------------------------------------------------------------------
## Coordinator (not delegated)

D1. DONE — CORS reflects any origin (server/index.js ~54-57). Every client is same-origin (dev uses
    the Vite proxy, production and Electron load the page from the server itself), so the
    root fix is to remove the cors middleware and its require.
D2. Job-list server paging (finding #6) — architecture change; user decided 2026-09-26 to leave it (single workshop station, server on same PC, cost negligible).

## Gate (every executor)
Report: per step, what you changed and why; any step you could not do as written (reported,
not improvised); `node --check` output for changed server files; `git diff --stat` pasted.
