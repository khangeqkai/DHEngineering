# Project Review — Improvements List

A plain-language review of problems found in the job card system, with the fix and
a before/after for each. Every point below was double-checked against the actual
code by a separate verification pass — none were false alarms.

**Fix order:** Items 1–6 are the only ones that can actually destroy real records,
so they should be the first batch.

---

## Data-loss problems (fix these first)

### 1. Editing a job's line items can wipe them out — ✅ RESOLVED
- **Problem:** When you save changes to a job's line items, the system throws away all the existing items first, then re-adds them one by one. If it trips on any single item, the rest never get added — and the originals are already gone for good.
- **Solution:** Treat the whole save as one all-or-nothing action: either every item saves, or nothing changes and the original list stays intact.
- **Before:** A bad value halfway through saving leaves the job with some items missing, or none at all, with no way back.
- **After:** A bad value cancels the whole save cleanly; the job keeps exactly the items it had, and the user is told the save didn't go through.
- **Status:** Fixed and verified hands-on — a save now succeeds completely or changes nothing at all, so a failed save can no longer cost you data. Bonus: picking an invalid quality level now stops the save before anything is written. (Confirmed live: with a failure forced in, all line items survived untouched.)

### 2. Deleting a worker erases their logged hours — ✅ RESOLVED
- **Problem:** When you permanently remove a worker, the system tidies up most of their footprint but forgets their time logs. Those logs are left pointing at a person who no longer exists, and the way time is displayed then hides them entirely — including from the cost totals.
- **Solution:** Remove the permanent-delete option for workers entirely. A worker can now only be archived (deactivated) or brought back (activated). An archived worker can't log in and drops out of the assign-a-worker picker, but their record stays, so every hour they logged stays visible and counted. With no way to erase a worker, their hours can never become orphaned.
- **Before:** Delete a worker and real hours they logged quietly disappear from the job and from the costs.
- **After:** A worker can only be archived, never erased, so their hours always stay visible and counted — no silent gaps possible.
- **Status:** Fixed. The "Delete" button on the worker list is gone; only Archive (Deactivate) and Restore (Activate) remain. The archive/restore features and the worker list (which already shows archived workers so they can be restored) were left untouched.

### 3. Renaming a quality level strands its forms — ✅ RESOLVED
- **Problem:** A quality level's forms are kept in a folder named after that level. Renaming the level changes the name in the records but never renames the folder, so the old forms get left behind under the old name and the level looks empty.
- **Solution:** Stop tying the forms folder to the changeable name. Each level's folder now carries a hidden marker holding the level's permanent ID, and the system always finds a level's forms by that marker — never by the name. Renaming still tidies up the folder's name to match, but that's now just cosmetic: even if the folder kept its old name, the forms would still be found, so they can never be stranded.
- **Before:** Rename a level and its forms go missing; new jobs using that level come up with no forms and only a soft warning.
- **After:** Rename a level and its forms follow along; jobs keep getting the right forms, no matter how many times the level is renamed.
- **Status:** Fixed. The name stays fully editable because renaming is now safe. Two levels whose names would collapse to the same folder are kept apart automatically, and the hidden marker is never copied into a job's forms.

### 4. A failed job creation still uses up the number and leaves a half-made job
- **Problem:** When you create a job, its number is claimed and the job saved *before* its quality forms are copied. If that last step fails, the user sees an error as if nothing happened — but the job number is gone forever and a stray, half-finished job is left behind.
- **Solution:** Don't commit the job until the whole creation finishes. If the form copy fails, undo the job and release the number, or treat the form copy as a non-blocking step that can be retried without failing the whole creation.
- **Before:** A failure at the final step shows "couldn't create," yet a phantom job and a wasted number are left behind.
- **After:** A failure means truly nothing was created — no phantom job, no skipped number — and a success means everything is in place.

### 5. Hand-entered time logs aren't sanity-checked
- **Problem:** When an admin types in or edits a time log by hand, nothing checks that the finish time comes after the start time, or that the times are even real. A backwards or garbled entry turns into negative or nonsense hours that flow straight into the job's costs.
- **Solution:** Check hand-entered times before saving — the finish must be after the start, and both must be valid — and refuse the entry with a clear message if not.
- **Before:** An admin can save a finish-before-start time, quietly poisoning the cost totals.
- **After:** A bad time is rejected on the spot with a plain reason, so costs stay trustworthy. (The normal Start/Stop timer was already safe.)

### 6. Deleting a supplier leaves jobs pointing at a supplier that's gone
- **Problem:** Each treatment on a job remembers which supplier handles it, but only as loose text with no real link. Deleting that supplier doesn't touch those jobs, so they keep showing a supplier that no longer exists, with nothing to flag or fix it.
- **Solution:** Before deleting a supplier, check whether any jobs still use it. Either block the delete and tell the admin which jobs to update first, or clear those references as part of the delete.
- **Before:** Delete a supplier and affected jobs silently keep naming a supplier that's gone.
- **After:** The admin is warned which jobs still depend on the supplier, so nothing is left dangling.

---

## Behaviour fixes (decided during review)

### 7. Workers can see supplier phone numbers and emails
- **Problem:** Customer phone and email are hidden from workers, but supplier phone and email are not — any worker can read them.
- **Solution:** Hide supplier contact details from workers too, the same way customer details are hidden, so the two are treated alike.
- **Before:** A worker opens supplier info and sees phone and email they shouldn't.
- **After:** A worker sees the supplier's name and services but not the private contact details — admins still see everything.

### 8. There's no plain "upload a file" option
- **Problem:** The Files menu only offers Scanner and Camera. There's no way to pick an existing file from the computer, even though the system is capable of accepting one.
- **Solution:** Add an "upload a file" choice to the Files menu, next to Scanner and Camera.
- **Before:** To attach a file you already have, there's no path — only scan or photograph.
- **After:** You can choose a file from the computer and attach it straight to the job.

### 9. The stop-timer button gives no reason when it's greyed out
- **Problem:** When a worker stops their timer, Submit stays disabled unless they pick a machine or type a description. (This requirement is intended.) The trouble is there's no explanation — a worker who only filled in the quantity is left staring at a dead button.
- **Solution:** Keep the requirement, but show a short line saying what's still needed (e.g. "add a machine or a description to finish").
- **Before:** The button is greyed out with no hint, and the worker feels stuck.
- **After:** The button is still greyed out until the requirement is met, but now the worker is told exactly what to add.

---

## Polish

### 10. The main edit pop-up lets the keyboard wander behind it
- **Problem:** The main pop-up for editing jobs, people, suppliers and quality levels doesn't grab the keyboard when it opens, and pressing Tab can walk onto the hidden page behind it. The smaller dialogs already do this correctly.
- **Solution:** Make the pop-up focus itself on open and keep Tab cycling inside it, matching the smaller dialogs.
- **Before:** Tabbing through a form can drift onto the page underneath, which is disorienting and bad for keyboard/accessibility use.
- **After:** Focus stays inside the pop-up until it's closed.

### 11. Comment-loading failures look like "no comments"
- **Problem:** If a job's team comments fail to load, the area just says "no comments yet," so the user assumes there are none when there may be several. Adding and deleting comments already show errors — only loading stays silent.
- **Solution:** Show an error when comments fail to load, like the other comment actions already do.
- **Before:** A loading hiccup quietly hides real comments.
- **After:** The user sees "couldn't load comments" and knows to retry instead of assuming it's empty.

### 12. The camera leaves a dead black box on failure
- **Problem:** If the camera is denied, missing, or already in use, the only feedback is a brief message. The camera panel stays open showing an empty black area and a dead Capture button, with no in-panel explanation.
- **Solution:** Show a clear message inside the camera panel when it can't open, with a way to back out.
- **Before:** The worker is left in a non-working camera view with no guidance.
- **After:** The panel itself says the camera couldn't start and offers a way out.

### 13. Two separate screens show the same files
- **Problem:** The Files button in the header and the Files tab are two independent builds that both list and preview the same job files, with duplicated logic that can drift apart over time.
- **Solution:** Have both share one underlying file-viewing piece so they always behave the same.
- **Before:** The two file views can quietly diverge — a fix or feature in one might not appear in the other.
- **After:** Both entry points behave identically because they share the same engine.

### 14. Delete buttons double-fire, and errors stack up
- **Problem:** Two small things. First, delete buttons in the people, supplier and worker lists stay clickable after you confirm, so an impatient double-click can fire the delete twice. Second, when a job form has several invalid fields, the user gets a burst of separate error pop-ups instead of one.
- **Solution:** Lock a delete button once it's been clicked until it finishes, and combine multiple form errors into a single message.
- **Before:** A double-click can trigger two deletes; several bad fields throw a stack of pop-ups.
- **After:** A delete fires once; all the problems with a form show up together in one clear message.
