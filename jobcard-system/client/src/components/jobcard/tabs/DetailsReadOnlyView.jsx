import ItemsTab from './ItemsTab';
import ToggleTiles from '../../common/ToggleTiles';

export default function DetailsReadOnlyView({
  formData,
  assignees,
  lineItems,
  updateLineItem,
  attachmentWarnings,
  onAttachItemFile,
  timeEntries = [],
  jobCardId,
  activeTimer,
  timerElapsed,
  timerLoading,
  onStartTimer,
  onStopTimer,
  handleStopActiveEntry
}) {
  return (
    <div className="modal-form-grid readonly-view">
      {/* Line Items — read-only field shells with active timer + files menu + per-item progress */}
      <ItemsTab
        jobCardId={jobCardId}
        lineItems={lineItems}
        updateLineItem={updateLineItem}
        timeEntries={timeEntries}
        isAdmin={false}
        readOnly={true}
        attachmentWarnings={attachmentWarnings}
        onAttachItemFile={onAttachItemFile}
        activeTimer={activeTimer}
        timerElapsed={timerElapsed}
        timerLoading={timerLoading}
        onStartTimer={onStartTimer}
        onStopTimer={onStopTimer}
        handleStopActiveEntry={handleStopActiveEntry}
      />

      {/* Assignees */}
      {assignees && assignees.length > 0 && (
        <div className="form-section">
          <h3 className="form-section-title">Assignees</h3>
          <ToggleTiles
            ariaLabel="Assignees"
            readOnly
            minTileWidth={130}
            options={assignees.map(a => ({ value: a.userId, label: a.userName || a.username }))}
            selectedValues={assignees.map(a => a.userId)}
          />
        </div>
      )}

      {/* Customer Input — inline strip */}
      <div className="form-section">
        <h3 className="form-section-title">Customer Input</h3>
        <div className="customer-input-strip">
          <div className="cis-item">
            <span className="cis-label">Quality</span>
            <span className="cis-value">{formData.qualityLevel || 'STANDARD'}</span>
          </div>
          {formData.poNumber && (
            <div className="cis-item">
              <span className="cis-label">PO#</span>
              <span className="cis-value">{formData.poNumber}</span>
            </div>
          )}
          {formData.quoteReference && (
            <div className="cis-item">
              <span className="cis-label">Quote Ref</span>
              <span className="cis-value">{formData.quoteReference}</span>
            </div>
          )}
          {formData.isRepeatJob && (
            <div className="cis-item">
              <span className="cis-label">Repeat</span>
              <span className="cis-value">{formData.repeatJobReference || 'Yes'}</span>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
