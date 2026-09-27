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
_None yet._

## Decided — leave alone
_None yet._

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

## Rounds
| # | Area | Found | Confirmed | Fixed | Sent to owner |
|---|---|---|---|---|---|
| 1 | Pricing sheet + job screen | 13 | 8 | 8 | 0 |
| 2 | Job details + parts | 16 | 9 | 9 | 0 |
| 3 | Database, backup, settings | 13 | 8 | 8 | 0 |
