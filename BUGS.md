# Bug Tracker

Found during a critical codebase review on 2026-06-16. Each item has a plain-language
description (what the user experiences) plus a technical pointer for fixing.

Status legend: ☐ open · ◐ in progress · ☑ fixed

---

## High priority

### ☑ 1. Activity history lies when parts are deleted or reordered on a job
**What happens:** When you save a job, each part's work and details stay correctly
tied to that part. But the activity history compares parts by their position number
instead of their permanent identity. Delete the first part of a multi-part job (or
reorder parts) and the rest slide up a number — so the history reports edits to parts
that were never touched and can miss recording the part you actually deleted. The job
data saves correctly; only the audit trail is wrong and misleading.
**Where:** `server/src/routes/jobcard-mutations.js`, change-tracking block ~lines 458-473.
The save reconciles items by their stable `item:` id (~lines 397-426) but the change
log keys items by `item_number` / array index. Fix: key the change diff by stable id too.

### ☑ 3. Searching work-time by machine misses entries that used more than one machine
**What happens:** A time entry can list several machines together (e.g. "5, 9"). The
machine filter looks for an exact single match, so filtering for machine 5 silently
drops every entry where machine 5 was used alongside another machine.
**Where:** `server/src/routes/search.js` ~line 275: `te.machine_number = ?`.
Fix: match the comma-joined list (e.g. LIKE with boundary handling) like the `q` text
filter already does.

---

## Medium / low priority

### ☑ 2. Stopping a timer can write the record onto the wrong job
**What happens:** Stopping a timer stops the correct timer, but never checks the timer
actually belongs to the job named in the request. The "timer stopped" history entry gets
stamped onto whatever job was named. Normal use sends the right job; bites on a stale or
mismatched request.
**Where:** `server/src/routes/jobcard-time-entries.js` stop route ~lines 241-264. Every
sibling route checks `existing.jobcard_id === id`; this one doesn't. Fix: add that check
and return 404/400 on mismatch before stopping/recording history.

### ☑ 4. Renaming a dropdown option dead-ends with a confusing error
**What happens:** Renaming an option to a name matching an old *retired* (hidden) option
gives a flat "already exists" error, but the conflicting option is invisible so the admin
can't resolve it. Creating an option handles this gracefully (revives the retired one);
renaming doesn't.
**Where:** `server/src/routes/tags.js` PUT ~lines 170-174. `getByValue` returns archived
rows too. Fix: mirror the create path — if the collision is an archived row, restore/merge
it instead of erroring, or give a clearer message.

### ☑ 5. Auto-logout warning countdown can jump back to 30s after the computer wakes
**What happens:** If the screen sleeps while the logout warning is showing and then wakes,
the countdown can snap back to 30 seconds and a stray ticking timer is left running.
Logout still happens at the correct time — visual glitch + small leak, not a security hole.
**Where:** `client/src/hooks/useInactivityTimer.js` visibility handler ~lines 66-91. The
original `warningRef` timeout isn't cleared on wake, so it can re-fire and overwrite
`countdownRef`. Fix: clear `warningRef` (and dedupe the countdown) in the warning branch.

### ☑ 6. "In progress" timer dot on the job list can briefly flicker to a wrong state
**What happens:** A slow status check coming back out of order can overwrite newer state,
so the green "in progress" dot can briefly show the wrong thing.
**Where:** `client/src/hooks/useActiveTimerIndicator.js` ~lines 16-30. No in-flight /
sequence guard on the 10s poll (unlike `useTimer`'s `pollInFlightRef` and `useSearch`'s
`requestId`). Fix: add a request-sequence or in-flight guard.

### ☑ 7. A pre-filled form field meant to show zero is left blank
**What happens:** On printed/pre-filled forms, a value of zero is treated as "no value"
and skipped, so the field prints blank. Unlikely to matter for current fields (mostly text).
**Where:** `server/src/utils/pdfFiller.js` ~line 171: `if (dataKey && jobData[dataKey])`.
The item branch (~line 154) already checks `!== null/undefined/''` correctly. Fix: use the
same explicit check for standard fields.

### ☑ 8. Usernames are case-sensitive while company names are not
**What happens:** "John" and "john" can become two separate accounts, and someone who
registered as "John" can't sign in typing "john." May be intentional; inconsistent with
the rest of the app.
**Where:** `server/src/db/schema.js` `username TEXT UNIQUE NOT NULL` (no `COLLATE NOCASE`)
vs `company_name ... COLLATE NOCASE`; lookups in `routes/auth.js`. Fix (if desired): add
`COLLATE NOCASE` and normalize on create/login.

### ☑ 9. Activity-log field-name filter treats some typed characters as wildcards
**What happens:** Filtering the activity log by field name treats certain characters as
wildcards, so results can be broader than expected. Admin-only and harmless, just imprecise.
**Where:** `server/src/routes/search.js` ~line 249: `params.push(`%"${field}"%`)`. Bound
param (no SQL injection) but `%`/`_` from input act as wildcards. Fix: escape LIKE
metacharacters.

---

## Ruled out (false positives)
- **Saved grand total going stale** — the stored column is only ever written, never read
  back; the costing screen recalculates live every time. No impact.
- **Image "decompression bomb" in packet build** — the image tool already rejects
  oversized images by default.
- Various concurrency/ownership concerns — handled by the synchronous database and
  unique-constraint guards.
