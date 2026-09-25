const express = require('express');
const { v4: uuidv4 } = require('uuid');

const logger = require('../utils/logger');
const { authenticate, requireManagement } = require('../middleware/auth');
const {
  validateItemTreatments,
  validateItemMaterials,
  validateItemJobTypes,
  validateItemDrawings,
  validateItemCustomerProperty,
  validateItemDescriptions,
  validateItemQuantities
} = require('../middleware/validation');
const { jobcardQueries, jobItemQueries, timeEntryQueries, recordHistory } = require('../db/database');
const { serializeTreatments, parseTreatments, computeAttachmentWarnings } = require('./jobcard-helpers');
const { itemSummary, describePart } = require('./jobcard-audit-text');
const { syncStatusToWork } = require('../utils/jobStatusAuto');
const { db } = require('../db/connection');

const router = express.Router();

// Instant-save equivalents of the items branch of PUT /jobcards/:id (jobcard-mutations.js) —
// one part at a time, so a screen editing a single line never carries the rest of the job
// along with it. See tasks/instant-save-job-card.md, Stage 1, and
// tasks/instant-save-root-causes.md, Contract C.

// A part's permanent id is its identity; item_number is a sort order the server
// owns. These routes never predict or renumber that sort order — a new part
// always gets one past the highest number this job currently holds (computed
// inside the same transaction as its insert), and deleting a part never
// renumbers the survivors. The position shown on screen is worked out by the
// client from where a part sits in the ordered list it's given.

// Run the same seven item validators the bulk save uses, on a one-element array,
// naming the part in every message by `label` instead of the array's (always-0)
// position — see the `getItemLabel` param the validators take. existingItems
// (raw DB rows) grandfathers values already saved elsewhere on the job past a
// since-archived tag option.
function validateOneItem(item, existingItems, label) {
  // Every validator message below OPENS with this name ("... is missing a quantity"),
  // while the callers also use the same `label` mid-sentence ("Cannot remove ..."), so
  // the capital belongs here rather than in the label itself. A quoted description
  // starts with the quote mark and is left exactly as the user typed it.
  const sentenceLabel = label.charAt(0).toUpperCase() + label.slice(1);
  const getItemLabel = () => sentenceLabel;
  return (
    validateItemDescriptions([item], getItemLabel) ||
    validateItemQuantities([item], getItemLabel) ||
    validateItemJobTypes([item], existingItems, getItemLabel) ||
    validateItemTreatments([item], existingItems, getItemLabel) ||
    validateItemMaterials([item], existingItems, getItemLabel) ||
    validateItemDrawings([item], existingItems, getItemLabel) ||
    validateItemCustomerProperty([item], existingItems, getItemLabel) ||
    null
  );
}

// Raw DB row (snake_case) -> API shape (camelCase), matching the items[] shape
// formatJobcard produces. `position` is the row's 1-based index in the job's
// full ordered part list (item_number ascending) — display-only, stated once
// here by the caller that has that full list to hand, never recomputed by a
// screen and never itself stored or sent back.
function formatItem(row, position) {
  return {
    id: row.id,
    itemNumber: row.item_number,
    position: position != null ? position : null,
    qty: row.qty,
    description: row.description,
    jobType: row.job_type || null,
    material: row.material || null,
    treatments: parseTreatments(row.treatments),
    drawingsType: row.drawings_type || null,
    customerProperty: row.customer_property || null
  };
}

// Format a job's full ordered part list, stamping each row's position from its
// index in this same (item_number-ascending) array.
function formatItems(rows) {
  return rows.map((row, idx) => formatItem(row, idx + 1));
}

// Add one part (management)
router.post('/:id/items', authenticate, requireManagement, (req, res) => {
  try {
    const { id } = req.params;

    const existing = jobcardQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Job card not found' });
    }

    const existingItems = jobItemQueries.getByJobcard.all(id);
    const item = req.body || {};
    const label = describePart(item.description, 'The new part');

    const validationError = validateOneItem(item, existingItems, label);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const itemId = `item:${uuidv4()}`;

    // The new part's number — MAX(item_number) + 1 — is read and acted on inside
    // the same transaction as the insert, so it can never collide with a number
    // another write picks at the same moment, and it never falls for a gap a
    // deleted part left behind (nothing renumbers on delete any more).
    const addItem = db.transaction(() => {
      const { maxNumber } = jobItemQueries.getMaxItemNumber.get(id);
      const itemNumber = (maxNumber || 0) + 1;
      jobItemQueries.create.run(
        itemId, id, itemNumber,
        item.qty || null, item.description,
        item.jobType || null, item.material || null,
        serializeTreatments(item.treatments),
        item.drawingsType || null, item.customerProperty || null
      );
    });
    addItem();

    // A new part changes what completion needs, so recompute the job's status
    // (e.g. a job that read Done can drop back to In Progress) and fold any change
    // into this add's own history entry, the same way the time routes do.
    const statusChange = syncStatusToWork(id, req.user);

    const summary = itemSummary(item.qty, item.description, item.jobType, item.material, item.treatments, item.drawingsType, item.customerProperty);
    recordHistory('jobcard', id, 'update', req.user.userId, req.user.name || req.user.username, {
      [`part ${label} added`]: { from: null, to: summary },
      ...(statusChange ? { status: statusChange } : {})
    });

    const allItems = jobItemQueries.getByJobcard.all(id);
    const items = formatItems(allItems);
    const created = items.find(i => i.id === itemId);
    // A write's reply is the authority on what it changed — file notes are
    // recomputed from the item list this write actually produced, so the screen
    // never has to remember to go fetch them separately.
    const attachmentWarnings = computeAttachmentWarnings(id, items, existing.qa_level_id);
    // Carried on every reply (not only when it changed) so the screen can show the
    // job's current status without a separate re-fetch — see docs/notes/jobs-and-status.md.
    const jobStatus = jobcardQueries.getById.get(id).status;

    res.status(201).json({ ...created, item: created, items, attachmentWarnings, jobStatus });
  } catch (err) {
    logger.error({ err }, 'Add job item error');
    res.status(500).json({ error: 'Could not add the part' });
  }
});

// Change one part (management). Absent field means unchanged — the body is merged
// over the stored row, then the merged result is validated.
router.patch('/:id/items/:itemId', authenticate, requireManagement, (req, res) => {
  try {
    const { id, itemId } = req.params;

    const existing = jobcardQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Job card not found' });
    }

    const existingItems = jobItemQueries.getByJobcard.all(id);
    const stored = existingItems.find(i => i.id === itemId);
    if (!stored) {
      return res.status(404).json({ error: 'Part not found' });
    }

    // Names this part by what it was called before this edit — stable even if
    // the edit itself is what's changing (or emptying) the description.
    const label = describePart(stored.description, 'that part');

    const data = req.body || {};
    const merged = {
      qty: data.qty !== undefined ? data.qty : stored.qty,
      description: data.description !== undefined ? data.description : stored.description,
      jobType: data.jobType !== undefined ? data.jobType : (stored.job_type || null),
      material: data.material !== undefined ? data.material : (stored.material || null),
      treatments: data.treatments !== undefined ? data.treatments : parseTreatments(stored.treatments),
      drawingsType: data.drawingsType !== undefined ? data.drawingsType : (stored.drawings_type || null),
      customerProperty: data.customerProperty !== undefined ? data.customerProperty : (stored.customer_property || null)
    };

    const validationError = validateOneItem(merged, existingItems, label);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    // This route never moves a part — the stored position number is passed straight through.
    jobItemQueries.updateById.run(
      stored.item_number,
      merged.qty || null, merged.description,
      merged.jobType || null, merged.material || null,
      serializeTreatments(merged.treatments),
      merged.drawingsType || null, merged.customerProperty || null,
      itemId
    );

    const beforeSummary = itemSummary(stored.qty, stored.description, stored.job_type, stored.material, stored.treatments, stored.drawings_type, stored.customer_property);
    const afterSummary = itemSummary(merged.qty, merged.description, merged.jobType, merged.material, merged.treatments, merged.drawingsType, merged.customerProperty);

    // A changed quantity (or a line no longer matching what's been made) changes
    // completion, so recompute the job's status and fold any change into this
    // edit's own history entry, the same way the time routes do.
    const statusChange = syncStatusToWork(id, req.user);

    if (beforeSummary !== afterSummary || statusChange) {
      recordHistory('jobcard', id, 'update', req.user.userId, req.user.name || req.user.username, {
        ...(beforeSummary !== afterSummary ? { [`part ${label}`]: { from: beforeSummary, to: afterSummary } } : {}),
        ...(statusChange ? { status: statusChange } : {})
      });
    }

    const allItems = jobItemQueries.getByJobcard.all(id);
    const items = formatItems(allItems);
    const updated = items.find(i => i.id === itemId);
    const attachmentWarnings = computeAttachmentWarnings(id, items, existing.qa_level_id);
    const jobStatus = jobcardQueries.getById.get(id).status;

    res.json({ ...updated, item: updated, items, attachmentWarnings, jobStatus });
  } catch (err) {
    logger.error({ err }, 'Update job item error');
    res.status(500).json({ error: 'Could not update the part' });
  }
});

// Remove one part (management)
router.delete('/:id/items/:itemId', authenticate, requireManagement, (req, res) => {
  try {
    const { id, itemId } = req.params;

    const existing = jobcardQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Job card not found' });
    }

    const existingItems = jobItemQueries.getByJobcard.all(id);
    const stored = existingItems.find(i => i.id === itemId);
    if (!stored) {
      return res.status(404).json({ error: 'Part not found' });
    }

    const label = describePart(stored.description, 'that part');

    // Block removing a line that already has recorded work. `PUT /jobcards/:id`
    // used to carry the same guard for its own bulk item-delete path; that path
    // was stripped in Stage 4b (tasks/instant-save-job-card.md) once nothing sent
    // it any more, so this is now the only place a part's removal is refused.
    if (timeEntryQueries.countByItemId.get(itemId).count > 0) {
      return res.status(400).json({
        error: `Cannot remove ${label} — time is logged against it. Clear that time first.`
      });
    }

    if (existingItems.length <= 1) {
      return res.status(400).json({ error: 'A job must have at least one part.' });
    }

    const summary = itemSummary(stored.qty, stored.description, stored.job_type, stored.material, stored.treatments, stored.drawings_type, stored.customer_property);

    // item_number is a sort order the server owns — nothing renumbers the
    // survivors. Gaps are expected and fine; the number shown on screen is
    // worked out by the client from a part's position in the ordered list it
    // draws, never predicted or recomputed here.
    jobItemQueries.deleteById.run(itemId);

    // Removing a part changes what completion needs (one fewer line to satisfy),
    // so recompute the job's status and fold any change into this delete's own
    // history entry, the same way the time routes do.
    const statusChange = syncStatusToWork(id, req.user);

    recordHistory('jobcard', id, 'update', req.user.userId, req.user.name || req.user.username, {
      [`part ${label} removed`]: { from: summary, to: null },
      ...(statusChange ? { status: statusChange } : {})
    });

    const items = formatItems(jobItemQueries.getByJobcard.all(id));
    const attachmentWarnings = computeAttachmentWarnings(id, items, existing.qa_level_id);
    const jobStatus = jobcardQueries.getById.get(id).status;

    res.json({ success: true, items, attachmentWarnings, jobStatus });
  } catch (err) {
    logger.error({ err }, 'Delete job item error');
    res.status(500).json({ error: 'Could not remove the part' });
  }
});

module.exports = router;
