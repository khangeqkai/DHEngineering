# Graph Report - DHEngineering  (2026-06-09)

## Corpus Check
- 134 files · ~96,604 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 608 nodes · 864 edges · 26 communities detected
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 76 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]

## God Nodes (most connected - your core abstractions)
1. `ApiService` - 115 edges
2. `useAuth()` - 22 edges
3. `useConfirmDialog()` - 17 edges
4. `HardwareService` - 13 edges
5. `isWithinBase()` - 12 edges
6. `JobCardModal()` - 11 edges
7. `capitalizeFirst()` - 10 edges
8. `useTags()` - 9 edges
9. `sanitizeFolderName()` - 9 edges
10. `JobCardList()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `PrivateRoute()` --calls--> `useAuth()`  [INFERRED]
  client/src/App.jsx → client/src/context/AuthContext.jsx
- `AdminRoute()` --calls--> `useAuth()`  [INFERRED]
  client/src/App.jsx → client/src/context/AuthContext.jsx
- `ContactManagement()` --calls--> `useConfirmDialog()`  [INFERRED]
  client/src/components/ContactManagement.jsx → client/src/hooks/useConfirmDialog.js
- `JobCardList()` --calls--> `useConfirmDialog()`  [INFERRED]
  client/src/components/JobCardList.jsx → client/src/hooks/useConfirmDialog.js
- `JobCardList()` --calls--> `useJobCardSort()`  [INFERRED]
  client/src/components/JobCardList.jsx → client/src/hooks/useJobCardSort.js

## Communities

### Community 0 - "Community 0"
Cohesion: 0.03
Nodes (1): ApiService

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (30): ContactManagement(), QALevelManagement(), SupplierManagement(), TagManagement(), useConfirmDialog(), formatFileDate(), formatFileSize(), useJobSearch() (+22 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (23): JobCardList(), mergeColumnOrder(), getJobCardColumns(), useJobCardListDensity(), Layout(), Login(), Settings(), UserManagement() (+15 more)

### Community 3 - "Community 3"
Cohesion: 0.11
Nodes (25): buildStorageFilename(), resolveCategoryFolder(), resolveCustomerPropertyPath(), resolveJobFilesPath(), resolveJobSubfolder(), resolveQaFormsPath(), saveFile(), copyQaTemplatesForJob() (+17 more)

### Community 4 - "Community 4"
Cohesion: 0.09
Nodes (18): JobCardModal(), validateJobCardForm(), getDefaultCostingForm(), getDefaultFormData(), getDefaultTimeEntryForm(), isoToLocalInput(), localInputToIso(), mapLineItemFromApi() (+10 more)

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (11): getStatusBadgeClass(), statusToken(), ActionBadge(), fmt(), SearchPage(), StatusBadge(), useSearch(), formatDueDate() (+3 more)

### Community 6 - "Community 6"
Cohesion: 0.12
Nodes (10): JobFilesMenu(), LineItemFilesMenu(), formatElapsed(), QuickActionPanel(), useCamera(), useItemFiles(), useJobFiles(), useQuickActionFiles() (+2 more)

### Community 7 - "Community 7"
Cohesion: 0.12
Nodes (6): invalidateTagCache(), useTags(), makeEmptyTreatment(), DetailsReadOnlyView(), ItemsTab(), TreatmentChips()

### Community 8 - "Community 8"
Cohesion: 0.17
Nodes (7): buildGrandfatheredPairs(), getSupplierQueries(), getTagQueries(), getTagValues(), validateItemJobTypes(), validateItemMaterials(), validateItemTreatments()

### Community 9 - "Community 9"
Cohesion: 0.19
Nodes (1): HardwareService

### Community 10 - "Community 10"
Cohesion: 0.17
Nodes (3): getAssigneesForJobcards(), searchAll(), searchJobs()

### Community 11 - "Community 11"
Cohesion: 0.21
Nodes (7): getSettings(), peekNextJobNumber(), recordHistory(), checkInterruptedRestore(), initializeDatabase(), runMigrations(), start()

### Community 12 - "Community 12"
Cohesion: 0.25
Nodes (2): Grad, Noise

### Community 13 - "Community 13"
Cohesion: 0.2
Nodes (4): DataTable(), useTableFilter(), useTableResize(), useTableSort()

### Community 14 - "Community 14"
Cohesion: 0.36
Nodes (6): checkNativeModules(), checkPlatformMatch(), installDependencies(), log(), runChecks(), writePlatformMarker()

### Community 16 - "Community 16"
Cohesion: 0.28
Nodes (5): parseTreatments(), itemSummary(), treatmentsToText(), itemSummary(), treatmentsToText()

### Community 17 - "Community 17"
Cohesion: 0.31
Nodes (5): buildMenu(), errorPage(), escapeHtml(), showMain(), showSetup()

### Community 18 - "Community 18"
Cohesion: 0.39
Nodes (3): isTopModal(), pushModal(), removeModal()

### Community 19 - "Community 19"
Cohesion: 0.32
Nodes (3): archiveBackup(), archiveBackupWithRetry(), partitionReadableFiles()

### Community 20 - "Community 20"
Cohesion: 0.29
Nodes (2): convertKeysToCamel(), snakeToCamel()

### Community 21 - "Community 21"
Cohesion: 0.47
Nodes (4): computeProgress(), formatNum(), LineItemProgress(), parseQty()

### Community 22 - "Community 22"
Cohesion: 0.4
Nodes (2): checkLoginRateLimit(), cooldownMsForCount()

### Community 25 - "Community 25"
Cohesion: 0.7
Nodes (4): formatElapsed(), formatNum(), LiveElapsed(), TimeEntryCard()

### Community 28 - "Community 28"
Cohesion: 0.67
Nodes (2): getSupplierWithTags(), toApiFormat()

### Community 29 - "Community 29"
Cohesion: 1.0
Nodes (2): CalendarPicker(), toDateString()

### Community 30 - "Community 30"
Cohesion: 1.0
Nodes (2): formatElapsed(), LineItemTimerButton()

## Knowledge Gaps
- **Thin community `Community 0`** (116 nodes): `api.js`, `ApiService`, `.activateSupplier()`, `.activateUser()`, `.addAssignee()`, `.addJobNote()`, `.addQAForm()`, `.addTimeEntry()`, `.changePassword()`, `.constructor()`, `.createContact()`, `.createJobcard()`, `.createMachine()`, `.createQaLevel()`, `.createSupplier()`, `.createTag()`, `.createUser()`, `.deactivateSupplier()`, `.deactivateUser()`, `._del()`, `.deleteContact()`, `.deleteDocument()`, `.deleteJobcard()`, `.deleteJobNote()`, `.deleteMachine()`, `.deleteQAForm()`, `.deleteQaLevel()`, `.deleteQaTemplate()`, `.deleteSupplier()`, `.deleteTag()`, `.deleteTimeEntry()`, `.deleteUser()`, `.exportBackup()`, `.getActiveTimer()`, `.getActivityHistory()`, `.getContact()`, `.getContacts()`, `.getCosting()`, `.getCustomerPropertyFileData()`, `.getCustomerPropertyFiles()`, `.getDocument()`, `.getDocuments()`, `.getEmployees()`, `.getEntityHistory()`, `.getHardwareStatus()`, `.getInactivityTimeout()`, `.getJobcard()`, `.getJobcardFile()`, `.getJobcardHistory()`, `.getJobcards()`, `.getJobFileData()`, `.getJobFiles()`, `.getJobNotes()`, `.getMachines()`, `.getMe()`, `.getOverdueJobcards()`, `.getPrinters()`, `.getQaFormFileData()`, `.getQaFormFiles()`, `.getQAForms()`, `.getQaLevel()`, `.getQaLevels()`, `.getScannerFiles()`, `.getScanners()`, `.getSettings()`, `.getSupplier()`, `.getSuppliers()`, `.getTagCategories()`, `.getTags()`, `.getTimeEntries()`, `.getUser()`, `.getUserActivity()`, `.getUsers()`, `.importBackup()`, `._itemQuery()`, `.listJobcardFiles()`, `.login()`, `._patch()`, `._post()`, `._put()`, `.removeAssignee()`, `.request()`, `.scannerToCustomerPropertyFiles()`, `.scannerToJobcardFiles()`, `.scannerToJobFiles()`, `.scannerToQaFormFiles()`, `.search()`, `.searchContacts()`, `.selfAssign()`, `.selfUnassign()`, `.setItemFilesStatus()`, `.setOnSessionInvalidated()`, `.setToken()`, `.startTimer()`, `.stopTimer()`, `.toggleSpecialLabour()`, `.unarchiveJobcard()`, `.updateContact()`, `.updateCosting()`, `.updateJobcard()`, `.updateJobcardStatus()`, `.updateMachine()`, `.updatePreferences()`, `.updateQAForm()`, `.updateQaLevel()`, `.updateSettings()`, `.updateSupplier()`, `.updateTag()`, `.updateTimeEntry()`, `.updateUser()`, `.uploadDocument()`, `.uploadQaTemplate()`, `.uploadToCustomerPropertyFiles()`, `.uploadToJobcardFiles()`, `.uploadToJobFiles()`, `.uploadToQaFormFiles()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 9`** (14 nodes): `hardware.js`, `HardwareService`, `.capturePhoto()`, `.checkElectron()`, `.closeCamera()`, `.constructor()`, `.getAppInfo()`, `.getCameras()`, `.getPrinters()`, `.getScanners()`, `.openCamera()`, `.print()`, `.printToPDF()`, `.scan()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 12`** (11 nodes): `Waves.jsx`, `Grad`, `.constructor()`, `.dot2()`, `Noise`, `.constructor()`, `.fade()`, `.lerp()`, `.perlin2()`, `.seed()`, `Waves()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (8 nodes): `camelToSnake()`, `convertKeysToCamel()`, `copyDirRecursive()`, `getTableColumns()`, `listFilesRecursive()`, `snakeToCamel()`, `verifyStagedFiles()`, `settings.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (6 nodes): `checkLoginRateLimit()`, `clearLoginFailures()`, `cooldownMsForCount()`, `normalizeEmpty()`, `recordLoginFailure()`, `auth.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (4 nodes): `getSupplierWithTags()`, `normalizeEmpty()`, `toApiFormat()`, `suppliers.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (3 nodes): `CalendarPicker.jsx`, `CalendarPicker()`, `toDateString()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (3 nodes): `LineItemTimerButton.jsx`, `formatElapsed()`, `LineItemTimerButton()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useAuth()` connect `Community 2` to `Community 4`, `Community 5`, `Community 6`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Why does `useConfirmDialog()` connect `Community 1` to `Community 2`, `Community 4`, `Community 6`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Are the 11 inferred relationships involving `useAuth()` (e.g. with `PrivateRoute()` and `AdminRoute()`) actually correct?**
  _`useAuth()` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Are the 8 inferred relationships involving `useConfirmDialog()` (e.g. with `ContactManagement()` and `JobCardList()`) actually correct?**
  _`useConfirmDialog()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `isWithinBase()` (e.g. with `resolveCategoryFolder()` and `saveFile()`) actually correct?**
  _`isWithinBase()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._