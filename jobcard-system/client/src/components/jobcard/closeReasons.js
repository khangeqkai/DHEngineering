// Turns "something on this screen hasn't reached the job" into the two different
// sentences the close question needs — see tasks/instant-save-job-card.md, Stage 4b,
// and tasks/instant-save-root-causes.md's Contract A. A pure function (no hooks) so
// it can be unit-reasoned about on its own: everything it needs is handed in by
// useJobCardCloseGuard.js, which is the one place already holding the form, the
// save queue and the parts list's own required-box marks.
//
// Two lists come out:
//   - safe: a required box is empty. Nothing was ever sent, so the stored value
//     still stands and closing costs nothing — these get "Close anyway" / "Fix it".
//   - atRisk: something really would be lost — a write that's queued, in flight or
//     failed, a part row that was never sent at all, an edit sitting in a box that
//     hasn't been left yet (blur is what sends it). These keep the original
//     "close and lose them" framing.
// When both are non-empty, the caller (useUnsavedGuard.js) gives atRisk the
// framing and folds safe in as a second line, per the spec.
//
// Every atRisk entry now comes from a fact recorded somewhere (the save queue) or
// a direct, structural comparison (a box differing from what the job last
// confirmed storing) — there is no longer a branch that says "something is
// different and I don't know why" (tasks/instant-save-root-causes.md, defect 8).
import { isSavedLineItem } from './jobCardValidation.mjs';
import { buildItemPayload } from './mappers';
import { fieldErrorKey } from './useInstantItems';

// Human-readable name for a job-level instant-save field — used both here (for a
// box that's been typed into but not yet sent) and by useInstantSave.js (as the
// save queue's label for that field, which is what a queued/failed entry names
// itself with). One map, so the two can't drift apart.
export const JOB_FIELD_LABEL = {
  priority: 'the priority',
  dueDate: 'the due date',
  description: 'the job description',
  poNumber: "the customer's PO number",
  quoteReference: 'the quote reference',
  repeatJobReference: 'the previous job reference',
  qaLevelId: 'the quality level',
  isRepeatJob: 'the repeat-job setting'
};

// Every field useInstantSave.js can write — the generic "typed but not yet sent"
// check below walks this list once rather than each field having to remember it.
const JOB_INSTANT_FIELDS = Object.keys(JOB_FIELD_LABEL);

// title/phrase pairs for a part's own required box: title is the exact wording
// the spec's examples use ("Line 2 needs a description"), phrase is the lower-case
// noun used when folding this into a longer sentence ("line 2's description").
const ITEM_FIELD_NAME = {
  description: { article: 'a description', noun: 'description' },
  qty: { article: 'a quantity', noun: 'quantity' },
  jobType: { article: 'a job type', noun: 'job type' },
  drawingsType: { article: 'a drawings answer', noun: 'drawings' },
  customerProperty: { article: 'a customer property answer', noun: 'customer property' }
};

// A row nobody has typed anything into yet — the normal starting state for a
// fresh "Add Item" row, not work that would be lost by closing. Exported so
// useJobCardForm.js's own dirty check agrees with this one exactly (defect 5 —
// see the comment on itemsDirty there for why the two must never disagree).
export function lineItemHasContent(item) {
  return Boolean(
    (item.description && item.description.trim()) ||
    (item.qty !== '' && item.qty != null) ||
    item.jobType ||
    item.material ||
    (Array.isArray(item.treatments) && item.treatments.length > 0) ||
    item.drawingsType ||
    item.customerProperty
  );
}

// True when a persisted row's on-screen value differs from what the job last
// confirmed storing, on a field that isn't already explained by an active
// required-box mark (that difference belongs in `safe`, not here). The caller
// only reaches this once it has already checked the row has no active queue
// entry — a field currently queued/in flight/failed is named by the queue's own
// entry instead, with a more specific label.
function itemHasUnexplainedMismatch(item, savedItemFields, itemFieldErrors) {
  const base = savedItemFields[item.id];
  if (base === undefined) return true;
  const current = buildItemPayload(item);
  return Object.keys(current).some(field => {
    if (JSON.stringify(current[field]) === JSON.stringify(base[field])) return false;
    return !itemFieldErrors[fieldErrorKey(item.id, field)];
  });
}

export function buildCloseReasons({
  isEdit,
  descriptionError,
  formData,
  savedForm,
  lineItems,
  savedItemFields,
  itemFieldErrors,
  jobCardId,
  pending
}) {
  const safe = [];
  const atRisk = [];

  // A brand-new job still keeps its Save button and the old whole-payload flow —
  // none of the per-field/per-row machinery below applies to it.
  if (!isEdit || !jobCardId) return { safe, atRisk };

  if (descriptionError) {
    safe.push({
      key: 'jc-description',
      title: "Job description can't be empty",
      phrase: 'the job description'
    });
  }

  // Named by the part's server-stated position, not the stored item_number —
  // that's only a sort order the server owns and may have gaps once a part is
  // deleted. A still-local row (never saved, so never given one) falls back to
  // its place in the list, which is where it would land once saved.
  for (const [key, message] of Object.entries(itemFieldErrors || {})) {
    const [itemId, field] = key.split('|');
    const idx = lineItems.findIndex(i => i.id === itemId);
    const item = idx !== -1 ? lineItems[idx] : null;
    const lineNo = item ? (item.position != null ? item.position : idx + 1) : '?';
    const names = ITEM_FIELD_NAME[field];
    safe.push({
      key,
      title: names ? `Line ${lineNo} needs ${names.article}` : message,
      phrase: names ? `line ${lineNo}'s ${names.noun}` : `line ${lineNo}`
    });
  }

  const pendingKeys = new Set((pending || []).map(p => p.key));

  // A job-level box that's been typed into but not left yet (blur is what sends
  // it) has nothing in the queue to show for it — the write hasn't even been
  // asked for. That's still real risk, unlike an untouched blank part row, so it
  // belongs here. Skip a field the description mark already explained, and one
  // the queue is already naming (about to be sent, or already failed).
  for (const field of JOB_INSTANT_FIELDS) {
    if (field === 'description' && descriptionError) continue;
    if (pendingKeys.has(`field:${field}`)) continue;
    if (JSON.stringify(formData?.[field]) === JSON.stringify(savedForm?.[field])) continue;
    atRisk.push({ text: JOB_FIELD_LABEL[field] || `the ${field}`, verb: "hasn't been saved" });
  }

  // Named by position here too, for the same reason as above.
  lineItems.forEach((item, idx) => {
    const lineNo = item.position != null ? item.position : idx + 1;
    if (!isSavedLineItem(item)) {
      // Once a still-local row has enough filled in, its own create is queued
      // under the row's own key (item:<id> — one key per row now covers its
      // create, every field write and its removal alike, root-causes.md defect
      // A/B) and named below with the rest of the queue — naming it again here
      // would just repeat the same row twice.
      if (lineItemHasContent(item) && !pendingKeys.has(`item:${item.id}`)) {
        atRisk.push({ text: `line ${lineNo}`, verb: "hasn't been saved" });
      }
      return;
    }
    // A real row with anything currently queued/in flight/failed against it is
    // named below by the queue itself — more specific than anything this could
    // say. Only reach for the generic mismatch check when the queue has nothing
    // at all outstanding for this row (the "typed but not blurred" gap a queue
    // entry can't cover, since the write hasn't been asked for yet).
    const rowHasActiveWrite = pendingKeys.has(`item:${item.id}`);
    if (!rowHasActiveWrite && itemHasUnexplainedMismatch(item, savedItemFields, itemFieldErrors || {})) {
      atRisk.push({ text: `line ${lineNo}`, verb: "hasn't been saved" });
    }
  });

  // Everything the queue itself is still holding — queued, in flight or failed —
  // is a fact recorded the moment it happened, not something inferred after the
  // fact. This is what makes the old "something is different, don't know why"
  // fallback unnecessary: every write in flight or refused has its own label.
  //
  // A part row's single key now covers a field save, its one-time create AND its
  // removal alike (root-causes.md defect A/B), so "hasn't finished saving" /
  // "couldn't be saved" — exactly right for a field or an assignee — would misname
  // a removal in flight or refused. Item rows get their own, action-neutral
  // wording instead; every other key keeps the original phrasing.
  for (const { key, label, state } of (pending || [])) {
    const verb = key.startsWith('item:')
      ? (state === 'failed' ? "didn't go through" : "hasn't gone through yet")
      : (state === 'failed' ? "couldn't be saved" : "hasn't finished saving");
    atRisk.push({ text: label, verb });
  }

  return { safe, atRisk };
}

function joinList(items) {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// One "close it and lose them?" sentence naming every at-risk thing. This is the
// framing that wins when both lists are non-empty (real risk beats "nothing to
// lose") — see the module header.
export function describeAtRisk(atRisk) {
  const clauses = atRisk.map(a => `${a.text} ${a.verb}`);
  const pronoun = atRisk.length > 1 ? 'them' : 'it';
  return `${capitalize(joinList(clauses))}. Close it and lose ${pronoun}?`;
}

// The "nothing is actually at risk" dialog for one or more empty required boxes —
// used on its own when atRisk is empty.
export function describeSafe(safe) {
  if (safe.length === 1) {
    const [only] = safe;
    return {
      title: only.title,
      message: only.key === 'jc-description'
        ? "It hasn't been saved, so the job keeps the description it already has."
        : "It hasn't been saved, so the job keeps what's already stored there."
    };
  }
  return {
    title: 'Some required boxes are empty',
    message: `None of them have been saved, so the job keeps what it already has for each: ${joinList(safe.map(s => s.phrase))}.`
  };
}

// Folded onto the end of the at-risk message when both lists are non-empty — the
// spec's "(a) is mentioned as a second line".
export function describeSafeAsSecondLine(safe) {
  if (safe.length === 0) return '';
  const plural = safe.length > 1;
  return ` Separately, ${joinList(safe.map(s => s.phrase))} still ${plural ? 'need' : 'needs'} filling in — the job keeps what it already has ${plural ? 'for those' : 'for that'} either way.`;
}
