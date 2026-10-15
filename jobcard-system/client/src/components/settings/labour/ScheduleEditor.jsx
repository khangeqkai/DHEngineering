import { useRef, useState } from 'react';
import { Copy } from 'lucide-react';
import { DAYS, TIERS } from '../../../hooks/useLabourRates';
import { gridFromBlocks } from '../../../../../server/src/shared/overtimeSchedule';

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const TIER_LABEL = { normal: 'Normal', ot1: 'Overtime 1', ot2: 'Overtime 2' };
const TIER_WORDS = { normal: 'normal', ot1: 'overtime 1', ot2: 'overtime 2' };

const hourText = (h) => `${String(h).padStart(2, '0')}:00`;

// One day's painted hours as a sentence: "overtime 2 until 07:00, normal 07:00–15:00,
// overtime 1 15:00–17:00, overtime 2 after 17:00". A day painted one rate reads "… all day".
function describeDay(grid) {
  const runs = [];
  for (let h = 0; h < 24; h++) {
    const last = runs[runs.length - 1];
    if (last && last.tier === grid[h]) last.end = h + 1;
    else runs.push({ tier: grid[h], start: h, end: h + 1 });
  }
  if (runs.length === 1) return `${TIER_WORDS[runs[0].tier]} all day`;
  return runs.map(r => {
    if (r.start === 0) return `${TIER_WORDS[r.tier]} until ${hourText(r.end)}`;
    if (r.end === 24) return `${TIER_WORDS[r.tier]} after ${hourText(r.start)}`;
    return `${TIER_WORDS[r.tier]} ${hourText(r.start)}\u2013${hourText(r.end)}`;
  }).join(', ');
}

// One line per stretch of days that share the same painting (Mon–Fri, Sat, Sun).
function summariseWeek(schedule) {
  const lines = [];
  DAYS.forEach((day) => {
    const text = describeDay(gridFromBlocks(schedule[day.key]));
    const short = day.label.slice(0, 3);
    const last = lines[lines.length - 1];
    if (last && last.text === text) last.to = short;
    else lines.push({ from: short, to: short, text });
  });
  return lines.map(l => ({
    key: `${l.from}-${l.to}`,
    label: l.from === l.to ? l.from : `${l.from}\u2013${l.to}`,
    text: l.text
  }));
}

// Reolink-style weekly painter: pick a rate (the "brush"), then click or drag across
// the 7×24 grid to paint each hour. Painting a cell folds back into the stored blocks.
export default function ScheduleEditor({ schedule, paintHour, copyDayToAll, onSave, saving, dirty }) {
  const [brush, setBrush] = useState('ot1');
  const painting = useRef(false);
  const gridRef = useRef(null);

  // Paint whatever cell sits under a screen point (works for both mouse and touch).
  const paintAt = (x, y) => {
    const el = document.elementFromPoint(x, y);
    const cell = el && el.closest ? el.closest('[data-day]') : null;
    if (cell) paintHour(cell.dataset.day, Number(cell.dataset.hour), brush);
  };

  const onDown = (e) => {
    const cell = e.target.closest && e.target.closest('[data-day]');
    if (!cell) return; // a day label / copy button / tick — leave its own click alone
    painting.current = true;
    try { gridRef.current.setPointerCapture(e.pointerId); } catch { /* older engines */ }
    paintHour(cell.dataset.day, Number(cell.dataset.hour), brush);
  };
  const onMove = (e) => { if (painting.current) paintAt(e.clientX, e.clientY); };
  const endStroke = () => { painting.current = false; };

  // Keyboard: arrow keys rove focus across the grid; Enter / Space paints the brush.
  const onCellKeyDown = (e, dIndex, hour) => {
    let nd = dIndex, nh = hour;
    if (e.key === 'ArrowLeft') nh = (hour + 23) % 24;
    else if (e.key === 'ArrowRight') nh = (hour + 1) % 24;
    else if (e.key === 'ArrowUp') nd = (dIndex + DAYS.length - 1) % DAYS.length;
    else if (e.key === 'ArrowDown') nd = (dIndex + 1) % DAYS.length;
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      paintHour(DAYS[dIndex].key, hour, brush);
      return;
    } else return;
    e.preventDefault();
    const next = gridRef.current?.querySelector(`[data-day="${DAYS[nd].key}"][data-hour="${nh}"]`);
    if (next) next.focus();
  };

  return (
    <div className="card full-width">
      <div className="card-header">
        <h2>Weekly overtime schedule</h2>
      </div>
      <div className="card-body">
        <p className="setting-description">
          Pick a rate, then click or drag across the hours to paint each day. Every hour of
          the week is charged at the rate you paint it. Public holidays (below) override the
          whole day. A clock still running at the end of normal hours stops there, and its
          worker is asked at their next sign-in whether they worked later.
        </p>

        {/* Brush picker — the rate you paint with (doubles as the colour legend) */}
        <div className="paint-brushes" role="radiogroup" aria-label="Rate to paint with">
          {TIERS.map(t => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={brush === t.value}
              className={`paint-brush${brush === t.value ? ' is-active' : ''}`}
              onClick={() => setBrush(t.value)}
            >
              <span className={`paint-brush-dot sched-seg--${t.value}`} />
              {t.label}
            </button>
          ))}
        </div>

        <div className="paint-scroll">
          <div
            className="paint-grid"
            ref={gridRef}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={endStroke}
            onPointerCancel={endStroke}
          >
            {/* Hour ruler */}
            <div className="paint-row paint-row--head">
              <span className="paint-daylabel" />
              <div className="paint-ticks">
                {HOURS.map(h => (
                  <span key={h} className="paint-tick">{h % 2 === 0 ? h : ''}</span>
                ))}
              </div>
              <span aria-hidden="true" />
            </div>

            {DAYS.map((day, dIndex) => {
              const grid = gridFromBlocks(schedule[day.key]);
              return (
                <div className="paint-row" key={day.key}>
                  <span className="paint-daylabel">{day.label.slice(0, 3)}</span>
                  <div className="paint-bar">
                    {HOURS.map(h => (
                      <button
                        key={h}
                        type="button"
                        data-day={day.key}
                        data-hour={h}
                        tabIndex={dIndex === 0 && h === 0 ? 0 : -1}
                        className={`paint-cell sched-seg--${grid[h]}`}
                        aria-label={`${day.label} ${hourText(h)} — ${TIER_LABEL[grid[h]]}`}
                        title={`${day.label} ${hourText(h)} \u00b7 ${TIER_LABEL[grid[h]]}`}
                        onKeyDown={(e) => onCellKeyDown(e, dIndex, h)}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    className="paint-copy"
                    aria-label={`Copy ${day.label} to all days`}
                    title="Copy this day to every day"
                    onClick={() => copyDayToAll(day.key)}
                  >
                    <Copy size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <ul className="sched-summary" aria-label="The week in words">
          {summariseWeek(schedule).map(line => (
            <li key={line.key}><strong>{line.label}:</strong> {line.text}</li>
          ))}
        </ul>

        <div className="sched-save">
          <button type="button" className={`btn ${dirty ? 'btn-primary' : 'btn-secondary'}`} onClick={onSave} disabled={saving || !dirty}>
            {saving ? 'Saving…' : dirty ? 'Save schedule' : 'Saved'}
          </button>
          {dirty && <span className="unsaved-pill"><span className="unsaved-pill-dot" aria-hidden="true" />Unsaved changes</span>}
        </div>
      </div>
    </div>
  );
}
