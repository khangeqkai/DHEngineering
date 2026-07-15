import { useState, useEffect, useRef, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { X, Minus, Plus } from 'lucide-react';
import { api } from '../../services/api';
import { capitalizeFirst } from '../../utils/formatters';
import ToggleTiles from '../common/ToggleTiles';
import { pushModal, removeModal, isTopModal } from '../common/modalStack';
import './StopTimerForm.css';

// One-tap notes for the most common things a worker reports. Free typing still
// works; tapping a chip just fills the note for them.
const NOTE_PRESETS = ['Finished run', 'Setup', 'Tool change', 'Re-work', 'Paused — end of shift'];

// The four Yes/No inspection checks shown on Critical jobs. Equipment Checks also
// carries an optional comments box.
const INSPECTION_ITEMS = [
  { field: 'firstOffInspection', label: 'First-off inspection' },
  { field: 'inProcessValidation', label: 'In-process validation' },
  { field: 'measuringEquipmentVerification', label: 'Measuring equipment verified' },
  { field: 'equipmentChecks', label: 'Equipment checks', comments: true }
];

const toInt = (v) => Math.max(0, parseInt(v, 10) || 0);

const formatDuration = (secs) => {
  if (!Number.isFinite(secs) || secs < 0) return null;
  if (secs < 60) return `${secs}s`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const clockTime = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
};

// Small −/+ counter. The number itself is typeable (keyboard-first); the buttons
// are a mouse helper and are skipped by Tab so keyboard flows field-to-field.
function Counter({ value, onChange, inputRef, hero, ariaLabel }) {
  const current = toInt(value);
  const step = (delta) => onChange(String(Math.max(0, current + delta)));
  return (
    <div className={`stf-counter${hero ? ' stf-counter--hero' : ''}`}>
      <button
        type="button"
        className="stf-step"
        tabIndex={-1}
        aria-label={`Decrease ${ariaLabel}`}
        onClick={() => step(-1)}
      >
        <Minus size={hero ? 20 : 16} />
      </button>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        className="stf-count-input"
        placeholder="0"
        aria-label={ariaLabel}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => e.target.select()}
      />
      <button
        type="button"
        className="stf-step"
        tabIndex={-1}
        aria-label={`Increase ${ariaLabel}`}
        onClick={() => step(1)}
      >
        <Plus size={hero ? 20 : 16} />
      </button>
    </div>
  );
}

export default function StopTimerForm({
  isOpen,
  jobCard,
  itemNumber,
  stoppedEntry,
  entryForm,
  onFieldChange,
  onMachineToggle,
  onSubmit,
  onCancel,
  loading
}) {
  const [item, setItem] = useState(null);
  const [machines, setMachines] = useState([]);
  const [machineFilter, setMachineFilter] = useState('');
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
    setMachineFilter('');
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
      const focusable = formRef.current.querySelectorAll(
        'input, textarea, button:not(:disabled):not([tabindex="-1"])'
      );
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

  const hasDescription = entryForm.description && String(entryForm.description).trim() !== '';
  const inspectionComplete = !isCritical ||
    INSPECTION_ITEMS.every(i => entryForm[i.field] === true || entryForm[i.field] === false);
  const canSubmit = hasDescription && inspectionComplete;

  // What the worker just logged, so they trust what's being recorded.
  const startIso = stoppedEntry?.startTime;
  const endIso = stoppedEntry?.endTime;
  const durationSecs = startIso
    ? Math.floor(((endIso ? new Date(endIso).getTime() : Date.now()) - new Date(startIso).getTime()) / 1000)
    : null;
  const durationText = formatDuration(durationSecs);
  const startClock = startIso ? clockTime(startIso) : null;
  const endClock = endIso ? clockTime(endIso) : null;

  // Live scrap rate (scrap ÷ good), shown once any good pieces are entered.
  const goodCount = toInt(entryForm.qty);
  const scrapTotal = toInt(entryForm.scrapBinQty) + toInt(entryForm.scrapRecycleQty);
  const scrapRate = goodCount > 0 ? Math.round((scrapTotal / goodCount) * 100) : null;

  // With a big equipment list, a flat wall of tiles is unusable — once there are
  // many machines we add a filter box and a scrollable area. Picked machines are
  // always shown (pinned on top) so they never scroll out of reach while filtering.
  const selectedMachines = entryForm.machineNumbers || [];
  const manyMachines = machines.length > 12;
  const mq = machineFilter.trim().toLowerCase();
  const machineOptions = !manyMachines
    ? machines
    : [...machines.filter(m =>
        selectedMachines.includes(m.machineNumber) ||
        (!mq ||
          String(m.machineNumber).toLowerCase().includes(mq) ||
          String(m.name || '').toLowerCase().includes(mq))
      )].sort((a, b) =>
        (selectedMachines.includes(a.machineNumber) ? 0 : 1) -
        (selectedMachines.includes(b.machineNumber) ? 0 : 1)
      );

  const targetQty = item && parseFloat(item.qty) > 0 ? item.qty : null;
  const partTitle = [
    itemNumber != null ? `Part #${itemNumber}` : null,
    item?.description
  ].filter(Boolean).join(' — ');

  const handleDescriptionBlur = (e) => {
    const formatted = capitalizeFirst(e.target.value);
    if (formatted !== e.target.value) {
      onFieldChange('description', formatted);
    }
  };

  const toggleChip = (text) => {
    onFieldChange('description', String(entryForm.description || '').trim() === text ? '' : text);
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
            <div className="stf-head-titles">
              <span className="stf-eyebrow">Timer stopped</span>
              <h3 id="stop-timer-title">
                {jobCard?.jobNumber || 'This job'}
                {partTitle && <><span className="stf-head-sep">·</span>{partTitle}</>}
              </h3>
            </div>
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
          <p id="stop-timer-desc" className="stf-logged">
            {durationText
              ? <>Logged <strong>{durationText}</strong>{startClock && endClock && <span className="stf-logged-clock"> · {startClock} → {endClock}</span>}</>
              : 'Tell us what you worked on'}
          </p>
        </div>

        {dataLoading ? (
          <div className="stop-timer-loading">Loading...</div>
        ) : (
          <form onSubmit={handleFormSubmit} className="stop-timer-form-body">
            <div className="stop-timer-fields">
              <section className="stf-section">
                <div className="stf-section-head">
                  <span className="stf-label">Good pieces</span>
                  {targetQty && <span className="stf-target">of {targetQty} needed</span>}
                </div>
                <Counter
                  value={entryForm.qty}
                  onChange={(v) => onFieldChange('qty', v)}
                  inputRef={firstInputRef}
                  hero
                  ariaLabel="Good pieces completed"
                />
              </section>

              <section className="stf-section">
                <div className="stf-section-head">
                  <span className="stf-label">Scrap</span>
                  {scrapRate != null && (
                    <span className="stf-scrap-rate">scrap rate {scrapRate}%</span>
                  )}
                </div>
                <div className="stf-scrap-row">
                  <div className="stf-scrap-cell stf-scrap-cell--bin">
                    <span className="stf-scrap-cap">Bin</span>
                    <Counter
                      value={entryForm.scrapBinQty}
                      onChange={(v) => onFieldChange('scrapBinQty', v)}
                      ariaLabel="Scrap pieces binned"
                    />
                  </div>
                  <div className="stf-scrap-cell stf-scrap-cell--recycle">
                    <span className="stf-scrap-cap">Recycle</span>
                    <Counter
                      value={entryForm.scrapRecycleQty}
                      onChange={(v) => onFieldChange('scrapRecycleQty', v)}
                      ariaLabel="Scrap pieces recycled"
                    />
                  </div>
                </div>
              </section>

              {machines.length > 0 && (
                <section className="stf-section">
                  <div className="stf-section-head">
                    <span className="stf-label">Machines used</span>
                    {selectedMachines.length > 0 && (
                      <span className="stf-target">{selectedMachines.length} selected</span>
                    )}
                  </div>
                  {manyMachines && (
                    <input
                      type="text"
                      className="stf-note-input stf-machine-filter"
                      placeholder="Filter machines…"
                      value={machineFilter}
                      onChange={(e) => setMachineFilter(e.target.value)}
                    />
                  )}
                  <div className={manyMachines ? 'stf-machine-scroll' : undefined}>
                    <ToggleTiles
                      ariaLabel="Machines used"
                      options={machineOptions.map(m => ({
                        value: m.machineNumber,
                        label: String(m.machineNumber),
                        sublabel: m.name || undefined
                      }))}
                      selectedValues={selectedMachines}
                      onToggle={onMachineToggle}
                    />
                    {manyMachines && machineOptions.length === 0 && (
                      <p className="stf-machine-empty">No machines match “{machineFilter}”.</p>
                    )}
                  </div>
                </section>
              )}

              <section className="stf-section">
                <div className="stf-section-head">
                  <span className="stf-label">Description</span>
                  <span className="required">required</span>
                </div>
                <div className="stf-chips">
                  {NOTE_PRESETS.map((text) => (
                    <button
                      key={text}
                      type="button"
                      className={`stf-chip${String(entryForm.description || '').trim() === text ? ' is-active' : ''}`}
                      onClick={() => toggleChip(text)}
                    >
                      {text}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  className="stf-note-input stf-desc-input"
                  placeholder="What did you work on?"
                  value={entryForm.description || ''}
                  onChange={(e) => onFieldChange('description', e.target.value)}
                  onBlur={handleDescriptionBlur}
                />
              </section>

              {isCritical && (
                <section className="stf-signoff">
                  <div className="stf-signoff-head">
                    <span className="stf-signoff-title">Inspection sign-off</span>
                    <span className="required">all required</span>
                  </div>
                  {INSPECTION_ITEMS.map(({ field, label, comments }) => (
                    <div key={field} className="stf-check-row">
                      <span className="stf-check-label">{label}</span>
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
                </section>
              )}
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
                {loading ? 'Saving…' : 'Submit'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
