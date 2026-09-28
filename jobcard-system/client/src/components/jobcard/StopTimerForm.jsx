import { useState, useEffect, useRef, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { X, Minus, Plus, RotateCw } from 'lucide-react';
import { api } from '../../services/api';
import { capitalizeFirst, formatTime } from '../../utils/formatters';
import { roundTo } from '../../../../server/src/shared/round';
import ToggleTiles from '../common/ToggleTiles';
import FieldError from '../common/FieldError';
import { useFieldErrors, fieldErrorsFromRefusal, scrollFieldIntoView } from '../../hooks/useFieldErrors';
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

// A Critical-inspection refusal names each missing answer by the same field name
// this form's checks already use.
const INSPECTION_BOXES = Object.fromEntries(INSPECTION_ITEMS.map(({ field }) => [field, field]));

const toInt = (v) => Math.max(0, parseInt(v, 10) || 0);

const formatDuration = (secs) => {
  if (!Number.isFinite(secs) || secs < 0) return null;
  if (secs < 60) return `${secs}s`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const clockTime = (iso) => formatTime(iso, { hour: 'numeric', minute: '2-digit' }) || null;

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
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
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
  itemId,
  stoppedEntry,
  entryForm,
  onFieldChange,
  onMachineToggle,
  onSubmit,
  onCancel,
  loading
}) {
  const [item, setItem] = useState(null);
  // The part's position in this job's own ordered list — never its stored
  // item_number, which is only a sort order the server owns and may have gaps.
  const [displayNumber, setDisplayNumber] = useState(null);
  const [machines, setMachines] = useState([]);
  const [machineFilter, setMachineFilter] = useState('');
  const [isCritical, setIsCritical] = useState(false);
  // The job details load (which decides Critical) and the machines load are
  // independent: a machines failure must never be read as "not Critical", so each
  // gets its own loading/error flags instead of one combined flag standing in for both.
  const [jobLoading, setJobLoading] = useState(false);
  const [jobError, setJobError] = useState(false);
  const [machinesError, setMachinesError] = useState(false);
  const formRef = useRef(null);
  const firstInputRef = useRef(null);
  const modalId = useId();
  // A retry, or a fresh open, can outrun an in-flight load — a request counter lets
  // a stale reply ignore itself once a newer request has been made (same pattern as
  // JobCardList's loadJobcards), instead of racing to overwrite the current state.
  const jobLoadRequestIdRef = useRef(0);
  const machinesLoadRequestIdRef = useRef(0);
  // Marks on unanswered inspection checks, raised only by the server's refusal
  // (the job turned Critical after this form opened). Each mark clears itself the
  // moment its check is answered.
  const { setFieldErrors, clearAll: clearFieldErrors, errorFor } = useFieldErrors((name) => entryForm[name]);
  const firstMarkedCheck = INSPECTION_ITEMS.find(({ field }) => errorFor(field))?.field || null;

  // Join the shared modal stack while open. This form opens on top of the job
  // card (itself a dialog with its own Tab trap); registering here makes this the
  // top-most layer, so the job card behind stops grabbing Tab and focus stays in
  // this form. Without it, Tab between these fields gets yanked back to the card.
  useEffect(() => {
    if (!isOpen) return undefined;
    pushModal(modalId);
    return () => removeModal(modalId);
  }, [isOpen, modalId]);

  // The job's own details — just the item and its part position now. Whether the
  // checklist is needed no longer comes from here (see the effect below); a
  // failure here only ever blocks Submit via jobError, since there's nothing left
  // it could silently get wrong about the sign-off.
  const loadJob = useCallback(() => {
    if (!jobCard?.id) return;
    const requestId = ++jobLoadRequestIdRef.current;
    setJobLoading(true);
    setJobError(false);
    // Clear the previous job's part so a failed load never shows it on this one.
    setItem(null);
    setDisplayNumber(null);
    api.getJobcard(jobCard.id).then((jobcardRes) => {
      if (requestId !== jobLoadRequestIdRef.current) return;
      const items = jobcardRes?.items || [];
      const idx = itemId != null ? items.findIndex(i => i.id === itemId) : -1;
      const found = idx !== -1 ? items[idx] : null;
      setItem(found);
      // The server states each part's position directly — never recounted here.
      setDisplayNumber(found ? (found.position != null ? found.position : idx + 1) : null);
    }).catch(() => {
      if (requestId !== jobLoadRequestIdRef.current) return;
      setJobError(true);
    }).finally(() => {
      if (requestId !== jobLoadRequestIdRef.current) return;
      setJobLoading(false);
    });
  }, [jobCard?.id, itemId]);

  // The machine list is independent of the Critical decision — a failure here only
  // ever costs the machine picker, so it gets its own short message and never
  // touches Submit or the sign-off.
  const loadMachines = useCallback(() => {
    if (!jobCard?.id) return;
    const requestId = ++machinesLoadRequestIdRef.current;
    setMachinesError(false);
    api.getMachines().then((machinesRes) => {
      if (requestId !== machinesLoadRequestIdRef.current) return;
      setMachines((machinesRes || []).filter(m => m.active !== 0 && m.active !== false));
    }).catch(() => {
      if (requestId !== machinesLoadRequestIdRef.current) return;
      setMachines([]);
      setMachinesError(true);
    });
  }, [jobCard?.id]);

  useEffect(() => {
    if (!isOpen || !jobCard?.id) return;
    setMachineFilter('');
    clearFieldErrors();
    // The run this form is about was JUST finished by this very stop, and it
    // already carries whether it needs the sign-off — decided once, at that same
    // moment (see docs/notes/files-and-qa.md's Critical sign-off note). Read that,
    // not the job's live level: the level can change afterwards and must never
    // re-open a decision already recorded against this run.
    setIsCritical(stoppedEntry?.signOffRequired === true);
    loadJob();
    loadMachines();
  }, [isOpen, jobCard?.id, itemId, stoppedEntry, loadJob, loadMachines, clearFieldErrors]);

  // Bring the first marked check into view once it is on screen — the checklist
  // may only just have appeared, below the fold, when the refusal switched it on.
  useEffect(() => {
    if (firstMarkedCheck) scrollFieldIntoView(firstMarkedCheck);
  }, [firstMarkedCheck]);

  useEffect(() => {
    if (isOpen && !jobLoading && firstInputRef.current) {
      firstInputRef.current.focus();
    }
  }, [isOpen, jobLoading]);

  const handleKeyDown = useCallback((e) => {
    // Only the top-most dialog reacts to global keys (a confirmation layered over
    // this form should win), matching how the other dialogs behave.
    if (!isTopModal(modalId)) return;
    if (e.key === 'Escape') {
      // Deliberately swallowed, not forwarded: the run has already stopped and this
      // form holds the machine, quantities and checks about to be recorded against
      // it. Escape here would either close the job card behind (losing all of it) or
      // put the timer back on the clock without the person meaning to, so the way
      // out is the form's own buttons.
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
  // A failed (or still-loading) job load means the part's own details (its
  // description, target quantity) aren't known yet, so Submit stays disabled no
  // matter what else is filled in — the sign-off decision itself no longer waits
  // on this load (see the effect above).
  const jobReady = !jobLoading && !jobError;
  const canSubmit = jobReady && hasDescription && inspectionComplete;

  // What the worker just logged, so they trust what's being recorded.
  const startIso = stoppedEntry?.startTime;
  const endIso = stoppedEntry?.endTime;
  const durationSecs = startIso
    ? Math.floor(((endIso ? new Date(endIso).getTime() : Date.now()) - new Date(startIso).getTime()) / 1000)
    : null;
  const durationText = formatDuration(durationSecs);
  const startClock = startIso ? clockTime(startIso) : null;
  const endClock = endIso ? clockTime(endIso) : null;

  // Live scrap rate: scrap ÷ every piece made (good + scrap) — the same formula the
  // part's Progress card and the statistics page use, so the number the worker sees
  // here is the number they see on the card a moment later. Shown once any piece exists.
  const goodCount = toInt(entryForm.qty);
  const scrapTotal = toInt(entryForm.scrapBinQty) + toInt(entryForm.scrapRecycleQty);
  const totalMade = goodCount + scrapTotal;
  const scrapRate = totalMade > 0 ? roundTo((scrapTotal / totalMade) * 100, 0) : null;

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
    displayNumber != null ? `Part ${displayNumber}` : null,
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

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit || loading) return;
    const result = await onSubmit();
    // The server judges Critical at save time. If the job was made Critical after
    // this form loaded it, show the checklist now and mark what still needs an
    // answer, so the worker can finish here instead of retrying blind.
    if (result?.inspectionRefusal) {
      setIsCritical(true);
      const { marks } = fieldErrorsFromRefusal(result.inspectionRefusal, INSPECTION_BOXES);
      if (marks) setFieldErrors(marks);
    }
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

        {jobLoading ? (
          <div className="stop-timer-loading">Loading...</div>
        ) : (
          <form onSubmit={handleFormSubmit} className="stop-timer-form-body">
            <div className="stop-timer-fields">
              {jobError && (
                <div className="stf-load-error" role="alert">
                  <p>Couldn't load this job's checks.</p>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={loadJob}>
                    <RotateCw size={16} />
                    Retry
                  </button>
                </div>
              )}
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

              {(machines.length > 0 || machinesError) && (
                <section className="stf-section">
                  <div className="stf-section-head">
                    <span className="stf-label">Machines used</span>
                    {selectedMachines.length > 0 && (
                      <span className="stf-target">{selectedMachines.length} selected</span>
                    )}
                  </div>
                  {machinesError ? (
                    <p className="stf-machine-empty">Couldn't load machines.</p>
                  ) : (
                    <>
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
                    </>
                  )}
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

              {isCritical && !jobError && (
                <section className="stf-signoff">
                  <div className="stf-signoff-head">
                    <span className="stf-signoff-title">Inspection sign-off</span>
                    <span className="required">all required</span>
                  </div>
                  {INSPECTION_ITEMS.map(({ field, label, comments }) => (
                    <div key={field} className="stf-check-row">
                      <span className="stf-check-label">{label}</span>
                      <div
                        className="stf-yesno"
                        role="group"
                        aria-label={label}
                        aria-describedby={errorFor(field) ? `${modalId}-${field}-error` : undefined}
                      >
                        <button
                          type="button"
                          name={field}
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
                      <FieldError id={`${modalId}-${field}-error`} message={errorFor(field)} />
                      {comments && (
                        <input
                          type="text"
                          className="stf-check-comments"
                          placeholder="Comments (optional)"
                          value={entryForm.equipmentChecksComments || ''}
                          onChange={(e) => onFieldChange('equipmentChecksComments', e.target.value)}
                          onBlur={(e) => {
                            const formatted = capitalizeFirst(e.target.value);
                            if (formatted !== e.target.value) onFieldChange('equipmentChecksComments', formatted);
                          }}
                        />
                      )}
                    </div>
                  ))}
                </section>
              )}
            </div>

            <div className="stop-timer-actions">
              {!canSubmit && !loading && jobReady && (
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
