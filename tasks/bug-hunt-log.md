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
_None yet._

## Rounds
| # | Area | Found | Confirmed | Fixed | Sent to owner |
|---|---|---|---|---|---|
