# Hunt 4 — job list, pricing, files (rounds 16–18)

Hunt 4 started 2026-09-28 at commit 286f86a — 3 rounds (16–18), single-user situations only.

### Round 16 — job list, search, activity
- Changing status from the list badge now updates Last Edited straight away.
- Search > Jobs: the Invoiced chip finds invoiced jobs (they are always archived).
- Job list empty screen says "No archived jobs" / "No results" / "Couldn't load" instead of "No job cards yet".
- Columns menu Reset also puts the column order back.
- Search > Time: workers no longer see a Worker filter that can only return nothing.
- Search results step back to the last real page when a job drops out.
- Job list search ignores spaces around the text.

### Round 17 — pricing sheet, new job, invoicing
- Retyping the figure already shown in an Hours or multiplier box no longer pins it as hand-typed (later logged work kept being left off).
- Labour Rates and Settings pages show "Couldn't load — Try again" after a failed load instead of blank boxes that Save would write over the real settings.
- Money on exactly half a cent rounds up (1.5 h at $50.05 = $75.08, was $75.07).
- Search > Activity Field Changed lists the missing recorded names (normal hours/total, multipliers, cost notes, skipped sign-off, printing).
- Overtime multipliers show the exact figure charged (1.125, not 1.13).

### Round 18 — files, folders, printing, Excel
- A missing job-folders location is no longer quietly rebuilt as an empty folder by job or customer saves.
- With no job-folders location set, the printed card says "Files not checked" instead of red "Missing".
- A failed upload from a part's Attach button keeps the part target, so the retry goes to the part.
- Locked (secured) PDFs are left out of the packet and named, instead of printing blank.
- Saving an export or packet over a file open elsewhere gives a plain message, not a raw system error.
- "Left out of the packet" names files as people see them, not with the internal code.
- Upload trail records the name the file was actually kept under.
- Browser print that falls back to a download is recorded as a save.
- Search > Activity Field Changed can find old "packet built" entries.
- Excel export's Type column no longer shows the stored code on every row.

| # | Area | Found | Confirmed | Fixed | Sent to owner |
|---|---|---|---|---|---|
| 16 | Job list, search, activity | 15 | 7 | 7 | 0 |
| 17 | Pricing sheet, new job, invoicing | 5 | 5 | 5 | 0 |
| 18 | Files, folders, printing, Excel | 18 | 10 | 10 | 0 |
