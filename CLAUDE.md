# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

This file is the **always-loaded** layer: the rules that apply to every task, and a map of where everything else lives. Deep detail about a specific area lives in `docs/notes/` and is read on demand — see "Where the detail lives" below.

## God Rule #2 — Plain Language Always

**When explaining EVERYTHING to the user, write in plain language.** This applies to every user-facing message without exception: explanations, audit results, recommendations, status updates, bug reports, fix descriptions, end-of-turn summaries, questions back to the user — everything.

The user is not reading the code. They need to understand what's happening, not what it's called.

**Never:**
- Name functions, classes, files, components, hooks, variables, properties, fields, routes, endpoints, tables, or columns
- Quote line numbers or file paths — except one short pointer to where a problem lives
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

## Where the detail lives

Read the matching note **before** working in that area. Each one is the full, unabridged detail that used to sit in this file — including the traps and the reasons behind them.

| Working on... | Read first |
|---|---|
| Timers, logged work, overtime tiers, pricing | `docs/notes/time-and-costing.md` |
| Job documents, folders on disk, printing, quality forms | `docs/notes/files-and-qa.md` |
| Job numbering, status, invoicing, deleting, comments, assignees | `docs/notes/jobs-and-status.md` |
| Customers, contact people, dropdown options, per-part fields | `docs/notes/customers-and-tags.md` |
| Anything that stores, compares or shows a date or time | `docs/notes/dates-and-timezones.md` |
| Sign-in, sessions, permissions enforcement, home access | `docs/notes/auth-and-security.md` |
| The job screen, the sign-in screen, error handling, activity colours | `docs/notes/client-patterns.md` |
| How the app is served, certificates, the desktop build | `docs/notes/serving-and-packaging.md` |
| A route whose behaviour isn't obvious from its code | `docs/notes/api-reference.md` |

If a change makes one of those notes wrong, **update the note in the same commit**. They are the record; this file only points at them.

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

# Build the client, then run the server exactly as the packaged app does (HTTPS on 443) — for testing home access from a dev PC
npm run prod

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
│   │   ├── components/       # React components
│   │   │   ├── jobcard/      # JobCardModal + tabs + use*.js hooks
│   │   │   ├── statistics/   # Workshop Statistics sub-views
│   │   │   ├── settings/     # Settings + labour-rate sub-cards
│   │   │   └── common/       # Reusable + animation components
│   │   ├── assets/           # Logo, fonts
│   │   ├── context/          # AuthContext (JWT, user, inactivity timer)
│   │   ├── hooks/            # Shared custom hooks
│   │   ├── utils/            # formatters, roles, activityColors, excelExport
│   │   └── services/api.js   # The single API client
│   └── electron/             # Electron main/preload
├── server/
│   ├── src/
│   │   ├── config.js         # Port, JWT, DB path
│   │   ├── middleware/       # auth.js (roles, rate limit), validation.js
│   │   ├── utils/            # logger, folders, PDF, costing, overtime, certs, ...
│   │   ├── db/               # database.js (schema + prepared statements), init.js
│   │   └── routes/           # Express route modules (kebab-case.js)
│   └── index.js
└── data/                     # jobcard.db, config.json, certs, logs
```

Files live on disk under the configured job-folders base, **not** in the database.

### Main routes

Main routes: `/auth`, `/jobcards`, `/companies`, `/contacts`, `/suppliers`, `/machines`, `/settings`, `/history`, `/qa-levels`, `/tags`, `/search`, `/statistics`

Job card sub-routes: `/assignees`, `/time-entries`, `/costing`, `/files/:category`, `/history`, `/notes`

### Core tables

Core tables: `users`, `companies`, `contacts`, `suppliers`, `jobcards`, `job_items`, `job_assignees`, `time_entries`, `job_costings` (carries the labour overtime tiers — `labour_ot1_*` / `labour_ot2_*` / `labour_holiday_*` hours/override/total/multiplier columns — see `docs/notes/time-and-costing.md`), `qa_levels`, `qa_level_templates`, `history`, `settings`, `machines`, `job_notes`, `tags`, `supplier_service_tags`. Files are not stored in the database — they live on disk under the configured job-folders base — see `docs/notes/files-and-qa.md`.

All changes logged to `history` table for audit trail.

## Roles and permissions

This is policy, not implementation — getting it wrong is a security bug, so it stays here in full. How it is enforced, and what each role sees on screen, is in `docs/notes/auth-and-security.md`.

- Three roles: `admin` (full access), `manager` (everything an admin can do **except money** — see below) and `user` (limited)
- Management (admin **or** manager) — everywhere this file says "admin" for these areas, read "admin or manager": user management, supplier management, equipment management, QA level management, tags, contacts, settings, activity log, **contact/customer info**, **job card creation/invoicing** (deletion stays admin-only — `DELETE /jobcards/:id` below), **note deletion**, **job file deletion** (uploading stays open to everyone), manual time entries and time-entry corrections
- Admin-only (never manager): **job costing** (the Costing tab and both `/jobcards/:id/costing` routes), the **Labour Rates & Overtime** page (`/labour-rates`; the labour/overtime settings keys are stripped from `GET /settings` and rejected on `PUT /settings` for managers — key lists exported as `OVERTIME_BODY_KEYS`/`OVERTIME_DB_KEYS` from `settings-overtime.js`), **data backup export/import** (a backup carries the whole database, pricing included), the **job-folders base path** (the `job_folders_base` setting — it decides where every job's files and backups are written, so a manager can't repoint it to a personal/removable drive; the Job Folders card is admin-only in the Settings UI and a manager's `PUT /settings` carrying `jobFoldersBase` is rejected 403 alongside the overtime keys), the **Excel job-card export's pricing sheet** (the export button is management-visible, but the Costing sheet — labour/overtime/materials/grand total — is only built for admins; the costing fetch is admin-only server-side anyway, so a manager's export simply omits the sheet), the **activity trail** (the global Activity Log page + `GET /history` + `GET /history/user` + the per-job Activity tab + `GET /jobcards/:id/history` + the search **activity** scope are all admin-only, because the trail records costing edits with dollar from/to; managers keep entity history — user/contact/supplier/machine via `GET /history/entity` — which carries no pricing), and **admin accounts** (a manager can never create, promote, edit or archive an admin — otherwise they could grant themselves the costing access managers are barred from; enforced server-side in the user routes and mirrored in the Users page UI)
- Role checks: server-side `requireManagement` / `isManagement(role)` from `middleware/auth.js` (`requireAdmin` remains for the money routes); client-side `isManagement(user)` from `client/src/utils/roles.js`. Convention: props/variables carrying management semantics are named `canManage` (not `isAdmin`), and list-column/search-scope metadata uses `managementOnly`
- **Contact details are hidden from non-management** — customer name, company, phone and email are stripped from responses and hidden in the UI.
- **Inactivity auto-logout** (1–60 min, default 5) with a 30-second warning. **Admins are exempt**; managers and employees are not.
- **No token persistence** — the pass is held in memory only, never in browser storage. Signing in is required every time the app is opened or refreshed. Designed for shared workstations.
- Default credentials: `admin` / `1234`.

## Architectural Guidelines

### Backward Compatibility via Startup Conversions
- **When a schema or value format changes, ship a one-time startup conversion that folds existing data into the new shape.** This is the single, consistent way we keep existing databases working across changes. Put the conversion in `runMigrations()` (`server/src/db/init.js`) — it runs on every boot, and must be idempotent (a second run finds nothing to convert and is a no-op).
- **Keep runtime code single-path — no backward-compatibility logic in live code** (old-value fallbacks, renamed aliases, dual read paths, etc.). The startup conversion is the *only* place that knows about the old shape; once it has run, every other part of the app only ever sees the new shape.
- **Actively remove legacy code** when replacing a system — delete old files, routes, queries, tables, imports, and exports. Do not leave orphaned code "for reference" or "just in case." The conversion migrates the *data*; the old *code* still goes.
- Older databases also get add-missing-column migrations (`columnMigrations.js`), covering every column added since the original schema. The live install dates from June 2026 — after the last column change — so a missing-column boot failure is not a live risk.
- **Update the seed scripts to the new shape too**, so fresh installs and re-seeds produce new-shape data directly (only existing databases need the conversion).
- Example: removing the `TREATMENT`/`ON_HOLD` job statuses folded them into `AWAITING_MATERIAL` via a startup conversion in `init.js`, while every status list, picker, sort map, and validator was updated to the new set and the old statuses were deleted from the code.

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

### Naming and casing

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase.jsx | `JobCardList.jsx` |
| Hooks | use*.js | `useTimeEntries.js` |
| Utilities | camelCase.js | `mappers.js` |
| Route files | kebab-case.js | `jobcard-time-entries.js` |
| DB fields | snake_case | `contact_id`, `due_date` |
| All JavaScript code | camelCase | `contactId`, `dueDate` |
| Constants | UPPER_SNAKE_CASE | `JOB_TYPES` |

**All JavaScript is camelCase — no exceptions.** The database is snake_case; convert at the API boundary (server routes) only, never anywhere else. This applies to responses, form state, and form field names alike.

```javascript
// In a route handler — DB → API
return { jobNumber: row.job_number, dueDate: row.due_date, contactId: row.contact_id };

// Everywhere in the client
<input name="dueDate" value={formData.dueDate} />
```

### Required Patterns
- **Direct API calls**: Use `api.js` methods for all server communication
- **Audit trail**: Call `recordHistory(entityType, entityId, action, userId, userName, changes, snapshot)` for all server-side data mutations. **Action names use present tense**: `'create'`, `'update'`, `'delete'` (not past tense). **IMPORTANT: `changes` must always use `{ field: { from: oldVal, to: newVal } }` format** — this applies to ALL actions including creates, notes, timers, etc. The activity log UI (`formatChanges`) iterates `Object.entries(changes)` and renders `from → to` for each field. If you pass flat data or `null` for changes, nothing will display in the activity log. Only use `snapshot` (7th param) for supplementary context that doesn't need from/to display. Use `req.user.userId` (not `req.user.id`) for the userId parameter.
- **Prepared statements**: Use queries defined in `database.js`, never inline SQL
- **Server error handling**: Try-catch with `logger.error()` from `utils/logger.js`
- **Client error handling**: Use `toast.error()` from `react-hot-toast` (not `alert()`)
- **Input validation**: Use validators from `middleware/validation.js` for new routes. Optional email fields are **lower-cased only, never "normalized"** — `normalizeEmail()` rewrites the address itself (it strips dots and `+tags` from gmail addresses), so a contact typed as `jane.doe+dh@gmail.com` was stored as `janedoe@gmail.com` while the job card kept what was actually typed
- **Form state**: Single state object + unified `handleChange` handler
- **Data refresh**: Call load function after each mutation to refresh UI
- **React hooks**: Use `useCallback` for functions passed to useEffect dependencies or child components

## UI conventions

- **Anything clickable is a real button.** A clickable `<span>` is invisible to Tab and to a screen reader; the job list's status badge and assignee avatars are `<button type="button">` with an `aria-label` saying what pressing them does (their CSS strips the browser's button chrome), and a sortable column heading is reachable by Tab and sorts on Enter or Space.
- **Modal accessibility**: Use `role="alertdialog"`, `aria-modal="true"`, `aria-labelledby`/`aria-describedby`, focus trap (prevent Tab from leaving), and Escape key handler. **The page-scroll lock is owned by the shared modal stack** (`common/modalStack.js`): `pushModal` freezes the page behind and `removeModal` releases it only when the *last* modal closes — a modal must never set `document.body.style.overflow` itself, or cancelling a confirm layered over the job screen unfreezes the page while the job screen is still up
- **Auto-formatting on blur**: Name and text fields auto-format when the user leaves the field (`onBlur`). Utilities are in `client/src/utils/formatters.js`:
  - `toTitleCase` — for name fields (person names, company names, display names, tag/label names). Produces "John Snow" style.
  - `capitalizeFirst` — for text fields (descriptions, notes, addresses). Capitalizes only the first letter.
  - Skip formatting for: phone, email, passwords, usernames, reference numbers, dates, numbers, search inputs, file paths.
  - Pattern: `onBlur={(e) => { const f = fn(e.target.value); if (f !== e.target.value) setState(...); }}`

## Invariants worth knowing before you start

Short list of things that are easy to break by default and expensive to un-break. Each has full detail in the matching note.

- **Every stored moment is UTC in ISO-8601 form.** Never `datetime('now')` or `CURRENT_TIMESTAMP` — they produce a shape the client reads as local time and every displayed time shifts. A bare calendar day stays a bare calendar day. → `dates-and-timezones.md`
- **Options and customers are archived, never deleted.** A job stores the option's value, so removing the row strands it on every job that used it. → `customers-and-tags.md`
- **A schema or format change ships a one-time startup conversion, and the old code is deleted.** No compatibility branches in live code. → the guideline above
- **Work drives job status, and it overrides a manual change.** Invoiced is terminal and archives the job. → `jobs-and-status.md`
- **Files are matched to a part by the part's permanent id, never by its position number.** The number shifts as parts are added or removed. → `files-and-qa.md`
- **The costing sheet saves itself and has no Save button.** Its guards exist because each one was a real way to bill the wrong number. → `time-and-costing.md`
- **A write is never re-sent automatically.** Only reads retry — a resent write creates two of whatever was being saved. → `client-patterns.md`

## Environment Variables

```
PORT=3000                    # Server port (dev HTTP; also a plaintext→HTTPS redirect port in production)
HOST=0.0.0.0                 # Server host (0.0.0.0 for LAN access)
HTTPS_PORT=443               # Production HTTPS port (see "Secure serving" below)
MDNS_NAME=jobcards.local     # Friendly local-network name the app announces itself under (production, .local)
JWT_SECRET=your-secret       # Override auto-generated JWT secret (optional, advanced)
JWT_EXPIRES_IN=7d            # Token expiration (server-side, but session ends on app close anyway)
LOG_LEVEL=info               # Logging level (debug, info, warn, error)
NODE_ENV=production          # Environment (development uses pretty logs)
DATA_DIR=/path/to/data       # Override data directory (set automatically by Electron in production)
ELECTRON_MODE=1              # Set by Electron to prevent server process.exit() on failure (set automatically)
CLIENT_BUILD_PATH=/path      # Path to built React client for static serving (set automatically by Electron in production)
```

## Security Features

- **Password policy**: Exactly 4 numeric digits (PIN). Enforced on create user, update user password, and change own password. Not enforced on login.
- **Audit trail**: All data mutations logged to history table (including failed login attempts)
- Full detail — throttling, sessions, certificates, home access, packaging — is in `docs/notes/auth-and-security.md` and `docs/notes/serving-and-packaging.md`.

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)
