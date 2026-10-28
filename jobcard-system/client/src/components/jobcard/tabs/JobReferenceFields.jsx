import { INSTANT_SAVE_STATUS_TEXT } from '../useInstantSave';
import { QUALITY_LEVELS, QUALITY_LEVEL_LABELS } from '../../../../../server/src/shared/qualityLevels';
import { AlertTriangle, ChevronDown } from 'lucide-react';
import FieldError from '../../common/FieldError';

// The Order Details card: PO number, quality level and the previous-job combobox
// (filled in only on a repeat job). Split out of DetailsTab.jsx
// purely to keep that file from growing further — every prop here is something
// DetailsTab already holds. requiresPo: the picked customer's accounts won't take an
// invoice without their PO number, so the heading carries a standing red reminder.
export default function JobReferenceFields({
  formData,
  handleChange,
  commitFieldBlur,
  setFormData,
  canWriteInstantly,
  saveField,
  detailsStatus,
  groupClass = () => 'form-group',
  errorFor = () => null,
  errorProps = (name) => ({ id: `${name}-error` }),
  jobSearch,
  jobRefListOpen,
  jobRefNav,
  requiresPo = false
}) {
  return (
    <div className="form-section">
      <div className="form-section-header">
        <h3 className="form-section-title">Order Details</h3>
        {requiresPo && (
          <span className="po-required-note">
            <AlertTriangle size={14} aria-hidden="true" />
            This customer needs a PO number before invoicing
          </span>
        )}
        {detailsStatus !== 'idle' && (
          <span
            className={`instant-save-status instant-save-status--${detailsStatus}`}
            role="status"
            aria-live="polite"
          >
            {INSTANT_SAVE_STATUS_TEXT[detailsStatus]}
          </span>
        )}
      </div>
      <div className="form-row">
        <div className="form-group">
          <label htmlFor="jc-po-number">Customer's PO Number</label>
          <input
            id="jc-po-number"
            type="text"
            name="poNumber"
            value={formData.poNumber}
            onChange={handleChange}
            onBlur={(e) => commitFieldBlur('poNumber', e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="jc-qa-level">Quality Level</label>
          <select
            id="jc-qa-level"
            name="qualityLevel"
            value={formData.qualityLevel || 'STANDARD'}
            onChange={(e) => {
              const qualityLevel = e.target.value;
              setFormData(prev => ({ ...prev, qualityLevel }));
              if (canWriteInstantly) saveField('qualityLevel', qualityLevel);
            }}
          >
            {QUALITY_LEVELS.map(level => (
              <option key={level} value={level}>{QUALITY_LEVEL_LABELS[level]}</option>
            ))}
          </select>
        </div>
        {/* Naming the previous job is what makes this a repeat job — there is no
            separate tick. Leave it empty for a job that isn't one. */}
        <div className={groupClass('repeatJobReference')} ref={jobSearch.containerRef}>
          <label htmlFor="jc-repeat-job-reference">Previous Job (if repeat)</label>
          <div className="autocomplete-container">
            <input
              id="jc-repeat-job-reference"
              type="text"
              name="repeatJobReference"
              value={formData.repeatJobReference || ''}
              onChange={(e) => {
                // The pick is only allowed to silence the blur that comes straight
                // behind it. Enter picks without blurring at all, so the flag would
                // otherwise sit armed and swallow whatever blur followed the user's
                // next edit — saving the picked number over the corrected one.
                jobRefNav.disarmPickGuard();
                // And the list comes back: an Enter pick closed it without the
                // cursor ever leaving the box.
                jobSearch.noteTyping();
                jobSearch.setQuery(e.target.value);
                handleChange(e);
              }}
              onFocus={jobSearch.handleFocus}
              onBlur={(e) => {
                jobSearch.handleBlur();
                if (jobRefNav.consumePickGuard()) return;
                commitFieldBlur('repeatJobReference', e.target.value);
              }}
              onKeyDown={jobRefNav.handleKeyDown}
              role="combobox"
              aria-expanded={jobRefListOpen}
              aria-controls={jobRefNav.listId}
              aria-autocomplete="list"
              aria-activedescendant={jobRefNav.activeIndex >= 0 ? `${jobRefNav.listId}-${jobRefNav.activeIndex}` : undefined}
              aria-invalid={errorFor('repeatJobReference') ? true : undefined}
              aria-describedby={errorFor('repeatJobReference') ? errorProps('repeatJobReference').id : undefined}
              // Says what to do, not a sample job number — a number here read as one
              // already filled in.
              placeholder="Type or choose a job…"
              autoComplete="off"
            />
            <ChevronDown size={14} className={`autocomplete-caret${jobRefListOpen ? ' is-open' : ''}`} aria-hidden="true" />
            {jobRefListOpen && (
              <div className="customer-dropdown" id={jobRefNav.listId} role="listbox" aria-label="Matching jobs">
                {jobSearch.matches.map((j, i) => (
                  <div
                    key={j.id}
                    id={`${jobRefNav.listId}-${i}`}
                    role="option"
                    aria-selected={i === jobRefNav.activeIndex}
                    className={`customer-option suggestion-two-line${i === jobRefNav.activeIndex ? ' is-active' : ''}`}
                    title={j.description || undefined}
                    onMouseEnter={() => jobRefNav.setActiveIndex(i)}
                    onMouseDown={() => jobRefNav.choose(i)}
                  >
                    {/* Job number and customer on one line, the description under them,
                        each cut short with "…" rather than wrapping. */}
                    <span className="suggestion-line">
                      <span className="suggestion-main">{j.jobNumber}</span>
                      {j.companyName && <span className="suggestion-aside">{j.companyName}</span>}
                    </span>
                    {j.description && <span className="suggestion-sub">{j.description}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <FieldError {...errorProps('repeatJobReference')} message={errorFor('repeatJobReference')} />
        </div>
      </div>
    </div>
  );
}
