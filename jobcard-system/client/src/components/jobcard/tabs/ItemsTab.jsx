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
import { itemWarningMap } from '../../../utils/attachmentWarnings';

function entriesForItem(entries, itemNumber) {
  const target = String(itemNumber);
  return entries.filter(e => {
    if (e.itemNumber === undefined || e.itemNumber === null) return false;
    return String(e.itemNumber) === target;
  });
}

export default function ItemsTab({
  jobCardId,
  lineItems,
  addLineItem,
  updateLineItem,
  removeLineItem,
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

  // Only saved parts (which carry a permanent "item:" id) can take attachments;
  // a part added but not yet saved has no stable id to tie a file to.
  const isPersisted = (it) => typeof it.id === 'string' && it.id.startsWith('item:');

  // The add/edit time-entry form renders at the top of the Line Items section, but its
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
          <h3 className="form-section-title">Line Items <span className="required">*</span></h3>
          {!fieldsLocked && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleAddLineItem}>
              <Plus size={14} /> Add Item
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
            />
          </div>
        )}

        <div className="line-items-list" ref={listRef}>
          {lineItems.map(item => {
            const itemEntries = entriesForItem(timeEntries, item.itemNumber);
            // A saved value whose option was archived isn't in the active list — flag it
            // (only once the list has loaded, so it doesn't flash on every value at startup).
            const jobTypeRetired = item.jobType && !jobTypesLoading && !jobTypeTags.some(o => o.value === item.jobType);
            return (
              <div key={item.id} className="line-item-card">
                <div className="line-item-badge">#{item.itemNumber}</div>
                <div className="line-item-fields">
                  <div className="line-item-row line-item-row-primary">
                  <div className="line-item-job-type">
                    <label>Job Type {!fieldsLocked && <span className="required">*</span>}</label>
                    {fieldsLocked ? (
                      <div className="readonly-value">
                        {item.jobType ? jobTypeLabelOf(item.jobType) : '-'}
                      </div>
                    ) : (
                      <select
                        className={jobTypeRetired ? 'has-retired' : ''}
                        value={item.jobType || ''}
                        onChange={(e) => updateLineItem(item.id, 'jobType', e.target.value)}
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
                  </div>
                  <div className="line-item-qty">
                    <label>Qty</label>
                    {fieldsLocked ? (
                      <div className="readonly-value">{item.qty || '-'}</div>
                    ) : (
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={item.qty}
                        onChange={(e) => updateLineItem(item.id, 'qty', e.target.value.replace(/[^\d]/g, ''))}
                        placeholder="Qty"
                      />
                    )}
                  </div>
                  <div className="line-item-desc">
                    <label>Description</label>
                    {fieldsLocked ? (
                      <div className="readonly-value">{item.description || '-'}</div>
                    ) : (
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                        onBlur={(e) => {
                          const formatted = capitalizeFirst(e.target.value);
                          if (formatted !== e.target.value) {
                            updateLineItem(item.id, 'description', formatted);
                          }
                        }}
                        placeholder="What needs to be done..."
                      />
                    )}
                  </div>
                  </div>
                  <div className="line-item-row line-item-row-secondary">
                  <div className="line-item-material">
                    <label>Material</label>
                    <CreatableTagSelect
                      category="material"
                      value={item.material || ''}
                      onChange={(v) => updateLineItem(item.id, 'material', v)}
                      placeholder="Type or add a material…"
                      disabled={fieldsLocked}
                    />
                  </div>
                  {fieldsLocked ? (
                    <div className="line-item-treatment">
                      <label>Treatment &amp; Supplier</label>
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
                        onChange={(arr) => updateLineItem(item.id, 'treatments', arr)}
                      />
                    </div>
                  )}

                  <LineItemTagSelect
                    label="Drawings"
                    required={!fieldsLocked}
                    readOnly={fieldsLocked}
                    value={item.drawingsType || ''}
                    options={drawingsTags.map(o => ({ value: o.value, label: o.label }))}
                    labelOf={drawingsLabelOf}
                    naValue="N_A"
                    onChange={(v) => updateLineItem(item.id, 'drawingsType', v)}
                    warning={!!warningByItem[item.itemNumber]?.missingDrawing}
                    attachedFiles={attachedByItem[item.itemNumber]?.drawings || []}
                    onAttach={onAttachItemFile && isPersisted(item) ? () => onAttachItemFile(item.id, item.itemNumber, 'job-files') : undefined}
                  />

                  <LineItemTagSelect
                    label="Customer Property"
                    required={!fieldsLocked}
                    readOnly={fieldsLocked}
                    value={item.customerProperty || ''}
                    options={customerPropertyTags.map(o => ({ value: o.value, label: o.label }))}
                    labelOf={customerPropertyLabelOf}
                    naValue="N_A"
                    onChange={(v) => updateLineItem(item.id, 'customerProperty', v)}
                    warning={!!warningByItem[item.itemNumber]?.missingCustomerProperty}
                    attachedFiles={attachedByItem[item.itemNumber]?.customerProperty || []}
                    onAttach={onAttachItemFile && isPersisted(item) ? () => onAttachItemFile(item.id, item.itemNumber, 'customer-property-files') : undefined}
                  />
                  </div>

                  {jobCardId && (onStartTimer || onStopTimer) && (
                    <div className="line-item-actions">
                      <LineItemTimerButton
                        itemNumber={item.itemNumber}
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
                      onAdd={canManage && handleAddTimeEntry ? () => handleAddTimeEntry(item.itemNumber) : undefined}
                      onEdit={canManage ? handleEditTimeEntry : undefined}
                      onDelete={canManage ? handleDeleteTimeEntry : undefined}
                      onStop={handleStopEntryWithForm}
                    />
                  )}
                </div>
                {!fieldsLocked && lineItems.length > 1 && (
                  <button type="button" className="line-item-remove" onClick={() => removeLineItem(item.id)} title="Remove item">
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
