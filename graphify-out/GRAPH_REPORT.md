# Graph Report - DHEngineering  (2026-11-18)

## Corpus Check
- 385 files · ~451,492 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 39 file(s) not represented in the graph (top: .css 31, (none) 3, .otf 3)

## Summary
- 3216 nodes · 8145 edges · 348 communities (136 shown, 212 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 716 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `588c20c1`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- isManagement
- jobcard-system/client/src/components/UserManagement.jsx
- DHEngineering/jobcard-system/client/src/components/JobCardListColumns.jsx
- historySentences.js
- resources/server/src/routes/jobcard-helpers.js
- Login Rate Limiting
- resources/server/src/utils/overtimeSplit.js
- jobcard-system/server/src/utils/logger.js
- EmptyState
- Inactivity Warning Modal
- jobcard-system/server/src/db/database.js
- JobCard Constants
- Entities Queries
- DB Operations
- QA Levels Queries
- Support Queries
- Hardware Routes
- gate.js
- lucide-react
- jobcard-system/client/src/hooks/useLabourRates.js
- jobcard-system/server/src/middleware/validation.js
- check-openingHours.js
- server/package.json
- jobcard-system/server/src/routes/settings.js
- jobcard-system/server/src/routes/jobcard-time-entries.js
- displayName
- Fixed
- jobcard-system/client/src/components/jobcard/useTimeEntries.js
- ApiService
- jobcard-system/server/src/routes/jobcard-helpers.js
- SearchPage.jsx
- jobcard-system/client/src/components/jobcard/StopTimerForm.jsx
- AuthContext.jsx
- jobcard-system/server/index.js
- statistics-helpers.js
- activitySentences.js
- jobcard-system/server/src/routes/search.js
- Time entries, overtime tiers and the costing sheet
- jobcard-system/client/src/components/jobcard/JobIdentityStrip.jsx
- legacyMigrations.js
- jobcard-system/server/src/routes/jobcard-mutations.js
- jobcard-system/server/scripts/seed-mock-data.js
- jobcard-system/server/src/routes/jobcards.js
- .request
- FinishQuestionProvider.jsx
- jobcard-system/client/src/components/JobCardList.jsx
- jobcard-system/client/src/components/jobcard/JobCardModal.jsx
- jobcard-system/server/src/routes/setup-trust.js
- jobcard-system/client/src/utils/formatters.js
- jobcard-system/server/src/routes/jobcard-files.js
- jobcard-system/client/src/utils/excelExport.js
- useCostingSave.js
- useAuth
- jobcard-system/server/scripts/seed-scenarios.js
- trailEntries.js
- jobcard-system/client/src/components/jobcard/tabs/ItemsTab.jsx
- Group P — pricing sheet boxes (executor P)
- CLAUDE.md
- jobcard-system/server/src/db/init.js
- jobcard-system/server/src/utils/certs.js
- Waves
- jobcard-system/client/electron/main.js
- useInstantItems.js
- jobCardWorkbook.js
- jobcard-system/scripts/launch.js
- columnDrops.js
- jobcard-system/server/src/utils/htmlToPdf.js
- client/package.json
- ref_path
- jobcard-system/client/src/components/jobcard/useJobCardForm.js
- jobcard-system/client/src/components/jobcard/tabs/TimeEntryCard.jsx
- scripts
- jobcard-system/scripts/setup.js
- recordHistory
- react
- jobcard-system/client/src/components/jobcard/tabs/DetailsTab.jsx
- closeReasons.js
- ActivityLog.jsx
- useInstantSave.js
- changeJobStatus.js
- build
- jobcard-system/client/src/components/JobCardListColumns.jsx
- jobcard-system/client/src/components/jobcard/tabs/LineItemSupplierPicker.jsx
- OnTimeTab.jsx
- safetyCopy.js
- jobcard-system/server/src/utils/folderCreation.js
- Design refactor — items 1–10
- Instant save on the job card — retiring the Save button
- DataTable
- isActiveRecord
- reset-admin-password.js
- check-startTimerUndo.js
- jobFiles.routes.test.js
- Spec — closing guard, unsaved-edits frame, money-entry safety
- Round 6: 2026-10-15
- Sign-in, sessions and security
- How files are stored on disk
- jobcard-system/client/src/components/LabourRatesSettings.jsx
- undefinedNames.test.js
- Round 3: 2026-10-15
- jobcard-system/client/src/hooks/useTags.js
- designTokens.test.js
- uid
- Round 4: 2026-10-15
- scriptImports.test.js
- One-time setup (about 30 minutes)
- DH Engineering Job Cards — How to Run
- SERVER steps
- SERVER (executor A)
- Round 7: 2026-10-15
- Job cards: numbering, status, billing and archiving, notes and assignees
- Sessions and signing out
- ref_node_fs
- .updateJobcardStatus
- screenRules.test.js
- jobcard-system/server/scripts/seed-data.js
- Frozen contracts
- CLIENT steps
- Round 8: 2026-10-15
- Round 1: 2026-10-15
- jobcard-system/client/vite.config.js
- scripts
- useJobCardSave.js
- ref_node_assert
- dependencies
- Work order A — the parts list
- Bug search log
- Endpoint reference (the less-obvious ones)
- nameRule.test.js
- Clean-up sweep — dead code, merged duplicates, file splits
- Spec — close the gaps the review found
- Field marks follow the box's value — 2026-09-27
- Fixed quality levels: Standard and Critical only (2026-09-28)
- One copy per rule — 2026-09-27 (follow-up to the duplicated-rules review)
- Review fixes — 2026-09-26 (second pass)
- Review fixes — 2026-09-27
- nsis
- jobcard-system/server/src/utils/jobCardHtml.js
- Frozen spec — app-wide layout sweep
- jev-gate
- Round 9: 2026-10-15 — causes, not spots
- createPinAttemptLimiter
- Files, printouts and quality levels
- Shared rules — one file, loaded by both the server and the client
- electron
- Settings-area polish (2026-09-28)
- AGENTS.md
- jobcard-system/server/scripts/seed-history.js
- Loose ends
- check.sh
- buildexe.sh
- install-hook.sh
- uninstall-hook.sh

## God Nodes (most connected - your core abstractions)
1. `react` - 112 edges
2. `ApiService` - 106 edges
3. `lucide-react` - 60 edges
4. `FieldError()` - 51 edges
5. `displayName()` - 51 edges
6. `react-hot-toast` - 48 edges
7. `api` - 46 edges
8. `useFieldErrors()` - 45 edges
9. `useAuth()` - 44 edges
10. `JobCardWindow()` - 43 edges

## Surprising Connections (you probably didn't know these)
- `R1-5: "Needs your attention" heading counted jobs, not questions. **Fixed**` --references--> `MentionsSection()`  [INFERRED]
  bug_search.md → jobcard-system/client/src/components/common/AttentionDialog.jsx
- `2a. `BottomSheet.jsx` — let a caller mark the window` --references--> `BottomSheet()`  [INFERRED]
  tasks/unsaved-frame-and-money-safety.md → jobcard-system/client/src/components/common/BottomSheet.jsx
- `Step 1 — Closing the job card asks before throwing away edits` --references--> `BottomSheet()`  [INFERRED]
  tasks/unsaved-frame-and-money-safety.md → jobcard-system/client/src/components/common/BottomSheet.jsx
- `Stage 2 — the people list goes instant` --references--> `buildJobcardPayload()`  [INFERRED]
  tasks/instant-save-job-card.md → jobcard-system/client/src/components/jobcard/mappers.js
- `Group C — status rule and time lock (findings 8, 13)` --references--> `showTimeLockedToast()`  [INFERRED]
  tasks/one-copy-rules-2026-09-27.md → jobcard-system/client/src/components/jobcard/timeLock.js

## Import Cycles
- 3-file cycle: `jobcard-system/server/src/routes/jobcard-audit-text.js -> jobcard-system/server/src/routes/jobcard-helpers.js -> jobcard-system/server/src/routes/jobcard-files.js -> jobcard-system/server/src/routes/jobcard-audit-text.js`

## Communities (348 total, 212 thin omitted)

### Community 0 - "isManagement"
Cohesion: 0.13
Nodes (5): useMissingFilesIndicator(), confirmInvoiceAnyway(), showFormErrors(), useJobNotes(), isManagement()

### Community 1 - "jobcard-system/client/src/components/UserManagement.jsx"
Cohesion: 0.09
Nodes (60): Required Patterns, Every change saves itself — the job screen has no Save button for an existing job, BottomSheet(), ConfirmDialog(), EntityActivityLog(), ExportButton(), FieldError(), boxNamesFor() (+52 more)

### Community 7 - "historySentences.js"
Cohesion: 0.08
Nodes (73): Decided — do not raise, Not verified this round, R2-10: Copied money formatter and Critical check in History. **Fixed**, R2-1: Part details misread in History when a name has brackets. **Fixed**, R2-2: A supplier name with a comma split into two treatments. **Fixed**, R2-3: Printing did not show up in an open History window. **Fixed**, R2-4: A file moved between two same-named parts said "to the whole job". **Fixed**, R2-5: The cursor was lost when History closed and comments opened. **Fixed** (+65 more)

### Community 12 - "resources/server/src/routes/jobcard-helpers.js"
Cohesion: 0.60
Nodes (3): copyQaTemplatesForJob(), copyTemplatesToJobFolder(), verifyQaTemplatesAvailable()

### Community 19 - "Login Rate Limiting"
Cohesion: 0.33
Nodes (9): discardBrowser(), getBrowser(), inElectron(), launchBrowser(), probeBrowser(), renderHtmlToPdf(), renderWithElectron(), renderWithPuppeteer() (+1 more)

### Community 27 - "jobcard-system/server/src/utils/logger.js"
Cohesion: 0.07
Nodes (42): Suppliers, authenticate(), requireManagement, validateCreateContact, validateUpdateContact, express, { v4: uuidv4 }, express (+34 more)

### Community 32 - "EmptyState"
Cohesion: 0.48
Nodes (5): bumpJobNumber(), getSettings(), peekNextJobNumber(), recordHistory(), updateSettings()

### Community 35 - "Inactivity Warning Modal"
Cohesion: 0.53
Nodes (4): buildTreatments(), makeDate(), tagValue(), uid()

### Community 46 - "jobcard-system/server/src/db/database.js"
Cohesion: 0.05
Nodes (32): R1-6: Worker name in work trail entries followed a different rule. **Fixed**, R2-8: Three copies of the "which name to show" rule. **Fixed**, migrations, Database, db, DB_PATH, fs, path (+24 more)

### Community 47 - "JobCard Constants"
Cohesion: 0.60
Nodes (3): assertMatchesExtension(), decodeBase64Strict(), matchesSignature()

### Community 59 - "gate.js"
Cohesion: 0.06
Nodes (46): changedFiles(), collect(), { execFileSync }, fs, git(), parseDiff(), path, REPO_ROOT (+38 more)

### Community 60 - "lucide-react"
Cohesion: 0.11
Nodes (39): infoToastIcon, warningToastIcon, HubCameraView(), HubFileRow(), JobPaperworkHub(), fileKindLabel(), keyOf(), MAX_PACKET_FILES (+31 more)

### Community 61 - "jobcard-system/client/src/hooks/useLabourRates.js"
Cohesion: 0.08
Nodes (40): Settings, describeDay(), HOURS, hourText(), ScheduleEditor(), summariseWeek(), TIER_LABEL, TIER_WORDS (+32 more)

### Community 75 - "jobcard-system/server/src/middleware/validation.js"
Cohesion: 0.05
Nodes (29): Validation error shape, { body, query, validationResult }, enterMessage(), FIELD_ALIASES, handleValidationErrors(), HIDEABLE_COLUMN_IDS, JOBCARD_COLUMN_IDS, manualTimeEntryRules() (+21 more)

### Community 80 - "check-openingHours.js"
Cohesion: 0.08
Nodes (43): A forgotten clock stops itself and asks its worker, allNormal, allNormalRules, assert, at(), auto, daySchedule, dst (+35 more)

### Community 81 - "server/package.json"
Cohesion: 0.06
Nodes (47): dependencies, archiver@^7.0.1, bcryptjs@^2.4.3, better-sqlite3@^11.10.0, cors@^2.8.5, express@^4.18.2, express-rate-limit@^7.5.0, express-validator@^7.0.1 (+39 more)

### Community 82 - "jobcard-system/server/src/routes/settings.js"
Cohesion: 0.07
Nodes (36): liftHoldForRestore(), splitCustomersInBackup(), splitCustomersIntoCompanies(), setMaintenance(), archiveBackup(), archiveBackupWithRetry(), archiver, bestEffortRemove() (+28 more)

### Community 86 - "jobcard-system/server/src/routes/jobcard-time-entries.js"
Cohesion: 0.08
Nodes (32): Timer endpoints, buildChanges(), afterClockStarted(), express, RUN_TRAIL_FIELDS, unconfirmedRefusalFor(), { v4: uuidv4 }, assigneeNames() (+24 more)

### Community 87 - "displayName"
Cohesion: 0.09
Nodes (41): Automatic checks (new), Not verified this round, Root-cause fixes (cover R2-6, R3-2, R3-3, R3-5, R3-7, R4-3, R4-4, R4-5, R4-7 and today's 1, 2, 3, 5, 8, 9), Round 5: 2026-10-15, Rule from here on, Comments (notes), dayKeyOf(), dayLabel() (+33 more)

### Community 91 - "Fixed"
Cohesion: 0.04
Nodes (39): Bug-hunt log, Decided — leave alone, Keeping this file short, Not bugs — don't report again, Past hunts, Rules of the hunt, This hunt, Waiting for the owner (design decisions) (+31 more)

### Community 92 - "jobcard-system/client/src/components/jobcard/useTimeEntries.js"
Cohesion: 0.09
Nodes (27): useAttentionRefocus(), CheckboxDropdown(), BOXES, clock(), day(), FinishQuestionDialog(), toastOfficeSettled(), discardToastIcon (+19 more)

### Community 94 - "jobcard-system/server/src/routes/jobcard-helpers.js"
Cohesion: 0.10
Nodes (38): Missing-attachment warnings, Who can set status, seedHistory(), describePart(), itemPartSnapshot(), partSummary(), partFileCode(), buildJobCardView() (+30 more)

### Community 95 - "SearchPage.jsx"
Cohesion: 0.09
Nodes (34): Roles are read live, never from the pass, statusToken(), ACTIVITY_FIELDS, ACTION_TO_TAB, activityAriaLabel(), ActivitySentence(), Chips(), CustomerJobsButton() (+26 more)

### Community 100 - "jobcard-system/client/src/components/jobcard/StopTimerForm.jsx"
Cohesion: 0.13
Nodes (31): UI conventions, The job screen, CalendarPicker(), DAYS, MONTHS, handleDialogKey(), handleDialogTab(), InactivityWarningModal() (+23 more)

### Community 118 - "AuthContext.jsx"
Cohesion: 0.11
Nodes (30): Home access (reaching the app from outside the office), Layout(), AuthContext, AuthProvider(), endSession(), InactivityCountdownContext, useInactivityCountdown(), useInactivityTimer() (+22 more)

### Community 119 - "jobcard-system/server/index.js"
Cohesion: 0.06
Nodes (32): app, express, fs, http, httpBootstrapApp, https, path, startPromise (+24 more)

### Community 120 - "statistics-helpers.js"
Cohesion: 0.13
Nodes (34): Statistics, getJobCostingOvertimeRowsByJobcardIds(), DISPLAY_NAME_SQL(), express, buildCustomerRankings(), buildJobCostingsMap(), buildMachineMaps(), buildPeriodTrends() (+26 more)

### Community 121 - "activitySentences.js"
Cohesion: 0.13
Nodes (34): Client-side patterns and traps, Intended, not findings, The activity trail's one shared list of actions, act(), activityText(), cap(), changeLine(), describeActivity() (+26 more)

### Community 124 - "jobcard-system/server/src/routes/search.js"
Cohesion: 0.10
Nodes (29): Activity trail, Contact details are hidden from non-management, validateSearchQuery, express, KINDS, router, customerFields(), readEntries() (+21 more)

### Community 125 - "Time entries, overtime tiers and the costing sheet"
Cohesion: 0.12
Nodes (28): Office wall clock vs stored instants, The Labour Rates page (settings screens), Time entries, overtime tiers and the costing sheet, Time tracking, overtime and job costing, buildCostingResponse(), computeCosting(), computeLiveCosting(), jobOvertimeBaseline() (+20 more)

### Community 127 - "jobcard-system/client/src/components/jobcard/JobIdentityStrip.jsx"
Cohesion: 0.10
Nodes (29): CLOSED_STATUS, DEFAULT_STATUS, groupStatusOptions(), PRIORITY_OPTIONS, PRIORITY_SORT_ORDER, SETTLED_STATUSES, STATUS_GROUP_OF, STATUS_GROUPS (+21 more)

### Community 128 - "legacyMigrations.js"
Cohesion: 0.12
Nodes (31): Cause D: the "which name to show" rule had two copies that trimmed differently, Quality levels, backfillCriticalAtFinish(), cleanUserNames(), clearStaleAwaitingDetails(), convertHistoryTrails(), foldGoodPiecesToWhole(), foldQualityLevels() (+23 more)

### Community 130 - "jobcard-system/server/src/routes/jobcard-mutations.js"
Cohesion: 0.12
Nodes (27): Customer model (a company holds many people), Customers, contacts and the tag/option system, Intended, not findings, Per-line-item fields, Tags (all dynamic dropdown options), buildGrandfatheredPairs(), buildGrandfatheredValues(), getSupplierQueries() (+19 more)

### Community 131 - "jobcard-system/server/scripts/seed-mock-data.js"
Cohesion: 0.06
Nodes (30): bcrypt, hashedPin, historyRows, insertAssignee, insertCompany, insertContact, insertCosting, insertItem (+22 more)

### Community 132 - "jobcard-system/server/src/routes/jobcards.js"
Cohesion: 0.08
Nodes (27): ALL_ROLES, can(), isManagement(), jwt, liveRole(), REFUSAL_MESSAGES, requirePermission(), statusChangeRefusal() (+19 more)

### Community 140 - "FinishQuestionProvider.jsx"
Cohesion: 0.13
Nodes (26): askedAt(), askersText(), ATTENTION_MODAL_ID, AttentionDialog(), AttentionRefocusContext, avatarStyle(), enabledControls(), MentionsSection() (+18 more)

### Community 141 - "jobcard-system/client/src/components/JobCardList.jsx"
Cohesion: 0.16
Nodes (21): ALERT_STATUS, LineItemTagSelect(), JobCardColumnsMenu(), ACTIVE_FILTER_OPTIONS, DEFAULT_COLUMN_ORDER, DEFAULT_HIDDEN_COLUMNS, FILTER_LABELS, HIDEABLE_COLUMN_IDS (+13 more)

### Community 142 - "jobcard-system/client/src/components/jobcard/JobCardModal.jsx"
Cohesion: 0.10
Nodes (22): One lock for a closed (invoiced/archived) job, JobCardWindow(), newerMoment(), NO_EMPLOYEES, mapTimeEntryFromApi(), useJobCardListRefresh(), useSavedFlash(), emptyEntryForm() (+14 more)

### Community 143 - "jobcard-system/server/src/routes/setup-trust.js"
Cohesion: 0.11
Nodes (21): Desktop app lifecycle, Home access card (Settings), Local-network name announcing, Serving, certificates and packaging, "Set up this computer" trust flow, Windows packaging, start(), startRedirectListener() (+13 more)

### Community 144 - "jobcard-system/client/src/utils/formatters.js"
Cohesion: 0.18
Nodes (21): EmptyState(), icons, PRIORITY_LABELS, CustomersTab(), PRIORITY_BAR_CLASS, quietZero(), MachinesTab(), PALETTE (+13 more)

### Community 145 - "jobcard-system/server/src/routes/jobcard-files.js"
Cohesion: 0.09
Nodes (25): { body, param }, BROWSER_UNREADABLE_IMAGE_EXT, CATEGORIES, express, fs, isListedFileName(), listFolderFiles(), MAX_FILE_DATA_CHARS (+17 more)

### Community 146 - "jobcard-system/client/src/utils/excelExport.js"
Cohesion: 0.16
Nodes (24): ACTIVITY_COLS, buildSheet(), CONTACT_COLS, exportActivityLog(), exportContacts(), exportMachines(), exportStatistics(), exportSuppliers() (+16 more)

### Community 147 - "useCostingSave.js"
Cohesion: 0.15
Nodes (21): toastJobWriteFailure(), getDefaultCostingForm(), mapCostingResponseToForm(), useCosting(), FIELD_MIN, floorMessage(), judgeBox(), OVERRIDE_FLAG (+13 more)

### Community 148 - "useAuth"
Cohesion: 0.17
Nodes (20): ActivityLog, App(), ContactManagement, LabourRatesSettings, ManagementRoute(), PermissionRoute(), PrivateRoute(), SearchPage (+12 more)

### Community 156 - "jobcard-system/server/scripts/seed-scenarios.js"
Cohesion: 0.09
Nodes (22): BASE_AGE, BASE_DUE, BILLED, buildScenarios(), CONTEXT, COSTED, CUSTOMER_PROPERTY, DRAWINGS (+14 more)

### Community 157 - "trailEntries.js"
Cohesion: 0.19
Nodes (19): Cause B: the old-entry conversions were seven database loops nobody could run, assignedNameFromChange(), convertTrailEntry(), fillAssignWorkerName(), fillAutoStopWorker(), fillTimeBlockPartName(), fillTimeBlockWorkerName(), foldPartSnapshot() (+11 more)

### Community 158 - "jobcard-system/client/src/components/jobcard/tabs/ItemsTab.jsx"
Cohesion: 0.16
Nodes (16): freshParts, staleEntry, staleTimer, LineItemTimerButton(), EMPTY_OBJECT, entriesForItem(), fieldErrorMessageId(), isPersisted() (+8 more)

### Community 159 - "Group P — pricing sheet boxes (executor P)"
Cohesion: 0.10
Nodes (20): optionalPhone(), C0. Wire group P into the job screen (do this first), C1. One client rule for a closed job, C2. Contact boxes on a new job, Group C — client lock + contact boxes (executor C, runs AFTER P and S land), Group P — pricing sheet boxes (executor P), Group S — server (executor S), P1. Drafts, not coerced figures (+12 more)

### Community 160 - "CLAUDE.md"
Cohesion: 0.10
Nodes (18): Architectural Guidelines, Architecture, Core tables, Development Commands, Directory Structure, Environment Variables, God Rule #2 — Plain Language Always, graphify (+10 more)

### Community 161 - "jobcard-system/server/src/db/init.js"
Cohesion: 0.13
Nodes (16): Dates, times and time zones, Stored timestamps, bcrypt, checkInterruptedRestore(), checkMachineNumbersWithSeparator(), fs, initializeDatabase(), path (+8 more)

### Community 162 - "jobcard-system/server/src/utils/certs.js"
Cohesion: 0.19
Nodes (19): Secure serving (production HTTPS, self-minted local certificate authority), buildAltNames(), CA_SUBJECT, collectSanHosts(), ensureCertificates(), forge, fs, generateCa() (+11 more)

### Community 163 - "Waves"
Cohesion: 0.15
Nodes (10): Grad, Noise, Waves(), drawLines(), moved(), movePoints(), onMouseMove(), onTouchMove() (+2 more)

### Community 164 - "jobcard-system/client/electron/main.js"
Cohesion: 0.15
Nodes (16): { app, BrowserWindow, ipcMain, Menu, Tray, Notification, nativeImage, globalShortcut, dialog, shell, session }, APP_ICON, caCertPath(), confirmAndQuit(), createTray(), createWindow(), dataDir(), fs (+8 more)

### Community 165 - "useInstantItems.js"
Cohesion: 0.21
Nodes (13): base, key(), fieldErrorKey(), isItemRowComplete(), ITEM_REQUIRED_MESSAGE, itemFieldMessage(), JOB_REQUIRED_MESSAGE, jobFieldMessage() (+5 more)

### Community 166 - "jobCardWorkbook.js"
Cohesion: 0.22
Nodes (18): durationHrs(), formatChangesText(), labelFromMap(), valueToLabel(), buildJobCardWorkbook(), treatmentDisplay(), COSTING_COLS, exportJobCardList() (+10 more)

### Community 167 - "jobcard-system/scripts/launch.js"
Cohesion: 0.14
Nodes (16): buildClientIfNeeded(), cmdLan(), cmdSeed(), COMMANDS, confirm(), findLanIp(), fs, http (+8 more)

### Community 168 - "columnDrops.js"
Cohesion: 0.15
Nodes (14): columnDrops, dropDeadColumns(), foldQuoteReferences(), foldRepeatJobTicks(), { v4: uuidv4 }, quoteReferenceNotes(), quoteReferenceText(), SYSTEM_AUTHOR (+6 more)

### Community 169 - "jobcard-system/server/src/utils/htmlToPdf.js"
Cohesion: 0.22
Nodes (16): Printing, discardBrowser(), fs, getBrowser(), inElectron(), launchBrowser(), os, path (+8 more)

### Community 170 - "client/package.json"
Cohesion: 0.15
Nodes (17): description, devDependencies, concurrently@^8.2.2, electron-builder@^24.9.1, @electron/rebuild@^3.7.2, @types/react@^18.2.37, @types/react-dom@^18.2.15, wait-on@^7.2.0 (+9 more)

### Community 171 - "ref_path"
Cohesion: 0.12
Nodes (11): ARCH_NAMES, default(), { execFileSync }, fs, path, resolveElectronVersion(), path, CONFIG_FILE (+3 more)

### Community 172 - "jobcard-system/client/src/components/jobcard/useJobCardForm.js"
Cohesion: 0.28
Nodes (16): lineItemHasContent(), buildItemPayload(), getDefaultFormData(), mapLineItemFromApi(), mapTreatmentFromApi(), makeEmptyLineItem(), makeLocalItemId(), pristineSaved() (+8 more)

### Community 173 - "jobcard-system/client/src/components/jobcard/tabs/TimeEntryCard.jsx"
Cohesion: 0.25
Nodes (13): computeProgress(), LineItemProgress(), parseQty(), StatusPill(), ScrapStat(), LiveElapsed(), TimeEntryCard(), FinishQuestionContext (+5 more)

### Community 174 - "scripts"
Cohesion: 0.12
Nodes (17): description, devDependencies, concurrently@^8.2.2, concurrently, name, scripts, build, client (+9 more)

### Community 175 - "jobcard-system/scripts/setup.js"
Cohesion: 0.15
Nodes (15): checkNativeModules(), checkPdfBrowser(), checkPlatformMatch(), checks, colors, { execSync, spawnSync }, fs, installDependencies() (+7 more)

### Community 176 - "recordHistory"
Cohesion: 0.12
Nodes (15): Intended, not findings, recordHistory(), Critical sign-off: which runs it covers, and invoicing with gaps (2026-09-28), Decision (owner, 2026-09-28 — bug-hunt round 11), Gate, C1 — Client: job list and Excel export, C2 — Client: job screen time & timers, C3 — Client: job screen details, header, new job, customer box (+7 more)

### Community 177 - "react"
Cohesion: 0.25
Nodes (9): EntityEntry(), Sentence(), useActivityLog(), useLatestRequest(), useMissingFilesIndicator(), useStillMounted(), api, coalesceRuns() (+1 more)

### Community 178 - "jobcard-system/client/src/components/jobcard/tabs/DetailsTab.jsx"
Cohesion: 0.29
Nodes (12): ToggleTiles(), JobIdentityStrip(), DetailsReadOnlyView(), DetailsTab(), ItemsTab(), JobReferenceFields(), summarizeFieldStates(), INSPECTION_FIELDS (+4 more)

### Community 179 - "closeReasons.js"
Cohesion: 0.26
Nodes (13): buildCloseReasons(), capitalize(), describeAtRisk(), describeSafe(), describeSafeAsSecondLine(), ITEM_FIELD_NAME, itemHasUnexplainedMismatch(), JOB_INSTANT_FIELDS (+5 more)

### Community 180 - "ActivityLog.jsx"
Cohesion: 0.25
Nodes (14): ActivityEntry(), ActivityLog(), rangeDays(), RANGES, Sentence(), withSentences(), JobCardModal(), HistoryEntry() (+6 more)

### Community 181 - "useInstantSave.js"
Cohesion: 0.15
Nodes (13): JOB_FIELD_LABEL, FIELD_BOXES, INSTANT_SAVE_STATUS_TEXT, useInstantSave(), useJobCardInstantSaves(), chainOwner, chains, NOT_LANDED (+5 more)

### Community 182 - "changeJobStatus.js"
Cohesion: 0.28
Nodes (13): Billing and archiving, changeJobStatus(), CHECKPOINTS, jobsInFlight, BILLING_STATUSES, billingMessage(), confirmFilesAnyway(), confirmMarkArchived() (+5 more)

### Community 183 - "build"
Cohesion: 0.13
Nodes (15): build, afterPack, appId, directories, extraResources, files, linux, mac (+7 more)

### Community 184 - "jobcard-system/client/src/components/JobCardListColumns.jsx"
Cohesion: 0.29
Nodes (11): clippingBox(), PlacedPopover(), StatusPopover(), getStatusBadgeClass(), priorityToken(), getJobCardColumns(), AssigneeAvatars(), attachmentSeverity() (+3 more)

### Community 185 - "jobcard-system/client/src/components/jobcard/tabs/LineItemSupplierPicker.jsx"
Cohesion: 0.24
Nodes (10): LineItemSupplierPicker(), useComboboxNav(), getDefaultContactFormData(), useContactSearch(), useJobSearch(), useSuggestionLifecycle(), nameMatchKey(), J1 — job screen: suggestion lists and splits (+2 more)

### Community 186 - "OnTimeTab.jsx"
Cohesion: 0.23
Nodes (12): STATUS_LABELS, OnTimeTab(), StatisticsKpis(), daysLate(), LOW_WASTE_UP_TO, MODERATE_WASTE_UP_TO, ON_TIME_RULE, ON_TRACK_FROM (+4 more)

### Community 187 - "safetyCopy.js"
Cohesion: 0.20
Nodes (11): needsUpgrade(), path, safetyCopyBeforeUpgrade(), isObject(), OLD_STATUS_CODES, renameCode(), renameStatusInChanges(), STATUS_RENAMES (+3 more)

### Community 188 - "jobcard-system/server/src/utils/folderCreation.js"
Cohesion: 0.25
Nodes (14): build(), buildStorageFilename(), companyPathByName(), createJobCardFolders(), deleteJobCardFolders(), ensureCompanyFolder(), FILE_CATEGORY_FOLDERS, fs (+6 more)

### Community 189 - "Design refactor — items 1–10"
Cohesion: 0.13
Nodes (14): Contrast corrections to existing tokens (item 1) — `index.css`, Design refactor — items 1–10, Executor A — `index.css` only, Executor B — `App.css` only, Executor C — these files only, Executor D — `components/jobcard/JobCardModal.css` only, Executor E — motion and icons (JSX), Executor F — notifications (item 7). Runs AFTER E. (+6 more)

### Community 190 - "Instant save on the job card — retiring the Save button"
Cohesion: 0.13
Nodes (14): 1a. `PUT /jobcards/:id/assignees/:userId` — put one worker on the job, 1b. `DELETE /jobcards/:id/assignees/:userId` — take one worker off, 1c. `POST /jobcards/:id/items` — add one part, 1d. `PATCH /jobcards/:id/items/:itemId` — change one part, 1e. `DELETE /jobcards/:id/items/:itemId` — remove one part, Docs to update as each stage lands, Fixed decisions — do not revisit, Governing rule (+6 more)

### Community 191 - "DataTable"
Cohesion: 0.25
Nodes (8): DataTable(), SKELETON_WIDTHS, SkeletonRows(), useTableFilter(), useTableResize(), useTableSort(), rowMatchesSearch(), row

### Community 192 - "isActiveRecord"
Cohesion: 0.27
Nodes (11): CostingBreakdown(), formatDecimalHours(), formatSpan(), machineKey(), nonZero(), CostingTab(), mult(), REVERT_FORMAT (+3 more)

### Community 194 - "reset-admin-password.js"
Cohesion: 0.26
Nodes (13): ask(), askHidden(), candidateDatabases(), cleanup(), fs, installedDataDir(), main(), os (+5 more)

### Community 195 - "check-startTimerUndo.js"
Cohesion: 0.14
Nodes (7): actor, assert, entry, fs, os, path, result

### Community 196 - "jobFiles.routes.test.js"
Cohesion: 0.15
Nodes (9): assert, dbBinary, filesWindowTests(), fs, os, path, serverDir, { spawn, spawnSync, execFileSync } (+1 more)

### Community 197 - "Spec — closing guard, unsaved-edits frame, money-entry safety"
Cohesion: 0.14
Nodes (13): 2a. `BottomSheet.jsx` — let a caller mark the window, 2b. `App.css` — the frame, 2c. `JobCardModal.jsx` — wire it up and reword the button, 2d. Delete the old chip, 3a. A mouse wheel must not change a price, 3b. A changed money line offers a way back, 3c. The invoice confirmation shows the total being committed, Documentation (+5 more)

### Community 198 - "Round 6: 2026-10-15"
Cohesion: 0.15
Nodes (13): Automatic checks, Not verified this round, R6-10: One damaged trail entry could stall the History conversion forever. **Fixed**, R6-1: Adding or removing a part read as the person changing the status. **Fixed**, R6-2: "Nothing has happened on this job yet" flashed before History loaded. **Fixed**, R6-3: Worker changes compared names (reopens R2-2, R4-4). **Fixed**, R6-4: Old entry kinds read as robot text. **Fixed**, R6-5: History missed clocks stopped elsewhere (gap in R1-1 / Round 5). **Fixed** (+5 more)

### Community 199 - "Sign-in, sessions and security"
Cohesion: 0.21
Nodes (10): Editing an account, Intended, not findings, Other protections, Sign-in, sessions and security, The last admin can't be demoted, What each role sees, isValidPin(), isWeakPin() (+2 more)

### Community 200 - "How files are stored on disk"
Cohesion: 0.42
Nodes (13): How files are stored on disk, listCategoryFileNames(), resolveCategoryFolder(), resolveJobFolder(), codedFolderName(), ensureCodedFolder(), findCodedFolder(), findCompanyFolder() (+5 more)

### Community 201 - "jobcard-system/client/src/components/LabourRatesSettings.jsx"
Cohesion: 0.28
Nodes (7): LabourRatesSettings(), DefaultRateCard(), MultiplierInputs(), pretty(), PublicHolidaysCard(), TimezoneCard(), useLeaveGuard()

### Community 202 - "undefinedNames.test.js"
Cohesion: 0.15
Nodes (7): AREAS, BROWSER_NAMES, NODE_MODULE_NAMES, { parse }, require, root, sourceFiles()

### Community 203 - "Round 3: 2026-10-15"
Cohesion: 0.17
Nodes (12): Not verified this round, R3-10: One part read by loading the whole parts list. **Fixed**, R3-1: Part changes from the old Save button read as gibberish. **Fixed**, R3-2: Files uploaded to a part before this change said "to the job". **Fixed**, R3-3: Old thrown-away and self-stopped clocks credited to whoever pressed Stop. **Fixed**, R3-4: The job's worker list used the raw name. **Fixed**, R3-5: The stop-clock conversion named the worker as they are today. **Fixed**, R3-6: "Needs your attention" credited all questions to the first asker. **Fixed** (+4 more)

### Community 204 - "jobcard-system/client/src/hooks/useTags.js"
Cohesion: 0.30
Nodes (8): CreatableTagSelect(), LineItemTreatment(), cacheTimestamps, dropCache(), subscribe(), subscribers, tagCache, useTags()

### Community 205 - "designTokens.test.js"
Cohesion: 0.17
Nodes (7): CHECKS, cssFiles, RESERVED, scriptFiles, src, TOKENS_FILE, walk()

### Community 206 - "uid"
Cohesion: 0.18
Nodes (12): buildTreatments(), companies, contacts, createJobs, criticalAtFinishSeed(), inspectionAnswers(), machines, makeDate() (+4 more)

### Community 207 - "Round 4: 2026-10-15"
Cohesion: 0.18
Nodes (11): Not verified this round, R4-1: Old Save entries showed the first part's details for every part. **Fixed**, R4-2: Old part entries were named by an old list position. **Fixed**, R4-3: Old uploads named the part as it is called today (reopens R3-2). **Fixed**, R4-4: Same-named askers counted as one person. **Fixed**, R4-5: Blank names in the job list and search (reopens R2-8, R2-9, R3-4). **Fixed**, R4-6: Editing or removing a part loaded it twice (reopens R3-10). **Fixed**, R4-7: Startup repeated the History fill-ins forever. **Fixed** (+3 more)

### Community 208 - "scriptImports.test.js"
Cohesion: 0.20
Nodes (4): clientSrc, EXTENSIONS, root, scriptsDir

### Community 209 - "One-time setup (about 30 minutes)"
Cohesion: 0.18
Nodes (10): A. Domain and Cloudflare account, B. The tunnel, on the workshop computer, C. Point the address at the app, D. In the app, E. Optional extra lock: Cloudflare's email gate, Home access (reach the app from outside the office), One-time setup (about 30 minutes), Switching it off (+2 more)

### Community 210 - "DH Engineering Job Cards — How to Run"
Cohesion: 0.18
Nodes (10): Day-to-day use, DH Engineering Job Cards — How to Run, Filling with test data (optional), First time only, Home access: workshop day checklist, Logging in, Other commands (rarely needed), Stop it (+2 more)

### Community 211 - "SERVER steps"
Cohesion: 0.18
Nodes (11): replyIfFolderError(), saveFile(), S1 — Worker status rule (server), S2 — Awaiting-details flag cleared only by the worker's form (or resume), S3 — Suppliers use the shared checks, S4 — Upload checks the part is still on the job, S5 — Archived-costing backfill retries failures, S6 — File move logged with readable names (+3 more)

### Community 212 - "SERVER (executor A)"
Cohesion: 0.20
Nodes (10): resolveFileOwners(), stripStorageTag(), Code review fixes — 2026-09-25, S1 — Customer "Invoiced Total" uses a stale saved figure (finding #1), S3 — A worker can reopen any old block of their own (finding #5), S4 — The last admin can demote themselves (finding #6), S5 — Part changes don't update job status (finding #7), S6 — Re-assigning a file to its own part renames it (finding #8) (+2 more)

### Community 213 - "Round 7: 2026-10-15"
Cohesion: 0.20
Nodes (10): Automatic checks, Not verified this round, R7-1: Re-seeding test data crashed partway through. **Fixed**, R7-2: The data-version note listed the wrong conversions. **Fixed**, R7-3: Starting a clock read the job's whole parts list (reopens R3-10, R6-9). **Fixed**, R7-4: After answering "when did you finish?", History loaded twice (same cause as R2-7). **Fixed**, R7-5: Leftover status go-between in the job window (same cause as R6-7). **Fixed**, R7-6: Deleting a time block whose part was gone looked the part up twice. **Fixed** (+2 more)

### Community 214 - "Job cards: numbering, status, billing and archiving, notes and assignees"
Cohesion: 0.20
Nodes (9): Backward Compatibility via Startup Conversions, Assignees, Deleting a job, Job cards: numbering, status, billing and archiving, notes and assignees, Numbering, The status list, runStartupConversions(), cleanUpDuplicateItemNumbering() (+1 more)

### Community 215 - "Sessions and signing out"
Cohesion: 0.24
Nodes (4): Sessions and signing out, notifyAll(), unreachableError(), maintenanceGuard()

### Community 216 - "ref_node_fs"
Cohesion: 0.22
Nodes (5): fresh(), src, useConfirmDialog, onKey, src

### Community 218 - ".updateJobcardStatus"
Cohesion: 0.20
Nodes (6): Group C1 — client: service list, status change  (F1, F5), Group D — who may do what is written once  (F6), One rule, one place — 2026-09-27, WAVE 1 — four executors in parallel, WAVE 2 — one executor, after wave 1 is reviewed, WAVE 3 — one executor, after wave 2 is reviewed

### Community 219 - "screenRules.test.js"
Cohesion: 0.24
Nodes (7): findAll(), lineOf(), rel(), screens, sheets, src, walk()

### Community 220 - "jobcard-system/server/scripts/seed-data.js"
Cohesion: 0.22
Nodes (8): companies, labourSchedule, machines, settings, suppliers, tagData, users, DEFAULT_VIC_PUBLIC_HOLIDAYS_2026

### Community 221 - "Frozen contracts"
Cohesion: 0.20
Nodes (9): Contract A — the saving record (client, package 1 owns it), Contract C — a part's permanent id is its identity; its number is sort order, Contract D — one rule table per field (package 3 owns it), Frozen contracts, Gate — every package, Instant save — root-cause fixes, Package 1 — the saving record, Package 2 — part identity, and replies that carry the truth (+1 more)

### Community 222 - "CLIENT steps"
Cohesion: 0.20
Nodes (9): C1 — Worker status choices on screen, C2 — Pricing refresh ignores replies for a job no longer on screen, C3 — Worker added only when the timer actually started, C4 — Stop-timer form save marks the details confirmed, C5 — Status change waits for part saves in flight, C6 — "Part was removed" doesn't count as a save, CLIENT steps, Gate (both executors) (+1 more)

### Community 223 - "Round 8: 2026-10-15"
Cohesion: 0.22
Nodes (9): Automatic checks, Not verified this round, R8-1: Old "started a clock" lines never got their part name. **Fixed**, R8-2: An office person's own hand-entered time repeated their name. **Fixed**, R8-3: Invoicing with History open loaded History twice (same cause as R2-7, R7-4). **Fixed**, R8-4: An outside clock stop refreshed the wrong job's History. **Fixed** (partly decided), R8-5: History wording read old trail shapes itself (house rule). **Fixed** / **Decided**, R8-6: The shared display-name rule was re-exported from two unused places. **Fixed** — deleted. (+1 more)

### Community 224 - "Round 1: 2026-10-15"
Cohesion: 0.22
Nodes (9): Decided — do not raise, Not verified this round, R1-1: History window goes out of date while the job is worked on. **Fixed**, R1-2: Most activity search results did not open History. **Fixed**, R1-3: Unread comments never opened by themselves if History was open first. **Fixed**, R1-4: Refresh in History threw away opened entries and scroll position. **Fixed**, R1-5: "Needs your attention" heading counted jobs, not questions. **Fixed**, R1-7: Notes and comments still said "History tab". **Fixed** (+1 more)

### Community 225 - "jobcard-system/client/vite.config.js"
Cohesion: 0.22
Nodes (6): vite@^5.0.0, @vitejs/plugin-react@^4.2.0, __dirname, sharedRulesDir, vite, @vitejs/plugin-react

### Community 226 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, build, build:electron, dev, electron, preview, start, start:web (+1 more)

### Community 227 - "useJobCardSave.js"
Cohesion: 0.36
Nodes (7): CHANGE_LABELS, describeChanges(), resolveJobContactId(), showFormErrors(), buildJobcardPayload(), CONTACT_FIELD_TO_BOX, useJobCardSave()

### Community 229 - "dependencies"
Cohesion: 0.25
Nodes (8): dependencies, lucide-react@^0.564.0, react@^18.2.0, react-dom@^18.2.0, react-hot-toast@^2.4.1, react-router-dom@^6.20.0, xlsx@^0.18.5, xlsx

### Community 230 - "Work order A — the parts list"
Cohesion: 0.25
Nodes (7): A1. A new row commits when it is complete, not when its description blurs, A2. Pending edits made while a row is being created must not be lost, A3. Two rows added at once must not collide on line numbers, A4. The quantity box clears its mark as a valid number is typed, Gate (both orders), Instant-save job card — review fixes, Work order A — the parts list

### Community 231 - "Bug search log"
Cohesion: 0.29
Nodes (6): Automatic checks, Bug search log, Decided — do not raise (each recorded in the matching note), Fixed at the cause, Not verified this round, Round 10: 2026-10-15

### Community 232 - "Endpoint reference (the less-obvious ones)"
Cohesion: 0.29
Nodes (6): Base, Endpoint reference (the less-obvious ones), Intended, not findings, Paged lists, Search, Suppliers

### Community 233 - "nameRule.test.js"
Cohesion: 0.29
Nodes (6): ALLOWED, HAND_WRITTEN, root, RULE_FILES, SCAN, sourceFiles()

### Community 234 - "Clean-up sweep — dead code, merged duplicates, file splits"
Cohesion: 0.29
Nodes (6): C2 — management list pages, Clean-up sweep — dead code, merged duplicates, file splits, Frozen decisions, Global constraints (every work order), S3 — route duplication and large handlers, Wave 2 (after wave 1 is reviewed)

### Community 235 - "Spec — close the gaps the review found"
Cohesion: 0.29
Nodes (6): Documentation, Gate, Spec — close the gaps the review found, Step 2 — A part edited while a save is in flight is destroyed, and the screen says it saved, Step 3 — A save that hangs makes the job window impossible to close, Step 4 — Two comments now contradict the code

### Community 236 - "Field marks follow the box's value — 2026-09-27"
Cohesion: 0.29
Nodes (6): Field marks follow the box's value — 2026-09-27, Migrating the callers, Must not change, The cause, The fix — a mark belongs to the text it was raised against, Verification

### Community 237 - "Fixed quality levels: Standard and Critical only (2026-09-28)"
Cohesion: 0.29
Nodes (6): Constraints, Decision (owner, 2026-09-28), Fixed quality levels: Standard and Critical only (2026-09-28), Gate, New shape, Steps

### Community 238 - "One copy per rule — 2026-09-27 (follow-up to the duplicated-rules review)"
Cohesion: 0.29
Nodes (6): Group A — settings rules (findings 2, 3, 15), Group B — file rules (findings 4, 5, 12), Group C — status rule and time lock (findings 8, 13), Group D — saving-side rules (findings 1, 6, 7, 9, 10), Group E — screen helpers (findings 11, 14), One copy per rule — 2026-09-27 (follow-up to the duplicated-rules review)

### Community 239 - "Review fixes — 2026-09-26 (second pass)"
Cohesion: 0.29
Nodes (6): Coordinator (not delegated), Gate (every executor), Group A — server guards (executor A), Group B — server data & speed (executor B), Group C — client screens (executor C), Review fixes — 2026-09-26 (second pass)

### Community 240 - "Review fixes — 2026-09-27"
Cohesion: 0.29
Nodes (6): Group A — money and quantity entry (executor A), Group B — server guards and checks (executor B), Group C — job list, job screen, customers, export (executor C), Group D — activity wording, previous-job search, notes (executor D), Report (every executor), Review fixes — 2026-09-27

### Community 241 - "nsis"
Cohesion: 0.33
Nodes (6): nsis, allowToChangeInstallationDirectory, createDesktopShortcut, createStartMenuShortcut, oneClick, shortcutName

### Community 242 - "jobcard-system/server/src/utils/jobCardHtml.js"
Cohesion: 0.60
Nodes (5): esc(), noFileMark(), NOT_CHECKED_REASON, renderItem(), renderJobCardHtml()

### Community 243 - "Frozen spec — app-wide layout sweep"
Cohesion: 0.33
Nodes (5): 1. The scale, 2. Conversion table — apply to EVERY literal, 3. Structural fixes (per area, listed in the work orders), 4. Gate — every work order ends with this, Frozen spec — app-wide layout sweep

### Community 244 - "jev-gate"
Cohesion: 0.33
Nodes (5): Adding a rule, How it decides, jev-gate, Needs, Use

### Community 245 - "Round 9: 2026-10-15 — causes, not spots"
Cohesion: 0.40
Nodes (5): Cause A: History had many "refresh now" triggers, and each round added or removed one, Cause C: the practice data imitated the app by hand, Not verified this round, Round 9: 2026-10-15 — causes, not spots, Rule from here on

### Community 246 - "createPinAttemptLimiter"
Cohesion: 0.70
Nodes (4): Login throttling, cooldownMsForCount(), createPinAttemptLimiter(), isExpired()

### Community 247 - "Files, printouts and quality levels"
Cohesion: 0.40
Nodes (4): Changing the main job folder, Files, printouts and quality levels, Intended, not findings, currentFileTag()

### Community 248 - "Shared rules — one file, loaded by both the server and the client"
Cohesion: 0.40
Nodes (4): Constraints, Gate, Shared rules — one file, loaded by both the server and the client, Verification

### Community 249 - "electron"
Cohesion: 0.50
Nodes (3): { contextBridge, ipcRenderer }, electron@^27.1.0, electron

### Community 250 - "Settings-area polish (2026-09-28)"
Cohesion: 0.50
Nodes (3): Part A — Settings + Labour Rates, Part B — Users, Tags, Suppliers, Customers, Settings-area polish (2026-09-28)

## Knowledge Gaps
- **212 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `displayName()` connect `displayName` to `legacyMigrations.js`, `jobcard-system/client/src/components/UserManagement.jsx`, `jobcard-system/server/src/routes/jobcard-mutations.js`, `jobcard-system/server/scripts/seed-mock-data.js`, `jobcard-system/server/src/routes/jobcards.js`, `historySentences.js`, `jobcard-system/client/src/components/JobCardList.jsx`, `jobcard-system/client/src/components/jobcard/tabs/ItemsTab.jsx`, `jobcard-system/client/src/components/jobcard/useJobCardForm.js`, `jobcard-system/server/src/db/database.js`, `jobcard-system/client/src/components/jobcard/tabs/DetailsTab.jsx`, `jobcard-system/client/src/components/JobCardListColumns.jsx`, `How files are stored on disk`, `jobcard-system/server/src/middleware/validation.js`, `uid`, `Round 4: 2026-10-15`, `jobcard-system/server/src/routes/jobcard-time-entries.js`, `jobcard-system/client/src/components/jobcard/useTimeEntries.js`, `jobcard-system/server/src/routes/jobcard-helpers.js`, `nameRule.test.js`, `jobcard-system/server/index.js`?**
  _High betweenness centrality (0.082) - this node is a cross-community bridge._
- **Are the 8 inferred relationships involving `displayName()` (e.g. with `Automatic checks (new)` and `R4-5: Blank names in the job list and search (reopens R2-8, R2-9, R3-4). **Fixed**`) actually correct?**
  _`displayName()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **Should `isManagement` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._
- **Why does `ApiService` connect `ApiService` to `._put`, `.request`, `react`, `displayName`, `Sessions and signing out`, `._del`, `.updateJobcardStatus`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Should `jobcard-system/client/src/components/UserManagement.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.09215686274509804 - nodes in this community are weakly interconnected._
- **Why does `react` connect `react` to `jobcard-system/client/src/components/UserManagement.jsx`, `FinishQuestionProvider.jsx`, `jobcard-system/client/src/components/JobCardList.jsx`, `jobcard-system/client/src/components/jobcard/JobCardModal.jsx`, `jobcard-system/client/src/utils/formatters.js`, `useCostingSave.js`, `useAuth`, `jobcard-system/client/src/components/jobcard/tabs/ItemsTab.jsx`, `Waves`, `useInstantItems.js`, `client/package.json`, `jobcard-system/client/src/components/jobcard/useJobCardForm.js`, `jobcard-system/client/src/components/jobcard/tabs/TimeEntryCard.jsx`, `jobcard-system/client/src/components/jobcard/tabs/DetailsTab.jsx`, `closeReasons.js`, `ActivityLog.jsx`, `useInstantSave.js`, `jobcard-system/client/src/components/JobCardListColumns.jsx`, `jobcard-system/client/src/components/jobcard/tabs/LineItemSupplierPicker.jsx`, `lucide-react`, `jobcard-system/client/src/hooks/useLabourRates.js`, `DataTable`, `isActiveRecord`, `jobcard-system/client/src/components/LabourRatesSettings.jsx`, `jobcard-system/client/src/hooks/useTags.js`, `displayName`, `jobcard-system/client/src/components/jobcard/useTimeEntries.js`, `SearchPage.jsx`, `useJobCardSave.js`, `jobcard-system/client/src/components/jobcard/StopTimerForm.jsx`, `dependencies`, `AuthContext.jsx`, `jobcard-system/client/src/components/jobcard/JobIdentityStrip.jsx`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Should `historySentences.js` be split into smaller, more focused modules?**
  _Cohesion score 0.07889190003011141 - nodes in this community are weakly interconnected._