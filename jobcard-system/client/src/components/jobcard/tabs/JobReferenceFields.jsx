import { INSTANT_SAVE_STATUS_TEXT } from '../useInstantSave';
import { QUALITY_LEVELS, QUALITY_LEVEL_LABELS } from '../../../../../server/src/shared/qualityLevels';
import FieldError from '../../common/FieldError';

// The Customer Input card: PO number, quote reference, quality level, repeat-job
// toggle and (once that's ticked) the previous-job-reference combobox. Split out
// of DetailsTab.jsx purely to keep that file from growing further — every prop
// here is something DetailsTab already holds.
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
  jobRefNav
}) {
  return (
    <div className="form-section">
      <div className="form-section-header">
        <h3 className="form-section-title">Customer Input</h3>
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
          <label htmlFor="jc-quote-reference">Quote Reference</label>
          <input
            id="jc-quote-reference"
            type="text"
            name="quoteReference"
            value={formData.quoteReference}
            onChange={handleChange}
            onBlur={(e) => commitFieldBlur('quoteReference', e.target.value)}
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
        <div className="form-group">
          <label htmlFor="jc-repeat-job">Repeat Job</label>
          <label className="checkbox-inline">
            <input
              id="jc-repeat-job"
              type="checkbox"
              name="isRepeatJob"
              checked={formData.isRepeatJob}
              onChange={(e) => {
                const isRepeatJob = e.target.checked;
                if (isRepeatJob) {
                  handleChange(e);
                  if (canWriteInstantly) saveField('isRepeatJob', true);
                  return;
                }
                // A previous-job reference only exists on a repeat job, so
                // unticking clears it rather than just hiding the box (it used to
                // stay stored and still print, export and match searches). The
                // server clears its copy with the same write, so both baselines
                // move together once it lands.
                setFormData(prev => ({ ...prev, isRepeatJob: false, repeatJobReference: '' }));
                if (canWriteInstantly) saveField('isRepeatJob', false, { alsoMarkSaved: { repeatJobReference: '' } });
              }}
            />
            {formData.isRepeatJob ? 'Yes' : 'No'}
          </label>
        </div>
      </div>
      {formData.isRepeatJob && (
        <div className={groupClass('repeatJobReference')} ref={jobSearch.containerRef}>
          <label htmlFor="jc-repeat-job-reference">Previous Job Reference</label>
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
              placeholder="DH-00001"
              autoComplete="off"
            />
            {jobRefListOpen && (
              <div className="customer-dropdown" id={jobRefNav.listId} role="listbox" aria-label="Matching jobs">
                {jobSearch.matches.map((j, i) => (
                  <div
                    key={j.id}
                    id={`${jobRefNav.listId}-${i}`}
                    role="option"
                    aria-selected={i === jobRefNav.activeIndex}
                    className={`customer-option${i === jobRefNav.activeIndex ? ' is-active' : ''}`}
                    onMouseEnter={() => jobRefNav.setActiveIndex(i)}
                    onMouseDown={() => jobRefNav.choose(i)}
                  >
                    <strong>{j.jobNumber}</strong>
                    {j.companyName && <span className="contact-name"> — {j.companyName}</span>}
                    {j.description && <span className="contact-name"> ({j.description})</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <FieldError {...errorProps('repeatJobReference')} message={errorFor('repeatJobReference')} />
        </div>
      )}
    </div>
  );
}
