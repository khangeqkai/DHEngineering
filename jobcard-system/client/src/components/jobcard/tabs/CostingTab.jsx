// Format a number as Australian currency with thousands separators.
const money = (n) =>
  `$${(Number(n) || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function CostingTab({
  costingForm,
  handleCostingChange,
  resetLabourHours,
  calculateCostingTotals,
  handleSaveCosting,
  savingCosting
}) {
  const calculatedHours = Number(costingForm.labourHoursCalculated) || 0;
  const hoursOverridden = costingForm.labourHoursOverridden;

  const labourTotal = costingForm.labourHours * costingForm.labourRate;
  const labourSpecialTotal = costingForm.labourSpecialHours * costingForm.labourSpecialRate;
  const materialsTotal = costingForm.materialsCost * (1 + costingForm.materialsProfitPercent / 100);
  const subcontractorTotal = costingForm.subcontractorCost * (1 + costingForm.subcontractorProfitPercent / 100);

  return (
    <div className="modal-form-grid">
      <div className="costing-sheet">
        <div className="costing-sheet-header">
          <h3 className="costing-sheet-title">Job costing</h3>
          <button type="button" className="btn btn-primary btn-sm" onClick={handleSaveCosting} disabled={savingCosting}>
            {savingCosting ? 'Saving…' : 'Save costing'}
          </button>
        </div>

        <div className="costing-ledger">
          {/* Labour — hours × rate */}
          <div className="ledger-line">
            <span className="ledger-cat">Labour</span>
            <div className="ledger-field">
              <label>Hours</label>
              <input type="number" name="labourHours" value={costingForm.labourHours} onChange={handleCostingChange} min="0" step="0.01" />
            </div>
            <span className="ledger-op">×</span>
            <div className="ledger-field">
              <label>Rate / hr</label>
              <div className="ledger-affix ledger-affix--prefix">
                <span className="ledger-affix-mark">$</span>
                <input type="number" name="labourRate" value={costingForm.labourRate} onChange={handleCostingChange} min="0" step="0.01" />
              </div>
            </div>
            <span className="ledger-eq">=</span>
            <span className="ledger-total">{money(labourTotal)}</span>
          </div>
          {/* Reference line under labour: the auto-tallied figure + reset link */}
          <div className="ledger-note">
            From logged time: <strong>{calculatedHours} hrs</strong>
            {hoursOverridden && (
              <>
                {' '}<span className="ledger-note-flag">edited by hand</span>
                {' '}<button type="button" className="btn-link" onClick={resetLabourHours}>Reset to logged</button>
              </>
            )}
          </div>

          {/* Special labour — hours × rate, both entered by hand */}
          <div className="ledger-line">
            <span className="ledger-cat">Special labour</span>
            <div className="ledger-field">
              <label>Hours</label>
              <input type="number" name="labourSpecialHours" value={costingForm.labourSpecialHours} onChange={handleCostingChange} min="0" step="0.01" />
            </div>
            <span className="ledger-op">×</span>
            <div className="ledger-field">
              <label>Rate / hr</label>
              <div className="ledger-affix ledger-affix--prefix">
                <span className="ledger-affix-mark">$</span>
                <input type="number" name="labourSpecialRate" value={costingForm.labourSpecialRate} onChange={handleCostingChange} min="0" step="0.01" />
              </div>
            </div>
            <span className="ledger-eq">=</span>
            <span className="ledger-total">{money(labourSpecialTotal)}</span>
          </div>

          {/* Materials — cost + margin % */}
          <div className="ledger-line">
            <span className="ledger-cat">Materials</span>
            <div className="ledger-field">
              <label>Cost</label>
              <div className="ledger-affix ledger-affix--prefix">
                <span className="ledger-affix-mark">$</span>
                <input type="number" name="materialsCost" value={costingForm.materialsCost} onChange={handleCostingChange} min="0" step="0.01" />
              </div>
            </div>
            <span className="ledger-op">+</span>
            <div className="ledger-field">
              <label>Margin</label>
              <div className="ledger-affix ledger-affix--suffix">
                <input type="number" name="materialsProfitPercent" value={costingForm.materialsProfitPercent} onChange={handleCostingChange} min="0" />
                <span className="ledger-affix-mark">%</span>
              </div>
            </div>
            <span className="ledger-eq">=</span>
            <span className="ledger-total">{money(materialsTotal)}</span>
          </div>

          {/* Subcontractor — cost + margin % */}
          <div className="ledger-line">
            <span className="ledger-cat">Subcontractor</span>
            <div className="ledger-field">
              <label>Cost</label>
              <div className="ledger-affix ledger-affix--prefix">
                <span className="ledger-affix-mark">$</span>
                <input type="number" name="subcontractorCost" value={costingForm.subcontractorCost} onChange={handleCostingChange} min="0" step="0.01" />
              </div>
            </div>
            <span className="ledger-op">+</span>
            <div className="ledger-field">
              <label>Margin</label>
              <div className="ledger-affix ledger-affix--suffix">
                <input type="number" name="subcontractorProfitPercent" value={costingForm.subcontractorProfitPercent} onChange={handleCostingChange} min="0" />
                <span className="ledger-affix-mark">%</span>
              </div>
            </div>
            <span className="ledger-eq">=</span>
            <span className="ledger-total">{money(subcontractorTotal)}</span>
          </div>
        </div>

        {/* Grand total — the hero figure */}
        <div className="costing-grand">
          <span className="costing-grand-label">Grand total</span>
          <span className="costing-grand-value">{money(calculateCostingTotals().grandTotal)}</span>
        </div>
      </div>
    </div>
  );
}
