# Bug-hunt log — final delivery

Started 2026-09-27, on top of commit c451d5f (clean-up sweep). 10 rounds, one area per round.

Every agent in the hunt reads this file first. It is the memory between rounds.

## Rules of the hunt
- **Bugs only.** Wrong behaviour a person would hit, a permission leak, wrong or lost data, a crash, a broken house rule from CLAUDE.md. Tidying, renaming, repeated code and speed-ups on paper are out of scope unless they are the *cause* of a real bug.
- **Every finding carries exact steps** a person (or a request) takes to trigger it. "Looks risky" is not a finding.
- **Fix the cause, not the symptom.** Ask why the mistake was possible and whether the same mistake exists elsewhere; fix the kind of bug, not just the instance.
- **Design change needed → do not patch.** It goes under "Waiting for the owner" with a plain proposal.
- **Anything listed under "Decided — leave alone" or "Fixed" is not re-reported** unless the fix itself is wrong.

## Waiting for the owner (design decisions)
- **R6 — Customer name on pre-filled quality forms.** Workers are not meant to see customer names, but quality forms come pre-filled with the customer's company name and workers open and print them. Options: (1) allow it and write it down as an exception, since workers handle these forms anyway; (2) never pre-fill the customer box; (3) office copy filled, worker copy blank.
- **R8 — Quality forms are frozen when the level is set.** Pre-filled forms are copied once (on job create / level change); later parts, due date, PO changes and the "date" box never update. Options: (1) fill forms fresh at print/view time and stop keeping pre-filled copies; (2) keep copies but refill on every job change; (3) accept it, drop the auto date box, add a "Refresh forms" button.
- **R8 — Old level's forms stay after a level change.** The old level's blank forms stay in the job and print by default, and a form handed back under the old level counts as returned for the new level (so the job can be invoiced). Proposal: on a level change remove the old untouched blanks (never returned forms), move old returned forms to an "Earlier level" sub-folder, and count a returned form only for the level it was returned under.

## Decided — leave alone
- **R4 — Reused machine numbers.** Owner: machine numbers are never reused in this workshop, so statistics crediting hours by machine number is fine. Leave as is.

## Fixed
### Round 1 — pricing sheet and job screen
- Closing a job after a pricing save failed threw the figure away and said pricing was "saved either way". Close now waits for the pricing save; failed → listed as work to lose; still in flight → "still saving, may still go through" question, nothing dropped.
- Two admins pricing one job overwrote each other: a pricing save now sends only figures that differ from what the server last stored; that base moves on every successful reply.
- Logged hours rounded twice (1.2347 h billed as 1.24): the overtime split returns unrounded hours; each caller rounds once.
- Pricing save refused on a job invoiced elsewhere did not lock/reload the screen: pricing, file upload/delete and timer saves now call the shared closed-job handler.
- On an invoiced job the view-only Costing buttons ("What this job used", "Try again") were disabled: the lock wraps only the editable parts (Costing and Details).
- Enter did nothing on buttons inside the job screen.
- Stored pricing totals carried float noise (51.74999999999999): totals rounded to cents at the one compute point.
- A number too long to fit saved as 0 or cleared an override: rejected as invalid on both sides.
### Round 2 — job details, customer box, parts
- Linking a service to a supplier from a part re-sent the whole supplier from an old copy, undoing others' edits (and renaming it back on every job): a narrow "attach one service" server action now does only that.
- Remaining parts kept old numbers after one was removed: the display position from the server reply is now carried onto kept rows.
- Adding/removing a part on a job invoiced elsewhere didn't lock the screen: part create/remove now route the closed-job refusal to the shared handler.
- Unticking Repeat Job kept the hidden previous-job reference (printed, exported, searched): the server clears it whenever the job isn't a repeat; a startup conversion cleans existing jobs.
- The browser's own "fill out this field" bubble on the inline New supplier form blocked Create: the job form turns browser validation off; the app's own check marks the field.
- Typing an existing customer's exact name without picking the suggestion offered to add a duplicate, then failed: an exact match is now treated as that customer.
- Changing Quality Level didn't refresh the missing-quality-form warning in Files.
- Title-casing capitalised the letter after an accented letter.
- A half-filled New supplier form on a new part vanished when the part saved.
- Known small leftover (accepted): typing a previous-job reference then instantly unticking Repeat Job can briefly show the reference on screen until the job reloads; the stored data is always correct.
### Round 3 — database start-up, backup and restore, settings
- A restore deleted backup zips kept inside the job folders, and each export packed in earlier backups: export/restore refuse a location inside the job folders; existing app backups found there are skipped.
- Restore always failed when Job Folders was a drive/share root or mount point: such a location is refused on save and at restore start with a plain message; an unreadable subfolder no longer stops an export.
- A backup could become unrestorable if a file changed during export: the file list records the bytes actually packed.
- Restoring a backup with no files left newer files on disk (showing up on reused job numbers): backups record that the folders were read; an empty one swaps in an empty folder.
- A restore onto a new PC left no activity-trail entry.
- Customers restored from a pre-split backup kept time-zone-less dates.
- A starting job number over ~15 digits was rounded and then blocked new jobs: refused as too long.
- The Change PIN form showed field mistakes as pop-ups instead of marking the box.
### Round 4 — Workshop Statistics
- Machine codes containing / | ; were split into invented machines, and the renumber guard missed their logged work: statistics use the shared comma-only split.
- Headline said "No jobs were finished" when finished jobs just had no due date.
- Machines tab summed already-rounded hours (short runs vanished from "in use"): the server returns totals and shares from unrounded hours; in use/busiest go by run count.
- Refresh / Trend View loaded a backwards or half-empty custom range: the check runs on every load; the server refuses start after end.
- Quiet months were missing from the trends: preset ranges fill every period from the range start; All Time/custom from the first period with data.
- Rejected: custom range ending in year 9999 shows zeros (not a real use).
### Round 5 — management pages
- A machine number containing a comma split into two invented machines: commas are refused in machine numbers (rule read from the shared machine-list file).
- Editing a machine wiped its description: the Equipment form has a Description box; an update without one leaves it alone.
- Saving a supplier from an old page removed services linked meanwhile from a job: the page sends only ticked/unticked services; the server applies just those.
- A renamed user who stayed signed in kept writing comments/trail under the old name: the name is read fresh on every request.
- Options differing only in symbols/decimals/accents ("M6 x 1.0" vs "M6 x 10") were treated as one: a code match counts only when the names match too; otherwise refused with a message.
- The Customers activity log didn't name what was archived/restored.
- Customer export listed retired contact people as current.
- Enter saved names without the usual tidy-up on Suppliers, Users, QA Levels and customer-person forms: the tidy-up is applied on save as well.
- A capitals-only rename of a customer or QA level never renamed its folder on Windows.
- Adding an existing service under "+ Other" showed it twice and logged a false change.
- Rejected: customer panel flipping to "Add New Customer" when someone else archives the open customer.
- Carried to round 6 (confirmed, not yet fixed): field mistakes as pop-ups on Users/Suppliers/customer-person forms; QA "Upload PDF Template" not keyboard-reachable; Escape in QA rename box discards the name; archived-username message; very long customer name whose folder can't be made.
### Round 6 — sign-in and who can see what
- An invoiced job's card preview and combined print/save were refused by the closed-job lock: both read-only steps are allowed.
- Change PIN had no limit on wrong current-PIN guesses and left no trace: a shared PIN-attempt limiter (per account) now covers it, with trail entries.
- A correct sign-in wiped the wrong-PIN count for every account on that computer: only failures aimed at the account that signed in are cleared.
- A failed sign-in stored the typed username at any length: sign-in fields are length-capped and the route has a small body limit.
- PIN reset, archive/restore or backup restore signed people out saying "logged in from another device": the message now names the real reason.
- A renamed person kept their old name in the sidebar and Settings.
- A worker could move their own stopped work block to a different part.
- The Statistics export kept the invoiced-money column after a mid-session demotion.
- (Carried from R5) Management forms now mark the box instead of pop-ups/browser bubbles; QA "Upload PDF Template" is a real button.
- Carried to round 7: Pressing Escape in a QA level's rename box throws the new name away; Creating a user with an archived account's username gives only 'Username already exists'; A very long customer name saves but its folder can never be made.
### Round 7 — timers, logged work, overtime, status
- Good pieces stored as "12.0" blocked later corrections and logged false changes: the pieces helper stores whole-number text; part quantities too.
- Signing out with another worker's stop form open restarted that worker's timer: only your own block is resumed on sign-out.
- A hand-added/edited work block could have no part, vanish from the job screen and (with no finish) block invoicing forever: a part is required.
- Hand-entered work could finish in the future and be billed at once: finish time may not be in the future.
- The job list kept the old status and workers after hand-entered time changed.
- The stop-timer form couldn't be dismissed when Save and Resume were both refused.
- A hand-added block with no finish time skipped the one-month date check.
- Saving the manual edit form overwrote pieces/machines/notes saved on the block meanwhile: only changed fields are sent.
- The overtime split gave up to a minute per tier change to the earlier rate when a block started mid-minute.
- "Timer stopped" notice used a typed emoji and always blamed an admin.
### Carried items cleared (between rounds 7 and 8)
- Equipment checks comments box now capitalises on leave.
- Escape in a QA level's rename box saves like Enter.
- Creating a user with an archived account's username says to restore it from the archive (shared name-clash reply, marks the username box; duplicate names on Customers/Suppliers now mark the box too).
- Customer and QA level names capped at 150 characters (folder names stay under the OS limit); unchanged longer names still save.
### Round 8 — files, printing, quality forms, Excel
- Picked-file upload failures hid the reason: each failed file shows the server's reason; over-long stored names are capped.
- An unreachable job-folders drive looked like "no files" everywhere (every part flagged missing, re-upload prompts): one shared reachability check; file routes say the location can't be reached; warnings stand down.
- Excel export failed outright when one cell exceeded the spreadsheet text limit: over-long cells are trimmed with a marker.
- File names with two dots in a row were refused and could break the whole print packet.
- The quality-form copy warning showed a raw system error with the folder path.
- The Files panel stacked three identical pop-ups when job folders weren't set.
- Quality-form template upload showed no loading message.
- Tying a file to a part stripped the person's own bracketed text from its name.
- TIFF scans showed a broken thumbnail and blank preview.
- Rejected: Files button not showing a file count (not a bug).
### Round 9 — job list, search, comments, activity record
- Invoicing from the job screen didn't lock it, and the header stayed editable on every closed job: the status reply is passed back and the header checks the closed state.
- Activity screens and export showed stored moments as raw UTC text (wrong hour, often wrong day): the one trail-value formatter renders moments and calendar days; the export uses it.
- Activity entries didn't name their job and searching a job number missed most activity: the job number is joined in (deleted jobs fall back to their recorded number); one shared activity match clause.
- Search > Activity "Field Changed" offered names nothing records; no settings filter.
- Picking a job's current status wrote a false "X → X" change.
- Last Edited on the job list didn't move when parts or workers changed.
- Activity search couldn't find text with a double quote (inch marks).
- The job list's "Invoiced" filter in the active view could never show anything.
- The job list kept a stale row after a refused delete/unarchive.
- Opening a deleted job from Search > Activity said "Failed to load… try again".
### Round 10 — delivery and speed
- The PIN-reset command worked on the wrong database for the installed app, kept old sign-ins and was described wrongly: it finds the app's real data folder (asks if several), lists active admins only, ends old sign-ins; instructions corrected.
- Workshop Statistics over long ranges froze the whole server for several seconds: the office clock is built once, the overtime split jumps between rate changes instead of minute by minute, and customer rankings stop recomputing pricing per job.
- The server log grew forever from background checks: routine successes aren't logged in production; the file rolls over at 10 MB.
- A developer's review-tool key in server/.env would be copied into the installer: excluded from packaging.
- A damaged certificate key stopped the app from ever starting: it's regenerated.
- A failed tunnel download in home-access setup blocked every retry.
- Home Access, starting job number and new-job Create now mark the box instead of pop-ups.
- Not a bug: "Company Name" in Field Changed is recorded after all.
- Rejected: "already running" message when another program holds the secure port.

## Rounds
| # | Area | Found | Confirmed | Fixed | Sent to owner |
|---|---|---|---|---|---|
| 1 | Pricing sheet + job screen | 13 | 8 | 8 | 0 |
| 2 | Job details + parts | 16 | 9 | 9 | 0 |
| 3 | Database, backup, settings | 13 | 8 | 8 | 0 |
| 4 | Workshop Statistics | 13 | 7 | 5 | 1 |
| 5 | Management pages | 26 | 15 | 10 (5 carried) | 0 |
| 6 | Sign-in + permissions | 20 | 9 (+5 carried) | 10 | 1 |
| 7 | Timers, logged work, status | 13 | 11 | 10 | 0 |
| 8 | Files, printing, QA forms, Excel | 21 | 11 | 9 | 2 |
| 9 | Job list, search, activity | 19 | 12 | 10 (2 carried) | 0 |
| 10 | Delivery + speed | 18 | 8 (+3 carried) | 9 | 1 |

## Test these by hand before delivery
Nothing here has an automatic test, so click through these once on a real PC. Each line is a screen the hunt changed.

**Pricing (admin)**
1. Change a price, pull the network cable, close the job → you're warned the price isn't saved.
2. Two admins open the same job; each changes a different price → both prices stick.
3. Invoice a job, reopen it → Costing is locked but "What this job used" still opens.

**Job screen**
4. Add three parts, remove the first → the rest renumber 1, 2.
5. Tick then untick Repeat Job → the previous-job number is gone from the printout.
6. Type an existing customer's exact name without clicking the suggestion → it uses that customer.
7. Press Create with empty boxes → the boxes are marked, no pop-up list.
8. Invoice a job from its own screen → it locks straight away.

**Timers and logged work**
9. Stop a timer, save 12 pieces, then edit only the finish time → it saves.
10. Add work by hand with no part, or a finish time tomorrow → refused.
11. As a manager, stop a worker's timer, then sign out without filling the form → the worker's timer stays stopped.

**Suppliers, customers, equipment**
12. Link a service to a supplier from a job, then edit that supplier's phone on the Suppliers page → the service stays.
13. Edit a machine's name → its description is kept.

**Sign-in and security**
14. Enter a wrong current PIN on Change PIN five times → you're slowed down.
15. As a worker: prices, customer phone/email and the activity log stay hidden.

**Files and printing**
16. Reprint an invoiced job's job card and packet → works.
17. Disconnect the job-folders drive, open a job → "location can't be reached", not "missing files".

**Backup**
18. Export a backup to a folder outside the job folders, then restore it → works, older backups untouched.
19. Try saving a backup inside the job folders → refused with a message.

**Statistics**
20. Pick "Last 6 Months" → six rows, quiet months as zero; "All Time" loads in about a second.

**Installed app**
21. Build the installer on a PC with no review-tool key; install on a fresh PC with no internet → starts, sign in admin / 1234.
22. Run the PIN-reset command on the installed PC → it finds the app's real database.
