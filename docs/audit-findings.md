# Code Audit — Findings & Fix Tracker

Audit date: 2026-06-15. Scope: full codebase bug/logic-flaw sweep, each finding re-verified
against the actual code (false positives removed). Plain-language summaries are in each item;
technical pointers are included so fixes are actionable.

Severity legend: 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low / edge case

---

## Verified — to fix

### 1. 🟡 Account changes slip through during a backup restore
- [x] Fixed
- **What happens:** While a restore is running, the system blocks everyone's changes — except it
  lets the *entire* sign-in area through. That also covers creating/editing/deactivating user
  accounts and changing PINs, all of which write to the users table. A change made in that window
  can be lost or clash with the restore.
- **Where:** `server/src/middleware/maintenance.js:24` — `req.path.startsWith('/api/auth')` exempts
  the whole auth namespace, not just login/logout/me.
- **Fix idea:** Narrow the exemption to the read/session routes actually needed during restore
  (e.g. `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`), so user-table mutations are still
  blocked.
- **Notes:** Window is short and admin-initiated, but it defeats the guard's whole purpose.

### 2. 🟢 A corrupt or cut-off upload is saved as if it were fine
- [x] Fixed
- **What happens:** If an upload arrives corrupted/truncated, it's still written under a normal name
  and counts as the part's attached drawing, so the "missing drawing" warning clears. The breakage
  only surfaces later when someone opens or prints it (where it's silently skipped in a packet).
- **Where:** `server/src/routes/jobcard-files.js:385` (`Buffer.from(fileData, 'base64')`) and
  `server/src/routes/jobcard-printout.js:108` — Node's base64 decode never throws; it drops invalid
  chars and truncates.
- **Fix idea:** Validate the base64 round-trips cleanly before writing (re-encode and compare, or
  reject on length mismatch), and/or verify the decoded bytes match the claimed type.
- **Notes:** Needs a genuinely broken upload to trigger.

### 3. 🟢 False "an admin stopped your timer" popup
- [ ] Fixed
- **What happens:** If two background timer-checks overlap (a single check taking >5s on a slow
  connection) at the moment you stop your own timer, the second check sees the timer gone and wrongly
  reports an admin stopped it.
- **Where:** `client/src/components/jobcard/useTimer.js:64-83` — `selfStoppedRef.current` is reset to
  false inside the poll callback; overlapping in-flight polls race on the single flag.
- **Fix idea:** Add an in-flight guard so only one check runs at a time, or don't reset the
  self-stopped flag until the timer is confirmed cleared.
- **Notes:** Rare; requires >5s poll latency.

### 4. 🟢 Auto-logout countdown can tick erratically after sleep/wake
- [ ] Fixed
- **What happens:** If the machine sleeps just before the 30-second warning and wakes inside it, two
  countdowns can briefly run at once and the displayed number jumps. The actual logout still fires at
  the correct time.
- **Where:** `client/src/hooks/useInactivityTimer.js:77-88` — the wake handler's warning branch clears
  only `countdownRef`, not the still-pending `warningRef`; if that overdue warning timeout fires after
  the handler, it starts a second countdown interval.
- **Fix idea:** Clear `warningRef` (and `timeoutRef` as appropriate) in the wake handler before
  rebuilding the countdown — i.e. fully reset the warning timers, not just the countdown interval.
- **Notes:** Platform/timing dependent.

### 5. 🟢 Rapid switch between two job cards can show the wrong details
- [ ] Fixed
- **What happens:** Jump straight from one card to another without closing, and if the first card's
  data arrives last, it overwrites the second card on screen.
- **Where:** `client/src/components/jobcard/JobCardModal.jsx:91-128` (`loadJobCard`) — no
  request-supersession / ignore flag, so the last response to *resolve* wins, not the last *requested*.
- **Fix idea:** Add an ignore flag (or AbortController) so a load only applies if `jobCardId` still
  matches when it resolves.
- **Notes:** Normal flow closes one card before opening another, so hard to hit.

---

## Minor / by-design — note, decide later

### 6. 🟢 4-digit PIN brute-force exposure
- [ ] Addressed / Won't fix
- Only a per-machine slowdown guards a 10,000-combination space, with no overall account lockout
  (partly by design). Relevant for the default `admin` / `1234`.
- **Where:** `server/src/middleware/validation.js:196`, `server/src/routes/auth.js:25-37,86`.

### 7. 🟢 Reused "Completed Form N" number after deleting the latest one
- [ ] Addressed / Won't fix
- Deleting the highest-numbered returned quality form makes the next scanned form reuse that number.
  Files don't collide (timestamp tag), so this is cosmetic.
- **Where:** `server/src/routes/jobcard-files.js:172-188` (`nextQaFormNumber`).

### 8. 🟢 Account-active re-check is conditional on the token's session marker
- [ ] Addressed / Won't fix
- The "is this account still active / still the current session" check only runs when the sign-in
  token carries a session marker. Every token issued today has one, so there's no live hole — but it
  would be safer made unconditional so a stale/odd token can never skip it.
- **Where:** `server/src/middleware/auth.js:26`.

---

## Retracted (verified false positives — kept for the record)

- **Retired treatments appearing for new work** — picker uses the active-only options list
  (`useTags` filters `!archived`), so an archived treatment can't reappear even though
  `getForSupplier` still returns it. (`client/.../LineItemTreatment.jsx:36-48`, `hooks/useTags.js:49`)
- **Negative labour hours from a bad admin time edit** — validation rejects any finish time not after
  the start; a blank finish just makes the entry an open timer (counts as zero), never negative.
  (`server/src/middleware/validation.js:330-333`)
- **Camera stays black after "Try again"** — every path to the retry button first sets the
  camera-active flag false, so the next start is a real off→on transition that rebinds the video.
  (`client/.../useCamera.js:31-53`)
- **Combined-print memory exhaustion** — the total-size ceiling is a deliberate limit and the image
  library refuses oversized images by default; not a real defect.
  (`server/.../jobcard-printout.js:114-138`, `pdfPacket.js`)

---

## Verified correct (no action)

Job-number assignment is atomic under concurrent creates · the invoice "missing attachments" gate
runs before any save · contact details are frozen at creation and stripped on every update · file
path-traversal guards hold · the single-active-timer rule is enforced atomically · search filters are
parameterized (no injection) · pagination math is correct.
