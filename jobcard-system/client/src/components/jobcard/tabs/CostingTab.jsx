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

  // One overtime tier line: hours (overridable) × a rate derived from the base rate.
  // Called as a plain function (not <TierLine/>) so React keeps the input elements
  // stable across renders and typing never loses focus.
  const tierLine = ({ label, multiplier, hoursName, hoursValue, calculated, overridden, total, tierKey }) => {
    const derivedRate = baseRate * (Number(multiplier) || 0);
    return (
      <div key={hoursName}>
        <div className="ledger-line">
          <span className="ledger-cat">{label} <span className="ledger-cat-mult">×{mult(multiplier)}</span></span>
          <div className="ledger-field">
            <label>Hours</label>
            <input
              type="number"
              name={hoursName}
              value={hoursValue}
              onChange={handleCostingChange}
              min="0"
              step="0.01"
              disabled={frozen}
            />
          </div>
          <span className="ledger-op">×</span>
          <div className="ledger-field">
            <label>Rate / hr</label>
            <div className="ledger-affix ledger-affix--prefix ledger-affix--readonly">
              <span className="ledger-affix-mark">$</span>
              <input type="number" value={derivedRate.toFixed(2)} readOnly tabIndex={-1} />
            </div>
          </div>
          <span className="ledger-eq">=</span>
          <span className="ledger-total">{money(total)}</span>
        </div>
        <div className="ledger-note">
          From logged time: <strong>{Number(calculated) || 0} hrs</strong>
          {overridden && !frozen && (
            <>
              {' '}<span className="ledger-note-flag">edited by hand</span>
              {' '}<button type="button" className="btn-link" onClick={() => resetTierHours(tierKey)}>Reset to logged</button>
            </>
          )}
        </div>
      </div>
    );
  };

  const calculatedHours = Number(costingForm.labourHoursCalculated) || 0;
  const hoursOverridden = costingForm.labourHoursOverridden;

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

        <div className="costing-ledger">
          {/* Labour (normal) — hours × base rate */}
          <div className="ledger-line">
            <span className="ledger-cat">Labour</span>
            <div className="ledger-field">
              <label>Hours</label>
              <input type="number" name="labourHours" value={costingForm.labourHours} onChange={handleCostingChange} min="0" step="0.01" disabled={frozen} />
            </div>
            <span className="ledger-op">×</span>
            <div className="ledger-field">
              <label>Rate / hr</label>
              <div className="ledger-affix ledger-affix--prefix">
                <span className="ledger-affix-mark">$</span>
                <input type="number" name="labourRate" value={costingForm.labourRate} onChange={handleCostingChange} min="0" step="0.01" disabled={frozen} />
              </div>
            </div>
            <span className="ledger-eq">=</span>
            <span className="ledger-total">{money(totals.labourTotal)}</span>
          </div>
          {/* Reference line under labour: the auto-tallied figure + reset link */}
          <div className="ledger-note">
            From logged time: <strong>{calculatedHours} hrs</strong>
            {hoursOverridden && !frozen && (
              <>
                {' '}<span className="ledger-note-flag">edited by hand</span>
                {' '}<button type="button" className="btn-link" onClick={() => resetTierHours('')}>Reset to logged</button>
              </>
            )}
          </div>

          {/* Overtime tiers — hours auto-split from logged time; rate derived from base */}
          {tierLine({
            label: 'Overtime', multiplier: costingForm.labourOt1Multiplier,
            hoursName: 'labourOt1Hours', hoursValue: costingForm.labourOt1Hours,
            calculated: costingForm.labourOt1HoursCalculated, overridden: costingForm.labourOt1Overridden,
            total: totals.labourOt1Total, tierKey: 'Ot1'
          })}
          {tierLine({
            label: 'Overtime', multiplier: costingForm.labourOt2Multiplier,
            hoursName: 'labourOt2Hours', hoursValue: costingForm.labourOt2Hours,
            calculated: costingForm.labourOt2HoursCalculated, overridden: costingForm.labourOt2Overridden,
            total: totals.labourOt2Total, tierKey: 'Ot2'
          })}
          {tierLine({
            label: 'Public holiday', multiplier: costingForm.labourHolidayMultiplier,
            hoursName: 'labourHolidayHours', hoursValue: costingForm.labourHolidayHours,
            calculated: costingForm.labourHolidayHoursCalculated, overridden: costingForm.labourHolidayOverridden,
            total: totals.labourHolidayTotal, tierKey: 'Holiday'
          })}

          {/* Special labour — hours × rate, both entered by hand */}
          <div className="ledger-line">
            <span className="ledger-cat">Special labour</span>
            <div className="ledger-field">
              <label>Hours</label>
              <input type="number" name="labourSpecialHours" value={costingForm.labourSpecialHours} onChange={handleCostingChange} min="0" step="0.01" disabled={frozen} />
            </div>
            <span className="ledger-op">×</span>
            <div className="ledger-field">
              <label>Rate / hr</label>
              <div className="ledger-affix ledger-affix--prefix">
                <span className="ledger-affix-mark">$</span>
                <input type="number" name="labourSpecialRate" value={costingForm.labourSpecialRate} onChange={handleCostingChange} min="0" step="0.01" disabled={frozen} />
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
                <input type="number" name="materialsCost" value={costingForm.materialsCost} onChange={handleCostingChange} min="0" step="0.01" disabled={frozen} />
              </div>
            </div>
            <span className="ledger-op">+</span>
            <div className="ledger-field">
              <label>Margin</label>
              <div className="ledger-affix ledger-affix--suffix">
                <input type="number" name="materialsProfitPercent" value={costingForm.materialsProfitPercent} onChange={handleCostingChange} min="0" disabled={frozen} />
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
                <input type="number" name="subcontractorCost" value={costingForm.subcontractorCost} onChange={handleCostingChange} min="0" step="0.01" disabled={frozen} />
              </div>
            </div>
            <span className="ledger-op">+</span>
            <div className="ledger-field">
              <label>Margin</label>
              <div className="ledger-affix ledger-affix--suffix">
                <input type="number" name="subcontractorProfitPercent" value={costingForm.subcontractorProfitPercent} onChange={handleCostingChange} min="0" disabled={frozen} />
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
