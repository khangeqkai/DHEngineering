# Graph Report - DHEngineering  (2026-07-18)

## Corpus Check
- 217 files · ~1,492,070 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 931 nodes · 1521 edges · 49 communities detected
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 127 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]

## God Nodes (most connected - your core abstractions)
1. `ApiService` - 128 edges
2. `useAuth()` - 25 edges
3. `isWithinBase()` - 23 edges
4. `useConfirmDialog()` - 17 edges
5. `formatDate()` - 15 edges
6. `sanitizeFolderName()` - 14 edges
7. `useTags()` - 13 edges
8. `capitalizeFirst()` - 13 edges
9. `HardwareService` - 13 edges
10. `JobCardModal()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `treatmentsToText()` --calls--> `parseTreatments()`  [INFERRED]
  client/release/win-unpacked/resources/server/src/routes/jobcard-mutations.js → server/src/routes/jobcard-helpers.js
- `scheduleDayToWholeHours()` --calls--> `toMin()`  [INFERRED]
  server/src/db/init.js → client/src/hooks/useLabourRates.js
- `scheduleDayToWholeHours()` --calls--> `hourLabel()`  [INFERRED]
  server/src/db/init.js → client/src/hooks/useLabourRates.js
- `start()` --calls--> `initializeDatabase()`  [INFERRED]
  server/index.js → server/src/db/init.js
- `initializeDatabase()` --calls--> `recordHistory()`  [INFERRED]
  server/src/db/init.js → server/src/db/helpers.js

## Communities

### Community 0 - "Community 0"
Cohesion: 0.03
Nodes (1): ApiService

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (55): buildStorageFilename(), listCategoryFileNames(), listFolderFiles(), nextQaFormNumber(), partFileCode(), resolveCategoryFolder(), resolveCustomerPropertyPath(), resolveJobFilesPath() (+47 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (26): CalendarPicker(), toDateString(), isTopModal(), pushModal(), removeModal(), JobFilesMenu(), JobPaperworkHub(), LineItemFilesMenu() (+18 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (28): formatAction(), getStatusBadgeClass(), statusToken(), ActionBadge(), fmt(), fmtDate(), fmtDateShort(), PriorityBadge() (+20 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (29): JobCardList(), mergeColumnOrder(), getJobCardColumns(), useJobCardListDensity(), Layout(), Login(), Settings(), AuthProvider() (+21 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (22): CreatableTagSelect(), ContactManagement(), QALevelManagement(), SupplierManagement(), TagManagement(), UserManagement(), useConfirmDialog(), invalidateTagCache() (+14 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (25): resolveJobContactId(), JobCardModal(), confirmInvoiceAnyway(), showFormErrors(), validateJobCardForm(), buildJobcardPayload(), getDefaultCostingForm(), getDefaultFormData() (+17 more)

### Community 7 - "Community 7"
Cohesion: 0.08
Nodes (29): bumpJobNumber(), getSettings(), peekNextJobNumber(), recordHistory(), updateSettings(), autoAssignWorker(), checkCriticalInspection(), flagToBool() (+21 more)

### Community 8 - "Community 8"
Cohesion: 0.09
Nodes (28): LabourRatesSettings(), checkInterruptedRestore(), ensureBuiltInStandardLevel(), initializeDatabase(), runMigrations(), scheduleDayToWholeHours(), blocksFromGrid(), emptySchedule() (+20 more)

### Community 9 - "Community 9"
Cohesion: 0.21
Nodes (18): buildJobCardWorkbook(), buildSheet(), exportActivityLog(), exportContacts(), exportEquipment(), exportJobCardList(), exportJobCardsFull(), exportSuppliers() (+10 more)

### Community 10 - "Community 10"
Cohesion: 0.22
Nodes (21): buildGrandfatheredPairs(), buildGrandfatheredValues(), getSupplierQueries(), getTagQueries(), getTagValues(), handleValidationErrors(), optionalBoolean(), optionalEmail() (+13 more)

### Community 11 - "Community 11"
Cohesion: 0.24
Nodes (12): start(), discardBrowser(), getBrowser(), inElectron(), launchBrowser(), probeBrowser(), renderHtmlToPdf(), renderWithElectron() (+4 more)

### Community 12 - "Community 12"
Cohesion: 0.23
Nodes (11): getAssigneesForJobcards(), formatActivity(), formatContact(), formatJob(), formatSupplier(), formatTimeEntry(), searchActivity(), searchAll() (+3 more)

### Community 13 - "Community 13"
Cohesion: 0.19
Nodes (1): HardwareService

### Community 14 - "Community 14"
Cohesion: 0.25
Nodes (4): camelToSnake(), convertKeysToCamel(), getTableColumns(), snakeToCamel()

### Community 15 - "Community 15"
Cohesion: 0.25
Nodes (2): Grad, Noise

### Community 16 - "Community 16"
Cohesion: 0.27
Nodes (4): buildTreatments(), makeDate(), tagValue(), uid()

### Community 17 - "Community 17"
Cohesion: 0.2
Nodes (4): DataTable(), useTableFilter(), useTableResize(), useTableSort()

### Community 18 - "Community 18"
Cohesion: 0.33
Nodes (7): checkNativeModules(), checkPdfBrowser(), checkPlatformMatch(), installDependencies(), log(), runChecks(), writePlatformMarker()

### Community 19 - "Community 19"
Cohesion: 0.22
Nodes (1): base64ToBytes()

### Community 20 - "Community 20"
Cohesion: 0.39
Nodes (8): buildClientIfNeeded(), cmdLan(), cmdSeed(), confirm(), findLanIp(), newestMtime(), runSetup(), waitForHealth()

### Community 21 - "Community 21"
Cohesion: 0.44
Nodes (7): archiveBackup(), archiveBackupWithRetry(), bestEffortRemove(), copyDirRecursive(), listFilesRecursive(), partitionReadableFiles(), verifyStagedFiles()

### Community 22 - "Community 22"
Cohesion: 0.31
Nodes (5): buildMenu(), errorPage(), escapeHtml(), showMain(), showSetup()

### Community 23 - "Community 23"
Cohesion: 0.52
Nodes (5): checkLoginRateLimit(), clearLoginFailures(), cooldownMsForCount(), normalizeEmpty(), recordLoginFailure()

### Community 24 - "Community 24"
Cohesion: 0.38
Nodes (4): CostingTab(), formatElapsed(), LiveElapsed(), money()

### Community 26 - "Community 26"
Cohesion: 0.6
Nodes (4): assigneeNames(), buildQaTemplateWarning(), itemSummary(), treatmentsToText()

### Community 27 - "Community 27"
Cohesion: 0.47
Nodes (4): computeProgress(), formatNum(), LineItemProgress(), parseQty()

### Community 28 - "Community 28"
Cohesion: 0.5
Nodes (2): maintenanceGuard(), setMaintenance()

### Community 29 - "Community 29"
Cohesion: 0.6
Nodes (3): formatLevel(), formatTemplate(), getQaLevelsBasePath()

### Community 30 - "Community 30"
Cohesion: 0.7
Nodes (3): getSupplierWithTags(), normalizeEmpty(), toApiFormat()

### Community 31 - "Community 31"
Cohesion: 0.7
Nodes (3): assertMatchesExtension(), decodeBase64Strict(), matchesSignature()

### Community 32 - "Community 32"
Cohesion: 0.8
Nodes (3): esc(), renderItem(), renderJobCardHtml()

### Community 33 - "Community 33"
Cohesion: 0.8
Nodes (3): fillPdfTemplate(), formatTreatments(), toPdfSafe()

### Community 34 - "Community 34"
Cohesion: 0.8
Nodes (3): appendImage(), appendPdf(), buildPacketPdf()

### Community 35 - "Community 35"
Cohesion: 0.5
Nodes (2): authenticate(), requireRole()

### Community 36 - "Community 36"
Cohesion: 0.5
Nodes (2): itemSummary(), treatmentsToText()

### Community 37 - "Community 37"
Cohesion: 0.67
Nodes (2): normalizeEmpty(), toApiFormat()

### Community 38 - "Community 38"
Cohesion: 0.67
Nodes (2): normalizeEmpty(), toResponseFormat()

### Community 39 - "Community 39"
Cohesion: 0.67
Nodes (2): formatTag(), nameToValue()

### Community 40 - "Community 40"
Cohesion: 0.83
Nodes (3): collectOvertimeUpdates(), normalizeSchedule(), validateSchedule()

### Community 41 - "Community 41"
Cohesion: 0.67
Nodes (2): formatNum(), JobScrapSummary()

### Community 42 - "Community 42"
Cohesion: 0.67
Nodes (1): seedHistory()

### Community 43 - "Community 43"
Cohesion: 0.67
Nodes (1): buildScenarios()

### Community 44 - "Community 44"
Cohesion: 0.67
Nodes (1): getOrCreateJwtSecret()

### Community 45 - "Community 45"
Cohesion: 0.67
Nodes (1): nameToValue()

### Community 46 - "Community 46"
Cohesion: 0.67
Nodes (1): requestLogger()

### Community 47 - "Community 47"
Cohesion: 1.0
Nodes (2): formatElapsed(), LineItemTimerButton()

### Community 48 - "Community 48"
Cohesion: 1.0
Nodes (2): isActive(), LineItemSupplierPicker()

### Community 49 - "Community 49"
Cohesion: 1.0
Nodes (2): formatNum(), ScrapStat()

## Knowledge Gaps
- **Thin community `Community 0`** (128 nodes): `ApiService`, `.activateMachine()`, `.activateSupplier()`, `.activateTag()`, `.activateUser()`, `.addAssignee()`, `.addJobNote()`, `.addQAForm()`, `.addTimeEntry()`, `.archiveContact()`, `.archiveMachine()`, `.archiveTag()`, `.assignJobcardFile()`, `.buildPacket()`, `.changePassword()`, `.constructor()`, `.createContact()`, `.createJobcard()`, `.createMachine()`, `.createQaLevel()`, `.createSupplier()`, `.createTag()`, `.createUser()`, `.deactivateSupplier()`, `.deactivateUser()`, `._del()`, `.deleteContact()`, `.deleteDocument()`, `.deleteJobcard()`, `.deleteJobCardTemplate()`, `.deleteJobNote()`, `.deleteMachine()`, `.deleteQAForm()`, `.deleteQaLevel()`, `.deleteQaTemplate()`, `.deleteSupplier()`, `.deleteTag()`, `.deleteTimeEntry()`, `.deleteUser()`, `.exportBackup()`, `.getActiveTimer()`, `.getActivityHistory()`, `.getAttachmentWarnings()`, `.getContact()`, `.getContacts()`, `.getCosting()`, `.getCustomerPropertyFileData()`, `.getCustomerPropertyFiles()`, `.getDocument()`, `.getDocuments()`, `.getEmployees()`, `.getEntityHistory()`, `.getHardwareStatus()`, `.getInactivityTimeout()`, `.getJobcard()`, `.getJobcardFile()`, `.getJobcardHistory()`, `.getJobcards()`, `.getJobCardTemplate()`, `.getJobFileData()`, `.getJobFiles()`, `.getJobNotes()`, `.getMachines()`, `.getMe()`, `.getOverdueJobcards()`, `.getPrinters()`, `.getQaFormFileData()`, `.getQaFormFiles()`, `.getQAForms()`, `.getQaLevel()`, `.getQaLevels()`, `.getScannerFiles()`, `.getScanners()`, `.getSettings()`, `.getSupplier()`, `.getSuppliers()`, `.getTagCategories()`, `.getTags()`, `.getTimeEntries()`, `.getUser()`, `.getUserActivity()`, `.getUsers()`, `.importBackup()`, `._itemQuery()`, `.listJobcardFiles()`, `.login()`, `._patch()`, `._post()`, `.printJobCard()`, `._put()`, `.removeAssignee()`, `.request()`, `.scannerToCustomerPropertyFiles()`, `.scannerToJobcardFiles()`, `.scannerToJobFiles()`, `.scannerToQaFormFiles()`, `.search()`, `.searchContacts()`, `.selfAssign()`, `.selfUnassign()`, `.setItemFilesStatus()`, `.setOnSessionInvalidated()`, `.setToken()`, `.startTimer()`, `.stopTimer()`, `.toggleSpecialLabour()`, `.unarchiveContact()`, `.unarchiveJobcard()`, `.updateContact()`, `.updateCosting()`, `.updateJobcard()`, `.updateJobcardStatus()`, `.updateMachine()`, `.updatePreferences()`, `.updateQAForm()`, `.updateQaLevel()`, `.updateSettings()`, `.updateSupplier()`, `.updateTag()`, `.updateTimeEntry()`, `.updateUser()`, `.uploadDocument()`, `.uploadJobCardTemplate()`, `.uploadQaTemplate()`, `.uploadToCustomerPropertyFiles()`, `.uploadToJobcardFiles()`, `.uploadToJobFiles()`, `.uploadToQaFormFiles()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 13`** (14 nodes): `hardware.js`, `HardwareService`, `.capturePhoto()`, `.checkElectron()`, `.closeCamera()`, `.constructor()`, `.getAppInfo()`, `.getCameras()`, `.getPrinters()`, `.getScanners()`, `.openCamera()`, `.print()`, `.printToPDF()`, `.scan()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 15`** (11 nodes): `Waves.jsx`, `Grad`, `.constructor()`, `.dot2()`, `Noise`, `.constructor()`, `.fade()`, `.lerp()`, `.perlin2()`, `.seed()`, `Waves()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (9 nodes): `usePacketPrint.js`, `api.js`, `downloadBytes()`, `isDesktop()`, `printHtmlInIframe()`, `printPdfInIframe()`, `reportSkipped()`, `showPdfInBrowser()`, `base64ToBytes()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (5 nodes): `maintenance.js`, `isMaintenance()`, `maintenanceGuard()`, `setMaintenance()`, `maintenance.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (5 nodes): `auth.js`, `authenticate()`, `isManagement()`, `requireRole()`, `auth.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (5 nodes): `assigneeNames()`, `buildQaTemplateWarning()`, `itemSummary()`, `treatmentsToText()`, `jobcard-audit-text.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (4 nodes): `contacts.js`, `normalizeEmpty()`, `toApiFormat()`, `contacts.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (4 nodes): `machines.js`, `normalizeEmpty()`, `toResponseFormat()`, `machines.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (4 nodes): `tags.js`, `formatTag()`, `nameToValue()`, `tags.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (4 nodes): `JobScrapSummary.jsx`, `formatNum()`, `JobScrapSummary()`, `parseQty()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (3 nodes): `seed-history.js`, `seedHistory()`, `seed-history.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (3 nodes): `seed-scenarios.js`, `buildScenarios()`, `seed-scenarios.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (3 nodes): `config.js`, `config.js`, `getOrCreateJwtSecret()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (3 nodes): `seed-tags.js`, `nameToValue()`, `seed-tags.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (3 nodes): `logger.js`, `logger.js`, `requestLogger()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (3 nodes): `LineItemTimerButton.jsx`, `formatElapsed()`, `LineItemTimerButton()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (3 nodes): `LineItemSupplierPicker.jsx`, `isActive()`, `LineItemSupplierPicker()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (3 nodes): `ScrapStat.jsx`, `formatNum()`, `ScrapStat()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ApiService` connect `Community 0` to `Community 19`?**
  _High betweenness centrality (0.104) - this node is a cross-community bridge._
- **Why does `usePacketPrint()` connect `Community 2` to `Community 19`?**
  _High betweenness centrality (0.092) - this node is a cross-community bridge._
- **Are the 13 inferred relationships involving `useAuth()` (e.g. with `PrivateRoute()` and `AdminRoute()`) actually correct?**
  _`useAuth()` has 13 INFERRED edges - model-reasoned connections that need verification._
- **Are the 9 inferred relationships involving `isWithinBase()` (e.g. with `resolveJobFolder()` and `resolveCategoryFolder()`) actually correct?**
  _`isWithinBase()` has 9 INFERRED edges - model-reasoned connections that need verification._
- **Are the 8 inferred relationships involving `useConfirmDialog()` (e.g. with `ContactManagement()` and `JobCardList()`) actually correct?**
  _`useConfirmDialog()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **Are the 4 inferred relationships involving `formatDate()` (e.g. with `fmtDateShort()` and `JobIdentityStrip()`) actually correct?**
  _`formatDate()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._