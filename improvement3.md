# Project Review — Improvements List (Round 3)

A plain-language list of problems found in a third review pass. The whole codebase
was swept for bugs, then every finding was put through a separate verification pass
that read the actual code to weed out false alarms. The items below are the ones
that survived that check; the false alarms are listed at the bottom so the record is
honest about what was looked at.

**Fix order:** Items 1–2 are real, user-facing problems and should be the first
batch. Items 3–4 are smaller — one is a minor accuracy quirk, one is housekeeping.

Status key: ⬜ = not started · 🔵 = in progress · ✅ = done

---

## Real problems (fix these first)

### 1. The "you've been signed out" message only works once — ✅
- **Problem:** Sometimes the system needs to force someone out — because an admin
  turned their account off, or because they signed in from another computer. When
  that happens the person is meant to see a clear message and be sent back to the
  login screen automatically. This works the **first** time. But after that, if the
  same person logs back in on that same computer and later needs to be signed out
  again, **nothing happens**: no message appears and they're not sent to the login
  screen. The screen just silently stops working — every button quietly fails — until
  they manually refresh the page.
- **Why it matters:** This is the safety net for shared workstations. On a machine
  that gets used and re-used by different people all day, the very situation it's
  meant to protect against (a leaked or replaced login) is exactly when it goes
  silent, leaving someone stuck on a dead screen with no idea why.
- **Cause:** The sign-out handler is set up a single time when the app first starts,
  and it's permanently cleared the first time it fires. Nothing ever sets it back up
  again — not even logging in afresh.
- **Solution:** Keep the sign-out handler available for every forced sign-out, not
  just the first — either stop clearing it once it fires, or set it up again each
  time someone logs in.
- **After:** The "you've been signed out" message and the automatic return to the
  login screen work every time a forced sign-out happens, no matter how many times
  the same computer has been used during the session.

### 2. Deleting or renaming a treatment breaks jobs that already used it — ✅
- **Problem:** Each treatment on a job remembers which treatment type it is by name.
  When an admin removes a treatment from the master list — or renames it — the system
  doesn't check whether any jobs are still using it, and gives no warning. Jobs that
  already had that treatment keep pointing at the old one, which no longer exists. On
  those jobs the treatment can no longer be shown as a recognised option, and the
  link to the supplier who handles it is lost.
- **Why it matters:** It quietly corrupts existing job records. An admin tidying up
  the treatment list has no way to know they're about to strand treatments on real
  jobs, and there's nothing afterward to flag or fix the broken ones.
- **Note:** The quality-level feature already does the right thing here — it *blocks*
  deletion and warns the admin when any job is still using that level. Treatments
  should behave the same way; right now they don't, which is the clearest sign this
  guard was simply missed.
- **Solution:** Before deleting or renaming a treatment, check whether any job still
  uses it. If one does, refuse with a clear message naming the problem — the same way
  quality levels already protect themselves.
- **After:** An admin can't silently break existing jobs by removing or renaming a
  treatment those jobs depend on; they're warned at the one moment they can act on it.

---

## Smaller fixes

### 3. The cost screen records a worked-hours "change" against the admin who only opened it — ✅
- **Problem:** The worked hours on a job are added up automatically from the workers'
  timers. Whenever an admin opens and saves the pricing screen — even without touching
  the hours — the system notices the stored hours total has moved (because workers
  logged more time since last save) and writes a "worked hours changed" line into the
  job's history with the admin's name on it.
- **Why it matters:** The history then suggests the admin edited the hours when all
  they did was view and save the pricing. It's not *false* information — the stored
  total genuinely did refresh — but it pins an automatic recalculation on a person who
  never changed it, which muddies the audit trail.
- **Solution:** Either don't log the automatic worked-hours refresh as a person's
  edit, or label it clearly as an automatic recalculation rather than a manual change.
- **After:** The history no longer implies an admin hand-edited the worked hours when
  they only opened and saved the pricing screen.

### 4. Two separate copies of the logic that lists a job's time entries — ✅
- **Problem:** The main job window has its own private copy of the logic that decides
  how a job's time entries are shown, instead of using the shared one that's meant to
  be the single source. The two copies are identical today, so nothing is visibly
  broken.
- **Why it matters:** It's a quiet trap for later. If someone adds a new detail to
  time entries in the shared place, it silently won't show up in the main job window,
  because that window is still reading from its own out-of-date copy.
- **Solution:** Have the main job window use the shared logic instead of its own copy,
  so the two can't drift apart.
- **After:** There's one place that decides how time entries are shown, and every
  screen stays in step automatically.

---

## Reviewed — false alarms, no change needed

These two were flagged during the sweep and then **ruled out** by the verification
pass. They're recorded here so it's clear they were considered.

### A time entry with the same start and finish time is rejected — not a bug
- The concern was that an entry whose start and finish are identical gets refused. On
  closer look this can't happen through the normal Start/Stop timer (the stop is
  always a moment after the start), and the only way to trigger it is an admin hand-
  typing the exact same start and finish minute — which would be a zero-length,
  meaningless entry. Refusing it is reasonable, so **no change**.

### The login wait keeps growing and never eases off while someone keeps trying — works as intended
- The concern was that the wait after repeated wrong PINs never decays. This is a
  deliberate, documented design: the wait escalates (30 seconds → 1 → 2 → 5 minutes)
  and *does* reset after 15 minutes with no failed attempts. Someone actively grinding
  guesses isn't "inactive," so keeping them waiting is the whole point. **No code
  change** — the only thing worth tidying is the project's written description, which
  still mentions a flat 30-second wait instead of the escalating one that's actually
  in place.
