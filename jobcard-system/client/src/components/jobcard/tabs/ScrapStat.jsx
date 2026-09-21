import { AlertTriangle } from 'lucide-react';
import { formatCount } from '../../../utils/formatters';

// Scrap count for a log entry — always shown (including "0 scrap"). Scrap is split
// into binned and recycled pieces; the inline number is the combined total, with the
// bin/recycle breakdown and the out-of-how-many detail in the tooltip.
export default function ScrapStat({ bin, recycle, good }) {
  const b = Number(bin) || 0;
  const r = Number(recycle) || 0;
  const s = b + r;
  const g = Number(good) || 0;
  const run = g + s;

  return (
    <span
      className="scrap-stat"
      title={s <= 0
        ? 'No pieces scrapped'
        : `${formatCount(s)} scrapped of ${formatCount(run)} run — ${formatCount(b)} binned, ${formatCount(r)} recycled (${formatCount(g)} good)`}
    >
      <span className="scrap-stat-glyph" aria-hidden="true"><AlertTriangle size={14} /></span>
      <span className="scrap-stat-num">{formatCount(s)}</span>
      <span className="scrap-stat-unit">scrap</span>
      {s > 0 && (
        <span className="scrap-stat-split">({formatCount(b)} bin · {formatCount(r)} recycle)</span>
      )}
    </span>
  );
}
