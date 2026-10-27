import { useState } from 'react';
import { Info, Lock, RotateCcw } from 'lucide-react';
import CostingBreakdown from './CostingBreakdown';
import FieldError from '../../common/FieldError';
import { formatMoney } from '../../../utils/formatters';

// Format a multiplier for the read-only figures at at least two decimals, so the whole
// multiplier column lines up spreadsheet-style: 1 → "1.00", 2.5 → "2.50", 1.75 → "1.75".
// Padding only ever adds digits — a finer figure shows in full (1.125 → "1.125"), since
// that exact figure is what gets charged.
const mult = (n) => {
  const v = Number(n) || 0;
  const padded = v.toFixed(2);
  return Number(padded) === v ? padded : String(v);
};

// How each manual money field's "was X" hint reads — money fields in dollars, the
// margins as a percentage, the special-labour hours as a plain figure.
const REVERT_FORMAT = {
  labourSpecialHours: (n) => `${Number(n) || 0} hrs`,
  labourSpecialRate: formatMoney,
  materialsCost: formatMoney,
  materialsProfitPercent: (n) => `${Number(n) || 0}%`,
  subcontractorCost: formatMoney,
  subcontractorProfitPercent: (n) => `${Number(n) || 0}%`
};

// What the line beside the title says while the screen saves itself. There is no
// Save button: an edit saves on leaving the box or on Enter. 'invalid' overrides every
// other state — see costingSaveState in useCosting.js — because there's nothing to
// report about the rest of the sheet's save progress while one figure on it isn't even
// a valid number yet.
const SAVE_STATUS = {
  pending: { text: 'Unsaved…', className: 'costing-save-status--pending' },
  saving: { text: 'Saving…', className: 'costing-save-status--saving' },
  saved: { text: 'Saved', className: 'costing-save-status--saved' },
  error: { text: 'Not saved', className: 'costing-save-status--error' },
  invalid: { text: 'Not saved — fix the red box', className: 'costing-save-status--invalid' }
};

export default function CostingTab({
  costingForm,
  openedAt = null,
  handleCostingChange,
  resetTierHours,
  resetTierMultiplier,
  useDefaultRate,
  calculateCostingTotals,
  saveState = 'idle',
  onFlushCosting,
  onBoxBlur,
  onRevertField,
  costingFieldError = () => null,
  costingFieldProps = (name) => ({ id: name }),
  costingErrorProps = () => ({}),
  loaded = true,
  loadFailed = false,
  onRetryLoad,
  // An invoiced (closed) job: every box and reset link is disabled, but the view-only
  // buttons — the "what this job used" toggle, and Try again on a failed load — are
  // left outside the lock so they still work.
  locked = false,
  lineItems,
  timeEntries,
  machines = []
}) {
  // The info panel under the header: what the job has actually used, part by part.
  // Read-only, closed by default, and folded away again by the same button.
  const [showBreakdown, setShowBreakdown] = useState(false);

  // Until the job's stored pricing arrives, show a plain message rather than a sheet of
  // zeros. A zero sheet reads as real figures, and this screen saves itself — one
  // keystroke on it would write those zeros over what the job is actually worth.
  if (!loaded) {
    return (
      <div className="modal-form-grid">
        <div className="costing-sheet">
          <div className="costing-sheet-header">
            <h3 className="costing-sheet-title">Costing</h3>
          </div>
          <div className="costing-placeholder">
            {loadFailed ? (
              <>
                <p>This job's costing couldn't be loaded, so it can't be changed right now.</p>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => onRetryLoad?.()}>
                  Try again
                </button>
              </>
            ) : (
              <p>Loading costing…</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const totals = calculateCostingTotals();
  const baseRate = Number(costingForm.labourRate) || 0;

  // Select a field's contents when it gains focus, so clicking in and typing REPLACES
  // the existing number instead of inserting in front of it (which turned 100 into
  // 120100). Applies to every money/hours box below.
  const selectOnFocus = (e) => e.target.select();

  // The "was X" hints on the manual cost lines read in this one voice. Both the tier rows
  // and the cost rows put their way-back control in the last ("typed over") column.
  const undoItem = (key, text, label, onClick) => (
    <span className="ledger-undo-item" key={key}>
      {text}
      <button type="button" className="ledger-undo-btn" aria-label={label} title={label} onClick={onClick}>
        <RotateCcw size={14} />
      </button>
    </span>
  );

  // The note that sits under each manual cost line's name. Called as a plain function
  // (not a component) so React keeps the input stable and typing never loses focus — same
  // reason as the tier rows below. Its capitalise-on-leave tidy runs in commitBox
  // (useCosting.js) itself, the same moment it commits — no onBlur of its own, so it goes
  // through the sheet's one bubbling blur handler like every other box.
  const costNote = (name, placeholder) => (
    <input
      id={name}
      type="text"
      className="ledger-note-input"
      name={name}
      value={costingForm[name] || ''}
      onChange={handleCostingChange}
      placeholder={placeholder}
      aria-label="What this covers"
      maxLength={300}
    />
  );

  // The manual money lines (materials, subcontractor, special labour) have no
  // "reset to auto" link the way the tier hours and multipliers do — this is their only
  // way back once a figure has been typed over. `openedAt` is captured once, when the
  // job's pricing is opened, and never moves again as the screen saves itself: comparing
  // against the last save instead would make this vanish about a second after it
  // appeared, since the sheet saves on every edit. So it keeps offering the figure the
  // job was opened with for as long as the job stays open, even past later autosaves.
  const revertControl = (name) => {
    if (!openedAt) return null;
    const current = costingForm[name];
    const opened = openedAt[name];
    if (Number(current) === Number(opened)) return null;
    const was = REVERT_FORMAT[name](opened);
    return undoItem(
      name,
      `was ${was}`,
      `Was ${was} when you opened this job — put it back`,
      () => onRevertField(name, String(opened))
    );
  };

  // One figure box on a cost row: an input with a $, h or % mark, plus its own error.
  // `mark` is { prefix: '$' } or { suffix: 'h' | '%' }.
  const costBox = (name, mark) => {
    const error = costingFieldError(name);
    const input = (
      <input
        type="text"
        inputMode="decimal"
        name={name}
        value={costingForm[name]}
        onChange={handleCostingChange}
        onFocus={selectOnFocus}
        {...costingFieldProps(name)}
      />
    );
    return (
      <div className={`ledger-cell${error ? ' field-error' : ''}`}>
        {mark.prefix ? (
          <div className="ledger-affix ledger-affix--prefix">
            <span className="ledger-affix-mark">{mark.prefix}</span>
            {input}
          </div>
        ) : (
          <div className="ledger-affix ledger-affix--suffix">
            {input}
            <span className="ledger-affix-mark">{mark.suffix}</span>
          </div>
        )}
        <FieldError message={error} {...costingErrorProps(name)} />
      </div>
    );
  };

  // One manual cost row: name + note · first figure · operator · second figure · amount ·
  // the way back for either figure typed over.
  const costRow = ({ title, noteName, placeholder, first, firstMark, op, second, secondMark, total }) => (
    <div className="ledger-row ledger-row--costs">
      <div className="ledger-line-name">
        <span>{title}</span>
        {costNote(noteName, placeholder)}
      </div>
      {costBox(first, firstMark)}
      <span className="ledger-op">{op}</span>
      {costBox(second, secondMark)}
      <span className={`ledger-amount${total === 0 ? ' ledger-amount--zero' : ''}`}>{formatMoney(total)}</span>
      <span className="ledger-undo">{[revertControl(first), revertControl(second)]}</span>
    </div>
  );

  // A field still being typed in (or left typed-in and invalid — a red box KEEPS its
  // draft, see commitBox in useCosting.js) is always a string; a committed figure is
  // always a number. That's reason enough on its own to show it raw rather than
  // reformatted to two decimals — reformatting an invalid "abc" or "-1" to "0.00" the
  // moment the box loses focus would hide exactly the text the red box exists to show.
  const multDisplay = (t) => (typeof costingForm[t.multName] === 'string' ? costingForm[t.multName] : mult(t.multiplier));

  // The four labour tiers, split by WHEN the work happened. The base rate is set
  // once (above the table) and each tier's rate derives from it via its multiplier.
  // A cleared multiplier box ('') means "follow the standard figure" — the same rule
  // the totals use — so the multiplier and rate columns never read ×0.00 while it sits blank.
  const shownMult = (k) => costingForm[k] === '' ? costingForm[`${k}Calculated`] : costingForm[k];
  // The hours are editable on every tier; the two overtime rows also let the admin
  // type a job-specific multiplier over the company setting (multName set = editable).
  const tiers = [
    {
      label: 'Normal hours', multiplier: 1, tierKey: '',
      hoursName: 'labourHours', hoursValue: costingForm.labourHours,
      calculated: costingForm.labourHoursCalculated, overridden: costingForm.labourHoursOverridden,
      total: totals.labourTotal
    },
    {
      label: 'Overtime', multiplier: shownMult('labourOt1Multiplier'), tierKey: 'Ot1',
      multName: 'labourOt1Multiplier', multCalculated: costingForm.labourOt1MultiplierCalculated,
      multOverridden: costingForm.labourOt1MultiplierOverridden,
      hoursName: 'labourOt1Hours', hoursValue: costingForm.labourOt1Hours,
      calculated: costingForm.labourOt1HoursCalculated, overridden: costingForm.labourOt1Overridden,
      total: totals.labourOt1Total
    },
    {
      label: 'Overtime, second step', multiplier: shownMult('labourOt2Multiplier'), tierKey: 'Ot2',
      multName: 'labourOt2Multiplier', multCalculated: costingForm.labourOt2MultiplierCalculated,
      multOverridden: costingForm.labourOt2MultiplierOverridden,
      hoursName: 'labourOt2Hours', hoursValue: costingForm.labourOt2Hours,
      calculated: costingForm.labourOt2HoursCalculated, overridden: costingForm.labourOt2Overridden,
      total: totals.labourOt2Total
    },
    {
      label: 'Public holiday', multiplier: costingForm.labourHolidayMultiplier, tierKey: 'Holiday',
      hoursName: 'labourHolidayHours', hoursValue: costingForm.labourHolidayHours,
      calculated: costingForm.labourHolidayHoursCalculated, overridden: costingForm.labourHolidayOverridden,
      total: totals.labourHolidayTotal
    }
  ];

  const labourSubtotal = totals.labourTotal + totals.labourOt1Total
    + totals.labourOt2Total + totals.labourHolidayTotal;
  const anyOverridden = tiers.some(t => t.overridden || t.multOverridden);
  const otherSubtotal = totals.labourSpecialTotal + totals.materialsTotal + totals.subcontractorTotal;

  // Snap every tier's hours (and the two OT multipliers) back to their auto figures.
  // Resetting something that wasn't overridden is a harmless no-op, so one link covers all.
  const resetAllLabour = () => {
    ['', 'Ot1', 'Ot2', 'Holiday'].forEach(resetTierHours);
    ['Ot1', 'Ot2'].forEach(resetTierMultiplier);
  };


  // One tier row: when-worked · hours (editable) · multiplier · derived rate · amount ·
  // the way back for anything typed over. Called as a plain function (not a component) so
  // React keeps the input elements stable across renders and typing never loses focus.
  const tierRow = (t) => {
    const derivedRate = baseRate * (Number(t.multiplier) || 0);
    const multError = t.multName ? costingFieldError(t.multName) : null;
    const hoursError = costingFieldError(t.hoursName);
    return (
      <div className="ledger-row" key={t.hoursName}>
        <span className="ledger-tier-label">{t.label}</span>
        <div className={`ledger-cell${hoursError ? ' field-error' : ''}`}>
          <input
            type="text"
            inputMode="decimal"
            className={`ledger-input${t.overridden ? ' ledger-input--edited' : ''}`}
            name={t.hoursName}
            value={t.hoursValue}
            onChange={handleCostingChange}
            onFocus={selectOnFocus}
            aria-label={`Hours: ${t.label}`}
            {...costingFieldProps(t.hoursName)}
          />
          <FieldError message={hoursError} {...costingErrorProps(t.hoursName)} />
        </div>
        {t.multName ? (
          // Overtime rows: the multiplier is a job-editable box (typing overrides the
          // company setting for this job only).
          <div className={`ledger-cell${multError ? ' field-error' : ''}`}>
            <span className="ledger-mult">
              <span className="ledger-mult-sign">×</span>
              <input
                type="text"
                inputMode="decimal"
                className={`ledger-input ledger-input--mult${t.multOverridden ? ' ledger-input--edited' : ''}`}
                name={t.multName}
                value={multDisplay(t)}
                onChange={handleCostingChange}
                onFocus={selectOnFocus}
                aria-label={`Multiplier: ${t.label}`}
                {...costingFieldProps(t.multName)}
              />
            </span>
            <FieldError message={multError} {...costingErrorProps(t.multName)} />
          </div>
        ) : (
          // Fixed-multiplier rows (normal, public holiday): plain text, nothing to type.
          <span className="ledger-mult-fixed">×{mult(t.multiplier)}</span>
        )}
        <span className="ledger-rate">{formatMoney(derivedRate)}</span>
        <span className={`ledger-amount${t.total === 0 ? ' ledger-amount--zero' : ''}`}>{formatMoney(t.total)}</span>
        <span className="ledger-undo">
          {t.overridden && undoItem(
            'hours',
            `logged ${Number(t.calculated) || 0} h`,
            `Back to logged time (${Number(t.calculated) || 0} h)`,
            () => resetTierHours(t.tierKey)
          )}
          {t.multOverridden && undoItem(
            'mult',
            `×${mult(t.multCalculated)} standard`,
            `Back to the company multiplier (×${mult(t.multCalculated)})`,
            () => resetTierMultiplier(t.tierKey)
          )}
        </span>
      </div>
    );
  };

  const status = SAVE_STATUS[saveState];

  // Enter in any box on the sheet saves straight away, without leaving the box. The
  // surrounding job form already swallows Enter in a typing box, so nothing else fires
  // off the same keypress (on a button, Enter still presses it). Enter commits exactly the box the cursor is in — the same commitBox that
  // blur below reaches — and leaves the cursor where it was, unlike blur.
  const saveOnEnter = (e) => {
    if (e.key !== 'Enter') return;
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') onBoxBlur?.(e.target.name);
  };

  // Leaving a box (Tab, click-away, Escape-then-close, switching tab) commits it, the
  // same as every other box on the job screen. Blur bubbles in React, so one handler on
  // the sheet covers every box rather than one onBlur prop per box, and no box carries
  // its own onBlur for a second handler to race. Guarded to real boxes: the sheet also holds buttons
  // and links, and leaving one of those is not the end of an edit. onBoxBlur IS commitBox
  // (useCosting.js) — a box that's valid but unchanged commits with nothing sent; one
  // that's invalid stays a draft, marked red, and sends nothing either.
  const saveOnLeavingBox = (e) => {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') onBoxBlur?.(e.target.name);
  };


  return (
    <div className="modal-form-grid">
      <div className="costing-sheet" onKeyDown={saveOnEnter} onBlur={saveOnLeavingBox}>
        <div className="costing-sheet-header">
          <h3 className="costing-sheet-title">Costing</h3>
          <button
            type="button"
            className={`costing-info-btn${showBreakdown ? ' costing-info-btn--on' : ''}`}
            onClick={() => setShowBreakdown(v => !v)}
            aria-expanded={showBreakdown}
            title="What this job used — time per part and machine, material and treatment"
          >
            <Info size={14} />
            What this job used
          </button>
          {status && (
            <span className={`costing-save-status ${status.className}`} role="status" aria-live="polite">
              {status.text}
              {saveState === 'error' && (
                <>
                  {' — '}
                  <button type="button" className="btn-link" onClick={() => onFlushCosting?.()}>try again</button>
                </>
              )}
            </span>
          )}
        </div>

        {locked && (
          <div className="costing-locked">
            <Lock size={14} />
            <span>This job is paid and archived. Unarchive it to change the pricing.</span>
          </div>
        )}

        {showBreakdown && (
          <CostingBreakdown lineItems={lineItems} timeEntries={timeEntries} machines={machines} />
        )}

        {/* A closed job's editable sheet is read-only — a plain <fieldset disabled>
            (display: contents, so it adds no box of its own) rather than threading a
            lock through every box. Nothing on it can be dirty or invalid on a closed
            job, so there's nothing for the tab-switch/close/invoice guards to catch. */}
        <fieldset className="jc-lock-fieldset" disabled={locked}>
        {/* Labour — base rate in the heading, tiers as a rate ladder */}
        <section className="costing-section">
          <div className="costing-section-head">
            <span className="costing-section-title">Labour</span>
            <div className="costing-rate">
              <label htmlFor="labourRate" className="labour-rate-label">Base rate</label>
              <div className={`ledger-affix ledger-affix--prefix costing-rate-field${costingFieldError('labourRate') ? ' field-error' : ''}`}>
                <span className="ledger-affix-mark">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  name="labourRate"
                  value={costingForm.labourRate}
                  onChange={handleCostingChange}
                  onFocus={selectOnFocus}
                  {...costingFieldProps('labourRate')}
                />
              </div>
              <span className="costing-rate-unit">/ hr</span>
              {Number(costingForm.labourDefaultRate) > 0
                && Number(costingForm.labourDefaultRate) !== baseRate && (
                <button type="button" className="btn-link" onClick={useDefaultRate}>
                  Use company default · {formatMoney(costingForm.labourDefaultRate)}
                </button>
              )}
              <FieldError message={costingFieldError('labourRate')} {...costingErrorProps('labourRate')} />
            </div>
            <span className="costing-section-subtotal">
              <span className="costing-subtotal-label">Subtotal</span>
              <span className="costing-subtotal-value">{formatMoney(labourSubtotal)}</span>
            </span>
          </div>

          <div className="ledger-head" aria-hidden="true">
            <span>When worked</span>
            <span>Hours</span>
            <span>× base</span>
            <span>Rate / hr</span>
            <span>Amount</span>
            <span>Typed over</span>
          </div>
          {tiers.map(tierRow)}
          <p className="ledger-foot">
            Hours come from logged time. An amber box was typed over by hand.
            {anyOverridden && (
              <>
                {' '}
                <button type="button" className="btn-link" onClick={resetAllLabour}>Reset all to logged</button>
              </>
            )}
          </p>
        </section>

        {/* Manual cost lines — name and note · figure × figure · amount */}
        <section className="costing-section">
          <div className="costing-section-head">
            <span className="costing-section-title">Other costs</span>
            <span className="costing-section-subtotal">
              <span className="costing-subtotal-label">Subtotal</span>
              <span className="costing-subtotal-value">{formatMoney(otherSubtotal)}</span>
            </span>
          </div>

          <div className="ledger-head ledger-head--costs" aria-hidden="true">
            <span>Line · what it covers</span>
            <span>Cost or hours</span>
            <span />
            <span>Margin or rate</span>
            <span>Amount</span>
            <span>Typed over</span>
          </div>
          {costRow({
            title: 'Special labour', noteName: 'labourSpecialDescription',
            placeholder: 'e.g. Weekend shift to hit the shutdown date',
            first: 'labourSpecialHours', firstMark: { suffix: 'h' }, op: '×',
            second: 'labourSpecialRate', secondMark: { prefix: '$' },
            total: totals.labourSpecialTotal
          })}
          {costRow({
            title: 'Materials', noteName: 'materialsDescription',
            placeholder: 'e.g. 316 stainless bar supplied for 4 parts',
            first: 'materialsCost', firstMark: { prefix: '$' }, op: '+',
            second: 'materialsProfitPercent', secondMark: { suffix: '%' },
            total: totals.materialsTotal
          })}
          {costRow({
            title: 'Subcontractor', noteName: 'subcontractorDescription',
            placeholder: 'e.g. Hard chrome plating and freight both ways',
            first: 'subcontractorCost', firstMark: { prefix: '$' }, op: '+',
            second: 'subcontractorProfitPercent', secondMark: { suffix: '%' },
            total: totals.subcontractorTotal
          })}
        </section>

        {/* The one grand total on the sheet, in invoice order: labour, other costs, total */}
        <div className="costing-total">
          <span className="costing-total-parts">
            Labour {formatMoney(labourSubtotal)} · Other costs {formatMoney(otherSubtotal)}
          </span>
          <span className="costing-total-label">Grand total</span>
          <span className="costing-total-value">{formatMoney(totals.grandTotal)}</span>
        </div>
        </fieldset>
      </div>
    </div>
  );
}
