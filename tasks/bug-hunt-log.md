# Bug-hunt log

Every agent in the hunt reads this file first. It is the memory between rounds and between hunts — kept short on purpose (see "Keeping this file short").

## Rules of the hunt
- **Bugs only.** Wrong behaviour a person would hit, a permission leak, wrong or lost data, a crash, a broken house rule from CLAUDE.md. Tidying, renaming, repeated code and speed-ups on paper are out of scope unless they are the *cause* of a real bug.
- **Every finding carries exact steps** a person (or a request) takes to trigger it. "Looks risky" is not a finding.
- **Fix the cause, not the symptom.** Ask why the mistake was possible and whether the same mistake exists elsewhere; fix the kind of bug, not just the instance.
- **Design change needed → do not patch.** It goes under "Waiting for the owner" with a plain proposal.
- **Anything listed under "Decided — leave alone", "Not bugs" or "This hunt" is not re-reported** unless the fix itself is wrong.
- **Hunt 4 only: ignore two people using the app at the same time.** Anything that needs two people (or two windows) acting on the same thing at once is out of scope — assume one person at a time.
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
- Logged work: a manager clearing End Time on an old run reopens it as a running timer (management correction, intended).
- Accepted leftover: typing a previous-job reference then instantly unticking Repeat Job can briefly show the reference until the job reloads; stored data is always right.

## This hunt
Hunt 4 started 2026-09-28 at commit 286f86a — 3 rounds (16–18), single-user situations only.

### Round 16 — job list, search, activity
- Changing status from the list badge now updates Last Edited straight away.
- Search > Jobs: the Invoiced chip finds invoiced jobs (they are always archived).
- Job list empty screen says "No archived jobs" / "No results" / "Couldn't load" instead of "No job cards yet".
- Columns menu Reset also puts the column order back.
- Search > Time: workers no longer see a Worker filter that can only return nothing.
- Search results step back to the last real page when a job drops out.
- Job list search ignores spaces around the text.

### Round 17 — pricing sheet, new job, invoicing
- Retyping the figure already shown in an Hours or multiplier box no longer pins it as hand-typed (later logged work kept being left off).
- Labour Rates and Settings pages show "Couldn't load — Try again" after a failed load instead of blank boxes that Save would write over the real settings.
- Money on exactly half a cent rounds up (1.5 h at $50.05 = $75.08, was $75.07).
- Search > Activity Field Changed lists the missing recorded names (normal hours/total, multipliers, cost notes, skipped sign-off, printing).
- Overtime multipliers show the exact figure charged (1.125, not 1.13).

| # | Area | Found | Confirmed | Fixed | Sent to owner |
|---|---|---|---|---|---|
| 16 | Job list, search, activity | 15 | 7 | 7 | 0 |
| 17 | Pricing sheet, new job, invoicing | 5 | 5 | 5 | 0 |

## Past hunts
What was fixed in each earlier hunt (history only — not needed to hunt):
- [Hunt 1 — final delivery, rounds 1–10](bug-hunts/2026-09-27-final-delivery.md)
- [Hunt 2 — after the fixed quality levels, rounds 11–13](bug-hunts/2026-09-28-second-hunt.md)
- [Hunt 3 — timers and job details, rounds 14–15](bug-hunts/2026-09-28-third-hunt.md)

Hand-test steps from every hunt: [hand-tests.md](hand-tests.md).

## Keeping this file short
At the end of every hunt: move "This hunt" into a new file in tasks/bug-hunts/, write each "Decided" item into its docs/notes file and delete it here, add rejected findings to "Not bugs", and put hand-test steps in tasks/hand-tests.md.
