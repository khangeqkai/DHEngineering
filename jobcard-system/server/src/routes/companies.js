const express = require('express');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const { authenticate, requireManagement } = require('../middleware/auth');
const { validateCreateCompany, validateUpdateCompany } = require('../middleware/validation');
const { companyQueries, contactQueries, recordHistory, actorName } = require('../db/database');
const { diffFields } = require('../utils/historyChanges');
const { ensureCompanyFolder, renameCompanyFolder } = require('../utils/folderCreation');
const { toCompanyApi: toApiFormat, toContactApi } = require('./customer-format');
const { setArchived } = require('../utils/archiveToggle');

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// GET /api/companies - Every customer (admin or manager). Pass ?includeArchived=true
// for the admin list's "Show archived" toggle, and ?withPeople=true to get each
// company's contact people nested — the job screen's customer picker loads the whole
// list once and then filters in the browser, so one call beats one per company.
router.get('/', requireManagement, (req, res) => {
  try {
    const includeArchived = req.query.includeArchived === 'true';
    const withPeople = req.query.withPeople === 'true';
    const rows = includeArchived
      ? companyQueries.getAllIncludeArchived.all()
      : companyQueries.getAll.all();

    const companies = rows.map(toApiFormat);
    if (withPeople) {
      for (const company of companies) {
        const people = includeArchived
          ? contactQueries.getByCompanyIncludeArchived.all(company.id)
          : contactQueries.getByCompany.all(company.id);
        company.people = people.map(toContactApi);
      }
    }
    res.json(companies);
  } catch (err) {
    logger.error({ err }, 'Failed to get companies');
    res.status(500).json({ error: 'Failed to get companies' });
  }
});

// POST /api/companies - Add a customer
router.post('/', requireManagement, validateCreateCompany, (req, res) => {
  try {
    const { name, address, notes } = req.body;

    // Company names must be unique (case-insensitive) so each customer maps to
    // exactly one folder on disk. An archived customer still owns its name, so
    // tell the admin to restore it rather than leaving them at a dead end.
    const existing = companyQueries.getByName.get(name);
    if (existing) {
      return res.status(409).json({
        error: existing.archived
          ? 'A customer with this company name already exists in the archive. Restore it from the archived list instead.'
          : 'A customer with this company name already exists'
      });
    }

    const id = uuidv4();
    companyQueries.create.run(id, name, address || null, notes || null);

    // Create the company folder on disk, stamped with this company's permanent
    // id so it survives later name changes (fire-and-forget)
    ensureCompanyFolder(id, name);

    const company = companyQueries.getById.get(id);
    recordHistory('company', id, 'create', req.user.userId, actorName(req), {
      name: { from: null, to: company.name }
    });

    res.status(201).json(toApiFormat(company));
  } catch (err) {
    logger.error({ err }, 'Failed to create company');
    res.status(500).json({ error: 'Failed to create company' });
  }
});

// PUT /api/companies/:id - Edit a customer
router.put('/:id', requireManagement, validateUpdateCompany, (req, res) => {
  try {
    const { id } = req.params;
    const { name, address, notes } = req.body;

    const existing = companyQueries.getById.get(id);
    if (!existing) return res.status(404).json({ error: 'Company not found' });

    const dupe = companyQueries.getByName.get(name);
    if (dupe && dupe.id !== id) {
      return res.status(409).json({
        error: dupe.archived
          ? 'A customer with this company name already exists in the archive. Restore it from the archived list instead.'
          : 'A customer with this company name already exists'
      });
    }

    const changes = diffFields(existing, [
      ['name', 'name', name],
      ['address', 'address', address || null],
      ['notes', 'notes', notes || null],
    ]);

    companyQueries.update.run(name, address || null, notes || null, id);
    const company = companyQueries.getById.get(id);

    // Name changed → relabel the existing folder on disk, located by the permanent
    // code in its name so its job files follow the rename instead of being
    // stranded under the old name (fire-and-forget).
    if (changes.name && name) {
      renameCompanyFolder(id, existing.name, name);
    }

    if (Object.keys(changes).length > 0) {
      recordHistory('company', id, 'update', req.user.userId, actorName(req), changes, toApiFormat(company));
    }

    res.json(toApiFormat(company));
  } catch (err) {
    logger.error({ err }, 'Failed to update company');
    res.status(500).json({ error: 'Failed to update company' });
  }
});

// POST /api/companies/:id/archive - Archive a customer (admin or manager). Customers
// are never deleted (track-and-trace): archiving hides them from pickers but keeps
// the record, the link from their jobs, and their files on disk intact.
router.post('/:id/archive', requireManagement, (req, res) => {
  const { id } = req.params;
  setArchived(req, res, {
    entityType: 'company',
    load: () => companyQueries.getById.get(id),
    notFound: 'Company not found',
    isArchived: (row) => Boolean(row.archived),
    archive: true,
    write: (row) => companyQueries.archive.run(row.id),
    respond: (row) => toApiFormat(row)
  });
});

// POST /api/companies/:id/unarchive - Restore an archived customer (admin or manager).
router.post('/:id/unarchive', requireManagement, (req, res) => {
  const { id } = req.params;
  setArchived(req, res, {
    entityType: 'company',
    load: () => companyQueries.getById.get(id),
    notFound: 'Company not found',
    isArchived: (row) => Boolean(row.archived),
    archive: false,
    write: (row) => companyQueries.unarchive.run(row.id),
    respond: (row) => toApiFormat(row)
  });
});

module.exports = router;
