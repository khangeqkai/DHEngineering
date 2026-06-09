function formatNum(n) {
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

// Scrap count for a log entry — always shown (including "0 scrap"). The out-of-how-many
// detail is in the tooltip.
export default function ScrapStat({ scrap, good }) {
  const s = Number(scrap) || 0;
  const g = Number(good) || 0;
  const run = g + s;

  return (
    <span
      className="scrap-stat"
      title={s <= 0
        ? 'No pieces scrapped'
        : `${formatNum(s)} scrapped of ${formatNum(run)} run (${formatNum(g)} good + ${formatNum(s)} scrap)`}
    >
      <span className="scrap-stat-glyph" aria-hidden="true">⚠</span>
      <span className="scrap-stat-num">{formatNum(s)}</span>
      <span className="scrap-stat-unit">scrap</span>
    </span>
  );
}
