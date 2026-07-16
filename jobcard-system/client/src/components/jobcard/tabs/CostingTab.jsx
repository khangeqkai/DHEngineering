// Format a number as Australian currency with thousands separators.
const money = (n) =>
  `$${(Number(n) || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Trim a multiplier for display: 1.5 → "1.5", 2 → "2", 1.75 → "1.75".
const mult = (n) => String(Number(n) || 0);

export default function CostingTab({
  costingForm,
  handleCostingChange,
  resetTierHours,
  calculateCostingTotals,
  handleSaveCosting,
  savingCosting
}) {
  const totals = calculateCostingTotals();
  const frozen = !!costingForm.frozen;
  const baseRate = Number(costingForm.labourRate) || 0;

  // Select a field's contents when it gains focus, so clicking in and typing REPLACES
  // the existing number instead of inserting in front of it (which turned 100 into
  // 120100). Applies to every money/hours box below.
  const selectOnFocus = (e) => e.target.select();

  // The four labour tiers, split by WHEN the work happened. The base rate is set
  // once (above the table) and each tier's rate derives from it via its multiplier;
  // only the hours are editable. Normal is the baseline (multiplier 1).
  const tiers = [
    {
      label: 'Normal', multiplier: 1, tierKey: '',
      hoursName: 'labourHours', hoursValue: costingForm.labourHours,
      calculated: costingForm.labourHoursCalculated, overridden: costingForm.labourHoursOverridden,
      total: totals.labourTotal
    },
    {
      label: 'Overtime', multiplier: costingForm.labourOt1Multiplier, tierKey: 'Ot1',
      hoursName: 'labourOt1Hours', hoursValue: costingForm.labourOt1Hours,
      calculated: costingForm.labourOt1HoursCalculated, overridden: costingForm.labourOt1Overridden,
      total: totals.labourOt1Total
    },
    {
      label: 'Overtime', multiplier: costingForm.labourOt2Multiplier, tierKey: 'Ot2',
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
  const anyOverridden = tiers.some(t => t.overridden);

  // Snap every tier's hours back to its auto-tallied figure. Resetting a tier that
  // wasn't overridden is a harmless no-op, so one link covers all four.
  const resetAllLabour = () => ['', 'Ot1', 'Ot2', 'Holiday'].forEach(resetTierHours);

  // One tier row: when-worked · hours (editable) · derived rate · amount.
  // Called as a plain function (not a component) so React keeps the input elements
  // stable across renders and typing never loses focus.
  const tierRow = (t) => {
    const derivedRate = baseRate * (Number(t.multiplier) || 0);
    return (
      <div className={`tier-row${t.overridden ? ' tier-row--edited' : ''}`} key={t.hoursName}>
        <span className="tier-when">
          {t.overridden && !frozen && <span className="tier-dot" aria-hidden="true" />}
          {t.label}
          {t.multiplier !== 1 && <span className="tier-mult">×{mult(t.multiplier)}</span>}
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
            disabled={frozen}
          />
          {t.overridden && !frozen && (
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
          <button type="button" className="btn btn-primary btn-sm" onClick={handleSaveCosting} disabled={savingCosting || frozen}>
            {savingCosting ? 'Saving…' : 'Save costing'}
          </button>
        </div>

        {frozen && (
          <div className="costing-frozen-banner">
            This job is invoiced — its costing is locked at the rates it was billed on.
          </div>
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
                disabled={frozen}
              />
            </div>
            <span className="labour-rate-unit">/ hr</span>
            <span className="labour-rate-hint">sets every tier below</span>
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
            {anyOverridden && !frozen && (
              <span className="tier-foot-edited">
                <span className="tier-dot" aria-hidden="true" /> Manually edited
                {' · '}
                <button type="button" className="btn-link" onClick={resetAllLabour}>Reset to logged</button>
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
              <input type="number" name="labourSpecialHours" value={costingForm.labourSpecialHours} onChange={handleCostingChange} onFocus={selectOnFocus} min="0" step="0.01" disabled={frozen} />
            </div>
            <span className="ledger-op">×</span>
            <div className="ledger-field">
              <label>Rate / hr</label>
              <div className="ledger-affix ledger-affix--prefix">
                <span className="ledger-affix-mark">$</span>
                <input type="number" name="labourSpecialRate" value={costingForm.labourSpecialRate} onChange={handleCostingChange} onFocus={selectOnFocus} min="0" step="0.01" disabled={frozen} />
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
                <input type="number" name="materialsCost" value={costingForm.materialsCost} onChange={handleCostingChange} onFocus={selectOnFocus} min="0" step="0.01" disabled={frozen} />
              </div>
            </div>
            <span className="ledger-op">+</span>
            <div className="ledger-field">
              <label>Margin</label>
              <div className="ledger-affix ledger-affix--suffix">
                <input type="number" name="materialsProfitPercent" value={costingForm.materialsProfitPercent} onChange={handleCostingChange} onFocus={selectOnFocus} min="0" disabled={frozen} />
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
                <input type="number" name="subcontractorCost" value={costingForm.subcontractorCost} onChange={handleCostingChange} onFocus={selectOnFocus} min="0" step="0.01" disabled={frozen} />
              </div>
            </div>
            <span className="ledger-op">+</span>
            <div className="ledger-field">
              <label>Margin</label>
              <div className="ledger-affix ledger-affix--suffix">
                <input type="number" name="subcontractorProfitPercent" value={costingForm.subcontractorProfitPercent} onChange={handleCostingChange} onFocus={selectOnFocus} min="0" disabled={frozen} />
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
