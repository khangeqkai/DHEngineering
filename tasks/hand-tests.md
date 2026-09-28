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

