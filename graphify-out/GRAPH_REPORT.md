# Graph Report - DHEngineering  (2026-06-23)

## Corpus Check
- 143 files · ~117,014 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 774 nodes · 1171 edges · 34 communities detected
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 106 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]

## God Nodes (most connected - your core abstractions)
1. `ApiService` - 127 edges
2. `useAuth()` - 22 edges
3. `isWithinBase()` - 22 edges
4. `useConfirmDialog()` - 17 edges
5. `sanitizeFolderName()` - 13 edges
6. `HardwareService` - 13 edges
7. `JobCardModal()` - 12 edges
8. `useTags()` - 11 edges
9. `capitalizeFirst()` - 11 edges
10. `JobCardList()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `PrivateRoute()` --calls--> `useAuth()`  [INFERRED]
  client/src/App.jsx → client/src/context/AuthContext.jsx
- `AdminRoute()` --calls--> `useAuth()`  [INFERRED]
  client/src/App.jsx → client/src/context/AuthContext.jsx
- `ContactManagement()` --calls--> `useConfirmDialog()`  [INFERRED]
  client/src/components/ContactManagement.jsx → client/src/hooks/useConfirmDialog.js
- `StatusBadge()` --calls--> `statusToken()`  [INFERRED]
  client/src/components/SearchPage.jsx → client/src/components/JobCardList.constants.js
- `JobCardList()` --calls--> `useAuth()`  [INFERRED]
  client/src/components/JobCardList.jsx → client/src/context/AuthContext.jsx

## Communities

### Community 0 - "Community 0"
Cohesion: 0.03
Nodes (1): ApiService

### Community 1 - "Community 1"
Cohesion: 0.09
Nodes (46): buildStorageFilename(), listCategoryFileNames(), listFolderFiles(), nextQaFormNumber(), partFileCode(), resolveCategoryFolder(), resolveCustomerPropertyPath(), resolveJobFilesPath() (+38 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (24): ContactManagement(), QALevelManagement(), SupplierManagement(), TagManagement(), UserManagement(), useConfirmDialog(), invalidateTagCache(), useTags() (+16 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (32): JobCardList(), getJobCardColumns(), useJobCardListDensity(), Layout(), formatElapsed(), useActiveTimerIndicator(), useJobCardSort(), useMissingFilesIndicator() (+24 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (13): JobFilesMenu(), JobPaperworkHub(), LineItemFilesMenu(), formatElapsed(), QuickActionPanel(), useCamera(), useItemFiles(), useJobFiles() (+5 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (19): JobCardModal(), validateJobCardForm(), getDefaultCostingForm(), getDefaultFormData(), getDefaultTimeEntryForm(), isoToLocalInput(), localInputToIso(), mapLineItemFromApi() (+11 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (21): getSettings(), peekNextJobNumber(), recordHistory(), autoAssignWorker(), checkCriticalInspection(), flagToBool(), isCriticalJob(), readFlag() (+13 more)

### Community 7 - "Community 7"
Cohesion: 0.08
Nodes (18): mergeColumnOrder(), Login(), ActionBadge(), fmt(), SearchPage(), StatusBadge(), Settings(), AuthProvider() (+10 more)

### Community 8 - "Community 8"
Cohesion: 0.15
Nodes (11): buildGrandfatheredPairs(), buildGrandfatheredValues(), getSupplierQueries(), getTagQueries(), getTagValues(), validateItemCustomerProperty(), validateItemDrawings(), validateItemJobTypes() (+3 more)

### Community 9 - "Community 9"
Cohesion: 0.19
Nodes (10): CalendarPicker(), toDateString(), isTopModal(), pushModal(), removeModal(), clockTime(), Counter(), formatDuration() (+2 more)

### Community 10 - "Community 10"
Cohesion: 0.18
Nodes (14): checkInterruptedRestore(), ensureBuiltInStandardLevel(), initializeDatabase(), runMigrations(), start(), discardBrowser(), getBrowser(), inElectron() (+6 more)

### Community 11 - "Community 11"
Cohesion: 0.19
Nodes (1): HardwareService

### Community 12 - "Community 12"
Cohesion: 0.17
Nodes (3): getAssigneesForJobcards(), searchAll(), searchJobs()

### Community 13 - "Community 13"
Cohesion: 0.18
Nodes (1): formatHistoryValue()

### Community 14 - "Community 14"
Cohesion: 0.25
Nodes (2): Grad, Noise

### Community 15 - "Community 15"
Cohesion: 0.2
Nodes (4): DataTable(), useTableFilter(), useTableResize(), useTableSort()

### Community 16 - "Community 16"
Cohesion: 0.33
Nodes (7): checkNativeModules(), checkPdfBrowser(), checkPlatformMatch(), installDependencies(), log(), runChecks(), writePlatformMarker()

### Community 17 - "Community 17"
Cohesion: 0.39
Nodes (8): buildClientIfNeeded(), cmdLan(), cmdSeed(), confirm(), findLanIp(), newestMtime(), runSetup(), waitForHealth()

### Community 19 - "Community 19"
Cohesion: 0.28
Nodes (5): parseTreatments(), itemSummary(), treatmentsToText(), itemSummary(), treatmentsToText()

### Community 20 - "Community 20"
Cohesion: 0.31
Nodes (5): buildMenu(), errorPage(), escapeHtml(), showMain(), showSetup()

### Community 21 - "Community 21"
Cohesion: 0.36
Nodes (5): getStatusBadgeClass(), statusToken(), formatDueDate(), JobIdentityStrip(), statusToken()

### Community 22 - "Community 22"
Cohesion: 0.32
Nodes (3): archiveBackup(), archiveBackupWithRetry(), partitionReadableFiles()

### Community 23 - "Community 23"
Cohesion: 0.29
Nodes (2): convertKeysToCamel(), snakeToCamel()

### Community 25 - "Community 25"
Cohesion: 0.47
Nodes (4): computeProgress(), formatNum(), LineItemProgress(), parseQty()

### Community 26 - "Community 26"
Cohesion: 0.4
Nodes (2): checkLoginRateLimit(), cooldownMsForCount()

### Community 27 - "Community 27"
Cohesion: 0.7
Nodes (4): formatElapsed(), formatNum(), LiveElapsed(), TimeEntryCard()

### Community 30 - "Community 30"
Cohesion: 0.67
Nodes (2): getSupplierWithTags(), toApiFormat()

### Community 31 - "Community 31"
Cohesion: 0.67
Nodes (2): assertMatchesExtension(), matchesSignature()

### Community 32 - "Community 32"
Cohesion: 0.83
Nodes (3): esc(), renderItem(), renderJobCardHtml()

### Community 33 - "Community 33"
Cohesion: 0.83
Nodes (3): fillPdfTemplate(), formatTreatments(), toPdfSafe()

### Community 34 - "Community 34"
Cohesion: 0.83
Nodes (3): appendImage(), appendPdf(), buildPacketPdf()

### Community 35 - "Community 35"
Cohesion: 0.67
Nodes (2): formatNum(), JobScrapSummary()

### Community 36 - "Community 36"
Cohesion: 1.0
Nodes (2): formatElapsed(), LineItemTimerButton()

### Community 37 - "Community 37"
Cohesion: 1.0
Nodes (2): formatNum(), ScrapStat()

## Knowledge Gaps
- **Thin community `Community 0`** (127 nodes): `ApiService`, `.activateMachine()`, `.activateSupplier()`, `.activateTag()`, `.activateUser()`, `.addAssignee()`, `.addJobNote()`, `.addQAForm()`, `.addTimeEntry()`, `.archiveContact()`, `.archiveMachine()`, `.archiveTag()`, `.buildPacket()`, `.changePassword()`, `.constructor()`, `.createContact()`, `.createJobcard()`, `.createMachine()`, `.createQaLevel()`, `.createSupplier()`, `.createTag()`, `.createUser()`, `.deactivateSupplier()`, `.deactivateUser()`, `._del()`, `.deleteContact()`, `.deleteDocument()`, `.deleteJobcard()`, `.deleteJobCardTemplate()`, `.deleteJobNote()`, `.deleteMachine()`, `.deleteQAForm()`, `.deleteQaLevel()`, `.deleteQaTemplate()`, `.deleteSupplier()`, `.deleteTag()`, `.deleteTimeEntry()`, `.deleteUser()`, `.exportBackup()`, `.getActiveTimer()`, `.getActivityHistory()`, `.getAttachmentWarnings()`, `.getContact()`, `.getContacts()`, `.getCosting()`, `.getCustomerPropertyFileData()`, `.getCustomerPropertyFiles()`, `.getDocument()`, `.getDocuments()`, `.getEmployees()`, `.getEntityHistory()`, `.getHardwareStatus()`, `.getInactivityTimeout()`, `.getJobcard()`, `.getJobcardFile()`, `.getJobcardHistory()`, `.getJobcards()`, `.getJobCardTemplate()`, `.getJobFileData()`, `.getJobFiles()`, `.getJobNotes()`, `.getMachines()`, `.getMe()`, `.getOverdueJobcards()`, `.getPrinters()`, `.getQaFormFileData()`, `.getQaFormFiles()`, `.getQAForms()`, `.getQaLevel()`, `.getQaLevels()`, `.getScannerFiles()`, `.getScanners()`, `.getSettings()`, `.getSupplier()`, `.getSuppliers()`, `.getTagCategories()`, `.getTags()`, `.getTimeEntries()`, `.getUser()`, `.getUserActivity()`, `.getUsers()`, `.importBackup()`, `._itemQuery()`, `.listJobcardFiles()`, `.login()`, `._patch()`, `._post()`, `.printJobCard()`, `._put()`, `.removeAssignee()`, `.request()`, `.scannerToCustomerPropertyFiles()`, `.scannerToJobcardFiles()`, `.scannerToJobFiles()`, `.scannerToQaFormFiles()`, `.search()`, `.searchContacts()`, `.selfAssign()`, `.selfUnassign()`, `.setItemFilesStatus()`, `.setOnSessionInvalidated()`, `.setToken()`, `.startTimer()`, `.stopTimer()`, `.toggleSpecialLabour()`, `.unarchiveContact()`, `.unarchiveJobcard()`, `.updateContact()`, `.updateCosting()`, `.updateJobcard()`, `.updateJobcardStatus()`, `.updateMachine()`, `.updatePreferences()`, `.updateQAForm()`, `.updateQaLevel()`, `.updateSettings()`, `.updateSupplier()`, `.updateTag()`, `.updateTimeEntry()`, `.updateUser()`, `.uploadDocument()`, `.uploadJobCardTemplate()`, `.uploadQaTemplate()`, `.uploadToCustomerPropertyFiles()`, `.uploadToJobcardFiles()`, `.uploadToJobFiles()`, `.uploadToQaFormFiles()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 11`** (14 nodes): `hardware.js`, `HardwareService`, `.capturePhoto()`, `.checkElectron()`, `.closeCamera()`, `.constructor()`, `.getAppInfo()`, `.getCameras()`, `.getPrinters()`, `.getScanners()`, `.openCamera()`, `.print()`, `.printToPDF()`, `.scan()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 13`** (11 nodes): `ActivityLog.jsx`, `EntityActivityLog.jsx`, `ActivityLogTab.jsx`, `EntityActivityLog()`, `formatAction()`, `formatChanges()`, `formatDate()`, `formatTarget()`, `ActivityLog()`, `ActivityLogTab()`, `formatHistoryValue()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 14`** (11 nodes): `Waves.jsx`, `Grad`, `.constructor()`, `.dot2()`, `Noise`, `.constructor()`, `.fade()`, `.lerp()`, `.perlin2()`, `.seed()`, `Waves()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (8 nodes): `camelToSnake()`, `convertKeysToCamel()`, `copyDirRecursive()`, `getTableColumns()`, `listFilesRecursive()`, `snakeToCamel()`, `verifyStagedFiles()`, `settings.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (6 nodes): `checkLoginRateLimit()`, `clearLoginFailures()`, `cooldownMsForCount()`, `normalizeEmpty()`, `recordLoginFailure()`, `auth.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (4 nodes): `getSupplierWithTags()`, `normalizeEmpty()`, `toApiFormat()`, `suppliers.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (4 nodes): `fileValidation.js`, `assertMatchesExtension()`, `decodeBase64Strict()`, `matchesSignature()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (4 nodes): `JobScrapSummary.jsx`, `formatNum()`, `JobScrapSummary()`, `parseQty()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (3 nodes): `LineItemTimerButton.jsx`, `formatElapsed()`, `LineItemTimerButton()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (3 nodes): `ScrapStat.jsx`, `formatNum()`, `ScrapStat()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ApiService` connect `Community 0` to `Community 4`?**
  _High betweenness centrality (0.130) - this node is a cross-community bridge._
- **Are the 11 inferred relationships involving `useAuth()` (e.g. with `PrivateRoute()` and `AdminRoute()`) actually correct?**
  _`useAuth()` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Are the 9 inferred relationships involving `isWithinBase()` (e.g. with `resolveJobFolder()` and `resolveCategoryFolder()`) actually correct?**
  _`isWithinBase()` has 9 INFERRED edges - model-reasoned connections that need verification._
- **Are the 8 inferred relationships involving `useConfirmDialog()` (e.g. with `ContactManagement()` and `JobCardList()`) actually correct?**
  _`useConfirmDialog()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **Are the 4 inferred relationships involving `sanitizeFolderName()` (e.g. with `resolveJobFolder()` and `copyTemplatesToJobFolder()`) actually correct?**
  _`sanitizeFolderName()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._