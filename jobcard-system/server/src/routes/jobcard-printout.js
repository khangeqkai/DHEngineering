const express = require('express');

const logger = require('../utils/logger');
const { authenticate } = require('../middleware/auth');
const { buildJobCardView } = require('./jobcard-helpers');
const { renderJobCardHtml } = require('../utils/jobCardHtml');
const { jobcardQueries, recordHistory } = require('../db/database');

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

module.exports = printRouter;
