// The time zone the weekly schedule and public holidays are measured against. Set
// automatically on first install from the server's own clock; this lets an admin see
// and correct it, since getting it wrong shifts every overtime window.
export default function TimezoneCard({ timezone, setTimezone, onSave, saving }) {
  // Offer the system's known zones when the browser/runtime supports it, otherwise
  // fall back to a free-text box. Always include the current value so it's shown.
  let zones = [];
  try {
    if (typeof Intl.supportedValuesOf === 'function') zones = Intl.supportedValuesOf('timeZone');
  } catch {
    zones = [];
  }
  if (timezone && !zones.includes(timezone)) zones = [timezone, ...zones];

  return (
    <div className="card full-width">
      <div className="card-header">
        <h2>Time Zone</h2>
      </div>
      <div className="card-body">
        <p className="setting-description">
          Work is matched to the schedule using this time zone. It should be the
          workshop's local time. Changing it re-sorts which hours count as overtime.
        </p>

        {zones.length > 0 ? (
          <select
            className="form-control"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          >
            {zones.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
        ) : (
          <input
            type="text"
            className="form-control"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            placeholder="e.g. Australia/Sydney"
          />
        )}

        <div className="sched-save">
          <button type="button" className="btn btn-primary" onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save time zone'}
          </button>
        </div>
      </div>
    </div>
  );
}
