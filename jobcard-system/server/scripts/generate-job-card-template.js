/**
 * Generate a fillable PDF template for job card information.
 *
 * This creates a PDF with form fields matching the data visible to
 * non-admin users. When a job card is created with a QA level that
 * includes this template, the fields get auto-filled with job data
 * and copied to the job's QA Forms folder.
 *
 * Usage: node scripts/generate-job-card-template.js [output-path]
 * Default output: ./Job-Card-Info.pdf
 */

const { PDFDocument, StandardFonts, rgb, grayscale } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function generateTemplate(outputPath) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const form = pdfDoc.getForm();

  const page = pdfDoc.addPage([595, 842]); // A4
  const { width, height } = page.getSize();

  const margin = 40;
  const contentWidth = width - margin * 2;
  const labelColor = rgb(0.25, 0.25, 0.25);
  const headerColor = rgb(0.12, 0.12, 0.45);
  const lineColor = rgb(0.78, 0.78, 0.78);
  const fieldBorder = rgb(0.7, 0.7, 0.7);
  const fieldHeight = 20;
  const labelSize = 7.5;
  const headerSize = 10;

  // y tracks top of next element (decreasing downward)
  let y = height - margin;

  // ─── Title ───
  page.drawText('DH Engineering', {
    x: margin, y, size: 18, font: fontBold, color: headerColor
  });
  y -= 16;
  page.drawText('Job Card Information', {
    x: margin, y, size: 12, font, color: rgb(0.4, 0.4, 0.4)
  });
  y -= 10;
  page.drawLine({
    start: { x: margin, y }, end: { x: width - margin, y },
    thickness: 1.5, color: headerColor
  });
  y -= 18;

  // ─── Helpers ───

  function drawSectionHeader(text) {
    page.drawText(text.toUpperCase(), {
      x: margin, y, size: headerSize, font: fontBold, color: headerColor
    });
    y -= 4;
    page.drawLine({
      start: { x: margin, y }, end: { x: width - margin, y },
      thickness: 0.5, color: lineColor
    });
    y -= 14;
  }

  // Draw a label + field. y is the top of the label.
  // Returns nothing; mutates nothing (caller manages y).
  function drawField(label, fieldName, x, w) {
    // Label
    page.drawText(label, {
      x, y, size: labelSize, font: fontBold, color: labelColor
    });
    // Field box below label
    const fieldY = y - labelSize - 3 - fieldHeight;
    const textField = form.createTextField(fieldName);
    textField.addToPage(page, {
      x, y: fieldY, width: w, height: fieldHeight,
      borderWidth: 0.5, borderColor: fieldBorder
    });
    textField.setFontSize(9);
  }

  // Draw a row of fields. Each field: { label, name, flex }
  // flex values are relative (e.g. 1, 1, 1 = equal widths)
  function drawRow(fields) {
    const gap = 10;
    const totalFlex = fields.reduce((s, f) => s + (f.flex || 1), 0);
    const availableWidth = contentWidth - gap * (fields.length - 1);

    let x = margin;
    for (const f of fields) {
      const w = availableWidth * ((f.flex || 1) / totalFlex);
      drawField(f.label, f.name, x, w);
      x += w + gap;
    }
    // Advance y past label + gap + field
    y -= labelSize + 3 + fieldHeight + 12;
  }

  // Draw a full-width multiline field
  function drawLargeField(label, fieldName, h) {
    page.drawText(label, {
      x: margin, y, size: labelSize, font: fontBold, color: labelColor
    });
    const fieldY = y - labelSize - 3 - h;
    const textField = form.createTextField(fieldName);
    textField.addToPage(page, {
      x: margin, y: fieldY, width: contentWidth, height: h,
      borderWidth: 0.5, borderColor: fieldBorder
    });
    textField.enableMultiline();
    textField.setFontSize(9);
    y -= labelSize + 3 + h + 12;
  }

  // ─── Classification ───
  drawSectionHeader('Classification');
  drawRow([
    { label: 'Job Number', name: 'job_number', flex: 2 },
    { label: 'Status', name: 'status', flex: 1 },
    { label: 'Job Type', name: 'job_type', flex: 1.5 }
  ]);

  // ─── Scheduling ───
  drawSectionHeader('Scheduling');
  drawRow([
    { label: 'Priority', name: 'priority', flex: 1 },
    { label: 'Due Date', name: 'due_date', flex: 1 },
    { label: 'Date Created', name: 'date', flex: 1 }
  ]);

  // ─── Contact ───
  drawSectionHeader('Contact');
  drawRow([
    { label: 'Contact Name', name: 'contact_name', flex: 1 },
    { label: 'Company', name: 'company_name', flex: 1 }
  ]);

  // ─── Job Description ───
  drawSectionHeader('Job Description');
  drawLargeField('Description', 'description', 50);

  // ─── Customer Input ───
  drawSectionHeader('Customer Input');
  drawRow([
    { label: 'Quality Level', name: 'quality_level', flex: 1 },
    { label: 'Customer Property', name: 'customer_property', flex: 1.2 },
    { label: 'Drawings', name: 'drawings_type', flex: 1 }
  ]);

  // ─── References ───
  drawSectionHeader('References');
  drawRow([
    { label: 'PO Number', name: 'po_number', flex: 1 },
    { label: 'Quote Reference', name: 'quote_reference', flex: 1 }
  ]);

  // ─── Treatment ───
  drawSectionHeader('Treatment');
  drawRow([
    { label: 'Treatment Required', name: 'treatment_required', flex: 1 },
    { label: 'Treatment Other', name: 'treatment_other', flex: 1 }
  ]);

  // ─── Notes (empty box for manual use) ───
  drawSectionHeader('Notes');
  const notesBottom = margin + 20; // leave room for footer
  const notesHeight = y - notesBottom;
  if (notesHeight > 20) {
    page.drawRectangle({
      x: margin, y: notesBottom,
      width: contentWidth, height: notesHeight,
      borderWidth: 0.5, borderColor: lineColor,
      color: rgb(0.98, 0.98, 0.98)
    });
  }

  // ─── Footer ───
  page.drawText(
    'Auto-generated template \u2014 fields are filled automatically on job card creation',
    { x: margin, y: 12, size: 6.5, font, color: grayscale(0.55) }
  );

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
