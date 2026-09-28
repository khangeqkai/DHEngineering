# Hunt 3 — timers and job details, rounds 14–15

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
- (Carried, fixed after the round) A previous-job reference typed after another PC unticked Repeat Job is refused with a box mark instead of showing "Saved" and being thrown away.

| # | Area | Found | Confirmed | Fixed | Sent to owner |
|---|---|---|---|---|---|
| 14 | Timers, logged work, sign-off, status | 6 | 4 | 4 | 0 |
| 15 | Job details, parts, supplier picker | 21 | 11 | 11 | 0 |
