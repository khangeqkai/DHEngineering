export default function SecurityCard({ s }) {
  return (
    <>
      <div className="card full-width">
        <div className="card-header">
          <h2>Security Settings</h2>
        </div>
        <div className="card-body">
          <div className="setting-item">
            <div className="setting-info">
              <div className="setting-label">Inactivity Timeout</div>
              <div className="setting-description">
                Automatically log out users after this many minutes of inactivity.
                A warning will appear 30 seconds before logout. (1-60 minutes)
              </div>
            </div>
          </div>
          <div className="timeout-input-group">
            <input
              type="number"
              className="form-control timeout-input"
              value={s.inactivityTimeout}
              onChange={(e) => s.setInactivityTimeout(Math.max(1, Math.min(60, parseInt(e.target.value, 10) || 1)))}
              min="1"
              max="60"
            />
            <span className="timeout-label">minutes</span>
            <button
              type="button"
              className="btn btn-primary"
              onClick={s.handleSaveInactivityTimeout}
              disabled={s.savingTimeout}
            >
              {s.savingTimeout ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      <div className="card full-width">
        <div className="card-header">
          <h2>Job Card Numbering</h2>
        </div>
        <div className="card-body">
          <div className="setting-item">
            <div className="setting-info">
              <div className="setting-label">Auto-Generated Job Numbers</div>
              <div className="setting-description">
                Set a prefix and starting number for job cards. Numbers auto-increment with each new job card.
                Leading zeros are preserved (e.g. 00001 → 00002). Preview: {s.jobNumberPrefix}{s.jobNumberNext || '—'}
              </div>
            </div>
          </div>
          <div className="job-number-input-group">
            <div className="form-group" style={{ flex: '0 0 auto' }}>
              <label className="form-label">Prefix</label>
              <input
                type="text"
                className="form-control"
                value={s.jobNumberPrefix}
                onChange={(e) => s.setJobNumberPrefix(e.target.value)}
                placeholder="e.g. DH-"
                style={{ width: '120px' }}
              />
            </div>
            <div className="form-group" style={{ flex: '0 0 auto' }}>
              <label className="form-label">Starting Number</label>
              <input
                type="text"
                className="form-control"
                value={s.jobNumberNext}
                onChange={(e) => s.setJobNumberNext(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="e.g. 00001"
                style={{ width: '160px' }}
              />
            </div>
            <div className="form-group" style={{ flex: '0 0 auto', alignSelf: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={s.handleSaveJobNumber}
                disabled={s.savingJobNumber}
              >
                {s.savingJobNumber ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
