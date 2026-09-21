# Instant-save job card — review fixes

Fixes for the eight findings from the code review of the instant-save work
(`tasks/instant-save-job-card.md`). Split into two work orders that touch
disjoint files so they can run at the same time.

House rules that apply to every step: writes are never re-sent automatically;
a check belonging to a named form field marks that field rather than firing a
pop-up; toasts that can repeat take a stable id; no backward-compatibility
branches; comments explain *why*, matching the density already in these files.

---

## Work order A — the parts list

Files allowed: `jobcard-system/client/src/components/jobcard/useInstantItems.js`,
`jobcard-system/client/src/components/jobcard/tabs/ItemsTab.jsx`.
Nothing else.

### A1. A new row commits when it is complete, not when its description blurs

Today `commitItemFieldBlur` is the only thing that can turn a still-local row
real, and only via `description`. The server (`server/src/routes/jobcard-items.js`,
`validateOneItem`) rejects a part with no qty, jobType, drawingsType or
customerProperty — all of which sit *below* description on screen — so the normal
top-to-bottom fill produces an error toast and then never retries, because every
other field on a local row is deliberately inert.

Change: on a still-local row, **both** `handleItemFieldChange` (dropdowns/tags)
and `commitItemFieldBlur` (text/number) merge their value over the row
(`{ ...item, [field]: value }`) and ask whether the merged row now satisfies
every entry in `REQUIRED_FIELDS` (use the existing `requiredFieldMessage` for
each — it already carries the qty whole-number rule). If it does, call
`createItemFromRow(merged)`. If it does not, do nothing at all: send nothing,
and **do not mark the box** — a part-filled new row is a normal in-progress
state, not an error (the hook header already says this).

`createItemFromRow`'s own re-check (`!row.description.trim()` → resolve) should
become the same completeness check against the live row, so a row blanked back
out while its create was queued still sends nothing.

Keep the existing behaviour for a row that is already real: emptying a required
box marks it and sends nothing.

### A2. Pending edits made while a row is being created must not be lost

An edit to a local row while its create is in flight is currently dropped — the
row still reads as not-saved, so `handleItemFieldChange` returns early.

Change: inside `createItemFromRow`'s success branch, after the row's id and
number have been swapped in, compare the row as it now stands on screen
(`lineItemsRef.current`, read *after* the await) against what the server
confirmed it stored (`buildItemPayload(created)`). For each field that differs,
call `writeItemField(created.id, field, value)`. Nothing differs in the common
case, so this normally sends nothing.

Note the ordering trap: `onItemSaved` records the server's copy as the baseline,
so a field that still differs correctly reads as unsaved until its follow-up
write lands.

### A3. Two rows added at once must not collide on line numbers

The server numbers a new part `existingItems.length + 1`; the screen numbers a
new row one past the highest on screen (`addLineItem`). Two rows in flight, the
second finishing first, produces two rows numbered 3. Line numbers drive the
timer buttons (`LineItemTimerButton` → `onStart(itemNumber)`,
`workBelongsToItem`) and the close question's wording (`closeReasons.js`), so a
duplicate points work at the wrong part.

Change, both halves:

1. Queue every row's create on **one shared chain key** (e.g. `'create'`)
   instead of `` `${localId}:create` ``, so rows are created in the order they
   were committed and the server's numbering follows the screen's order. Keep
   the per-row keys for field writes.
2. After a create lands, renumber the on-screen rows so the still-local ones
   always sit above every real one: real rows keep the number the server gave
   them; local rows take `(count of real rows) + their position among the local
   rows`. Do this in the same `setLineItems` call that swaps the id in.

### A4. The quantity box clears its mark as a valid number is typed

`clearItemFieldErrorOnType` clears on any non-blank value, and the qty box never
calls it — so a red qty mark survives until blur, unlike the description box
beside it.

Change: have `clearItemFieldErrorOnType` clear when `requiredFieldMessage(field,
value)` returns null (which covers description's non-blank rule and qty's
whole-number rule in one), and wire the qty input's `onChange` in `ItemsTab.jsx`
to call `onItemFieldType?.(item.id, 'qty', <the digits-only value>)` alongside
its existing `updateLineItem`.

---

## Work order B — the rest

Files allowed: `jobcard-system/client/src/components/jobcard/JobIdentityStrip.jsx`,
`jobcard-system/client/src/components/jobcard/JobCardModal.jsx`,
`jobcard-system/client/src/components/JobCardList.jsx`,
`jobcard-system/client/src/components/jobcard/useJobCardForm.js`,
`jobcard-system/client/src/utils/activityColors.js`.
Nothing else.

### B1. The job list refreshes after instant edits

The old whole-job Save called `onSuccess` (→ `handleModalSuccess` →
`loadJobcards()` + re-check that job's files). None of the instant writes do, and
`onClose` only re-checks files — so the list row keeps showing the old
description, priority, due date, PO number and quality level until the page is
reloaded.

Change: in `JobCardModal.jsx`, keep a ref that is set true whenever an instant
write actually lands — wrap the `markFieldSaved` / `markItemSaved` /
`markItemRemoved` callbacks passed into `useJobCardInstantSaves`, and the
assignee path, or set it in one place if there is a cleaner single seam. When the
modal closes on an existing job and that ref is true, call `onSuccess()` once and
clear the ref.

Do **not** call `onSuccess` per write — that would re-fetch the whole list on
every blur. One call on close is enough, and it already covers the file re-check
that `onClose` does separately (leave `onClose`'s own call alone; a duplicate
re-check of one job is cheap, and removing it would break the create path).

### B2. A failed priority or due-date save can be retried

`setFieldInstant('priority', …)` and the calendar's `onSelect` both guard on
"differs from what's on screen", and the screen already shows the new value after
a failed write — so re-picking the same value does nothing.

Change: compare against the stored baseline instead, exactly as the description
box two lines below already does (`formatted !== (savedForm.description ?? '')`).
Priority compares against `savedForm.priority`, the due date against
`savedForm.dueDate`. The on-screen value still updates either way; only the
decision to *write* moves to the baseline comparison.

### B3. Taking a worker off a job gets its activity colour

`server/src/routes/jobcards.js:334` records `unassign`, which is missing from
`ACTION_COLORS` — so those entries render in muted grey and the search page
offers no chip for them. The file's own header says every recorded action
belongs there.

Change: add `unassign` to `ACTION_COLORS` in
`client/src/utils/activityColors.js`, next to `assign`, taking
`var(--accent-caution)` — the convention there is red for something taken away,
matching `self_unassign` directly beside it. Insertion order decides chip order,
so put it immediately after `assign`.

### B4. A job that is still loading does not read as unsaved

Opening an existing job runs `resetForm()` (one blank local row) before
`loadJobCard()` replaces it. With `jobCardId` set, `itemsDirty` flags any
not-yet-real row, so for that window the header wears the amber unsaved ring and
Escape asks about a change nobody made.

Change: add an explicit loaded flag to `useJobCardForm` — false out of
`resetForm` and the hook's initial state, true at the end of
`setFormDataFromJobCard`. `itemsDirty` (and therefore `isDirty`) reports false
for an existing job while that flag is false. A brand-new job is unaffected: it
has no `jobCardId`, and its own path must keep reporting dirty from the first
keystroke.

Load failure is not a lingering case — `loadJobCard`'s catch closes the modal —
so nothing extra is needed for it.

---

## Gate (both orders)

- Only the files listed for your order may change.
- No new files.
- Report `git diff --stat` for your files, and map every hunk to its numbered
  step above. Anything that cannot be done as written is reported, not
  improvised.
- `cd jobcard-system/client && npx vite build` (or the project's lint) must still
  pass; say so in the report, with the output if it does not.
