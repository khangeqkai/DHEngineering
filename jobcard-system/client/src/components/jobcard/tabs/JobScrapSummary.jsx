import { useState } from 'react';

function parseQty(v) {
  if (v == null || v === '') return 0;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function formatNum(n) {
  if (!Number.isFinite(n)) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

// Job-level scrap roll-up: sums scrap (and good pieces) across every line item's
// completed time entries, and expands into a per-item breakdown on click.
export default function JobScrapSummary({ lineItems = [], timeEntries = [] }) {
  const [open, setOpen] = useState(false);

  const rows = lineItems.map(item => {
    const itemNum = String(item.itemNumber);
    let scrap = 0;
    let good = 0;
    for (const e of timeEntries) {
      if (!e.endTime || e.itemNumber == null) continue;
      if (String(e.itemNumber) !== itemNum) continue;
      scrap += parseQty(e.scrapQty);
      good += parseQty(e.qty);
    }
    return { itemNumber: item.itemNumber, description: item.description, scrap, good };
  });

  const totalScrap = rows.reduce((s, r) => s + r.scrap, 0);
  const totalGood = rows.reduce((s, r) => s + r.good, 0);
  const hasProduction = totalGood > 0 || totalScrap > 0;

  // Only meaningful for multi-item jobs that have something logged.
  if (lineItems.length < 2 || !hasProduction) return null;

  const rate = totalGood > 0 ? Math.round((totalScrap / totalGood) * 100) : null;
  const hasScrap = totalScrap > 0;

  return (
    <details
      className={`job-scrap-summary${hasScrap ? ' jss--has-scrap' : ' jss--clean'}`}
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="jss-summary">
        <span className="lip-label">Scrap · whole job</span>

        {hasScrap ? (
          <span className="lip-scrap">
            <span className="lip-scrap-glyph">⚠</span>
            <span className="lip-scrap-num">{formatNum(totalScrap)}</span>
            <span className="lip-scrap-unit">scrap</span>
            {rate != null && <span className="lip-scrap-rate">{rate}%</span>}
          </span>
        ) : (
          <span className="jss-clean-badge">
            <span className="jss-clean-glyph">✓</span>
            No scrap
          </span>
        )}

        <span className="jss-good">{formatNum(totalGood)} good</span>
        <span className="jss-toggle">{open ? 'Hide' : 'Per item'}</span>
        <span className="lip-chevron" aria-hidden="true">▾</span>
      </summary>

      <div className="jss-breakdown">
        {rows.map(r => (
          <div key={r.itemNumber} className={`jss-row${r.scrap > 0 ? ' jss-row--flag' : ''}`}>
            <span className="jss-row-num">#{r.itemNumber}</span>
            <span className="jss-row-desc">{r.description || 'No description'}</span>
            <span className="jss-row-scrap">
              {formatNum(r.scrap)} <span className="jss-row-unit">scrap</span>
            </span>
            <span className="jss-row-good">
              {formatNum(r.good)} <span className="jss-row-unit">good</span>
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}
