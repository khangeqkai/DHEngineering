# QA PDF Template Guide

When creating custom PDF templates for QA levels, you can include **fillable form fields** that the system will auto-populate with job card data when the template is copied to a job.

## How It Works

1. Admin uploads a PDF template to a QA level
2. When a job card is created/updated with that QA level, the system copies each template PDF into the job's `QA Documents/` folder
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
| Treatment Required | `treatment`, `treatment_required`, `treatmentrequired` |
| Treatment Other | `treatment_other`, `treatmentother` |
| Repeat Job (Yes/No) | `repeat_job`, `repeatjob` |
| Repeat Job Reference | `repeat_job_reference`, `repeatjobreference`, `repeat_ref`, `repeatref` |
| Notes | `notes` |

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
      Drawings/
      QA Documents/              ← Job-specific copies (auto-filled)
        DHE-F39.pdf              ← filled with JC-001 data
        DHE-F15.pdf              ← filled with JC-001 data
```
