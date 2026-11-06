import FieldError from '../common/FieldError';

export default function SecurityCard({ s }) {
  const timeoutError = s.errorFor('inactivityTimeout');
  const jobNumberPrefixError = s.errorFor('jobNumberPrefix');
  const jobNumberNextError = s.errorFor('jobNumberNext');
  return (
    <>
      <div className="card full-width">
        <div className="card-header">
          <h2>Automatic sign-out</h2>
        </div>
        <div className="card-body">
          <div className="setting-item">
            <div className="setting-info">
              <label className="setting-label" htmlFor="inactivityTimeout">Sign out after</label>
              <div className="setting-description">
                Signs people out when nobody has used the app for this many minutes (1 to 60).
                A warning shows 30 seconds before it happens.
                Admins are never signed out this way.
              </div>
            </div>
          </div>
          <div className={timeoutError ? 'timeout-input-group field-error' : 'timeout-input-group'}>
            <input
              type="text"
              inputMode="numeric"
              id="inactivityTimeout"
              className="form-control timeout-input"
              value={s.inactivityTimeout}
              onChange={(e) => s.setInactivityTimeout(e.target.value.replace(/[^0-9]/g, ''))}
              aria-invalid={timeoutError ? true : undefined}
              aria-describedby={timeoutError ? 'inactivityTimeout-error' : undefined}
            />
            <span className="timeout-label">minutes</span>
            <button
              type="button"
              className="btn btn-primary"
              onClick={s.handleSaveInactivityTimeout}
              disabled={s.savingTimeout}
            >
              {s.savingTimeout ? 'Saving…' : 'Save'}
            </button>
          </div>
          <FieldError message={timeoutError} id="inactivityTimeout-error" />
        </div>
      </div>

      <div className="card full-width">
        <div className="card-header">
          <h2>Job card numbering</h2>
        </div>
        <div className="card-body">
          <div className="setting-item">
            <div className="setting-info">
              <div className="setting-label">Job numbers</div>
              <div className="setting-description">
                Set the letters at the front and the starting number. Each new job card gets the next number by itself.
                Zeros at the front are kept (00001 is followed by 00002). Next job number: {s.jobNumberPrefix}{s.jobNumberNext || '—'}
              </div>
            </div>
          </div>
          <div className="job-number-input-group">
            <div className={jobNumberPrefixError ? 'form-group field-error job-number-field' : 'form-group job-number-field'}>
              <label className="form-label" htmlFor="jobNumberPrefix">Prefix</label>
              <input
                type="text"
                id="jobNumberPrefix"
                className="form-control job-prefix-input"
                value={s.jobNumberPrefix}
                onChange={(e) => s.setJobNumberPrefix(e.target.value)}
                placeholder="Letters before the number"
                aria-invalid={jobNumberPrefixError ? true : undefined}
                aria-describedby={jobNumberPrefixError ? 'jobNumberPrefix-error' : undefined}
              />
              <FieldError message={jobNumberPrefixError} id="jobNumberPrefix-error" />
            </div>
            <div className={jobNumberNextError ? 'form-group field-error job-number-field' : 'form-group job-number-field'}>
              <label className="form-label" htmlFor="jobNumberNext">Starting Number</label>
              <input
                type="text"
                id="jobNumberNext"
                className="form-control job-start-input"
                value={s.jobNumberNext}
                onChange={(e) => s.setJobNumberNext(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="Digits only"
                aria-invalid={jobNumberNextError ? true : undefined}
                aria-describedby={jobNumberNextError ? 'jobNumberNext-error' : undefined}
              />
              <FieldError message={jobNumberNextError} id="jobNumberNext-error" />
            </div>
            <div className="form-group job-number-field">
              <button
                type="button"
                className="btn btn-primary"
                onClick={s.handleSaveJobNumber}
                disabled={s.savingJobNumber}
              >
                {s.savingJobNumber ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
