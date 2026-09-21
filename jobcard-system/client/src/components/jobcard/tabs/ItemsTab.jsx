import { useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { X, Plus } from 'lucide-react';
import { capitalizeFirst } from '../../../utils/formatters';
import { useTags } from '../../../hooks/useTags';
import LineItemTreatment from './LineItemTreatment';
import LineItemProgress from './LineItemProgress';
import LineItemTimerButton from '../LineItemTimerButton';
import LineItemTagSelect from './LineItemTagSelect';
import CreatableTagSelect from '../../common/CreatableTagSelect';
import TimeEntryForm from './TimeEntryForm';
import FieldError from '../../common/FieldError';
import { itemWarningMap } from '../../../utils/attachmentWarnings';
import { workBelongsToItem } from '../workMatch.mjs';
import { fieldErrorKey } from '../useInstantItems';

// Work pairs with a part by the part's permanent id (see workMatch.mjs) — a save
// can renumber every part, and work keyed to the old numbers would otherwise
// vanish from view until the job is reopened.
function entriesForItem(entries, item) {
  return entries.filter(e => workBelongsToItem(e, item));
}

// Only a saved part (a permanent "item:" id) can take attachments, a timer or an
// instant field write; a part added but not yet saved has no stable id for the
// server to recognise. Module-level (not a closure) so it's the same function
// reference on every render — LineItemCard is memoized below and this is passed
// through it.
function isPersisted(it) {
  return typeof it.id === 'string' && it.id.startsWith('item:');
}

// Same `${id}-error` naming shape as useFieldErrors' fieldProps/errorProps
// (hooks/useFieldErrors.js), applied by hand here: the error state itself lives in
// useInstantItems.js's own useFieldErrors instance, keyed by
// fieldErrorKey(item.id, field), not one this component holds — it only ever gets
// the message back through itemErrorFor. Module-level and pure, so every part's
// card resolves the same id without recreating the function per render.
function fieldErrorMessageId(itemId, field) {
  return `${fieldErrorKey(itemId, field)}-error`;
}

// A stable empty-object fallback — `attachmentWarnings?.attachedByItem || {}` would
// otherwise hand every part's card a brand-new {} on every render, which reads as
// "changed" to React.memo's shallow prop comparison and defeats it for every row
// at once.
const EMPTY_OBJECT = {};

export default function ItemsTab({
  jobCardId,
  lineItems,
  addLineItem,
  updateLineItem,
  removeLineItem,
  onItemFieldChange,
  onItemFieldBlur,
  onItemFieldType,
  itemErrorFor,
  suppliers = [],
  onSuppliersChanged,
  employees = [],
  timeEntries = [],
  canManage = false,
  isCritical = false,
  readOnly = false,
  attachmentWarnings = null,
  onAttachItemFile,
  showTimeEntryForm = false,
  editingTimeEntryId = null,
  timeEntryForm,
  handleTimeEntryChange,
  machines = [],
  handleAddTimeEntry,
  handleEditTimeEntry,
  handleSaveTimeEntry,
  handleStopEntryWithForm,
  handleDeleteTimeEntry,
  resetTimeEntryForm,
  timeEntryGroupClass,
  timeEntryErrorFor,
  // Timer (per-item)
  activeTimer,
  timerElapsed,
  timerLoading,
  onStartTimer,
  onStopTimer,
  currentUserId
}) {
  const { tags: jobTypeTags, rawTags: jobTypeRawTags, loading: jobTypesLoading } = useTags('job_type');
  const { tags: drawingsTags, rawTags: drawingsRawTags } = useTags('drawings');
  const { tags: customerPropertyTags, rawTags: customerPropertyRawTags } = useTags('customer_property');

  // useTags hands back a fresh labelOf closure on every call — fine for a single
  // lookup, but handed down to every part's memoized card, a "new" function every
  // render reads as "changed" to a shallow prop comparison and makes the memo
  // pointless. Rebuilt here off the same rawTags array so it only changes when the
  // tags themselves do.
  const jobTypeLabelOf = useCallback(
    (value) => jobTypeRawTags.find(t => t.value === value)?.name || value,
    [jobTypeRawTags]
  );
  const drawingsLabelOf = useCallback(
    (value) => drawingsRawTags.find(t => t.value === value)?.name || value,
    [drawingsRawTags]
  );
  const customerPropertyLabelOf = useCallback(
    (value) => customerPropertyRawTags.find(t => t.value === value)?.name || value,
    [customerPropertyRawTags]
  );

  const fieldsLocked = readOnly;
  // Memoised for the same reason as labelOf above: a fresh object/array every
  // render would make every part's card think its warnings changed.
  const warningByItem = useMemo(() => itemWarningMap(attachmentWarnings), [attachmentWarnings]);
  // Names of the files already attached per part, so each Drawings / Customer
  // Property field can list them instead of just saying "Attached".
  const attachedByItem = useMemo(
    () => attachmentWarnings?.attachedByItem || EMPTY_OBJECT,
    [attachmentWarnings]
  );

  // Dropdowns, tags and toggles write the moment they change. A still-local row's
  // change just stays in local state — see useInstantItems.js's handleItemFieldChange.
  const handleFieldChange = useCallback((item, field, value) => {
    updateLineItem(item.id, field, value);
    onItemFieldChange?.(item, field, value);
  }, [updateLineItem, onItemFieldChange]);

  // A required box on a saved row that's currently emptied — see useInstantItems.js.
  // Falls back to "no error" where the caller doesn't pass the lookup (the
  // read-only employee view never edits a field, so it never has one to check).
  const fieldError = useCallback(
    (item, field) => itemErrorFor?.(item.id, field) || null,
    [itemErrorFor]
  );

  // The add/edit time-entry form renders at the top of the Parts section, but its
  // Edit buttons live down inside each line item's expanded list — so opening it can drop
  // the form above the current scroll position, out of sight. Bring it into view when it opens.
  const timeEntryFormRef = useRef(null);
  useEffect(() => {
    if (showTimeEntryForm && timeEntryFormRef.current) {
      timeEntryFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [showTimeEntryForm, editingTimeEntryId]);

  // Adding a part appends its card to the bottom of the list, which can be below the fold
  // on a long job (the Add button sits at the top). Scroll the new card into view, but only
  // when the user actually clicked Add — not when a job's saved parts first load in.
  const listRef = useRef(null);
  const scrollToNewItemRef = useRef(false);
  const handleAddLineItem = () => {
    scrollToNewItemRef.current = true;
    addLineItem();
  };
  useEffect(() => {
    if (scrollToNewItemRef.current && listRef.current) {
      scrollToNewItemRef.current = false;
      listRef.current.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [lineItems.length]);

  return (
    <div className="modal-form-grid">
      <div className="form-section">
        <div className="form-section-header">
          <h3 className="form-section-title">Parts <span className="required">*</span></h3>
          {!fieldsLocked && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleAddLineItem}>
              <Plus size={14} /> Add Part
            </button>
          )}
        </div>

        {canManage && showTimeEntryForm && timeEntryForm && (
          <div ref={timeEntryFormRef}>
            <TimeEntryForm
              editingTimeEntryId={editingTimeEntryId}
              timeEntryForm={timeEntryForm}
              handleTimeEntryChange={handleTimeEntryChange}
              employees={employees}
              lineItems={lineItems}
              machines={machines}
              isCritical={isCritical}
              handleSaveTimeEntry={handleSaveTimeEntry}
              resetTimeEntryForm={resetTimeEntryForm}
              groupClass={timeEntryGroupClass}
              errorFor={timeEntryErrorFor}
            />
          </div>
        )}

        <div className="line-items-list" ref={listRef}>
          {lineItems.map((item, itemIdx) => (
            <LineItemCard
              key={item.id}
              item={item}
              itemIdx={itemIdx}
              jobCardId={jobCardId}
              canManage={canManage}
              fieldsLocked={fieldsLocked}
              currentUserId={currentUserId}
              suppliers={suppliers}
              employees={employees}
              timeEntries={timeEntries}
              jobTypeTags={jobTypeTags}
              jobTypesLoading={jobTypesLoading}
              jobTypeLabelOf={jobTypeLabelOf}
              drawingsTags={drawingsTags}
              drawingsLabelOf={drawingsLabelOf}
              customerPropertyTags={customerPropertyTags}
              customerPropertyLabelOf={customerPropertyLabelOf}
              warningByItem={warningByItem}
              attachedByItem={attachedByItem}
              activeTimer={activeTimer}
              timerElapsed={timerElapsed}
              timerLoading={timerLoading}
              onStartTimer={onStartTimer}
              onStopTimer={onStopTimer}
              updateLineItem={updateLineItem}
              removeLineItem={removeLineItem}
              onFieldChange={handleFieldChange}
              onFieldBlur={onItemFieldBlur}
              onFieldType={onItemFieldType}
              fieldError={fieldError}
              onSuppliersChanged={onSuppliersChanged}
              onAttachItemFile={onAttachItemFile}
              handleAddTimeEntry={handleAddTimeEntry}
              handleEditTimeEntry={handleEditTimeEntry}
              handleDeleteTimeEntry={handleDeleteTimeEntry}
              handleStopEntryWithForm={handleStopEntryWithForm}
              showRemove={!fieldsLocked && lineItems.length > 1}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// One part's card, pulled out of ItemsTab's map and memoized: with the row body
// living inline in the map, typing one character into one part's box re-rendered
// every OTHER part's card, its tag selects, its progress list and its timer button
// too — the whole list re-ran the whole map body on every keystroke. Every
// function/object handed in as a prop has to stay the same reference across
// renders (useCallback/useMemo in ItemsTab above, or a plain pass-through of a
// prop ItemsTab's own caller already stabilized) or a fresh one every render would
// make this memo a no-op.
const LineItemCard = memo(function LineItemCard({
  item,
  itemIdx,
  jobCardId,
  canManage,
  fieldsLocked,
  currentUserId,
  suppliers,
  employees,
  timeEntries,
  jobTypeTags,
  jobTypesLoading,
  jobTypeLabelOf,
  drawingsTags,
  drawingsLabelOf,
  customerPropertyTags,
  customerPropertyLabelOf,
  warningByItem,
  attachedByItem,
  activeTimer,
  timerElapsed,
  timerLoading,
  onStartTimer,
  onStopTimer,
  updateLineItem,
  removeLineItem,
  onFieldChange,
  onFieldBlur,
  onFieldType,
  fieldError,
  onSuppliersChanged,
  onAttachItemFile,
  handleAddTimeEntry,
  handleEditTimeEntry,
  handleDeleteTimeEntry,
  handleStopEntryWithForm,
  showRemove
}) {
  const itemEntries = useMemo(() => entriesForItem(timeEntries, item), [timeEntries, item]);
  // A saved value whose option was archived isn't in the active list — flag it
  // (only once the list has loaded, so it doesn't flash on every value at startup).
  const jobTypeRetired = item.jobType && !jobTypesLoading && !jobTypeTags.some(o => o.value === item.jobType);
  // The number shown to the user is the part's position, stated by the
  // server on every saved row (item.position) — never its stored
  // item_number, which is only a sort order the server owns and may
  // have gaps once a part is deleted, and never recounted here. A row
  // still local to this screen (not yet saved, so the server has never
  // seen it to state a position for) falls back to its place in this
  // list, which is always its correct future position: a new row is
  // only ever added at the end, right where the server would put it.
  const displayNumber = item.position != null ? item.position : itemIdx + 1;

  return (
    <div className="line-item-card">
      <div className="line-item-badge">#{displayNumber}</div>
      <div className="line-item-fields">
        <div className="line-item-row line-item-row-primary">
        <div className={fieldError(item, 'jobType') ? 'line-item-job-type field-error' : 'line-item-job-type'}>
          <label htmlFor={fieldsLocked ? undefined : fieldErrorKey(item.id, 'jobType')}>Job Type {!fieldsLocked && <span className="required">*</span>}</label>
          {fieldsLocked ? (
            <div className="readonly-value">
              {item.jobType ? jobTypeLabelOf(item.jobType) : '-'}
            </div>
          ) : (
            <select
              id={fieldErrorKey(item.id, 'jobType')}
              className={jobTypeRetired ? 'has-retired' : ''}
              value={item.jobType || ''}
              onChange={(e) => onFieldChange(item, 'jobType', e.target.value)}
              aria-invalid={fieldError(item, 'jobType') ? true : undefined}
              aria-describedby={fieldError(item, 'jobType') ? fieldErrorMessageId(item.id, 'jobType') : undefined}
            >
              <option value="">Select...</option>
              {jobTypeRetired && (
                <option className="retired-option" value={item.jobType}>{jobTypeLabelOf(item.jobType)} (retired)</option>
              )}
              {jobTypeTags.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}
          <FieldError id={fieldErrorMessageId(item.id, 'jobType')} message={fieldError(item, 'jobType')} />
        </div>
        <div className={fieldError(item, 'qty') ? 'line-item-qty field-error' : 'line-item-qty'}>
          <label htmlFor={fieldsLocked ? undefined : fieldErrorKey(item.id, 'qty')}>Qty</label>
          {fieldsLocked ? (
            <div className="readonly-value">{item.qty || '-'}</div>
          ) : (
            <input
              id={fieldErrorKey(item.id, 'qty')}
              type="number"
              min="1"
              step="1"
              value={item.qty}
              onChange={(e) => {
                const digits = e.target.value.replace(/[^\d]/g, '');
                updateLineItem(item.id, 'qty', digits);
                onFieldType?.(item.id, 'qty', digits);
              }}
              onBlur={(e) => onFieldBlur?.(item, 'qty', e.target.value.replace(/[^\d]/g, ''))}
              placeholder="Qty"
              aria-invalid={fieldError(item, 'qty') ? true : undefined}
              aria-describedby={fieldError(item, 'qty') ? fieldErrorMessageId(item.id, 'qty') : undefined}
            />
          )}
          <FieldError id={fieldErrorMessageId(item.id, 'qty')} message={fieldError(item, 'qty')} />
        </div>
        <div className={fieldError(item, 'description') ? 'line-item-desc field-error' : 'line-item-desc'}>
          <label htmlFor={fieldsLocked ? undefined : fieldErrorKey(item.id, 'description')}>Description</label>
          {fieldsLocked ? (
            <div className="readonly-value">{item.description || '-'}</div>
          ) : (
            <input
              id={fieldErrorKey(item.id, 'description')}
              type="text"
              value={item.description}
              onChange={(e) => {
                updateLineItem(item.id, 'description', e.target.value);
                onFieldType?.(item.id, 'description', e.target.value);
              }}
              onBlur={(e) => {
                const formatted = capitalizeFirst(e.target.value);
                if (formatted !== e.target.value) {
                  updateLineItem(item.id, 'description', formatted);
                }
                onFieldBlur?.(item, 'description', formatted);
              }}
              placeholder="What needs to be done..."
              aria-invalid={fieldError(item, 'description') ? true : undefined}
              aria-describedby={fieldError(item, 'description') ? fieldErrorMessageId(item.id, 'description') : undefined}
            />
          )}
          <FieldError id={fieldErrorMessageId(item.id, 'description')} message={fieldError(item, 'description')} />
        </div>
        </div>
        <div className="line-item-row line-item-row-secondary">
        <div className="line-item-material">
          <label htmlFor={fieldsLocked ? undefined : fieldErrorKey(item.id, 'material')}>Material</label>
          <CreatableTagSelect
            id={fieldsLocked ? undefined : fieldErrorKey(item.id, 'material')}
            category="material"
            value={item.material || ''}
            onChange={(v) => onFieldChange(item, 'material', v)}
            placeholder="Type or add a material…"
            disabled={fieldsLocked}
          />
        </div>
        {fieldsLocked ? (
          <div className="line-item-treatment">
            <label>Service &amp; Supplier</label>
            <div className="readonly-value">
              {(Array.isArray(item.treatments) && item.treatments.length > 0)
                ? item.treatments.map((t, i) => {
                    const tName = t.value;
                    // If the saved supplier still exists but is archived, tag it
                    // "(retired)" so it reads the same as a retired treatment.
                    const supplier = t.supplierId ? suppliers.find(s => s.id === t.supplierId) : null;
                    const supplierRetired = supplier && !(supplier.active === 1 || supplier.active === true);
                    return (
                      <span key={i} className="readonly-badge treatment">
                        {tName} → {t.supplierName
                          ? <span className={supplierRetired ? 'retired-option' : ''}>{t.supplierName}{supplierRetired ? ' (retired)' : ''}</span>
                          : '(no supplier)'}
                      </span>
                    );
                  })
                : '-'}
            </div>
          </div>
        ) : (
          <div className="line-item-treatment-group">
            <LineItemTreatment
              treatments={Array.isArray(item.treatments) ? item.treatments : []}
              suppliers={suppliers}
              onSuppliersChanged={onSuppliersChanged}
              onChange={(arr) => onFieldChange(item, 'treatments', arr)}
            />
          </div>
        )}

        <LineItemTagSelect
          id={fieldErrorKey(item.id, 'drawingsType')}
          label="Drawings"
          required={!fieldsLocked}
          readOnly={fieldsLocked}
          value={item.drawingsType || ''}
          options={drawingsTags.map(o => ({ value: o.value, label: o.label }))}
          labelOf={drawingsLabelOf}
          naValue="N_A"
          onChange={(v) => onFieldChange(item, 'drawingsType', v)}
          warning={!!warningByItem[item.itemNumber]?.missingDrawing}
          attachedFiles={attachedByItem[item.itemNumber]?.drawings || []}
          onAttach={onAttachItemFile && isPersisted(item) ? () => onAttachItemFile(item.id, displayNumber, 'job-files') : undefined}
          error={fieldError(item, 'drawingsType')}
        />

        <LineItemTagSelect
          id={fieldErrorKey(item.id, 'customerProperty')}
          label="Customer Property"
          required={!fieldsLocked}
          readOnly={fieldsLocked}
          value={item.customerProperty || ''}
          options={customerPropertyTags.map(o => ({ value: o.value, label: o.label }))}
          labelOf={customerPropertyLabelOf}
          naValue="N_A"
          onChange={(v) => onFieldChange(item, 'customerProperty', v)}
          warning={!!warningByItem[item.itemNumber]?.missingCustomerProperty}
          attachedFiles={attachedByItem[item.itemNumber]?.customerProperty || []}
          onAttach={onAttachItemFile && isPersisted(item) ? () => onAttachItemFile(item.id, displayNumber, 'customer-property-files') : undefined}
          error={fieldError(item, 'customerProperty')}
        />
        </div>

        {jobCardId && isPersisted(item) && (onStartTimer || onStopTimer) && (
          <div className="line-item-actions">
            <LineItemTimerButton
              itemId={item.id}
              itemNumber={item.itemNumber}
              displayNumber={displayNumber}
              activeTimer={activeTimer}
              elapsed={timerElapsed}
              loading={timerLoading}
              onStart={onStartTimer}
              onStop={onStopTimer}
              canManage={canManage}
              employees={employees}
              currentUserId={currentUserId}
            />
          </div>
        )}

        {jobCardId && (
          <LineItemProgress
            entries={itemEntries}
            targetQty={item.qty}
            canManage={canManage}
            activeTimerId={activeTimer?.id}
            onAdd={canManage && handleAddTimeEntry ? () => handleAddTimeEntry(item.id) : undefined}
            onEdit={canManage ? handleEditTimeEntry : undefined}
            onDelete={canManage ? handleDeleteTimeEntry : undefined}
            onStop={handleStopEntryWithForm}
          />
        )}
      </div>
      {showRemove && (
        <button
          type="button"
          className="line-item-remove"
          onClick={() => removeLineItem(item)}
          title="Remove part"
          aria-label={`Remove part ${displayNumber}`}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
});
