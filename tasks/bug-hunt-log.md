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
_No hunt running._ While a hunt runs, each round adds a "Round N" list of what it fixed here, plus a row in the table below.

| # | Area | Found | Confirmed | Fixed | Sent to owner |
|---|---|---|---|---|---|

## Past hunts
What was fixed in each earlier hunt (history only — not needed to hunt):
- [Hunt 1 — final delivery, rounds 1–10](bug-hunts/2026-09-27-final-delivery.md)
- [Hunt 2 — after the fixed quality levels, rounds 11–13](bug-hunts/2026-09-28-second-hunt.md)

Hand-test steps from every hunt: [hand-tests.md](hand-tests.md).

## Keeping this file short
At the end of every hunt: move "This hunt" into a new file in tasks/bug-hunts/, write each "Decided" item into its docs/notes file and delete it here, add rejected findings to "Not bugs", and put hand-test steps in tasks/hand-tests.md.
