import { useRef, useEffect } from 'react';
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
  const { tags: jobTypeTags, loading: jobTypesLoading, labelOf: jobTypeLabelOf } = useTags('job_type');
  const { tags: drawingsTags, labelOf: drawingsLabelOf } = useTags('drawings');
  const { tags: customerPropertyTags, labelOf: customerPropertyLabelOf } = useTags('customer_property');
  const fieldsLocked = readOnly;
  const warningByItem = itemWarningMap(attachmentWarnings);
  // Names of the files already attached per part, so each Drawings / Customer
  // Property field can list them instead of just saying "Attached".
  const attachedByItem = attachmentWarnings?.attachedByItem || {};

  // Only saved parts (which carry a permanent "item:" id) can take attachments,
  // a timer or an instant field write; a part added but not yet saved has no
  // stable id for the server to recognise.
  const isPersisted = (it) => typeof it.id === 'string' && it.id.startsWith('item:');

  // Dropdowns, tags and toggles write the moment they change. A still-local row's
  // change just stays in local state — see useInstantItems.js's handleItemFieldChange.
  const handleFieldChange = (item, field, value) => {
    updateLineItem(item.id, field, value);
    onItemFieldChange?.(item, field, value);
  };

  // A required box on a saved row that's currently emptied — see useInstantItems.js.
  // Falls back to "no error" where the caller doesn't pass the lookup (the
  // read-only employee view never edits a field, so it never has one to check).
  const fieldError = (item, field) => itemErrorFor?.(item.id, field) || null;

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
          {lineItems.map((item, itemIdx) => {
            const itemEntries = entriesForItem(timeEntries, item);
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
              <div key={item.id} className="line-item-card">
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
                        onChange={(e) => handleFieldChange(item, 'jobType', e.target.value)}
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
                    <FieldError message={fieldError(item, 'jobType')} />
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
                          onItemFieldType?.(item.id, 'qty', digits);
                        }}
                        onBlur={(e) => onItemFieldBlur?.(item, 'qty', e.target.value.replace(/[^\d]/g, ''))}
                        placeholder="Qty"
                      />
                    )}
                    <FieldError message={fieldError(item, 'qty')} />
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
                          onItemFieldType?.(item.id, 'description', e.target.value);
                        }}
                        onBlur={(e) => {
                          const formatted = capitalizeFirst(e.target.value);
                          if (formatted !== e.target.value) {
                            updateLineItem(item.id, 'description', formatted);
                          }
                          onItemFieldBlur?.(item, 'description', formatted);
                        }}
                        placeholder="What needs to be done..."
                      />
                    )}
                    <FieldError message={fieldError(item, 'description')} />
                  </div>
                  </div>
                  <div className="line-item-row line-item-row-secondary">
                  <div className="line-item-material">
                    <label htmlFor={fieldsLocked ? undefined : fieldErrorKey(item.id, 'material')}>Material</label>
                    <CreatableTagSelect
                      id={fieldsLocked ? undefined : fieldErrorKey(item.id, 'material')}
                      category="material"
                      value={item.material || ''}
                      onChange={(v) => handleFieldChange(item, 'material', v)}
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
                        onChange={(arr) => handleFieldChange(item, 'treatments', arr)}
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
                    onChange={(v) => handleFieldChange(item, 'drawingsType', v)}
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
                    onChange={(v) => handleFieldChange(item, 'customerProperty', v)}
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
                {!fieldsLocked && lineItems.length > 1 && (
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
          })}
        </div>
      </div>
    </div>
  );
}
