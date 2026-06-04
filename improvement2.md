# Project Review — Improvements List (Round 2)

A plain-language list of problems found in a second review pass, ordered so we can
work through them **one at a time, top to bottom**. Every item below was
double-checked by a separate verification pass that read the actual code — none
were false alarms, and none overlap with anything already fixed in
`IMPROVEMENTS-REVIEW.md`.

**Fix order:** Items 1–8 affect data integrity, privacy, or hardware, so they come
first. Items 9–11 are account/login security (waiting on a decision about how far
to go). Items 12–15 are smaller polish fixes.

Status key: ⬜ = not started · 🔵 = in progress · ✅ = done

---

## Security & data integrity (do these first)

### 1. Any worker can change or erase anyone's recorded work time — ✅
- **Problem:** When someone adds, edits, or deletes a finished block of logged work
  time, the system never checks whether that time belongs to them or whether they're
  an admin. So a regular worker can quietly rewrite the quantity, machine,
  description, or start/finish times on *someone else's* finished work — or delete it
  outright — on any job, even one they were never put on. Only the live "stop my own
  timer" action checks who owns it; the by-hand add/edit/delete paths don't.
- **Why it matters:** Logged time feeds the labour hours and the job's cost totals, so
  this lets one person silently change another person's pay-relevant records and the
  job's costs, with the change attributed to the wrong person in the history.
- **Decision (from you):** Lock the by-hand add, edit, and delete of finished time
  records to **admins only**. Regular workers keep using their own Start/Stop timer.
- **After:** A regular worker can no longer touch anyone's finished time records;
  only admins can add, edit, or delete them.

### 2. Customer name, phone, and email leak to regular workers through a job's history — ✅
- **Problem:** Customer details are supposed to be completely hidden from regular
  workers. The live customer section of a job *is* blanked out for them — but a job's
  **history list** is not. Whenever an admin changes a customer's name, company,
  phone, or email on a job, the system records the old and new values into that job's
  history. When a regular worker opens that same job's history, those exact values are
  handed over untouched. So the customer's real name and phone can be read straight
  out of the history, even though the main customer section is blanked.
- **Note:** This is a *different* leak from the supplier phone/email one already fixed
  earlier — that was about suppliers; this is about customers, through the history,
  and is still wide open.
- **Solution:** Blank out customer details in the history for regular workers, the
  same way the live customer section already is.
- **After:** A regular worker's view of a job's history no longer shows any customer
  name, company, phone, or email.

### 3. The camera can be left running after you close the job — ✅
- **Problem:** If a worker opens the camera to take a photo and then closes the whole
  job window (instead of first backing out of the camera view), the camera is never
  switched off. The webcam stays active and the camera light stays lit until the app
  is refreshed.
- **Why it matters:** Privacy and trust — a camera silently left on is alarming, and
  it ties up the camera so other programs can't use it.
- **Solution:** Always switch the camera off when the camera view goes away, no matter
  how it's closed.
- **After:** Closing the job (or the camera menu) any way at all turns the camera off
  immediately.

### 4. Hand-typed start/finish times can be calculated wrong — ✅
- **Problem:** A time block created by the live timer is stored with full date, time,
  and time-zone information. A time block typed in by hand is stored with no time
  zone. As long as a block is *entirely* hand-typed (or *entirely* from the timer),
  the duration comes out right. But if a single block ever mixes the two — for
  example, a worker starts the timer, then an admin edits that same block and the
  finish time gets re-saved in the hand-typed format — the calculated duration comes
  out wrong by exactly your time-zone's offset (several hours).
- **Why it matters:** That wrong duration flows straight into the labour hours and the
  job's cost totals. (This is separate from the earlier fix that checks finish-comes-
  after-start; that check doesn't catch this and doesn't fix the storage mismatch.)
- **Solution:** Store every time block the same way — with full time-zone information —
  so a block's two ends can never be in different formats.
- **After:** Durations are correct whether a block came from the timer, was typed by
  hand, or was started one way and edited the other.

### 5. Scanned-in files aren't checked for type, and can reach outside the scanner folder — ⬜
- **Problem (two parts):**
  1. A file pulled in from the scanner is saved no matter what kind of file it is. The
     regular upload path checks that a file is an image or PDF; the scanner path
     doesn't. Anything that isn't an image or PDF then silently disappears from the
     Files list (the list only shows known types), so it looks like the file vanished
     while junk quietly piles up on disk.
  2. The scanner import is only supposed to pull files from the configured scanner
     folder. But if a *shortcut* is placed in that folder pointing somewhere else on
     the computer, the import follows the shortcut and copies that outside file in,
     where any logged-in user can then download it.
- **Solution:** Check scanned files for type the same way uploads are checked, and
  refuse shortcuts that point outside the scanner folder.
- **After:** Only real image/PDF files from inside the scanner folder can be brought
  in; nothing else gets saved or becomes a way to reach other files on the machine.

### 6. Two fast taps on "Start" can leave a timer running forever — ✅
- **Problem:** The "only one timer at a time" rule is enforced by checking for an
  existing timer and then starting a new one as two separate steps. If two start
  requests arrive almost together (a double-tap, or two devices), both can pass the
  check before either one starts, leaving the worker with two running timers. The
  extra one is then effectively invisible and keeps piling up hours that never stop.
- **Solution:** Make starting a timer a single all-or-nothing step so a second timer
  can never slip through, and make sure the system always picks a definite "current"
  timer rather than an arbitrary one when looking it up.
- **After:** A worker can only ever have one running timer; rapid taps or two devices
  can't create a hidden second one.

### 7. Restoring a backup wipes everything before the files are safely in place — ⬜
- **Problem:** Restoring from a backup first erases all existing records and puts the
  backup's records in, and only *then* copies the saved files back into the job
  folders. If that file copy fails partway through (disk full, a locked file, a
  permission error), the old data is already gone and you're left with restored
  records but missing or partial files, with no way back.
- **Solution:** Stage and verify the file copy so the destructive wipe doesn't leave
  you stranded if the files can't all be restored — either get the whole thing back or
  keep what you had.
- **After:** A failed restore can no longer leave you with wiped data and missing
  files.

### 8. A treatment can be sent to a supplier that doesn't offer it — ⬜
- **Problem:** When a job line needs a treatment, the person picks a supplier for it.
  The system only checks that *some* supplier was picked — it never checks that the
  chosen supplier actually performs that treatment (or that the supplier even exists).
  So a job can be saved sending, say, "Anodising" to a supplier who has nothing to do
  with anodising.
- **Solution:** When saving, confirm the chosen supplier is real and actually offers
  the treatment it's being assigned to, and refuse with a clear message if not.
- **After:** A treatment can only be assigned to a supplier that genuinely offers it.

---

## Account & login security (pending your decision on how far to go)

These three are real but may be acceptable trade-offs on a trusted local network —
that's why they're held back from the first batch. Tell me which to do.

### 9. A deactivated worker stays logged in — ⬜ (pending)
- **Problem:** Turning off (deactivating) a worker's account blocks them from logging
  in again, but if they already have the app open, their current session keeps fully
  working until they close it on their own — potentially for days.
- **Possible fix:** Check the account is still active on each action, and cut off the
  session the moment the account is turned off.

### 10. Resetting a PIN doesn't end the old session — ⬜ (pending)
- **Problem:** If you reset a worker's PIN (say it was shared or leaked), anyone
  already logged in with the old PIN stays logged in. Changing the PIN doesn't kick
  out the existing session — only a fresh login replaces it.
- **Possible fix:** End any existing session when a PIN is changed or reset, forcing a
  new login.

### 11. Weak resistance to PIN guessing — ⬜ (pending)
- **Problem:** A PIN is only 4 digits (10,000 possibilities). After 5 wrong guesses,
  each further wrong guess just forces a fixed 30-second wait — forever, with no
  escalation and no "too many attempts, locked" stop. Someone with time and access to
  the login screen could keep grinding guesses at a steady pace.
- **Possible fix:** Add a real lockout after enough failures, and/or allow longer
  PINs. (This is more of a policy choice than the other two.)

---

## Smaller polish fixes

### 12. A failed quality-form copy only shows a small warning — ⬜
- **Problem:** When a job is created (or its quality level changes), the quality
  inspection forms are copied onto disk afterward. If that copy fails (template
  missing, disk error), the job still saves and the screen shows only a small,
  easy-to-miss warning. The worker may print or scan expecting forms that were never
  made, and there's no record it failed and no retry.
- **Solution:** Make the failure harder to miss and record that it happened, so it can
  be noticed and re-tried rather than silently passed over.

### 13. A new job's history doesn't record its line items or who was assigned — ✅
- **Problem:** When a job is first created, its history only remembers the job number,
  status, priority, and quality level. It never records what line items the job
  started with or who was assigned at the start — even though later edits are tracked
  in detail. So you can't look back and see what the job originally contained.
- **Solution:** Record the starting line items and assignees in the job's history at
  creation, matching the detail kept for later edits.

### 14. Search filter dropdowns can silently stay empty — ✅
- **Problem:** The search screen's filter dropdowns (workers, machines, quality
  levels, job types) load once when the screen opens. If that one load fails (a brief
  network hiccup), the dropdowns stay empty for the whole session with no error shown
  and no retry.
- **Solution:** Show a problem and allow a retry when the filter options fail to load,
  instead of leaving them silently blank.

### 15. The "repeat job" flag shows as 1/0 in the history instead of Yes/No — ✅
- **Problem:** In a job's history, a change to the "repeat job" setting shows raw
  values (1 and 0) instead of a friendly "Yes"/"No".
- **Solution:** Show the repeat-job change as Yes/No in the history, like the other
  fields.

---

## Reviewed — intentional, no change needed

### Un-archiving an invoiced job keeps it marked "Invoiced" — ✅ decided, leave as-is
- A job marked invoiced is auto-archived. Pulling it back out of the archive leaves
  its status as "Invoiced." This was reviewed and **you decided to keep it that way**,
  so no change. (For reference: it does not silently re-archive itself on a normal
  save — it would only re-archive if someone changed the status away from "Invoiced"
  and then back to it.)
