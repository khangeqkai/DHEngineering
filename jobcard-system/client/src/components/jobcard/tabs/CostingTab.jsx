// Format a number as Australian currency with thousands separators.
const money = (n) =>
  `$${(Number(n) || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Trim a multiplier for display: 1.5 → "1.5", 2 → "2", 1.75 → "1.75".
const mult = (n) => String(Number(n) || 0);

export default function CostingTab({
  costingForm,
  handleCostingChange,
  resetTierHours,
  resetTierMultiplier,
  useDefaultRate,
  calculateCostingTotals,
  handleSaveCosting,
  savingCosting
}) {
  const totals = calculateCostingTotals();
  const baseRate = Number(costingForm.labourRate) || 0;

  // Select a field's contents when it gains focus, so clicking in and typing REPLACES
  // the existing number instead of inserting in front of it (which turned 100 into
  // 120100). Applies to every money/hours box below.
  const selectOnFocus = (e) => e.target.select();

  // The four labour tiers, split by WHEN the work happened. The base rate is set
  // once (above the table) and each tier's rate derives from it via its multiplier.
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
      label: 'Overtime', multiplier: costingForm.labourOt1Multiplier, tierKey: 'Ot1',
      multName: 'labourOt1Multiplier', multCalculated: costingForm.labourOt1MultiplierCalculated,
      multOverridden: costingForm.labourOt1MultiplierOverridden,
      hoursName: 'labourOt1Hours', hoursValue: costingForm.labourOt1Hours,
      calculated: costingForm.labourOt1HoursCalculated, overridden: costingForm.labourOt1Overridden,
      total: totals.labourOt1Total
    },
    {
      label: 'Overtime', multiplier: costingForm.labourOt2Multiplier, tierKey: 'Ot2',
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

  // One tier row: when-worked · hours (editable) · derived rate · amount.
  // Called as a plain function (not a component) so React keeps the input elements
  // stable across renders and typing never loses focus.
  const tierRow = (t) => {
    const derivedRate = baseRate * (Number(t.multiplier) || 0);
    const rowEdited = t.overridden || t.multOverridden;
    return (
      <div className={`tier-row${t.overridden ? ' tier-row--edited' : ''}`} key={t.hoursName}>
        <span className="tier-when">
          {rowEdited && <span className="tier-dot" aria-hidden="true" />}
          {t.label}
          {t.multName ? (
            // Overtime rows: the multiplier is a job-editable box (typing overrides
            // the company setting for this job only), with a snap-back link below.
            <span className={`tier-mult-editable${t.multOverridden ? ' tier-mult-editable--edited' : ''}`}>
              <span className="tier-mult-box">
                ×
                <input
                  type="number"
                  name={t.multName}
                  value={t.multiplier}
                  onChange={handleCostingChange}
                  onFocus={selectOnFocus}
                  min="1"
                  step="0.1"
                  aria-label={`${t.label} multiplier`}
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
            </span>
          ) : (
            t.multiplier !== 1 && <span className="tier-mult">×{mult(t.multiplier)}</span>
          )}
        </span>
        <span className="tier-hours-cell">
          <input
            type="number"
            name={t.hoursName}
            value={t.hoursValue}
            onChange={handleCostingChange}
            onFocus={selectOnFocus}
            min="0"
            step="0.01"
            aria-label={`${t.label} hours`}
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
        </span>
        <span className="tier-rate">{money(derivedRate)}</span>
        <span className="tier-amount">{money(t.total)}</span>
      </div>
    );
  };

  return (
    <div className="modal-form-grid">
      <div className="costing-sheet">
        <div className="costing-sheet-header">
          <h3 className="costing-sheet-title">Job costing</h3>
          <button type="button" className="btn btn-primary btn-sm" onClick={handleSaveCosting} disabled={savingCosting}>
            {savingCosting ? 'Saving…' : 'Save costing'}
          </button>
        </div>

        {/* Labour — one panel: base rate up top, tiers as a rate ladder, subtotal in the header */}
        <section className="labour-block">
          <div className="labour-block-head">
            <div className="labour-block-heading">
              <span className="labour-block-title">Labour</span>
              <span className="labour-block-sub">split by when it was worked</span>
            </div>
            <div className="labour-block-subtotal">
              <span className="labour-subtotal-label">Labour subtotal</span>
              <span className="labour-subtotal-value">{money(labourSubtotal)}</span>
            </div>
          </div>

          <div className="labour-rate-row">
            <label htmlFor="labourRate" className="labour-rate-label">Base rate</label>
            <div className="ledger-affix ledger-affix--prefix labour-rate-field">
              <span className="ledger-affix-mark">$</span>
              <input
                id="labourRate"
                type="number"
                name="labourRate"
                value={costingForm.labourRate}
                onChange={handleCostingChange}
                onFocus={selectOnFocus}
                min="0"
                step="0.01"
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
                    use company default ({money(costingForm.labourDefaultRate)})
                  </button>
                </>
              )}
            </span>
          </div>

          <div className="tier-table" role="table" aria-label="Labour by when it was worked">
            <div className="tier-head" role="row">
              <span role="columnheader">When worked</span>
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
            <div className="ledger-field">
              <label>Hours</label>
              <input type="number" name="labourSpecialHours" value={costingForm.labourSpecialHours} onChange={handleCostingChange} onFocus={selectOnFocus} min="0" step="0.01" />
            </div>
            <span className="ledger-op">×</span>
            <div className="ledger-field">
              <label>Rate / hr</label>
              <div className="ledger-affix ledger-affix--prefix">
                <span className="ledger-affix-mark">$</span>
                <input type="number" name="labourSpecialRate" value={costingForm.labourSpecialRate} onChange={handleCostingChange} onFocus={selectOnFocus} min="0" step="0.01" />
              </div>
            </div>
            <span className="ledger-eq">=</span>
            <span className="ledger-total">{money(totals.labourSpecialTotal)}</span>
          </div>

          {/* Materials — cost + margin % */}
          <div className="ledger-line">
            <span className="ledger-cat">Materials</span>
            <div className="ledger-field">
              <label>Cost</label>
              <div className="ledger-affix ledger-affix--prefix">
                <span className="ledger-affix-mark">$</span>
                <input type="number" name="materialsCost" value={costingForm.materialsCost} onChange={handleCostingChange} onFocus={selectOnFocus} min="0" step="0.01" />
              </div>
            </div>
            <span className="ledger-op">+</span>
            <div className="ledger-field">
              <label>Margin</label>
              <div className="ledger-affix ledger-affix--suffix">
                <input type="number" name="materialsProfitPercent" value={costingForm.materialsProfitPercent} onChange={handleCostingChange} onFocus={selectOnFocus} min="0" />
                <span className="ledger-affix-mark">%</span>
              </div>
            </div>
            <span className="ledger-eq">=</span>
            <span className="ledger-total">{money(totals.materialsTotal)}</span>
          </div>

          {/* Subcontractor — cost + margin % */}
          <div className="ledger-line">
            <span className="ledger-cat">Subcontractor</span>
            <div className="ledger-field">
              <label>Cost</label>
              <div className="ledger-affix ledger-affix--prefix">
                <span className="ledger-affix-mark">$</span>
                <input type="number" name="subcontractorCost" value={costingForm.subcontractorCost} onChange={handleCostingChange} onFocus={selectOnFocus} min="0" step="0.01" />
              </div>
            </div>
            <span className="ledger-op">+</span>
            <div className="ledger-field">
              <label>Margin</label>
              <div className="ledger-affix ledger-affix--suffix">
                <input type="number" name="subcontractorProfitPercent" value={costingForm.subcontractorProfitPercent} onChange={handleCostingChange} onFocus={selectOnFocus} min="0" />
                <span className="ledger-affix-mark">%</span>
              </div>
            </div>
            <span className="ledger-eq">=</span>
            <span className="ledger-total">{money(totals.subcontractorTotal)}</span>
          </div>
        </div>

        {/* Grand total — the hero figure */}
        <div className="costing-grand">
          <span className="costing-grand-label">Grand total</span>
          <span className="costing-grand-value">{money(totals.grandTotal)}</span>
        </div>
      </div>
    </div>
  );
}
