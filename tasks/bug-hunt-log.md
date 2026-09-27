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

## Rounds
| # | Area | Found | Confirmed | Fixed | Sent to owner |
|---|---|---|---|---|---|
| 1 | Pricing sheet + job screen | 13 | 8 | 8 | 0 |
