# Hunt 5 — sign-in, backup, statistics and management pages (rounds 19–21)

Hunt 5 — rounds 19–21, started at commit 4a9e732 (2026-09-28). **Single-user only: two people working on the same record at the same time is out of scope — do not report it.** Areas: sign-in and permissions; start-up, backup/restore and settings; Workshop Statistics and management pages.

Round 19 — sign-in and permissions:
- Back from the job list after signing in no longer shows the sign-in page over a live session.
- Archiving a worker with a running timer is refused, naming the job and part.
- Change PIN: a wrong current PIN marks the Current PIN box in PIN wording; success says "PIN updated"; Users form says "PIN is required".
- New user / customer / person / supplier trail entries record the email they were created with.
Round 20 — start-up, backup/restore, settings:
- Export warns when the backup holds records only (job-folders location not set or unreachable) instead of a plain success.
- A failed export no longer empties or deletes an earlier backup at the same path (built beside it, renamed in when complete).
- Restore works when the job-folders folder is missing (files put straight back); a folder in use gets a plain "close the files and try again".
- A leftover "__restore_old" folder (possibly the only copy of the originals) now blocks a new restore with a plain message instead of being deleted.
- A damaged or partly copied backup gets a plain refusal, not a raw system error.
- (Owner approved) Backups carry a data version; a restore refuses a backup from a newer app version ("update this computer first").

Round 21 — Workshop Statistics and management pages:
- Statistics dates a job with no logged work by when it moved into a finished status, not its invoice date or last edit.
- A machine can't be renumbered while any logged work names its number (backdated work no longer slips through).
- Escape in the Add/Edit Person box closes only that box, not the customer window.
- The shared PIN length message says "PIN", not "Password".
- Create trail entries leave out a blank optional name instead of "(empty) → (empty)".
- Trend view keeps the right title for the rows shown when a bad range is refused.

| # | Area | Found | Confirmed | Fixed | Sent to owner |
|---|---|---|---|---|---|
| 19 | Sign-in + permissions | 15 | 6 | 4 | 1 |
| 20 | Start-up, backup, settings | 13 | 7 | 6 (1 owner-approved) | 1 |
| 21 | Statistics + management pages | 6 | 6 | 6 | 0 |
