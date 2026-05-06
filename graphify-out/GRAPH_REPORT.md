# Graph Report - DHEngineering  (2026-05-07)

## Corpus Check
- 118 files · ~86,021 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 539 nodes · 760 edges · 24 communities detected
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 65 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]

## God Nodes (most connected - your core abstractions)
1. `ApiService` - 113 edges
2. `useAuth()` - 20 edges
3. `useConfirmDialog()` - 17 edges
4. `HardwareService` - 13 edges
5. `JobCardModal()` - 11 edges
6. `capitalizeFirst()` - 10 edges
7. `useTags()` - 9 edges
8. `isWithinBase()` - 9 edges
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
Cohesion: 0.06
Nodes (24): ContactManagement(), QALevelManagement(), Settings(), SupplierManagement(), TagManagement(), UserManagement(), useConfirmDialog(), useSettings() (+16 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (24): Layout(), Login(), AuthProvider(), useAuth(), useInactivityTimer(), JobCardModal(), getDefaultCostingForm(), getDefaultFormData() (+16 more)

### Community 3 - "Community 3"
Cohesion: 0.18
Nodes (16): buildJobCardWorkbook(), buildSheet(), exportActivityLog(), exportContacts(), exportEquipment(), exportJobCardList(), exportJobCardsFull(), exportSuppliers() (+8 more)

### Community 4 - "Community 4"
Cohesion: 0.13
Nodes (9): JobFilesMenu(), LineItemFilesMenu(), formatElapsed(), QuickActionPanel(), useCamera(), useItemFiles(), useJobFiles(), useQuickActionFiles() (+1 more)

### Community 5 - "Community 5"
Cohesion: 0.23
Nodes (14): buildStorageFilename(), resolveCategoryFolder(), resolveCustomerPropertyPath(), resolveJobFilesPath(), resolveJobSubfolder(), resolveQaFormsPath(), saveFile(), createCompanyFolder() (+6 more)

### Community 6 - "Community 6"
Cohesion: 0.15
Nodes (10): copyQaTemplatesForJob(), copyTemplatesToJobFolder(), createRelatedRecords(), initQaFormsFromLevel(), parseTreatments(), serializeTreatments(), itemSummary(), treatmentsToText() (+2 more)

### Community 7 - "Community 7"
Cohesion: 0.17
Nodes (7): JobCardList(), useJobCardListDensity(), formatElapsed(), useActiveTimerIndicator(), useJobCardSort(), getAvatarColor(), getInitials()

### Community 8 - "Community 8"
Cohesion: 0.19
Nodes (1): HardwareService

### Community 9 - "Community 9"
Cohesion: 0.19
Nodes (5): getTagQueries(), getTagValues(), validateItemJobTypes(), validateItemMaterials(), validateItemTreatments()

### Community 10 - "Community 10"
Cohesion: 0.17
Nodes (3): getAssigneesForJobcards(), searchAll(), searchJobs()

### Community 11 - "Community 11"
Cohesion: 0.2
Nodes (5): ActionBadge(), fmt(), SearchPage(), StatusBadge(), useSearch()

### Community 12 - "Community 12"
Cohesion: 0.25
Nodes (2): Grad, Noise

### Community 13 - "Community 13"
Cohesion: 0.2
Nodes (4): DataTable(), useTableFilter(), useTableResize(), useTableSort()

### Community 14 - "Community 14"
Cohesion: 0.36
Nodes (6): checkNativeModules(), checkPlatformMatch(), installDependencies(), log(), runChecks(), writePlatformMarker()

### Community 15 - "Community 15"
Cohesion: 0.25
Nodes (4): recordHistory(), initializeDatabase(), runMigrations(), start()

### Community 17 - "Community 17"
Cohesion: 0.31
Nodes (5): buildMenu(), errorPage(), escapeHtml(), showMain(), showSetup()

### Community 19 - "Community 19"
Cohesion: 0.47
Nodes (4): computeProgress(), formatNum(), LineItemProgress(), parseQty()

### Community 20 - "Community 20"
Cohesion: 0.4
Nodes (2): convertKeysToCamel(), snakeToCamel()

### Community 22 - "Community 22"
Cohesion: 0.5
Nodes (2): formatElapsed(), LiveElapsed()

### Community 23 - "Community 23"
Cohesion: 0.7
Nodes (4): formatElapsed(), formatNum(), LiveElapsed(), TimeEntryCard()

### Community 26 - "Community 26"
Cohesion: 0.67
Nodes (2): getSupplierWithTags(), toApiFormat()

### Community 27 - "Community 27"
Cohesion: 1.0
Nodes (2): CalendarPicker(), toDateString()

### Community 28 - "Community 28"
Cohesion: 1.0
Nodes (2): formatElapsed(), LineItemTimerButton()

## Knowledge Gaps
- **Thin community `Community 0`** (114 nodes): `api.js`, `ApiService`, `.activateUser()`, `.addAssignee()`, `.addJobNote()`, `.addQAForm()`, `.addTimeEntry()`, `.changePassword()`, `.constructor()`, `.createContact()`, `.createJobcard()`, `.createMachine()`, `.createQaLevel()`, `.createSupplier()`, `.createTag()`, `.createUser()`, `.deactivateUser()`, `._del()`, `.deleteContact()`, `.deleteDocument()`, `.deleteJobcard()`, `.deleteJobNote()`, `.deleteMachine()`, `.deleteQAForm()`, `.deleteQaLevel()`, `.deleteQaTemplate()`, `.deleteSupplier()`, `.deleteTag()`, `.deleteTimeEntry()`, `.deleteUser()`, `.exportBackup()`, `.getActiveTimer()`, `.getActivityHistory()`, `.getContact()`, `.getContacts()`, `.getCosting()`, `.getCustomerPropertyFileData()`, `.getCustomerPropertyFiles()`, `.getDocument()`, `.getDocuments()`, `.getEmployees()`, `.getEntityHistory()`, `.getHardwareStatus()`, `.getInactivityTimeout()`, `.getJobcard()`, `.getJobcardFile()`, `.getJobcardHistory()`, `.getJobcards()`, `.getJobFileData()`, `.getJobFiles()`, `.getJobNotes()`, `.getMachines()`, `.getMe()`, `.getOverdueJobcards()`, `.getPrinters()`, `.getQaFormFileData()`, `.getQaFormFiles()`, `.getQAForms()`, `.getQaLevel()`, `.getQaLevels()`, `.getScannerFiles()`, `.getScanners()`, `.getSettings()`, `.getSupplier()`, `.getSuppliers()`, `.getTagCategories()`, `.getTags()`, `.getTimeEntries()`, `.getUser()`, `.getUserActivity()`, `.getUsers()`, `.importBackup()`, `._itemQuery()`, `.listJobcardFiles()`, `.login()`, `._patch()`, `._post()`, `._put()`, `.removeAssignee()`, `.request()`, `.scannerToCustomerPropertyFiles()`, `.scannerToJobcardFiles()`, `.scannerToJobFiles()`, `.scannerToQaFormFiles()`, `.search()`, `.searchContacts()`, `.selfAssign()`, `.selfUnassign()`, `.setItemFilesStatus()`, `.setOnSessionInvalidated()`, `.setToken()`, `.startTimer()`, `.stopTimer()`, `.toggleSpecialLabour()`, `.unarchiveJobcard()`, `.updateContact()`, `.updateCosting()`, `.updateJobcard()`, `.updateJobcardStatus()`, `.updateMachine()`, `.updatePreferences()`, `.updateQAForm()`, `.updateQaLevel()`, `.updateSettings()`, `.updateSupplier()`, `.updateTag()`, `.updateTimeEntry()`, `.updateUser()`, `.uploadDocument()`, `.uploadQaTemplate()`, `.uploadToCustomerPropertyFiles()`, `.uploadToJobcardFiles()`, `.uploadToJobFiles()`, `.uploadToQaFormFiles()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 8`** (14 nodes): `hardware.js`, `HardwareService`, `.capturePhoto()`, `.checkElectron()`, `.closeCamera()`, `.constructor()`, `.getAppInfo()`, `.getCameras()`, `.getPrinters()`, `.getScanners()`, `.openCamera()`, `.print()`, `.printToPDF()`, `.scan()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 12`** (11 nodes): `Waves.jsx`, `Grad`, `.constructor()`, `.dot2()`, `Noise`, `.constructor()`, `.fade()`, `.lerp()`, `.perlin2()`, `.seed()`, `Waves()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (6 nodes): `camelToSnake()`, `convertKeysToCamel()`, `copyDirRecursive()`, `getTableColumns()`, `snakeToCamel()`, `settings.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (5 nodes): `CostingTab.jsx`, `CostingTab()`, `formatElapsed()`, `LiveElapsed()`, `TimeEntriesSection()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (4 nodes): `getSupplierWithTags()`, `normalizeEmpty()`, `toApiFormat()`, `suppliers.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (3 nodes): `CalendarPicker.jsx`, `CalendarPicker()`, `toDateString()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (3 nodes): `LineItemTimerButton.jsx`, `formatElapsed()`, `LineItemTimerButton()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useConfirmDialog()` connect `Community 1` to `Community 2`, `Community 4`, `Community 7`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Why does `useAuth()` connect `Community 2` to `Community 1`, `Community 11`, `Community 7`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Are the 10 inferred relationships involving `useAuth()` (e.g. with `PrivateRoute()` and `AdminRoute()`) actually correct?**
  _`useAuth()` has 10 INFERRED edges - model-reasoned connections that need verification._
- **Are the 8 inferred relationships involving `useConfirmDialog()` (e.g. with `ContactManagement()` and `JobCardList()`) actually correct?**
  _`useConfirmDialog()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **Are the 10 inferred relationships involving `JobCardModal()` (e.g. with `useAuth()` and `useJobCardZoom()`) actually correct?**
  _`JobCardModal()` has 10 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._