import { useState } from 'react';
import { Info } from 'lucide-react';
import CostingBreakdown from './CostingBreakdown';
import FieldError from '../../common/FieldError';
import { formatMoney } from '../../../utils/formatters';

// Format a multiplier for the read-only chips at a fixed two decimals, so the whole
// multiplier column lines up spreadsheet-style: 1 → "1.00", 2.5 → "2.50", 1.75 → "1.75".
const mult = (n) => (Number(n) || 0).toFixed(2);

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

// What the line beside the grand total says while the screen saves itself. There is no
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
            <h3 className="costing-sheet-title">Job costing</h3>
          </div>
          <div className="costing-placeholder">
            {loadFailed ? (
              <>
                <p>This job's pricing couldn't be loaded, so it can't be changed right now.</p>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => onRetryLoad?.()}>
                  Try again
                </button>
              </>
            ) : (
              <p>Loading pricing…</p>
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

  // The "what this cost covers" note that sits under each manual cost line. Called as a
  // plain function (not a component) so React keeps the input stable and typing never
  // loses focus — same reason as the tier rows below. Its capitalise-on-leave tidy now
  // runs in commitBox (useCosting.js) itself, the same moment it commits — no onBlur of
  // its own, so it goes through the sheet's one bubbling blur handler like every other box.
  const costNote = (name, placeholder) => (
    <div className="ledger-note">
      <label htmlFor={name}>What this covers</label>
      <input
        id={name}
        type="text"
        name={name}
        value={costingForm[name] || ''}
        onChange={handleCostingChange}
        placeholder={placeholder}
        maxLength={300}
      />
    </div>
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
    return (
      <span className="ledger-field-opening ledger-field-revert">
        opened at {REVERT_FORMAT[name](opened)}
        <button
          type="button"
          className="btn-link"
          onClick={() => onRevertField(name, String(opened))}
        >
          put it back
        </button>
      </span>
    );
  };

  // A field still being typed in (or left typed-in and invalid — a red box KEEPS its
  // draft, see commitBox in useCosting.js) is always a string; a committed figure is
  // always a number. That's reason enough on its own to show it raw rather than
  // reformatted to two decimals — reformatting an invalid "abc" or "-1" to "0.00" the
  // moment the box loses focus would hide exactly the text the red box exists to show.
  const multDisplay = (t) => (typeof costingForm[t.multName] === 'string' ? costingForm[t.multName] : mult(t.multiplier));

  // The four labour tiers, split by WHEN the work happened. The base rate is set
  // once (above the table) and each tier's rate derives from it via its multiplier.
  // A cleared multiplier box ('') means "follow the standard figure" — the same rule
  // the totals use — so the chip and rate column never read ×0.00 while it sits blank.
  const shownMult = (k) => costingForm[k] === '' ? costingForm[`${k}Calculated`] : costingForm[k];
  // The hours are editable on every tier; the two overtime rows also let the admin
  // type a job-specific multiplier over the company setting (multName set = editable).
  const tiers = [
    {
      label: 'Normal', multiplier: 1, tierKey: '',
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
      label: 'Overtime', multiplier: shownMult('labourOt2Multiplier'), tierKey: 'Ot2',
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

  // Snap every tier's hours (and the two OT multipliers) back to their auto figures.
  // Resetting something that wasn't overridden is a harmless no-op, so one link covers all.
  const resetAllLabour = () => {
    ['', 'Ot1', 'Ot2', 'Holiday'].forEach(resetTierHours);
    ['Ot1', 'Ot2'].forEach(resetTierMultiplier);
  };

  // One tier row: when-worked · multiplier (its own column) · hours (editable) ·
  // derived rate · amount. Called as a plain function (not a component) so React keeps
  // the input elements stable across renders and typing never loses focus.
  const tierRow = (t) => {
    const derivedRate = baseRate * (Number(t.multiplier) || 0);
    const rowEdited = t.overridden || t.multOverridden;
    const multError = t.multName ? costingFieldError(t.multName) : null;
    const hoursError = costingFieldError(t.hoursName);
    return (
      <div className={`tier-row${t.overridden ? ' tier-row--edited' : ''}`} key={t.hoursName}>
        <span className="tier-when">
          {rowEdited && <span className="tier-dot" aria-hidden="true" />}
          {t.label}
        </span>
        <span className="tier-mult-cell">
          {t.multName ? (
            // Overtime rows: the multiplier is a job-editable box (typing overrides
            // the company setting for this job only), with a snap-back link below.
            <span className={`tier-mult-editable${t.multOverridden ? ' tier-mult-editable--edited' : ''}${multError ? ' field-error' : ''}`}>
              <span className="tier-mult-box">
                ×
                <input
                  type="text"
                  inputMode="decimal"
                  name={t.multName}
                  value={multDisplay(t)}
                  onChange={handleCostingChange}
                  onFocus={selectOnFocus}
                  aria-label={`${t.label} multiplier`}
                  {...costingFieldProps(t.multName)}
                />
              </span>
              {t.multOverridden && (
                <button
                  type="button"
                  className="tier-auto"
                  title="Reset to the company-wide multiplier"
                  onClick={() => resetTierMultiplier(t.tierKey)}
                >
                  standard ×{mult(t.multCalculated)}
                </button>
              )}
              <FieldError message={multError} {...costingErrorProps(t.multName)} />
            </span>
          ) : (
            // Fixed-multiplier rows (normal, public holiday): the same box shape as the
            // editable overtime ones (just not typeable), so the whole column is one
            // uniform-width, right-aligned ladder — ×1.00 / ×1.50 / ×2.00 / ×2.50.
            <span className="tier-mult-box tier-mult-box--static">
              ×<span className="tier-mult-static">{mult(t.multiplier)}</span>
            </span>
          )}
        </span>
        <span className={`tier-hours-cell${hoursError ? ' field-error' : ''}`}>
          <input
            type="text"
            inputMode="decimal"
            name={t.hoursName}
            value={t.hoursValue}
            onChange={handleCostingChange}
            onFocus={selectOnFocus}
            aria-label={`${t.label} hours`}
            {...costingFieldProps(t.hoursName)}
          />
          {t.overridden && (
            <button
              type="button"
              className="tier-auto"
              title="Reset to the hours from logged time"
              onClick={() => resetTierHours(t.tierKey)}
            >
              logged {Number(t.calculated) || 0}
            </button>
          )}
          <FieldError message={hoursError} {...costingErrorProps(t.hoursName)} />
        </span>
        <span className="tier-rate">{formatMoney(derivedRate)}</span>
        <span className="tier-amount">{formatMoney(t.total)}</span>
      </div>
    );
  };

  const status = SAVE_STATUS[saveState];

  // Enter anywhere in the sheet saves straight away, without leaving the box. The
  // surrounding job form already swallows Enter, so nothing else fires off the same
  // keypress. Enter commits exactly the box the cursor is in — the same commitBox that
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
        {/* Sticky top bar: the grand total stays on screen while the sheet is scrolled */}
        <div className="costing-sheet-header">
          <h3 className="costing-sheet-title">Job costing</h3>
          <button
            type="button"
            className={`costing-info-btn${showBreakdown ? ' costing-info-btn--on' : ''}`}
            onClick={() => setShowBreakdown(v => !v)}
            aria-expanded={showBreakdown}
            aria-label={showBreakdown ? 'Hide what this job used' : 'Show what this job used'}
            title="What this job used — time per part and machine, material and treatment"
          >
            <Info size={16} />
          </button>
          <div className="costing-grand">
            <span className="costing-grand-label">Grand total</span>
            <span className="costing-grand-value">{formatMoney(totals.grandTotal)}</span>
          </div>
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

        {showBreakdown && (
          <CostingBreakdown lineItems={lineItems} timeEntries={timeEntries} machines={machines} />
        )}

        {/* Labour — one panel: base rate up top, tiers as a rate ladder, subtotal in the header */}
        <section className="labour-block">
          <div className="labour-block-head">
            <div className="labour-block-heading">
              <span className="labour-block-title">Labour</span>
              <span className="labour-block-sub">split by when it was worked</span>
            </div>
            <div className="labour-block-subtotal">
              <span className="labour-subtotal-label">Labour subtotal</span>
              <span className="labour-subtotal-value">{formatMoney(labourSubtotal)}</span>
            </div>
          </div>

          <div className="labour-rate-row">
            <label htmlFor="labourRate" className="labour-rate-label">Base rate</label>
            <div className={`ledger-affix ledger-affix--prefix labour-rate-field${costingFieldError('labourRate') ? ' field-error' : ''}`}>
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
            <span className="labour-rate-unit">/ hr</span>
            <span className="labour-rate-hint">
              sets every tier below
              {Number(costingForm.labourDefaultRate) > 0
                && Number(costingForm.labourDefaultRate) !== baseRate && (
                <>
                  {' · '}
                  <button type="button" className="btn-link" onClick={useDefaultRate}>
                    use company default ({formatMoney(costingForm.labourDefaultRate)})
                  </button>
                </>
              )}
            </span>
            <FieldError message={costingFieldError('labourRate')} {...costingErrorProps('labourRate')} />
          </div>

          <div className="tier-table" role="table" aria-label="Labour by when it was worked">
            <div className="tier-head" role="row">
              <span role="columnheader">When worked</span>
              <span role="columnheader">Mult</span>
              <span role="columnheader">Hours</span>
              <span role="columnheader">Rate / hr</span>
              <span role="columnheader">Amount</span>
            </div>
            {tiers.map(tierRow)}
          </div>

          <div className="tier-foot">
            <span>Hours are split from logged time.</span>
            {anyOverridden && (
              <span className="tier-foot-edited">
                <span className="tier-dot" aria-hidden="true" /> Manually edited
                {' · '}
                <button type="button" className="btn-link" onClick={resetAllLabour}>Reset all to auto</button>
              </span>
            )}
          </div>
        </section>

        {/* Manual cost lines — simple category · fields = total ledger rows */}
        <div className="costing-ledger">
          {/* Special labour — hours × rate, both entered by hand */}
          <div className="ledger-line">
            <span className="ledger-cat">Special labour</span>
            <div className={costingFieldError('labourSpecialHours') ? 'ledger-field field-error' : 'ledger-field'}>
              <label htmlFor="labourSpecialHours">Hours</label>
              <input type="text" inputMode="decimal" name="labourSpecialHours" value={costingForm.labourSpecialHours} onChange={handleCostingChange} onFocus={selectOnFocus} {...costingFieldProps('labourSpecialHours')} />
              {revertControl('labourSpecialHours')}
              <FieldError message={costingFieldError('labourSpecialHours')} {...costingErrorProps('labourSpecialHours')} />
            </div>
            <span className="ledger-op">×</span>
            <div className={costingFieldError('labourSpecialRate') ? 'ledger-field field-error' : 'ledger-field'}>
              <label htmlFor="labourSpecialRate">Rate / hr</label>
              <div className="ledger-affix ledger-affix--prefix">
                <span className="ledger-affix-mark">$</span>
                <input type="text" inputMode="decimal" name="labourSpecialRate" value={costingForm.labourSpecialRate} onChange={handleCostingChange} onFocus={selectOnFocus} {...costingFieldProps('labourSpecialRate')} />
              </div>
              {revertControl('labourSpecialRate')}
              <FieldError message={costingFieldError('labourSpecialRate')} {...costingErrorProps('labourSpecialRate')} />
            </div>
            <span className="ledger-eq">=</span>
            <span className="ledger-total">{formatMoney(totals.labourSpecialTotal)}</span>
            {costNote('labourSpecialDescription', 'e.g. Weekend shift to hit the shutdown date')}
          </div>

          {/* Materials — cost + margin % */}
          <div className="ledger-line">
            <span className="ledger-cat">Materials</span>
            <div className={costingFieldError('materialsCost') ? 'ledger-field field-error' : 'ledger-field'}>
              <label htmlFor="materialsCost">Cost</label>
              <div className="ledger-affix ledger-affix--prefix">
                <span className="ledger-affix-mark">$</span>
                <input type="text" inputMode="decimal" name="materialsCost" value={costingForm.materialsCost} onChange={handleCostingChange} onFocus={selectOnFocus} {...costingFieldProps('materialsCost')} />
              </div>
              {revertControl('materialsCost')}
              <FieldError message={costingFieldError('materialsCost')} {...costingErrorProps('materialsCost')} />
            </div>
            <span className="ledger-op">+</span>
            <div className={costingFieldError('materialsProfitPercent') ? 'ledger-field field-error' : 'ledger-field'}>
              <label htmlFor="materialsProfitPercent">Margin</label>
              <div className="ledger-affix ledger-affix--suffix">
                <input type="text" inputMode="decimal" name="materialsProfitPercent" value={costingForm.materialsProfitPercent} onChange={handleCostingChange} onFocus={selectOnFocus} {...costingFieldProps('materialsProfitPercent')} />
                <span className="ledger-affix-mark">%</span>
              </div>
              {revertControl('materialsProfitPercent')}
              <FieldError message={costingFieldError('materialsProfitPercent')} {...costingErrorProps('materialsProfitPercent')} />
            </div>
            <span className="ledger-eq">=</span>
            <span className="ledger-total">{formatMoney(totals.materialsTotal)}</span>
            {costNote('materialsDescription', 'e.g. 316 stainless bar supplied for 4 parts')}
          </div>

          {/* Subcontractor — cost + margin % */}
          <div className="ledger-line">
            <span className="ledger-cat">Subcontractor</span>
            <div className={costingFieldError('subcontractorCost') ? 'ledger-field field-error' : 'ledger-field'}>
              <label htmlFor="subcontractorCost">Cost</label>
              <div className="ledger-affix ledger-affix--prefix">
                <span className="ledger-affix-mark">$</span>
                <input type="text" inputMode="decimal" name="subcontractorCost" value={costingForm.subcontractorCost} onChange={handleCostingChange} onFocus={selectOnFocus} {...costingFieldProps('subcontractorCost')} />
              </div>
              {revertControl('subcontractorCost')}
              <FieldError message={costingFieldError('subcontractorCost')} {...costingErrorProps('subcontractorCost')} />
            </div>
            <span className="ledger-op">+</span>
            <div className={costingFieldError('subcontractorProfitPercent') ? 'ledger-field field-error' : 'ledger-field'}>
              <label htmlFor="subcontractorProfitPercent">Margin</label>
              <div className="ledger-affix ledger-affix--suffix">
                <input type="text" inputMode="decimal" name="subcontractorProfitPercent" value={costingForm.subcontractorProfitPercent} onChange={handleCostingChange} onFocus={selectOnFocus} {...costingFieldProps('subcontractorProfitPercent')} />
                <span className="ledger-affix-mark">%</span>
              </div>
              {revertControl('subcontractorProfitPercent')}
              <FieldError message={costingFieldError('subcontractorProfitPercent')} {...costingErrorProps('subcontractorProfitPercent')} />
            </div>
            <span className="ledger-eq">=</span>
            <span className="ledger-total">{formatMoney(totals.subcontractorTotal)}</span>
            {costNote('subcontractorDescription', 'e.g. Hard chrome plating and freight both ways')}
          </div>
        </div>
      </div>
    </div>
  );
}
