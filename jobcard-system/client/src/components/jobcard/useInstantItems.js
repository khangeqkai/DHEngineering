import { useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../services/api';
import { buildItemPayload, mapLineItemFromApi } from './mappers';
import { isSavedLineItem } from './jobCardValidation.mjs';
import { itemFieldMessage, REQUIRED_ITEM_FIELDS, isItemRowComplete } from './fieldRules.mjs';
import { useFieldErrors } from '../../hooks/useFieldErrors';
import { NOT_LANDED } from './useSaveQueue';

// Noun used in the save queue's label for a field write on a real row — e.g.
// "part 2's description" — so a queued/failed entry reads the same way the close
// question already names a required-box mark (closeReasons.js's ITEM_FIELD_NAME).
const ITEM_FIELD_NOUN = {
  description: 'description',
  qty: 'quantity',
  jobType: 'job type',
  drawingsType: 'drawings',
  customerProperty: 'customer property',
  material: 'material',
  treatments: 'treatment'
};

// '|' rather than ':' — a persisted row's own id is already "item:<uuid>", so a
// ':' join would make the two halves ambiguous to split back apart. Exported so
// closeReasons.js (the close question's "which part, which box" builder) and the
// field elements' own `id` attributes (for scrollFieldIntoView's "Fix it") can
// both agree on the same key without a second copy of this format.
export const fieldErrorKey = (itemId, field) => `${itemId}|${field}`;

/**
 * Instant save for the parts list on an existing job — the stage-4a companion to
 * useInstantSave.js (details fields) and toggleAssignee (people). A row added by
 * clicking "Add Part" (makeEmptyLineItem, useJobCardForm.js) stays purely local —
 * its fields just edit on-screen state, nothing is sent — until every field the
 * server requires (REQUIRED_ITEM_FIELDS / isItemRowComplete, from fieldRules.mjs)
 * is filled in, whichever one that turns out to be. That is the one moment it
 * becomes real: the whole row as it stands is sent to create it, and its
 * placeholder id is swapped for the stored one. From there, every further edit on
 * that row writes itself: dropdowns/tags/toggles on change, text/number boxes on
 * blur.
 *
 * Every write routes through the shared save queue (useSaveQueue.js, Contract A)
 * instead of a hand-rolled chains ref — under one key per row, `item:<rowId>`,
 * covering every field write, the row's one-time create AND its removal alike
 * (root-causes.md, defect A/B). A row's own writes therefore always run in strict
 * order: two boxes on the SAME row can no longer have their replies land out of
 * order and clobber each other, and a removal can no longer race a field write
 * still travelling for that same row. A different row is never held up by it —
 * `<rowId>` is whatever the row's own id currently is: the client-side
 * placeholder before its one-time create lands, the server's real id from then
 * on (the create's reply is what swaps it, see applyItemReply below).
 *
 * A required box on an already-real row that gets emptied is never sent: with no
 * Save button to refuse it, the field is marked instead (the house rule for a
 * check that belongs to a named field — CLAUDE.md) and the stored value stands
 * until a valid one is typed. A still-local row's boxes are never marked this
 * way — an untouched new row starts with every one of them blank, which is the
 * normal starting state, not an error.
 *
 * jobCardId is null on a brand-new job, where the whole list is still built up
 * locally and travels once in the create payload — every function below is then a
 * no-op, same as useInstantSave's saveField and toggleAssignee before a job exists.
 */
export function useInstantItems({ jobCardId, lineItems, setLineItems, removeLineItem, savedItemFields, onItemSaved, onItemRemoved, onAttachmentWarnings, onJobStatusChange, saveQueue }) {
  const jobCardIdRef = useRef(jobCardId);
  jobCardIdRef.current = jobCardId;
  // Read the live rows from a ref rather than closing over the lineItems argument,
  // so a guard check that runs after an await always sees the row (or its absence)
  // as it stands right now, not as it stood when the request was queued.
  const lineItemsRef = useRef(lineItems);
  lineItemsRef.current = lineItems;
  const savedItemFieldsRef = useRef(savedItemFields);
  savedItemFieldsRef.current = savedItemFields;

  const { fieldErrors, setFieldErrors, clearFieldError, clearAll, errorFor } = useFieldErrors();

  // Guards a real row's delete against a fast double-click sending two DELETEs for
  // the same line — the second would only 404 once the first has already removed it.
  const removingRef = useRef(new Set());

  // The same guard for the other direction: a local row that is already being
  // created. Every further edit on it still reads as complete (it stays local
  // until its reply lands), so without this each one would queue another create
  // and the job would end up holding the same part several times over. A ref, not
  // the rows themselves, because the answer has to be right within a single tick.
  const creatingRef = useRef(new Set());

  // One landing point for every part write's reply (Contract B, tasks/instant-
  // save-root-causes.md) — the screen rows, the saved baseline, the file notes and
  // the job's own status all move together here, so no call site can forget one
  // of the four. That gap was defect 1: only a file upload used to refresh the
  // notes, so adding, removing or editing a part left every part showing another
  // part's notes; a part change nudging the job's status (jobs-and-status.md) had
  // the same gap until onJobStatusChange was added here.
  //
  // The server's reply carries the job's full, ordered real-part list once
  // Contract B has landed on that route (`items`, plus `item` for the one just
  // touched on a create/update). Until then a route can still answer with just
  // the bare touched item (create/update) or nothing part-shaped at all
  // (delete) — this degrades to patching only the row that changed and leaves
  // the file notes alone, exactly what every call site did on its own before
  // this existed. Returns the mapped single touched row when the reply named
  // one, for the mid-create reconciliation below.
  const applyItemReply = useCallback((reply, { dropLocalId } = {}) => {
    if (!reply || typeof reply !== 'object') return null;
    const items = Array.isArray(reply.items) ? reply.items : null;
    const bareSingle = reply.item || (!items && reply.id ? reply : null);
    // The one row this reply is actually about — the only row whose field VALUES
    // (and saved baseline) this reply may move. `items` stays authoritative for
    // which rows exist and for every row's server-owned itemNumber, but nothing
    // else about a row this reply wasn't about is touched: a reply generated
    // before an out-of-order sibling write reached the server still carries that
    // sibling's now-stale value, and taking it would silently revert a save that
    // already landed (defect A, root-causes.md). A delete's reply names no row
    // (there's nothing left to be "about"), so touchedId stays null and every
    // surviving row is left exactly alone bar its position.
    const touchedId = bareSingle?.id || dropLocalId || null;
    // Pinned here rather than read inside the updater below: React may run that
    // updater later, and onItemSaved moves the baselines as soon as this returns,
    // so a row has to be judged against what the job had confirmed storing at the
    // moment THIS reply arrived.
    const baseAtReply = savedItemFieldsRef.current;

    // A row the user is part-way through editing keeps what is on screen; only its
    // server-owned numbering moves. Taking the server's copy wholesale would throw
    // away typing that hasn't been sent yet — including in the box the cursor is
    // still sitting in — just because an earlier write on this same row came back.
    // A row with no baseline yet (one that has only just been created) has nothing
    // to diverge from, so it takes the server's copy and createItemFromRow's own
    // reconciliation re-sends anything typed since. Only ever called for the row
    // this reply is about — see the touchedId branch below.
    const keepLocalEdits = (serverRow, currentRow) => {
      if (!currentRow) return serverRow;
      const base = baseAtReply[serverRow.id];
      if (base === undefined) return serverRow;
      if (JSON.stringify(buildItemPayload(currentRow)) === JSON.stringify(base)) return serverRow;
      return { ...currentRow, itemNumber: serverRow.itemNumber };
    };

    if (items) {
      const freshReal = items.map(mapLineItemFromApi);
      setLineItems(prev => {
        const onScreen = new Map(prev.map(r => [r.id, r]));
        return [
          ...freshReal.map(row => {
            const current = onScreen.get(row.id);
            // Not the row this reply is about: this reply's copy of its fields
            // may already be stale (it was built before a later write on THIS row
            // reached the server). Only its position moves — everything else
            // stays exactly what's on screen, with its own baseline untouched.
            if (row.id !== touchedId) return current ? { ...current, itemNumber: row.itemNumber } : row;
            return keepLocalEdits(row, current);
          }),
          ...prev.filter(row => !isSavedLineItem(row) && row.id !== dropLocalId)
        ];
      });
      // Only the row this reply is about has anything new to record as stored —
      // every other row's baseline is left exactly where it was.
      const touchedRow = freshReal.find(row => row.id === touchedId);
      if (touchedRow) onItemSaved?.(touchedRow.id, buildItemPayload(touchedRow));
    } else if (bareSingle) {
      const row = mapLineItemFromApi(bareSingle);
      setLineItems(prev => prev.map(it => {
        if (it.id === dropLocalId) return row;          // create: the id swap itself
        if (it.id === row.id) return keepLocalEdits(row, it);
        return it;
      }));
      onItemSaved?.(row.id, buildItemPayload(row));
    }

    if (reply.attachmentWarnings !== undefined) onAttachmentWarnings?.(reply.attachmentWarnings);
    // A part create/update can auto-advance the job's status the same way starting
    // a timer does — the reply carries jobStatus top-level only when THIS write
    // actually moved the status. A reply that lands after the user has since picked
    // their own status is handled upstream, not here: JobIdentityStrip.jsx waits for
    // every part save already in flight to settle before it sends a hand-picked
    // status change, so that pick is never sent while one of these replies is still
    // outstanding.
    if (reply.jobStatus !== undefined) onJobStatusChange?.(reply.jobStatus);
    return bareSingle ? mapLineItemFromApi(bareSingle) : null;
  }, [setLineItems, onItemSaved, onAttachmentWarnings, onJobStatusChange]);

  // One field on an already-real row. Absent-means-unchanged on the server, so only
  // the one field travels, never the rest of the row. Declared ahead of
  // createItemFromRow below, which calls it to reconcile a row edited mid-create.
  const writeItemField = useCallback((itemId, field, value) => {
    const forJobCardId = jobCardIdRef.current;
    if (!forJobCardId) return;
    // Named by the part's server-stated position, not the stored item_number —
    // that's only a sort order the server owns and may have gaps once a part is
    // deleted.
    const lineIdx = lineItemsRef.current.findIndex(it => it.id === itemId);
    const lineItem = lineIdx !== -1 ? lineItemsRef.current[lineIdx] : null;
    const lineNo = lineItem ? (lineItem.position != null ? lineItem.position : lineIdx + 1) : null;
    const noun = ITEM_FIELD_NOUN[field] || field;
    const label = lineNo != null ? `part ${lineNo}'s ${noun}` : `that part's ${noun}`;
    saveQueue.enqueue(`item:${itemId}`, (isCurrent) => api.updateJobItem(forJobCardId, itemId, { [field]: value })
      .then((reply) => {
        if (!isCurrent()) return;
        applyItemReply(reply);
      })
      .catch(err => {
        // The row was removed between this write being queued and its turn
        // coming up (e.g. a box was edited in the moment between clicking
        // Remove and the row leaving the screen) — the server's 404 for "no
        // such item" is the one clear signal there is nothing left to save,
        // not a failure the value itself caused. Never retried (a write is
        // never re-sent automatically) — just said plainly, and resolved so
        // the queue doesn't hold this key open as a permanently "failed" write
        // for a row that no longer exists.
        if (err?.status === 404 && err?.data?.error === 'Part not found') {
          if (isCurrent()) {
            toast.error("That part was removed, so the change wasn't saved.", { id: `item-gone-${itemId}` });
          }
          // Nothing was stored — the row is gone — so this must not count toward
          // landedCount or arm the green saved flash for a write that never landed.
          return NOT_LANDED;
        }
        throw err;
      }), { label });
  }, [saveQueue, applyItemReply]);

  const createItemFromRow = useCallback((row) => {
    const forJobCardId = jobCardIdRef.current;
    if (!forJobCardId) return;
    const localId = row.id;
    if (creatingRef.current.has(localId)) return;
    creatingRef.current.add(localId);
    saveQueue.enqueue(`item:${localId}`, (isCurrent) => {
      const current = lineItemsRef.current.find(it => it.id === localId);
      // Already real (an earlier queued create for this row won) or removed since
      // this was queued — nothing left to send. Completeness is deliberately NOT
      // re-checked here: the caller decided it from the value it had just set, and
      // React may not have rendered that value into lineItemsRef yet, so asking
      // again would read the row one edit behind and swallow the very create that
      // finishing the row is supposed to fire. `row` carries the complete snapshot;
      // anything typed after it is reconciled below once the reply lands.
      if (!current || isSavedLineItem(current)) {
        creatingRef.current.delete(localId);
        // Nothing was sent — already real (an earlier queued create won) or removed
        // since this was queued — so this must not count toward landedCount or arm
        // the green saved flash for a create that never happened.
        return Promise.resolve(NOT_LANDED);
      }
      return api.addJobItem(forJobCardId, buildItemPayload(row))
        .then((reply) => {
          if (!isCurrent()) return;
          const nowOnScreen = lineItemsRef.current.find(it => it.id === localId);
          if (!nowOnScreen) {
            // Removed from the screen while the create was travelling (a local row's
            // removal never waits on the server — see removeItem below). Clean up the
            // row the server just made so it doesn't reappear as an orphan part the
            // next time this job is opened.
            const createdId = reply?.item?.id || reply?.id;
            if (createdId) api.deleteJobItem(forJobCardId, createdId).catch(() => {});
            return;
          }
          const created = applyItemReply(reply, { dropLocalId: localId });
          if (!created) return; // an old-shape reply with nothing usable — nothing to reconcile
          // An edit made to this row while its create was travelling is still only
          // on screen — nothing sent it. Reconcile now, field by field, against what
          // the server actually stored (applyItemReply just recorded that as the
          // baseline, so a field that still differs correctly reads as unsaved until
          // its own write below lands).
          const confirmed = buildItemPayload(created);
          const onScreen = buildItemPayload(nowOnScreen);
          for (const field of Object.keys(confirmed)) {
            if (JSON.stringify(onScreen[field]) === JSON.stringify(confirmed[field])) continue;
            // A required box cleared while the create was travelling is never sent,
            // for the same reason clearing one on an already-real row isn't: the
            // server would refuse it and the stored value stands. The row keeps
            // reading as unsaved until a real value is typed back in.
            if (itemFieldMessage(field, onScreen[field])) continue;
            writeItemField(created.id, field, onScreen[field]);
          }
        })
        .catch(err => {
          if (!isCurrent()) return;
          // Never re-sent automatically — the row stays local, exactly as typed.
          // Completing it again (any required box) is what retries.
          toast.error(err.message || "Couldn't add that part", { id: `item-create-${localId}` });
          // Reported above with its own toast, not flagged 'failed' in the queue
          // (there's nothing stored to retry against — the row is still local) —
          // and NOT a landing either, so it must not count toward landedCount or
          // arm the green saved flash for a part that was never created.
          return NOT_LANDED;
        })
        .finally(() => creatingRef.current.delete(localId));
    }, { label: 'a new part' });
  }, [saveQueue, applyItemReply, writeItemField]);

  // Dropdowns, tags and toggles: called straight from onChange (see ItemsTab.jsx).
  // A still-local row just holds the edit — nothing is sent until the row as a
  // whole has every required field filled (createItemFromRow), so a change here
  // before that stays local-only and is never marked either.
  const handleItemFieldChange = useCallback((item, field, value) => {
    if (!isSavedLineItem(item)) {
      const merged = { ...item, [field]: value };
      if (isItemRowComplete(merged)) createItemFromRow(merged);
      return;
    }
    const key = fieldErrorKey(item.id, field);
    const message = itemFieldMessage(field, value);
    if (message) {
      // Emptied a required box: mark it, send nothing, leave the stored value
      // alone. Picking a real value again is what clears the mark and writes.
      setFieldErrors({ [key]: message });
      return;
    }
    clearFieldError(key);
    writeItemField(item.id, field, value);
  }, [createItemFromRow, writeItemField, setFieldErrors, clearFieldError]);

  // Text and number boxes: called from onBlur, after any blur-formatting has run.
  const commitItemFieldBlur = useCallback((item, field, value) => {
    if (!isSavedLineItem(item)) {
      // Same completeness check as handleItemFieldChange above, for the boxes
      // that commit on blur instead of on change — whichever one is filled last
      // is the one that turns the row real, not description specifically.
      const merged = { ...item, [field]: value };
      if (isItemRowComplete(merged)) createItemFromRow(merged);
      return;
    }
    const key = fieldErrorKey(item.id, field);
    const message = itemFieldMessage(field, value);
    if (message) {
      setFieldErrors({ [key]: message });
      return;
    }
    clearFieldError(key);
    const base = savedItemFieldsRef.current[item.id];
    if (base && String(value ?? '') === String(base[field] ?? '')) {
      // Back to what's already stored — nothing to send, but a stale "failed"
      // mark from an earlier attempt at a DIFFERENT value must not survive the
      // user reacting to it by putting the box back the way it was (defect C,
      // root-causes.md). Never re-sends anything — only drops that mark.
      saveQueue.clearFailure(`item:${item.id}`);
      return;
    }
    writeItemField(item.id, field, value);
  }, [createItemFromRow, writeItemField, setFieldErrors, clearFieldError, saveQueue]);

  // Clears a box's mark the moment it holds a value itemFieldMessage would
  // accept, ahead of its blur/write — the same live-clear the job description
  // field already does (JobIdentityStrip.jsx). Covers description's non-blank
  // rule and qty's whole-number rule in one, and is a no-op when nothing is
  // marked (useFieldErrors.js) or the field isn't a required one.
  const clearItemFieldErrorOnType = useCallback((itemId, field, value) => {
    if (!itemFieldMessage(field, value)) clearFieldError(fieldErrorKey(itemId, field));
  }, [clearFieldError]);

  const itemErrorFor = useCallback((itemId, field) => errorFor(fieldErrorKey(itemId, field)), [errorFor]);

  // A local row is just dropped — nothing was ever sent for it. A real row asks the
  // server first: it can refuse (logged work against the line, or the job's last
  // line), and the row has to stay on screen with the reason shown when it does.
  //
  // Routed through the save queue under the row's own key (`item:<itemId>`, same
  // as its field writes — root-causes.md defect B) rather than called directly:
  // a field write still travelling for this row now always finishes (or fails)
  // BEFORE the removal is even sent, and a removal's own reply can never be
  // overwritten by a field write's reply that was generated before it. Both used
  // to be able to race — a removal landing first left a field write's later
  // "not found" pointed at a line that no longer existed, and a field write
  // landing last after a removal resurrected the deleted row on screen.
  const removeItem = useCallback((item) => {
    if (!isSavedLineItem(item)) {
      removeLineItem(item.id);
      return;
    }
    const forJobCardId = jobCardIdRef.current;
    if (!forJobCardId || removingRef.current.has(item.id)) return;
    removingRef.current.add(item.id);
    // Named by position, same convention as a field write's own label, but
    // "removing" rather than the field's noun — closeReasons.js's generic
    // pending-queue sentence now covers both a save and a removal in flight, so
    // the label itself has to say which one this is.
    const lineIdx = lineItemsRef.current.findIndex(it => it.id === item.id);
    const lineItem = lineIdx !== -1 ? lineItemsRef.current[lineIdx] : null;
    const lineNo = lineItem ? (lineItem.position != null ? lineItem.position : lineIdx + 1) : null;
    const label = lineNo != null ? `removing part ${lineNo}` : 'removing that part';
    saveQueue.enqueue(`item:${item.id}`, (isCurrent) => api.deleteJobItem(forJobCardId, item.id)
      .then((reply) => {
        removingRef.current.delete(item.id);
        if (!isCurrent()) return;
        if (Array.isArray(reply?.items)) {
          applyItemReply(reply);
        } else {
          // Older reply shape (no full list back yet) — drop the one row
          // ourselves. Nothing renumbers any more: the server owns item_number
          // as a sort key and gaps after a delete are expected and fine.
          setLineItems(prev => prev.filter(it => it.id !== item.id));
          // applyItemReply isn't called on this branch, so jobStatus has to be
          // picked up here too — the delete route carries it top-level on this
          // shape as well, but only when this delete actually moved the status.
          if (reply?.jobStatus !== undefined) onJobStatusChange?.(reply.jobStatus);
        }
        onItemRemoved?.(item.id);
        // Nothing left to mark on a row that no longer exists.
        for (const field of REQUIRED_ITEM_FIELDS) clearFieldError(fieldErrorKey(item.id, field));
      })
      .catch(err => {
        removingRef.current.delete(item.id);
        // Stays on screen, exactly as it was — a refusal leaves nothing to lose,
        // so this is reported with its own toast rather than left marked failed
        // in the queue (same reasoning as a failed create above). The server's
        // own wording — time logged against it, or the job's last line — is
        // what the user needs to hear, not a paraphrase. Also NOT a landing —
        // nothing was actually removed, so it must not count toward
        // landedCount or arm the green saved flash.
        toast.error(err.message || "Couldn't remove that part", { id: `item-remove-${item.id}` });
        return NOT_LANDED;
      }), { label });
  }, [removeLineItem, setLineItems, onItemRemoved, applyItemReply, clearFieldError, saveQueue, onJobStatusChange]);

  // JobCardModal returns null when closed rather than unmounting, so these marks
  // outlive a close. Without clearing them, a box left empty on one job would keep
  // reading as incomplete on the next job opened — which closeReasons.js folds into
  // the close question, so that job would be told something wasn't filled in when
  // nothing was. Same reasoning as useInstantSave's resetFieldStates.
  const resetItemErrors = clearAll;

  return {
    resetItemErrors,
    handleItemFieldChange,
    commitItemFieldBlur,
    clearItemFieldErrorOnType,
    itemErrorFor,
    removeItem,
    // Raw required-box marks (fieldErrorKey -> message), for closeReasons.js to
    // turn into "line N needs a description" — see JobCardModal.jsx.
    fieldErrors
  };
}
