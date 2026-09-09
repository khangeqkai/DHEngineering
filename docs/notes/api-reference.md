# Endpoint reference (the less-obvious ones)

> Detail split out of CLAUDE.md. The graph and a plain search will find any route faster than this file; what is kept here is behaviour a route's code does not make obvious.

## Base

Base URL: `/api` (relative; Vite dev server proxies to `http://localhost:3000`, production serves client statically from Express)

## Statistics

Statistics endpoint: `GET /api/statistics` (management) — aggregates workshop throughput, on-time delivery rate, worker hours leaderboard (split by normal, OT1, OT2, and holiday tiers respecting each job's captured costing rules), equipment utilization (with multi-machine entry splitting), customer repeat work volume, delayed jobs bottleneck list, and QA level distribution. Accepts query params: `preset` (`this_month`|`last_month`|`last_3_months`|`last_6_months`|`this_year`|`last_year`|`all`|`custom`), `startDate`, `endDate`, `groupBy` (`month`|`year`). Hides invoiced financial totals for non-admin managers. Managed on the **Workshop Statistics** page (`/statistics`, `Statistics.jsx` + `components/statistics/` sub-views + `exportStatistics` in `excelExport.js`).

## Settings

Settings endpoints: `GET /settings` (admin) — also returns three read-only, non-secret fields for the Server Connection card so it can show other computers exactly what address to type: `serverAddresses` (this machine's real LAN IPv4s, virtual/VM adapters filtered out by `lanIpv4s` in `utils/netHost.js`), `secureServing` (whether HTTPS/padlock serving is on, i.e. `config.secure`), and `mdnsName` (the friendly local name the app announces itself under, default `jobcards.local`). `PUT /settings` (admin), `GET /settings/inactivity-timeout` (all users), `POST /settings/export-backup` (admin, creates ZIP at `outputPath` with database + job folder files), `POST /settings/import-backup` (admin, restores from ZIP at `inputPath`, requires `job_folders_base` configured). `PUT /settings` also accepts the **overtime configuration** (all validated server-side in `settings-overtime.js`, extracted beside `settings.js`): `timezone` (an IANA zone the overtime schedule/holidays are measured against — rejected unless `Intl.DateTimeFormat` recognises it), `labourSchedule` (a 7-day weekly schedule object; each day is a non-empty, strictly-increasing block list, each block `{ start: 'HH:MM', tier: 'normal'|'ot1'|'ot2' }` — a block runs until the next block's start, and each day is a **24-hour cycle**: the time before the earliest block wraps to the **last** block's tier, so blocks may start at any time with no forced `00:00` anchor), `labourDefaultRate` (the company-wide default base hourly rate, a number ≥ 0, stored as `labour_default_rate`), `labourOt1Multiplier` / `labourOt2Multiplier` / `labourHolidayMultiplier` (each a number ≥ 1), and `labourPublicHolidays` (array of `YYYY-MM-DD` local dates, de-duped and sorted). Managed on the admin **Labour Rates & Overtime** page (`/labour-rates`, `LabourRatesSettings.jsx` + `hooks/useLabourRates.js` + `components/settings/labour/` sub-cards); see the overtime tiers in `docs/notes/time-and-costing.md`.

## Activity trail

History sub-routes: `GET /history?limit=50&offset=0` (recent, admin — `limit` is capped at 500 and `offset` pages backwards through the trail, ordered `created_at DESC, rowid DESC` so a page boundary can't repeat or skip entries that share a timestamp; the Activity Log's "export everything" walks pages of 500 until one comes back short, since a single huge `limit` was silently truncated to 500 and exported only the newest slice), `GET /history/user/:userId` (admin), `GET /history/entity/:entityType?page=1` (admin, type = `user`|`company`|`contact`|`supplier`|`machine`, or a comma-separated list of them, returns `{ data, total, page, totalPages }` with 50 items/page)

## Search

Search endpoint: `GET /search` (authenticated, scoped). Query params: `scope` (all|jobs|people|activity|time), `q` (text query), `page`, `status`, `assigneeId`, `priority`, `jobType` (matches any item.job_type), `qaLevel`, `dateFrom`, `dateTo`, `dateField` (created|due), `includeArchived`, `peopleType` (both|contacts|suppliers), `userId`, `action`, `entityType`, `field` (search within changes JSON keys), `workerId`, `machineId`, `jobNumber`. Scopes `people` and `activity` are admin-only. `time` scope restricts non-admin to own entries. `all` scope returns grouped previews (top 5 per category with counts); other scopes return paginated results (25/page).
