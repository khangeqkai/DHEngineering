# Fixed quality levels: Standard and Critical only (2026-09-28)

## Decision (owner, 2026-09-28)
A job has exactly two quality levels: **Standard** (default) and **Critical**. Critical
means the stop-timer inspection checklist is required. There is nothing to manage, so the
QA Levels page, its sidebar entry, and the whole `qa_levels` table/route go away.

## New shape
- `jobcards.quality_level` is the only store: `'STANDARD'` or `'CRITICAL'` (upper case).
- `jobcards.qa_level_id` column and the `qa_levels` table are dropped.
- API field is `qualityLevel` (`'STANDARD' | 'CRITICAL'`) — the client sends it directly.
  `qaLevelId` disappears from every request/response, form state and mapper.

## Steps

1. **Shared rule file** `server/src/shared/qualityLevels.js` (follow the shared-file
   convention in CLAUDE.md "Shared rule files" exactly — plain CommonJS, pure, one final
   shorthand `module.exports`):
   - `QUALITY_LEVELS = ['STANDARD', 'CRITICAL']`
   - `QUALITY_LEVEL_LABELS = { STANDARD: 'Standard', CRITICAL: 'Critical' }`
   - `isCriticalLevel(value)` → `String(value || '').toUpperCase() === 'CRITICAL'`
   - `qualityLevelLabel(value)` → label for a stored value (`'Standard'` fallback).
   Use these everywhere below instead of re-typing `'CRITICAL'` comparisons
   (`timeEntryHelpers.js` isCriticalJob, `StopTimerForm.jsx`, `DetailsTab.jsx`,
   `JobCardListColumns.jsx`, statistics).

2. **Startup conversion** in `server/src/db/legacyMigrations.js` (`runLegacyMigrations`),
   idempotent, no run-once flag needed: any job whose `quality_level` is NULL or not in
   `QUALITY_LEVELS` (compare upper-cased, trimmed) → set to `'STANDARD'`, except a value
   that upper-cases/trims to `'CRITICAL'` → `'CRITICAL'`. For each job actually changed,
   `recordHistory('jobcard', id, 'update', 'system', 'system', { qualityLevel: { from: old, to: new } })`
   — match how the existing conversions in that file record a system trail entry
   (copy their userId/userName convention). Do not touch `updated_at`. Second run = no-op.
   Log the count.

3. **Drop the old storage**:
   - `schema.js`: remove the `CREATE TABLE qa_levels` block; add `DROP TABLE IF EXISTS qa_levels`
     next to the existing `qa_level_templates` drop (update that log line).
   - `columnDrops.js`: add `{ table: 'jobcards', column: 'qa_level_id' }` with a comment;
     remove the two `qa_levels` entries (table no longer exists).
   - `columnMigrations.js`: remove the `qa_level_id` add entry.
   - `normalizeTimestamps.js`: remove `qa_levels`.
   - `routes/settings.js` TABLE_ORDER: remove `'qa_levels'` (a restore of an old backup
     then simply skips it; the startup conversion runs after restore and folds labels).
   - Check `backup-helpers.js` and any export/import code for `qa_levels` and remove it.

4. **Server routes / queries**:
   - Delete `routes/qa-levels.js`, `db/queries/qa-levels.js`; remove their wiring in
     `server/index.js`, `db/queries/index.js`, `db/database.js`.
   - `middleware/validation.js`: delete `validateCreateQaLevel`, `validateUpdateQaLevel`,
     `storedQaLevelName` and their exports. Replace the free-string `qualityLevel` check with
     `optionalEnum('qualityLevel', 'Quality level', QUALITY_LEVELS)` (or the equivalent
     existing helper), refusing anything else as a field error on `qualityLevel`.
   - `jobcard-mutations.js`: create — `quality_level = data.qualityLevel || 'STANDARD'`;
     update — take `data.qualityLevel` when sent, else keep existing. Remove all
     `qaLevelId`/`qaLevelQueries` logic and the "derive the label" block. Trail tracking of
     `quality_level` in `jobcard-helpers.js` stays as is (it already diffs `qualityLevel`);
     remove the `qaLevelId` output and the now-stale comment about qa_level_id.
   - `db/queries/jobcard.js`: remove `qa_level_id` from INSERT/UPDATE and fix the bound
     argument lists at every caller.
   - `search.js`: filter param becomes `qualityLevel` → `j.quality_level = ?`.
   - `statistics-helpers.js`: drop the `qa_levels` join; distribution and per-job
     `qualityLevel` use `qualityLevelLabel(job.quality_level)`.

5. **Client**:
   - Delete `components/QALevelManagement.jsx` (+ its css if separate) and remove all
     `.qa-level*` rules from `App.css` that only it used (grep to confirm no other user).
   - `App.jsx`: remove the lazy import and the `qa-levels` route. `Layout.jsx`: remove the
     sidebar link (and its icon import if now unused).
   - `api.js`: delete the four `QaLevel` methods.
   - `SearchPage.jsx`: remove `'qa_level'` from ENTITY_TYPES and the navigate-to-/qa-levels
     branch. The quality filter becomes a fixed Standard/Critical select on
     `filters.qualityLevel` (values `STANDARD`/`CRITICAL`, labels from the shared file).
     `useSearch.js`: rename the filter key to `qualityLevel`, send `params.qualityLevel`,
     stop loading levels from the server. Check `searchFields.js`.
   - `useJobCardReferenceData.js`: stop fetching levels; drop `qaLevels` from its return and
     from `JobCardModal.jsx` → `DetailsTab.jsx` → `JobReferenceFields.jsx` props.
   - `JobReferenceFields.jsx`: select `name="qualityLevel"`, value `formData.qualityLevel || 'STANDARD'`,
     options from `QUALITY_LEVELS` / labels. On change: set `qualityLevel` in form state and
     `saveField('qualityLevel', value)` — no `alsoMarkSaved`. Keep the `id="jc-qa-level"`.
   - `useInstantSave.js`: if `alsoMarkSaved` has no other caller after this, remove the
     option and its comment; otherwise just remove the Quality Level wording.
   - `mappers.js`, `useJobCardForm.js`, `closeReasons.js`, `DetailsTab.jsx` field list:
     `qaLevelId` → `qualityLevel` (default `'STANDARD'`). Make sure create sends
     `qualityLevel`.
   - `DetailsReadOnlyView.jsx`, `OnTimeTab.jsx`, `CustomersTab.jsx`, `excelExport.js`,
     `jobCardWorkbook.js`, `Statistics.jsx`: check each reference; show the label via
     `qualityLevelLabel` where they display it. The printout (grep `quality` in
     server utils for the job card HTML) likewise.

6. **Seed scripts** (`server/scripts/seed-*.js`): no `qa_levels` inserts; jobs get
   `quality_level` `'STANDARD'` or `'CRITICAL'` directly, no `qa_level_id`. Keep roughly
   the same mix of Critical jobs. Remove the stale "form attached" comment in seed-data.js.
   Seed history: drop the qa_level create entries.

7. **Docs** (same commit): rewrite the "Quality levels" section of
   `docs/notes/files-and-qa.md` for the new shape (drop the endpoints paragraph, the
   rename-guard text and the "Standard is not a row" paragraph; state the two fixed levels,
   the shared file, and the startup fold). Also the 150-char QA-level-name sentence in
   that note's first paragraph. Update `CLAUDE.md`: remove "QA level management" from the
   management list, `/qa-levels` from Main routes, `qa_levels` from Core tables. Grep
   `docs/notes/*.md` for `qa-levels`, `qa_level`, `QA Levels page` and fix each.

## Constraints
- No compatibility branches: nothing in live code accepts `qaLevelId` any more.
- Do not rebuild native modules or run `npm install` (WSL/Windows shared node_modules).
- Do not commit.

## Gate
- `grep -rn -i "qa_level\|qaLevel\|qa-level\|QALevel" jobcard-system/client/src jobcard-system/server --include=*.js --include=*.jsx --include=*.css | grep -v node_modules | grep -v graphify-out`
  must only hit: the new DROP in schema.js, the columnDrops entry, the startup conversion,
  and comments that explain them. Paste the output.
- Server loads: `node -e "require('./server/src/routes/jobcard-mutations'); require('./server/src/routes/search'); require('./server/src/routes/statistics')"` from jobcard-system (or explain why it can't in WSL).
- Client builds: `cd jobcard-system/client && npx vite build` if it works from WSL; otherwise say so.
- Run existing tests if any exist for the touched areas (`ls jobcard-system/server/test*` etc.).
- Paste `git diff --stat`.
