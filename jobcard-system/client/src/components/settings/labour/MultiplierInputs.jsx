import FieldError from '../../common/FieldError';

// The three overtime rate multipliers. Each tier charges the job's base labour rate
// times its multiplier, so one rate feeds them all.
export default function MultiplierInputs({
  ot1Mult, setOt1Mult, ot2Mult, setOt2Mult, holidayMult, setHolidayMult,
  onSave, saving, ot1Error, ot2Error, holidayError
}) {
  // Called as a plain function (not <Field/>) so the number inputs stay mounted across
  // renders and typing never loses focus.
  const field = (key, label, hint, value, onChange, error) => (
    <div className={`mult-field${error ? ' field-error' : ''}`} key={key}>
      <label className="setting-label">{label}</label>
      <div className="mult-input-wrap">
        <span className="mult-mark">×</span>
        <input
          type="number"
          className="form-control"
          id={key}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min="1"
          step="0.05"
        />
      </div>
      <FieldError message={error} />
      <span className="setting-description">{hint}</span>
    </div>
  );

  return (
    <div className="card full-width">
      <div className="card-header">
        <h2>Overtime Multipliers</h2>
      </div>
      <div className="card-body">
        <p className="setting-description">
          How much each overtime tier charges compared with the normal rate. A base rate
          of $50 with a ×1.5 multiplier bills at $75 an hour.
        </p>
        <div className="mult-grid">
          {field('ot1Mult', 'Overtime 1', 'Standard overtime (e.g. weeknights).', ot1Mult, setOt1Mult, ot1Error)}
          {field('ot2Mult', 'Overtime 2', 'Higher overtime (e.g. late nights, weekends).', ot2Mult, setOt2Mult, ot2Error)}
          {field('holidayMult', 'Public holiday', 'Charged on marked holiday dates.', holidayMult, setHolidayMult, holidayError)}
        </div>
        <div className="sched-save">
          <button type="button" className="btn btn-primary" onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save multipliers'}
          </button>
        </div>
      </div>
    </div>
  );
}
