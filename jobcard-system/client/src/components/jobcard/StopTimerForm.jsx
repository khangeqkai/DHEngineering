import { useState, useEffect, useRef, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { api } from '../../services/api';
import { capitalizeFirst } from '../../utils/formatters';
import ToggleTiles from '../common/ToggleTiles';
import { pushModal, removeModal, isTopModal } from '../common/modalStack';
import './StopTimerForm.css';

export default function StopTimerForm({
  isOpen,
  jobCard,
  itemNumber,
  entryForm,
  onFieldChange,
  onMachineToggle,
  onSubmit,
  onCancel,
  loading
}) {
  const [item, setItem] = useState(null);
  const [machines, setMachines] = useState([]);
  const [isCritical, setIsCritical] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const formRef = useRef(null);
  const firstInputRef = useRef(null);
  const modalId = useId();

  // Join the shared modal stack while open. This form opens on top of the job
  // card (itself a dialog with its own Tab trap); registering here makes this the
  // top-most layer, so the job card behind stops grabbing Tab and focus stays in
  // this form. Without it, Tab between these fields gets yanked back to the card.
  useEffect(() => {
    if (!isOpen) return undefined;
    pushModal(modalId);
    return () => removeModal(modalId);
  }, [isOpen, modalId]);

  useEffect(() => {
    if (!isOpen || !jobCard?.id) return;
    setDataLoading(true);
    Promise.all([
      api.getJobcard(jobCard.id),
      api.getMachines()
    ]).then(([jobcardRes, machinesRes]) => {
      const items = jobcardRes?.items || [];
      const target = itemNumber != null ? Number(itemNumber) : null;
      const matched = target != null ? items.find(i => i.itemNumber === target) : null;
      setItem(matched || null);
      // Only Critical jobs get the extra inspection checklist.
      setIsCritical(String(jobcardRes?.qualityLevel || '').toUpperCase() === 'CRITICAL');
      setMachines((machinesRes || []).filter(m => m.active !== 0 && m.active !== false));
    }).catch(() => {
      setItem(null);
      setIsCritical(false);
      setMachines([]);
    }).finally(() => {
      setDataLoading(false);
    });
  }, [isOpen, jobCard?.id, itemNumber]);

  useEffect(() => {
    if (isOpen && !dataLoading && firstInputRef.current) {
      firstInputRef.current.focus();
    }
  }, [isOpen, dataLoading]);

  const handleKeyDown = useCallback((e) => {
    // Only the top-most dialog reacts to global keys (a confirmation layered over
    // this form should win), matching how the other dialogs behave.
    if (!isTopModal(modalId)) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.key === 'Tab' && formRef.current) {
      const focusable = formRef.current.querySelectorAll('input, textarea, button:not(:disabled)');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, [modalId]);

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  // The four Yes/No inspection checks shown on Critical jobs. Equipment Checks also
  // carries an optional comments box.
  const INSPECTION_ITEMS = [
    { field: 'firstOffInspection', label: 'First-Off Inspection' },
    { field: 'inProcessValidation', label: 'In-Process Validation' },
    { field: 'measuringEquipmentVerification', label: 'Measuring Equipment Verification' },
    { field: 'equipmentChecks', label: 'Equipment Checks', comments: true }
  ];

  const hasDescription = entryForm.description && String(entryForm.description).trim() !== '';
  const inspectionComplete = !isCritical ||
    INSPECTION_ITEMS.every(i => entryForm[i.field] === true || entryForm[i.field] === false);
  const canSubmit = hasDescription && inspectionComplete;

  const handleDescriptionBlur = (e) => {
    const formatted = capitalizeFirst(e.target.value);
    if (formatted !== e.target.value) {
      onFieldChange('description', formatted);
    }
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (canSubmit && !loading) onSubmit();
  };

  return createPortal(
    <div className="stop-timer-overlay" role="alertdialog" aria-modal="true" aria-labelledby="stop-timer-title" aria-describedby="stop-timer-desc">
      <div className="stop-timer-form" ref={formRef}>
        <div className="stop-timer-header">
          <div className="stop-timer-header-top">
            <h3 id="stop-timer-title">
              Timer Stopped — {jobCard?.jobNumber}
              {itemNumber != null && <span className="stop-timer-item-tag"> · Item #{itemNumber}</span>}
            </h3>
            <button
              type="button"
              className="stop-timer-close-btn"
              onClick={onCancel}
              disabled={loading}
              aria-label="Resume timer"
              title="Resume timer"
            >
              <X size={18} />
            </button>
          </div>
          <p id="stop-timer-desc">Tell us what you worked on</p>
        </div>

        {dataLoading ? (
          <div className="stop-timer-loading">Loading...</div>
        ) : (
          <form onSubmit={handleFormSubmit} className="stop-timer-form-body">
            <div className="stop-timer-fields">
              {item && (
                <div className="stf-item-summary">
                  <span className="stf-item-num">#{item.itemNumber}</span>
                  <span className="stf-item-desc">{item.description || 'No description'}</span>
                </div>
              )}
              <div className="stf-qty-row">
                <div className="stf-item-field stf-qty-field">
                  <label>Qty Completed</label>
                  <input
                    ref={firstInputRef}
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={entryForm.qty || ''}
                    onChange={(e) => onFieldChange('qty', e.target.value)}
                    className="stf-qty-input"
                  />
                  {/* Always render the hint line so both boxes stay the same
                      height and line up along the bottom, even with no target qty. */}
                  <span className="stf-qty-hint">
                    {item && parseFloat(item.qty) > 0 ? `of ${item.qty} needed` : ' '}
                  </span>
                </div>

                <div className="stf-item-field stf-qty-field">
                  <label>Scrap — Bin</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={entryForm.scrapBinQty || ''}
                    onChange={(e) => onFieldChange('scrapBinQty', e.target.value)}
                    className="stf-qty-input"
                  />
                  <span className="stf-qty-hint">pieces binned</span>
                </div>

                <div className="stf-item-field stf-qty-field">
                  <label>Scrap — Recycle</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={entryForm.scrapRecycleQty || ''}
                    onChange={(e) => onFieldChange('scrapRecycleQty', e.target.value)}
                    className="stf-qty-input"
                  />
                  <span className="stf-qty-hint">pieces recycled</span>
                </div>
              </div>

              {isCritical && (
                <div className="stf-inspection">
                  <div className="stf-inspection-head">
                    <span className="stf-inspection-title">Critical Job — Inspection Checks</span>
                    <span className="required">all required</span>
                  </div>
                  {INSPECTION_ITEMS.map(({ field, label, comments }) => (
                    <div key={field} className="stf-check-row">
                      <span className="stf-check-label">{label} <span className="required">*</span></span>
                      <div className="stf-yesno" role="group" aria-label={label}>
                        <button
                          type="button"
                          className={`stf-yesno-btn${entryForm[field] === true ? ' is-yes' : ''}`}
                          aria-pressed={entryForm[field] === true}
                          onClick={() => onFieldChange(field, true)}
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          className={`stf-yesno-btn${entryForm[field] === false ? ' is-no' : ''}`}
                          aria-pressed={entryForm[field] === false}
                          onClick={() => onFieldChange(field, false)}
                        >
                          No
                        </button>
                      </div>
                      {comments && (
                        <input
                          type="text"
                          className="stf-check-comments"
                          placeholder="Comments (optional)"
                          value={entryForm.equipmentChecksComments || ''}
                          onChange={(e) => onFieldChange('equipmentChecksComments', e.target.value)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {machines.length > 0 && (
                <div className="stf-item-field">
                  <label>Machines Used</label>
                  <ToggleTiles
                    ariaLabel="Machines used"
                    options={machines.map(m => ({
                      value: m.machineNumber,
                      label: String(m.machineNumber),
                      sublabel: m.name || undefined
                    }))}
                    selectedValues={entryForm.machineNumbers || []}
                    onToggle={onMachineToggle}
                  />
                </div>
              )}

              <div className="stf-item-field">
                <label>Description <span className="required">*</span></label>
                <input
                  type="text"
                  placeholder="What did you work on?"
                  value={entryForm.description || ''}
                  onChange={(e) => onFieldChange('description', e.target.value)}
                  onBlur={handleDescriptionBlur}
                />
              </div>
            </div>

            <div className="stop-timer-actions">
              {!canSubmit && !loading && (
                <span className="stop-timer-hint">
                  {!hasDescription
                    ? 'Add a description of what you worked on to finish.'
                    : 'Answer all the inspection checks to finish.'}
                </span>
              )}
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!canSubmit || loading}
              >
                {loading ? 'Saving...' : 'Submit'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
