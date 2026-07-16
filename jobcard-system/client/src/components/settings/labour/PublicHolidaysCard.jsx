import { useState } from 'react';
import { CalendarPlus, X } from 'lucide-react';
import CalendarPicker from '../../common/CalendarPicker';

// Show a stored YYYY-MM-DD as "Fri, 25 Dec 2026".
function pretty(date) {
  const d = new Date(date + 'T00:00:00');
  if (isNaN(d)) return date;
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// Add/remove specific calendar dates that charge the whole day at the holiday rate,
// overriding that day's normal weekly blocks.
export default function PublicHolidaysCard({ holidays, addHoliday, removeHoliday, onSave, saving }) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="card full-width">
      <div className="card-header">
        <h2>Public Holidays</h2>
      </div>
      <div className="card-body">
        <p className="setting-description">
          Any work logged on these dates is charged all day at the public-holiday rate,
          overriding that day's normal schedule.
        </p>

        <button type="button" className="btn btn-secondary" onClick={() => setPickerOpen(true)}>
          <CalendarPlus size={16} /> Add a date
        </button>

        {holidays.length === 0 ? (
          <div className="empty-state holiday-empty">No public holidays added yet.</div>
        ) : (
          <div className="holiday-chips">
            {holidays.map(date => (
              <span className="holiday-chip" key={date}>
                {pretty(date)}
                <button type="button" className="holiday-chip-x" aria-label={`Remove ${date}`} onClick={() => removeHoliday(date)}>
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="sched-save">
          <button type="button" className="btn btn-primary" onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save holidays'}
          </button>
        </div>
      </div>

      <CalendarPicker
        isOpen={pickerOpen}
        value={null}
        onSelect={(date) => addHoliday(date)}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  );
}
