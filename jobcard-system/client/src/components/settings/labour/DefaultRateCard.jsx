import FieldError from '../../common/FieldError';

// The company-wide default hourly rate. It seeds each NEW job's base rate at creation;
// from then on the job owns its rate, so changing this never moves an existing job
// (the costing screen offers a one-tap "use company default" link to re-apply it).
export default function DefaultRateCard({ defaultRate, setDefaultRate, onSave, saving, error }) {
  return (
    <div className="card full-width">
      <div className="card-header">
        <h2>Default Hourly Rate</h2>
      </div>
      <div className="card-body">
        <p className="setting-description">
          The base rate a new job starts at. Each job takes a copy of this when it is
          created and keeps it — changing the figure here only affects jobs created
          afterwards. A job's own rate can always be edited on its costing screen,
          which also offers a one-tap link back to this default.
        </p>
        <div className={`mult-field${error ? ' field-error' : ''}`}>
          <label className="setting-label">Rate per hour</label>
          <div className="mult-input-wrap">
            <span className="mult-mark">$</span>
            <input
              type="number"
              className="form-control"
              id="defaultRate"
              value={defaultRate}
              onChange={(e) => setDefaultRate(e.target.value)}
              min="0"
              step="0.01"
              // Hand-wired, same `${id}-error` shape as useFieldErrors' fieldProps:
              // this card gets its error as a bare string prop from Settings.jsx,
              // not a hook instance, so there's no fieldProps to spread here.
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'defaultRate-error' : undefined}
            />
          </div>
          <FieldError id="defaultRate-error" message={error} />
          <span className="setting-description">Overtime tiers charge this rate times their multiplier.</span>
        </div>
        <div className="sched-save">
          <button type="button" className="btn btn-primary" onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save default rate'}
          </button>
        </div>
      </div>
    </div>
  );
}
