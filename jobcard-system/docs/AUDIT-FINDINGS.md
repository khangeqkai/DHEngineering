# Audit Findings — Issue Tracker

Codebase audit run **2026-06-13**. Each item was verified against the actual code (one was retracted as a false alarm). Tick the box when fixed.

Status key: `[ ]` open · `[x]` fixed · `[~]` in progress · `[-]` won't fix

Each item has a **plain description** (what goes wrong for the user) and a **where to fix** pointer (for the dev work).

---

## Priority 1 — Affects everyday accuracy

- [x] **Hand-entered work time is credited to the admin, not the worker**
  - What: When an admin types in a block of work time after the fact, the hours land under the admin's name — there's no field to pick who actually did the work. Per-worker time and labour reports come out wrong.
  - Where: `server/src/routes/jobcard-time-entries.js` (manual add ~line 275 stamps `req.user.userId`). Add a worker-select field; validate it's a real user; record that user as the entry owner. Mirror on the manual-edit path.
  - Severity: High (everyday data accuracy)

- [ ] **Deleting/renaming a dropdown option can freeze the jobs that use it**
  - What: Only "treatment" options are protected from being deleted/renamed while jobs still use them. Job-type, material, drawing, and customer-property options have no protection. Remove or rename one and every job still using it holds an unrecognised value — those jobs then refuse to save on the next edit, and the option shows blank.
  - Where: `server/src/routes/tags.js` (DELETE ~line 193, PUT ~line 153 only guard `category === 'treatment'`). Extend the in-use guard to all by-value categories (job_type, material, drawings, customer_property). Need usage-count queries that match the comma-separated lists on `job_items`.
  - Severity: High

---

## Priority 2 — Undermines the "all files present before invoicing?" gate

- [ ] **The "drawing attached" safety net can be fooled by a file's name**
  - What: The system decides a part has its drawing by searching for the part's hidden code *anywhere* in a file's name. Since the uploader picks the visible name, a file named to contain another part's code makes the system believe that other part is covered — and can let a job slip past the "invoice anyway, files missing" warning with a genuinely missing drawing.
  - Where: `server/src/routes/jobcard-helpers.js` `hasItemFile` (~line 48-53) uses `name.includes('[pCODE]')`. Match the code only at the END of the base name (where the upload route writes it), optionally followed by ` (n)`, before the extension.
  - Severity: High

- [ ] **A returned quality form can be faked by any upload**
  - What: A job's quality form counts as "returned/completed" if *any* file sits in the quality folder that isn't a blank template. Uploading any unrelated file (or an extra blank template) into that folder falsely clears the "missing quality form" warning.
  - Where: `server/src/routes/jobcard-helpers.js` (~line 132-137) detects returned forms as "not equal to a template name." Detect by a positive marker the upload route always adds (the timestamp tag) instead.
  - Severity: Medium-High

---

## Priority 3 — Soundness gaps (mostly need an unusual/crafted request)

- [ ] **A job card can be created with no parts on it**
  - What: Nothing requires at least one line item. An empty job can be created, burning a permanent job number with nothing to work on.
  - Where: `server/src/routes/jobcard-mutations.js` create route (~line 58-92). Reject `!Array.isArray(items) || items.length === 0` before consuming a number.
  - Severity: Medium

- [ ] **"N/A — nothing supplied" can be saved alongside a real drawing selection**
  - What: On screen, picking "N/A" for a part's drawing or customer property clears everything else (either/or). The server doesn't enforce that, so a request bypassing the screen can save both "N/A" and a real value on the same part — a contradictory record.
  - Where: `server/src/middleware/validation.js` `validateItemTagList` (~line 480). Reject when the N/A value appears together with any other value.
  - Severity: Medium

- [ ] **Several treatments plus junk data can be forced onto one part**
  - What: The screen allows one treatment+supplier per part; the server accepts any number and stores whatever extra hidden fields were sent, as-is. A crafted request can pile multiple treatments and arbitrary junk onto one part, flowing into costing, printed forms, and history.
  - Where: `server/src/middleware/validation.js` `validateItemTreatments` (~line 367, no length cap) and `serializeTreatments` in `jobcard-helpers.js` (~line 242, blind `JSON.stringify`). Cap at one entry; rebuild each saved treatment from only the known fields (force `otherText` empty unless value is OTHER).
  - Severity: Medium

- [ ] **Quantities aren't validated at all**
  - What: A part's quantity has no check — negative, fractional, or non-numeric values can be saved, throwing off the scrap-rate math and quantity displays.
  - Where: No quantity validator exists in `server/src/middleware/validation.js`; create/update store `item.qty || null`. Add a non-negative-integer validator (treat blank/garbage as null), like the scrap-clamp pattern.
  - Severity: Medium

- [ ] **Uploaded file names aren't fully cleaned**
  - What: Upload names are only checked for slashes and ".." — not hidden control characters or characters Windows forbids. A bad name can make the save misbehave on a Windows server.
  - Where: `server/src/routes/jobcard-files.js` `validateUploadBody`/`validateFilenameParam` (~line 221-245) and `buildStorageFilename` (~line 150). Reject control chars; run the display name through a filename sanitizer (strip `<>:"/\|?*`, trailing dots/spaces, reserved device names).
  - Severity: Medium

- [ ] **Unrelated database errors get mislabeled as "timer already running"**
  - What: On a manual time entry, any database constraint failure is reported to the user as a timer conflict, even when that's not the cause.
  - Where: `server/src/routes/jobcard-time-entries.js` `isOpenTimerConflict` (~line 48) matches the whole `SQLITE_CONSTRAINT` family. Narrow it to the one-active-timer unique-index violation.
  - Severity: Low

- [ ] **The two save paths enforce "only admins can invoice" differently**
  - What: One path blocks non-admins from setting "invoiced" unconditionally; the other relies on a separate field-restriction. Not exploitable today, just inconsistent — a future change could open a gap.
  - Where: `server/src/routes/jobcards.js` (~line 245) vs `jobcard-mutations.js` PUT guard. Mirror the unconditional invoiced-is-admin-only check on both.
  - Severity: Low (defensive)

- [ ] **Searching by machine misses any block that lists more than one machine**
  - What: A work block can record several machines together (e.g. "5, 9"). Searching for machine "5" only matches blocks where 5 is the *only* machine — any block listing 5 alongside others is skipped. So a machine search silently under-reports the work done on that machine. This is wrong behaviour, not just a quirk: the results look complete but aren't.
  - Where: `server/src/routes/search.js` (~line 275, `te.machine_number = ?`). The field is a comma-joined list, so an exact match is wrong. Match the machine as one item within the list (e.g. a list-membership check), not the whole field.
  - Severity: Medium

- [ ] **Search treats `%` and `_` as wildcards**
  - What: Typing `%` or `_` into search behaves as a wildcard instead of literal text. Harmless, just a search-quality quirk. Not a security hole (queries are parameterised).
  - Where: `server/src/routes/search.js` (multiple `LIKE ?` clauses). Escape `%`/`_`/`\` in the term and add `ESCAPE '\'`.
  - Severity: Low (quality)

---

## Priority 4 — "Stop and switch" timer (real but recoverable)

- [ ] **"Stop and switch" can leave a worker with no running timer**
  - What: When a worker stops one timer to start another and the new start fails, the screen shows a generic error and no timer runs. The stopped block IS saved and the worker can just press start again, so it's recoverable. The real bite is narrow: the same worker racing on two devices, where one loses the single-timer slot.
  - Where: `client/src/components/jobcard/useTimer.js` `submitEntryForm` (~line 213-224) — on start failure, re-offer the stop-and-switch conflict flow instead of a dead-end toast.
  - Severity: Medium

---

## Low confidence — not fully re-traced (all minor)

- [ ] **Activity log may drop a part if two parts reuse the same number**
  - Where: `server/src/routes/jobcard-mutations.js` audit-log maps keyed by client-supplied item number (~line 176, 460). Key by position instead. *(Not independently re-verified.)*

- [ ] **A backup taken during active saving could capture files and records a split-second apart**
  - Where: `server/src/routes/settings.js` export (~line 189-213) walks files and reads tables at different moments with no write-lock. Hold writes for the export window. *(Plausible, narrow.)*

- [ ] **Part codes could collide if two IDs differ only in punctuation**
  - Where: `server/src/utils/folderCreation.js` `idSlug` strips non-alphanumerics; the file-id validator allows `:` and `-`. Very unlikely with current ID generation. *(Theoretical.)*

---

## Retracted — false alarm (no action)

- [-] **~~A backwards finish time subtracts hours~~** — RETRACTED 2026-06-13.
  - The app rejects any finish time not strictly later than the start, and stores all times on one universal clock, so a backwards block can't be created through the app. Only a manual database edit could produce one. The total-hours math has no negative guard, but since nothing can create a negative block, it's harmless. (Optional hardening only: clamp the per-block hours to ≥ 0.)

---

## What's solid (verified, no action needed)

- One-timer-at-a-time is enforced at the database level — two simultaneous starts can't both win.
- Job numbers can't be duplicated by simultaneous creates; a failed create never wastes a number.
- Customer details are properly frozen onto the job and hidden from non-admins (no bypass found).
- No way to delete a customer (archive only); their files never strand.
- Search hides other people's data and the admin-only areas from regular users.
- Backup ZIPs are safe from path-escape attacks; restore is all-or-nothing.
- No missing authorisation or privilege-escalation holes on any route.
