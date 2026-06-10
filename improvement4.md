# Project Review — Improvements List (Round 4)

A plain-language list of problems found in a fourth review pass. The whole codebase
was swept for bugs across sign-in, timers, job editing, files, search, settings and
the database, then every finding was put through a separate verification pass that
read the actual code to weed out false alarms. The items below are the ones that
survived that check; the false alarms are listed at the bottom so the record is
honest about what was looked at.

**Fix order:** Items 1–3 are real, user-facing problems and should be the first
batch — item 1 in particular can quietly corrupt records, so it leads. Items 4–10
are smaller — edge cases, accuracy quirks, and housekeeping.

Status key: ⬜ = not started · 🔵 = in progress · ✅ = done

---

## Real problems (fix these first)

### 1. Editing a job's lines moves recorded work onto the wrong line — ✅
- **Problem:** Each job is made up of numbered lines (line 1, line 2, line 3…).
  When workers log time, scrapped pieces, or run a live timer, that work is remembered
  only by the line's **position number** — not the line itself. Whenever an admin edits
  the list of lines on a job, the system throws away all the lines and rebuilds them,
  renumbering from 1 again. Nothing protects a line that already has work logged against
  it. So if an admin deletes a line in the middle, or reorders them, every line below
  shifts up a number — and all the work that was logged against those lines silently
  re-attaches to whichever line now sits at that number. A running timer can even end
  up pointing at a line that no longer exists.
- **Why it matters:** It quietly corrupts real records. A worker's hours and scrap
  counts end up filed against the wrong part, with no warning to anyone and no sign
  afterward that anything moved. On a job that's been worked for days, a single tidy-up
  edit can scramble the whole time history.
- **Cause:** The link between recorded work and a line is just a position number, and
  editing a job rebuilds and renumbers all lines from scratch with no check for lines
  that already carry logged work.
- **Solution:** Give each line a stable identity that recorded work points to, so a
  line's work follows it even when other lines are added, removed, or reordered — or,
  at minimum, refuse to delete or reorder a line that already has time logged against
  it and warn the admin, the same way quality levels already protect themselves.
- **After:** Editing a job's lines never silently moves a worker's recorded hours or
  scrap onto a different line.

### 2. Typing a new search while past the first page shows "no results" — ✅
- **Problem:** On the search screen, results past the first page are split into pages.
  Every time you change a filter, the screen sensibly jumps back to page 1 — but typing
  a new search in the box does **not**. So if you've paged through to, say, page 3 of one
  search and then type a brand-new search, the new search runs against page 3. If the new
  search only has enough matches to fill one page, the screen shows "No results" — and a
  stuck "Page 3 of 1" — even though the matches are sitting right there on page 1.
- **Why it matters:** It makes a working search look broken. The person assumes nothing
  matched and gives up, when in fact their results were one click away the whole time.
- **Cause:** Changing a filter resets the page back to the first one, but changing the
  search text was never wired up to do the same.
- **Solution:** Reset back to the first page whenever the search text changes, exactly
  like the filters already do.
- **After:** Typing a new search always starts from the first page, so results show up
  instead of a misleading empty page.

### 3. A deleted piece of equipment's number can never be used again — ✅
- **Problem:** Deleting a piece of equipment doesn't truly remove it — it just hides it
  from the list. But its number stays reserved behind the scenes. So if you later try to
  add a new piece of equipment with that same number, you're blocked with "already
  exists" — even though nothing visible is using it. And unlike suppliers, which can be
  brought back after deletion, there's no way to reactivate a hidden piece of equipment.
  The number is dead for good.
- **Why it matters:** Equipment numbers usually map to real machines on the floor with
  fixed labels. If a machine's record is deleted and later needs to be re-added under its
  real number, it simply can't be — with no explanation of why the number is taken.
- **Cause:** Deletion only marks equipment as hidden, the "is this number already taken?"
  check counts hidden equipment too, and there's no option to bring hidden equipment back.
- **Solution:** Either let an admin reactivate hidden equipment (as suppliers already
  allow), or ignore hidden equipment when checking whether a number is free — ideally
  both.
- **After:** A deleted equipment number can be reused, or the original brought back,
  instead of being locked away forever.

---

## Smaller fixes

### 4. A tag named only with symbols or emoji breaks silently — ✅
- **Problem:** When an admin adds a new option to a dropdown list (a treatment, material,
  job type, and so on), the system only checks that the name isn't blank. But behind the
  scenes it strips the name down to plain letters and numbers to use as its internal key.
  A name made entirely of symbols or emoji — like "★★★" — passes the not-blank check but
  leaves a completely empty internal key. The first such option saves with a blank key;
  the next one collides and is rejected as "already exists," and a blank treatment option
  can never actually be matched to a job line afterward.
- **Why it matters:** It's confusing and slightly corrupting — an option that looks saved
  but can't be used, and a baffling "already exists" error on a name that's clearly new.
- **Solution:** After stripping the name down, check that something is left; if not,
  reject it with a clear message asking for a name with at least some letters or numbers.
- **After:** Every saved option has a usable internal key, and symbol-only names are
  refused up front with a helpful message.

### 5. Saving the assigned-people list hides real errors — ⬜
- **Problem:** When an admin sets who's assigned to a job, the save step is meant to
  quietly ignore the harmless case of the same person being listed twice. But it actually
  ignores **every** kind of failure. If something genuinely goes wrong while adding a
  person, that person is silently dropped and the save still reports success.
- **Why it matters:** An admin can believe they've assigned someone when that person was
  quietly left off, with no error to alert them.
- **Solution:** Only ignore the genuine duplicate case; let any other failure surface as
  a real error, the way the self-assign action already does.
- **After:** A failed assignment shows an error instead of pretending to have worked.

### 6. Admins can't fix a scrap count after a worker submits it — ⬜
- **Problem:** When a worker stops their timer they enter how many pieces were scrapped.
  If they mistype it, there's no way to correct it: the admin's edit form for a time
  entry has no scrap field at all.
- **Why it matters:** A wrong scrap number is baked in permanently and quietly skews the
  job's scrap totals and scrap-rate figures, with no way to put it right.
- **Solution:** Add a scrap field to the admin's time-entry edit form so a mistyped count
  can be corrected.
- **After:** Admins can fix a scrap count that was entered wrong.

### 7. Entering "0 completed" is treated as blank and discarded — ⬜
- **Problem:** A genuine "0 pieces completed" (for example, a run where everything was
  scrapped) is treated the same as leaving the field empty, and isn't recorded.
- **Why it matters:** A real and meaningful result — zero good pieces — is silently lost,
  which understates what actually happened on the job.
- **Solution:** Treat a typed-in zero as a real value rather than as "nothing entered."
- **After:** "0 completed" is recorded as the real outcome it is.

### 8. A quality form that can't be pre-filled is reported as if it filled fine — ⬜
- **Problem:** When a job is given a quality level, its inspection forms are copied into
  the job's folder with the job's details already filled in. If one of those form files is
  faulty and can't be filled, the system quietly copies a **blank** version instead and
  still counts it as fully done — the worker gets an empty form with no warning that the
  details are missing. (This only happens with a genuinely faulty form file, so it's rare.)
- **Why it matters:** A worker can print and use a form believing the job details on it
  are correct, when in fact it's blank.
- **Solution:** When a form can't be pre-filled, flag it so the user is told that form
  needs filling in by hand, instead of reporting it as a clean success.
- **After:** Workers are warned when a quality form came out blank rather than pre-filled.

### 9. An unused "quote reference" is carried around but appears nowhere — ⬜
- **Problem:** Each job quietly carries a "quote reference" value that is loaded and held
  in memory, but it appears on no screen and can never be viewed or edited. It's leftover,
  dead detail.
- **Why it matters:** No harm today, but it's confusing leftover baggage that suggests a
  feature exists when it doesn't.
- **Solution:** Either show and let people edit the quote reference, or remove it. Given
  it's unused, removing it is the cleaner choice.
- **After:** The job form only carries details that are actually used.

### 10. Housekeeping — small waste and dead code — ⬜
- **Problem:** A handful of minor inefficiencies and leftovers: opening any job fetches
  its three file folders straight away just to show small count badges, even if no one
  opens the files menu; the camera preview can keep checking forever on a device that
  stalls; and there are a few pieces of pure dead code (an unused timer function, a
  settings pointer aimed at the wrong database location, a duplicate database index, a
  redundant logging tweak, and the same database upgrade step written in two places).
- **Why it matters:** None of it breaks anything today, but it's wasted effort over the
  office network and quiet traps for whoever works on this next.
- **Solution:** Trim the dead code, fetch the file counts only when the files menu is
  actually opened, and make sure the camera preview check stops if a device never starts.
- **After:** Less wasted work behind the scenes and fewer stale leftovers to trip over.

---

## Reviewed — false alarms, no change needed

These were flagged during the sweep and then **ruled out** by the verification pass.
They're recorded here so it's clear they were considered.

### Job numbers getting duplicated or skipped — not a bug
- The concern was that two people creating jobs at once, or a failed create, could waste
  or double a job number. On closer look, creating a job already happens as one all-or-
  nothing step — the number is only used up if the whole job saves successfully — so this
  can't happen. **No change.**

### Deleting a customer breaking the jobs that used them — not a bug
- The concern was that deleting a customer would leave their jobs pointing at nothing.
  On closer look the system already detaches those jobs from the customer first, then
  deletes — so nothing is left dangling. **No change.**

### A switched-off or replaced person staying signed in — not a bug in practice
- The concern was that the "are you still allowed in?" check could be skipped for an
  older sign-in. On closer look, every sign-in always carries the marker that check
  relies on, sign-ins only live in memory and vanish when the app closes, and there are
  no leftover older ones — so the check always runs. **No change.**

### A job being created with no lines at all — already blocked on screen
- The concern was that a job could be saved with zero lines. The normal screen already
  refuses to save a job without at least one line, so a real user can't do this. Only an
  abnormal, direct request could slip an empty one through — a minor belt-and-suspenders
  gap on the back end, not something anyone hits in normal use. **No change for now.**

### Time records being wiped on startup — dormant, won't fire in normal use
- The concern was a startup step that clears all time records. It's a one-time cleanup
  from a past change, locked behind a saved marker, and will not run again under normal
  operation. It could only re-fire in the unusual case where a restore brought back time
  records without that marker. Worth being aware of, but **no change** unless that
  restore edge case ever proves to be a real risk.
