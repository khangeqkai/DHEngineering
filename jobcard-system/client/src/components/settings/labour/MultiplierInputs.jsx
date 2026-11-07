import FieldError from '../../common/FieldError';
import { formatMoney } from '../../../utils/formatters';
import { summariseTierHours } from '../../../../../server/src/shared/overtimeSchedule';

// The three overtime rate multipliers. Each tier charges the job's base labour rate
// times its multiplier, so one rate feeds them all.
export default function MultiplierInputs({
  ot1Mult, setOt1Mult, ot2Mult, setOt2Mult, holidayMult, setHolidayMult,
  onSave, saving, ot1Error, ot2Error, holidayError, defaultRate, dirty, schedule
}) {
  // Called as a plain function (not <Field/>) so the number inputs stay mounted across
  // renders and typing never loses focus.
  // "= $75.00 per hour at the default $50.00 rate", read live from the two boxes. Blank
  // until both hold a number, so a half-typed figure never shows a made-up price.
  const base = defaultRate === '' ? NaN : Number(defaultRate);
  const worked = (value) => {
    const m = value === '' ? NaN : Number(value);
    if (!Number.isFinite(base) || !Number.isFinite(m)) return null;
    return `= ${formatMoney(base * m)} per hour at the default ${formatMoney(base)} rate`;
  };

  const field = (key, label, hint, value, onChange, error) => (
    <div className={`mult-field${error ? ' field-error' : ''}`} key={key}>
      <label className="setting-label" htmlFor={key}>{label}</label>
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
          // Hand-wired, same `${id}-error` shape as useFieldErrors' fieldProps: this
          // card gets its error as a bare string prop from Settings.jsx, not a hook
          // instance, so there's no fieldProps to spread here.
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${key}-error` : undefined}
        />
      </div>
      <FieldError id={`${key}-error`} message={error} />
      <span className="mult-worked">{worked(value)}</span>
      {hint && <span className="setting-description">{hint}</span>}
    </div>
  );

  return (
    <div className="card full-width">
      <div className="card-header">
        <h2>Overtime multipliers</h2>
      </div>
      <div className="card-body">
        <p className="setting-description">
          How much each overtime tier charges compared with the normal rate. A base rate
          of $50 with a ×1.5 multiplier bills at $75 an hour.
        </p>
        <div className="mult-grid">
          {field('ot1Mult', 'Overtime 1', '', ot1Mult, setOt1Mult, ot1Error)}
          {field('ot2Mult', 'Overtime 2', '', ot2Mult, setOt2Mult, ot2Error)}
          {field('holidayMult', 'Public holiday', 'Charged on marked holiday dates.', holidayMult, setHolidayMult, holidayError)}
        </div>
        {/* Read from the hours painted on the weekly schedule, never a fixed sentence. */}
        {schedule && (
          <p className="setting-description mult-from-schedule">
            From your schedule: Overtime 1 = {summariseTierHours(schedule, 'ot1', 'below')} {'\u00b7'} Overtime 2 = {summariseTierHours(schedule, 'ot2', 'below')}
          </p>
        )}
        <div className="sched-save">
          <button type="button" className="btn btn-primary" onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save multipliers'}
          </button>
          {dirty && <span className="unsaved-pill"><span className="unsaved-pill-dot" aria-hidden="true" />Unsaved changes</span>}
        </div>
      </div>
    </div>
  );
}
