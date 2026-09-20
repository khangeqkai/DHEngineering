# Spec — closing guard, unsaved-edits frame, money-entry safety

Three changes to the job card screen and the pricing screen. Client-only; no server
routes, no schema, no history records change.

Background: `useJobCardForm.js` already keeps a snapshot of the job as last loaded or
saved and exposes `isDirty`, and `JobIdentityStrip.jsx` already renders an "Unsaved
edits" chip off it. Status is deliberately excluded from that snapshot because
choosing a status sends itself — that stays true and is not being changed. What
changes is where the unsaved signal is shown, plus a closing guard and three
safety fixes on the pricing screen.

---

## Step 1 — Closing the job card asks before throwing away edits

Today `BottomSheet` closes on Escape (`BottomSheet.jsx:29-32`) and on the header X
(`:117-123`) by calling `onClose()` directly, and `JobCardList.jsx:546-553` just hides
the window. A part-finished job card is lost with no question.

Do **not** change `BottomSheet.jsx` or `JobCardList.jsx` for this. The guard belongs in
`JobCardModal.jsx`, which already holds both `formHook.isDirty` and `showConfirm`
(`JobCardModal.jsx:53`).

1. In `JobCardModal.jsx`, add a `handleRequestClose` callback (use `useCallback`):
   - If `saving` is true, return without closing (a save is already in flight).
   - If `formHook.isDirty` is false, call the incoming `onClose()` and return.
   - Otherwise `await showConfirm({ ... })` with exactly:
     - `title: 'Unsaved changes'`
     - `message: "This job card has changes that haven't been saved yet. Close it and lose them?"`
     - `confirmLabel: 'Discard changes'`
     - `cancelLabel: 'Keep editing'`
     - `confirmVariant: 'danger'`
   - On `false`, return without closing. On `true`, call `onClose()`.
2. Pass `onClose={handleRequestClose}` to `<BottomSheet>` (`JobCardModal.jsx:351-368`)
   in place of the raw `onClose`. This covers Escape and the header X in one place,
   because both go through the same prop.

**Check before you write:** `docs/notes/client-patterns.md:19` says the job screen
saves pending pricing edits on the way out, and that the save needs the job id. Find
that on-close pricing flush and confirm the guard runs *before* it and does not skip
it when the user chooses "Keep editing". If the flush is wired to the `onClose` prop
or to an unmount effect, say so in your report rather than rearranging it.

`ConfirmDialog` already focuses Cancel by default, so "Keep editing" is the focused
button. That is correct here — do not change it.

---

## Step 2 — Move the unsaved signal from the title bar to the window frame

The chip sits in an already-crowded title bar and is easy to miss. Replace it with an
amber frame around the whole job window, plus a wording change on the save button so
the signal is not carried by colour alone.

### 2a. `BottomSheet.jsx` — let a caller mark the window

Add one optional prop, `unsaved = false`. When true, add the class `modal-unsaved` to
the dialog element alongside `modal-popup modal-${size}`. Nothing else in `BottomSheet`
changes. Do not add any other class hook, and do not accept a free-form className.

### 2b. `App.css` — the frame

On the existing `.modal-popup` rule (`App.css:1152`), add a transition for
`border-color` and `box-shadow` only, at `var(--duration-normal) var(--ease-smooth)`.
Do not transition width, height or any other layout property.

Add a new rule after the size variants:

```css
/* A job card with edits that no Save has sent yet. The frame carries the signal so
   the title bar stays clear; the ring is drawn outside the border so nothing shifts. */
.modal-popup.modal-unsaved {
  border-color: var(--warning-color);
  box-shadow:
    0 0 0 2px var(--warning-color),
    0 0 0 7px rgba(var(--warning-rgb), 0.16),
    var(--shadow-lg);
}
```

Rules this must respect:
- `--warning-color` and `--warning-rgb` both already flip for dark mode via
  `:root.dark-mode`, so no separate dark rule is needed. Confirm it reads correctly in
  both themes and say so in your report.
- No new `@keyframes`, no pulse, no animation. Every pulsing thing in this app means
  "something is running right now"; this does not. The transition above is the only
  motion.
- Do not touch `.modal-overlay`, and do not change any border *width* — a width change
  shifts the content inside the window.

### 2c. `JobCardModal.jsx` — wire it up and reword the button

- Pass `unsaved={formHook.isDirty}` to `<BottomSheet>`.
- Stop passing `hasUnsavedEdits` to `<JobIdentityStrip>` (`JobCardModal.jsx:341`).
- In the footer button (`JobCardModal.jsx:484-490`), change only the label logic: when
  saving it still reads "Saving...", on a new card it still reads "Create", and on an
  existing card it reads **"Save changes"** when `formHook.isDirty` and **"Update"**
  when not. The button stays enabled in every case — do not add a `disabled` on the
  clean state, because the save flow also flushes pricing and resolves a new customer.

### 2d. Delete the old chip

- `JobIdentityStrip.jsx`: remove the `hasUnsavedEdits` prop from the signature
  (`:22`), remove the chip JSX and its comment (`:150-157`).
- `JobCardModal.css`: delete the `.jc-strip-unsaved` and `.jc-strip-unsaved-dot` rules
  (`:45-67`).
- Grep the client for `hasUnsavedEdits`, `jc-strip-unsaved` and `jc-strip-unsaved-dot`
  afterwards and confirm zero hits remain. Leaving them "for reference" is not allowed.

---

## Step 3 — Money-entry safety on the pricing screen

Three separate fixes, all in the pricing area.

### 3a. A mouse wheel must not change a price

Every money and hours box on the pricing screen is `type="number"`, and there is no
wheel guard anywhere in the client. In Chrome, wheeling over a focused number box
changes its value — and the screen writes itself to the server about a second later.

In `CostingTab.jsx`, define one handler near the top of the component:

```js
// A wheel over a focused number box changes its value in Chrome, and this sheet saves
// itself a second later. Drop focus instead so scrolling the page stays scrolling.
const blurOnWheel = (e) => e.currentTarget.blur();
```

Attach `onWheel={blurOnWheel}` to **every** `type="number"` input in the file — the
recon found them at `:321, 373, 380, 395, 402, 418, 425` plus the one at `:227`;
verify the full set yourself with a grep of the file rather than trusting that list.
Leave the text + `inputMode="decimal"` multiplier boxes (`:193-204`) alone; they are
already safe.

Also grep the rest of `client/src` for `type="number"` and report — do not change —
any that sit outside the pricing screen, with `path:line`. They are out of scope for
this task.

### 3b. A changed money line offers a way back

`resetAllLabour` (`CostingTab.jsx:171-174`) only resets tier hours and multipliers. The
manual money lines — materials cost and subcontractor cost, plus any margin or special
labour figure on the same footing — have no way back once typed over.

1. In `useCosting.js`, confirm whether `loadedRef` (`:120`) is refreshed on a successful
   save. If it is not, refresh it there so it always holds the last figure the server
   accepted. Report which it was.
2. Expose the last-saved value for the manual money fields, and in `CostingTab.jsx`
   render a small revert control beside a field whose current value differs from it:
   the text "was $X" followed by a link button reading "put it back", which sets the
   field back to that value and lets the normal autosave carry it.
3. Match the existing pattern exactly rather than inventing one: `.tier-foot-edited`
   with its `.tier-dot` and a `btn-link` (`CostingTab.jsx:354-363`). Reuse those class
   names and their existing rules where they fit; add new rules only for positioning,
   and put them next to the existing ones in `JobCardModal.css`.
4. The control disappears when the value matches the last saved figure.

Keep this to the manual money fields. Do not add it to the tier hours or multipliers,
which "Reset all to auto" already covers.

### 3c. The invoice confirmation shows the total being committed

`JobIdentityStrip.jsx:98-108` confirms invoicing with "This will archive the job card.
Continue?" — no customer, no total.

1. `JobCardModal.jsx` already passes `costingDirty={isAdmin ? costingHook.costingDirty : false}`
   (`:344`). Pass the grand total the same way and with the same gate:
   `grandTotal={isAdmin ? costingHook.totals.grandTotal : null}` — check the real path to
   the total on the hook first (`useCosting.js:228-243` computes `totals.grandTotal`).
2. In `JobIdentityStrip.jsx`, accept `grandTotal = null` and, when it is a number, add
   the total to the confirm message on its own line, formatted the same way the pricing
   screen formats money (`CostingTab.jsx:7-8`, `en-AU`, two decimals). Use the shared
   formatter if one exists in `utils/formatters.js`; if not, do not copy the local one
   into a second file — report it and leave the formatting where it is.
3. **Permissions matter here.** A manager may not see pricing at all, so when
   `grandTotal` is null the message must read exactly as it does today, with no total
   line and no empty placeholder. Both existing branches of that message (the plain one
   and the "you have unsaved costing changes" one) need the same treatment.

---

## Documentation

`docs/notes/client-patterns.md:25` describes the "Unsaved edits" chip in the job
screen's header. Step 2 makes that wrong. Update that paragraph in the same commit:
the signal is now an amber frame around the whole window plus the "Save changes"
button wording, and the three things the snapshot deliberately does not count (status,
a worker the server added on its own, part ids) stay exactly as written. Add a
sentence that closing a job card with unsaved edits now asks first.

If Step 3 changes how `loadedRef` behaves, check whether
`docs/notes/time-and-costing.md` describes it and update that too.

---

## Gate

Allowed files — nothing outside this list:

- `jobcard-system/client/src/components/jobcard/JobCardModal.jsx`
- `jobcard-system/client/src/components/jobcard/JobIdentityStrip.jsx`
- `jobcard-system/client/src/components/jobcard/JobCardModal.css`
- `jobcard-system/client/src/components/jobcard/tabs/CostingTab.jsx`
- `jobcard-system/client/src/components/jobcard/useCosting.js`
- `jobcard-system/client/src/components/common/BottomSheet.jsx`
- `jobcard-system/client/src/App.css`
- `docs/notes/client-patterns.md`
- `docs/notes/time-and-costing.md` (only if Step 3 makes it wrong)

Expected shape: one new callback and two prop changes in `JobCardModal.jsx`; one new
prop in `BottomSheet.jsx`; one new CSS rule plus a transition in `App.css`; a prop and
a chip removed from `JobIdentityStrip.jsx` and a total added to one confirm message;
a wheel handler, a revert control and their styles on the pricing screen; two rules
deleted from `JobCardModal.css`; one paragraph rewritten in the notes.

Report back with:
- `git diff --stat` pasted in full
- The answer to every "check / confirm / report" asked for above
- Any step you could not do as written, reported rather than improvised
- Confirmation that `npm run build` in `jobcard-system/client` succeeds

Do not run the app, do not commit, do not touch any file outside the list.
