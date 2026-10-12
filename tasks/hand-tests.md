# Test these by hand

Nothing in the app has automatic tests, so each line is one click-through on a real PC. **Delete a line once it has been tested and works**; if it fails, leave it and note what happened. Every bug hunt appends its own lines here.
Nothing here has an automatic test, so click through these once on a real PC. Each line is a screen the hunt changed.

**Pricing (admin)**
1. Change a price, pull the network cable, close the job → you're warned the price isn't saved.
2. Two admins open the same job; each changes a different price → both prices stick.
3. Invoice a job, reopen it → Costing is locked but "What this job used" still opens.

**Job screen**
4. Add three parts, remove the first → the rest renumber 1, 2.
5. Tick then untick Repeat Job → the previous-job number is gone from the printout.
6. Type an existing customer's exact name without clicking the suggestion → it uses that customer.
7. Press Create with empty boxes → the boxes are marked, no pop-up list.
8. Invoice a job from its own screen → it locks straight away.

**Timers and logged work**
9. Stop a timer, save 12 pieces, then edit only the finish time → it saves.
10. Add work by hand with no part, or a finish time tomorrow → refused.
11. As a manager, stop a worker's timer, then sign out without filling the form → the worker's timer stays stopped.

**Suppliers, customers, equipment**
12. Link a service to a supplier from a job, then edit that supplier's phone on the Suppliers page → the service stays.
13. Edit a machine's name → its description is kept.

**Sign-in and security**
14. Enter a wrong current PIN on Change PIN five times → you're slowed down.
15. As a worker: prices, customer phone/email and the activity log stay hidden.

**Files and printing**
16. Reprint an invoiced job's job card and packet → works.
17. Disconnect the job-folders drive, open a job → "location can't be reached", not "missing files".

**Backup**
18. Export a backup to a folder outside the job folders, then restore it → works, older backups untouched.
19. Try saving a backup inside the job folders → refused with a message.

**Statistics**
20. Pick "Last 6 Months" → six rows, quiet months as zero; "All Time" loads in about a second.

**Installed app**
21. Build the installer on a PC with no review-tool key; install on a fresh PC with no internet → starts, sign in admin / 1234.
22. Run the PIN-reset command on the installed PC → it finds the app's real database.

**Added after the hunt**
23. Restart the workshop PC and sign in to Windows → the app starts by itself into the tray; another PC can connect without anyone opening it.
24. Close the app window → it hides to the tray; right-click the tray icon → Quit → confirm → it really stops.
25. Open an old job that had quality forms → Files shows only Job Files and Customer Property, and the old forms are in Job Files.
26. Quality Levels page → only add / rename / delete; no upload button. A Critical job's stop-timer form still asks the 4 inspection questions.

**Added by the second hunt (rounds 11–13)**
27. Open a Standard job, stop a timer and leave the form open; on another PC switch the job to Critical; press Save → the four inspection questions appear and the empty ones are marked.
28. Change a job's quality level → its activity shows "Standard → Critical", not capital codes.
29. On a Critical job, stop a timer and close the form without saving → the run shows "Sign-off missing"; mark the job Invoiced → a question lists that run; Go back stops, Invoice anyway invoices it.
30. Log work on a Standard job, then switch it to Critical and edit that work → it saves without inspection questions.
31. Two admins on Users: one demotes someone, the other (page opened earlier) changes only their email → the demotion stays.
32. New supplier → "+ Other" → type → Escape → only the small box closes.
33. Tags & Equipment: restore an option, switch tab straight away → the list matches the tab you're on.
34. Stop a timer and leave the form open; a manager corrects that run's part or pieces elsewhere; press Resume → the correction stays.
35. After a restore of an old backup, open an old Critical job → runs finished while it was Critical show "Sign-off missing" if unanswered; earlier Standard runs don't.


**Added by the third hunt (rounds 14–15)**
36. Stop a timer and leave the form open; a manager gives that run to another worker on another PC; press Save → the form closes with a message instead of refusing forever.
37. As a worker, save a stop form; that run's card stays read-only and can't be changed again (a manager still can).
38. Add Time with tomorrow as the start → the Start box is marked, no pop-up.
39. On a Critical job, delete a run that had sign-off answers → the activity entry lists those answers.
40. New job → type an archived customer's exact name → the screen says it is archived; no "Add it?" question, and the Company box is marked.
41. Unplug or rename the job-folders drive, open a job with drawing-required parts → parts say "Files not checked", not a green "Attached".
42. Start a New supplier on a part, type a name, then close the job or switch tab → you're asked first.
43. Open New supplier on two parts; click a label in the second → the cursor lands in the second form.
44. Rename a supplier on PC B; on PC A change that supplier's part → the part stops showing unsaved after it saves.
45. Add a new part and keep typing in it straight away → nothing jumps back under the cursor.
46. PC B unticks Repeat Job; PC A (still ticked) types a previous-job reference and leaves the box → the box is marked "no longer a repeat job", not "Saved".

**Added by the fourth hunt (rounds 16–18)**
47. Job list: change a job's status from its badge → Last Edited says "just now" straight away.
48. Search > Jobs → pick only the Invoiced chip → invoiced jobs appear, not "No results".
49. Job list → Show Archived before anything is invoiced → "No archived jobs", no create button; filter to a worker with no jobs → "No results".
50. Columns menu: move a column, then Reset to default → the original order comes back, hidden columns too.
51. Sign in as a worker → Search > Time has no Worker filter.
52. Search with two pages of jobs → go to page 2 → open its only job and invoice it → you land back on page 1.
53. Job list search: type a job number with a space before it → the job is still found.
54. Pricing sheet: in an Hours box that follows logged work, retype the same figure and leave → then log more work → the new hours are billed.
55. Pricing sheet: 1.5 hours at $50.05 → the line says $75.08.
56. Set an overtime multiplier of 1.125 → the sheet shows 1.125, not 1.13.
57. Stop the server, open Labour Rates (or Settings) → "Couldn't load" with Try again, no blank boxes to save.
58. Rename the job-folders folder (drive still there), then save a job → no empty replacement folder appears; files say not checked.
59. With no job-folders location set, print a job card with drawing-required parts → "Files not checked", not red "Missing".
60. On a part, press Attach and pick a too-large file → then pick a good one → it lands on that part.
61. Add a locked (secured) supplier PDF to a job and build the packet → the packet leaves it out and names it.
62. Open an Excel export in Excel, export again over the same file → a plain "file is open" message.
63. Upload a file whose name was changed on saving (a duplicate) → the activity shows the name it was kept under.
64. Export job cards to Excel → the Type column no longer shows "JOB_CARD" on every row.

**Added by the fifth hunt (rounds 19–21)**
65. Web mode: sign in, land on the job list, press the browser's Back → you stay in the app (no sign-in form); typing the sign-in address while signed in also lands in the app.
66. Start a worker's timer, then as a manager archive that worker → refused with a message naming the job and part; stop the timer → archiving now works.
67. Settings → Change PIN with a wrong current PIN → the Current PIN box is marked "Your current PIN is not right", no pop-up; a right one says "PIN updated".
68. Users → add a user with no PIN → the PIN box says "PIN is required".
69. Add a user with an email, a customer with an address, a person with a phone, a supplier with services → each one's Activity entry lists those details.
70. Unplug the job-folders drive (or clear the location), export a backup → a warning says the backup holds only the records, not the job files.
71. Export a backup, then export again to the same file and pull the drive / cancel midway → the first backup is still there and opens.
72. Rename the job-folders folder away, then restore a backup → the files come back in place; with a file from the job folders open, restore → plain "in use, close them and try again", nothing changed.
73. Leave a folder named like "<job folders>__restore_old" beside the job folders, then restore → refused, naming that folder; nothing is deleted.
74. Restore a random or half-copied .zip → "This file is not a readable backup… Nothing was changed."
75. Edit a backup's database.json so its _metadata dataVersion is 99, zip it back, restore → "made by a newer version of the app — update this computer first".
76. Statistics: a job with no logged work, set to Cust. Notified last month and invoiced this month → it counts as finished last month, on time if it was due then.
77. Equipment: log work on a machine with a backdated start, then try to renumber the machine → refused.
78. Customers → open a customer → Add Person → type, press Escape → only the person box closes; the customer window stays with what was typed.
79. Users → PIN of 3 digits → "PIN must be exactly 4 digits".
80. Add a supplier, person or machine with the name box blank → its Activity entry has no "(empty) → (empty)" line.
81. Statistics → set a bad custom range (end before start), switch Trend to Yearly → the monthly rows keep their monthly titles.

## Hunt 6 — a clock left running stops itself (rounds 22)
82. Start a clock, leave it past the end of normal hours while signed in → "Your clock stopped by itself" appears with one time box pre-filled with the stop time.
83. In that box enter a time later than the stop (but not in the future) → accepted. Enter a time earlier than the stop → accepted, hours shrink. Enter a time before the start → the box is marked.
84. Answer "Yes, start my clock again" with that job open → the job screen shows the clock running on the part and the work list is up to date.
85. Answer "No, I'm done with it" → the pieces form opens with no X, only Save and Sign out. Escape and clicking outside do nothing.
86. On that form press Sign out, sign back in → the form is back; the finish time and hours are unchanged. Save it → it does not come back, the pop-up job closes itself and the job list shows the new status.
87. Answer the question about an old clock, then try to invoice that job within 30 minutes → refused.
88. Press Stop just after the clock stopped itself → straight to the question, no error, no stuck running clock.
89. As a manager, press Stop on a worker's clock that already stopped itself → a message says it already stopped and names the worker who must confirm.
90. As a manager, clear the End Time of an old block → it runs and is not stopped automatically; stop it, resume it from the pieces form, leave it past hours end → it stops itself.
91. With a worker's question unanswered, as a manager add an open block for that worker → refused, naming the worker.
92. Hours set to normal 07–12, overtime 12–13, normal 13–17: a clock stopped at 12:00, answer 16:30 → accepted.
93. Stop a clock at 16:55, after hours end press the X on the pieces form → "Normal hours have ended… Save the form instead"; the form stays.
94. Invoice a job, then have a clock on it stop itself (or answer for one that did) → the worker can answer; no pieces form follows.
95. Let a clock stop itself on a part, remove that part, answer "Yes, start my clock again" → refused, nothing saved.
96. As a manager open the edit form on a worker's auto-stopped block, have the worker answer with a different finish, then save the manager's form without touching the times → the worker's finish stays.
97. While a worker's question is showing, have a manager delete that block → the worker's question goes away instead of being stuck.
98. Press Stop, leave the pieces form unfilled, let the app sign you out (or close the window), sign in again → the pieces form comes back with only Save and Sign out.
99. Answer "Yes, start my clock again", then stop the new clock within a few seconds → it is kept and the normal pieces form opens (with the sign-off on a Critical job).
100. First start after updating: sign in as a worker who abandoned pieces forms weeks ago → none of those old forms appear.
