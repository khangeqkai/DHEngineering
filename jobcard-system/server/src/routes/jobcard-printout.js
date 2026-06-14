const express = require('express');
const fs = require('fs');
const path = require('path');
const { body, param } = require('express-validator');

const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { handleValidationErrors } = require('../middleware/validation');
const { buildJobCardView } = require('./jobcard-helpers');
const { renderJobCardHtml } = require('../utils/jobCardHtml');
const { resolveCategoryFolder, listCategoryFileNames } = require('./jobcard-files');
const { isWithinBase } = require('../utils/folderCreation');
const { buildPacketPdf } = require('../utils/pdfPacket');
const { jobcardQueries, recordHistory } = require('../db/database');

const VALID_PACKET_EXT = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp', '.gif']);
const MAX_PACKET_ITEMS = 20;
// Cap the job-card PDF that rides up in the request (the actual files stay on the
// server). 8 MB raw → ceil(*4/3) base64 chars. The combined response can be much
// larger, bounded instead by MAX_PACKET_BYTES below.
const MAX_JOBCARD_PDF_CHARS = Math.ceil((8 * 1024 * 1024 * 4) / 3);
const MAX_PACKET_BYTES = 40 * 1024 * 1024;
// Ceiling on the total bytes of on-disk files we'll pull into memory at once while
// building a packet. With 20 items at the 30 MB per-file upload cap that tops out
// at 600 MB; we bail with 413 before reading past it so a big batch can't exhaust
// the shared server's memory. (The much smaller MAX_PACKET_BYTES bounds the final
// merged output; this bounds the raw input we read to build it.)
const MAX_PACKET_INPUT_BYTES = 600 * 1024 * 1024;

// The job card printout is generated per job as an HTML page and printed on demand.
// Nothing is stored on disk — the on-screen job is the live record, so a saved
// snapshot would only ever be stale. (Quality inspection forms are a separate
// feature and still use uploaded per-QA-level PDF templates.)

const printRouter = express.Router();

// POST /api/jobcards/:id/print — build the job card as HTML from the job's current
// data and return it for printing. The desktop app prints the HTML directly; the
// web build prints it in a hidden iframe. Works whether or not job-folder storage
// is configured, since it never writes a file.
printRouter.post('/:id/print', authenticate, (req, res) => {
  try {
    const jobcard = jobcardQueries.getById.get(req.params.id);
    if (!jobcard) {
      return res.status(404).json({ error: 'Job card not found' });
    }

    const view = buildJobCardView(req.params.id, jobcard);
    const html = renderJobCardHtml(view);

    recordHistory('jobcard', req.params.id, 'update', req.user.userId, req.user.name || req.user.username, {
      jobCardPrinted: { from: null, to: new Date().toISOString() }
    });

    res.json({ html });
  } catch (err) {
    logger.error({ err }, 'Print job card error');
    res.status(500).json({ error: 'Failed to generate job card printout' });
  }
});

// POST /api/jobcards/:id/packet — weld the chosen job documents into one combined
// PDF for printing or saving. The big file bytes never travel up: the client sends
// only the small list of {category, filename} to include plus (optionally) the
// already-rendered job-card PDF; the server reads each chosen file straight off
// disk. A file that can't be read or decoded is skipped and reported, never failing
// the whole packet.
const validatePacket = [
  param('id').isString().trim().notEmpty(),
  body('items').isArray({ max: MAX_PACKET_ITEMS }).withMessage('Too many items'),
  body('items.*.category').isString().notEmpty(),
  body('items.*.filename').isString().notEmpty().custom((v) => {
    if (v.includes('/') || v.includes('\\') || v.includes('..')) {
      throw new Error('Invalid filename');
    }
    return true;
  }),
  body('jobCardPdf').optional({ nullable: true }).isString().custom((v) => {
    if (v.length > MAX_JOBCARD_PDF_CHARS) throw new Error('Job card PDF too large');
    return true;
  }),
  handleValidationErrors
];

printRouter.post('/:id/packet', authenticate, validatePacket, async (req, res) => {
  try {
    const { id } = req.params;
    const items = req.body.items || [];
    const jobCardPdf = req.body.jobCardPdf || null;

    if (!jobcardQueries.getById.get(id)) {
      return res.status(404).json({ error: 'Job card not found' });
    }

    // Verify every requested name against the live folder listing — a name that
    // isn't actually in the folder is rejected (blocks traversal and guessing).
    const categories = [...new Set(items.map(i => i.category))];
    const listing = listCategoryFileNames(id, categories);

    // Resolve each category folder once (the company lookup is the costly part).
    const folderByCategory = {};
    for (const category of categories) {
      const res2 = resolveCategoryFolder(id, category);
      if (res2.error) return res.status(res2.status).json({ error: res2.error });
      folderByCategory[category] = res2.folderPath;
    }

    const cardBuf = jobCardPdf ? Buffer.from(jobCardPdf, 'base64') : null;

    const files = [];
    const skipped = [];
    // Keep a running total of everything we hold in memory (the job-card PDF plus
    // each file as we read it) and stop before crossing the input ceiling.
    let totalBytes = cardBuf ? cardBuf.length : 0;
    for (const { category, filename } of items) {
      const ext = path.extname(filename).toLowerCase();
      if (!VALID_PACKET_EXT.has(ext)) { skipped.push({ name: filename, reason: 'unsupported' }); continue; }

      const allowed = listing[category];
      if (!allowed || !allowed.includes(filename)) { skipped.push({ name: filename, reason: 'missing' }); continue; }

      const folderPath = folderByCategory[category];
      const filePath = path.join(folderPath, filename);
      if (!isWithinBase(folderPath, filePath)) { skipped.push({ name: filename, reason: 'missing' }); continue; }
      if (!fs.existsSync(filePath)) { skipped.push({ name: filename, reason: 'missing' }); continue; }

      totalBytes += fs.statSync(filePath).size;
      if (totalBytes > MAX_PACKET_INPUT_BYTES) {
        return res.status(413).json({ error: 'Selected files are too large to combine at once; print in smaller batches' });
      }

      files.push({ name: filename, ext, bytes: fs.readFileSync(filePath) });
    }

    const { pdf, skipped: buildSkipped } = await buildPacketPdf({ jobCardPdf: cardBuf, files });

    if (pdf.length > MAX_PACKET_BYTES) {
      return res.status(413).json({ error: 'Combined packet too large; print in smaller batches' });
    }

    recordHistory('jobcard', id, 'update', req.user.userId, req.user.name || req.user.username, {
      jobCardPacketPrinted: { from: null, to: new Date().toISOString() }
    });

    res.json({ pdf: pdf.toString('base64'), skipped: [...skipped, ...buildSkipped] });
  } catch (err) {
    logger.error({ err }, 'Build packet error');
    res.status(500).json({ error: 'Failed to build combined packet' });
  }
});

module.exports = printRouter;
