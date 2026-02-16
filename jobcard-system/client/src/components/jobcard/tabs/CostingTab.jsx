export default function CostingTab({
  costingForm,
  handleCostingChange,
  calculateCostingTotals,
  handleSaveCosting,
  savingCosting
}) {
  return (
    <div className="modal-form-grid">
      <div className="form-section">
        <h3 className="form-section-title">Job Costing (Admin Only)</h3>

        {/* Labour */}
        <div className="costing-row">
          <span className="costing-label">Labour</span>
          <div className="costing-inputs">
            <div className="costing-field">
              <label>Hours</label>
              <input type="number" name="labourHours" value={costingForm.labourHours} onChange={handleCostingChange} min="0" step="0.5" />
            </div>
            <div className="costing-field">
              <label>Rate ($/hr)</label>
              <input type="number" name="labourRate" value={costingForm.labourRate} onChange={handleCostingChange} min="0" step="0.01" />
            </div>
            <div className="costing-field total">
              <label>Total</label>
              <span className="costing-total">${(costingForm.labourHours * costingForm.labourRate).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Labour Special */}
        <div className="costing-row">
          <span className="costing-label">Labour Special</span>
          <div className="costing-inputs">
            <div className="costing-field">
              <label>Hours</label>
              <input type="number" name="labourSpecialHours" value={costingForm.labourSpecialHours} onChange={handleCostingChange} min="0" step="0.5" />
            </div>
            <div className="costing-field">
              <label>Rate ($/hr)</label>
              <input type="number" name="labourSpecialRate" value={costingForm.labourSpecialRate} onChange={handleCostingChange} min="0" step="0.01" />
            </div>
            <div className="costing-field total">
              <label>Total</label>
              <span className="costing-total">${(costingForm.labourSpecialHours * costingForm.labourSpecialRate).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Materials */}
        <div className="costing-row">
          <span className="costing-label">Materials</span>
          <div className="costing-inputs">
            <div className="costing-field">
              <label>Cost</label>
              <input type="number" name="materialsCost" value={costingForm.materialsCost} onChange={handleCostingChange} min="0" step="0.01" />
            </div>
            <div className="costing-field">
              <label>Profit %</label>
              <input type="number" name="materialsProfitPercent" value={costingForm.materialsProfitPercent} onChange={handleCostingChange} min="0" />
            </div>
            <div className="costing-field total">
              <label>Total</label>
              <span className="costing-total">${(costingForm.materialsCost * (1 + costingForm.materialsProfitPercent / 100)).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Subcontractor */}
        <div className="costing-row">
          <span className="costing-label">Subcontractor</span>
          <div className="costing-inputs">
            <div className="costing-field">
              <label>Cost</label>
              <input type="number" name="subcontractorCost" value={costingForm.subcontractorCost} onChange={handleCostingChange} min="0" step="0.01" />
            </div>
            <div className="costing-field">
              <label>Profit %</label>
              <input type="number" name="subcontractorProfitPercent" value={costingForm.subcontractorProfitPercent} onChange={handleCostingChange} min="0" />
            </div>
            <div className="costing-field total">
              <label>Total</label>
              <span className="costing-total">${(costingForm.subcontractorCost * (1 + costingForm.subcontractorProfitPercent / 100)).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Grand Total */}
        <div className="costing-grand-total">
          <span className="costing-label">GRAND TOTAL</span>
          <span className="grand-total-value">${calculateCostingTotals().grandTotal.toFixed(2)}</span>
        </div>

        <button type="button" className="btn btn-primary" onClick={handleSaveCosting} disabled={savingCosting}>
          {savingCosting ? 'Saving...' : 'Save Costing'}
        </button>
      </div>
    </div>
  );
}
