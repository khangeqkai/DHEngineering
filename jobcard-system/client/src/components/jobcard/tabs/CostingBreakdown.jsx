import { useMemo, Fragment } from 'react';
import { useTags } from '../../../hooks/useTags';

// A read-only table under the costing header: the supporting figures for the pricing
// boxes below. ONE table, so everything about a part is on one horizontal band and is
// never looked up in two places:
//
//    part on the far left · material · treatment and supplier · machine · who · hours
//
//  · A part's material, treatment and supplier are merged down its machine rows, so a
//    part reads as one block however many runs it took.
//  · Six columns, not eight. Treatment and its supplier share a cell because they are
//    one fact — who is doing what to this part — and the part's own total sits under
//    its name rather than in a column of its own. Both were costing width that every
//    other column then had to give up as an ellipsis.
//  · Every figure sits in a single right-aligned column in tabular mono, so comparing
//    two numbers is one eye movement down, never a hunt across the panel.
//  · The job total sits at the foot of the column it totals, where the eye lands.
//
// Everything is worked out from data the screen already holds — no saving, no fetching.

// Milliseconds → "6h 15m". Under an hour reads as "45m" so short blocks stay tidy.
function formatSpan(ms) {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

// The same span as a decimal figure — the form the Hours boxes above take, so this is
// the column an admin actually transcribes from.
function formatDecimalHours(ms) {
  return (Math.round((ms / 3600000) * 100) / 100).toFixed(2);
}

// A block can be logged on more than one machine at once. Its span can't be split
// between them without inventing figures, so the machines are kept together as one
// row — "CNC-01 + MILL-01" — which is what actually happened.
//
// Only the machine's own code (CNC-01, LATHE-02) — that is how the shop refers to it,
// and it is what the worker picked. Carrying the make and model as well ("CNC-01 ·
// Haas VF-2SS") took so much of the row that the material and the worker's name were
// both cut off to pay for it, which is a bad trade for information nobody needs here.
function machineLabel(raw) {
  const list = String(raw || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  if (list.length === 0) return 'No machine';
  return list.join(' + ');
}

const DASH = <span className="cb-nil">—</span>;

export default function CostingBreakdown({ lineItems = [], timeEntries = [] }) {
  // The raw option lists (rather than the ready-made lookup) so the tables below can
  // be worked out once and reused: the ready-made lookup is a fresh function on every
  // render, which would rebuild them each time the screen redraws — and this screen
  // redraws once a second while a timer runs.
  const { rawTags: materialTags } = useTags('material');
  const { rawTags: treatmentTags } = useTags('treatment');
  const { rawTags: jobTypeTags } = useTags('job_type');

  // Retired options are included, so a value saved before an option was retired still
  // shows its real name instead of the stored code.
  const nameOf = (tags, value) => tags.find(t => t.value === value)?.name || value;

  // Gather every finished block under the part it was worked on, then under the
  // machine-and-worker pairing inside that part. Blocks are matched to a part by the
  // part's PERMANENT id, never by its position number — a number is only a display
  // position that shifts when parts are added or removed. Blocks whose part has since
  // been deleted are kept in their own group rather than dropped, so the hours always
  // add up to what was logged.
  const { parts, orphan, runningCount, jobTotalMs } = useMemo(() => {
    const buckets = new Map();
    let running = 0;
    let total = 0;

    timeEntries.forEach(entry => {
      if (!entry.endTime) {
        running += 1;
        return;
      }
      const span = new Date(entry.endTime) - new Date(entry.startTime);
      if (!Number.isFinite(span) || span <= 0) return;

      const key = entry.itemId != null ? String(entry.itemId) : '';
      const rowLabel = machineLabel(entry.machineNumber);
      const worker = entry.userName || 'Unknown';
      const rowKey = `${rowLabel}||${worker}`;

      if (!buckets.has(key)) buckets.set(key, { totalMs: 0, rows: new Map() });
      const bucket = buckets.get(key);
      bucket.totalMs += span;
      total += span;

      if (!bucket.rows.has(rowKey)) bucket.rows.set(rowKey, { rowLabel, worker, ms: 0 });
      bucket.rows.get(rowKey).ms += span;
    });

    // Longest run first, so the machine that ate the part leads its own block.
    const sorted = (rows) => [...rows].sort((a, b) => b.ms - a.ms);

    const rowsOf = (key) => {
      const bucket = buckets.get(key);
      if (!bucket) return [];
      return sorted([...bucket.rows.values()]);
    };
    const totalOf = (key) => (buckets.get(key) ? buckets.get(key).totalMs : 0);

    const partList = [...lineItems]
      .sort((a, b) => (Number(a.itemNumber) || 0) - (Number(b.itemNumber) || 0))
      .map(item => {
        const key = item.id != null ? String(item.id) : '';
        const treatment = (Array.isArray(item.treatments) && item.treatments[0]) || null;
        return {
          id: item.id,
          itemNumber: item.itemNumber,
          description: item.description || '',
          jobType: item.jobType ? nameOf(jobTypeTags, item.jobType) : '',
          material: item.material ? nameOf(materialTags, item.material) : '',
          treatment: treatment && treatment.value ? nameOf(treatmentTags, treatment.value) : '',
          supplier: (treatment && treatment.supplierName) || '',
          totalMs: totalOf(key),
          rows: rowsOf(key)
        };
      });

    const known = new Set(partList.map(p => (p.id != null ? String(p.id) : '')));
    const orphanRows = [];
    let orphanMs = 0;
    buckets.forEach((bucket, key) => {
      if (known.has(key)) return;
      orphanMs += bucket.totalMs;
      orphanRows.push(...bucket.rows.values());
    });
    const orphanGroup = orphanRows.length > 0
      ? { totalMs: orphanMs, rows: sorted(orphanRows) }
      : null;

    return { parts: partList, orphan: orphanGroup, runningCount: running, jobTotalMs: total };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineItems, timeEntries, materialTags, treatmentTags, jobTypeTags]);

  // One part = one block of rows. The part, its material, its treatment and its
  // supplier are merged down however many machine runs it took, so the part reads as a
  // single horizontal band and nothing about it has to be looked up elsewhere.
  const partBlock = (part, key) => {
    const runs = part.rows.length > 0 ? part.rows : [null];
    const span = runs.length;
    return runs.map((run, i) => (
      <tr className={i === 0 ? 'cb-row--first' : undefined} key={`${key}-${i}`}>
        {i === 0 && (
          <>
            <th scope="rowgroup" rowSpan={span} className="cb-c-item">
              <span className="cb-item-line">
                <span className="cb-item-no">{part.itemNumber}</span>
                <span className="cb-item-name">{part.description || 'No description'}</span>
              </span>
              <span className="cb-item-sub">
                {part.rows.length > 0 && (
                  <span className="cb-item-total">{formatDecimalHours(part.totalMs)} h</span>
                )}
                {part.jobType && <span className="cb-item-note">{part.jobType}</span>}
              </span>
            </th>
            <td rowSpan={span} className="cb-c-mat">{part.material || DASH}</td>
            <td rowSpan={span} className="cb-c-treat">
              {!part.treatment ? DASH : (
                <>
                  {part.treatment}
                  <span className="cb-supp">
                    {part.supplier || <span className="cb-gap">No supplier chosen</span>}
                  </span>
                </>
              )}
            </td>
          </>
        )}
        <td className="cb-c-mach">
          {run ? run.rowLabel : <span className="cb-nil">Nothing logged</span>}
        </td>
        <td className="cb-c-who">{run ? run.worker : ''}</td>
        <td className="cb-c-hours">
          {run ? (
            <>
              {formatDecimalHours(run.ms)}
              <span className="cb-hours-hm">{formatSpan(run.ms)}</span>
            </>
          ) : DASH}
        </td>
      </tr>
    ));
  };

  if (parts.length === 0 && !orphan) {
    return (
      <section className="cost-brief" aria-label="What this job used">
        <p className="cb-empty">Add a part to the job and its time will show up here.</p>
      </section>
    );
  }

  return (
    <section className="cost-brief" aria-label="What this job used">
      <div className="cb-head">
        <h4 className="cb-title">What this job has used</h4>
        <span className="cb-note">finished blocks only · a block on two machines counts once</span>
      </div>

      <div className="cb-scroll">
        <table className="cb-table">
          <thead>
            <tr>
              <th scope="col" className="cb-c-item">Part</th>
              <th scope="col" className="cb-c-mat">Material</th>
              <th scope="col" className="cb-c-treat">Treatment &amp; supplier</th>
              <th scope="col" className="cb-c-mach">Machine</th>
              <th scope="col" className="cb-c-who">Who</th>
              <th scope="col" className="cb-c-hours">Hours</th>
            </tr>
          </thead>
          <tbody>
            {parts.map(part => (
              <Fragment key={part.id || part.itemNumber}>{partBlock(part, part.id)}</Fragment>
            ))}
            {orphan && (
              <Fragment key="orphan">
                {partBlock({
                  itemNumber: '—',
                  description: 'Work on a deleted part',
                  jobType: '',
                  material: '',
                  treatment: '',
                  supplier: '',
                  totalMs: orphan.totalMs,
                  rows: orphan.rows
                }, 'orphan')}
              </Fragment>
            )}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={5} className="cb-c-foot">Total logged</th>
              <td className="cb-c-hours">
                {formatDecimalHours(jobTotalMs)}
                <span className="cb-hours-hm">{formatSpan(jobTotalMs)}</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {runningCount > 0 && (
        <p className="cb-running">
          {runningCount === 1
            ? 'One timer is still running — its time is not counted here yet.'
            : `${runningCount} timers are still running — their time is not counted here yet.`}
        </p>
      )}
    </section>
  );
}
