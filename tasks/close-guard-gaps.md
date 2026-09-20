# Spec — close the gaps the review found

A review of the job screen's unsaved-edits work turned up four defects in changes that
were already reported as finished. Each is a must-fix. Client-only; no server routes,
no schema, no history records change.

---

## Step 1 — A brand-new job card is never protected

`useJobCardForm.js:46-48` leaves the comparison baseline `null` until a job is loaded
from the server, and `isDirty` returns false whenever it is null (`:55`). A new job card
never loads, so `isDirty` is permanently false on it.

That was harmless when the only consumer was a chip reading "unsaved edits" — a card
that has never been saved has nothing to report. It is not harmless now:
`handleRequestClose` (`JobCardModal.jsx:330-346`) trusts `isDirty` to decide whether to
ask before closing. So a half-filled **new** job card still closes on Escape with no
question and everything gone — the exact case the guard was built for.

Fix: give a new card a baseline of the pristine empty form, so that an untouched new
card still reports clean (nothing must turn the frame amber the instant the card opens)
but a typed-in one reports dirty.

1. In `useJobCardForm.js`, set `saved` from the same starting values the hook's own
   initial state uses — the default form data, an empty assignee list, and the single
   empty part row from `makeEmptyLineItem(1)` — rather than leaving it `null`. Take the
   snapshots through the existing `snapshotForm` / `snapshotAssignees` / `snapshotItems`
   so the comparison is like-for-like.
2. `resetForm` (`:204`) currently nulls the baseline. It must set the same pristine
   baseline instead, so a second new card behaves like the first.
3. Confirm by reading, and report: opening a brand-new card leaves `isDirty` false, and
   typing one character into the description makes it true.
4. Rewrite the comment at `:46-47`, which currently explains the old null behaviour.

**One known gap to handle or report, not to ignore.** On a new job the customer fields
live in a different hook's state (`contactHook.contactFormData`), which this snapshot
does not cover at all. So typing only a customer name and nothing else would still
close without asking. Fold the contact form into the dirty comparison if it can be done
cleanly — it needs the contact state passed into `useJobCardForm`, or the dirty check
lifted to where both hooks are in scope (`JobCardModal.jsx`). If either shape turns out
to be invasive, **stop, leave it out, and report which shape you tried and why you
stopped.** Do not restructure the hooks on your own initiative.

---

## Step 2 — A part edited while a save is in flight is destroyed, and the screen says it saved

`captureSent` (`useJobCardForm.js:178-181`) snapshots the form and the assignees but not
the parts. `markSaved` (`:188-197`) then takes the parts baseline from the server's
reply *and* overwrites what is on screen with it (`setLineItems(items)`).

So: press Update, edit a part's description while the spinner is up, and the save
returns — the edit vanishes from the screen and the amber frame clears. The screen
reports saved when the last keystrokes were thrown away. The comment directly above
`captureSent` (`:176-177`) claims the opposite ("anything typed in the meantime has to
stay marked unsaved — measuring against what came back would quietly swallow it"), so
the code contradicts its own stated intent.

This also breaks a rule the project already wrote down —
`docs/notes/client-patterns.md:21`: *"A refresh mid-edit must merge, never replace,
unsaved form state."* The fix is the one that rule already prescribes.

1. In `markSaved`, stop replacing the on-screen rows with the reply. Adopt **only the
   stored ids** from the reply onto the rows already on screen, matching reply row to
   screen row by position, and leave every other value as the user has it. The reply's
   order matches what was sent, which is the on-screen order — verify that holds and say
   how you verified it.
2. Take the parts baseline from what was **sent**, consistent with the form and the
   assignees: add a parts snapshot to `captureSent` and use it in `markSaved`.
3. The reason the reply was being adopted at all still stands and must not be lost:
   a part added on screen carries a temporary id until it is saved, and logged work is
   matched to a part by its stored id. Adopting the ids is the whole point — keep that
   working, and keep the comment explaining why.
4. If the reply comes back with a different number of rows than are on screen, do not
   guess: fall back to today's behaviour of taking the reply wholesale, and leave a
   comment saying why. That case means the server changed the set, not the user.

---

## Step 3 — A save that hangs makes the job window impossible to close

`handleRequestClose` (`JobCardModal.jsx:331-332`) returns immediately whenever `saving`
is true. On a slow or dropped connection the spinner stays up and Escape and the X both
do nothing at all, with no way out but restarting the app — which loses the form anyway.

Remove the `if (saving) return;` early return and let the normal path run, so a save in
flight is confirmed against like any other unsaved state. Closing does not cancel the
request: it continues and its own message still lands. Confirm that by reading the save
flow and say so.

Keep the rest of the guard exactly as it is.

---

## Step 4 — Two comments now contradict the code

1. `useJobCardCosting.js:9` — the file's opening comment still says the job's pricing is
   fetched "lazily". It now loads as soon as an admin opens an existing job. Correct the
   wording; do not change any behaviour.
2. `useJobCardForm.js:193-194` — `sent?.form ?? …` and `sent?.assignees ?? …` can never
   fire, because the single caller always passes `sent`. That reads as a
   backward-compatibility branch, which the house rules forbid in live code. Make `sent`
   a required argument and drop both fallbacks.

---

## Documentation

`docs/notes/client-patterns.md` currently claims the snapshot taken at save time is the
one that went out, "not the one that comes back", so anything typed mid-flight stays
marked unsaved. Step 2 is what makes that true. After Step 2, re-read that paragraph and
correct anything still inaccurate — in particular it should now say that the reply's
stored ids are merged onto the rows on screen rather than replacing them, and it should
no longer imply parts are exempt. Also add that a brand-new card is measured against a
pristine empty form (Step 1), and note the customer-fields gap if Step 1 left it open.

---

## Gate

Allowed files — nothing outside this list:

- `jobcard-system/client/src/components/jobcard/useJobCardForm.js`
- `jobcard-system/client/src/components/jobcard/JobCardModal.jsx`
- `jobcard-system/client/src/components/jobcard/useJobCardCosting.js`
- `docs/notes/client-patterns.md`

Expected shape: a pristine baseline and a reworked `markSaved` and `captureSent` in
`useJobCardForm.js`; one early return removed from `JobCardModal.jsx` (plus whatever
Step 1's contact-form decision requires, if you judged it clean); two comments corrected;
one paragraph rewritten in the notes.

Do **not** touch `JobIdentityStrip.jsx`, `CostingTab.jsx`, `useCosting.js`, `App.css`,
`BottomSheet.jsx` or `JobCardModal.css` — all four steps are reachable without them.

Report back with:
- `git diff --stat` pasted in full
- Each step mapped to what you changed, one or two lines each
- Every "confirm / report / verify" the steps asked for, quoting `path:line`
- Anything you stopped on rather than improvising, and why
- Confirmation that `npm run build` in `jobcard-system/client` succeeds

Do not run the app, do not commit.
