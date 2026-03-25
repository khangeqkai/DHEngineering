# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
│   │   │   │   └── use*.js       # Custom hooks (useCosting, useTimeEntries, useTimer, useJobNotes, useJobCardForm, useContactSearch, useCamera, useQuickActionFiles, etc.)
│   │   │   └── common/           # Reusable components + Reactbits animation components (CountUp, ClickSpark, SpotlightCard, StarBorder, ShinyText, GradientText, Waves)
│   │   ├── assets/                  # Static assets (logo, fonts)
│   │   ├── context/AuthContext.jsx  # JWT + user state + inactivity timer
│   │   ├── hooks/                   # Shared custom hooks
│   │   │   ├── useInactivityTimer.js  # Auto-logout timer logic
│   │   │   ├── useActiveTimerIndicator.js  # Live timer indicator for job card rows
│   │   │   ├── useSettings.js     # Settings page state and handlers
│   │   │   ├── useTags.js         # Fetch tags by category with caching
│   │   │   └── useSearch.js       # Search page state, filters, debounced API calls
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
│   │   │   └── pdfFiller.js      # PDF form field auto-fill with pdf-lib
│   │   ├── db/
│   │   │   ├── database.js       # SQLite schemas + prepared statements
│   │   │   └── init.js           # Migrations + default admin setup
│   │   └── routes/               # Express route modules
│   └── index.js                  # Express entry point
├── worker-client/               # Lightweight Electron client for LAN workers
│   ├── main.js                  # Electron main process (IP config + connect to server)
│   ├── preload.js               # IPC bridge for setup page
│   ├── setup.html               # First-launch server IP entry form
│   └── package.json             # Electron + electron-builder config
└── data/
    ├── jobcard.db                # SQLite database file
    └── config.json               # Auto-generated JWT secret (persisted)
```

### API Structure
Base URL: `/api` (relative; Vite dev server proxies to `http://localhost:3000`, production serves client statically from Express)

Main routes: `/auth`, `/jobcards`, `/contacts`, `/suppliers`, `/machines`, `/settings`, `/history`, `/qa-levels`, `/tags`, `/search`

Tag endpoints: `GET /tags` (authenticated, optional `?category=treatment`), `GET /tags/categories` (authenticated), `GET /tags/:id` (admin), `POST /tags` (admin, `{ category, name }`), `PUT /tags/:id` (admin), `DELETE /tags/:id` (admin)

Settings endpoints: `GET /settings` (admin), `PUT /settings` (admin), `GET /settings/inactivity-timeout` (all users), `POST /settings/export-backup` (admin, creates ZIP at `outputPath` with database + job folder files), `POST /settings/import-backup` (admin, restores from ZIP at `inputPath`, requires `job_folders_base` configured)

History sub-routes: `GET /history` (recent, admin), `GET /history/user/:userId` (admin), `GET /history/entity/:entityType?page=1` (admin, type = `user`|`contact`|`supplier`|`machine`, returns `{ data, total, page, totalPages }` with 50 items/page)

Auth sub-routes: `PUT /auth/change-password` (all authenticated users, verifies current password)

Job card sub-routes: `/jobcards/:id/items`, `/assignees`, `/subcontracts`, `/time-entries`, `/costing`, `/documents`, `/job-files`, `/qa-form-files`, `/customer-property-files`, `/qa-forms`, `/history`, `/notes`

Job file endpoints: `GET /jobcards/:id/job-files` (assignee/admin, lists files from job's Job Files folder on disk), `GET /jobcards/:id/job-files/:filename` (assignee/admin, returns file as base64), `POST /jobcards/:id/job-files/from-scanner` (assignee/admin, copy scanner file to Job Files), `POST /jobcards/:id/job-files/upload` (assignee/admin, save base64 data to Job Files)

QA form file endpoints: `GET /jobcards/:id/qa-form-files` (assignee/admin, lists files from job's QA Forms folder on disk), `GET /jobcards/:id/qa-form-files/:filename` (assignee/admin, returns file as base64), `POST /jobcards/:id/qa-form-files/from-scanner` (assignee/admin, copy scanner file to QA Forms), `POST /jobcards/:id/qa-form-files/upload` (assignee/admin, save base64 data to QA Forms)

Customer property file endpoints: `GET /jobcards/:id/customer-property-files` (assignee/admin, lists files from job's Customer Property folder on disk), `GET /jobcards/:id/customer-property-files/:filename` (assignee/admin, returns file as base64), `POST /jobcards/:id/customer-property-files/from-scanner` (assignee/admin, copy scanner file to Customer Property), `POST /jobcards/:id/customer-property-files/upload` (assignee/admin, save base64 data to Customer Property)

QA level endpoints: `GET /qa-levels` (authenticated, non-admin sees active only), `GET /qa-levels/:id` (admin), `POST /qa-levels` (admin), `PUT /qa-levels/:id` (admin), `DELETE /qa-levels/:id` (admin, blocked if used by jobs), `POST /qa-levels/:id/templates` (admin, upload PDF), `GET /qa-levels/:id/templates` (admin), `DELETE /qa-levels/:id/templates/:tid` (admin)

Document endpoints: `GET /jobcards/:id/documents/:documentId` (assignee/admin, returns document with file data as base64)

Timer endpoints: `GET /jobcards/active-timer` (authenticated), `POST /jobcards/:id/time-entries/start` (assignee/admin), `POST /jobcards/:id/time-entries/:entryId/stop` (assignee/admin), `PATCH /jobcards/:id/time-entries/:entryId/toggle-special` (admin, toggle special labour flag)

Notes endpoints: `GET /jobcards/:id/notes` (assignee/admin), `POST /jobcards/:id/notes` (assignee/admin), `DELETE /jobcards/:id/notes/:noteId` (admin only)

Search endpoint: `GET /search` (authenticated, scoped). Query params: `scope` (all|jobs|people|activity|time), `q` (text query), `page`, `status`, `assigneeId`, `priority`, `jobType`, `qaLevel`, `dateFrom`, `dateTo`, `dateField` (created|due), `includeArchived`, `peopleType` (both|contacts|suppliers), `userId`, `action`, `entityType`, `field` (search within changes JSON keys), `workerId`, `machineId`, `specialOnly`, `jobNumber`. Scopes `people` and `activity` are admin-only. `time` scope restricts non-admin to own entries. `all` scope returns grouped previews (top 5 per category with counts); other scopes return paginated results (25/page).

### Database Schema (SQLite)
Core tables: `users`, `contacts`, `suppliers`, `jobcards`, `job_items`, `job_assignees`, `subcontracts`, `time_entries`, `job_costings`, `documents`, `qa_forms`, `qa_levels`, `qa_level_templates`, `history`, `settings`, `machines`, `job_notes`, `tags`, `supplier_service_tags`

**Unified tags system**: The `tags` table stores all dynamic dropdown/multi-select options with columns: `id`, `category` (treatment/customer_property/drawings/job_type), `name`, `value`, `sort_order`, `created_at`. The `supplier_service_tags` junction table links suppliers to treatment tags. Frontend uses the `useTags(category)` hook from `client/src/hooks/useTags.js` to fetch tags dynamically. Admin manages tags and equipment via the "Tags & Equipment" page (`/tags`). Equipment is managed through the existing `machines` table but shares the same admin UI.

**Contacts model** (company-primary): Each contact requires a `company_name` (NOT NULL); `contact_name` is optional. Search autocomplete is on the Company field, with dropdown showing **Company (Contact)** format. Search filters by both `company_name` and `contact_name`. Job cards link to contacts via `contact_id` with override fields for per-job customization.

All changes logged to `history` table for audit trail.

**Job card auto-numbering**: Job numbers are auto-generated from two settings: `job_number_prefix` (e.g. `"DH-"`) and `job_number_next` (e.g. `"00001"`). The format preserves leading zeros (width of `job_number_next` string). On each job card creation, the server generates `{prefix}{paddedNumber}`, validates uniqueness, inserts the record, then increments `job_number_next`. Deleted job numbers are never reused (counter only goes forward). The job number field is read-only in the create form. Admin configures prefix and starting number in Settings > Job Card Numbering. If not configured, job card creation is blocked with an error message.

**Automatic folder management**: When `job_folders_base` setting is configured, the system auto-creates `[base]/[Company]/` on contact create/update and `[base]/[Company]/[JobNumber]/Job Files/` + `QA Forms/` + `Customer Property/` on job card create. On job card deletion, the job card folder (`[base]/[Company]/[JobNumber]/`) is recursively deleted but the parent company folder is preserved. Folder operations are fire-and-forget (errors logged, never block DB operations). Names are sanitized for cross-platform filesystem safety with path traversal protection.

**QA Level system**: Paper-based quality assurance workflow. The full cycle:
1. **Admin creates QA levels** (e.g. "Standard", "Critical") and uploads PDF template forms to each level. Templates stored at `[job_folders_base]/QA Levels/[LevelName]/`.
2. **Job card creation/update with QA level** triggers: template PDFs are copied to `[base]/[Company]/[JobNumber]/QA Forms/`, fillable form fields are auto-populated with job data via `pdf-lib` (see `server/src/utils/pdfFiller.js` for field mappings), and `qa_forms` DB rows are created to track each form (status: PENDING).
3. **Workers print** the pre-filled PDFs, **fill inspection results by hand** at the machine, then **scan completed forms** back using the upload flow (QuickActionPanel → Upload Document → pick category → Scanner/Camera → auto-saved).
4. **Scanned documents** are saved directly to on-disk folders (Job Files, QA Forms, or Customer Property) via `POST /jobcards/:id/job-files/from-scanner`, `POST /jobcards/:id/qa-form-files/from-scanner`, or `POST /jobcards/:id/customer-property-files/from-scanner`. Camera photos are saved via the `/upload` endpoints.
5. **Anyone can view** documents: QuickActionPanel → "View Documents" (tabbed view with QA Forms, Job Files, Customer Property tabs), or JobCardModal → Files tab (expandable folder list with QA Forms, Job Files, Customer Property). Images can be viewed via lightbox, PDFs via inline viewer.

PDFs without fillable fields are copied as-is (blank templates for handwriting). See `docs/QA-PDF-TEMPLATE-GUIDE.md` for supported field names and template creation instructions. The `qualityLevel` column stores the level name, `qa_level_id` is the FK to `qa_levels`.

**Time entries**: Simplified to core fields only (item#, machine#, qty, description, start/end time). QA inspection data is captured via the paper form workflow above, not digitally in time entries. The `time_entries` DB table retains legacy QA columns (equipmentChecksDone, firstOffInspection, scrapAllGood, etc.) but they are not used by the current UI. **Special labour**: Each time entry has an `is_special_labour` flag (default 0) toggled by admins in the Costing tab. Labour hours are auto-calculated server-side from completed time entries, split into regular and special hours. **Active timer protection**: Server blocks DELETE on entries with no `end_time` (returns 400). Admin Costing tab shows only a Stop button for active entries (no Edit/Delete until stopped). `useTimer` polls every 5s while a timer is active; if an admin stops it externally, the employee sees a toast notification and the time entries list refreshes automatically. **Stop timer form** (`StopTimerForm.jsx`): When a worker stops their timer, a full-screen form appears with expandable item cards — each item has its own qty, machine checkboxes, and description. Data is combined into a **single time entry** (one stop = one entry) with comma-separated `itemNumber` and `qty` fields, union of machines, and combined description format `#1: desc; #2: desc`. Clicking X resumes the timer by clearing `end_time` on the original entry (preserves original `startTime`). The Costing tab parses these combined fields back into per-item detail lines for display.

### Authentication
- Two roles: `admin` (full access) and `user` (limited)
- Admin-only: user management, supplier management, equipment management, QA level management, costing, settings, activity log, **contact/customer info**, **job card creation/deletion**, **note deletion**
- **Employee (user) role**: Read-only job card view (Details tab renders as styled text, not inputs) except status dropdown (employees can change job status via `PATCH /:id/status`). Tabs hidden from employees: Items, Subcontracts, Files, Costing, Activity Log. Employees use Start/Stop timer for time tracking (one active timer at a time, enforced server-side). Can add notes but not delete them. **Quick Action Panel**: All users clicking a job card row see a QuickActionPanel (centered modal) with 4 large buttons: Upload Document, Start/Stop Timer, View Documents, and View Details. **Upload flow**: Upload Document → pick category (QA Form, Job Files, or Customer Property) → choose Scanner or Camera → file saved automatically to the selected folder. **View Documents**: Tabbed view with QA Forms, Job Files, and Customer Property tabs showing files from each folder (images viewable via lightbox). Clicking "View Details" opens the full JobCardModal. Active timers show a pulsing green indicator on job card rows for all users.
- **Job card visibility**: All authenticated users can see and access all job cards (same visibility as admin). Non-admin users remain read-only with limited actions (status change, timer, notes). Assignees are still tracked via `job_assignees` for display purposes and admin filtering.
- **Settings page**: Non-admin users see only Appearance (dark mode) and Change PIN. Admin users see all cards (App Info, Current User, Printers, Security Settings, Scanner Folder, Job Folders, Data Backup, Server Connection).
- Default credentials: `admin` / `1234`
- **No token persistence**: JWT stored in memory only (not localStorage). Users must log in every time they open/refresh the app. Designed for shared workstation security.
- **Inactivity timeout**: Users auto-logout after configurable period of inactivity (default 5 min). Warning modal appears 30 seconds before logout. Activity = mouse, keyboard, touch, scroll. Timer continues when tab is hidden (security for shared workstations).
- **Contact info hidden from non-admin**: All customer/contact data (name, company, phone, email) is stripped from API responses for non-admin users. Server nulls out contact fields in `formatJobcard()`, deletes contact fields from POST/PUT request bodies, and all `/contacts` endpoints require admin. Client hides Customer column in tables, hides Contact section in DetailsTab, and skips contact creation logic in JobCardModal submit.

## Key Patterns

- **Direct API**: All components use `api.js` to communicate directly with the Express server. Components load data on mount and refresh after mutations.
- **JobCardModal**: Modular tab-based UI with custom hooks for each tab's logic (`useCosting.js`, `useTimeEntries.js`, `useTimer.js`, `useJobNotes.js`, `useSubcontracts.js`, `useCamera.js`, `useJobCardForm.js`, `useContactSearch.js`)
- **Prepared statements**: Database queries use better-sqlite3 prepared statements defined in `database.js`
- **History tracking**: Use `recordHistory()` for server-side data mutations to maintain audit trail
- **Input validation**: Use `express-validator` middleware from `validation.js` for request validation
- **Structured logging**: Use `logger` from `utils/logger.js` instead of `console.error()` for server-side logging
- **Toast notifications**: Use `react-hot-toast` for user feedback instead of `alert()`
- **Modal accessibility**: Use `role="alertdialog"`, `aria-modal="true"`, `aria-labelledby`/`aria-describedby`, focus trap (prevent Tab from leaving), and Escape key handler
- **Auto-formatting on blur**: Name and text fields auto-format when the user leaves the field (`onBlur`). Utilities are in `client/src/utils/formatters.js`:
  - `toTitleCase` — for name fields (person names, company names, display names, tag/label names). Produces "John Snow" style.
  - `capitalizeFirst` — for text fields (descriptions, notes, addresses). Capitalizes only the first letter.
  - `snakeToTitleCase` — for displaying DB enum values stored as UPPER_SNAKE_CASE (e.g. `"REVERSE_ENGINEER"` → `"Reverse Engineer"`). Used for jobType display on Dashboard, JobCardList, DetailsReadOnlyView, and Excel exports.
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
| Components | PascalCase.jsx | `Dashboard.jsx` |
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
