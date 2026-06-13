# QA PDF Template Guide

This guide covers **two separate kinds of PDF template**, both of which use the same fillable field names listed below:

1. **Job card printout** — ONE global template, uploaded once under **Settings → Job Card Printout**. When anyone clicks **Print job card** on a job, this template is filled with that job's data and saved as a single file at the top of the job's folder (`Job Card {jobNumber}.pdf`), then printed. It is a print-and-keep summary: nothing is scanned back, and it is **never** counted as a missing file before invoicing.
2. **Quality forms** — per-QA-level inspection templates (see below). These are printed, hand-filled, and scanned back. A returned form is **only required before invoicing** when the QA level's **"Requires completed form returned"** switch is on; levels with it off are print-only and never trigger the missing-quality-form warning.

When creating custom PDF templates (either kind), you can include **fillable form fields** that the system will auto-populate with job card data.

## How It Works

1. Admin uploads a PDF template to a QA level
2. When a job card is created/updated with that QA level, the system copies each template PDF into the job's `QA Forms/` folder
3. During the copy, `pdf-lib` scans the PDF for fillable form fields and matches field names against the table below
4. Matched fields are auto-filled with the job's data
5. If a PDF has **no fillable fields** (e.g. a blank form for handwriting), it is copied as-is — no errors

## Available Field Names

Use any of these names when creating fillable text fields in your PDF form. Field name matching is **case-insensitive**.

| Job Data | Accepted Field Names |
|----------|---------------------|
| Job Number | `job_number`, `jobnumber`, `job number`, `job_no`, `jobno` |
| Company Name | `company`, `company_name`, `companyname`, `customer` |
| Contact Name | `contact`, `contact_name`, `contactname` |
| Date (created) | `date` |
| Quality Level | `quality_level`, `qualitylevel`, `qa_level`, `qalevel` |
| Status | `status` |
| Description | `description`, `job_description` |
| Job Type | `job_type`, `jobtype` |
| Priority | `priority` |
| Due Date | `due_date`, `duedate` |
| PO Number | `po_number`, `ponumber`, `po` |
| Quote Reference | `quote_reference`, `quotereference`, `quote_ref`, `quoteref` |
| Drawings Type | `drawings_type`, `drawingstype`, `drawings` |
| Customer Property | `customer_property`, `customerproperty` |
| Treatment Required | `treatment`, `treatment_required`, `treatmentrequired` (formatted as `Treatment → Supplier, ...` across all items) |
| Repeat Job (Yes/No) | `repeat_job`, `repeatjob` |
| Repeat Job Reference | `repeat_job_reference`, `repeatjobreference`, `repeat_ref`, `repeatref` |

### Item Fields (Indexed)

Job items use indexed field names. Add as many rows as you need (up to 50). Unfilled slots stay blank; extra items beyond the template's slots are silently skipped.

| Item Data | Field Name Pattern | Example (item 1) |
|-----------|--------------------|-------------------|
| Item Number | `item_N_number` | `item_1_number` |
| Quantity | `item_N_qty` | `item_1_qty` |
| Description | `item_N_description` | `item_1_description` |
| Job Type | `item_N_job_type` | `item_1_job_type` |
| Material | `item_N_material` | `item_1_material` |
| Treatment | `item_N_treatment` (formatted as `Treatment → Supplier, ...`) | `item_1_treatment` |

Where `N` is the 1-based item index (1, 2, 3, ...). For example, a template with 5 item rows would have fields: `item_1_number`, `item_1_qty`, `item_1_description`, `item_2_number`, ..., `item_5_description`.

## Creating a Template PDF

### Option A: Fillable PDF (auto-populated fields + handwritten sections)

Use any PDF editor that supports form fields (Adobe Acrobat, LibreOffice Draw, PDF-XChange):

1. Design your form layout (headers, tables, checkboxes, signature lines, etc.)
2. Add **fillable text fields** where you want job data auto-filled
3. Name each field using one of the accepted names from the table above
4. Leave other areas blank for workers to fill by hand
5. Save as PDF and upload to the QA level

### Option B: Static PDF (fully handwritten)

If you just want a blank template that workers fill entirely by hand:

1. Create your form layout as a regular PDF (no fillable fields needed)
2. Upload to the QA level
3. The system will copy it to each job's folder unchanged

### Tips

- Field names are matched **case-insensitively** — `Job_Number`, `JOB_NUMBER`, and `job_number` all work
- Unrecognized field names are left empty (not an error)
- Read-only fields are skipped silently
- If the PDF is encrypted or corrupted, the original file is copied as-is
- You can mix auto-filled fields and blank areas in the same PDF

## File Location Reference

```
[job_folders_base]/
  QA Levels/
    Standard/                    ← QA level template storage
      DHE-F39.pdf
      DHE-F15.pdf
    Critical/
      DHE-F39.pdf
      critical-inspection.pdf

  ACME Corp/
    JC-001/
      Job Files/
      QA Forms/                  ← Job-specific copies (auto-filled)
        DHE-F39.pdf              ← filled with JC-001 data
        DHE-F15.pdf              ← filled with JC-001 data
```
