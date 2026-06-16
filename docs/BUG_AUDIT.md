# Bug Audit — Tracking

_Critical codebase review, with two rounds of false-positive checking. Date: 2026-06-16._

How to read this: each item has a checkbox. Tick it when fixed. "Confidence" is how sure we are it's real; "Verified by" notes whether it was confirmed by reading the code or by actually running it.

---

## 1. A regular worker can re-open an already-invoiced job  — REAL, FIX THIS

- [x] Fixed

**Confidence:** High — confirmed by reading the code.
**Verified by:** Code reading only (not yet reproduced by running the app).
**Severity:** Medium.

**What happens:** Once a manager marks a job as invoiced, the job is supposed to be locked and filed away, and only a manager may un-file it. But a regular worker who opens that invoiced job and changes its status back to "open" gets through. The job is left in a contradictory state: the system still treats it as filed-away/finished, but its status now reads "open." Two things go wrong at once — a regular worker did something only a manager should be able to do, and the job is now half-finished, half-open.

**Why it happens:** When someone changes a job's status, the only thing checked is that a regular worker isn't *setting* the status to "invoiced." Nothing checks whether the job is *already* invoiced and filed away, so every other status change sails through.

**The fix:** Refuse any status change on a job that is already invoiced/filed-away, and direct people to the proper manager-only "un-file" action instead.

**Suggested before fixing:** Write a quick test that triggers the re-open to prove it end-to-end.

---

## 2. Wrong loading spinner when two documents share a name — MINOR

- [x] Fixed

**Confidence:** High — confirmed by reading the code.
**Severity:** Low (visual glitch only, nothing is lost or mixed up).

**What happens:** In one job's paperwork, the three folders (job files, quality forms, customer property) can each hold a document with the same name. Clicking "view" on one of two same-named documents shows the loading spinner on *both* rows, and finishing one can clear the spinner on the other.

**Why it happens:** The "currently loading" mark is tracked by the document's name alone and ignores which folder it's in — even though everywhere else on the same screen correctly includes the folder.

**The fix:** Track the loading mark by folder + name, matching the rest of the screen.

---

## 3. Unhelpful error when nothing can be combined into a packet — MINOR

- [ ] Fixed

**Confidence:** High — confirmed by reading the code.
**Severity:** Low (rare, harmless).

**What happens:** On the web version (not the desktop app), if someone tries to print or save a combined PDF of a job's documents but every chosen document happens to be unreadable or was just deleted, they get a generic "something went wrong" message instead of a clear "none of these could be combined" explanation.

**The fix:** Detect the "nothing usable to combine" case and show a plain, specific message (and surface which files were skipped and why).

---

## 4. Sign-out warning disappears on mouse movement — JUDGMENT CALL, NOT CLEARLY A BUG

- [ ] Decided / actioned

**Confidence:** Intentionally downgraded — may be the intended behavior.
**Severity:** Low.

**What happens:** During the 30-second "you're about to be signed out" warning, any mouse movement silently cancels the warning and restarts the full idle clock — the person never has to click "stay signed in." On a shared workstation, a passing bump of the mouse keeps a session alive.

**Why it's a judgment call:** The project's own rules explicitly say mouse movement counts as activity, so this may be exactly the intended behavior. Decision needed: leave as-is, or require an explicit "stay signed in" click before the warning clears.

---

## Checked and cleared (NOT bugs)

Ruled out after inspection — recorded so we don't re-investigate:

- One-timer-at-a-time rule — solid, protected against double-taps and two devices.
- Job-number generation — never wastes or reuses a number, even on a failed save.
- Returned-quality-form detection — correct.
- File naming that keeps documents matched to their part — correct, can't be spoofed.
- Upload file-safety / path-traversal guards — correct.
- Sign-in lockout counting — correct.
- Search permission scopes — regular workers can't see restricted data.
- Archive-never-delete rules for customers and dropdown options — correct.
- Backup-and-restore round trip — correct.
- Job-card printout text-escaping — safe.
- A malformed part id could downgrade a part-file to a job-level file — not reachable from the real app (robustness note only).
