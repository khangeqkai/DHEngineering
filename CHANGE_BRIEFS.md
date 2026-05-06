# Change Briefs — Sequential Tasks

Each task below is a self-contained brief. Hand one task at a time to a fresh agent — the brief includes scope, files, behaviour, acceptance criteria, and known risks. Execute in the order listed.

---

## Decisions Already Locked

| # | Decision | Notes |
|---|---|---|
| 1 | qty=0 on timer stop **records a real time entry** | Worker did the work, completed nothing — log it. |
| 2 | Non-admin can **only** auto-record time entries (start/stop) | Manual `+ Add Entry` button stays admin-only (renders inside the per-item Progress section on Details tab). |
| 3 | Drop-down audit (#5) — defer; just rank/discover later | Don't convert anything yet. |
| 4 | **Per-item timer** (each line item gets its own timer) | A jobcard can have a nut + bolt with very different processes. We don't want two jobcards. |
| 5 | Per-item upload control: small **menu** with "Upload to {QA Forms / Job Files / Customer Property} / View Files / Mark NA" | Storage uses physical per-item subfolders (e.g. `/Job Files/Item-1/`). NA persists in `job_items` columns. |
| 6 | **Delete** `QuickActionPanel.jsx` + `.css` after Task 6 lands | Per CLAUDE.md "no legacy code". |

---

# Task 1 — Drop "Edit:" prefix from JobCardModal title ✅ DONE

**Effort:** ~1 minute. **Risk:** None.

### Scope
Display the job number alone in the modal title bar; remove the `Edit:` prefix.

### Files
- `jobcard-system/client/src/components/jobcard/JobCardModal.jsx:401`

### Change
```js
// before
const buildTitle = () => isEdit ? `Edit: ${formHook.jobNumber}` : 'New Job Card';
// after
const buildTitle = () => isEdit ? formHook.jobNumber : 'New Job Card';
```

### Acceptance
- Opening an existing job card shows just `DH-00123` (or whatever) in the header.
- Creating a new job card still shows `New Job Card`.

---

# Task 2 — Allow timer stop with qty 0 (or empty) ✅ DONE

**Effort:** ~30 minutes. **Risk:** Low.

### Scope
A worker should be able to stop their timer and submit a time entry even if no units were completed (CNC jobs sometimes log time without producing a finished part).

### Files
- `jobcard-system/client/src/components/jobcard/StopTimerForm.jsx` (validation + submit gating)
- `jobcard-system/client/src/components/jobcard/useTimer.js` (`submitEntryForm` filter)

### Behaviour
- An item is considered **filled** if it has **at least one machine selected OR a non-empty description**. Qty is optional.
- Submit button enables when ≥ 1 item is filled.
- Empty qty is sent to the server as `'0'` (not blank), so downstream parsing stays clean.

### Specific changes
1. `StopTimerForm.jsx:74-80` — replace `filledItems`/`allFilledValid` logic so qty is no longer the gate. Use machines OR description instead.
2. `StopTimerForm.jsx:103-108` — `getItemStatus`: an item with machines or description but no qty should be `'complete'`, not `'incomplete'`.
3. `useTimer.js:196-205` — change `.filter(...item.qty...)` to filter by the same "has machines or description" rule. When mapping, normalize `qty` to `String(item.qty || '0').trim()`.

### Acceptance
- With one item expanded, picking a machine but leaving qty blank → submit enables → entry is created with qty `0` and visible in Progress/Costing.
- All-empty form keeps submit disabled (no accidental empty entries).
- Existing behaviour with qty filled still works identically.

### Risk notes
- DB `qty` column is `TEXT`; `0` and empty pass through.
- `CostingTab.jsx:132` already renders qty conditionally, so empty/0 displays cleanly.
- Combined CSV qty (`useTimer.js:210`) joins fine — just looks like `"0, 5, 0"`.

---

# Task 3 — User can self-assign via the Assignee column ✅ DONE

**Effort:** ~2-3 hours. **Risk:** Low.

### Scope
Non-admin users see the Assigned-To column and can add/remove **themselves only** by clicking it. Admins keep full control via the modal.

### Files

**Server (new):**
- `jobcard-system/server/src/routes/jobcards.js` — add two routes near the existing assignee logic.

**Client:**
- `jobcard-system/client/src/services/api.js` — add `selfAssign(jobcardId)` and `selfUnassign(jobcardId)`.
- `jobcard-system/client/src/components/JobCardList.jsx` — drop `adminOnly: true` on the `assignedTo` column (line 380); add a popover toggle for non-admins (mirror the status popover pattern at lines 425-456).

### Server endpoints
```
POST   /api/jobcards/:id/assignees/self    → 201 + updated assignees list
DELETE /api/jobcards/:id/assignees/self    → 200 + updated assignees list
```
- Use `req.user.userId` — never trust a userId from the body.
- Idempotent: POST with already-assigned user returns 200 with no-op; DELETE with non-assigned user returns 200 with no-op.
- Insert/delete via `jobAssigneeQueries.create` / a new `deleteByJobcardAndUser` query (add to `database.js` if missing).
- Record history with `recordHistory('jobcard', id, 'self_assign'|'self_unassign', userId, userName, { assignees: { from: oldList, to: newList } })`.

### Client UI
- For non-admin: clicking the assignee cell opens a small popover (similar to status popover) with one of:
  - **"Assign me"** if the user isn't currently in `card.assignees`
  - **"Remove me"** if they are
- Calls `loadJobcards()` after success.
- Admin click on the cell: **no change**, they keep using the full modal.

### Acceptance
- As a non-admin, I see the Assigned-To column with avatars.
- Clicking it as a non-admin shows "Assign me"; clicking it adds me; the column refreshes; activity log shows `self_assign`.
- Clicking again shows "Remove me"; clicking removes me.
- As admin, the cell behaviour is unchanged (still no popover from this row — admin manages via modal).
- Calling the new endpoints with a body trying to spoof another userId is rejected/ignored.

### Risk notes
- `getAssigneesForJobcards()` already runs unconditionally (`jobcards.js:48`) — no privacy leak from exposing the column.
- Existing `PUT /:id` assignee logic (admin-only full replace) is untouched.

---

# Task 4 — Free-text input audit (REPORT ONLY)

**Effort:** ~1 hour. **Risk:** None (no code changes).

### Scope
Produce a written audit listing every `<input type="text">`, `<textarea>`, and string-typed input across the client that **could** be a dropdown. Do **not** convert anything yet.

### Method
1. Grep `<input type="text"` and `<textarea` across `jobcard-system/client/src/`.
2. For each hit, classify as:
   - **Free-text (keep)** — descriptions, names, addresses, narrative.
   - **Categorical (consider dropdown)** — small fixed value set, repeated across records.
   - **Numeric/reference (keep)** — qty, PO number, phone numbers.
3. For each "consider dropdown" candidate, note: existing values in the DB (sample if possible), proposed `tags` category (or hardcoded list), migration concern.
4. Cover `worker-client/` too.

### Deliverable
Add a new section to this file (`CHANGE_BRIEFS.md`) titled `## Audit Results — Task 4` with a table:

| File:line | Field | Current type | Recommend dropdown? | Proposed source | Notes |
|---|---|---|---|---|---|

Already-known keepers (no need to re-list): see the table in Task 6's "Known free-text fields" section.

### Acceptance
- Audit table covers every text input in the client.
- Each candidate has a clear recommendation + rationale.
- No code changed.

---

# Task 5 — Collapse Items + Progress into Details (superseded brief)

> **Note:** the original brief (kept below for history) split Costing into a separate Progress tab and a slim Costing tab. After implementation we restructured: line items + per-item progress now live directly on the **Details** tab for everyone, so the Items and Progress tabs were dropped entirely. Final tab layout: non-admin sees Details only; admin sees Details / Files / Costing / Activity. The Costing tab still slims down to pricing-only as originally intended.

## Original brief — Split Costing tab → Progress tab + slim Costing tab

**Effort:** ~5-6 hours. **Risk:** Medium. **Depends on:** Task 2 (qty=0).

### Scope
Today the Costing tab mixes "what happened" (time entries) with "pricing" (rates and totals). Split:
- **Progress tab** — visible to **everyone**. Shows the time-entry list. Read-only for non-admin (no add/edit/delete buttons; auto-recorded entries via timer only).
- **Costing tab** — admin-only (unchanged gating). Contains only the pricing summary block.
- **Embed per-item progress in ItemsTab** — under each line item card, an expandable section listing the time entries for that item.

### Files

**New:**
- `jobcard-system/client/src/components/jobcard/tabs/ProgressTab.jsx` — new file containing the existing `TimeEntriesSection` (extracted from CostingTab).
- `jobcard-system/client/src/components/jobcard/tabs/TimeEntryCard.jsx` — extract the `renderEntryCard` body from `CostingTab.jsx:48-145` into its own component so both ProgressTab and ItemsTab can render it.

**Modified:**
- `jobcard-system/client/src/components/jobcard/tabs/CostingTab.jsx` — strip out `TimeEntriesSection`; keep only the pricing summary (lines 296-385). Update the default-export signature.
- `jobcard-system/client/src/components/jobcard/JobCardModal.jsx`:
  - Add a new `progress` tab between Items and Files in the tab bar (line 412-428). Visible to everyone (no `isAdmin &&` gate).
  - Wire `<ProgressTab>` rendering similar to existing CostingTab block (line 483-505) — but pass `isAdmin` so the component can hide add/edit/delete affordances.
  - Move the `timeEntries.length` badge from Costing tab to Progress tab.
  - The tabs container at line 412 currently only renders if `isEdit` — keep that, but ensure non-admin still sees the Details + Progress tabs (today they see only Details because everything else is admin-gated).
- `jobcard-system/client/src/components/jobcard/tabs/ItemsTab.jsx` — accept `timeEntries` prop, group entries by item number (entries can have CSV like `"1, 3"`; split before matching). Render a `<details>` block per line item with the matching entries via `TimeEntryCard`. Read-only — no edit/delete inside ItemsTab.

### Behaviour
- Non-admin opens jobcard → sees tabs: **Details, Progress**.
- Admin opens jobcard → sees tabs: **Details, Items, Progress, Files, Costing, Activity**.
- Progress tab for non-admin: list of entries, no buttons.
- Progress tab for admin: full edit (matches today's CostingTab behaviour minus the pricing block).
- ItemsTab per-item expand: shows that item's entries, read-only.
- Costing tab: pricing form only, admin-only.

### Acceptance
- Tab bar shows correct tabs for both roles.
- Non-admin can browse Progress; cannot add/edit/delete time entries.
- Admin Progress tab is functionally identical to today's Costing tab time-entry section.
- Costing tab still computes pricing correctly (totals, save).
- ItemsTab shows per-item entries inline; expanding/collapsing works.

### Risk notes
- `useCosting` and `api.getCosting()` must stay admin-only — server returns 403 otherwise. Existing gate at `JobCardModal.jsx:87` is correct; don't loosen it.
- `useTimeEntries` hook stays mounted for everyone, but its handlers should not crash for non-admin (they won't fire since buttons are hidden).
- `GET /:id/time-entries` already requires only `authenticate` — no server change needed for visibility.
- `DELETE /:id/time-entries/:entryId` doesn't enforce admin server-side today. **Out of scope for this task** but worth flagging — admin-only restriction may need to be added in a follow-up if non-admin can craft API calls.

---

# Task 6 — Replace QuickActionPanel with in-modal items workflow (per-item timer + per-item upload)

**Effort:** ~1-2 days. **Risk:** High. **Depends on:** Task 2 (qty=0), Task 5 (line items + per-item progress now live on Details tab; Items/Progress tabs no longer exist).

### Goal
Row click → opens JobCardModal directly (no separate panel). Each line item gets its own Start/Stop timer button and its own Files menu. Delete the QuickActionPanel entirely.

### Decisions (confirmed)
- **Per-item timer:** each line item has its own timer. A user can still only run **one** active timer at a time across the whole system (existing constraint stays).
- **Per-item upload:** menu with "Upload to {QA Forms / Job Files / Customer Property}", "View Files (N)", "Mark NA". Files land in **per-item subfolders** (`Item-1/`, `Item-2/`).
- **NA marker:** persisted in three new nullable columns on `job_items` (`qa_files_status`, `job_files_status`, `customer_property_status`) — value `'NA'` or `NULL`.
- **Delete `QuickActionPanel.jsx` + `.css` + all imports.**

### Sub-tasks (do in this order within the task)

#### 6A — Server: per-item timer schema + endpoints
**Files:**
- `jobcard-system/server/src/db/database.js` — adjust `time_entries` semantics (single item per entry; drop CSV item_number support). Migrate existing rows: split CSV entries into per-item rows OR wipe (per CLAUDE.md, wipe is acceptable on this fresh project — confirm with user before wiping prod data).
- `jobcard-system/server/src/routes/jobcard-time-entries.js`:
  - `POST /:id/time-entries/start` — accept `{ itemNumber }` in body. Validate it exists on the jobcard. Store on the entry. Reject if missing.
  - `getActiveByUser` query stays unchanged (still one active timer per user).
  - `toCamelCase` keeps `itemNumber` as a single value (no longer CSV).
- `jobcard-system/server/src/middleware/validation.js` — add `validateStartTimer` requiring `itemNumber` (integer ≥ 1).

**Migration note:** existing `time_entries.item_number` column already exists; just stop writing CSVs. Add a one-shot migration in `db/init.js` that splits any existing CSV `item_number` rows into multiple rows (with the same start/end time) — or wipes if the user agrees.

#### 6B — Server: per-item file subfolders + NA marker
**Files:**
- `jobcard-system/server/src/db/database.js` — add columns `qa_files_status TEXT`, `job_files_status TEXT`, `customer_property_status TEXT` to `job_items`. Add a query to update them.
- `jobcard-system/server/src/utils/folderCreation.js` — when creating job folder, create `Item-1/`, `Item-2/`, ... subfolders inside each of the three category folders.
- `jobcard-system/server/src/routes/jobcard-files.js`, `jobcard-qa-forms.js`, `jobcard-documents.js` (whichever serves the three categories) — accept `?itemNumber=` query param on listing endpoints (filter to that subfolder). Accept `itemNumber` body param on upload/scanner-copy endpoints (write to that subfolder, create if missing).
- New endpoint: `PATCH /jobcards/:id/items/:itemNumber/files-status` `{ category: 'qa'|'job'|'customer_property', status: 'NA' | null }` — admin-or-assignee.

#### 6C — Client: lift hooks out of QuickActionPanel
The hooks `useCamera.js`, `useQuickActionFiles.js`, and `useTimer.js` currently live inside or are imported by `QuickActionPanel.jsx`. They're already self-contained. Import them directly into `ItemsTab.jsx` (or a new sibling) as needed.

#### 6D — Client: per-item Start/Stop timer button
**Files:**
- `jobcard-system/client/src/components/jobcard/useTimer.js` — `startTimer` / `startTimerWithConflictCheck` accept `itemNumber` and forward it in the API call.
- `jobcard-system/client/src/services/api.js` — `startTimer(jobcardId, itemNumber)`.
- `jobcard-system/client/src/components/jobcard/StopTimerForm.jsx` — simplified: only one item is active. Show the item context at the top; only ask for qty, machines, description for that one item. Remove the multi-item expand/collapse logic.
- `jobcard-system/client/src/components/jobcard/tabs/ItemsTab.jsx` — render `[▶ Start Timer]` per item card. If a timer is active on this item, show `[⏹ Stop Timer (00:23:11)]` instead. If active on a different item (same or other jobcard), show `[▶ Start]` but clicking triggers the existing conflict-check confirm.
- `jobcard-system/client/src/hooks/useActiveTimerIndicator.js` — keep working; the indicator on the row remains tied to the jobcard the timer is on.

#### 6E — Client: per-item Files menu
**Files:**
- `jobcard-system/client/src/components/jobcard/tabs/ItemsTab.jsx` — add a `<Files ▼>` button per item that opens a dropdown:
  - `Upload to QA Forms`
  - `Upload to Job Files`
  - `Upload to Customer Property`
  - ──────
  - `View Files (N)` — only if N > 0; opens an inline list/modal with the same lightbox/iframe viewer logic from QuickActionPanel
  - `Mark NA` (per category, three sub-items) — sets the corresponding `*_status` column
- Upload flow: opens the existing scanner/camera picker (lifted from QuickActionPanel). Pass `itemNumber` to upload endpoints.
- Show a small status indicator on each item: per category — `✓ N files`, `NA`, or `pending`.

#### 6F — Client: row click → modal directly + delete QuickActionPanel
**Files:**
- `jobcard-system/client/src/components/JobCardList.jsx`:
  - Replace the row-click `setQuickActionCard(card)` handler with `openEditModal(card.id)`.
  - Remove `quickActionCard` state, the `<QuickActionPanel>` render, and the `import QuickActionPanel`.
  - Modal opens on the Details tab (the current default; line items live there now, so no `initialTab` prop is needed).
- `jobcard-system/client/src/components/jobcard/JobCardModal.jsx`:
  - The tab strip is currently rendered only for admin (`isEdit && isAdmin`). Non-admin sees the Details content directly (no tabs). Keep that — line items already live in Details, so no tab gating to "loosen". Decide separately whether non-admin needs Files-tab visibility (out of strict scope; confirm with user).
  - Non-admin in edit mode currently renders via `DetailsReadOnlyView`. To get per-item Start/Stop and Files menu in there, either (a) extend `DetailsReadOnlyView` to render the same per-item controls, or (b) replace it with a non-admin variant of `ItemsTab` where field inputs are `readOnly` but the timer button, files menu, and per-item progress expand stay active. Recommend (b) to share the items rendering pipeline with admin.
- **Delete:** `jobcard-system/client/src/components/jobcard/QuickActionPanel.jsx`, `QuickActionPanel.css`, `useQuickActionFiles.js` if no longer imported anywhere else, and any orphaned imports. Search the codebase for `QuickActionPanel` and remove all references.

### Behaviour
- Click a row (any role) → JobCardModal opens on the Details tab (line items live there now).
- Each line item shows: badge, type/material/treatment (read-only for non-admin), `[Start Timer]` / `[Stop Timer]` button, `[Files ▼]` menu, expandable Progress section with that item's time entries.
- Starting a timer with a conflict on another item/jobcard prompts the user (existing `startTimerWithConflictCheck` logic).
- Stopping a timer opens a simplified StopTimerForm scoped to that one item (qty, machines, description).
- File uploads land in the correct per-item subfolder; listing per item works.
- "Mark NA" persists and shows as a label on that item.
- QuickActionPanel no longer exists.

### Acceptance
- No reference to `QuickActionPanel` anywhere in the client code (search returns 0 hits).
- Row click goes straight to modal.
- Non-admin can: see all items, start/stop timer per item, upload files to any item/category, mark items NA.
- Non-admin cannot: edit item fields, add/remove items. The tab strip stays admin-only — Files / Costing / Activity remain hidden for non-admin; non-admin sees only the Details content with per-item controls inlined.
- Per-item timer enforces "one active per user" — switching items triggers the conflict prompt.
- Files uploaded to Item-2 appear under `View Files` only when viewing Item-2's menu, not Item-1's.
- NA persists across reload.
- Existing CSV time-entries either migrated or wiped per the migration decision.

### Known free-text fields (from analysis — keep as text, not dropdowns)
Used in this task for the read-only renderer. None of these need conversion:
- Item description, qty (`ItemsTab.jsx:44,53`)
- Stop-timer description (`StopTimerForm.jsx:204`)
- PO number, contact name/company/phone/email/address (`DetailsTab.jsx`)
- TreatmentChips OTHER text (`TreatmentChips.jsx:102`)

### Risk notes (read carefully)
- **Schema migration is the highest-risk piece.** Confirm with user whether to wipe `time_entries` or write a CSV-split migration.
- **Folder creation:** `folderCreation.js` is fire-and-forget — make sure it tolerates re-creating subfolders idempotently for items added after initial create.
- **Single-active-timer constraint** is a real safety feature — don't relax it. Workers might think they can start multiple item timers in parallel; the conflict prompt is the UX they'll see.
- **`onClose` semantics** of the modal — the BottomSheet has `closeOnOverlayClick={false}` (`JobCardModal.jsx:405`). Non-admin should still be able to close (X button works). Verify on mobile/tablet.
- **`useActiveTimerIndicator`** in JobCardList drives the pulsing row indicator. Make sure it still updates when timers start/stop from inside the modal — the modal already calls `onSuccess` and the timer hook polls every 5s, but check that the row indicator refreshes promptly.
- **Files tab vs per-item Files menu** — these will overlap. Decide: keep Files tab as an admin-only "all files for this job" view, or remove it entirely. Recommend keeping it as admin's all-up view; per-item menu is the worker-facing entry point.

---

## How to Run These

For each task, hand the agent the corresponding Task section as the prompt. Example:

```
Read CHANGE_BRIEFS.md → Task 1. Implement it. Run the dev server and verify the
acceptance criteria before reporting back.
```

Tasks 1, 2, 3, 4 can be done in parallel sessions if you want. Task 5 must precede Task 6. Don't skip Task 4 — its audit informs whether any of the dropdowns referenced in Task 6's read-only line-item renderer need work.

---

## Audit Results — Task 4

Scope: every `<input>` (text-y types and no-type defaults) and `<textarea>` under `jobcard-system/client/src/` and `jobcard-system/worker-client/`. 77 `<input>` occurrences total; non-text types (checkbox/radio/file/number/date/datetime-local/email/password/tel/hidden) excluded from "candidate" analysis but listed below for completeness where they share a row with a text sibling.

### TL;DR

Only **two** real dropdown candidates surfaced. The rest are either narrative free-text, identity strings, numeric/reference values, search inputs, autocompletes already wired to a backing store, or filesystem paths.

**Candidates worth converting:**
1. `DetailsTab.jsx:342` — `repeatJobReference` should autocomplete to existing job numbers, not be free text. Placeholder `"JC-XXXXXXXX-XXX"` is also stale (job numbers are now `{prefix}{paddedNumber}` like `DH-00001`).
2. `SearchPage.jsx:327` — "Field Changed" filter; placeholder hints at a fixed enum (`status`, `priority`, `labourRate`). Could become a select sourced from `history.changes` JSON keys.

Everything else: keep as-is.

### Audit Table

Legend for **Recommend dropdown?**: **No (free-text)**, **No (numeric/ref)**, **No (already)**, **Yes** (with rationale).

| File:line | Field | Current type | Recommend dropdown? | Proposed source | Notes |
|---|---|---|---|---|---|
| `client/src/components/Login.jsx:109` | `username` | text | No (numeric/ref) | — | Auth identifier; must be free typing. |
| `client/src/components/Login.jsx:127` | `password` (PIN) | password | No (numeric/ref) | — | 4-digit PIN. |
| `client/src/components/JobCardList.jsx:611` | `showArchived` | checkbox | No (already) | — | Toggle. |
| `client/src/components/JobCardList.jsx:632` | list search | text | No (free-text) | — | Search query. |
| `client/src/components/SearchPage.jsx:229` | global search `q` | text | No (free-text) | — | Search query. |
| `client/src/components/SearchPage.jsx:327` | activity-filter `field` | text | **Yes** | Distinct keys from `history.changes` JSON, or hardcoded enum (`status`, `priority`, `labourRate`, `dueDate`, `assignees`, ...) | Placeholder already enumerates expected values. Free text currently lets users mistype. |
| `client/src/components/SearchPage.jsx:346` | time-filter `jobNumber` | text | No (numeric/ref) | — | Partial-match filter; user wants to type fragments. |
| `client/src/components/common/DataTable.jsx:145` | table search | text | No (free-text) | — | Generic table search box. |
| `client/src/components/common/SearchableSupplierSelect.jsx:97` | supplier picker | text | No (already) | — | Already an autocomplete bound to suppliers. |
| `client/src/components/ContactManagement.jsx:144` | `companyName` | text | No (free-text) | — | New-company input; identity. (DetailsTab uses an autocomplete variant.) |
| `client/src/components/ContactManagement.jsx:162` | `contactName` | text | No (free-text) | — | Person name. |
| `client/src/components/ContactManagement.jsx:181` | `phone` | tel | No (numeric/ref) | — | |
| `client/src/components/ContactManagement.jsx:191` | `email` | email | No (already) | — | |
| `client/src/components/ContactManagement.jsx:202` | `address` (textarea) | textarea | No (free-text) | — | Narrative. |
| `client/src/components/ContactManagement.jsx:220` | `notes` (textarea) | textarea | No (free-text) | — | Narrative. |
| `client/src/components/SupplierManagement.jsx:208` | supplier `name` | text | No (free-text) | — | Identity. |
| `client/src/components/SupplierManagement.jsx:225` | `contactName` | text | No (free-text) | — | |
| `client/src/components/SupplierManagement.jsx:243` | `contactPhone` | tel | No (numeric/ref) | — | |
| `client/src/components/SupplierManagement.jsx:253` | `contactEmail` | email | No (already) | — | |
| `client/src/components/SupplierManagement.jsx:264` | `address` (textarea) | textarea | No (free-text) | — | |
| `client/src/components/SupplierManagement.jsx:316` | `customTagName` | text | No (free-text) | — | Used to create a *new* service-tag value; by definition not yet in the dropdown. |
| `client/src/components/SupplierManagement.jsx:358` | supplier `notes` (textarea) | textarea | No (free-text) | — | |
| `client/src/components/UserManagement.jsx:163` | `showInactive` | checkbox | No (already) | — | |
| `client/src/components/UserManagement.jsx:197` | `username` | text | No (numeric/ref) | — | |
| `client/src/components/UserManagement.jsx:211` | `password` (PIN) | password | No (numeric/ref) | — | |
| `client/src/components/UserManagement.jsx:227` | display `name` | text | No (free-text) | — | |
| `client/src/components/UserManagement.jsx:243` | `email` | email | No (already) | — | |
| `client/src/components/Settings.jsx:26` | dark-mode toggle | checkbox | No (already) | — | |
| `client/src/components/Settings.jsx:166` | inactivity timeout | number | No (numeric/ref) | — | |
| `client/src/components/Settings.jsx:204` | `jobNumberPrefix` | text | No (free-text) | — | Admin-defined free format (e.g. `DH-`, `JC-2026-`). |
| `client/src/components/Settings.jsx:215` | `jobNumberNext` | text | No (numeric/ref) | — | Filtered to digits client-side. |
| `client/src/components/Settings.jsx:252` | `scannerFolder` | text | No (numeric/ref) | — | Filesystem path; folder picker handles input in Electron. |
| `client/src/components/Settings.jsx:293` | `jobFoldersBase` | text | No (numeric/ref) | — | Filesystem path. |
| `client/src/components/Settings.jsx:401/414/427` | PIN change x3 | password | No (numeric/ref) | — | |
| `client/src/components/TagManagement.jsx:180` | category display | text (readOnly) | No (already) | — | Read-only label when editing. |
| `client/src/components/TagManagement.jsx:194` | `machineNumber` | text | No (free-text) | — | Identifier (auto-uppercased). |
| `client/src/components/TagManagement.jsx:201` | machine `name` | text | No (free-text) | — | Identity. |
| `client/src/components/TagManagement.jsx:210` | `tagName` (new tag value) | text | No (free-text) | — | Used to create new tag values; by definition not yet in any dropdown. |
| `client/src/components/QALevelManagement.jsx:214` | template upload | file | No (already) | — | |
| `client/src/components/QALevelManagement.jsx:240` | QA level `name` | text | No (free-text) | — | Identity (e.g. "High Risk"). |
| `client/src/components/jobcard/tabs/DetailsTab.jsx:118` | "Auto-generated" stub | text (readOnly) | No (already) | — | Display only; real value generated server-side. |
| `client/src/components/jobcard/tabs/DetailsTab.jsx:150` | `companyName` (autocomplete) | text | No (already) | — | Autocompletes against `contacts`. Free-typing is required to create new contacts. |
| `client/src/components/jobcard/tabs/DetailsTab.jsx:178` | `contactName` | text | No (free-text) | — | Person name. |
| `client/src/components/jobcard/tabs/DetailsTab.jsx:190` | `phone` | text | No (numeric/ref) | — | (Note: should likely be `type="tel"` like ContactManagement; out of scope.) |
| `client/src/components/jobcard/tabs/DetailsTab.jsx:199` | `email` | email | No (already) | — | |
| `client/src/components/jobcard/tabs/DetailsTab.jsx:275` | job `description` (textarea) | textarea | No (free-text) | — | Narrative. |
| `client/src/components/jobcard/tabs/DetailsTab.jsx:304` | `poNumber` | text | No (numeric/ref) | — | Customer reference; per Task 6 known-keepers list. |
| `client/src/components/jobcard/tabs/DetailsTab.jsx:329` | `isRepeatJob` | checkbox | No (already) | — | |
| `client/src/components/jobcard/tabs/DetailsTab.jsx:342` | `repeatJobReference` | text | **Yes** | Autocomplete against `jobcards.job_number` (existing rows) | Should be a referential pick, not free text. Placeholder `"JC-XXXXXXXX-XXX"` is also stale — job numbers now use the configurable prefix + padded counter (e.g. `DH-00001`). Strong UX win: typo-proof, surfaces history. Storing the resolved `jobNumber` string (current behaviour) is fine; no schema change needed. |
| `client/src/components/jobcard/tabs/DetailsTab.jsx:359` | customer-property chips | checkbox | No (already) | — | Driven by `useTags('customer_property')`. |
| `client/src/components/jobcard/tabs/DetailsTab.jsx:388` | drawings chips | checkbox | No (already) | — | Driven by `useTags('drawings')`. |
| `client/src/components/jobcard/tabs/DetailsTab.jsx:450` | assignee chips | checkbox | No (already) | — | Driven by `users`. |
| `client/src/components/jobcard/tabs/DetailsTab.jsx:466` | internal `notes` (textarea) | textarea | No (free-text) | — | Narrative. |
| `client/src/components/jobcard/tabs/ItemsTab.jsx:43` | item `qty` | text | No (numeric/ref) | — | Stored as TEXT to allow empty/0 (post-Task 2). Per Task 6 known-keepers. |
| `client/src/components/jobcard/tabs/ItemsTab.jsx:52` | item `description` | text | No (free-text) | — | Per Task 6 known-keepers. |
| `client/src/components/jobcard/tabs/TreatmentChips.jsx:101` | treatment OTHER `otherText` | text | No (free-text) | — | Per Task 6 known-keepers. Only shown when treatment value is `'OTHER'`. |
| `client/src/components/jobcard/StopTimerForm.jsx:166` | per-item completed `qty` | text | No (numeric/ref) | — | Numeric, but text-typed for empty support (Task 2). |
| `client/src/components/jobcard/StopTimerForm.jsx:185` | machines used | checkbox | No (already) | — | Driven by `machines` table. |
| `client/src/components/jobcard/StopTimerForm.jsx:202` | per-item `description` | text | No (free-text) | — | Per Task 6 known-keepers. |
| `client/src/components/jobcard/tabs/CostingTab.jsx:82` | special-labour toggle | checkbox | No (already) | — | |
| `client/src/components/jobcard/tabs/CostingTab.jsx:183` | manual entry `qty` | text | No (numeric/ref) | — | |
| `client/src/components/jobcard/tabs/CostingTab.jsx:189` | manual entry `description` | text | No (free-text) | — | Narrative. |
| `client/src/components/jobcard/tabs/CostingTab.jsx:206/210` | start/end time | datetime-local | No (already) | — | |
| `client/src/components/jobcard/tabs/NotesSection.jsx:18` | new note (textarea) | textarea | No (free-text) | — | Narrative. |
| `worker-client/setup.html:85` | server IP | text | No (numeric/ref) | — | IP address; free-typed. |

### Drop-down candidates — implementation notes

**1. `repeatJobReference` autocomplete (DetailsTab.jsx:342)**
- Reuse the `SearchableSupplierSelect`-style pattern (`client/src/components/common/`) or the inline contact-autocomplete pattern in `DetailsTab.jsx:145-174`.
- Source: `api.getJobcards()` — already loaded elsewhere; or a new lightweight `GET /jobcards?fields=jobNumber` endpoint if performance becomes an issue.
- Match against `jobNumber` (and optionally `description` to help users find the right repeat).
- Allow free-typing fallback for genuinely external references.
- Update placeholder to match current numbering (e.g. read first chars from `job_number_prefix` setting, or just `"e.g. DH-00001"`).
- Migration concern: none — column stays free-text TEXT.

**2. Activity-log "Field Changed" filter (SearchPage.jsx:327)**
- Two source options:
  - **Static enum** in `client/src/components/jobcard/constants.js` — list of known `history.changes` keys (`status`, `priority`, `dueDate`, `assignees`, `labourRate`, `materialCost`, `qty`, `description`, `companyName`, `treatments`, `qaLevelId`, `notes`, etc.). Cheap; needs maintenance.
  - **Dynamic** — server endpoint that runs `SELECT DISTINCT json_each.key FROM history, json_each(history.changes)`. More accurate; one-shot query, can be cached.
- Allow free-typing fallback (admin search is power-user territory; enum + free-input combo box is best).
- Migration concern: none.

### Method footnote

- Searched: `<input` and `<textarea` across `jobcard-system/client/src/` and `jobcard-system/worker-client/`.
- Inputs without explicit `type=` default to text and are included.
- "Already-known keepers" list in Task 6 was respected — those rows are still listed for completeness (marked free-text/numeric/ref).
- Did not sample DB row values; classification was based on field semantics, surrounding labels, and placeholder hints. The two candidate rows do not need DB sampling to validate the recommendation.
