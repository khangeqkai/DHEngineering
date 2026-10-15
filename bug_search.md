# Bug search log

A running record of review / bug-hunt rounds, so the next round does not chase what is
already fixed or already decided. **Read this before starting a round.** For each
finding: what the person saw, the root cause, what changed, and how to check it.

Rules for the next round:
- A finding marked **Fixed** is only raised again if the fix itself is wrong (say how).
- A behaviour under **Decided — do not raise** is intended. Leave it alone.
- Also skip everything in each `docs/notes/*.md` "Intended, not findings" list, and the
  standing exclusions: screen-reader-only issues and narrow/phone-width layouts.
- Add the new round below the last one. Keep the same layout.

---

## Round 1: 2026-10-15

Scope: the uncommitted work after `75d6a83`. Covers the job History side window (it
replaced the per-job Activity tab), its plain-sentence wording, the worker/part snapshot
in work trail entries, and the "Needs your attention" window's questions section.

### R1-1: History window goes out of date while the job is worked on. **Fixed**
- **Seen:** with History open beside the job, changing a field, stopping a clock, adding a
  part, posting a comment or adding a file never showed in History until Refresh or reopen.
- **Root cause:** History loaded only when the window opened. As a tab it reloaded every
  time you came back to it. As a side window it stays open, so nothing loaded it again.
- **Fix:** the job window reloads History while it is open whenever something that writes
  a trail entry lands. That covers the save count (fields, parts, workers, pricing), the
  work list, the comments, the job status, and a new count of file changes from the
  paperwork hub. (`JobCardModal.jsx`, the effect next to `landedOnJob`.)
- **Check:** open History, change the due date, start/stop a clock, post a comment, upload
  a file. Each one appears in History within a moment, with no Refresh.

### R1-2: Most activity search results did not open History. **Fixed**
- **Seen:** clicking a stop-timer, comment, file or pricing result in activity search
  opened the job on Details/Costing with History shut. Only assign/unarchive-type results
  opened it.
- **Root cause:** the search page still used the old "action → tab" map, where "activity"
  was just one more tab. Only actions missing from the map fell through to it. History is
  now a side window, separate from the tab, but it was still driven by the tab value.
- **Fix:** a separate `initialHistoryOpen` flag on the job window. Search sets it for
  every activity result. The tab map is now just "pricing → Costing, everything else →
  Details". The old `'activity'` tab value is gone.
- **Check:** as admin, open several kinds of activity results. History is open every time,
  and a pricing result also lands on the Costing tab.

### R1-3: Unread comments never opened by themselves if History was open first. **Fixed**
- **Seen:** opening a job from an activity result (History open) with unread comments:
  comments stayed shut. They also stayed shut after History was closed.
- **Root cause:** the comments window makes its "open for unread?" decision once per
  opening. When History was open at that moment, the "yes" was thrown away, not delayed.
- **Fix:** the decision is still made once, but a "yes" made while History is open now
  waits. The comments open the moment History closes, unless the person has pressed the
  comments bubble themselves meanwhile. (`JobCommentsPanel.jsx`, `openWhenFree`.)
- **Check:** open a job with unread comments from an activity result, then close History.
  The comments slide open.

### R1-4: Refresh in History threw away opened entries and scroll position. **Fixed**
- **Seen:** press Refresh. The list blanks to "Loading…", comes back at the top, and every
  "Show N more" is folded.
- **Root cause:** the window showed "Loading…" in place of the list on every load, not
  only the first.
- **Fix:** "Loading…" only shows when there is no list yet. A reload swaps the list in
  place. Entries keep their identity (by trail id), so their open/closed state survives.
  This matters more now that R1-1 reloads automatically.
- **Check:** expand a few entries, scroll down, press Refresh (or change something in the
  job). Nothing folds and the scroll stays.

### R1-5: "Needs your attention" heading counted jobs, not questions. **Fixed**
- **Seen:** two people ask a worker on one job. The heading said "Someone asked you a
  question" above a row reading "· 2 questions".
- **Root cause:** the heading used the number of job rows, and each row can hold several
  questions.
- **Fix:** the heading counts questions. "Someone asked you a question" (one), "You have
  N questions" (all on one job), or "You have N questions on M jobs".
  (`AttentionDialog.jsx`, `MentionsSection`.) Note updated in `jobs-and-status.md`.
- **Check:** two mentions on one job, then mentions on two jobs. The heading matches the
  rows both times.

### R1-6: Worker name in work trail entries followed a different rule. **Fixed**
- **Seen:** a person whose name is blank or only spaces could show as a blank name in a
  History sentence. The "their own clock" wording compares the worker with the person who
  pressed the button, so it could be wrong.
- **Root cause:** three places each worked out the name in their own way. The time-entry
  queries trim the name and fall back to the username. The new `runContext` used
  `name || username`, with no trim. `actorName` (the person who acted) also used
  `name || username`.
- **Fix:** `runContext` and `actorName` now both use the queries' rule: the trimmed name,
  or the username if the name is empty. `runContext` also takes the part when the caller
  already has it (start timer, delete time entry), so the part isn't read twice. Start
  timer no longer re-reads the entry it just created. (`timeEntryHelpers.js`,
  `db/helpers.js`, `jobcard-time-entries.js`.) Note updated in `time-and-costing.md`.
- **Check:** start and stop your own clock. History says "their"/"finished work on …",
  not your name. A clock started for someone else names them.

### R1-7: Notes and comments still said "History tab". **Fixed**
- **Root cause:** wording left over from when History was a tab.
- **Fix:** now says "History window" in `time-and-costing.md`, `client-patterns.md`
  (one leftover "per-job Activity tab"), `auth-and-security.md` (the tab strip no longer
  has an Activity tab), `index.css` (two token comments), `historySentences.js` (header)
  and `jobcard-files.js` (one comment). A search for "History tab" / "Activity tab" now
  finds nothing.

### Decided — do not raise
- **History reloads after every landed change while it is open.** That is the R1-1 fix,
  not wasted reads. It only happens while History is open, and repeated failures share
  one pop-up.
- **Comments open by themselves when History closes** (R1-3), even a long time after the
  job was opened. Pressing the comments bubble yourself cancels it.
- **The Refresh button is not disabled while a load runs.** Only the newest load is ever
  shown, and disabling a focused button would drop keyboard focus.
- **Activity search opens History for non-management too,** but nobody else can reach
  activity search. It is admin-only, and the window itself checks permission.

### Not verified this round
- No automated tests exist for these screens. The changed client files were only
  syntax-checked.
- The server could not be started from WSL (the database library is built for Windows;
  never rebuild it from WSL). The server files passed a syntax check. Run the app on
  Windows and go through each **Check** above.

---

## Round 2: 2026-10-15

Scope: the same uncommitted work, after the Round 1 fixes. This was a `/code-review high`
pass that raised 10 findings, all fixed. The review skipped its own verify pass.

### R2-1: Part details misread in History when a name has brackets. **Fixed**
- **Seen:** a part called "Shaft (spare)" showed in History as made of "spare". A part
  called "Bracket [left]" showed a made-up treatment called "left".
- **Root cause:** a part's trail entry kept only the one-line summary
  ("2x Plate <Repair> (Mild steel) [Anodise→Acme]"). History split that line back
  apart by looking for brackets at the end.
- **Fix:** adding, editing or removing a part, and creating a job, now also save the part
  as plain fields in the entry's snapshot: `part`, `partBefore` (edits) and `parts`
  (creation, keyed by change name). These are built by `itemPartSnapshot` in
  `jobcard-audit-text.js`. History draws from those fields (`partSentence`), and the
  bracket-parsing `summaryParts` is deleted. The summary text stays in `changes` for the
  global activity log. A startup conversion (`foldPartTrailSnapshots`) gives old entries
  the leading quantity plus the rest of the summary word for word. It does not guess.
  `DATA_VERSION` 9 → 10.
- **Check:** add "Shaft (spare)" with no material. History reads "2 × Shaft (spare)" with
  no material shown.

### R2-2: A supplier name with a comma split into two treatments. **Fixed**
- **Seen:** a treatment from "Smith, Jones Pty Ltd" showed as two treatments.
- **Root cause:** same as R2-1. Treatments were split back out of the summary on commas.
- **Fix:** same as R2-1. Treatments are saved as a list of name and supplier pairs.
- **Check:** give a treatment that supplier. History shows one treatment "… by Smith,
  Jones Pty Ltd".

### R2-3: Printing did not show up in an open History window. **Fixed**
- **Seen:** with History open, printing the job card, printing its attachments or saving
  the packet did not appear until Refresh.
- **Root cause:** History reloaded only on a fixed list of changes, and printing was not
  on it. An attachments-only print and every packet save never told the job window
  anything at all.
- **Fix:** `usePacketPrint` calls `onRecorded` after each trail write. The hub passes
  that up as `onTrailWritten` to the job window's `noteTrailChange` counter, and History
  reloads on that counter.
- **Check:** open History, then print the card, print the attachments and save the
  packet. Each appears in History by itself.

### R2-4: A file moved between two same-named parts said "to the whole job". **Fixed**
- **Seen:** a drawing moved from one "Plate" to another "Plate" read "moved drawing.pdf to
  the whole job".
- **Root cause:** History drops any change whose before and after text match, and then
  read the destination from what was left. Two blank part names hit the same problem.
- **Fix:** the destination is read from the unfiltered change. "The whole job" appears
  only when the entry's snapshot has no `itemId`. A part with no name reads "a part".
- **Check:** move a file between two parts with the same name. History names the part.

### R2-5: The cursor was lost when History closed and comments opened. **Fixed**
- **Seen:** on a job opened from activity search with unread comments, pressing Escape in
  History slid the comments window open with the cursor nowhere. The next key press went
  to the page.
- **Root cause:** focus was handed back to the History bubble. The waiting comments
  window then opened and made that bubble inert while it still held focus.
- **Fix:** when comments open because they were waiting for History to close, and focus
  sits on the page or in the side area, the comments window takes focus the same way as
  a normal open: its typing box, or its close button when the job is locked.
  (`JobCommentsPanel.jsx`.)
- **Check:** do the steps above. The cursor lands in the comments typing box.

### R2-6: Old stop-clock entries gave the work to whoever pressed stop. **Fixed**
- **Seen:** an older entry where manager Alice stopped Bob's clock read "Alice finished
  work on Plate (2 h)".
- **Root cause:** entries saved before `workerName` existed had none. History treated a
  missing worker as "their own clock".
- **Fix:** a startup conversion (`fillStopTimerWorkerNames`) fills in the worker from the
  time block that `timeEntryId` points to (trimmed name, else username). History now says
  "stopped a clock on Plate (2 h)" when the worker is still unknown, and never credits
  the person who pressed stop.
- **Check:** on an old job where someone else's clock was stopped, History names the
  worker, or says "stopped a clock".

### R2-7: History loaded 3–4 times when a job opened with it showing. **Fixed**
- **Root cause:** the reload watched the work list, the comments and the status. All three
  change once as the job first loads.
- **Fix:** the reload now waits for the job's first load. It then watches only counters
  bumped after a change has landed: the save count, `filesChangedCount` and
  `trailChangeCount` (logged work and clocks after their reload, comments posted or
  deleted, a status change, printing). This replaces the Round 1 setup that watched the
  data lists.
- **Check:** open an activity search result. History loads once. Later changes still
  appear by themselves (see R1-1).

### R2-8: Three copies of the "which name to show" rule. **Fixed**
- **Root cause:** the time-entry queries, `actorName` and `runContext` each worked the
  name out.
- **Fix:** `runContext` now uses the query row's `user_name` and no longer reads the
  user again. The add route passes the part it already holds. The delete route uses
  `jobItemQueries.getById` instead of listing every part. Now only the SQL rule and
  `actorName` exist.

### R2-9: Spaces-only names saved as a blank name. **Fixed**
- **Root cause:** `autoAssignWorker` and `discard_timer` still saved
  `name || username` without trimming.
- **Fix:** both use `actorName`. So do the worker names on the start, add and re-credit
  entries.

### R2-10: Copied money formatter and Critical check in History. **Fixed**
- **Fix:** History uses `formatMoney` and the shared `isCriticalLevel`. The "lowered"
  wording now applies to any level that is filled in and not critical, rather than only
  to the literal 'STANDARD'.

### Decided — do not raise
- **Old part entries show their full saved summary as the part name** (R2-1). It looks
  less tidy than a new entry, but it is never wrong. The old text can't be split up
  reliably.
- **A comments reload or a status refresh by itself no longer reloads History** (R2-7).
  Only a change someone made does.
- **The Round 1 "History reloads after every landed change" decision still holds.** It
  now runs off counters rather than the data lists.

### Not verified this round
- The client builds without errors, and the server files pass a syntax check. Neither
  startup conversion has been run, and the server was not started from WSL. Run the app on
  Windows, restart once so the conversions run, and go through each **Check** above.

---

## Round 3: 2026-10-15

Scope: the same uncommitted work, after the Round 2 fixes. A `/code-review high` found ten
new problems; all ten are fixed below. Startup conversions are in `legacyMigrations.js`
(still data version 10 — not yet released).

### R3-1: Part changes from the old Save button read as gibberish. **Fixed**
- **Seen:** "Alice changed the item #3 removed to blank, was 2x Plate…".
- **Root cause:** before 21 Sep 2026 the whole-job Save wrote part changes under `item …`
  names. The part fill-in only looked for `part …`, and the wording only knows `part …`.
- **Fix:** a startup conversion renames the old `item …` names to `part …` (a numbered
  one loses its "#"), running before the part fill-in, so they read like new entries.
- **Check:** an old job edited before 21 Sep shows "added a part / removed the part …".

### R3-2: Files uploaded to a part before this change said "to the job". **Fixed**
- **Root cause:** only new uploads keep the part's name; the wording ignored the part id.
- **Fix:** a startup conversion fills in the part's name from the part. If the part is
  gone, the upload reads "to a part" (same rule as a move); no part at all → "the job".

### R3-3: Old thrown-away and self-stopped clocks credited to whoever pressed Stop. **Fixed**
- **Root cause:** the wording fell back to the person who acted when the worker was missing.
- **Fix:** the wording uses only the worker. A conversion fills the worker on old
  thrown-away clocks from their Start entry ("started a clock for" person, else who
  pressed Start), and on old self-stops from the entry's own name. Unknown → "The clock …".

### R3-4: The job's worker list used the raw name. **Fixed**
- **Root cause:** the worker-list lookup skipped the one name rule (trimmed name, else
  username), so it didn't match the clock's worker name.
- **Fix:** the lookup uses the same rule. Normal names are unchanged.

### R3-5: The stop-clock conversion named the worker as they are today. **Fixed**
- **Fix:** the worker at stop time is, in order: who the block was moved *from* in the
  first later edit; else the entry's own stored name when the block still belongs to
  whoever stopped it; else the block's worker now. The same fill now covers old
  confirm-finish entries.

### R3-6: "Needs your attention" credited all questions to the first asker. **Fixed**
- **Root cause:** the questions list only sent the first asker.
- **Fix:** it sends every distinct asker. The row reads "Alice and Bob asked you" (three or
  more: "Alice, Bob and N others"); the avatar gets a "+N" badge.

### R3-7: Office confirmations read as the confirmer's own work. **Fixed**
- **Fix:** "Olive confirmed Bob really finished work on …"; own clock keeps "they";
  unknown worker → "confirmed the real finish on … was …".

### R3-8: The part fill-in re-read every part entry on every start. **Fixed**
- **Fix:** it now skips entries that already carry their part.

### R3-9: Job screen status handler rebuilt every redraw. **Fixed** (house rule).

### R3-10: One part read by loading the whole parts list. **Fixed**
- **Fix:** one shared "this part, only if it's on this job" check, used by the part edit and
  delete, manual time entry, confirm-finish restart, and the part check for time blocks.

### Not verified this round
- Client builds; server files pass a syntax check. The conversions were run twice on a
  stand-in database (second run changed nothing), not on the real one. Run the app on
  Windows, restart once, and go through each **Check** above.

---

## Round 4: 2026-10-15

Scope: the same uncommitted work, after the Round 3 fixes. A `/code-review high` found nine
problems: six new, and three where a Round 2/3 fix was incomplete (R3-2, R2-8/R2-9/R3-4,
R3-10). All nine are fixed below. Still data version 10 (not yet released).

### R4-1: Old Save entries showed the first part's details for every part. **Fixed**
- **Seen:** one old Save removed a Bracket and added a Plate. History said the Bracket was
  removed *and* added. Two edits in one Save both showed the first part's before/after.
- **Root cause:** before 21 Sep 2026 the whole-job Save put every part change in one trail
  entry. The part fill-in and the History wording both assume one part per entry, so the
  fill-in kept only the first part and the wording reused it for every part.
- **Fix:** a startup conversion splits each old entry holding several part changes into
  one entry per part (the original keeps the first part and any other field changes; the
  rest become new entries at the same moment). Old entries now have exactly the shape
  live entries have, and each part is filled from its own change. A dev database already
  filled wrongly is repaired too. The job History list now breaks same-moment ties
  newest-first, so split entries keep a fixed order. (`legacyMigrations.js`,
  `splitMultiPartTrailEntries`.)
- **Check:** an old job edited before 21 Sep with several part changes in one Save shows
  one History line per part, each with its own details.

### R4-2: Old part entries were named by an old list position. **Fixed**
- **Seen:** "removed the part **3**", "changed the part **2**" — reads like today's part 3.
- **Root cause:** the wording took the part's name from the entry's key, and an old
  numbered key holds only a list position from back then.
- **Fix:** "removed the part …" names the part from its stored details; "changed the
  part …" names it as it was before the change. The key text is used only when no
  description is stored.
- **Check:** the same old job shows the removed/changed part by its description.

### R4-3: Old uploads named the part as it is called today (reopens R3-2). **Fixed**
- **Seen:** a drawing added to "Plate" in August, part renamed "Base plate v2" in September:
  History said the drawing was added to "Base plate v2".
- **Root cause:** the R3-2 fill-in copied the part's current name, and saved it for good.
- **Fix:** the fill-in traces the name back through the part's later edits (each edit's
  "after" must exactly match the part as it stood; its key gives the name before). If the
  trail hits an old Save edit, which only names a list position, nothing is guessed: the
  entry is left and reads "a part".
- **Limits:** if an option (treatment, material…) was renamed after one of those edits, the
  trace can't match it and uses today's name; two identical parts on one job could be
  confused. Both are rare.
- **Note:** a dev database where the Round 3 version already ran keeps the names it wrote.
  The live install never ran it.
- **Check:** rename a part that has an older upload (old entry, no stored part name) and
  restart: History names the old name.

### R4-4: Same-named askers counted as one person. **Fixed**
- **Seen:** two workers called Ben each @mention Alice → "Ben asked you · 2 questions",
  one avatar, no "+1".
- **Root cause:** the questions list grouped askers by display name, not by person.
- **Fix:** askers are grouped by account and sent as person + name; the window counts
  people. The name is the person's current display name (the comment's stored name if the
  account is gone).
- **Check:** two staff with the same name both ask one person: "Ben and Ben asked you",
  "+1" badge.

### R4-5: Blank names in the job list and search (reopens R2-8, R2-9, R3-4). **Fixed**
- **Seen:** a worker whose name is only spaces shows blank on the job list's worker
  avatars and in search's logged-work results.
- **Root cause:** the "trimmed name, else username" rule was still copied by hand in many
  places, some without the trim.
- **Fix:** the rule now exists in exactly two places: `displayName` in
  `server/src/shared/names.js` (used by the server, the client, the seed and the
  conversions) and its SQL twin `DISPLAY_NAME_SQL` (`server/src/db/displayNameSql.js`)
  used by every query that names a person. Every other copy was replaced, including the
  sign-in trail entry, the "Mentioned …" trail names, and the worker pickers.
- **Check:** give a worker a spaces-only name; they show by username everywhere.

### R4-6: Editing or removing a part loaded it twice (reopens R3-10). **Fixed**
- **Root cause:** these two routes need the whole parts list for their checks, and R3-10
  added a second one-part lookup on top.
- **Fix:** they take the part from the list they already load (an id from another job
  simply isn't in it). The one-part check stays for the time routes, which don't load the
  list.

### R4-7: Startup repeated the History fill-ins forever. **Fixed**
- **Root cause:** each fill-in re-selected entries it could never fill (stop whose block
  is gone, upload whose part is gone, thrown-away clock with no Start entry) on every boot.
- **Fix:** the five History conversions (rename, split, part fill, worker fill, upload
  fill) run once, together, behind one settings flag (`history_trails_converted_at`), set
  only when all finish. Safe because live code only writes the new shape; a restored older
  backup brings its own settings without the flag, so it is converted again.

### R4-8: Code notes sat above the wrong code. **Fixed**
- **Fix:** the part check and the "confirm a line's id" description are each back above
  their own code; the stray copy in the parts routes is gone.

### R4-9: Seeded History still used the old shape. **Fixed**
- **Seen:** seeded jobs read "opened the job" plus a stray "Job number" line; seeded stops
  read "stopped their clock" with a "Work: …" line and no duration.
- **Root cause:** the seed wrote its own made-up shapes rather than what the live routes
  write.
- **Fix:** every seeded entry matches its live writer (named in a comment above each
  block): job creation with job number, parts and workers; status/invoicing; clock stops
  with the real block's start, finish, worker and part; user and machine creation.
- **Check:** re-seed and open a seeded job's History: "opened job 1234 with N parts",
  "finished work on … (duration)".

### Not verified this round
- Client builds; server files pass a syntax check. The History conversions were run on a
  stand-in database (second run changed nothing; with the flag cleared, still nothing).
  The seed was not run, and the server was not started from WSL. Run the app on Windows,
  restart once, re-seed a test copy, and go through each **Check** above.

---

## Round 5: 2026-10-15

Scope: the same uncommitted work, after Round 4. A `/code-review high` raised ten findings,
all of them new instances of causes that earlier rounds had fixed only in the spot reported.
This round fixes the **causes**, not the spots.

### Root-cause fixes (cover R2-6, R3-2, R3-3, R3-5, R3-7, R4-3, R4-4, R4-5, R4-7 and today's 1, 2, 3, 5, 8, 9)
- **History shows only what was recorded.** The guessing conversions are deleted
  (`fillUploadPartDescriptions`, and the tracing in `fillRunWorkerNames`). What's left is
  exact: rename, split, fold, copying a part name the entry already recorded in its own
  `item` change (`fillTimeBlockPartNames`), and an auto-stop's worker from its own account
  (`fillAutoStopWorkers`). When an entry never recorded the worker or part, the wording is
  neutral ("the work", "stopped a clock", "a part") and never "their". Recorded under
  "Intended, not findings" in `time-and-costing.md`.
- **People are compared by account.** Every time-block trail entry carries `workerId` (set by
  `runContext`). "Their own clock" is `snapshot.workerId === entry.userId`. Names are never
  compared in `historySentences.js`.
- **One name rule, enforced.** Search matches on `DISPLAY_NAME_SQL`. "Myself (…)" uses
  `displayName`. Fake-request `actorName({ user })` calls are gone. A test fails if any
  source file hand-writes the name fallback.
- **One "this job changed" signal (cause of R1-1, R2-3, R2-7, today's 6).** `api.onJobChanged`
  fires after any accepted write under `/jobcards/:id`, and History reloads from it. The
  hand-wired counters and callbacks are deleted. A History load failure after the window
  closed shows nothing.
- **Small items (today's 4, 7, 10).** The upload and the time-block edit and start read rows
  once. The seed chains each job's status from Open, and seeded clock entries go through
  `runContext`.

### Automatic checks (new)
- `cd jobcard-system/client && npm test`: there are 36 checks. They cover History sentences
  for the bug-log cases, `displayName`, and the name-rule guard. Run before this fix, 8 of
  them failed; all now pass.

### Rule from here on
- Stop rounds when a round finds nothing a person using the app would notice. Fix by cause:
  list every place that shares it, and fix them all in one change.

### Not verified this round
- The client builds and the checks pass. The server files pass a syntax check. The
  conversions, the server and the seed were not run, because WSL can't run the database
  library. A dev database that already has the once-only flag won't run the two new
  conversions; the live install never ran them. On Windows: restart once, re-seed a test
  copy, then check History on a job where a manager stopped a worker's clock, and with two
  staff who share a name.

---

## Round 6: 2026-10-15

Scope: the same uncommitted work, after Round 5. A `/code-review high` found ten problems,
none in this log: five new (1, 2, 4, 6, 10), three fresh cases of causes earlier rounds called
fixed (3 → R2-2/R4-4, 5 → R1-1/Round 5, 9 → R3-10), and two Round 5 leftovers (7, 8). All ten
are fixed below. Still data version 10 (not yet released).

### R6-1: Adding or removing a part read as the person changing the status. **Fixed**
- **Seen:** a part added to a Done job: "Alice moved the job from Done to In Progress", the
  part only underneath, and the line filed under Status.
- **Root cause:** the job-update wording treated any status change as the person's own act.
  Clock entries already word the same follow-up as a plain line with no person.
- **Fix:** when the entry also carries a part change, the move reads "The job moved from …"
  under the part line, and the entry is filed under Job details.
- **Check:** add a part to a Done job: "Alice added a part: …", move shown underneath.

### R6-2: "Nothing has happened on this job yet" flashed before History loaded. **Fixed**
- **Root cause:** the window knew "a load is running", not "a load has finished once", so
  "not loaded yet" looked like "empty" (side effect of R2-7's wait for the job).
- **Fix:** the empty message shows only after a load for this job has finished; before that,
  the loading look.
- **Check:** open a job from an activity search result: "Loading…", then the list.

### R6-3: Worker changes compared names (reopens R2-2, R4-4). **Fixed**
- **Seen:** two Bens: putting the second on the job read "changed who's on the job". Taking
  off "Smith, John" read "took Smith and John off the job".
- **Root cause:** worker entries recorded only the joined name lists, and the wording split
  them on commas and compared names.
- **Fix:** every worker entry (the four worker routes and the timer's auto-assign) records the
  one person it changed, by account and name. The wording names that person and never splits
  or compares lists. Old entries get the name from the once-only History conversion, only
  when the stored lists give one exact answer; otherwise they read "changed who's on the job"
  (recorded under "Intended" in `jobs-and-status.md`).
- **Check:** with two same-named staff, add the second: "Alice put Ben on the job".

### R6-4: Old entry kinds read as robot text. **Fixed**
- **Seen:** "Alice changed the job card previewed to 14/10/2026, 13:12:55".
- **Root cause:** the wording covered what today's code writes, not everything stored.
- **Fix:** sentences for every old key found in the code's history: job card preview, print
  packet built, the old Save button's worker list and photos, quality form level, customer.
- **Check:** an old job previewed between 20 Sep and 14 Oct reads "opened the job card preview".

### R6-5: History missed clocks stopped elsewhere (gap in R1-1 / Round 5). **Fixed**
- **Root cause:** the one "this job changed" signal fired only for this PC's own writes.
- **Fix:** the job window's outside-change paths (a clock stopped elsewhere or by itself, a
  finish time answered elsewhere, the job found closed from another PC) announce through the
  same signal. A plain status or comments reload still doesn't (R2-7 stands).
- **Check:** History open on one PC, stop the worker's clock on another: it appears.

### R6-6: Which side window is open was kept in two places. **Fixed**
- **Root cause:** the comments window kept its own open flag and reported it later; History
  was controlled by the job window. R1-3 and R2-5 were patched on top.
- **Fix:** one value owned by the job window (nothing / comments / history); both windows
  follow it. The automatic comments opening asks the job window and waits while History is
  open; the focus hand-over lives in one place.
- **Check:** R1-3's and R2-5's checks still pass.

### R6-7: Leftover go-betweens from Round 5. **Fixed** — deleted; the originals are passed through.

### R6-8: Part names looked up twice per part change. **Fixed**
- **Fix:** the plain-fields part is the only place names are looked up; the one-line summary
  is worded from it. Side effect: a part with no description no longer prints "undefined" in
  the summary.

### R6-9: Upload to a part read the whole parts list (reopens R3-10). **Fixed**
- **Fix:** it uses the shared one-part check and takes the name from it.

### R6-10: One damaged trail entry could stall the History conversion forever. **Fixed**
- **Root cause:** the once-only conversion asked the database to read each entry's stored
  details; one bad entry threw, rolled the pass back, and it retried every boot.
- **Fix:** rows are picked with plain filters and read in the app; a damaged one is skipped
  and counted in one warning.

### Automatic checks
- `cd jobcard-system/client && npm test`: 45 checks (was 36), all pass. New: part-plus-status
  wording, the old entry kinds, and worker entries named from the snapshot. The client builds.

### Not verified this round
- Server files pass a syntax check; the conversion's name read-back was tested on its own in
  node, not on a database. The server, conversions and seed were not run (WSL can't run the
  database library). A dev database that already has the once-only flag won't run the new
  worker-name fill; the live install never ran it. On Windows: restart once, then go through
  each **Check** above.

---

## Round 7: 2026-10-15

Scope: the same uncommitted work, after Round 6. A `/code-review high` found seven problems,
none in this log: three new (1, 2, 6), three fresh cases of causes earlier rounds called fixed
(3 → R3-10/R6-9, 4 → R2-7, 5 → R6-7), and one cleanup (7). All seven are fixed below, plus one
more place with the cause of R7-3. Still data version 10 (not yet released).

### R7-1: Re-seeding test data crashed partway through. **Fixed**
- **Seen:** running the re-seed stopped with an error at the activity-history step. No
  history was seeded, and the summary line, date clean-up and supplier links after it never ran.
- **Root cause:** R6-8 renamed the piece that words a part's one-line summary and updated the
  live routes, but the seed still asked for the old name. The seed can't run under WSL, and no
  automatic check looked at the scripts folder, so nothing caught it.
- **Fix:** the seed builds the part once and words the summary from it, the same way creating
  a job does. New automatic check: every name a server script asks for must still exist in the
  file it comes from (read from the files, so it runs under WSL). Proven: it fails on the old seed.
- **Check:** on Windows, run `seed.bat`: it finishes, and a seeded job's History shows its parts.

### R7-2: The data-version note listed the wrong conversions. **Fixed**
- **Root cause:** the version 10 note was written in Rounds 3–4 and not updated when Round 5
  removed the guessing conversions and Round 6 added the assign-name fill.
- **Fix:** the note lists what version 10 actually does. The conversion's own summary note
  had the same gap (no assign-name fill) and was fixed too.

### R7-3: Starting a clock read the job's whole parts list (reopens R3-10, R6-9). **Fixed**
- **Root cause:** the R3-10 sweep missed the start route. A sweep for the same pattern found one
  more: moving a time block to another part read the whole list to name the old and new part.
- **Fix:** both use the shared one-part check. The part routes still read the whole list, because
  they need it for their checks and their reply.
- **Check:** start a clock on a part: it starts. Move a finished block to another part: History
  names both parts.

### R7-4: After answering "when did you finish?", History loaded twice (same cause as R2-7). **Fixed**
- **Root cause:** R6-5 added a hand-made "this job changed" signal on two paths that already
  had one. An accepted answer is saved under the job, which signals by itself. A job found closed
  from another PC reloads the job, and an open History reloads after every job load.
- **Fix:** both hand-made signals removed. The one case that really needs it — the question
  went away because another screen changed or removed that clock (no save from this PC) — now
  signals from the place that handles it. The external clock-stop signal stays. The History
  note in `client-patterns.md` says the same.
- **Check:** History open, answer the question for this job: one load. On another PC, delete
  that clock, then answer here: the question goes and History shows the change.

### R7-5: Leftover status go-between in the job window (same cause as R6-7). **Fixed**
- **Fix:** deleted; the status control gets the original directly.

### R7-6: Deleting a time block whose part was gone looked the part up twice. **Fixed**
- **Root cause:** the lookup returned "nothing" in a form that the naming step reads as "no
  part given", so it looked again.
- **Fix:** the delete uses the shared one-part check, which says "not found" in the form the
  naming step accepts.

### R7-7: Two checks in the part fill-in conversion could never be true. **Fixed** — deleted.

### Automatic checks
- `cd jobcard-system/client && npm test`: 46 checks (was 45), all pass. New: the script names
  check. The client builds.

### Not verified this round
- Changed server files pass a syntax check. The seed, server and conversions were not run (WSL
  can't run the database library). On Windows: run `seed.bat`, then go through each **Check** above.

---

## Round 8: 2026-10-15

Scope: the same uncommitted work, after Round 7. A `/code-review high` found six problems,
none in this log: two new (1, 2), one fresh case of a cause called fixed (3 → R2-7, R7-4),
and three cleanups (4, 5, 6). All six are dealt with below. Still data version 10 (not yet
released).

### R8-1: Old "started a clock" lines never got their part name. **Fixed**
- **Seen:** History read "Alice started work on the part" for clocks started before this
  change, even though the entry had recorded the part ("Plate").
- **Root cause:** the old start route saved no snapshot, and the trail stores that as the
  text `'null'`. The startup fill read it as "not a snapshot" and skipped the row. The
  conversion marks itself done after one run, so these rows would never have been fixed.
  The same flaw sat in the assign-name fill and the auto-stop worker fill.
- **Fix:** one shared snapshot reader in `legacyMigrations.js` (`parseTrailSnapshot`) treats
  a missing or `'null'` snapshot as empty. Damaged JSON is still skipped. All four fills use it.
- **Check:** on a database that has **not** yet run the History conversion (a backup from
  before this work, or the live install), restart, open an old job's History: old clock
  starts name their part. A database that already ran it (the dev copy) won't re-run; re-seed.

### R8-2: An office person's own hand-entered time repeated their name. **Fixed**
- **Seen:** "Alice added 2 h of work for Alice" / "Alice started an open clock for Alice".
- **Root cause:** the added-time wording never checked whether the worker was the person who
  added it. The "their own clock" rule from Rounds 5–6 covered stop, edit, confirm and delete.
- **Fix:** own time reads "added 2 h of their work on Plate (…)" / "started their own open
  clock on Plate". Someone else's still reads "for Bob". New automatic check covers all four.
- **Check:** as admin, add time for yourself, then for a worker, and read History.

### R8-3: Invoicing with History open loaded History twice (same cause as R2-7, R7-4). **Fixed**
- **Root cause:** History reloaded after every full reload of the job, not just the first
  one. Invoicing both saves a status change (which reloads History) and reloads the job.
  R7-4 removed one extra trigger, not this cause.
- **Fix:** History waits only for the job's first load in this window. Later job reloads no
  longer reload it. Only the "this job changed" signal does.
- **Check:** History open, invoice from the job strip: one History load.

### R8-4: An outside clock stop refreshed the wrong job's History. **Fixed** (partly decided)
- **Seen:** when a clock on another job turned out to have stopped itself, the History of the
  job on screen reloaded instead of the job that actually changed.
- **Root cause:** the "stopped from outside" handler always named the job on screen.
- **Fix:** each place passes the job whose clock actually changed. That job's History is told,
  and this job's work list reloads only when it is this job.
- **Decided — do not raise:** the two remaining "changed from outside" calls (this one, and the
  finish question that went away because another screen changed the clock) stay. They are
  the only two ways a change arrives without a write from this PC, as R7-4 already settled.
  Merging them into one entry point would make every accepted answer load History twice.
- **Check:** with job A open, let a clock on job B stop itself, then try to stop it from A.
  A's History doesn't reload. B's History, if open elsewhere, does.

### R8-5: History wording read old trail shapes itself (house rule). **Fixed** / **Decided**
- **Fixed:** the add/delete time wording fell back to the entry's `worker` change when the
  snapshot had no worker name. A new exact fill (`fillTimeBlockWorkerNames`) copies that
  change into the snapshot at startup, and the wording's fallback is deleted. The data
  version 10 note lists it.
- **Decided — do not raise:** sentences for job card preview, print packet, photos and
  quality-form level stay. Nothing records those events today, so there is nothing to
  convert them into. Recorded under "Intended, not findings" in `client-patterns.md`.
  Customer-change keys (`companyId`/`contactId`) are still written today and aren't old shapes.

### R8-6: The shared display-name rule was re-exported from two unused places. **Fixed** — deleted.

### Automatic checks
- `cd jobcard-system/client && npm test`: 47 checks (was 46), all pass. New: own vs other
  worker wording on added time. The client builds.

### Not verified this round
- Changed server files pass a syntax check. The conversions were not run (WSL can't run the
  database library), and the new check was not run against the old code to see it fail. On
  Windows: re-seed, then go through each **Check** above. For R8-1 and R8-5, use a database
  that hasn't run the History conversion yet.

---

## Round 9: 2026-10-15 — causes, not spots

Scope: the same uncommitted work, after Round 8. A `/code-review high` found eight problems, none
in this log: two reopened (1 → R7-4, broken by R8-3; 4 → R8-2 for converted entries), six new.
Rounds 1–8 fixed each finding where it was reported and the same four causes kept producing new
ones. This round replaces the four causes. Still data version 10 (not yet released).

### Cause A: History had many "refresh now" triggers, and each round added or removed one
(R1-1, R2-3, R2-7, R6-5, R7-4, R8-3, R8-4, today's 1)
- **Root cause:** every "History missed a change" fix added a trigger; every "History loaded
  twice" fix removed one, and reopened a miss. A refresh was a thing to ration.
- **Fix:** a History read is safe to ask for from anywhere: asks that arrive while one is in
  flight are folded into one more read after it (`client/src/utils/coalesceRuns.js`, no
  timer), never two at once, newest result wins. With that, History reads on three
  occasions and never fewer: when it opens (after the job's first load), on the one
  "this job changed" signal, and after every later full reload of the job (announced
  through that same signal from the job loader). That last one is what R8-3 removed.
- **Decided — do not raise:** "History loaded twice after a write that also reloads the
  job". The second read queues behind the first and is accepted. A trigger is never
  removed to avoid it. Recorded in `client-patterns.md`.
- **Check:** History open on PC A; PC B invoices the job; edit a field on A → the "job is
  closed" message, and History shows the invoicing without Refresh.

### Cause B: the old-entry conversions were seven database loops nobody could run
(R2-6, R3-1/2/3/5, R4-1/2/3/7, R6-4, R6-10, R8-1, R8-5, today's 2, 3, 4, 7)
- **Root cause:** each fill was a SQL filter + loop + UPDATE in `legacyMigrations.js`. The
  database library doesn't load under WSL, so none was ever run or tested here; eight
  rounds found their bugs one at a time by reading. The History read in the routes parsed
  rows its own way, so a damaged row the conversion skips (R6-10) still failed the window.
- **Fix:** the rules are one pure file, `server/src/db/trailEntries.js`: `readTrailEntry`
  (parse a row; damaged → undefined) and `convertTrailEntry` (the seven rules applied to
  one row, in order, idempotent — converting a converted row returns undefined). The
  once-only startup step is now one read of every job trail row through
  `convertTrailEntry`, and every History/search read goes through `readTrailEntry`: a
  damaged row is skipped and counted in the log, never shown, never a failure. The assign
  fill covers assign/unassign only (today's 7). The old copy of the assign-name rule in
  `historyChanges.js` is deleted.
- **Automatic checks:** `cd jobcard-system/server && npm test` (new, 13 checks, no
  database): every old shape in, the new shape out, damaged in → skipped, converted in →
  unchanged. `client/test/trailConversion.test.js`: converted entries through the History
  wording, asserting the sentence.
- **Decided — do not raise** (recorded in `jobs-and-status.md` / `time-and-costing.md`):
  a converted work entry that recorded only a name reads "for Alice" even when Alice
  added it (no account was recorded; names are never compared — today's 2 / R8-2 for old
  entries); parts split from one old Save sit at one moment and list newest-first like
  every tie, status move on the original (today's 4); damaged rows are skipped (today's 3).

### Cause C: the practice data imitated the app by hand
(R4-9, R7-1, today's 5)
- **Root cause:** the seed wrote admin status entries for moves that, in the app, logged
  work makes and records inside the clock entry.
- **Fix:** the seed's finished-work entries carry the status move exactly as the stop
  route does (first run Open → In Progress, the completing run → Done, a single run
  Open → Done). Only moves a person makes by hand (Material/Service, Cust. Notified,
  Invoiced) are admin entries. Every seeded In Progress/Done/Invoiced/Cust. Notified job
  has a finished run (checked).
- **Check:** after `seed.bat`, a Done job's History has no "Admin moved the job to In
  Progress/Done"; the first and last work entries carry the moves; an invoiced job keeps
  one admin Done → Invoiced entry.

### Cause D: the "which name to show" rule had two copies that trimmed differently
(R1-6, R2-8, R4-5, R8-6, today's 6, 8)
- **Root cause:** the JS copy stripped every kind of blank; the SQL copy only spaces.
- **Fix:** a stored name is always clean. `cleanName` (shared) trims all whitespace,
  collapses inner runs, blank → null; it runs on every user save and once over stored
  names at startup (`cleanUserNames`, every boot, no-op after the first). Both display
  copies drop their trimming and say the same thing: name if not blank, else username.
  The stale "re-exported by helpers.js" comment is gone.
- **Decided — do not raise:** the rule has a JS and a SQL copy, neither trims. By design.

### Rule from here on
- A finding that is a new case of a cause above is fixed at the cause, or recorded as
  decided — never patched at the spot again.

### Not verified this round
- Everything that opens the database (the conversion, the name tidy, the seed, the
  server) still has not been run anywhere. On Windows, once: `seed.bat`, open a Done
  job's History (Cause C check); then start the app on a **copy of the live database**
  and open an old job's History (old clock starts name their part, old adds name their
  worker, no "couldn't be loaded"); then the Cause A check with two PCs.

---

## Round 10: 2026-10-15

Scope: a `/code-review high` of Round 9's own changes found nine, none in this log. Sorted by
the Round 9 rule — fixed at the cause, or decided — not patched in order. Still data version 10.

### Fixed at the cause
- **R10-1: Old comments kept a tidied-up author's old spelling.** Fallout from Cause D: the
  startup name tidy changed the stored name but, unlike a rename, did not fold the person's
  past comments. `cleanUserNames` now does exactly what the rename route does, with the same
  prepared statement, in one transaction per person.
- **R10-2: Moving work between two records with the same name read "made a change".**
  Cause B family (a change recorded by name only). A time-block edit that re-credits Ben →
  the other Ben, or moves Plate → the other Plate, now records the before ids in the
  snapshot (`workerIdBefore`, `itemIdBefore`/`itemId`); the wording keeps the line when the
  ids differ: "credited the work on Plate to the other Ben", "moved the work from Plate to
  the other part called Plate". A file move never had this problem (R2-4 reads only the
  destination). Four new checks. Old same-name moves still read "made a change" — recorded
  in `time-and-costing.md` as intended; nothing was recorded to tell the records apart.
- **R10-4: The seed could write a backward status move** for a Quote/PO job with finished
  runs. No seeded job does that; the seed now throws if one ever does.
- **R10-5, R10-7, R10-9 (clean-ups):** one "skip damaged rows" loop in `jobcard-helpers.js`
  used by both History reads; the job window's "first load done" state and ref are written
  by one function; the side-window bubble size is one token (`--bubble-size`) read by the
  gutter, the comments bubble and the History bubble's offset.

### Decided — do not raise (each recorded in the matching note)
- **R10-3:** the activity search's total counts a damaged row the page skips. A damaged
  row is a corruption marker to be found in the log, not paginated around.
- **R10-6:** `api.js` keeps two announcers; `noteJobChanged` carries changes that were not
  writes from this PC and must not look like a data write to the list screens.
- **R10-8:** the once-only conversion parses a row twice. Runs once per database.
- Mention records keep the name as typed in the comment (it matches the text); the tidy
  and the rename fold only author names. (Raised by the executor, not the review.)

### Automatic checks
- Client 61 (was 57), server 13, build passes.

### Not verified this round
- Same as Round 9: nothing that opens the database has run. The Windows checklist in Round 9
  stands; add: rename a person who has old comments, then restart — their old comments show
  the new name; re-credit a block between two same-named staff and read History.
