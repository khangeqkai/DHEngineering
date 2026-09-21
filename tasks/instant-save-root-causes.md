# Instant save — root-cause fixes

Follow-up to `instant-save-job-card.md` and `instant-save-review-fixes.md`. A code
review found eight defects in the instant-save work. Six of them are one symptom
each of four structural problems; this spec fixes the structures, not the symptoms.

**Three work packages, run in parallel. File ownership below is exclusive — a
package that needs a file it does not own reports back instead of editing it.**

---

## Frozen contracts

Every package codes against these. Do not renegotiate them mid-flight.

### Contract A — the saving record (client, package 1 owns it)

One record per open job card, in a new `client/src/components/jobcard/useSaveQueue.js`.
Every instant write goes through it. It replaces the three hand-rolled promise-chain
registries at `useInstantSave.js:99`, `useInstantItems.js:96` and `useJobCardForm.js:250`.

Entry key is a stable string, one of:

| Key | Covers |
|---|---|
| `field:<name>` | a job-level box (priority, dueDate, description, …) |
| `item:<itemId>:<field>` | one box on one part |
| `item:<localId>:create` | a still-local part row becoming real |
| `assignee:<userId>` | one worker ticked or unticked |

Exposed surface:

- `enqueue(key, run, { label })` — `run` returns a promise. Writes with the same
  key run in order; different keys never block each other. Owns the
  "ignore a reply for a job the user has left" guard and the stable toast id.
- `stateOf(key)` → `'queued' | 'inFlight' | 'failed' | 'idle'`. **`queued` and
  `inFlight` are distinct** — that distinction is the whole point (defect 8).
- `isPending(keyOrPrefix)` → boolean. Prefix match, so `isPending('assignee:u7')`
  and `isPending('item:item:abc')` both work.
- `pending()` → `[{ key, label, state }]` for the close question.
- `reset()` — cleared on open, same reason the existing hooks reset.

A settled-successful entry is removed. A failed entry stays until the user retries.

**Consequences that must follow, not be bolted on:**
- `closeReasons.js` reads `pending()` and the failed entries. Its catch-all
  branch at `closeReasons.js:131` is **deleted** — with real states recorded there
  is no situation it cannot name. (defects 5, 8)
- `creditAssignee` / `dropAssignee` (`useJobCardForm.js:309`) stand aside when
  `isPending('assignee:<workerId>')`. (defect 7)
- The status line reads `stateOf`, mapping `queued`+`inFlight` → "Saving…".

### Contract B — a write's reply is the authority on what it changed

Narrow writes currently change one thing and announce nothing, so anything derived
from the job goes stale. The whole-job save already recomputes the file notes
(`routes/jobcards.js:414`); the narrow routes must do the same.

| Route | Returns |
|---|---|
| `POST /jobcards/:id/items` | `{ item, items, attachmentWarnings }` |
| `PATCH /jobcards/:id/items/:itemId` | `{ item, items, attachmentWarnings }` |
| `DELETE /jobcards/:id/items/:itemId` | `{ items, attachmentWarnings }` |

`items` is the job's full ordered part list in the shape `formatItem` produces.
`attachmentWarnings` is `computeAttachmentWarnings(id, items, qa_level_id)`.

Client side: one landing point applies a reply — screen rows, saved baseline and
file notes together. No call site "remembers" to refresh. (defect 1)

Changing the quality level: the server already derives its own `quality_level`
from `qaLevelId`. It must record that derived value in the activity trail too, so
the trail keeps a readable "Standard → Premium" line instead of two codes. Fix is
server-side in the change tracker (`jobcard-helpers.js:255-281`) — the screen keeps
sending `qaLevelId` alone. (defect 2)

### Contract C — a part's permanent id is its identity; its number is sort order

Matches the house rule already in CLAUDE.md ("files are matched to a part by the
part's permanent id, never by its position number") — the server never got it.

- `item_number` is a sort order the **server** owns. A new part gets
  `MAX(item_number) + 1` **inside the same transaction as the insert** (defect 6).
- **Nothing renumbers on delete.** Gaps are fine and expected.
- The number shown on screen is the row's position in the ordered list, worked out
  when it is drawn. The client never predicts or recomputes a stored number — the
  arithmetic at `useInstantItems.js:160` and the renumbering at `:281` are deleted.
- Trail entries and rejection messages name a part by its description, not its
  position (defect 4).
- One-time startup conversion folds existing jobs onto clean per-job ordering
  (duplicates and gaps), idempotent, in `runMigrations()` per CLAUDE.md.

### Contract D — one rule table per field (package 3 owns it)

The rules about what a box must contain exist twice: the all-at-once check in
`jobCardValidation.mjs` and the per-box copy at `useInstantItems.js:13-34` (whose
own comment says it mirrors the other exactly). One table, both paths read it.

New `client/src/components/jobcard/fieldRules.mjs`:

```js
// Returns a message when the value is not acceptable, else null.
export function itemFieldMessage(field, value)
export function jobFieldMessage(field, value)
export const REQUIRED_ITEM_FIELDS   // string[]
export function isItemRowComplete(row)
```

A mistake produces **one** signal, never a field mark and a pop-up together
(CLAUDE.md house rule). (defect 3)

---

## Package 1 — the saving record

**Owns:** `useSaveQueue.js` (new), `useInstantSave.js`, `useInstantItems.js`,
`useJobCardForm.js`, `useJobCardInstantSaves.js`, `closeReasons.js`,
`useJobCardCloseGuard.js`, `JobCardModal.jsx`, `client/scripts/check-confirmQueue.mjs`.

Implements Contract A in full and the **client half** of Contract B (one landing
point for a part write's reply; file notes updated from it).

Fixes defects 1 (client half), 5, 7, 8.

Consumes `fieldRules.mjs` (Contract D) for the part rules — import it and delete the
local copy at `useInstantItems.js:13-34`. Package 3 creates that file; code against
the signature above. If it is missing when you finish, say so in your report.

Consumes Contract C: render a part's number from its position in the list. Do not
edit server files.

### Package 2 — part identity, and replies that carry the truth

**Owns:** `server/src/routes/jobcard-items.js`, `server/src/routes/jobcards.js`,
`server/src/routes/jobcard-mutations.js`, `server/src/routes/jobcard-helpers.js`,
`server/src/routes/jobcard-audit-text.js`, `server/src/middleware/validation.js`,
`server/src/db/queries.js`, `server/src/db/database.js`, `server/src/db/init.js`,
`server/src/db/columnMigrations.js`, the seed scripts.

Implements Contract C in full and the **server half** of Contract B.

Fixes defects 2, 4, 6, and the server half of 1.

Per CLAUDE.md: the startup conversion is the only place that knows the old shape —
no compatibility branches in live code, old code deleted, seed scripts updated to
the new shape. Do not edit client files.

### Package 3 — one rule table

**Owns:** `fieldRules.mjs` (new), `jobCardValidation.mjs`, `JobIdentityStrip.jsx`,
`useJobCardSave.js`, `tabs/ItemsTab.jsx`, `tabs/DetailsTab.jsx`.

Implements Contract D.

Fixes defect 3. `canWriteInstantly` already exists at `JobIdentityStrip.jsx:117` —
the empty-description mark is gated on it there, so a brand-new job's Create button
stays the only thing that complains about it.

Do not edit `useJobCardForm.js`, `useInstantItems.js` or any file package 1 owns.

---

## Gate — every package

- Only the files listed under your package. A change you cannot make inside them
  is reported, not improvised elsewhere.
- Removing a check, guard or comment needs a stated reason. Reordering calls is a
  behaviour change.
- 600-line limit per file (CLAUDE.md). CSS exempt.
- Every stored moment stays UTC ISO-8601. Audit trail keeps the
  `{ field: { from, to } }` shape and present-tense action names.
- Report back with: numbered steps done, `git diff --stat` pasted in, anything
  skipped and why, and any contract you had to work around.
