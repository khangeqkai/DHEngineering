# Graph Report - .  (2026-05-06)

## Corpus Check
- 123 files · ~81,434 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 490 nodes · 679 edges · 18 communities detected
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 57 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_API Service Layer|API Service Layer]]
- [[_COMMUNITY_JobCard Tabs & Forms|JobCard Tabs & Forms]]
- [[_COMMUNITY_JobCard Modal Core|JobCard Modal Core]]
- [[_COMMUNITY_App Shell & Routing|App Shell & Routing]]
- [[_COMMUNITY_File Path Helpers|File Path Helpers]]
- [[_COMMUNITY_Activity & User Admin|Activity & User Admin]]
- [[_COMMUNITY_Hardware Service|Hardware Service]]
- [[_COMMUNITY_Tag Queries & Validation|Tag Queries & Validation]]
- [[_COMMUNITY_Server Response Formatters|Server Response Formatters]]
- [[_COMMUNITY_Search UI|Search UI]]
- [[_COMMUNITY_Waves Animation|Waves Animation]]
- [[_COMMUNITY_Data Table|Data Table]]
- [[_COMMUNITY_Setup Script|Setup Script]]
- [[_COMMUNITY_Settings & DB Init|Settings & DB Init]]
- [[_COMMUNITY_Worker Client Electron|Worker Client Electron]]
- [[_COMMUNITY_DB Casing Helpers|DB Casing Helpers]]
- [[_COMMUNITY_Suppliers Routes|Suppliers Routes]]
- [[_COMMUNITY_Calendar Picker|Calendar Picker]]

## God Nodes (most connected - your core abstractions)
1. `ApiService` - 105 edges
2. `useAuth()` - 20 edges
3. `useConfirmDialog()` - 17 edges
4. `HardwareService` - 13 edges
5. `JobCardModal()` - 11 edges
6. `useTags()` - 9 edges
7. `capitalizeFirst()` - 9 edges
8. `saveWorkbook()` - 8 edges
9. `timestamp()` - 8 edges
10. `buildSheet()` - 7 edges

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

### Community 0 - "API Service Layer"
Cohesion: 0.04
Nodes (1): ApiService

### Community 1 - "JobCard Tabs & Forms"
Cohesion: 0.07
Nodes (20): ContactManagement(), QALevelManagement(), SupplierManagement(), TagManagement(), useConfirmDialog(), invalidateTagCache(), useTags(), formatFileDate() (+12 more)

### Community 2 - "JobCard Modal Core"
Cohesion: 0.07
Nodes (20): JobCardModal(), getDefaultCostingForm(), getDefaultFormData(), getDefaultTimeEntryForm(), mapLineItemFromApi(), formatElapsed(), QuickActionPanel(), useActivityLog() (+12 more)

### Community 3 - "App Shell & Routing"
Cohesion: 0.08
Nodes (19): JobCardList(), useJobCardListDensity(), Layout(), Login(), Settings(), AuthProvider(), useAuth(), formatElapsed() (+11 more)

### Community 4 - "File Path Helpers"
Cohesion: 0.11
Nodes (19): resolveCustomerPropertyPath(), resolveJobFilesPath(), resolveJobSubfolder(), resolveQaFormsPath(), copyTemplatesToJobFolder(), createRelatedRecords(), initQaFormsFromLevel(), parseTreatments() (+11 more)

### Community 5 - "Activity & User Admin"
Cohesion: 0.16
Nodes (16): UserManagement(), buildJobCardWorkbook(), buildSheet(), exportActivityLog(), exportEquipment(), exportJobCardList(), exportJobCardsFull(), exportSuppliers() (+8 more)

### Community 6 - "Hardware Service"
Cohesion: 0.19
Nodes (1): HardwareService

### Community 7 - "Tag Queries & Validation"
Cohesion: 0.19
Nodes (5): getTagQueries(), getTagValues(), validateItemJobTypes(), validateItemMaterials(), validateItemTreatments()

### Community 8 - "Server Response Formatters"
Cohesion: 0.17
Nodes (3): getAssigneesForJobcards(), searchAll(), searchJobs()

### Community 9 - "Search UI"
Cohesion: 0.2
Nodes (5): ActionBadge(), fmt(), SearchPage(), StatusBadge(), useSearch()

### Community 10 - "Waves Animation"
Cohesion: 0.25
Nodes (2): Grad, Noise

### Community 11 - "Data Table"
Cohesion: 0.2
Nodes (4): DataTable(), useTableFilter(), useTableResize(), useTableSort()

### Community 12 - "Setup Script"
Cohesion: 0.36
Nodes (6): checkNativeModules(), checkPlatformMatch(), installDependencies(), log(), runChecks(), writePlatformMarker()

### Community 13 - "Settings & DB Init"
Cohesion: 0.25
Nodes (4): recordHistory(), initializeDatabase(), runMigrations(), start()

### Community 14 - "Worker Client Electron"
Cohesion: 0.31
Nodes (5): buildMenu(), errorPage(), escapeHtml(), showMain(), showSetup()

### Community 17 - "DB Casing Helpers"
Cohesion: 0.4
Nodes (2): convertKeysToCamel(), snakeToCamel()

### Community 21 - "Suppliers Routes"
Cohesion: 0.67
Nodes (2): getSupplierWithTags(), toApiFormat()

### Community 22 - "Calendar Picker"
Cohesion: 1.0
Nodes (2): CalendarPicker(), toDateString()

## Knowledge Gaps
- **Thin community `API Service Layer`** (106 nodes): `api.js`, `ApiService`, `.activateUser()`, `.addAssignee()`, `.addJobNote()`, `.addQAForm()`, `.addTimeEntry()`, `.changePassword()`, `.constructor()`, `.createContact()`, `.createJobcard()`, `.createMachine()`, `.createQaLevel()`, `.createSupplier()`, `.createTag()`, `.createUser()`, `.deactivateUser()`, `._del()`, `.deleteContact()`, `.deleteDocument()`, `.deleteJobcard()`, `.deleteJobNote()`, `.deleteMachine()`, `.deleteQAForm()`, `.deleteQaLevel()`, `.deleteQaTemplate()`, `.deleteSupplier()`, `.deleteTag()`, `.deleteTimeEntry()`, `.deleteUser()`, `.exportBackup()`, `.getActiveTimer()`, `.getActivityHistory()`, `.getContact()`, `.getContacts()`, `.getCosting()`, `.getCustomerPropertyFileData()`, `.getCustomerPropertyFiles()`, `.getDocument()`, `.getDocuments()`, `.getEmployees()`, `.getEntityHistory()`, `.getHardwareStatus()`, `.getInactivityTimeout()`, `.getJobcard()`, `.getJobcardHistory()`, `.getJobcards()`, `.getJobFileData()`, `.getJobFiles()`, `.getJobNotes()`, `.getMachines()`, `.getMe()`, `.getOverdueJobcards()`, `.getPrinters()`, `.getQaFormFileData()`, `.getQaFormFiles()`, `.getQAForms()`, `.getQaLevel()`, `.getQaLevels()`, `.getScannerFiles()`, `.getScanners()`, `.getSettings()`, `.getSupplier()`, `.getSuppliers()`, `.getTagCategories()`, `.getTags()`, `.getTimeEntries()`, `.getUser()`, `.getUserActivity()`, `.getUsers()`, `.importBackup()`, `.login()`, `._patch()`, `._post()`, `._put()`, `.removeAssignee()`, `.request()`, `.scannerToCustomerPropertyFiles()`, `.scannerToJobFiles()`, `.scannerToQaFormFiles()`, `.search()`, `.searchContacts()`, `.setOnSessionInvalidated()`, `.setToken()`, `.startTimer()`, `.stopTimer()`, `.toggleSpecialLabour()`, `.unarchiveJobcard()`, `.updateContact()`, `.updateCosting()`, `.updateJobcard()`, `.updateJobcardStatus()`, `.updateMachine()`, `.updatePreferences()`, `.updateQAForm()`, `.updateQaLevel()`, `.updateSettings()`, `.updateSupplier()`, `.updateTag()`, `.updateTimeEntry()`, `.updateUser()`, `.uploadDocument()`, `.uploadQaTemplate()`, `.uploadToCustomerPropertyFiles()`, `.uploadToJobFiles()`, `.uploadToQaFormFiles()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Hardware Service`** (14 nodes): `hardware.js`, `HardwareService`, `.capturePhoto()`, `.checkElectron()`, `.closeCamera()`, `.constructor()`, `.getAppInfo()`, `.getCameras()`, `.getPrinters()`, `.getScanners()`, `.openCamera()`, `.print()`, `.printToPDF()`, `.scan()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Waves Animation`** (11 nodes): `Waves.jsx`, `Grad`, `.constructor()`, `.dot2()`, `Noise`, `.constructor()`, `.fade()`, `.lerp()`, `.perlin2()`, `.seed()`, `Waves()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `DB Casing Helpers`** (6 nodes): `camelToSnake()`, `convertKeysToCamel()`, `copyDirRecursive()`, `getTableColumns()`, `snakeToCamel()`, `settings.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Suppliers Routes`** (4 nodes): `getSupplierWithTags()`, `normalizeEmpty()`, `toApiFormat()`, `suppliers.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Calendar Picker`** (3 nodes): `CalendarPicker.jsx`, `CalendarPicker()`, `toDateString()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useAuth()` connect `App Shell & Routing` to `Search UI`, `JobCard Modal Core`, `Activity & User Admin`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **Why does `useConfirmDialog()` connect `JobCard Tabs & Forms` to `JobCard Modal Core`, `App Shell & Routing`, `Activity & User Admin`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Are the 10 inferred relationships involving `useAuth()` (e.g. with `PrivateRoute()` and `AdminRoute()`) actually correct?**
  _`useAuth()` has 10 INFERRED edges - model-reasoned connections that need verification._
- **Are the 8 inferred relationships involving `useConfirmDialog()` (e.g. with `ContactManagement()` and `JobCardList()`) actually correct?**
  _`useConfirmDialog()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **Are the 10 inferred relationships involving `JobCardModal()` (e.g. with `useAuth()` and `useJobCardZoom()`) actually correct?**
  _`JobCardModal()` has 10 INFERRED edges - model-reasoned connections that need verification._
- **Should `API Service Layer` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._
- **Should `JobCard Tabs & Forms` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._