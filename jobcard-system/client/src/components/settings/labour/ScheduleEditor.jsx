import { useState } from 'react';
import { Trash2, Copy, Plus } from 'lucide-react';
import { DAYS, TIERS } from '../../../hooks/useLabourRates';

const TIER_LABEL = { normal: 'Normal', ot1: 'Overtime 1', ot2: 'Overtime 2' };

const toMin = (hm) => {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
};

// Turn a day's start-ordered blocks into drawn segments (each runs to the next start).
function segments(blocks) {
  return blocks.map((b, i) => {
    const start = toMin(b.start);
    const end = i < blocks.length - 1 ? toMin(blocks[i + 1].start) : 24 * 60;
    return { ...b, index: i, start, end, width: ((end - start) / (24 * 60)) * 100 };
  });
}

// One day's row: a 24h bar + an editable block list + an add-block control.
function DayRow({ day, blocks, setBlockTier, addBlock, removeBlock, copyDayToAll }) {
  const [newStart, setNewStart] = useState('06:00');
  const [newTier, setNewTier] = useState('ot1');
  const segs = segments(blocks);

  return (
    <div className="sched-day">
      <div className="sched-day-head">
        <span className="sched-day-name">{day.label}</span>
        <button type="button" className="btn-link sched-copy" onClick={() => copyDayToAll(day.key)}>
          <Copy size={13} /> Copy to all days
        </button>
      </div>

      {/* Visual 24h bar */}
      <div className="sched-bar" role="img" aria-label={`${day.label} schedule`}>
        {segs.map(s => (
          <div
            key={s.index}
            className={`sched-seg sched-seg--${s.tier}`}
            style={{ width: `${s.width}%` }}
            title={`${blocks[s.index].start} — ${TIER_LABEL[s.tier]}`}
          >
            <span className="sched-seg-label">{blocks[s.index].start}</span>
          </div>
        ))}
      </div>

      {/* Editable block list */}
      <div className="sched-blocks">
        {blocks.map((b, i) => (
          <div className="sched-block" key={i}>
            <span className="sched-block-time">{b.start}{i === 0 && <span className="sched-anchor"> (start)</span>}</span>
            <select
              className="form-control sched-tier-select"
              value={b.tier}
              onChange={(e) => setBlockTier(day.key, i, e.target.value)}
            >
              {TIERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            {i > 0 ? (
              <button type="button" className="icon-btn" aria-label="Remove block" onClick={() => removeBlock(day.key, i)}>
                <Trash2 size={14} />
              </button>
            ) : (
              <span className="sched-block-spacer" />
            )}
          </div>
        ))}
      </div>

      {/* Add a block */}
      <div className="sched-add">
        <input
          type="time"
          className="form-control sched-add-time"
          value={newStart}
          onChange={(e) => setNewStart(e.target.value)}
          step="60"
        />
        <select className="form-control sched-tier-select" value={newTier} onChange={(e) => setNewTier(e.target.value)}>
          {TIERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => { if (newStart && newStart !== '00:00') addBlock(day.key, newStart, newTier); }}
          disabled={!newStart || newStart === '00:00'}
        >
          <Plus size={14} /> Add
        </button>
      </div>
    </div>
  );
}

export default function ScheduleEditor({ schedule, setBlockTier, addBlock, removeBlock, copyDayToAll, onSave, saving }) {
  return (
    <div className="card full-width">
      <div className="card-header">
        <h2>Weekly Overtime Schedule</h2>
      </div>
      <div className="card-body">
        <p className="setting-description">
          Set what each hour of the week charges. Each day is a 24-hour timeline split
          into blocks — a block runs until the next one starts. The first block always
          begins at midnight. Public holidays (below) override the whole day.
        </p>

        <div className="sched-legend">
          <span className="sched-legend-item"><span className="sched-swatch sched-seg--normal" /> Normal</span>
          <span className="sched-legend-item"><span className="sched-swatch sched-seg--ot1" /> Overtime 1</span>
          <span className="sched-legend-item"><span className="sched-swatch sched-seg--ot2" /> Overtime 2</span>
        </div>

        <div className="sched-grid">
          {DAYS.map(day => (
            <DayRow
              key={day.key}
              day={day}
              blocks={schedule[day.key]}
              setBlockTier={setBlockTier}
              addBlock={addBlock}
              removeBlock={removeBlock}
              copyDayToAll={copyDayToAll}
            />
          ))}
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
