# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DH Engineering Job Card System - A full-stack Electron/React/Express application for managing job cards, quotes, customers, suppliers, and manufacturing operations. Designed for LAN-connected desktop use with a central server.

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
- **Auth**: JWT (7-day expiry), bcryptjs password hashing, rate-limited login (5 attempts/15 min)

### Directory Structure
```
jobcard-system/
├── client/
│   ├── src/
│   │   ├── components/           # React components
│   │   │   ├── jobcard/          # JobCardModal + tabs (modular)
│   │   │   │   ├── tabs/         # 7 tab components
│   │   │   │   └── use*.js       # Custom hooks (useCosting, useTimeEntries, useJobCardForm, useCustomerSearch, etc.)
│   │   │   └── common/           # Reusable components
│   │   ├── context/AuthContext.jsx  # JWT + user state
│   │   └── services/
│   │       └── api.js            # Direct API client to Express server
│   └── electron/                 # Electron main/preload
├── server/
│   ├── src/
│   │   ├── config.js             # Port, JWT, DB path settings
│   │   ├── middleware/
│   │   │   ├── auth.js           # JWT verification + role checking + rate limiting
│   │   │   └── validation.js     # express-validator reusable validators
│   │   ├── utils/
│   │   │   └── logger.js         # Pino structured logging
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

- **Direct API**: All components use `api.js` to communicate directly with the Express server. Components load data on mount and refresh after mutations.
- **JobCardModal**: Modular tab-based UI with custom hooks for each tab's logic (`useCosting.js`, `useTimeEntries.js`, `useSubcontracts.js`, `useCamera.js`, `useJobCardForm.js`, `useCustomerSearch.js`)
- **Prepared statements**: Database queries use better-sqlite3 prepared statements defined in `database.js`
- **History tracking**: Use `recordHistory()` for server-side data mutations to maintain audit trail
- **Input validation**: Use `express-validator` middleware from `validation.js` for request validation
- **Structured logging**: Use `logger` from `utils/logger.js` instead of `console.error()` for server-side logging
- **Toast notifications**: Use `react-hot-toast` for user feedback instead of `alert()`

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
| DB fields | snake_case | `customer_id` |
| API responses | camelCase | `customerId` |
| Internal state | snake_case | `form_data.customer_id` |
| Constants | UPPER_SNAKE_CASE | `JOB_TYPES` |

### Data Flow Convention

**Standard API flow:**
```
User Action → API Request → Express Server → SQLite Database
     ↑                                              ↓
Component ← JSON Response ← Express Response ←──────┘
```

- API requests/responses use camelCase (JavaScript convention)
- Database uses snake_case (SQL convention)
- Components manage local state with useState
- Reload data after mutations to ensure UI is up-to-date

### Required Patterns
- **Direct API calls**: Use `api.js` methods for all server communication
- **Audit trail**: Call `recordHistory()` for all server-side data mutations
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
JWT_EXPIRES_IN=7d            # Token expiration
LOG_LEVEL=info               # Logging level (debug, info, warn, error)
NODE_ENV=production          # Environment (development uses pretty logs)
```

## Security Features

- **Rate limiting**: Login (5 attempts/15 min) and user creation (10 attempts/15 min) per IP
- **Password policy**: Minimum 8 characters required for new users
- **Input validation**: All API inputs validated with express-validator
- **JWT authentication**: 7-day token expiry with role-based access control
- **Audit trail**: All data mutations logged to history table (including failed login attempts)
- **Prepared statements**: All database queries use prepared statements (SQL injection protection)
