# Graph Report - DHEngineering  (2026-08-06)

## Corpus Check
- 232 files · ~1,513,271 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 794 nodes · 1297 edges · 59 communities detected
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 76 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 25|Community 25]]
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
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]

## God Nodes (most connected - your core abstractions)
1. `ApiService` - 93 edges
2. `useAuth()` - 25 edges
3. `useConfirmDialog()` - 15 edges
4. `formatDate()` - 15 edges
5. `isWithinBase()` - 12 edges
6. `JobCardModal()` - 11 edges
7. `JobCardList()` - 9 edges
8. `saveWorkbook()` - 9 edges
9. `timestamp()` - 9 edges
10. `toTitleCase()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `scheduleDayToWholeHours()` --calls--> `toMin()`  [INFERRED]
  server/src/db/init.js → client/src/hooks/useLabourRates.js
- `scheduleDayToWholeHours()` --calls--> `hourLabel()`  [INFERRED]
  server/src/db/init.js → client/src/hooks/useLabourRates.js
- `PrivateRoute()` --calls--> `useAuth()`  [INFERRED]
  client/src/App.jsx → client/src/context/AuthContext.jsx
- `AdminRoute()` --calls--> `useAuth()`  [INFERRED]
  client/src/App.jsx → client/src/context/AuthContext.jsx
- `ManagementRoute()` --calls--> `useAuth()`  [INFERRED]
  client/src/App.jsx → client/src/context/AuthContext.jsx

## Communities

### Community 0 - "Community 0"
Cohesion: 0.04
Nodes (1): ApiService

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (26): formatAction(), getStatusBadgeClass(), statusToken(), ActionBadge(), fmt(), fmtDate(), fmtDateShort(), PriorityBadge() (+18 more)

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (19): CalendarPicker(), toDateString(), isTopModal(), pushModal(), removeModal(), JobPaperworkHub(), cleanQaName(), fileKindLabel() (+11 more)

### Community 3 - "Community 3"
Cohesion: 0.11
Nodes (27): getJobCardColumns(), JobCardListTable(), confirmInvoiceAnyway(), showFormErrors(), attachmentSeverity(), describeAttachmentGaps(), describeWorkWarning(), joinNames() (+19 more)

### Community 4 - "Community 4"
Cohesion: 0.08
Nodes (22): JobCardList(), Layout(), Login(), Settings(), UserManagement(), AuthProvider(), useAuth(), formatElapsed() (+14 more)

### Community 5 - "Community 5"
Cohesion: 0.09
Nodes (21): resolveJobContactId(), JobCardModal(), validateJobCardForm(), buildJobcardPayload(), getDefaultCostingForm(), getDefaultFormData(), getDefaultTimeEntryForm(), isoToLocalInput() (+13 more)

### Community 6 - "Community 6"
Cohesion: 0.1
Nodes (15): CreatableTagSelect(), ContactManagement(), QALevelManagement(), SupplierManagement(), TagManagement(), useConfirmDialog(), invalidateTagCache(), useTags() (+7 more)

### Community 7 - "Community 7"
Cohesion: 0.15
Nodes (23): columnsOf(), normalizeStoredTimestamps(), officeTimeZone(), wallClockToIso(), zoneOffsetMs(), endOfDay(), formatActivity(), formatContact() (+15 more)

### Community 8 - "Community 8"
Cohesion: 0.21
Nodes (21): buildGrandfatheredPairs(), buildGrandfatheredValues(), getSupplierQueries(), getTagQueries(), getTagValues(), handleValidationErrors(), optionalBoolean(), optionalEmail() (+13 more)

### Community 9 - "Community 9"
Cohesion: 0.21
Nodes (18): buildChanges(), buildJobCardView(), buildQaFillData(), computeAttachmentWarnings(), copyQaTemplatesForJob(), copyTemplatesToJobFolder(), createRelatedRecords(), declaresValue() (+10 more)

### Community 10 - "Community 10"
Cohesion: 0.44
Nodes (17): companyFolderName(), companyPathByName(), createJobCardFolders(), deleteJobCardFolders(), ensureCompanyFolder(), ensureQaLevelFolder(), findCompanyFolder(), findQaLevelFolder() (+9 more)

### Community 11 - "Community 11"
Cohesion: 0.18
Nodes (11): LabourRatesSettings(), checkInterruptedRestore(), initializeDatabase(), runMigrations(), scheduleDayToWholeHours(), blocksFromGrid(), emptySchedule(), gridFromBlocks() (+3 more)

### Community 12 - "Community 12"
Cohesion: 0.29
Nodes (12): autoAssignWorker(), checkCriticalInspection(), checkEntryDuration(), flagToBool(), isCriticalJob(), isOpenTimerConflict(), normalizeTime(), resolveItemId() (+4 more)

### Community 13 - "Community 13"
Cohesion: 0.37
Nodes (11): buildStorageFilename(), listCategoryFileNames(), listFolderFiles(), nextQaFormNumber(), partFileCode(), partTagRegex(), resolveCategoryFolder(), resolveFileOwners() (+3 more)

### Community 14 - "Community 14"
Cohesion: 0.47
Nodes (10): buildAltNames(), collectSanHosts(), ensureCertificates(), generateCa(), generateLeaf(), leafSanCoversIps(), leafSanCoversNames(), makeSerial() (+2 more)

### Community 15 - "Community 15"
Cohesion: 0.27
Nodes (8): buildHelperScript(), buildSetupPage(), plainTrustFileUrl(), secureAddress(), hostWithoutPort(), isVirtualIface(), lanIpv4s(), safeHost()

### Community 16 - "Community 16"
Cohesion: 0.49
Nodes (9): discardBrowser(), getBrowser(), inElectron(), launchBrowser(), probeBrowser(), renderHtmlToPdf(), renderWithElectron(), renderWithPuppeteer() (+1 more)

### Community 17 - "Community 17"
Cohesion: 0.25
Nodes (2): Grad, Noise

### Community 18 - "Community 18"
Cohesion: 0.53
Nodes (8): buildCostingResponse(), computeLiveCosting(), num(), parseHolidays(), parseSchedule(), persistCosting(), readOtSettings(), round2()

### Community 19 - "Community 19"
Cohesion: 0.33
Nodes (7): checkNativeModules(), checkPdfBrowser(), checkPlatformMatch(), installDependencies(), log(), runChecks(), writePlatformMarker()

### Community 20 - "Community 20"
Cohesion: 0.44
Nodes (7): archiveBackup(), archiveBackupWithRetry(), bestEffortRemove(), copyDirRecursive(), listFilesRecursive(), partitionReadableFiles(), verifyStagedFiles()

### Community 21 - "Community 21"
Cohesion: 0.22
Nodes (4): DataTable(), useTableFilter(), useTableResize(), useTableSort()

### Community 22 - "Community 22"
Cohesion: 0.39
Nodes (8): buildClientIfNeeded(), cmdLan(), cmdSeed(), confirm(), findLanIp(), newestMtime(), runSetup(), waitForHealth()

### Community 23 - "Community 23"
Cohesion: 0.29
Nodes (2): caCertPath(), dataDir()

### Community 24 - "Community 24"
Cohesion: 0.52
Nodes (5): bumpJobNumber(), getSettings(), peekNextJobNumber(), recordHistory(), updateSettings()

### Community 25 - "Community 25"
Cohesion: 0.52
Nodes (5): checkLoginRateLimit(), clearLoginFailures(), cooldownMsForCount(), normalizeEmpty(), recordLoginFailure()

### Community 26 - "Community 26"
Cohesion: 0.6
Nodes (4): assigneeNames(), buildQaTemplateWarning(), itemSummary(), treatmentsToText()

### Community 27 - "Community 27"
Cohesion: 0.6
Nodes (4): camelToSnake(), convertKeysToCamel(), getTableColumns(), snakeToCamel()

### Community 28 - "Community 28"
Cohesion: 0.73
Nodes (4): localParts(), makeFormatter(), splitHours(), tierForMoment()

### Community 29 - "Community 29"
Cohesion: 0.47
Nodes (4): computeProgress(), formatNum(), LineItemProgress(), parseQty()

### Community 30 - "Community 30"
Cohesion: 0.53
Nodes (4): buildTreatments(), makeDate(), tagValue(), uid()

### Community 31 - "Community 31"
Cohesion: 0.6
Nodes (3): authenticate(), isManagement(), requireRole()

### Community 32 - "Community 32"
Cohesion: 0.6
Nodes (3): formatLevel(), formatTemplate(), getQaLevelsBasePath()

### Community 33 - "Community 33"
Cohesion: 0.8
Nodes (3): collectOvertimeUpdates(), normalizeSchedule(), validateSchedule()

### Community 34 - "Community 34"
Cohesion: 0.7
Nodes (3): getSupplierWithTags(), normalizeEmpty(), toApiFormat()

### Community 35 - "Community 35"
Cohesion: 0.7
Nodes (3): assertMatchesExtension(), decodeBase64Strict(), matchesSignature()

### Community 36 - "Community 36"
Cohesion: 0.8
Nodes (3): esc(), renderItem(), renderJobCardHtml()

### Community 37 - "Community 37"
Cohesion: 0.8
Nodes (3): fillPdfTemplate(), formatTreatments(), toPdfSafe()

### Community 38 - "Community 38"
Cohesion: 0.8
Nodes (3): appendImage(), appendPdf(), buildPacketPdf()

### Community 39 - "Community 39"
Cohesion: 0.67
Nodes (2): start(), startRedirectListener()

### Community 40 - "Community 40"
Cohesion: 0.67
Nodes (2): normalizeEmpty(), toApiFormat()

### Community 41 - "Community 41"
Cohesion: 0.67
Nodes (2): normalizeEmpty(), toResponseFormat()

### Community 42 - "Community 42"
Cohesion: 0.67
Nodes (2): formatTag(), nameToValue()

### Community 43 - "Community 43"
Cohesion: 0.83
Nodes (2): isJobComplete(), syncStatusToWork()

### Community 44 - "Community 44"
Cohesion: 0.67
Nodes (2): getPdfEngineStatus(), verifyPdfEngine()

### Community 45 - "Community 45"
Cohesion: 0.67
Nodes (2): CostingTab(), money()

### Community 46 - "Community 46"
Cohesion: 0.67
Nodes (2): maintenanceGuard(), setMaintenance()

### Community 47 - "Community 47"
Cohesion: 0.67
Nodes (2): normalizeEmpty(), readFlag()

### Community 48 - "Community 48"
Cohesion: 0.67
Nodes (1): seedHistory()

### Community 49 - "Community 49"
Cohesion: 0.67
Nodes (1): buildScenarios()

### Community 50 - "Community 50"
Cohesion: 0.67
Nodes (1): getOrCreateJwtSecret()

### Community 51 - "Community 51"
Cohesion: 0.67
Nodes (1): nameToValue()

### Community 52 - "Community 52"
Cohesion: 0.67
Nodes (1): getAssigneesForJobcards()

### Community 53 - "Community 53"
Cohesion: 0.67
Nodes (1): auditValue()

### Community 54 - "Community 54"
Cohesion: 0.67
Nodes (1): requestLogger()

### Community 55 - "Community 55"
Cohesion: 0.67
Nodes (1): startMdnsResponder()

### Community 56 - "Community 56"
Cohesion: 1.0
Nodes (2): formatElapsed(), LineItemTimerButton()

### Community 57 - "Community 57"
Cohesion: 1.0
Nodes (2): isActive(), LineItemSupplierPicker()

### Community 58 - "Community 58"
Cohesion: 1.0
Nodes (2): formatNum(), ScrapStat()

## Knowledge Gaps
- **Thin community `Community 0`** (93 nodes): `ApiService`, `.activateMachine()`, `.activateSupplier()`, `.activateTag()`, `.activateUser()`, `.addAssignee()`, `.addJobNote()`, `.addTimeEntry()`, `.archiveContact()`, `.archiveMachine()`, `.archiveTag()`, `.assignJobcardFile()`, `.buildPacket()`, `.changePassword()`, `.constructor()`, `.createContact()`, `.createJobcard()`, `.createMachine()`, `.createQaLevel()`, `.createSupplier()`, `.createTag()`, `.createUser()`, `.deactivateSupplier()`, `.deactivateUser()`, `._del()`, `.deleteJobcard()`, `.deleteJobNote()`, `.deleteQaLevel()`, `.deleteQaTemplate()`, `.deleteTimeEntry()`, `.exportBackup()`, `.getActiveTimer()`, `.getActivityHistory()`, `.getAttachmentWarnings()`, `.getContact()`, `.getContacts()`, `.getCosting()`, `.getEmployees()`, `.getEntityHistory()`, `.getHardwareStatus()`, `.getInactivityTimeout()`, `.getJobcard()`, `.getJobcardFile()`, `.getJobcardHistory()`, `.getJobcards()`, `.getJobNotes()`, `.getMachines()`, `.getMe()`, `.getPrinters()`, `.getQaLevel()`, `.getQaLevels()`, `.getSettings()`, `.getSupplier()`, `.getSuppliers()`, `.getTagCategories()`, `.getTags()`, `.getTimeEntries()`, `.getUser()`, `.getUserActivity()`, `.getUsers()`, `.importBackup()`, `.listJobcardFiles()`, `.login()`, `._patch()`, `._post()`, `.printJobCard()`, `._put()`, `.removeAssignee()`, `.request()`, `.search()`, `.searchContacts()`, `.selfAssign()`, `.selfUnassign()`, `.setOnSessionInvalidated()`, `.setToken()`, `.startTimer()`, `.stopTimer()`, `.unarchiveContact()`, `.unarchiveJobcard()`, `.updateContact()`, `.updateCosting()`, `.updateJobcard()`, `.updateJobcardStatus()`, `.updateMachine()`, `.updatePreferences()`, `.updateQaLevel()`, `.updateSettings()`, `.updateSupplier()`, `.updateTag()`, `.updateTimeEntry()`, `.updateUser()`, `.uploadQaTemplate()`, `.uploadToJobcardFiles()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 17`** (11 nodes): `Waves.jsx`, `Grad`, `.constructor()`, `.dot2()`, `Noise`, `.constructor()`, `.fade()`, `.lerp()`, `.perlin2()`, `.seed()`, `Waves()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (8 nodes): `main.js`, `caCertPath()`, `createMenu()`, `createWindow()`, `dataDir()`, `installLocalCertTrust()`, `startServer()`, `sweepOldJobCardPrintouts()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (4 nodes): `index.js`, `index.js`, `start()`, `startRedirectListener()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (4 nodes): `contacts.js`, `normalizeEmpty()`, `toApiFormat()`, `contacts.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (4 nodes): `machines.js`, `normalizeEmpty()`, `toResponseFormat()`, `machines.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (4 nodes): `tags.js`, `formatTag()`, `nameToValue()`, `tags.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (4 nodes): `jobStatusAuto.js`, `jobStatusAuto.js`, `isJobComplete()`, `syncStatusToWork()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (4 nodes): `pdfEngine.js`, `pdfEngine.js`, `getPdfEngineStatus()`, `verifyPdfEngine()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (4 nodes): `CostingTab.jsx`, `CostingTab()`, `money()`, `mult()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (4 nodes): `maintenance.js`, `maintenanceGuard()`, `setMaintenance()`, `maintenance.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (4 nodes): `jobcard-time-entries.js`, `normalizeEmpty()`, `readFlag()`, `jobcard-time-entries.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (3 nodes): `seed-history.js`, `seedHistory()`, `seed-history.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (3 nodes): `seed-scenarios.js`, `buildScenarios()`, `seed-scenarios.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (3 nodes): `config.js`, `config.js`, `getOrCreateJwtSecret()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (3 nodes): `seed-tags.js`, `nameToValue()`, `seed-tags.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (3 nodes): `jobcard.js`, `getAssigneesForJobcards()`, `jobcard.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (3 nodes): `jobcard-costing.js`, `auditValue()`, `jobcard-costing.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (3 nodes): `logger.js`, `logger.js`, `requestLogger()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (3 nodes): `mdnsResponder.js`, `mdnsResponder.js`, `startMdnsResponder()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (3 nodes): `LineItemTimerButton.jsx`, `formatElapsed()`, `LineItemTimerButton()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (3 nodes): `LineItemSupplierPicker.jsx`, `isActive()`, `LineItemSupplierPicker()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (3 nodes): `ScrapStat.jsx`, `formatNum()`, `ScrapStat()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ApiService` connect `Community 0` to `Community 2`?**
  _High betweenness centrality (0.080) - this node is a cross-community bridge._
- **Are the 13 inferred relationships involving `useAuth()` (e.g. with `PrivateRoute()` and `AdminRoute()`) actually correct?**
  _`useAuth()` has 13 INFERRED edges - model-reasoned connections that need verification._
- **Are the 7 inferred relationships involving `useConfirmDialog()` (e.g. with `ContactManagement()` and `JobCardList()`) actually correct?**
  _`useConfirmDialog()` has 7 INFERRED edges - model-reasoned connections that need verification._
- **Are the 4 inferred relationships involving `formatDate()` (e.g. with `fmtDateShort()` and `JobIdentityStrip()`) actually correct?**
  _`formatDate()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._