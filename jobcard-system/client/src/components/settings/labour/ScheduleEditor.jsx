import { useRef, useState } from 'react';
import { Copy } from 'lucide-react';
import { DAYS, TIERS, gridFromBlocks } from '../../../hooks/useLabourRates';

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const TIER_LABEL = { normal: 'Normal', ot1: 'Overtime 1', ot2: 'Overtime 2' };

// Reolink-style weekly painter: pick a rate (the "brush"), then click or drag across
// the 7×24 grid to paint each hour. Painting a cell folds back into the stored blocks.
export default function ScheduleEditor({ schedule, paintHour, copyDayToAll, onSave, saving }) {
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
        <h2>Weekly Overtime Schedule</h2>
      </div>
      <div className="card-body">
        <p className="setting-description">
          Pick a rate, then click or drag across the hours to paint each day. Every hour of
          the week is charged at the rate you paint it. Public holidays (below) override the
          whole day.
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
                        aria-label={`${day.label} ${String(h).padStart(2, '0')}:00 — ${TIER_LABEL[grid[h]]}`}
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
                    <Copy size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="sched-save">
          <button type="button" className="btn btn-primary" onClick={onSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}
