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
        <h3 className="form-section-title" data-section="$">Job Costing (Admin Only)</h3>

        {/* Labour */}
        <div className="costing-row">
          <span className="costing-label">Labour</span>
          <div className="costing-inputs">
            <div className="costing-field">
              <label>Hours</label>
              <input type="number" name="labour_hours" value={costingForm.labour_hours} onChange={handleCostingChange} min="0" step="0.5" />
            </div>
            <div className="costing-field">
              <label>Rate ($/hr)</label>
              <input type="number" name="labour_rate" value={costingForm.labour_rate} onChange={handleCostingChange} min="0" step="0.01" />
            </div>
            <div className="costing-field total">
              <label>Total</label>
              <span className="costing-total">${(costingForm.labour_hours * costingForm.labour_rate).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Labour Special */}
        <div className="costing-row">
          <span className="costing-label">Labour Special</span>
          <div className="costing-inputs">
            <div className="costing-field">
              <label>Hours</label>
              <input type="number" name="labour_special_hours" value={costingForm.labour_special_hours} onChange={handleCostingChange} min="0" step="0.5" />
            </div>
            <div className="costing-field">
              <label>Rate ($/hr)</label>
              <input type="number" name="labour_special_rate" value={costingForm.labour_special_rate} onChange={handleCostingChange} min="0" step="0.01" />
            </div>
            <div className="costing-field total">
              <label>Total</label>
              <span className="costing-total">${(costingForm.labour_special_hours * costingForm.labour_special_rate).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Materials */}
        <div className="costing-row">
          <span className="costing-label">Materials</span>
          <div className="costing-inputs">
            <div className="costing-field">
              <label>Cost</label>
              <input type="number" name="materials_cost" value={costingForm.materials_cost} onChange={handleCostingChange} min="0" step="0.01" />
            </div>
            <div className="costing-field">
              <label>Profit %</label>
              <input type="number" name="materials_profit_percent" value={costingForm.materials_profit_percent} onChange={handleCostingChange} min="0" />
            </div>
            <div className="costing-field total">
              <label>Total</label>
              <span className="costing-total">${(costingForm.materials_cost * (1 + costingForm.materials_profit_percent / 100)).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Subcontractor */}
        <div className="costing-row">
          <span className="costing-label">Subcontractor</span>
          <div className="costing-inputs">
            <div className="costing-field">
              <label>Cost</label>
              <input type="number" name="subcontractor_cost" value={costingForm.subcontractor_cost} onChange={handleCostingChange} min="0" step="0.01" />
            </div>
            <div className="costing-field">
              <label>Profit %</label>
              <input type="number" name="subcontractor_profit_percent" value={costingForm.subcontractor_profit_percent} onChange={handleCostingChange} min="0" />
            </div>
            <div className="costing-field total">
              <label>Total</label>
              <span className="costing-total">${(costingForm.subcontractor_cost * (1 + costingForm.subcontractor_profit_percent / 100)).toFixed(2)}</span>
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
