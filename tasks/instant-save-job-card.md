# Instant save on the job card — retiring the Save button

Frozen spec. Executors implement against this; it is not a discussion document.
Planning background: `~/.claude/plans/replicated-skipping-castle.md`.

## Why

The job screen holds a picture of the job, and Save stamps that whole picture over whatever
the job has become since. Two ingredients make that dangerous: **the gap** between deciding
and sending (the Save button *is* the gap), and **the width** (Save says "here is the whole
job, replace yours", so the gap flattens what the user didn't touch).

It surfaces first in the people list, because that is the one thing two writers both touch —
the person ticking names, and the timers. A worker credited by a timer mid-save gets stuck on
screen, and the next Save writes them onto a job whose work was thrown away.

Most of the screen already works the other way: status, costing, files, comments, timers and
self-assign are all instant. Only the details fields, the parts list and the people list still
sit behind Save.

## Governing rule

**Narrow and immediate.** Send only the thing that changed, at the moment it changes. Every
write introduced here names one field, one row, or one worker, and never carries a neighbour
along with it. Autosaving a whole-job payload on a timer is *not* an acceptable substitute —
it reproduces the same bug with a shorter fuse.

## Fixed decisions — do not revisit

1. Existing jobs lose the Save button entirely. Creating a new job keeps one.
2. Activity trail: one entry per change, each with its own timestamp. No grouping.
3. Text boxes write on blur only. Never while typing.
4. A failed write keeps what the user typed, flags that field, and still warns before closing,
   refreshing or being signed out for idleness. Writes are never re-sent automatically.
5. Writes are optimistic: the screen updates immediately, only failures surface.

---

## Stage 1 — server routes

Five new routes. Nothing on screen changes; the existing Save keeps working throughout.

All live in `jobcard-system/server/src/routes/`. Assignee routes go in `jobcards.js` beside
their self-equivalents; item routes go in `jobcard-mutations.js`.

### 1a. `PUT /jobcards/:id/assignees/:userId` — put one worker on the job

Mirror `POST /:id/assignees/self` (`jobcards.js:146-199`) exactly, with these differences:

- `requireManagement` instead of `authenticate`.
- The worker is `req.params.userId`, not `req.user.userId`. 404 if that user doesn't exist.
- History action `'assign'`, changes `{ assignees: { from: <names>, to: <names> } }` — same
  comma-joined name shape the self routes use, `'none'` when empty.
- Idempotent: already assigned → 200 with the current list, no history.
- Keep the `SQLITE_CONSTRAINT_UNIQUE` swallow — `UNIQUE(jobcard_id, user_id)` is the
  concurrency guard and a racing timer auto-assign will hit it.
- Response shape identical to the self routes: `{ assignees: [{ id, userId, userName, username }] }`.

### 1b. `DELETE /jobcards/:id/assignees/:userId` — take one worker off

Mirror `DELETE /:id/assignees/self` (`jobcards.js:202-238`). Same differences as 1a. History
action `'unassign'`. Idempotent: not assigned → 200 with the current list, no history.

### 1c. `POST /jobcards/:id/items` — add one part

- `requireManagement`. 404 if the job doesn't exist. 409 if the job is archived (match how the
  existing update route rejects edits to an archived job).
- Body is one item: `{ qty, description, jobType, material, treatments, drawingsType, customerProperty }`.
- Validate by calling the existing validators with a one-element array:
  `validateItemDescriptions([item])`, `validateItemQuantities([item])`,
  `validateItemJobTypes([item], existingItems)`, `validateItemTreatments([item], existingItems)`,
  `validateItemMaterials([item], existingItems)`, `validateItemDrawings([item], existingItems)`,
  `validateItemCustomerProperty([item], existingItems)` — all from `middleware/validation.js`.
  Pass `existingItems` so the grandfathering of since-archived tag values still applies.
  400 with the validator's message on failure.
- Insert with `jobItemQueries.create` using `item:${uuidv4()}` and `item_number` = current
  count + 1. Use `serializeTreatments` from `jobcard-helpers.js`.
- History: `recordHistory('jobcard', id, 'update', ...)` with
  `{ ['item #' + n + ' added']: { from: null, to: itemSummary(...) } }`, using `itemSummary`
  from `jobcard-audit-text.js` — the same key shape the bulk route produces today.
- Return the created row in the API's camelCase shape.

### 1d. `PATCH /jobcards/:id/items/:itemId` — change one part

- `requireManagement`. 404 if the job or the item doesn't exist, or the item belongs to a
  different job.
- Partial body. **Absent means unchanged** — the same rule the job route already uses
  (`jobcard-mutations.js:425-434`). Merge the body over the stored row, then validate the
  merged item with the same one-element-array calls as 1c.
- Write with `jobItemQueries.updateById`, passing the row's existing `item_number` unchanged —
  this route never moves a part.
- History: `{ ['item #' + n]: { from: itemSummary(before), to: itemSummary(after) } }`, and
  **skip the history call entirely if the summary is unchanged**.

### 1e. `DELETE /jobcards/:id/items/:itemId` — remove one part

- `requireManagement`. 404 as above.
- Keep the logged-work guard from `jobcard-mutations.js:340-355`: if
  `timeEntryQueries.countByItemId.get(itemId).count > 0`, return 400 with the same wording
  style — "Cannot remove line N — time is logged against it. Clear that time first."
- Refuse to delete the last remaining part: 400, "A job must have at least one line."
- Delete with `jobItemQueries.deleteById`, then **renumber the remaining rows** 1..n in their
  current `item_number` order via `jobItemQueries.updateById`. Do the delete and the renumber
  in one `db.transaction`.
- History: `{ ['item #' + n + ' removed']: { from: itemSummary(before), to: null } }`.

### Stage 1 gate

- Allowed files: `server/src/routes/jobcards.js`, `server/src/routes/jobcard-mutations.js`,
  and `docs/notes/api-reference.md` + `docs/notes/jobs-and-status.md` for the route lists.
- No changes to `db/queries/jobcard.js` — every statement needed already exists.
- No client changes in this stage.
- Nothing removed from `PUT /jobcards/:id` yet — that happens in stage 4.

---

## Stage 2 — the people list goes instant

- `toggleAssignee` (`client/src/components/jobcard/useJobCardForm.js:111-120`) writes
  immediately on an existing job via the stage-1 routes; stays local on a new job.
- `creditAssignee` / `dropAssignee` become plain screen updates — the server already wrote,
  the screen is only catching up.
- **Delete `hasPendingChangeFor`** (lines 126-130) and the baseline juggling inside
  `creditAssignee` (149-151) and `dropAssignee` (160-162). This is the reported bug.
- Per-worker in-flight chaining so a fast tick/untick of the same worker settles on the last
  intent. Copy the chaining shape from `useCosting.js:293-303`.
- `buildJobcardPayload` stops sending `assigneeIds` on update (keeps it on create).

## Stage 3 — the details fields go instant

Extract `useInstantSave` — one write at a time per key, last intent wins, per-key state of
`idle | saving | saved | failed`. Model it on `useCosting.js` minus the debounce.

| Field | Where | Writes on |
|---|---|---|
| Status | `JobIdentityStrip.jsx:166` | already instant — leave alone |
| Priority, Due date | `JobIdentityStrip.jsx` | change |
| Description | `JobIdentityStrip.jsx:254-257` | blur, after `capitalizeFirst` |
| PO Number, Quote Reference, Previous Job Reference | `tabs/DetailsTab.jsx:305,309,350` | blur, after blur-formatting |
| Quality Level | `tabs/DetailsTab.jsx:313-331` | change |
| Repeat Job | `tabs/DetailsTab.jsx:336-343` | change |

Each write sends **one field** to `PUT /jobcards/:id`, which already treats an absent field as
unchanged. `JobIdentityStrip.jsx:100-103` already branches on `!isEdit` — that branch is the seam.

Customer fields stay frozen read-only on an existing job. Unchanged.

## Stage 4 — the parts list, then the Save button

- A new row stays local until its description is filled, then is created via 1c and replaces
  the placeholder id (`makeEmptyLineItem`, `useJobCardForm.js:5-15`) with the real `item:` id.
- Every other control on a persisted row writes via 1d on change (dropdowns, tags) or blur
  (text, quantity). Removing a row calls 1e; on refusal the row stays and the reason shows.
- Closes a latent bug: `ItemsTab.jsx:267-282` renders the timer button on never-saved rows, so
  starting a timer there sends a part number the server doesn't know.
- Remove the Save button for existing jobs. Delete from `useJobCardForm.js`: `saved`,
  `savedRef`, `liveRef`, `snapshotForm`/`snapshotAssignees`/`snapshotItems`, `captureSent`,
  and `markSaved` in full (274-350). Delete the conflict toast path in `useJobCardSave.js` and
  `mapAssigneeFromApi` in `mappers.js` (already dead).
- Strip the `items` and `assigneeIds` branches from `PUT /jobcards/:id` (436-486).
- **Keep the screen-vs-stored comparison exactly as it is.** Earlier drafts of this spec called
  it legacy machinery to be re-pointed at failure flags. That was wrong, and inventing per-write
  "failed" flags would be strictly worse. Every baseline in `useJobCardForm.js` now moves **only
  when a write actually succeeds** — `markFieldSaved`, `markItemSaved`, `markItemRemoved`, and
  `toggleAssignee`'s success branch. So `isDirty` already means precisely *"something on this
  screen has not reached the job"*, and it covers every case at once with no new state:
  a write that failed (baseline never moved), a required box left empty (never sent), a
  half-typed local row, and a tick that failed. Do **not** replace it. `useUnsavedGuard.js`,
  `hasUnsavedWork`, `hasWorkToLose`, the close confirm, `beforeunload`, the Electron
  `will-prevent-unload` handler, `registerUnsavedWork` and the inactivity text all stay and all
  keep working. `hasWorkToLose` keeps adding `costingDirty`.
- **What does change is the wording** — see the close-question split below. `hasIncompleteItem`
  from `useInstantItems` and the job description's own mark in `JobIdentityStrip.jsx` are there
  to let the question say *which* thing is outstanding, not to replace the comparison.
- `client/scripts/check-confirmQueue.mjs` stays; swap its unsaved-changes example for another
  confirm pair.
- **The close question must stop conflating "didn't save" with "isn't filled in".** Today both
  get `"This job card has changes that haven't been saved yet. Close it and lose them?"`
  (`useUnsavedGuard.js:75-85`). For an empty required box that sentence is **untrue**: nothing
  was ever sent, the stored value stands, and closing costs the user nothing. Warning about a
  loss that isn't happening is exactly the surprise this question exists to prevent. Split it:

  **a) A required box is empty** — nothing is at risk, so do not talk about losing anything.
  Name the box, say the stored value survives, and offer to go fix it:

  > **Job description can't be empty**
  > It hasn't been saved, so the job keeps the description it already has.
  > → `Close anyway` / `Fix it`

  For a part, name which: *"Line 2 needs a description"*, *"Line 3 needs a quantity"*. More than
  one empty box → list them. `confirmVariant` is **warning**, not danger — nothing is being
  destroyed. **`Fix it` must put the cursor in the offending box**, not just return to the
  screen: `scrollFieldIntoView` in `hooks/useFieldErrors.js` already does this for a
  submit-time mark, so reuse it rather than writing another.

  **b) A write failed** — here work really is at risk, so the existing wording is right. Keep
  "close and lose them", keep `confirmVariant: 'danger'`, and name what failed
  (*"The due date couldn't be saved."*) rather than saying "changes".

  **c) An unposted comment / an open stop-timer form** — unchanged in substance, but they should
  say which of the two it is for the same reason.

  Where both (a) and (b) are outstanding, (b) wins the framing — something really is at risk —
  and (a) is mentioned as a second line.
- **A started-but-not-yet-real part row counts as outstanding work too.** A row added with
  "Add Item" stays local until its description commits it, and `useInstantItems` deliberately
  never *marks* a local row (a fresh row starts blank by design, that is not an error). So
  `hasIncompleteItem` is false for it, while `itemsDirty` is true. If 4b re-points
  `hasUnsavedWork` at `failedWrite || hasIncompleteItem || comment || stop-form` and stops
  there, closing with a half-filled new row would no longer ask, and the typed work would go
  without a word. Fold in "a local row with anything typed into it" explicitly — an untouched
  blank row is not work and must not trigger it.
- **An emptied required box counts as outstanding work.** Stage 3 and 4a both mark the field and
  send nothing (see the rule below), which today happens to register as unsaved only because the
  old screen-vs-baseline comparison notices the difference. That is an accident of the machinery
  being replaced, so 4b must fold it in deliberately — the parts list reports it upward, and the
  job description's own mark lives in `JobIdentityStrip.jsx`.

### The required-box rule (already implemented in stages 3 and 4a — do not regress it)

A required box that is emptied is **marked on the field and not sent**; the stored value stands
until a valid one is typed. Never let an emptied box reach the server and come back 400 — that
leaves screen and job disagreeing and reports a failure for what is an incomplete edit. Marking
the field rather than firing a pop-up is the house rule (`hooks/useFieldErrors.js` +
`common/FieldError.jsx`), and the two must never both fire for one failure. Applies to the job's
own description and to a part's description, quantity, job type, drawings and customer property.
The upshot is that a cleared box can no longer destroy a value — stricter than the old Save
button, which blocked the whole job over one empty field.

## Docs to update as each stage lands

`docs/notes/client-patterns.md` (the unsaved-snapshot paragraph is superseded),
`docs/notes/jobs-and-status.md` (Assignees section), `docs/notes/api-reference.md`, `CLAUDE.md`
(the invariant list).
