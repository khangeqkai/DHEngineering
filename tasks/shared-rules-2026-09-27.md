# Shared rules — one file, loaded by both the server and the client

Date: 2026-09-27. Approved by the user as an architecture change.

## Problem
Three rules are written twice, once in server code and once in client code, kept in step only by comments:
- real-calendar-day check: `server/src/utils/calendarDate.js` `isCalendarDate` vs `client/src/utils/formatters.js` `isCalendarDate`
- rounding: `server/src/utils/round.js` `roundTo` vs `client/src/utils/formatters.js` `roundTo`
- overtime day schedule ↔ 24 hourly tiers: `server/src/utils/overtimeSchedule.js` `scheduleDayToWholeHours` vs `client/src/hooks/useLabourRates.js` `gridFromBlocks` / `blocksFromGrid` / `normalize`

The client can already import JSON from `server/src/shared/` (see `client/src/utils/roles.js`, `vite.config.js` `server.fs.allow`), but not code: the server is CommonJS running inside Electron 27 (Node 18 — cannot `require()` ES modules), and Vite does not convert CommonJS source files outside node_modules in dev.

## Design
1. **Convention for `server/src/shared/*.js` ("shared rule files")** — plain CommonJS, pure functions, no Node or browser APIs, no dependencies except other files in `server/src/shared/`. Only these statement forms touch modules:
   - `const name = require('./x.json');` or `const { a, b } = require('./x');` (relative paths inside `shared/` only)
   - exactly one final `module.exports = { a, b, c };` (shorthand names only)
2. **A small Vite plugin, defined inline in `client/vite.config.js`** (`enforce: 'pre'`), applies to module ids that resolve inside `server/src/shared/` and end in `.js`. It rewrites:
   - `const X = require('P');` → `import X from 'P';`
   - `const { a, b } = require('P');` → `import { a, b } from 'P';` (a `require` of a `.js` sibling must keep working — append `.js` if the path has no extension)
   - `module.exports = { a, b };` → `export { a, b };`
   After rewriting, if the code still contains `require(` or `module.exports` or `exports.`, the plugin throws an error naming the file and saying the shared-rule convention was broken. The plugin runs in both dev and build. Comment it in the house style: why it exists (one file, both sides) and the convention it enforces.
3. **Move** (git mv where possible — not copy):
   - `server/src/utils/calendarDate.js` → `server/src/shared/calendarDate.js`
   - `server/src/utils/round.js` → `server/src/shared/round.js`
   - `server/src/utils/overtimeSchedule.js` → `server/src/shared/overtimeSchedule.js`
   Each must satisfy the convention (check that none of them uses Node APIs).
4. **Overtime schedule**: `shared/overtimeSchedule.js` additionally exports `gridFromBlocks(blocks)` and `blocksFromGrid(grid)` (move the client's versions, same semantics), and `scheduleDayToWholeHours(day)` becomes: clean (drop blocks whose start isn't `HH:MM`, unknown tier → `'normal'`, sort), empty → `DEFAULT_DAY` copy, else `blocksFromGrid(gridFromBlocks(cleaned))`. Output must be identical to today's for every input — prove it with the test script below by comparing against a copy of today's implementation over a set of cases (valid whole-hour days, sub-hour starts, bad tiers, bad starts, empty, all-one-tier, wrap cases).
   - `client/src/hooks/useLabourRates.js`: delete its own `toMin`, `hourLabel`, `gridFromBlocks`, `blocksFromGrid` and the cleaning inside `normalize()`; import from the shared file. `normalize()` per day becomes `scheduleDayToWholeHours(obj?.[d.key])` **only if** that gives exactly what `normalize` returns today — today's client normalize does NOT snap to whole hours (it only cleans + sorts). If replacing it would change what the page shows for any input, keep the clean+sort in a shared exported `cleanDayBlocks(day)` that both `scheduleDayToWholeHours` and `normalize` call, and report which you did. `DAYS`/`TIERS` in useLabourRates stay built from the shared file's `DAYS`/`TIERS` (replace the overtime.json import with the shared module import). Anything else importing `gridFromBlocks`/`blocksFromGrid` from useLabourRates (e.g. `client/src/components/settings/labour/ScheduleEditor.jsx`) imports from the shared file directly — no re-export left behind.
5. **Callers** — repoint every import, no re-exports or aliases left behind:
   - server: every `require('../utils/calendarDate')`, `require('../utils/round')`, `require('./round')`, `require('../utils/overtimeSchedule')` etc. → the `shared/` path. grep to find all.
   - client: delete `isCalendarDate` and `roundTo` bodies from `client/src/utils/formatters.js`; every client file importing them from formatters imports from the shared file instead (relative path, like `roles.js` does for permissions.json). If formatters.js itself uses them internally, it imports them too.
   - delete the "kept in step by hand" / "twin" comments on both sides.
6. **Docs**: in `/mnt/c/Users/khang/Code/DHEngineering/CLAUDE.md`, under "Architectural Guidelines", add one short bullet section "Shared rule files" stating the convention (item 1) and that the Vite plugin enforces it; update any `docs/notes/*.md` that names the moved files' old paths.

## Constraints
- Never run npm install / npm rebuild or load better-sqlite3 from WSL (node_modules is shared with Windows). Don't commit.
- camelCase, comment density matching the surrounding code.

## Verification
- `node --check` every changed server `.js`.
- A throwaway script in `/tmp/claude-1000/` that: (a) requires the three shared files from Node and runs the equivalence cases from item 4 plus isCalendarDate/roundTo spot checks; (b) imports the plugin's transform function logic (copy it or export it for the test) and runs it over every file in `server/src/shared/*.js`, writes the output to temp `.mjs` files (JSON imports can be swapped for inlined objects in the temp copy) and dynamically `import()`s them in Node to prove the rewritten ESM loads and exports the same names.
- Try `npx vite build` from `client/` once; if it fails because of the platform (esbuild/rollup native binary built for Windows), say so and don't try to fix it.

## Gate
Allowed: `client/vite.config.js`, `server/src/shared/*` (new/moved), the three moved-from `server/src/utils/` files (removed), server files whose `require` paths change, `client/src/utils/formatters.js`, `client/src/hooks/useLabourRates.js`, client files whose imports change, `CLAUDE.md`, `docs/notes/*.md`. Report per numbered item, the equivalence results, anything not done as written, and paste `git diff --stat` + `git status --short`.
