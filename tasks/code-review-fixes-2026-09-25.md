# Code review fixes — 2026-09-25

Nine findings from a whole-codebase review. Paths are relative to `jobcard-system/`.
Every executor reads `CLAUDE.md` (repo root) first and the `docs/notes/*` note named per step,
and updates that note in the same change if the behaviour it describes changes.

House rules that bite here: prepared statements live in `server/src/db/queries/*` (no inline SQL in
new code), `recordHistory` changes are `{ field: { from, to } }`, all JS camelCase, errors via
`logger.error` server-side and `toast.error` client-side, no backward-compat branches, lucide icons
only, never rebuild native modules from WSL (do not run `npm install`/`npm rebuild`).

---

## SERVER (executor A)

### S1 — Customer "Invoiced Total" uses a stale saved figure (finding #1)
`server/src/routes/statistics.js:~453-456`. For admin + `INVOICED` jobs, the total reads
`job_costings.grand_total`, which is only written at job creation and on a pricing-sheet save.
Per `docs/notes/time-and-costing.md` there is no invoice-time freeze: recomputing always reproduces
the billed number. **Fix:** for each invoiced job counted there, use
`computeLiveCosting(jobId, null)` from `utils/costingCompute.js` and take its grand total (check the
returned shape — `grand_total` on the computed row). Only compute for the admin branch and only for
invoiced jobs in range (don't compute for every job). Must not write anything. If a job has no
costing row, make sure `computeLiveCosting` handles it (read it); if it throws, count 0 for that job
and `logger.error` it rather than failing the whole page. Remove `grandTotal` from `jobCostingsMap`
if nothing else reads it. Note: `time-and-costing.md` (statistics sentence, if any).

### S2 — Invoicing while a timer runs; time changes on an invoiced job (finding #2)
Note: `docs/notes/jobs-and-status.md`, `docs/notes/time-and-costing.md`.
a) Both paths that can set status `INVOICED` (`routes/jobcards.js` ~378 status route, and
   `routes/jobcard-mutations.js` ~344 update route) must refuse, **before any write**, when any time
   entry on the job has `end_time IS NULL`. Reply `409 { error: "A timer is still running on this job. Stop it before marking the job invoiced." }`.
   Put the check next to the existing MISSING_ATTACHMENTS check and run it first (a running timer
   cannot be confirmed away). Add a prepared query if none exists (e.g. count running entries by jobcard).
b) In `routes/jobcard-time-entries.js`, refuse with
   `409 { error: "This job has been invoiced and filed away. Reopen it before changing its time." }`
   when the job's `archived === 1`, on: timer **start**, manual **add**, **edit** (PUT, which also
   covers resume/clearing the finish), and **delete**. **Stop is always allowed** — never trap a
   running timer. Do the check once via a small helper next to `findEntryForJob` if that fits.
   Keep the existing comment in `jobcard-costing.js` (costing stays editable on invoiced jobs — that
   is deliberate and out of scope).

### S3 — A worker can reopen any old block of their own (finding #5)
`routes/jobcard-time-entries.js:~371-378`. For a **non-management** caller, clearing the finish
time (`endTime === null`) is allowed only when ALL hold, else `403 { error: "Only the run you just stopped can be resumed." }`:
- it is that worker's most recently started block (no other block by the same `user_id`, on any job,
  has a later `start_time`) — add a prepared query;
- its `end_time` is within the last 12 hours;
- the worker has no other running timer (end_time NULL) anywhere.
Management keeps today's behaviour. Update the comment above the guard to say why.
Note: `time-and-costing.md` (where resume/stop form is described).

### S4 — The last admin can demote themselves (finding #6)
`routes/auth.js` `PUT /users/:id` (~361). When the target is currently `admin`, a `role` other than
`admin` is being set, and there are no **other active** admins, refuse
`400 { error: "This is the only admin account. Make another person an admin first." }` before any
write. Add a prepared count query (active admins excluding an id). Deactivate route: already can't
archive yourself and only admins archive admins, so leave it. Note: `docs/notes/auth-and-security.md`.

### S5 — Part changes don't update job status (finding #7)
`routes/jobcard-items.js` add (~120), update (~180), delete (~248). After the write succeeds, call
`syncStatusToWork(id, req.user)` from `utils/jobStatusAuto.js` and fold a non-null result into that
action's own history entry as `status: { from, to }` (same way the time routes do). Add to each
reply a top-level `jobStatus` field carrying the job's status after the change (always, not only on
change) so the screen can show it — executor B consumes this. Note: `jobs-and-status.md` (list of
what triggers the status sync).

### S6 — Re-assigning a file to its own part renames it (finding #8)
`routes/jobcard-files.js:~497-503`. The "nothing to do" check compares against
`buildStorageFilename(...)`, which always adds " (n)" because the file itself exists. Fix: decide
"unchanged owner" **before** building a new name, by comparing the file's current owner tag with
`partFileCode(itemId)` (find the existing helper that parses a stored name's tag — used by
`stripStorageTag`/`resolveFileOwners`) — same tag → return the unchanged file as today, no rename,
no history. Fix the comment. Note: `files-and-qa.md` if it describes this.

### S7 — Blank worker name in the trail for a hand-added block (finding #9)
`routes/jobcard-time-entries.js:~319`: `const workerName = ...name` → fall back to `username`
like everywhere else (`u.name || u.username`).

**Gate A:** allowed files — the route/util/query files named above, `server/src/db/queries/*`,
`docs/notes/*`. No client files. Run `node --check` on each changed server file and any existing
server tests (`ls server/test* server/src/**/*.test.js` — run what exists with plain `node`, no installs).
Report `git diff --stat` and, per step S1–S7, which hunks implement it.

---

## CLIENT (executor B)

### C1 — Refused part create/remove counts as "saved" (findings #3, #4)
`client/src/components/jobcard/useInstantItems.js` create (~261 catch) and remove (~377 catch)
swallow the error, so `useSaveQueue` counts a landing and `useSavedFlash` shows the green frame.
Keep their own toast and keep NOT leaving a 'failed' mark (their comments explain why). **Fix:**
in `useSaveQueue.js` export a sentinel (e.g. `export const NOT_LANDED = Symbol('notLanded')`);
when `run()` resolves with it, clear the key's entry (`setEntry(key, null)`) but do **not** bump
`landedCount`. The two catches `return NOT_LANDED` after their toast. Update both comments and the
doc-comment at the top of `useSaveQueue.js`. Note: `docs/notes/client-patterns.md` (save queue / flash section).

### C2 — Show the job's new status after a part change (client side of finding #7)
Server item replies (create, update, delete) will now carry top-level `jobStatus`. Find how the job
screen learns a status change after a timer start/stop (probably a reload of the job) and make part
changes show the new status the same way, simplest consistent route — ideally apply `jobStatus` from
the reply to the on-screen status **as a server-confirmed value** (it must not read as an unsaved
user edit and must not trigger a status save). If the job list is refreshed after timer actions,
mirror that too. Describe in the report which mechanism you used and why.

### C3 — Invoicing refused message
With S2 the Mark-as-Invoiced action can now get a 409 with a plain `error` message (not
`MISSING_ATTACHMENTS`). Check `JobIdentityStrip.jsx` (~231-255) and the status picker path: confirm
that message reaches a `toast.error` as-is (stable `id`) and the status on screen stays as it was.
Change only if it doesn't.

**Gate B:** allowed files — `client/src/components/jobcard/*`, `client/src/components/jobcard/tabs/*`,
`docs/notes/client-patterns.md`. No server files. Build check: `cd jobcard-system/client && npx vite build`
only if it works without installing anything; otherwise say so. Report `git diff --stat` and hunk→step map.
