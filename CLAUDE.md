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
```

## Architecture

### Stack
- **Frontend**: React 18 + React Router, Vite bundler, Electron 27, react-hot-toast (notifications)
- **Backend**: Express 4, better-sqlite3 (synchronous SQLite), pino (logging), express-validator, express-rate-limit
- **Auth**: JWT (memory-only, no localStorage), bcryptjs password hashing, rate-limited login (5 attempts/15 min)

### Directory Structure
```
jobcard-system/
├── client/
│   ├── src/
│   │   ├── components/           # React components
│   │   │   ├── jobcard/          # JobCardModal + tabs (modular)
│   │   │   │   ├── tabs/         # Tab components + DetailsReadOnlyView, NotesSection
│   │   │   │   └── use*.js       # Custom hooks (useCosting, useTimeEntries, useTimer, useJobNotes, useJobCardForm, useContactSearch, useCamera, etc.)
│   │   │   └── common/           # Reusable components
│   │   ├── context/AuthContext.jsx  # JWT + user state + inactivity timer
│   │   ├── hooks/                   # Shared custom hooks
│   │   │   ├── useInactivityTimer.js  # Auto-logout timer logic
│   │   │   └── useActiveTimerIndicator.js  # Live timer indicator for job card rows
│   │   └── services/
│   │       └── api.js            # Direct API client to Express server
│   └── electron/                 # Electron main/preload
├── server/
│   ├── src/
│   │   ├── config.js             # Port, JWT, DB path settings
│   │   ├── middleware/
│   │   │   ├── auth.js           # JWT verification + role checking + rate limiting + assignee access
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
└── data/jobcard.db               # SQLite database file
```

### API Structure
Base URL: `http://localhost:3000/api`

Main routes: `/auth`, `/jobcards`, `/contacts`, `/suppliers`, `/machines`, `/settings`, `/history`, `/qa-levels`

Settings endpoints: `GET /settings` (admin), `PUT /settings` (admin), `GET /settings/inactivity-timeout` (all users)

History sub-routes: `GET /history` (recent, admin), `GET /history/user/:userId` (admin), `GET /history/entity/:entityType?page=1` (admin, type = `user`|`contact`|`supplier`, returns `{ data, total, page, totalPages }` with 50 items/page)

Auth sub-routes: `PUT /auth/change-password` (all authenticated users, verifies current password)

Job card sub-routes: `/jobcards/:id/items`, `/assignees`, `/subcontracts`, `/time-entries`, `/costing`, `/documents`, `/drawings-files`, `/qa-documents-files`, `/qa-forms`, `/history`, `/notes`

Drawings file endpoints: `GET /jobcards/:id/drawings-files` (assignee/admin, lists files from job's Drawings folder on disk), `GET /jobcards/:id/drawings-files/:filename` (assignee/admin, returns file as base64)

QA document file endpoints: `GET /jobcards/:id/qa-documents-files` (assignee/admin, lists files from job's QA Documents folder on disk), `GET /jobcards/:id/qa-documents-files/:filename` (assignee/admin, returns file as base64)

QA level endpoints: `GET /qa-levels` (authenticated, non-admin sees active only), `GET /qa-levels/:id` (admin), `POST /qa-levels` (admin), `PUT /qa-levels/:id` (admin), `DELETE /qa-levels/:id` (admin, blocked if used by jobs), `POST /qa-levels/:id/templates` (admin, upload PDF), `GET /qa-levels/:id/templates` (admin), `DELETE /qa-levels/:id/templates/:tid` (admin)

Document endpoints: `GET /jobcards/:id/documents/:documentId` (assignee/admin, returns document with file data as base64)

Scanner attach endpoint: `POST /jobcards/:id/documents/from-scanner` (assignee/admin, attaches a file from configured scanner folder as a document)

Timer endpoints: `GET /jobcards/active-timer` (authenticated), `POST /jobcards/:id/time-entries/start` (assignee/admin), `POST /jobcards/:id/time-entries/:entryId/stop` (assignee/admin)

Notes endpoints: `GET /jobcards/:id/notes` (assignee/admin), `POST /jobcards/:id/notes` (assignee/admin), `DELETE /jobcards/:id/notes/:noteId` (admin only)

### Database Schema (SQLite)
Core tables: `users`, `contacts`, `suppliers`, `jobcards`, `job_items`, `job_assignees`, `subcontracts`, `time_entries`, `job_costings`, `documents`, `qa_forms`, `qa_levels`, `qa_level_templates`, `history`, `settings`, `machines`, `job_notes`

**Contacts model** (phone contacts style): Each contact is a standalone person with a required company field. Search works on both `contact_name` and `company_name`. Job cards link to contacts via `contact_id` with override fields for per-job customization.

All changes logged to `history` table for audit trail.

**Automatic folder management**: When `job_folders_base` setting is configured, the system auto-creates `[base]/[Company]/` on contact create/update and `[base]/[Company]/[JobNumber]/Drawings/` + `QA Documents/` on job card create. On job card deletion, the job card folder (`[base]/[Company]/[JobNumber]/`) is recursively deleted but the parent company folder is preserved. Folder operations are fire-and-forget (errors logged, never block DB operations). Names are sanitized for cross-platform filesystem safety with path traversal protection.

**QA Level system**: Admin-managed quality levels with PDF templates. QA level folders stored at `[job_folders_base]/QA Levels/[LevelName]/`. When a job card is created or updated with a QA level, template PDFs are copied to the job's QA Documents folder with form fields auto-filled via `pdf-lib`. The `qualityLevel` column stores the level name, `qa_level_id` is the FK to `qa_levels`.

### Authentication
- Two roles: `admin` (full access) and `user` (limited)
- Admin-only: user management, supplier management, QA level management, costing, settings, activity log, **contact/customer info**, **job card creation/deletion**, **note deletion**
- **Employee (user) role**: Read-only job card view (Details tab renders as styled text, not inputs). Can only update photos via PUT. Tabs hidden from employees: Items, Subcontracts, Time, QA, Costing, Photos, Activity Log. Employees use Start/Stop timer for time tracking (one active timer at a time, enforced server-side). Can add notes but not delete them. **Quick Action Panel**: All users clicking a job card row see a QuickActionPanel (centered modal) with large buttons for Scan, Camera, Timer, View Documents, View Photos, and View Details. "View Documents" lists files from the job's QA Documents folder on disk with per-file View action. Clicking "View Details" opens the full JobCardModal. Active timers show a pulsing green indicator on job card rows for all users.
- **Job card visibility**: Non-admin users only see job cards they are assigned to (via `job_assignees`). Unassigned job cards are visible only to admins. All `/:id` routes (GET, PUT, and sub-resources) enforce assignee-or-admin access via `requireAssigneeOrAdmin` middleware. List routes use assignee-filtered queries instead.
- **Settings page**: Non-admin users see only Appearance (dark mode) and Change Password. Admin users see all cards (App Info, Current User, Printers, Security Settings, Scanner Folder, Job Folders, Server Connection).
- Default credentials: `admin` / `admin123`
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
  - Skip formatting for: phone, email, passwords, usernames, reference numbers, dates, numbers, search inputs, file paths.
  - Pattern: `onBlur={(e) => { const f = fn(e.target.value); if (f !== e.target.value) setState(...); }}`

## Architectural Guidelines

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
- **Audit trail**: Call `recordHistory(entityType, entityId, action, userId, userName, changes, snapshot)` for all server-side data mutations. **IMPORTANT: `changes` must always use `{ field: { from: oldVal, to: newVal } }` format** — this applies to ALL actions including creates, notes, timers, etc. The activity log UI (`formatChanges`) iterates `Object.entries(changes)` and renders `from → to` for each field. If you pass flat data or `null` for changes, nothing will display in the activity log. Only use `snapshot` (7th param) for supplementary context that doesn't need from/to display. Use `req.user.userId` (not `req.user.id`) for the userId parameter.
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
JWT_SECRET=your-secret       # Production JWT signing key
JWT_EXPIRES_IN=7d            # Token expiration (server-side, but session ends on app close anyway)
LOG_LEVEL=info               # Logging level (debug, info, warn, error)
NODE_ENV=production          # Environment (development uses pretty logs)
```

## Security Features

- **Rate limiting**: Login (first 5 attempts normal, then 30-second cooldown between attempts; resets after 15 min inactivity) and user creation (10 attempts/15 min) per IP
- **Password policy**: Minimum 8 characters, at least 1 uppercase letter, at least 1 number. Enforced on create user, update user password, and change own password. Not enforced on login.
- **Input validation**: All API inputs validated with express-validator
- **JWT authentication**: Memory-only token storage (no localStorage), role-based access control. Session ends on app close/refresh.
- **Inactivity auto-logout**: Configurable timeout (1-60 min, default 5 min) with 30-second warning modal. Admin configures in Settings. Handles system sleep/wake via visibility API.
- **Audit trail**: All data mutations logged to history table (including failed login attempts)
- **Prepared statements**: All database queries use prepared statements (SQL injection protection)
