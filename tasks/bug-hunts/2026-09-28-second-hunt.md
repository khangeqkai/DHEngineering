# Bug hunt 2 — after the fixed quality levels (rounds 11–13)

Started 2026-09-28 on commit ddae2fa. Archived from tasks/bug-hunt-log.md. History only — hunters do not read this.

## Rounds
| # | Area | Found | Confirmed | Fixed | Sent to owner |
|---|---|---|---|---|---|
| 11 | Quality levels + settings | 11 | 7 | 5 | 2 |
| 12 | Management pages + search | 13 | 7 | 7 | 0 |
| 13 | Job screen + Critical sign-off | 7 | 4 | 4 | 0 |

## Fixed
### Round 11 — fixed quality levels and settings screens
- A job switched to Critical while a stop form (or hand-entry form) was open: every Save was refused, but the four inspection questions never appeared. The refusal now names the inspection boxes; the form shows the checklist and marks them.
- The activity trail showed quality levels as raw codes: it now says Standard / Critical.
- Tags & Equipment (and the other list pages): a slow reply could show one category's options under another tab; a late reply for a tab you've left is ignored.
- The "Restoring…" cover didn't hold the keyboard, so people could Tab away and leave Settings mid-restore.
- Seed data made Critical jobs whose finished work had no inspection answers.
- Rejected: clicking an old Quality Level entry in Search > Activity does nothing (the page is gone on purpose).
### Round 12 — management pages and search
- Editing a user from a page opened earlier put back their old role (undoing someone else's demotion or promotion), and the same for names/emails: every management edit form (Users, Customers, customer people, Suppliers, Equipment) now sends only the boxes that changed; the server keeps anything not sent.
- Escape in the supplier form's "+ Other" box closed the whole supplier window and lost the typing: a window now ignores an Escape an inner box has already handled.
- A refresh after archive/restore came back with the tab or "Show archived" from when the button was pressed: it reloads whatever is showing now.
- The job screen's New supplier form showed name clashes and bad phone/email as pop-ups, and offered to create names the server refuses: it marks the box; the list doesn't offer those names.
- Tags & Equipment: a duplicate machine number or clashing option name popped up instead of marking the box.
- Search > Time: the machine filter treated _ and % as wildcards.
- A completely blank person could be added to a customer.
### Round 13 — job screen and the new Critical sign-off
- Start-up fill-in read a job's creation entry as "was Standard before", so back-dated work on a job created Critical lost its sign-off requirement: a creation entry now means the job's first level applies.
- The stop form's Save and Resume sent the whole run as it was at the stop, undoing a colleague's corrections made meanwhile: Save sends only what the form owns, Resume only reopens the timer; the server keeps the stored times.
- The sign-off warning (and "timer running on another job") named parts by an internal sort number instead of the number the screen shows.
- A long confirm message (many unanswered runs) pushed the buttons off screen: the dialog scrolls inside.
- Rejected: judge old runs by when they were typed in rather than when they finished (owner's rule says finished).
