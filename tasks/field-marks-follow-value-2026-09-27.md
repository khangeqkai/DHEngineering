# Field marks follow the box's value — 2026-09-27

Frozen spec. House rules in CLAUDE.md apply (field errors via hooks/useFieldErrors.js +
common/FieldError.jsx; never a mark and a pop-up for one failure; update
docs/notes/client-patterns.md where it describes field errors, and the CLAUDE.md "Client
error handling" bullet if its wording about clearing becomes wrong).

## The cause
A red mark is removed only by hand-written `clearFieldError(name)` calls, almost all in
`onChange`. Any other way a box's content changes (picking a saved person fills Phone,
changing customer, a reset link, a server reply, a part being removed) leaves a stale mark,
and every new path needs its own clearing line. Example: new job → bad phone → Create →
Phone marked → pick a saved person (good number filled in) → mark stays.

## The fix — a mark belongs to the text it was raised against
`hooks/useFieldErrors.js`:

1. Signature `useFieldErrors(valueOf)`. `valueOf(name)` returns what the box for mark
   `name` holds right now. Required — every caller passes one. Held in a ref internally so
   a new function each render is fine.
2. `setFieldErrors(errors, raisedAgainst?)` stores, per name, `{ message, value }`, where
   `value` is `raisedAgainst?.[name]` if given, else `valueOf(name)` at the moment of the
   call. The optional second argument is for code that judged a specific text it already
   has in hand (e.g. the pricing sheet judging a draft).
3. A mark is **live** while `same(valueOf(name), stored.value)`. `same` compares
   `null`/`undefined`/`''` as equal, numbers and strings by `String(v)`, and arrays/objects
   by `JSON.stringify`. Once the box holds anything else — however it got there — the mark
   is not shown, not counted and not announced. If the box later returns to exactly the
   judged text, the mark shows again (that text really was refused).
4. `fieldErrors` returned by the hook contains only live marks (plain `{ name: message }`
   shape, as today), so `groupClass`, `errorFor`, `fieldProps`, and anything counting
   `Object.keys(fieldErrors)` all see live marks only. Stale stored marks may be pruned
   lazily; no timers.
5. **Delete `clearFieldError`** from the hook and from every caller, including props that
   only pass it down (e.g. DetailsTab's `clearContactFieldError`). A call that exists only
   because a value changed simply goes.
6. `clearAll()` stays, for exactly two purposes: a new form session (the form is opened,
   switched to another record, or reset to blank — otherwise a mark raised against `''`
   would greet the next blank form) and after a successful submit. Every remaining
   `clearAll` call must be one of those; state which in a short comment if not obvious.
   A `clearAll` that exists only because a value changed goes.
7. Update the hook's header comment to state the rule in one or two sentences.

## Migrating the callers
Every file using the hook (grep `useFieldErrors`): QALevelManagement.jsx, Statistics.jsx,
UserManagement.jsx, common/InlineSupplierForm.jsx, jobcard/JobIdentityStrip.jsx,
jobcard/JobCardModal.jsx, jobcard/useCosting.js, jobcard/useInstantItems.js,
jobcard/useJobCardSave.js, jobcard/useTimeEntries.js, jobcard/useUnsavedGuard.js,
jobcard/tabs/ItemsTab.jsx, jobcard/tabs/LineItemTagSelect.jsx, jobcard/tabs/TimeEntryForm.jsx,
settings/labour/MultiplierInputs.jsx, settings/labour/DefaultRateCard.jsx,
settings/labour/TimezoneCard.jsx, statistics/StatisticsHeader.jsx, hooks/useLabourRates.js,
hooks/useSettings.js — plus any file that receives the hook's pieces as props.

For each: pass a `valueOf` that maps the mark's name to the box's current value (mark names
don't always equal state keys — e.g. `contactPhone` → `contactFormData.phone`; per-part keys
built by `fieldErrorKey(itemId, field)` → that part's field; costing → the box's shown
value, i.e. its draft if one exists, else the committed figure). Then remove the clearing
calls per steps 5–6.

Special cases:
- **Pricing sheet (useCosting.js).** `commitBox` raises a mark against the raw draft text:
  `setFieldErrors({ [name]: msg }, { [name]: raw })`. Delete its `clearFieldError` calls
  and those in revertField/reset links/discard. `costingInvalid` and
  `firstInvalidCostingField` read the live `fieldErrors`. Behaviour after the change: a red
  box loses its mark as soon as the person edits it, and is judged again when they leave
  it (commitBox). `guardLeaveCosting`/`flushCosting` still work because `commitAllBoxes`
  re-judges every draft synchronously and returns the first invalid name itself.
  `discardCostingDrafts` keeps `clearAll` (it is a reset).
- **A mark that is not about any box's content** (e.g. a whole-row or whole-form problem):
  if you find one, report it with its file:line instead of forcing it into this model.

## Must not change
- What each form checks, its messages, when it checks (submit / leave), scroll-into-view,
  and the aria wiring.
- The new-job contact boxes still get server refusals mapped onto them (useJobCardSave.js).

## Verification
No npm/build/server runs (node_modules is shared with a running Windows install). Parse-check
each touched file with `client/node_modules/.bin/esbuild --loader:.js=jsx --loader:.jsx=jsx
<file> > /dev/null`. `grep -rn "clearFieldError" client/src` must return nothing.
Report: per file what changed, every remaining `clearAll` with its purpose, anything
reported instead of changed, `git diff --stat`.
