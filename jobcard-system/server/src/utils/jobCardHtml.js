// Renders a job card as a self-contained printable HTML page. Pure presentation:
// it receives already-friendly data (see buildJobCardView in jobcard-helpers.js)
// and returns an HTML string. It's shown as the on-screen preview in the paperwork
// hub and rendered to PDF server-side (see htmlToPdf.js) to lead the combined
// packet. Nothing is saved to disk.
//
// Colours mirror the app palette (client/src/index.css): navy #0f2645 + blue #2563eb.

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const CSS = `
  :root {
    --ink:#0f1729; --navy:#0f2645; --muted:#7c869b; --faint:#9aa1ab; --line:#e3e6ee;
    --band:#f4f6f9; --accent:#2563eb; --accent-soft:#e8f0fe; --page:210mm; --pad:16mm;
  }
  * { box-sizing:border-box; }
  html,body { margin:0; background:#fff; color:var(--ink);
    font-family:"Segoe UI","Helvetica Neue",Arial,system-ui,sans-serif;
    font-size:10.5pt; line-height:1.35; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .sheet { padding:var(--pad); }
  .head { display:flex; align-items:flex-end; justify-content:space-between;
    padding-bottom:10px; border-bottom:2.5px solid var(--navy); }
  .title { font-size:26pt; font-weight:800; letter-spacing:.5px; line-height:1; color:var(--navy); }
  .title small { display:block; font-size:8.5pt; font-weight:600; letter-spacing:2.5px; color:var(--muted); margin-top:6px; }
  .brand { text-align:right; }
  .brand .name { font-size:13pt; font-weight:800; }
  .brand .tag { font-size:8pt; color:var(--muted); letter-spacing:.4px; }
  .jobno { margin-top:14px; display:flex; align-items:center; gap:14px; }
  .jobno .num { font-size:18pt; font-weight:800; color:var(--accent); letter-spacing:.5px; }
  .pill { font-size:8pt; font-weight:800; letter-spacing:1px; text-transform:uppercase;
    padding:3px 10px; border-radius:999px; border:1.5px solid currentColor; }
  .pill.high { color:#dc2626; background:#fef2f2; border-color:#fecaca; }
  .pill.normal { color:#15803d; background:#f0fdf4; border-color:#bbf7d0; }
  .meta { margin-top:16px; display:grid; grid-template-columns:repeat(2,1fr);
    gap:1px; background:var(--line); border:1px solid var(--line); }
  .meta .cell { background:#fff; padding:9px 12px; }
  .meta .cell.span { grid-column:1 / -1; }
  .meta .lbl { font-size:7.5pt; font-weight:700; letter-spacing:1.2px; text-transform:uppercase; color:var(--muted); }
  .meta .val { font-size:11.5pt; font-weight:600; margin-top:2px; }
  .items-h { margin:22px 0 8px; display:flex; align-items:baseline; justify-content:space-between; }
  .items-h h2 { margin:0; font-size:9pt; font-weight:800; letter-spacing:2px; text-transform:uppercase; }
  .items-h .count { font-size:8.5pt; color:var(--muted); }
  .item { border:1px solid var(--line); border-left:3px solid var(--accent); border-radius:2px;
    margin-bottom:8px; display:flex; overflow:hidden; page-break-inside:avoid; break-inside:avoid; }
  .item .no { flex:0 0 30px; background:var(--accent-soft); color:var(--accent);
    font-size:13pt; font-weight:800; display:flex; align-items:center; justify-content:center; }
  .item .body { flex:1; padding:8px 12px 10px; }
  .frow { display:flex; gap:18px; }
  .frow + .frow { margin-top:8px; padding-top:8px; border-top:1px dashed var(--line); }
  .f { min-width:0; }
  .f .lbl { font-size:7pt; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:var(--muted); }
  .f .val { font-size:10.5pt; font-weight:600; margin-top:1px; white-space:normal; overflow-wrap:anywhere; }
  .f .val.na { color:var(--faint); font-weight:500; }
  .f .val .file { font-size:8.5pt; font-weight:500; color:var(--muted); margin-top:1px; }
  .f .val .file.missing { color:#dc2626; font-weight:700; }
  .f.qty { flex:0 0 60px; }
  .f.jobtype { flex:0 0 110px; }
  .f.desc { flex:1; }
  .f.material { flex:1 1 0; }
  .f.drawings { flex:1 1 0; }
  .f.treatment { flex:1.4 1 0; }
  .f.property { flex:1 1 0; }
  .foot { margin-top:22px; padding-top:10px; border-top:1px solid var(--line);
    display:flex; justify-content:space-between; align-items:flex-end; font-size:8pt; color:var(--muted); }
  .sign { display:flex; gap:30px; }
  .sign .slot { width:150px; }
  .sign .ln { border-bottom:1px solid var(--ink); height:26px; }
  .sign .cap { font-size:7.5pt; letter-spacing:.5px; margin-top:3px; }
  /* A real page margin so EVERY printed page keeps a clean border — not just the
     first and last. (Putting the margin in .sheet padding instead only spaces the
     very top and bottom of the whole document, so a multi-page card runs its
     continuation pages right off the paper edge.) The card is rendered to PDF
     server-side with page headers/footers turned off, so there's no browser
     date/URL band to leave room for. The on-screen preview keeps .sheet padding
     since @page margins don't apply on screen; print zeroes that padding so the
     page margin isn't doubled. */
  @page { size:A4 portrait; margin:12mm; }
  @media print { .sheet { padding:0; } }
`;

function renderItem(it) {
  let drawings;
  if (it.drawingsIsNa) {
    drawings = `<div class="val na">${esc(it.drawings || 'N/A')}</div>`;
  } else {
    // Drawing name on top; the attached file name(s) on a second, smaller line —
    // every matching file listed, or a red "Missing" when none are on disk yet.
    const files = (it.drawingFiles && it.drawingFiles.length)
      ? it.drawingFiles.map(f => `<div class="file">${esc(f)}</div>`).join('')
      : `<div class="file missing">Missing</div>`;
    drawings = `<div class="val">${esc(it.drawings)}${files}</div>`;
  }
  let property;
  if (it.customerPropertyIsNa) {
    property = `<div class="val na">${esc(it.customerProperty || 'N/A')}</div>`;
  } else {
    // Property name on top; the attached file name(s) on a second, smaller line —
    // every matching file listed, or a red "Missing" when none are on disk yet.
    const propFiles = (it.propertyFiles && it.propertyFiles.length)
      ? it.propertyFiles.map(f => `<div class="file">${esc(f)}</div>`).join('')
      : `<div class="file missing">Missing</div>`;
    property = `<div class="val">${esc(it.customerProperty)}${propFiles}</div>`;
  }
  return `
  <div class="item">
    <div class="no">${esc(it.number)}</div>
    <div class="body">
      <div class="frow">
        <div class="f jobtype"><div class="lbl">Job type</div><div class="val">${esc(it.jobType)}</div></div>
        <div class="f qty"><div class="lbl">Qty</div><div class="val">${esc(it.qty)}</div></div>
        <div class="f desc"><div class="lbl">Description</div><div class="val">${esc(it.description)}</div></div>
      </div>
      <div class="frow">
        <div class="f material"><div class="lbl">Material</div><div class="val">${esc(it.material)}</div></div>
        <div class="f treatment"><div class="lbl">Treatment</div><div class="val">${esc(it.treatment)}</div></div>
        <div class="f drawings"><div class="lbl">Drawings</div>${drawings}</div>
        <div class="f property"><div class="lbl">Customer property</div>${property}</div>
      </div>
    </div>
  </div>`;
}

/**
 * @param {Object} view - friendly, pre-formatted job card data:
 *   { jobNumber, priorityLabel|null, priorityClass, dateCreated, dueDate, company,
 *     printed, items: [{ number, qty, jobType, description, material, drawings,
 *     drawingsIsNa, drawingFiles, drawingsMissing, treatment, customerProperty,
 *     customerPropertyIsNa, propertyFiles, customerPropertyMissing }] }
 * @returns {string} full HTML document
 */
function renderJobCardHtml(view) {
  const v = view || {};
  const items = Array.isArray(v.items) ? v.items : [];
  const pill = v.priorityLabel
    ? `<span class="pill ${v.priorityClass === 'high' ? 'high' : 'normal'}">${esc(v.priorityLabel)} priority</span>`
    : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Job Card ${esc(v.jobNumber)}</title>
<style>${CSS}</style></head>
<body>
<div class="sheet">
  <div class="head">
    <div class="title">JOB CARD<small>MANUFACTURING / INSPECTION</small></div>
    <div class="brand"><div class="name">DH Engineering</div><div class="tag">Precision Engineering &amp; Manufacturing</div></div>
  </div>
  <div class="jobno"><span class="num">${esc(v.jobNumber)}</span>${pill}</div>
  <div class="meta">
    <div class="cell"><div class="lbl">Date created</div><div class="val">${esc(v.dateCreated)}</div></div>
    <div class="cell"><div class="lbl">Due date</div><div class="val">${esc(v.dueDate)}</div></div>
    <div class="cell span"><div class="lbl">Company</div><div class="val">${esc(v.company)}</div></div>
  </div>
  <div class="items-h"><h2>Items</h2><span class="count">${items.length} ${items.length === 1 ? 'part' : 'parts'}</span></div>
  ${items.map(renderItem).join('')}
  <div class="foot">
    <div class="sign">
      <div class="slot"><div class="ln"></div><div class="cap">Inspected by</div></div>
      <div class="slot"><div class="ln"></div><div class="cap">Date</div></div>
    </div>
    <div>Printed ${esc(v.printed)} &middot; DH Engineering Job Card System</div>
  </div>
</div>
</body></html>`;
}

module.exports = { renderJobCardHtml };
