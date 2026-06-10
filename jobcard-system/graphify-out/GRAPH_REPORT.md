# Graph Report - jobcard-system  (2026-06-10)

## Corpus Check
- 136 files · ~88,877 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 548 nodes · 747 edges · 26 communities detected
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 66 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]

## God Nodes (most connected - your core abstractions)
1. `ApiService` - 92 edges
2. `useAuth()` - 22 edges
3. `useConfirmDialog()` - 15 edges
4. `HardwareService` - 13 edges
5. `JobCardModal()` - 11 edges
6. `isWithinBase()` - 10 edges
7. `useTags()` - 9 edges
8. `JobCardList()` - 8 edges
9. `saveWorkbook()` - 8 edges
10. `timestamp()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `PrivateRoute()` --calls--> `useAuth()`  [INFERRED]
  client/src/App.jsx → client/src/context/AuthContext.jsx
- `AdminRoute()` --calls--> `useAuth()`  [INFERRED]
  client/src/App.jsx → client/src/context/AuthContext.jsx
- `ContactManagement()` --calls--> `useConfirmDialog()`  [INFERRED]
  client/src/components/ContactManagement.jsx → client/src/hooks/useConfirmDialog.js
- `JobCardList()` --calls--> `useAuth()`  [INFERRED]
  client/src/components/JobCardList.jsx → client/src/context/AuthContext.jsx
- `JobCardList()` --calls--> `useConfirmDialog()`  [INFERRED]
  client/src/components/JobCardList.jsx → client/src/hooks/useConfirmDialog.js

## Communities

### Community 0 - "Community 0"
Cohesion: 0.04
Nodes (1): ApiService

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (32): Layout(), Login(), Settings(), AuthProvider(), useAuth(), useInactivityTimer(), useJobCardColumnOrder(), useSettings() (+24 more)

### Community 2 - "Community 2"
Cohesion: 0.09
Nodes (25): ContactManagement(), QALevelManagement(), SupplierManagement(), TagManagement(), UserManagement(), useConfirmDialog(), buildJobCardWorkbook(), buildSheet() (+17 more)

### Community 3 - "Community 3"
Cohesion: 0.11
Nodes (22): buildStorageFilename(), resolveCategoryFolder(), saveFile(), copyQaTemplatesForJob(), copyTemplatesToJobFolder(), createRelatedRecords(), parseTreatments(), serializeTreatments() (+14 more)

### Community 4 - "Community 4"
Cohesion: 0.08
Nodes (10): getStatusBadgeClass(), statusToken(), ActionBadge(), fmt(), SearchPage(), StatusBadge(), useSearch(), formatDueDate() (+2 more)

### Community 5 - "Community 5"
Cohesion: 0.12
Nodes (10): invalidateTagCache(), useTags(), formatFileDate(), formatFileSize(), makeEmptyTreatment(), useJobSearch(), DetailsReadOnlyView(), DetailsTab() (+2 more)

### Community 6 - "Community 6"
Cohesion: 0.17
Nodes (7): buildGrandfatheredPairs(), getSupplierQueries(), getTagQueries(), getTagValues(), validateItemJobTypes(), validateItemMaterials(), validateItemTreatments()

### Community 7 - "Community 7"
Cohesion: 0.17
Nodes (8): JobCardList(), getJobCardColumns(), useJobCardListDensity(), formatElapsed(), useActiveTimerIndicator(), useJobCardSort(), getAvatarColor(), getInitials()

### Community 8 - "Community 8"
Cohesion: 0.19
Nodes (1): HardwareService

### Community 9 - "Community 9"
Cohesion: 0.17
Nodes (3): getAssigneesForJobcards(), searchAll(), searchJobs()

### Community 10 - "Community 10"
Cohesion: 0.21
Nodes (7): getSettings(), peekNextJobNumber(), recordHistory(), checkInterruptedRestore(), initializeDatabase(), runMigrations(), start()

### Community 11 - "Community 11"
Cohesion: 0.25
Nodes (2): Grad, Noise

### Community 12 - "Community 12"
Cohesion: 0.27
Nodes (4): JobFilesMenu(), useCamera(), useJobFiles(), FilesTab()

### Community 13 - "Community 13"
Cohesion: 0.2
Nodes (4): DataTable(), useTableFilter(), useTableResize(), useTableSort()

### Community 14 - "Community 14"
Cohesion: 0.36
Nodes (6): checkNativeModules(), checkPlatformMatch(), installDependencies(), log(), runChecks(), writePlatformMarker()

### Community 15 - "Community 15"
Cohesion: 0.31
Nodes (5): buildMenu(), errorPage(), escapeHtml(), showMain(), showSetup()

### Community 16 - "Community 16"
Cohesion: 0.39
Nodes (3): isTopModal(), pushModal(), removeModal()

### Community 17 - "Community 17"
Cohesion: 0.32
Nodes (3): archiveBackup(), archiveBackupWithRetry(), partitionReadableFiles()

### Community 19 - "Community 19"
Cohesion: 0.47
Nodes (4): computeProgress(), formatNum(), LineItemProgress(), parseQty()

### Community 20 - "Community 20"
Cohesion: 0.4
Nodes (2): checkLoginRateLimit(), cooldownMsForCount()

### Community 22 - "Community 22"
Cohesion: 0.7
Nodes (4): formatElapsed(), formatNum(), LiveElapsed(), TimeEntryCard()

### Community 24 - "Community 24"
Cohesion: 0.5
Nodes (2): convertKeysToCamel(), snakeToCamel()

### Community 26 - "Community 26"
Cohesion: 0.67
Nodes (2): getSupplierWithTags(), toApiFormat()

### Community 27 - "Community 27"
Cohesion: 1.0
Nodes (2): CalendarPicker(), toDateString()

### Community 28 - "Community 28"
Cohesion: 1.0
Nodes (2): formatElapsed(), LineItemTimerButton()

### Community 29 - "Community 29"
Cohesion: 1.0
Nodes (2): formatNum(), ScrapStat()

## Knowledge Gaps
- **Thin community `Community 0`** (93 nodes): `api.js`, `ApiService`, `.activateMachine()`, `.activateSupplier()`, `.activateUser()`, `.addAssignee()`, `.addJobNote()`, `.addTimeEntry()`, `.archiveMachine()`, `.changePassword()`, `.constructor()`, `.createContact()`, `.createJobcard()`, `.createMachine()`, `.createQaLevel()`, `.createSupplier()`, `.createTag()`, `.createUser()`, `.deactivateSupplier()`, `.deactivateUser()`, `._del()`, `.deleteContact()`, `.deleteJobcard()`, `.deleteJobNote()`, `.deleteQaLevel()`, `.deleteQaTemplate()`, `.deleteTag()`, `.deleteTimeEntry()`, `.exportBackup()`, `.getActiveTimer()`, `.getActivityHistory()`, `.getContact()`, `.getContacts()`, `.getCosting()`, `.getEmployees()`, `.getEntityHistory()`, `.getHardwareStatus()`, `.getInactivityTimeout()`, `.getJobcard()`, `.getJobcardFile()`, `.getJobcardHistory()`, `.getJobcards()`, `.getJobNotes()`, `.getMachines()`, `.getMe()`, `.getOverdueJobcards()`, `.getPrinters()`, `.getQaLevel()`, `.getQaLevels()`, `.getScannerFiles()`, `.getScanners()`, `.getSettings()`, `.getSupplier()`, `.getSuppliers()`, `.getTagCategories()`, `.getTags()`, `.getTimeEntries()`, `.getUser()`, `.getUserActivity()`, `.getUsers()`, `.importBackup()`, `.listJobcardFiles()`, `.login()`, `._patch()`, `._post()`, `._put()`, `.removeAssignee()`, `.request()`, `.scannerToJobcardFiles()`, `.search()`, `.searchContacts()`, `.selfAssign()`, `.selfUnassign()`, `.setOnSessionInvalidated()`, `.setToken()`, `.startTimer()`, `.stopTimer()`, `.toggleSpecialLabour()`, `.unarchiveJobcard()`, `.updateContact()`, `.updateCosting()`, `.updateJobcard()`, `.updateJobcardStatus()`, `.updateMachine()`, `.updatePreferences()`, `.updateQaLevel()`, `.updateSettings()`, `.updateSupplier()`, `.updateTag()`, `.updateTimeEntry()`, `.updateUser()`, `.uploadQaTemplate()`, `.uploadToJobcardFiles()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 8`** (14 nodes): `hardware.js`, `HardwareService`, `.capturePhoto()`, `.checkElectron()`, `.closeCamera()`, `.constructor()`, `.getAppInfo()`, `.getCameras()`, `.getPrinters()`, `.getScanners()`, `.openCamera()`, `.print()`, `.printToPDF()`, `.scan()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 11`** (11 nodes): `Waves.jsx`, `Grad`, `.constructor()`, `.dot2()`, `Noise`, `.constructor()`, `.fade()`, `.lerp()`, `.perlin2()`, `.seed()`, `Waves()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (6 nodes): `checkLoginRateLimit()`, `clearLoginFailures()`, `cooldownMsForCount()`, `normalizeEmpty()`, `recordLoginFailure()`, `auth.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (5 nodes): `camelToSnake()`, `convertKeysToCamel()`, `getTableColumns()`, `snakeToCamel()`, `settings.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (4 nodes): `getSupplierWithTags()`, `normalizeEmpty()`, `toApiFormat()`, `suppliers.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (3 nodes): `CalendarPicker.jsx`, `CalendarPicker()`, `toDateString()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (3 nodes): `LineItemTimerButton.jsx`, `formatElapsed()`, `LineItemTimerButton()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (3 nodes): `ScrapStat.jsx`, `formatNum()`, `ScrapStat()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useAuth()` connect `Community 1` to `Community 2`, `Community 4`, `Community 7`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Why does `useConfirmDialog()` connect `Community 2` to `Community 1`, `Community 7`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Are the 11 inferred relationships involving `useAuth()` (e.g. with `PrivateRoute()` and `AdminRoute()`) actually correct?**
  _`useAuth()` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Are the 7 inferred relationships involving `useConfirmDialog()` (e.g. with `ContactManagement()` and `JobCardList()`) actually correct?**
  _`useConfirmDialog()` has 7 INFERRED edges - model-reasoned connections that need verification._
- **Are the 10 inferred relationships involving `JobCardModal()` (e.g. with `useAuth()` and `useJobCardZoom()`) actually correct?**
  _`JobCardModal()` has 10 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._