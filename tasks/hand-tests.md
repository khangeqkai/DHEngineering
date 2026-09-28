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
