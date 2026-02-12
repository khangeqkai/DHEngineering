# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DH Engineering Job Card System - A full-stack Electron/React/Express application for managing job cards, quotes, customers, suppliers, and manufacturing operations. Designed for offline-first desktop use with LAN sync capability.

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
- **Frontend**: React 18 + React Router, Vite bundler, Electron 27
- **Backend**: Express 4, better-sqlite3 (synchronous SQLite)
- **Auth**: JWT (7-day expiry), bcryptjs password hashing
- **Offline**: Dexie (IndexedDB wrapper) for client-side caching

### Directory Structure
```
jobcard-system/
├── client/
│   ├── src/
│   │   ├── components/           # React components
│   │   │   ├── jobcard/          # JobCardModal + tabs (modular)
│   │   │   │   ├── tabs/         # 7 tab components
│   │   │   │   └── use*.js       # Custom hooks (useCosting, useTimeEntries, etc.)
│   │   │   └── common/           # Reusable components
│   │   ├── context/AuthContext.jsx  # JWT + user state
│   │   └── services/api.js       # Centralized API client
│   └── electron/                 # Electron main/preload
├── server/
│   ├── src/
│   │   ├── config.js             # Port, JWT, DB path settings
│   │   ├── middleware/auth.js    # JWT verification + role checking
│   │   ├── db/
│   │   │   ├── database.js       # SQLite schemas + prepared statements
│   │   │   └── init.js           # Migrations + seeding
│   │   └── routes/               # Express route modules
│   └── index.js                  # Express entry point
└── data/jobcard.db               # SQLite database file
```

### API Structure
Base URL: `http://localhost:3000/api`

Main routes: `/auth`, `/jobcards`, `/customers`, `/suppliers`, `/machines`, `/settings`, `/history`

Job card sub-routes: `/jobcards/:id/items`, `/assignees`, `/subcontracts`, `/time-entries`, `/costing`, `/documents`, `/qa-forms`, `/history`

### Database Schema (SQLite)
Core tables: `users`, `customers`, `suppliers`, `jobcards`, `job_items`, `job_assignees`, `subcontracts`, `time_entries`, `job_costings`, `documents`, `qa_forms`, `history`, `settings`, `machines`

All changes logged to `history` table for audit trail.

### Authentication
- Two roles: `admin` (full access) and `user` (limited)
- Admin-only: user management, supplier management, costing, settings, activity log
- Default credentials: `admin` / `admin123`

## Key Patterns

- **JobCardModal**: Modular tab-based UI with custom hooks for each tab's logic (`useCosting.js`, `useTimeEntries.js`, `useSubcontracts.js`, `useCamera.js`)
- **API client**: All backend calls go through `client/src/services/api.js` which handles auth headers and base URL
- **Prepared statements**: Database queries use better-sqlite3 prepared statements defined in `database.js`
- **History tracking**: Use `recordHistory()` for all data mutations to maintain audit trail

## Architectural Guidelines

### File Size Limits
- **Maximum 600 lines per file** - Refactor when approaching this limit
- Extract custom hooks when domain logic exceeds ~150 lines
- Split into tab/section components when UI grows complex
- CSS files are exempt (styling can be large)

### Separation of Concerns
- **Custom hooks** (`use*.js`): Encapsulate domain logic (state, handlers, API calls)
- **Mappers** (`mappers.js`): Transform data between API and internal formats
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
| DB fields | snake_case | `customer_id` |
| API responses | camelCase | `customerId` |
| Internal state | snake_case | `form_data.customer_id` |
| Constants | UPPER_SNAKE_CASE | `JOB_TYPES` |

### Data Flow Convention
Database (snake_case) → API response (camelCase) → Mapper → Internal state (snake_case)

Use mapper functions in `mappers.js` to convert between formats explicitly.

### Required Patterns
- **Audit trail**: Call `recordHistory()` for all data mutations
- **Prepared statements**: Use queries defined in `database.js`, never inline SQL
- **Error handling**: Try-catch with `console.error()` and user-friendly alert
- **Form state**: Single state object + unified `handleChange` handler

## Environment Variables

```
PORT=3000                    # Server port
HOST=0.0.0.0                 # Server host (0.0.0.0 for LAN access)
JWT_SECRET=your-secret       # Production JWT signing key
JWT_EXPIRES_IN=7d            # Token expiration
```
