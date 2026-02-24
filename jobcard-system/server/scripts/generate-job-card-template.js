/**
 * Generate a fillable PDF template for job card information.
 *
 * Typography follows the app's design system (Plus Jakarta Sans scale):
 *   Title: 24pt (text-2xl), Subtitle: 16pt (text-base),
 *   Section headers: 14pt (text-sm), Labels: 11pt, Field values: 11pt,
 *   Table headers: 10pt, Footer: 8pt
 *
 * Layout (2 pages):
 *   Page 1: Title, Classification, Scheduling, Contact, Job Description,
 *           Customer Input, Treatment
 *   Page 2: Title, Items (5 rows), Notes (large box)
 *
 * Usage: node scripts/generate-job-card-template.js [output-path]
 * Default output: ./Job-Card-Info.pdf
 */

const { PDFDocument, StandardFonts, rgb, grayscale } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

const ITEM_ROWS = 5;

async function generateTemplate(outputPath) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const form = pdfDoc.getForm();

  const pageWidth = 595;
  const pageHeight = 842; // A4
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;

  // Colors
  const labelColor = rgb(0.25, 0.25, 0.25);
  const headerColor = rgb(0.12, 0.12, 0.45);
  const lineColor = rgb(0.78, 0.78, 0.78);
  const fieldBorder = rgb(0.7, 0.7, 0.7);

  // Typography — matching app design system
  const titleSize = 24;       // text-2xl (page title, wt 700)
  const subtitleSize = 16;    // text-base
  const headerSize = 14;      // text-sm (section headers, wt 600)
  const labelSize = 11;       // field labels (wt 600)
  const fieldFontSize = 11;   // form field values (text-sm equivalent)
  const tableHeaderSize = 10; // table column headers
  const itemFieldSize = 10;   // item row field values
  const footerSize = 8;       // text-xs

  const fieldHeight = 24;
  const itemRowHeight = 22;

  // ─── Page-scoped drawing helpers ───

  function drawTitle(page, y) {
    page.drawText('DH Engineering', {
      x: margin, y, size: titleSize, font: fontBold, color: headerColor
    });
    y -= 20;
    page.drawText('Job Card Information', {
      x: margin, y, size: subtitleSize, font, color: rgb(0.4, 0.4, 0.4)
    });
    y -= 14;
    page.drawLine({
      start: { x: margin, y }, end: { x: pageWidth - margin, y },
      thickness: 1.5, color: headerColor
    });
    y -= 22;
    return y;
  }

  function drawSectionHeader(page, y, text) {
    page.drawText(text.toUpperCase(), {
      x: margin, y, size: headerSize, font: fontBold, color: headerColor
    });
    y -= 6;
    page.drawLine({
      start: { x: margin, y }, end: { x: pageWidth - margin, y },
      thickness: 0.5, color: lineColor
    });
    y -= 16;
    return y;
  }

  function drawField(page, y, label, fieldName, x, w) {
    page.drawText(label, {
      x, y, size: labelSize, font: fontBold, color: labelColor
    });
    const fieldY = y - labelSize - 4 - fieldHeight;
    const textField = form.createTextField(fieldName);
    textField.addToPage(page, {
      x, y: fieldY, width: w, height: fieldHeight,
      borderWidth: 0.5, borderColor: fieldBorder
    });
    textField.setFontSize(fieldFontSize);
  }

  function drawRow(page, y, fields) {
    const gap = 12;
    const totalFlex = fields.reduce((s, f) => s + (f.flex || 1), 0);
    const availableWidth = contentWidth - gap * (fields.length - 1);

    let x = margin;
    for (const f of fields) {
      const w = availableWidth * ((f.flex || 1) / totalFlex);
      drawField(page, y, f.label, f.name, x, w);
      x += w + gap;
    }
    return y - (labelSize + 4 + fieldHeight + 22);
  }

  function drawLargeField(page, y, label, fieldName, h) {
    page.drawText(label, {
      x: margin, y, size: labelSize, font: fontBold, color: labelColor
    });
    const fieldY = y - labelSize - 4 - h;
    const textField = form.createTextField(fieldName);
    textField.addToPage(page, {
      x: margin, y: fieldY, width: contentWidth, height: h,
      borderWidth: 0.5, borderColor: fieldBorder
    });
    textField.enableMultiline();
    textField.setFontSize(fieldFontSize);
    return y - (labelSize + 4 + h + 22);
  }

  function drawFooter(page, pageNum, totalPages) {
    page.drawText(
      `Page ${pageNum} of ${totalPages}  \u2014  Auto-generated template \u2014 fields are filled automatically on job card creation`,
      { x: margin, y: 14, size: footerSize, font, color: grayscale(0.55) }
    );
  }

  // ════════════════════════════════════════
  //  PAGE 1: Classification, Scheduling, Contact, Description,
  //          Customer Input, Treatment
  // ════════════════════════════════════════

  const page1 = pdfDoc.addPage([pageWidth, pageHeight]);
  let y1 = pageHeight - margin;

  y1 = drawTitle(page1, y1);

  // Classification
  y1 = drawSectionHeader(page1, y1, 'Classification');
  y1 = drawRow(page1, y1, [
    { label: 'Job Number', name: 'job_number', flex: 2 },
    { label: 'Status', name: 'status', flex: 1 },
    { label: 'Job Type', name: 'job_type', flex: 1.5 }
  ]);

  // Scheduling
  y1 = drawSectionHeader(page1, y1, 'Scheduling');
  y1 = drawRow(page1, y1, [
    { label: 'Priority', name: 'priority', flex: 1 },
    { label: 'Due Date', name: 'due_date', flex: 1 },
    { label: 'Date Created', name: 'date', flex: 1 }
  ]);

  // Contact
  y1 = drawSectionHeader(page1, y1, 'Contact');
  y1 = drawRow(page1, y1, [
    { label: 'Contact Name', name: 'contact_name', flex: 1 },
    { label: 'Company', name: 'company_name', flex: 1 }
  ]);

  // Job Description
  y1 = drawSectionHeader(page1, y1, 'Job Description');
  y1 = drawLargeField(page1, y1, 'Description', 'description', 60);

  // Customer Input
  y1 = drawSectionHeader(page1, y1, 'Customer Input');
  y1 = drawRow(page1, y1, [
    { label: 'Quality Level', name: 'quality_level', flex: 1 },
    { label: 'Customer Property', name: 'customer_property', flex: 1.2 },
    { label: 'Drawings', name: 'drawings_type', flex: 1 }
  ]);

  // Treatment
  y1 = drawSectionHeader(page1, y1, 'Treatment');
  y1 = drawRow(page1, y1, [
    { label: 'Treatment Required', name: 'treatment_required', flex: 1 },
    { label: 'Treatment Other', name: 'treatment_other', flex: 1 }
  ]);

  drawFooter(page1, 1, 2);

  // ════════════════════════════════════════
  //  PAGE 2: Items table, Notes
  // ════════════════════════════════════════

  const page2 = pdfDoc.addPage([pageWidth, pageHeight]);
  let y2 = pageHeight - margin;

  y2 = drawTitle(page2, y2);

  // Items table
  y2 = drawSectionHeader(page2, y2, 'Items');

  const colNum = { x: margin, w: 45 };
  const colQty = { x: margin + 57, w: 55 };
  const colDesc = { x: margin + 124, w: contentWidth - 124 };

  page2.drawText('#', {
    x: colNum.x, y: y2, size: tableHeaderSize, font: fontBold, color: labelColor
  });
  page2.drawText('Qty', {
    x: colQty.x, y: y2, size: tableHeaderSize, font: fontBold, color: labelColor
  });
  page2.drawText('Description', {
    x: colDesc.x, y: y2, size: tableHeaderSize, font: fontBold, color: labelColor
  });
  y2 -= 6;
  page2.drawLine({
    start: { x: margin, y: y2 }, end: { x: pageWidth - margin, y: y2 },
    thickness: 0.5, color: lineColor
  });
  y2 -= 6;

  for (let i = 1; i <= ITEM_ROWS; i++) {
    const fieldY = y2 - itemRowHeight;

    const numField = form.createTextField(`item_${i}_number`);
    numField.addToPage(page2, {
      x: colNum.x, y: fieldY, width: colNum.w, height: itemRowHeight,
      borderWidth: 0.5, borderColor: fieldBorder
    });
    numField.setFontSize(itemFieldSize);

    const qtyField = form.createTextField(`item_${i}_qty`);
    qtyField.addToPage(page2, {
      x: colQty.x, y: fieldY, width: colQty.w, height: itemRowHeight,
      borderWidth: 0.5, borderColor: fieldBorder
    });
    qtyField.setFontSize(itemFieldSize);

    const descField = form.createTextField(`item_${i}_description`);
    descField.addToPage(page2, {
      x: colDesc.x, y: fieldY, width: colDesc.w, height: itemRowHeight,
      borderWidth: 0.5, borderColor: fieldBorder
    });
    descField.setFontSize(itemFieldSize);

    y2 -= itemRowHeight + 3;
  }

  y2 -= 16; // gap before notes

  // Notes (large box filling remaining space)
  y2 = drawSectionHeader(page2, y2, 'Notes');
  const notesBottom = margin + 24;
  const notesHeight = y2 - notesBottom;
  if (notesHeight > 20) {
    page2.drawRectangle({
      x: margin, y: notesBottom,
      width: contentWidth, height: notesHeight,
      borderWidth: 0.5, borderColor: lineColor,
      color: rgb(0.98, 0.98, 0.98)
    });
  }

  drawFooter(page2, 2, 2);

  // ─── Save ───
  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, pdfBytes);
  console.log(`Template created: ${outputPath}`);
  console.log(`File size: ${(pdfBytes.length / 1024).toFixed(1)} KB`);
  console.log('\nForm fields:');
  form.getFields().forEach(f => console.log(`  - ${f.getName()}`));
}

const outputPath = process.argv[2] || path.join(__dirname, '..', 'Job-Card-Info.pdf');
generateTemplate(outputPath).catch(err => {
  console.error('Failed to generate template:', err);
  process.exit(1);
});
