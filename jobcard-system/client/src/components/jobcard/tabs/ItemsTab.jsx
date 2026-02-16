export default function ItemsTab({
  lineItems,
  addLineItem,
  updateLineItem,
  removeLineItem
}) {
  return (
    <div className="modal-form-grid">
      <div className="form-section">
        <div className="form-section-header">
          <h3 className="form-section-title">Line Items <span className="required">*</span></h3>
          <button type="button" className="btn btn-secondary btn-sm" onClick={addLineItem}>+ Add Item</button>
        </div>
        <div className="items-table">
          <div className="items-header">
            <span>Item #</span>
            <span>Qty</span>
            <span>Description</span>
            <span></span>
          </div>
          {lineItems.map(item => (
            <div key={item.id} className="items-row">
              <span className="item-num">#{item.itemNumber}</span>
              <input
                type="text"
                value={item.qty}
                onChange={(e) => updateLineItem(item.id, 'qty', e.target.value)}
              />
              <input
                type="text"
                value={item.description}
                onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
              />
              {lineItems.length > 1 && (
                <button type="button" className="btn-icon danger" onClick={() => removeLineItem(item.id)}>×</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
