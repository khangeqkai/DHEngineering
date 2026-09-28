# Bug-hunt log

Every agent in the hunt reads this file first. It is the memory between rounds and between hunts — kept short on purpose (see "Keeping this file short").

## Rules of the hunt
- **Bugs only.** Wrong behaviour a person would hit, a permission leak, wrong or lost data, a crash, a broken house rule from CLAUDE.md. Tidying, renaming, repeated code and speed-ups on paper are out of scope unless they are the *cause* of a real bug.
- **Every finding carries exact steps** a person (or a request) takes to trigger it. "Looks risky" is not a finding.
- **Fix the cause, not the symptom.** Ask why the mistake was possible and whether the same mistake exists elsewhere; fix the kind of bug, not just the instance.
- **Design change needed → do not patch.** It goes under "Waiting for the owner" with a plain proposal.
- **Anything listed under "Decided — leave alone", "Not bugs" or "This hunt" is not re-reported** unless the fix itself is wrong.
- **Intended behaviour lives in docs/notes.** A behaviour written there as intended is not a bug. The owner's past decisions (fixed Standard/Critical levels, per-run Critical sign-off, quality forms removed, auto-start to tray, machine numbers never reused) are recorded there.

## Waiting for the owner (design decisions)
_None._

## Decided — leave alone
Owner decisions not yet written into docs/notes. Move each into the matching note at the end of the hunt, then delete it here.

_None._

## Not bugs — don't report again
Checked and rejected (or accepted as-is). One line each; kept for good.
- Statistics: a custom range ending in year 9999 shows zeros (not a real use).
- Customers: the panel flips to "Add New Customer" when someone else archives the customer you have open.
- Files: the Files button doesn't show a file count.
- Search > Activity: "Company Name" in Field Changed is recorded after all.
- Start-up: "already running" message when another program holds the secure port.
- Search > Activity: clicking an old Quality Level entry does nothing (the page is gone on purpose).
- Critical sign-off fill-in judges old runs by when they finished, not when they were typed in (owner's rule).
- Accepted leftover: typing a previous-job reference then instantly unticking Repeat Job can briefly show the reference until the job reloads; stored data is always right.

## This hunt
Hunt 3 (2026-09-28), 2 rounds: 14 — timers, logged work, Critical sign-off, status and invoicing; 15 — job details: customer box, suggestion lists, parts, supplier picker. Each round adds a "Round N" list of what it fixed here, plus a row in the table below.

### Round 14 — timers, logged work, sign-off, status
- Stop form no longer gets stuck when its run was handed to someone else or is already running again — it closes (or picks the running timer back up) with a message.
- A worker can only write a run while it is waiting for its stop form; rewriting an old run's pieces or sign-off answers is management-only on the server too.
- Add/Edit Time marks the Start box for a future start instead of a pop-up; other server refusals naming a box mark that box.
- Deleting a run keeps its Critical sign-off answers in the activity record (add, edit and delete now read one field list).
- Rejected: a manager clearing End Time on an old run reopens it as a running timer.

### Round 15 — job details, customer box, parts, supplier picker
- Company box on a new job no longer offers to add an archived customer's name; it says the customer is archived, and any name refusal marks the box.
- Parts no longer show a green "Attached" tick when files couldn't be checked (drive unreachable or not set) — they say "Files not checked".
- A half-filled New supplier form on a part is counted as unsaved work on close, tab switch and sign-out.
- Two New supplier forms open at once each keep their own labels and field marks.
- A supplier renamed elsewhere no longer leaves a part stuck as "not saved".
- "Update contact" sends only the details actually changed, so a colleague's edit isn't undone.
- A supplier created on the spot is kept when the new part finishes saving at the same moment.
- Typing into a new part while it is being created is no longer knocked back or half-saved.
- A blank new part no longer shows another part's "No file yet" warning.
- The job screen's supplier, worker and machine lists load once, not once per visit to the job list.

| # | Area | Found | Confirmed | Fixed | Sent to owner |
|---|---|---|---|---|---|
| 14 | Timers, logged work, sign-off, status | 6 | 4 | 4 | 0 |
| 15 | Job details, parts, supplier picker | 21 | 11 | 10 (1 carried) | 0 |

## Past hunts
What was fixed in each earlier hunt (history only — not needed to hunt):
- [Hunt 1 — final delivery, rounds 1–10](bug-hunts/2026-09-27-final-delivery.md)
- [Hunt 2 — after the fixed quality levels, rounds 11–13](bug-hunts/2026-09-28-second-hunt.md)

Hand-test steps from every hunt: [hand-tests.md](hand-tests.md).

## Keeping this file short
At the end of every hunt: move "This hunt" into a new file in tasks/bug-hunts/, write each "Decided" item into its docs/notes file and delete it here, add rejected findings to "Not bugs", and put hand-test steps in tasks/hand-tests.md.
