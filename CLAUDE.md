# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## God Rule — Plain Language Always

**When explaining EVERYTHING to the user, write in plain language.** This applies to every user-facing message without exception: explanations, audit results, recommendations, status updates, bug reports, fix descriptions, end-of-turn summaries, questions back to the user — everything.

The user is not reading the code. They need to understand what's happening, not what it's called.

**Never:**
- Name functions, classes, files, components, hooks, variables, properties, fields, routes, endpoints, tables, or columns
- Quote line numbers or file paths
- Use technical jargon: "endpoint", "state", "props", "callback", "promise", "schema", "middleware", "render", "dispatch", "mount", "ref", "context", "response", "request", "payload", "API", "frontend", "backend", "server-side", "client-side"
- Reference framework or library names: React, Express, SQLite, JWT, hooks, etc.

**Always:**
- Describe the experience as a flow: "the user clicks here → this happens → then this shows up"
- For a bug: describe what the user expected to see vs. what actually happens
- For a fix: describe the new behavior the user will experience
- Use everyday words: "the screen", "the button", "the form", "the list", "the message", "the page", "saves", "shows", "remembers", "sends"

**Example — wrong (technical):**
> The `qaTemplateWarning` field is set on the response in `jobcard-mutations.js:157` but the form's submit handler doesn't consume it, so no toast fires.

**Example — right (plain):**
> When a job is created, if any quality forms fail to copy, the screen never shows a warning. So the user thinks everything worked when it didn't.

The only exception is code comments and commit messages, where technical terms are appropriate because the audience is a future reader of the code itself.

## Project Overview

DH Engineering Job Card System - A full-stack Electron/React/Express application for managing job cards, quotes, contacts, suppliers, and manufacturing operations. Designed for LAN-connected desktop use with a central server.

## Development Commands

All commands run from `/jobcard-system/`:

```bash
# Start full application (server + Electron client)
npm start

# Start server only (port 3000)
npm run server

# Start client only (Electron + Vite dev server)
npm run client

# Web-only mode (no Electron, port 5173)
cd client && npm run start:web

# Build production client
npm run build

# Build Electron distributable
cd client && npm run build:electron

# Server with auto-reload
cd server && npm run dev

# Seed mock data (wipes DB, creates test data) — run on Windows
seed.bat
```

## Architecture

### Stack
- **Frontend**: React 18 + React Router, Vite bundler, Electron 27, react-hot-toast (notifications), framer-motion (animations)
- **Backend**: Express 4, better-sqlite3 (synchronous SQLite), pino (logging), express-validator, express-rate-limit
- **Auth**: JWT (memory-only, no localStorage), bcryptjs password hashing, rate-limited login (5 failed attempts/15 min)
- **Font**: Pragmatica (bundled OTF, weights 300/400/700) with Google Sans fallback

### Directory Structure
```
jobcard-system/
├── client/
│   ├── src/
│   │   ├── components/           # React components
│   │   │   ├── jobcard/          # JobCardModal + tabs (modular)
│   │   │   │   ├── tabs/         # Tab components + DetailsReadOnlyView, NotesSection
│   │   │   │   └── use*.js       # Custom hooks (useCosting, useTimeEntries, useTimer, useJobNotes, useJobCardForm, useContactSearch, useCamera, useJobFiles, useActivityLog)
│   │   │   └── common/           # Reusable components (incl. CheckboxDropdown multi-select) + Reactbits animation components (ClickSpark, ShinyText, GradientText, Waves)
│   │   ├── assets/                  # Static assets (logo, fonts)
│   │   ├── context/AuthContext.jsx  # JWT + user state + inactivity timer
│   │   ├── hooks/                   # Shared custom hooks
│   │   │   ├── useInactivityTimer.js  # Auto-logout timer logic
│   │   │   ├── useActiveTimerIndicator.js  # Live timer indicator for job card rows
│   │   │   ├── useSettings.js     # Settings page state and handlers
│   │   │   ├── useTags.js         # Fetch tags by category with caching
│   │   │   ├── useSearch.js       # Search page state, filters, debounced API calls
│   │   │   └── useMissingFilesIndicator.js  # Per-page check of jobs with declared-but-unattached files for the list marker (checks only visible rows, remembers results)
│   │   └── services/
│   │       └── api.js            # Direct API client to Express server
│   └── electron/                 # Electron main/preload
├── server/
│   ├── src/
│   │   ├── config.js             # Port, JWT (auto-generated), DB path settings
│   │   ├── middleware/
│   │   │   ├── auth.js           # JWT verification + role checking + rate limiting
│   │   │   └── validation.js     # express-validator reusable validators
│   │   ├── utils/
│   │   │   ├── logger.js         # Pino structured logging
│   │   │   ├── folderCreation.js # Auto-create company/job folders on disk
│   │   │   ├── fileValidation.js # Strict base64 decode + file-signature checks for uploads
│   │   │   └── pdfFiller.js      # PDF form field auto-fill with pdf-lib
│   │   ├── db/
│   │   │   ├── database.js       # SQLite schemas + prepared statements
│   │   │   └── init.js           # Migrations + default admin setup
│   │   └── routes/               # Express route modules
│   └── index.js                  # Express entry point
└── data/
    ├── jobcard.db                # SQLite database file
    └── config.json               # Auto-generated JWT secret (persisted)
```

### API Structure
Base URL: `/api` (relative; Vite dev server proxies to `http://localhost:3000`, production serves client statically from Express)

Main routes: `/auth`, `/jobcards`, `/contacts`, `/suppliers`, `/machines`, `/settings`, `/history`, `/qa-levels`, `/tags`, `/search`

Tag endpoints: `GET /tags` (authenticated, optional `?category=treatment`, optional `?includeArchived=true`), `GET /tags/categories` (authenticated), `GET /tags/:id` (admin), `POST /tags` (admin, `{ category, name }` — if a matching value was previously archived, it is restored under the freshly typed name instead of erroring on the unique constraint), `PUT /tags/:id` (admin, a value-changing rename is blocked for **any** category while job line items still use that value), `DELETE /tags/:id` (admin — **archives**, never hard-deletes; jobs reference options by value, so the row is kept and the `archived` flag is set), `POST /tags/:id/activate` (admin, restores an archived tag)

Settings endpoints: `GET /settings` (admin), `PUT /settings` (admin), `GET /settings/inactivity-timeout` (all users), `POST /settings/export-backup` (admin, creates ZIP at `outputPath` with database + job folder files), `POST /settings/import-backup` (admin, restores from ZIP at `inputPath`, requires `job_folders_base` configured)

Job card printout (per-job): `POST /jobcards/:id/print` (any authenticated user, in `jobcard-printout.js`) — **generates the job card as an HTML page** from the job's current data and returns `{ html }`. There is **no uploaded template and no saved file**: the card is drawn by `renderJobCardHtml` (`server/src/utils/jobCardHtml.js`) from friendly, pre-formatted data built by `buildJobCardView` (`jobcard-helpers.js`, which resolves tag values → names via `tagQueries.getByValue` and formats treatments/dates/priority). It lists exactly the job's parts (no blank rows) and flows onto extra pages for long jobs. The returned HTML is shown as the on-screen card preview in the paperwork hub (`previewCard` in `JobPaperworkHub.jsx`); **printing/saving the card always goes through the combined-packet route** (the same HTML is rendered to PDF server-side by `renderHtmlToPdf` — see the packet route below), so the desktop app and the web build print the identical card. Nothing is written to disk, so the on-screen job stays the single live record. Works whether or not job-folder storage is configured. Records a `jobCardPrinted` history entry. The printout is **not** a file category and is **never** part of the missing-attachment warning.

Combined packet printout (per-job): `POST /jobcards/:id/packet` (any authenticated user, in `jobcard-printout.js`) — welds the chosen job documents into **one combined PDF** for printing or saving. Body `{ items: [{category, filename}], includeJobCard?: boolean }` (card defaults in): the big file bytes never travel up — the client sends only the small list of files to include plus the `includeJobCard` flag, and the server reads each chosen file straight off disk **and renders the job card to PDF itself**, so the desktop app and the web build get the identical card-first packet. The card is rendered by `renderHtmlToPdf` (`server/src/utils/htmlToPdf.js`), which has two Chromium-based paths so the output is identical everywhere: when the server runs in-process inside the **packaged desktop app** (see `client/electron/main.js` `startServer`, production-only) it drives Electron's own off-screen `printToPDF`; otherwise (**dev — where `npm start` runs the server as a standalone Node process — or a background-only server**) it uses **Puppeteer's bundled headless Chromium** (`puppeteer` dependency in `server/package.json`; one cached browser instance is reused across requests and relaunched if it dies — `scripts/setup.js` `checkPdfBrowser` auto-downloads Puppeteer's Chrome on first setup so the standalone server can render). Both use A4 / backgrounds-on / zero-margins. If the card can't be rendered it's **skipped and reported**, never failing the whole packet. The packet itself is built by `buildPacketPdf` (`server/src/utils/pdfPacket.js`) with `pdf-lib`: the card goes first, then each file in order — PDFs are merged page-for-page (their own size/orientation preserved, so a landscape A3 drawing stays A3), images are normalised through `sharp` to PNG (every input format works; CMYK/progressive JPEGs that pdf-lib can't embed are handled) and placed one per A4 page scaled to fit. A file that can't be read/decoded is **skipped and reported** in `skipped`, never failing the whole packet; if **nothing** ends up combinable (every document unreadable and no card) the route returns 400 `None of the chosen documents could be combined` with the `skipped` list rather than a generic failure. Each requested filename is verified against the live folder listing (anti-traversal). Caps: ≤20 items, total input read into memory ≤600 MB (summed via `statSync` as files are read, bailing with 413 before crossing it), combined output ≤40 MB (else 413). The paperwork hub mirrors the item cap client-side (`MAX_PACKET_FILES`), disabling the print/save buttons with an "untick N" hint when more than 20 files are ticked. Records a `jobCardPacketPrinted` history entry.

History sub-routes: `GET /history` (recent, admin), `GET /history/user/:userId` (admin), `GET /history/entity/:entityType?page=1` (admin, type = `user`|`contact`|`supplier`|`machine`, returns `{ data, total, page, totalPages }` with 50 items/page)

Auth sub-routes: `PUT /auth/change-password` (all authenticated users, verifies current password)

Job card sub-routes: `/assignees`, `/time-entries`, `/costing`, `/files/:category`, `/history`, `/notes`

Job card file endpoints (disk-first; one folder per category per job — no DB rows): All routes accept `category` ∈ `{ job-files, qa-form-files, customer-property-files }`, mapped to on-disk subfolders `Job Files`, `QA Forms`, `Customer Property` under `[base]/[Company]/[JobNumber]/`. `GET /jobcards/:id/files/:category` (authenticated, lists files), `GET /jobcards/:id/files/:category/:filename` (authenticated, returns file as base64), `POST /jobcards/:id/files/:category/upload` (authenticated, saves base64 data; body: `{ filename, fileData, itemId? }` — used by both the file picker and camera capture). Filenames are validated against extension allowlist + path-traversal guards and made collision-free with a ` (n)` suffix. **Naming**: the identifying code rides at the END of the name in square brackets so the human-readable name leads. A file tied to a specific line item (optional `itemId`, the part's permanent `item:` id) is stored as `{name} [p{code}]` where `{code}` is the part's full id reduced to alphanumerics (`idSlug` in `folderCreation.js` — the whole id, not a truncation, so two parts can never collide on it), so the file stays matched to the part even after line items are re-numbered; job-level files (no `itemId`) get a 14-digit timestamp tag `{name} [{timestamp}]` instead. **Returned quality forms** are a special case of job-level files: any upload to the `qa-form-files` folder is renamed to a clean, predictable `Completed Form {N}` (N = one past the highest existing `Completed Form` number in that folder, via `nextQaFormNumber` in `jobcard-files.js`) — dropping whatever the scanner/camera called it — and still gets the timestamp tag appended, so a returned form lands as `Completed Form 1 [{timestamp}].pdf`. The detection of "a completed form came back" is unchanged (still the timestamp tag). The paperwork hub strips that trailing tag from QA-form names for display (`cleanQaName` in `JobPaperworkHub.jsx`), so the list reads `Completed Form 1.pdf`. The missing-file scan matches a part's files by the `[p{code}]` tag at the END of the base name (optionally followed by ` (n)`), before the extension — anchored, not an anywhere-in-name `includes`, so a file whose human-readable name merely contains another part's code can't masquerade as that part's attachment. Base64 uploads are capped at 30 MB (raw bytes); larger payloads are rejected with 400. Every upload is also validated **before any write** by `fileValidation.js`: `decodeBase64Strict` rejects a truncated/scrambled payload (Node's lenient base64 decode would otherwise silently save a broken file), and `assertMatchesExtension` checks the decoded leading bytes match the filename's extension signature — both surface a plain-English 400 so a corrupt upload can't masquerade as a part's attachment. QA template uploads (`POST /qa-levels/:id/templates`) run the same check.

Attachment-warnings endpoint: `POST /jobcards/attachment-warnings` (authenticated) — per-page check for the job list. Body `{ ids: [jobcardId, ...] }` is the ids of just the rows currently on screen; the scan checks only those (so the cost never grows with the total job count), de-duping and ignoring non-string ids. Returns `{ checked, flagged }` where `checked` is the full list of ids that were looked at (so the list can tell "checked, clean" apart from "not checked yet") and `flagged` carries one entry per checked job that declared a drawing / customer property / quality form but has no matching file on disk (`{ jobcardId, items: [{ itemNumber, missingDrawing, missingCustomerProperty }], missingQaForms }`). Missing or archived (invoiced) jobs are treated as checked-clean — included in `checked`, never in `flagged`. A "declared" value is any non-empty drawing/customer-property selection other than the explicit `N_A` ("N/A") answer; a job needs a quality form only if its QA level has a template attached **and** the level's `requires_returned_form` switch is on, and no returned form is in the QA Forms folder — a returned form is detected by the 14-digit timestamp tag the upload route stamps at the end of the name (`[{timestamp}]`, optionally ` (n)`), not by "any file that isn't a template name", so a stray/unrelated upload can't falsely clear the warning. Levels with the switch off are print-only: their templates are still copied/pre-filled on save, but the job never nags for a returned form. The same per-job warning data is also attached to single-job responses as `attachmentWarnings` (on `GET /jobcards/:id`, and on the `PUT /:id` / `PATCH /:id/status` responses). No-ops safely when job-folders storage isn't configured. Used by the job list to mark rows and by the job card screen to show per-part "Attach file" buttons.

**Soft close-out checkpoint**: When `PUT /jobcards/:id` or `PATCH /jobcards/:id/status` would set status to `INVOICED` (which also archives) and any attachment gaps exist, the server returns 409 `{ error: 'MISSING_ATTACHMENTS', attachmentWarnings }` **before any write**. The client shows an "Invoice anyway?" confirm and resends with `confirmMissingAttachments: true` in the body to bypass the check. This is a soft nudge, not a hard block.

**Soft delete checkpoint**: `DELETE /jobcards/:id` (admin) never deletes on the first request — because deleting is permanent and the job number is never reused, the server always returns 409 `{ error: 'CONFIRM_DELETE', workWarning }` **before any write** unless the body carries `confirmDelete: true`. `workWarning` is `null` when the job has no recorded work (client shows a plain "are you sure"); when any time has been logged or a timer is running (both cascade away on delete) it carries `{ hasActive, activeWorkers, loggedHours, pastWorkers }` so the confirm can name who/what is being erased. The confirmation lives entirely in this one 409 round-trip — there is no separate client-side pre-confirm — so the admin only ever sees a single dialog. Resending with `confirmDelete: true` bypasses the gate. Mirrors the missing-attachments checkpoint.

QA level endpoints: `GET /qa-levels` (authenticated, non-admin sees active only), `GET /qa-levels/:id` (admin), `POST /qa-levels` (admin, accepts `requiresReturnedForm`), `PUT /qa-levels/:id` (admin, accepts `requiresReturnedForm`; omitting it leaves the existing value untouched so a name-only edit doesn't flip the switch), `DELETE /qa-levels/:id` (admin, blocked if used by jobs), `POST /qa-levels/:id/templates` (admin, upload PDF), `GET /qa-levels/:id/templates` (admin), `DELETE /qa-levels/:id/templates/:tid` (admin). Each level carries a `requires_returned_form` flag (default 0): on = a completed quality form must be scanned back before invoicing (drives the missing-quality-form warning); off = print-only.

Timer endpoints: `GET /jobcards/active-timer` (authenticated), `POST /jobcards/:id/time-entries/start` (authenticated, body: `{ itemNumber }` — required, must match an existing line item; auto-assigns the user to the job if they aren't already an assignee, recorded as `self_assign`), `POST /jobcards/:id/time-entries/:entryId/stop` (authenticated), `PATCH /jobcards/:id/time-entries/:entryId/toggle-special` (admin, toggle special labour flag)

Notes endpoints: `GET /jobcards/:id/notes` (assignee/admin), `POST /jobcards/:id/notes` (assignee/admin), `DELETE /jobcards/:id/notes/:noteId` (admin only)

Assignee endpoints: `POST /jobcards/:id/assignees` (admin, full assignee replace), `DELETE /jobcards/:id/assignees/:userId` (admin), `POST /jobcards/:id/assignees/self` (authenticated, idempotent self-assign — uses `req.user.userId`, body ignored), `DELETE /jobcards/:id/assignees/self` (authenticated, idempotent self-unassign). Self routes log history with action `self_assign` / `self_unassign`.

Search endpoint: `GET /search` (authenticated, scoped). Query params: `scope` (all|jobs|people|activity|time), `q` (text query), `page`, `status`, `assigneeId`, `priority`, `jobType` (matches any item.job_type), `qaLevel`, `dateFrom`, `dateTo`, `dateField` (created|due), `includeArchived`, `peopleType` (both|contacts|suppliers), `userId`, `action`, `entityType`, `field` (search within changes JSON keys), `workerId`, `machineId`, `specialOnly`, `jobNumber`. Scopes `people` and `activity` are admin-only. `time` scope restricts non-admin to own entries. `all` scope returns grouped previews (top 5 per category with counts); other scopes return paginated results (25/page).

### Database Schema (SQLite)
Core tables: `users`, `contacts`, `suppliers`, `jobcards`, `job_items`, `job_assignees`, `time_entries`, `job_costings`, `qa_levels`, `qa_level_templates`, `history`, `settings`, `machines`, `job_notes`, `tags`, `supplier_service_tags`. Files are not stored in the database — they live on disk under the configured job-folders base (see "Files & QA workflow" below).

**Per-line-item treatments**: Each job item carries a `treatments` JSON column (array of `{ value, otherText, supplierId, supplierName }`). `value` is a treatment tag value (or `'OTHER'` with required `otherText`); `supplierId` is required and chosen from suppliers whose `serviceTags` include the treatment. The UI is **one treatment + supplier per line item** (`tabs/LineItemTreatment.jsx`): the treatment dropdown is shown first (listing only treatments at least one active supplier offers, plus 'Other'); the supplier dropdown appears only once a treatment is picked, narrowed to suppliers who offer that treatment, and a supplier is then required. Changing the treatment drops a previously-chosen supplier if it no longer offers the new treatment. The `treatments` array therefore holds 0 or 1 entry, but stays an array so costing/PDF-fill/history/export code that iterates it is unchanged. Validated server-side in `validateItemTreatments` (which still accepts an array). This replaces the previous `subcontracts` table — there is no separate subcontract entity, tab, or workflow.

**Per-line-item drawings & customer property**: Each job item also carries `drawings_type` and `customer_property` columns, each a comma-separated string of tag values (categories `drawings` / `customer_property`). Both are required per line item and edited via `tabs/LineItemTagSelect.jsx` (a multi-select tile picker reused for both); the `N_A` ("N/A") tag is mutually exclusive and serves as the explicit "no drawing" / "nothing supplied" answer. Validated server-side in `validateItemDrawings` / `validateItemCustomerProperty`. These used to live as single fields on the `jobcards` table; they now live on `job_items` so each part on a job records its own drawing and physical-reference state. QA-template PDF pre-fill aggregates (de-duped) the values across all items into the job-level `drawingsType` / `customerProperty` fill fields.

**Unified tags system**: The `tags` table stores all dynamic dropdown/multi-select options with columns: `id`, `category` (treatment/material/customer_property/drawings/job_type), `name`, `value`, `sort_order`, `archived`, `created_at`. The `supplier_service_tags` junction table links suppliers to treatment tags. Frontend uses the `useTags(category)` hook from `client/src/hooks/useTags.js` to fetch tags dynamically. Admin manages tags and equipment via the "Tags & Equipment" page (`/tags`, with a "Show archived" toggle and a restore button on archived rows). Equipment is managed through the existing `machines` table but shares the same admin UI.

**Archiving options (never delete)**: Options are archived, not deleted — a job stores the option's `value`, so removing the row would strand it on every job that used it. `getByCategory` returns active options only (drives the pickers); `getByCategoryIncludeArchived` returns everything (drives save-validation and display lookups). `useTags` fetches with archived included and exposes `tags` (active-only, for pickers), `labelOf(value)` (resolves any stored value — archived included — to its friendly name), plus `rawTags`/`loading`/`refresh`. A value saved on a job whose option was since archived shows in the field tagged "**(retired)**" in amber (CSS `retired-option` / `has-retired` / `lit-select-btn--retired`) so it stays visible and can be cleared, but retired options are never offered for new work. The same retired treatment shows for an archived **supplier** chosen on a job (job card loads suppliers with archived included). Server-side, `buildGrandfatheredValues` lets a job re-save a value it already held even if the option was archived/renamed away, so editing other fields on an old job never trips validation. Tag history actions are `archive` / `unarchive`.

**Contacts model** (company-primary): Each contact requires a `company_name` (NOT NULL, unique case-insensitive); `contact_name` is optional. Search autocomplete is on the Company field, with dropdown showing **Company (Contact)** format. Search filters by both `company_name` and `contact_name`. Job cards link to contacts via `contact_id` and **snapshot the customer's company/contact/phone/email onto the jobcard row at creation** (its own `company_name` / `contact_name` / `contact_phone` / `contact_email` columns). These frozen copies are read directly for all job display, search, and export — there is no live join back to `contacts` for display, and customer details are read-only once a job exists (the server strips contact fields on every update, for every role). **Customers are archived, never deleted** (track-and-trace): there is no contact-delete route — `POST /contacts/:id/archive` and `POST /contacts/:id/unarchive` (both admin) flip an `archived` flag. Archived customers are hidden from pickers, autocomplete, and search, but keep their record, the `contact_id` link on their jobs, and their files on disk; the admin Contacts page shows them via a "Show archived" toggle (`GET /contacts?includeArchived=true`). Because the link is never severed, a customer's files never strand.

All changes logged to `history` table for audit trail.

**Job card auto-numbering**: Job numbers are auto-generated from two settings: `job_number_prefix` (e.g. `"DH-"`) and `job_number_next` (e.g. `"00001"`). The format preserves leading zeros (width of `job_number_next` string). On each job card creation, the server generates `{prefix}{paddedNumber}`, validates uniqueness, inserts the record, then increments `job_number_next`. Deleted job numbers are never reused (counter only goes forward). The job number field is read-only in the create form. Admin configures prefix and starting number in Settings > Job Card Numbering. If not configured, job card creation is blocked with an error message.

**Automatic folder management**: When `job_folders_base` setting is configured, the system auto-creates `[base]/[Company] [code]/` on contact create/update and `[base]/[Company] [code]/[JobNumber]/Job Files/` + `QA Forms/` + `Customer Property/` on job card create. On job card deletion, the job card folder (`[base]/[Company] [code]/[JobNumber]/`) is recursively deleted but the parent company folder is preserved. **Folder identity is the code in the name, not the name itself**: each company folder carries the owning contact's full id (reduced to alphanumerics by `idSlug`) at the end of its name in square brackets (e.g. `Rio Tinto Iron Ore [550e8400e29b41d4a716446655440000]`), and the QA-level folders under `[base]/QA Levels/` do the same with the level id. The full id is used (not a truncation) so two folders can never collide on the code. Folder lookups (`findCompanyFolder` / `findQaLevelFolder` in `folderCreation.js`) match by that bracketed code, so renaming a customer/level just renames the folder and never strands its files — there is **no hidden marker file**. The code makes every folder name unique, so there is no same-name disambiguation. Company names are also enforced unique (case-insensitive) at create/update in `contacts.js`. Jobs with no linked contact fall back to a plain name-built folder (no code). Reading or listing files is **never** folder-creating — `resolveCategoryFolder` resolves read-only and the upload path creates the folder chain itself when a file is actually written, so browsing jobs never scatters empty folders on disk. Folder operations are fire-and-forget (errors logged, never block DB operations). Names are sanitized for cross-platform filesystem safety with path traversal protection.

**Auto-archive on INVOICED**: When a job card's status transitions to `INVOICED` (via `PUT /:id` or `PATCH /:id/status`), the server automatically sets `archived = 1` and stamps `invoicedDate` with the current timestamp. Only admins can set status to INVOICED. There is no manual archive endpoint; unarchive (`POST /:id/unarchive`, admin-only) is the only way to reverse it. **An archived (invoiced/filed-away) job is status-locked**: both status-changing paths refuse any status change while `archived === 1` (returns 409 **before any write**) — `PATCH /:id/status` blocks every status change, and `PUT /:id` blocks a status change while still allowing edits to other fields — so even an admin can't recreate the filed-away-but-OPEN limbo by editing. The lock keys off the `archived` flag alone (invoicing always files a job away; unarchive always clears it). **Unarchive also resets `status` to `OPEN`** (in the same `unarchive` query) so a re-opened job returns as a normal working job rather than a back-in-the-list-but-still-INVOICED contradiction; the reset is recorded in history alongside the `archived`/`invoicedDate` changes.

**Job card printout vs quality forms (two separate features)**: These are deliberately split. (1) The **job card printout** is **generated on demand as an HTML page** from the job's current data (`renderJobCardHtml` + `buildJobCardView`) and printed directly — there is no template to upload and **no saved file**; it lists exactly the job's parts and is never part of the missing-attachment warning. (2) **Quality forms** are per-QA-level inspection PDF templates that are printed, hand-filled, and (for levels with `requires_returned_form` on) scanned back; only those levels drive the missing-quality-form warning, and they still use `fillPdfTemplate`. See the printout endpoint above and the QA workflow below.

**Files & QA workflow**: All job card files live on disk, not in the database. Three category folders per job: `Job Files`, `QA Forms`, `Customer Property` (the job card printout is generated as HTML and printed on demand — it is not a file and is not stored). The QA level system is the only producer of templated content:
1. **Admin creates QA levels** (e.g. "Standard", "Critical") and uploads PDF template forms to each level. Templates stored at `[job_folders_base]/QA Levels/[LevelName]/`.
2. **Job card creation/update with a QA level** copies that level's template PDFs into `[base]/[Company]/[JobNumber]/QA Forms/`, auto-filling fillable form fields with job data via `pdf-lib` (`server/src/utils/pdfFiller.js`). PDFs without fillable fields are copied as-is (blank templates for handwriting). No DB rows are created — the files on disk are the only record. Implemented in `copyQaTemplatesForJob` in `jobcard-helpers.js`.
3. **Workers print** the pre-filled PDFs, fill inspection results by hand, then bring the completed forms back in via the paperwork hub in the JobCardModal header (each folder section has its own Add file / Camera buttons → file written under the matching folder). Whether a returned form is *required before invoicing* depends on the level's `requires_returned_form` switch (off = print-only, no nag).
4. **All file uploads** (file picker, camera) go through the unified `/jobcards/:id/files/:category/upload` route — same endpoint regardless of source, same disk layout regardless of category.
5. **The paperwork hub** (`JobPaperworkHub.jsx`, opened from a single **Files** button in the JobCardModal header, available to **all** users): one panel listing the generated job card on top plus the three folders (job files, QA forms, customer property), each with thumbnails, per-row View (lightbox for images, inline for PDFs) and Print-this-one, and per-folder Add file / Camera. Everything is pre-ticked; a **Print packet** / **Save as PDF** welds the ticked items (card first) into one combined PDF via `POST /jobcards/:id/packet` (see above). Reuses `useJobFiles` (list/upload/view/thumbnails) + `useCamera`; the build/print/save flow lives in `usePacketPrint.js`. This single hub **replaces** the former header Files menu and the admin-only Files tab (both removed).

Supported PDF field names for templates are defined by `FIELD_MAPPINGS` in `server/src/utils/pdfFiller.js`. The `qualityLevel` column stores the level name; `qa_level_id` is the FK to `qa_levels`.

**Time entries**: Core fields only — item#, machine#, qty, scrap_qty, description, start/end time. (Inspection data lives in the paper QA workflow above, not in `time_entries`.) **Scrap pieces**: Each time entry has a `scrap_qty` integer (default 0) recording pieces scrapped. It is entered by the worker in the stop-timer form and by admins in the manual time-entry form, which carries a Scrap field for both adding and editing an entry (so an admin can correct a mistyped count). The server clamps to ≥ 0 in all cases, treating blank/garbage as 0, and preserves the existing value if an update omits `scrapQty` entirely. **Crediting work**: The admin manual time-entry form requires picking the worker who actually did the work (a `workerId` select), so hours land under that person, not the admin filling in the form. The server validates the chosen worker is a real, active account, auto-assigns them to the job (mirroring what a self-started timer does), and records the worker in history. On edit, only an admin can re-credit a block to a *different* worker (a regular worker editing their own block keeps it under themselves); leaving the owner unchanged is always allowed, so an old block owned by a since-deactivated worker can still have its other fields corrected. The machines field on a time entry is a multi-select (`CheckboxDropdown`) stored as one comma-joined string (e.g. `"5, 9"`), matching the stop-timer form. The per-item Progress section shows scrap total + scrap rate (scrap / good pieces completed; can exceed 100%; hidden when no good pieces completed yet). **Per-item timers**: Each line item has its own Start/Stop button (`LineItemTimerButton.jsx`); starting a timer requires picking an item, and the active timer is bound to that `itemNumber` (server validates the item exists on the job card, returns 409 if a timer is already running on another job/item with the conflicting timer's `jobcardId` + `itemNumber` for "stop & switch" prompts). **Special labour**: Each time entry has an `is_special_labour` flag (default 0) toggled by admins in the per-item Progress section on the Details tab. Labour hours are auto-calculated server-side from completed time entries, split into regular and special hours. **Active timer protection**: Server blocks DELETE on entries with no `end_time` (returns 400). The per-item Progress section shows only a Stop button for active entries (no Edit/Delete until stopped). `useTimer` polls every 5s while a timer is active; if an admin stops it externally, the employee sees a toast notification and the time entries list refreshes automatically. **Stop timer form** (`StopTimerForm.jsx`): When a worker stops their timer, a full-screen form appears for the single item that was being worked on, asking for qty completed, scrap pieces, machines used, and description. Submitting fills those fields on the existing time entry (the row created at start); a description is required to save (qty, scrap, and machines are optional). Clicking X resumes the timer by clearing `end_time` on the original entry (preserves original `startTime` and `itemNumber`).

### Authentication
- Two roles: `admin` (full access) and `user` (limited)
- Admin-only: user management, supplier management, equipment management, QA level management, costing, settings, activity log, **contact/customer info**, **job card creation/deletion**, **note deletion**
- **Employee (user) role**: Read-only job card view (Details tab renders as styled text, not inputs) except status dropdown (employees can change job status via `PATCH /:id/status`, but cannot set status to INVOICED — admin-only). Non-admins see no tab strip — only the Details content renders, with line items + per-item Progress inlined. Admin-only tabs: Costing, Activity. The paperwork hub is reachable by all users (read+write — anyone assigned to a job can upload to its folders). The Costing tab is pricing-only (rates, totals); all time-entry CRUD lives in the Details tab via per-item Progress (`LineItemProgress.jsx` inside `ItemsTab.jsx`). Employees use Start/Stop timer for time tracking (one active timer at a time, enforced server-side). Can add notes but not delete them. **Paperwork hub**: a single **Files** button in the JobCardModal header opens the hub (`JobPaperworkHub.jsx`) — the one place to view/upload/print a job's documents (job card + Job Files / QA Forms / Customer Property), with per-folder Add file / Camera and combined-packet print/save. Uploads go to the matching folder via `/jobcards/:id/files/:category/upload`. Active timers show a pulsing green indicator on job card rows for all users.
- **Job card visibility**: All authenticated users can see and access all job cards (same visibility as admin). Non-admin users remain read-only with limited actions (status change, timer, notes, self-assign). Non-admins can add/remove **only themselves** via the Assigned-To column popover (`POST`/`DELETE /jobcards/:id/assignees/self`); admins still manage the full assignee list via the modal.
- **Settings page**: Non-admin users see only Appearance (dark mode) and Change PIN. Admin users see all cards (App Info, Current User, Printers, Security Settings, Job Folders, Data Backup, Server Connection).
- Default credentials: `admin` / `1234`
- **No token persistence**: JWT stored in memory only (not localStorage). Users must log in every time they open/refresh the app. Designed for shared workstation security.
- **Inactivity timeout**: Users auto-logout after configurable period of inactivity (default 5 min). Warning modal appears 30 seconds before logout. Activity = mouse, keyboard, touch, scroll. Timer continues when tab is hidden (security for shared workstations).
- **Contact info hidden from non-admin**: All customer/contact data (name, company, phone, email) is stripped from API responses for non-admin users. Server nulls out contact fields in `formatJobcard()`, deletes contact fields from POST/PUT request bodies, and all `/contacts` endpoints require admin. Client hides Customer column in tables, hides Contact section in DetailsTab, and skips contact creation logic in JobCardModal submit.

## Key Patterns

- **Direct API**: All components use `api.js` to communicate directly with the Express server. Components load data on mount and refresh after mutations.
- **JobCardModal**: Modular tab-based UI with custom hooks for each tab's logic (`useCosting.js`, `useTimeEntries.js`, `useTimer.js`, `useJobNotes.js`, `useCamera.js`, `useJobCardForm.js`, `useContactSearch.js`, `useJobFiles.js`, `useActivityLog.js`)
- **Prepared statements**: Database queries use better-sqlite3 prepared statements defined in `database.js`
- **History tracking**: Use `recordHistory()` for server-side data mutations to maintain audit trail
- **Input validation**: Use `express-validator` middleware from `validation.js` for request validation
- **Structured logging**: Use `logger` from `utils/logger.js` instead of `console.error()` for server-side logging
- **Toast notifications**: Use `react-hot-toast` for user feedback instead of `alert()`
- **Modal accessibility**: Use `role="alertdialog"`, `aria-modal="true"`, `aria-labelledby`/`aria-describedby`, focus trap (prevent Tab from leaving), and Escape key handler
- **Auto-formatting on blur**: Name and text fields auto-format when the user leaves the field (`onBlur`). Utilities are in `client/src/utils/formatters.js`:
  - `toTitleCase` — for name fields (person names, company names, display names, tag/label names). Produces "John Snow" style.
  - `capitalizeFirst` — for text fields (descriptions, notes, addresses). Capitalizes only the first letter.
  - Skip formatting for: phone, email, passwords, usernames, reference numbers, dates, numbers, search inputs, file paths.
  - Pattern: `onBlur={(e) => { const f = fn(e.target.value); if (f !== e.target.value) setState(...); }}`

## Architectural Guidelines

### No Backward Compatibility / No Legacy Code
- **Do NOT add backward-compatibility logic** (migration shims, old-value fallbacks, renamed aliases, etc.)
- **Actively remove legacy code** when replacing a system — delete old files, routes, queries, tables, imports, and exports. Do not leave orphaned code "for reference" or "just in case."
- This is a fresh, actively-developed project — old data can be wiped/re-seeded
- If a schema or value format changes, just change it everywhere; don't preserve old formats

### File Size Limits
- **Maximum 600 lines per file** - Refactor when approaching this limit
- Extract custom hooks when domain logic exceeds ~150 lines
- Split into tab/section components when UI grows complex
- CSS files are exempt (styling can be large)

### Separation of Concerns
- **Custom hooks** (`use*.js`): Encapsulate domain logic (state, handlers, API calls)
- **Constants** (`constants.js`): Enum-like values, dropdown options, form templates
- **Tab/Section components**: Presentational, receive all data via props, minimal logic
- **Orchestrator components**: Coordinate child components, manage shared state

### Naming Conventions
| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase.jsx | `JobCardList.jsx` |
| Hooks | use*.js | `useTimeEntries.js` |
| Utilities | camelCase.js | `mappers.js` |
| Route files | kebab-case.js | `jobcard-time-entries.js` |
| DB fields | snake_case | `contact_id`, `due_date` |
| All JavaScript code | camelCase | `contactId`, `dueDate` |
| Constants | UPPER_SNAKE_CASE | `JOB_TYPES` |

### Data Flow Convention

**Standard API flow:**
```
User Action → API Request → Express Server → SQLite Database
     ↑                                              ↓
Component ← JSON Response ← Express Response ←──────┘
```

- **Database**: snake_case (SQL convention) - `contact_id`, `due_date`
- **All JavaScript** (API, frontend, form state): camelCase - `contactId`, `dueDate`
- Convert at API boundary (server routes) only

### CRITICAL: Unified camelCase in JavaScript

**ALL JavaScript code uses camelCase - no exceptions:**
```javascript
// API responses
card.jobNumber
card.dueDate
card.contactName

// Form state
formData.jobNumber
formData.dueDate
formData.contactName

// Form field names in JSX
<input name="dueDate" value={formData.dueDate} />
<input name="contactName" value={formData.contactName} />
```

**Server-side: Convert at API boundaries only:**
```javascript
// In route handlers - convert DB snake_case to API camelCase
return {
  jobNumber: row.job_number,    // DB → API
  dueDate: row.due_date,
  contactId: row.contact_id
};

// When saving - API camelCase to DB snake_case
db.run(data.jobNumber, data.dueDate, data.contactId);
```

**Summary:**
| Location | Convention | Example |
|----------|------------|---------|
| Database columns | snake_case | `contact_id`, `due_date` |
| Everything else (JS) | camelCase | `contactId`, `dueDate` |

### Required Patterns
- **Direct API calls**: Use `api.js` methods for all server communication
- **Audit trail**: Call `recordHistory(entityType, entityId, action, userId, userName, changes, snapshot)` for all server-side data mutations. **Action names use present tense**: `'create'`, `'update'`, `'delete'` (not past tense). **IMPORTANT: `changes` must always use `{ field: { from: oldVal, to: newVal } }` format** — this applies to ALL actions including creates, notes, timers, etc. The activity log UI (`formatChanges`) iterates `Object.entries(changes)` and renders `from → to` for each field. If you pass flat data or `null` for changes, nothing will display in the activity log. Only use `snapshot` (7th param) for supplementary context that doesn't need from/to display. Use `req.user.userId` (not `req.user.id`) for the userId parameter.
- **Prepared statements**: Use queries defined in `database.js`, never inline SQL
- **Server error handling**: Try-catch with `logger.error()` from `utils/logger.js`
- **Client error handling**: Use `toast.error()` from `react-hot-toast` (not `alert()`)
- **Input validation**: Use validators from `middleware/validation.js` for new routes
- **Form state**: Single state object + unified `handleChange` handler
- **Data refresh**: Call load function after each mutation to refresh UI
- **React hooks**: Use `useCallback` for functions passed to useEffect dependencies or child components

## Environment Variables

```
PORT=3000                    # Server port
HOST=0.0.0.0                 # Server host (0.0.0.0 for LAN access)
JWT_SECRET=your-secret       # Override auto-generated JWT secret (optional, advanced)
JWT_EXPIRES_IN=7d            # Token expiration (server-side, but session ends on app close anyway)
LOG_LEVEL=info               # Logging level (debug, info, warn, error)
NODE_ENV=production          # Environment (development uses pretty logs)
DATA_DIR=/path/to/data       # Override data directory (set automatically by Electron in production)
ELECTRON_MODE=1              # Set by Electron to prevent server process.exit() on failure (set automatically)
CLIENT_BUILD_PATH=/path      # Path to built React client for static serving (set automatically by Electron in production)
```

## Security Features

- **Rate limiting**: Login (first 5 **failed** attempts normal, then 30-second cooldown between attempts; successful login clears failure count; resets after 15 min inactivity) and user creation (10 attempts/15 min) per IP
- **Password policy**: Exactly 4 numeric digits (PIN). Enforced on create user, update user password, and change own password. Not enforced on login.
- **Input validation**: All API inputs validated with express-validator
- **JWT authentication**: Memory-only token storage (no localStorage), role-based access control. Session ends on app close/refresh.
- **Inactivity auto-logout**: Configurable timeout (1-60 min, default 5 min) with 30-second warning modal. Admin configures in Settings. Handles system sleep/wake via visibility API.
- **Audit trail**: All data mutations logged to history table (including failed login attempts)
- **Prepared statements**: All database queries use prepared statements (SQL injection protection)
- **Auto-generated JWT secret**: On first run, a random 256-bit secret is generated via `crypto.randomBytes(32)` and persisted to `data/config.json`. Env var `JWT_SECRET` overrides if set.
- **Electron server lifecycle**: In production builds, Electron loads the Express server in-process (via `require()`) and uses `Promise.race` between the server startup promise and `/health` polling to detect readiness or failure. `ELECTRON_MODE` env var prevents the server from calling `process.exit()` on failure, letting Electron show an error dialog instead. In dev mode, the server is started separately via `npm start`.

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
