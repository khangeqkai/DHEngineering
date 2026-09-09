# Graph Report - DHEngineering  (2026-09-09)

## Corpus Check
- 257 files · ~1,544,963 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1129 nodes · 2234 edges · 86 communities detected
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 85 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 87|Community 87]]
- [[_COMMUNITY_Community 88|Community 88]]

## God Nodes (most connected - your core abstractions)
1. `ApiService` - 104 edges
2. `useAuth()` - 38 edges
3. `formatDate()` - 24 edges
4. `useConfirmDialog()` - 23 edges
5. `toTitleCase()` - 20 edges
6. `capitalizeFirst()` - 20 edges
7. `isManagement()` - 16 edges
8. `pushModal()` - 15 edges
9. `removeModal()` - 15 edges
10. `isTopModal()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `fmtDateShort()` --calls--> `formatDate()`  [INFERRED]
  client/src/components/SearchPage.jsx → /mnt/c/Users/khang/Code/Software/DHEngineering/jobcard-system/client/src/utils/formatters.js
- `JobCardList()` --calls--> `useConfirmDialog()`  [INFERRED]
  client/src/components/JobCardList.jsx → /mnt/c/Users/khang/Code/Software/DHEngineering/jobcard-system/client/src/hooks/useConfirmDialog.js
- `fmtDate()` --calls--> `formatDateTime()`  [INFERRED]
  client/src/components/SearchPage.jsx → /mnt/c/Users/khang/Code/Software/DHEngineering/jobcard-system/client/src/utils/formatters.js
- `UserManagement()` --calls--> `useConfirmDialog()`  [INFERRED]
  client/src/components/UserManagement.jsx → /mnt/c/Users/khang/Code/Software/DHEngineering/jobcard-system/client/src/hooks/useConfirmDialog.js
- `JobCardModal()` --calls--> `useConfirmDialog()`  [INFERRED]
  client/src/components/jobcard/JobCardModal.jsx → /mnt/c/Users/khang/Code/Software/DHEngineering/jobcard-system/client/src/hooks/useConfirmDialog.js

## Communities

### Community 0 - "Community 0"
Cohesion: 0.03
Nodes (60): JobCardList(), penTabWithin(), getJobCardColumns(), JobCardListTable(), Layout(), Login(), Settings(), UserManagement() (+52 more)

### Community 1 - "Community 1"
Cohesion: 0.04
Nodes (3): ApiService, unreachableError(), wait()

### Community 2 - "Community 2"
Cohesion: 0.07
Nodes (30): InlineSupplierForm(), blankCompany(), ContactManagement(), QALevelManagement(), SupplierManagement(), TagManagement(), blankPerson(), CompanyPeople() (+22 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (30): BottomSheet(), CalendarPicker(), toDateString(), ConfirmDialog(), InactivityWarningModal(), isTopModal(), pushModal(), removeModal() (+22 more)

### Community 4 - "Community 4"
Cohesion: 0.09
Nodes (21): EntityActivityLog(), formatAction(), formatChanges(), formatTarget(), getStatusBadgeClass(), isJobOverdue(), mergeColumnOrder(), normalizeHiddenColumns() (+13 more)

### Community 5 - "Community 5"
Cohesion: 0.12
Nodes (17): CreatableTagSelect(), invalidateTagCache(), useTags(), formatElapsed(), LineItemTimerButton(), workBelongsToItem(), CostingBreakdown(), formatDecimalHours() (+9 more)

### Community 6 - "Community 6"
Cohesion: 0.17
Nodes (23): columnsOf(), normalizeStoredTimestamps(), officeTimeZone(), wallClockToIso(), zoneOffsetMs(), endOfDay(), formatActivity(), formatContact() (+15 more)

### Community 7 - "Community 7"
Cohesion: 0.23
Nodes (21): buildJobCardWorkbook(), buildSheet(), durationHrs(), exportActivityLog(), exportContacts(), exportEquipment(), exportJobCardList(), exportJobCardsFull() (+13 more)

### Community 8 - "Community 8"
Cohesion: 0.32
Nodes (21): buildGrandfatheredPairs(), buildGrandfatheredValues(), getSupplierQueries(), getTagQueries(), getTagValues(), handleValidationErrors(), optionalBoolean(), optionalEmail() (+13 more)

### Community 9 - "Community 9"
Cohesion: 0.18
Nodes (14): LabourRatesSettings(), checkInterruptedRestore(), foldGoodPiecesToWhole(), initializeDatabase(), runMigrations(), scheduleDayToWholeHours(), blocksFromGrid(), emptySchedule() (+6 more)

### Community 10 - "Community 10"
Cohesion: 0.33
Nodes (18): buildChanges(), buildJobCardView(), buildQaFillData(), computeAttachmentWarnings(), copyQaTemplatesForJob(), copyTemplatesToJobFolder(), createRelatedRecords(), declaresValue() (+10 more)

### Community 11 - "Community 11"
Cohesion: 0.52
Nodes (17): companyFolderName(), companyPathByName(), createJobCardFolders(), deleteJobCardFolders(), ensureCompanyFolder(), ensureQaLevelFolder(), findCompanyFolder(), findQaLevelFolder() (+9 more)

### Community 12 - "Community 12"
Cohesion: 0.34
Nodes (12): autoAssignWorker(), checkCriticalInspection(), checkEntryDuration(), flagToBool(), isCriticalJob(), isOpenTimerConflict(), normalizeTime(), resolveItemId() (+4 more)

### Community 13 - "Community 13"
Cohesion: 0.28
Nodes (8): buildHelperScript(), buildSetupPage(), plainTrustFileUrl(), secureAddress(), hostWithoutPort(), isVirtualIface(), lanIpv4s(), safeHost()

### Community 14 - "Community 14"
Cohesion: 0.49
Nodes (11): buildStorageFilename(), listCategoryFileNames(), listFolderFiles(), nextQaFormNumber(), partFileCode(), partTagRegex(), resolveCategoryFolder(), resolveFileOwners() (+3 more)

### Community 15 - "Community 15"
Cohesion: 0.56
Nodes (10): buildAltNames(), collectSanHosts(), ensureCertificates(), generateCa(), generateLeaf(), leafSanCoversIps(), leafSanCoversNames(), makeSerial() (+2 more)

### Community 16 - "Community 16"
Cohesion: 0.58
Nodes (9): discardBrowser(), getBrowser(), inElectron(), launchBrowser(), probeBrowser(), renderHtmlToPdf(), renderWithElectron(), renderWithPuppeteer() (+1 more)

### Community 17 - "Community 17"
Cohesion: 0.17
Nodes (5): DataTable(), SkeletonRows(), useTableFilter(), useTableResize(), useTableSort()

### Community 18 - "Community 18"
Cohesion: 0.61
Nodes (8): buildCostingResponse(), computeLiveCosting(), num(), parseHolidays(), parseSchedule(), persistCosting(), readOtSettings(), round2()

### Community 19 - "Community 19"
Cohesion: 0.26
Nodes (3): Grad, Noise, Waves()

### Community 20 - "Community 20"
Cohesion: 0.55
Nodes (7): archiveBackup(), archiveBackupWithRetry(), bestEffortRemove(), copyDirRecursive(), listFilesRecursive(), partitionReadableFiles(), verifyStagedFiles()

### Community 21 - "Community 21"
Cohesion: 0.44
Nodes (6): localParts(), makeFormatter(), offsetSegments(), splitHours(), tierForMoment(), zoneOffsetAt()

### Community 22 - "Community 22"
Cohesion: 0.44
Nodes (9): checkCommand(), checkNativeModules(), checkPdfBrowser(), checkPlatformMatch(), ensureDataDir(), installDependencies(), log(), runChecks() (+1 more)

### Community 23 - "Community 23"
Cohesion: 0.49
Nodes (8): buildClientIfNeeded(), cmdLan(), cmdSeed(), confirm(), findLanIp(), newestMtime(), runSetup(), waitForHealth()

### Community 24 - "Community 24"
Cohesion: 0.27
Nodes (5): calculateDateRange(), getJobFinishDate(), getLocalDateString(), makeDateFormatter(), pad2()

### Community 25 - "Community 25"
Cohesion: 0.42
Nodes (7): caCertPath(), createMenu(), createWindow(), dataDir(), installLocalCertTrust(), startServer(), sweepOldJobCardPrintouts()

### Community 26 - "Community 26"
Cohesion: 0.58
Nodes (5): bumpJobNumber(), getSettings(), peekNextJobNumber(), recordHistory(), updateSettings()

### Community 27 - "Community 27"
Cohesion: 0.57
Nodes (4): buildTreatments(), makeDate(), tagValue(), uid()

### Community 28 - "Community 28"
Cohesion: 0.57
Nodes (5): checkLoginRateLimit(), clearLoginFailures(), cooldownMsForCount(), normalizeEmpty(), recordLoginFailure()

### Community 29 - "Community 29"
Cohesion: 0.61
Nodes (4): assigneeNames(), buildQaTemplateWarning(), itemSummary(), treatmentsToText()

### Community 30 - "Community 30"
Cohesion: 0.61
Nodes (4): camelToSnake(), convertKeysToCamel(), getTableColumns(), snakeToCamel()

### Community 31 - "Community 31"
Cohesion: 0.57
Nodes (3): authenticate(), isManagement(), requireRole()

### Community 32 - "Community 32"
Cohesion: 0.57
Nodes (3): formatLevel(), formatTemplate(), getQaLevelsBasePath()

### Community 33 - "Community 33"
Cohesion: 0.67
Nodes (3): collectOvertimeUpdates(), normalizeSchedule(), validateSchedule()

### Community 34 - "Community 34"
Cohesion: 0.62
Nodes (3): getSupplierWithTags(), normalizeEmpty(), toApiFormat()

### Community 35 - "Community 35"
Cohesion: 0.62
Nodes (3): assertMatchesExtension(), decodeBase64Strict(), matchesSignature()

### Community 36 - "Community 36"
Cohesion: 0.67
Nodes (3): esc(), renderItem(), renderJobCardHtml()

### Community 37 - "Community 37"
Cohesion: 0.67
Nodes (3): fillPdfTemplate(), formatTreatments(), toPdfSafe()

### Community 38 - "Community 38"
Cohesion: 0.67
Nodes (3): appendImage(), appendPdf(), buildPacketPdf()

### Community 39 - "Community 39"
Cohesion: 0.57
Nodes (5): computeProgress(), formatNum(), LineItemProgress(), parseQty(), StatusPill()

### Community 40 - "Community 40"
Cohesion: 0.33
Nodes (2): AuthProvider(), useInactivityTimer()

### Community 41 - "Community 41"
Cohesion: 0.47
Nodes (2): normalizeEmpty(), toApiFormat()

### Community 42 - "Community 42"
Cohesion: 0.53
Nodes (2): normalizeEmpty(), readFlag()

### Community 43 - "Community 43"
Cohesion: 0.53
Nodes (2): normalizeEmpty(), toResponseFormat()

### Community 44 - "Community 44"
Cohesion: 0.53
Nodes (2): formatTag(), nameToValue()

### Community 45 - "Community 45"
Cohesion: 0.6
Nodes (2): isJobComplete(), syncStatusToWork()

### Community 46 - "Community 46"
Cohesion: 0.53
Nodes (2): getPdfEngineStatus(), verifyPdfEngine()

### Community 48 - "Community 48"
Cohesion: 0.6
Nodes (2): start(), startRedirectListener()

### Community 49 - "Community 49"
Cohesion: 0.4
Nodes (1): seedHistory()

### Community 50 - "Community 50"
Cohesion: 0.4
Nodes (1): buildScenarios()

### Community 51 - "Community 51"
Cohesion: 0.4
Nodes (1): getOrCreateJwtSecret()

### Community 52 - "Community 52"
Cohesion: 0.4
Nodes (1): nameToValue()

### Community 53 - "Community 53"
Cohesion: 0.4
Nodes (1): getAssigneesForJobcards()

### Community 54 - "Community 54"
Cohesion: 0.6
Nodes (2): maintenanceGuard(), setMaintenance()

### Community 55 - "Community 55"
Cohesion: 0.4
Nodes (1): auditValue()

### Community 56 - "Community 56"
Cohesion: 0.4
Nodes (1): requestLogger()

### Community 57 - "Community 57"
Cohesion: 0.4
Nodes (1): startMdnsResponder()

### Community 58 - "Community 58"
Cohesion: 0.83
Nodes (2): isActive(), LineItemSupplierPicker()

### Community 59 - "Community 59"
Cohesion: 0.83
Nodes (2): formatNum(), ScrapStat()

### Community 60 - "Community 60"
Cohesion: 0.67
Nodes (2): splitCustomersInBackup(), splitCustomersIntoCompanies()

### Community 61 - "Community 61"
Cohesion: 0.67
Nodes (2): toCompanyApi(), toContactApi()

### Community 63 - "Community 63"
Cohesion: 0.67
Nodes (2): discardIfAccidentalTap(), undoStartEffects()

### Community 64 - "Community 64"
Cohesion: 0.67
Nodes (1): resolveElectronVersion()

### Community 65 - "Community 65"
Cohesion: 0.67
Nodes (1): JobCardColumnsMenu()

### Community 66 - "Community 66"
Cohesion: 0.67
Nodes (1): JobCardListFilters()

### Community 67 - "Community 67"
Cohesion: 0.67
Nodes (1): JobCardListPagination()

### Community 68 - "Community 68"
Cohesion: 0.67
Nodes (1): CheckboxDropdown()

### Community 69 - "Community 69"
Cohesion: 0.67
Nodes (1): ClickSpark()

### Community 70 - "Community 70"
Cohesion: 0.67
Nodes (1): EmptyState()

### Community 71 - "Community 71"
Cohesion: 0.67
Nodes (1): ExportButton()

### Community 72 - "Community 72"
Cohesion: 0.67
Nodes (1): GradientText()

### Community 73 - "Community 73"
Cohesion: 0.67
Nodes (1): PageHeader()

### Community 74 - "Community 74"
Cohesion: 0.67
Nodes (1): ShinyText()

### Community 75 - "Community 75"
Cohesion: 0.67
Nodes (1): ToggleTiles()

### Community 76 - "Community 76"
Cohesion: 0.67
Nodes (1): HubCameraView()

### Community 77 - "Community 77"
Cohesion: 0.67
Nodes (1): DetailsReadOnlyView()

### Community 78 - "Community 78"
Cohesion: 0.67
Nodes (1): LineItemTagSelect()

### Community 79 - "Community 79"
Cohesion: 0.67
Nodes (1): DataBackupCard()

### Community 80 - "Community 80"
Cohesion: 0.67
Nodes (1): FoldersCard()

### Community 81 - "Community 81"
Cohesion: 0.67
Nodes (1): SecurityCard()

### Community 82 - "Community 82"
Cohesion: 0.67
Nodes (1): DefaultRateCard()

### Community 83 - "Community 83"
Cohesion: 0.67
Nodes (1): MultiplierInputs()

### Community 84 - "Community 84"
Cohesion: 0.67
Nodes (1): TimezoneCard()

### Community 86 - "Community 86"
Cohesion: 0.67
Nodes (1): addMissingColumns()

### Community 87 - "Community 87"
Cohesion: 0.67
Nodes (1): getLatestNotesForJobcards()

### Community 88 - "Community 88"
Cohesion: 0.67
Nodes (1): normalizeEmpty()

## Knowledge Gaps
- **Thin community `Community 40`** (7 nodes): `AuthContext.jsx`, `useInactivityTimer.js`, `main.jsx`, `AuthProvider()`, `useInactivityTimer()`, `useInactivityTimer.js`, `main.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (6 nodes): `contacts.js`, `contacts.js`, `contacts.js`, `normalizeEmpty()`, `toApiFormat()`, `contacts.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (6 nodes): `jobcard-time-entries.js`, `jobcard-time-entries.js`, `jobcard-time-entries.js`, `normalizeEmpty()`, `readFlag()`, `jobcard-time-entries.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (6 nodes): `machines.js`, `machines.js`, `machines.js`, `normalizeEmpty()`, `toResponseFormat()`, `machines.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (6 nodes): `tags.js`, `tags.js`, `tags.js`, `formatTag()`, `nameToValue()`, `tags.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (6 nodes): `jobStatusAuto.js`, `jobStatusAuto.js`, `jobStatusAuto.js`, `jobStatusAuto.js`, `isJobComplete()`, `syncStatusToWork()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (6 nodes): `pdfEngine.js`, `pdfEngine.js`, `pdfEngine.js`, `pdfEngine.js`, `getPdfEngineStatus()`, `verifyPdfEngine()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (5 nodes): `index.js`, `index.js`, `index.js`, `start()`, `startRedirectListener()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (5 nodes): `seed-history.js`, `seed-history.js`, `seed-history.js`, `seedHistory()`, `seed-history.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (5 nodes): `seed-scenarios.js`, `seed-scenarios.js`, `seed-scenarios.js`, `buildScenarios()`, `seed-scenarios.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (5 nodes): `config.js`, `config.js`, `config.js`, `config.js`, `getOrCreateJwtSecret()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (5 nodes): `seed-tags.js`, `nameToValue()`, `seed-tags.js`, `seed-tags.js`, `seed-tags.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (5 nodes): `jobcard.js`, `jobcard.js`, `jobcard.js`, `getAssigneesForJobcards()`, `jobcard.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (5 nodes): `maintenance.js`, `maintenanceGuard()`, `setMaintenance()`, `maintenance.js`, `maintenance.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (5 nodes): `jobcard-costing.js`, `jobcard-costing.js`, `jobcard-costing.js`, `auditValue()`, `jobcard-costing.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (5 nodes): `logger.js`, `logger.js`, `logger.js`, `logger.js`, `requestLogger()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (5 nodes): `mdnsResponder.js`, `mdnsResponder.js`, `mdnsResponder.js`, `mdnsResponder.js`, `startMdnsResponder()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (4 nodes): `LineItemSupplierPicker.jsx`, `LineItemSupplierPicker.jsx`, `isActive()`, `LineItemSupplierPicker()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 59`** (4 nodes): `ScrapStat.jsx`, `ScrapStat.jsx`, `formatNum()`, `ScrapStat()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 60`** (4 nodes): `splitCustomersInBackup()`, `splitCustomersIntoCompanies()`, `splitCustomers.js`, `splitCustomers.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 61`** (4 nodes): `customer-format.js`, `toCompanyApi()`, `toContactApi()`, `customer-format.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 63`** (4 nodes): `startTimerUndo.js`, `discardIfAccidentalTap()`, `rememberStartEffects()`, `undoStartEffects()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 64`** (3 nodes): `rebuild-native.js`, `rebuild-native.js`, `resolveElectronVersion()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 65`** (3 nodes): `JobCardColumnsMenu.jsx`, `JobCardColumnsMenu()`, `JobCardColumnsMenu.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 66`** (3 nodes): `JobCardListFilters.jsx`, `JobCardListFilters()`, `JobCardListFilters.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 67`** (3 nodes): `JobCardListPagination.jsx`, `JobCardListPagination()`, `JobCardListPagination.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 68`** (3 nodes): `CheckboxDropdown.jsx`, `CheckboxDropdown()`, `CheckboxDropdown.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 69`** (3 nodes): `ClickSpark.jsx`, `ClickSpark()`, `ClickSpark.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 70`** (3 nodes): `EmptyState.jsx`, `EmptyState()`, `EmptyState.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 71`** (3 nodes): `ExportButton.jsx`, `ExportButton()`, `ExportButton.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 72`** (3 nodes): `GradientText.jsx`, `GradientText()`, `GradientText.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 73`** (3 nodes): `PageHeader.jsx`, `PageHeader()`, `PageHeader.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 74`** (3 nodes): `ShinyText.jsx`, `ShinyText()`, `ShinyText.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 75`** (3 nodes): `ToggleTiles.jsx`, `ToggleTiles()`, `ToggleTiles.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 76`** (3 nodes): `HubCameraView.jsx`, `HubCameraView()`, `HubCameraView.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 77`** (3 nodes): `DetailsReadOnlyView.jsx`, `DetailsReadOnlyView.jsx`, `DetailsReadOnlyView()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 78`** (3 nodes): `LineItemTagSelect.jsx`, `LineItemTagSelect.jsx`, `LineItemTagSelect()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 79`** (3 nodes): `DataBackupCard.jsx`, `DataBackupCard.jsx`, `DataBackupCard()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 80`** (3 nodes): `FoldersCard.jsx`, `FoldersCard.jsx`, `FoldersCard()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 81`** (3 nodes): `SecurityCard.jsx`, `SecurityCard.jsx`, `SecurityCard()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 82`** (3 nodes): `DefaultRateCard.jsx`, `DefaultRateCard()`, `DefaultRateCard.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 83`** (3 nodes): `MultiplierInputs.jsx`, `MultiplierInputs()`, `MultiplierInputs.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 84`** (3 nodes): `TimezoneCard.jsx`, `TimezoneCard()`, `TimezoneCard.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 86`** (3 nodes): `addMissingColumns()`, `columnMigrations.js`, `columnMigrations.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 87`** (3 nodes): `operations.js`, `getLatestNotesForJobcards()`, `operations.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 88`** (3 nodes): `companies.js`, `normalizeEmpty()`, `companies.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useAuth()` connect `Community 0` to `Community 40`, `Community 3`, `Community 4`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **Are the 15 inferred relationships involving `useAuth()` (e.g. with `PrivateRoute()` and `AdminRoute()`) actually correct?**
  _`useAuth()` has 15 INFERRED edges - model-reasoned connections that need verification._
- **Are the 4 inferred relationships involving `formatDate()` (e.g. with `fmtDateShort()` and `JobIdentityStrip()`) actually correct?**
  _`formatDate()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Are the 7 inferred relationships involving `useConfirmDialog()` (e.g. with `ContactManagement()` and `JobCardList()`) actually correct?**
  _`useConfirmDialog()` has 7 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._