function formatNum(n) {
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

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
        : `${formatNum(s)} scrapped of ${formatNum(run)} run — ${formatNum(b)} binned, ${formatNum(r)} recycled (${formatNum(g)} good)`}
    >
      <span className="scrap-stat-glyph" aria-hidden="true">⚠</span>
      <span className="scrap-stat-num">{formatNum(s)}</span>
      <span className="scrap-stat-unit">scrap</span>
      {s > 0 && (
        <span className="scrap-stat-split">({formatNum(b)} bin · {formatNum(r)} recycle)</span>
      )}
    </span>
  );
}
