const { db } = require('./connection');
const logger = require('../utils/logger');

// A customer used to be a single row holding both the company and one person, with
// the company name unique — so one company could only ever have one contact. The
// company is now its own record and people sit under it, which is what lets Jane be
// replaced by Bob without a second Acme (and a second folder holding half the files).
//
// Each existing customer becomes one company with one person, and the company KEEPS
// THE OLD ROW'S ID — the id is the code stamped into the folder name on disk, so
// every job folder stays exactly where it is and nothing is renamed or moved.
//
// A table rebuild is required (SQLite can't drop a UNIQUE column in place), and the
// foreign-key pragma is turned off around it because dropping the old contacts table
// would otherwise trip the reference from jobcards. Idempotent: once the old
// company_name column is gone, this whole block is skipped.
function splitCustomersIntoCompanies() {
  try {
    const contactCols = db.prepare('PRAGMA table_info(contacts)').all();
    if (contactCols.some(c => c.name === 'company_name')) {
      db.pragma('foreign_keys = OFF');
      try {
        db.transaction(() => {
          db.exec(`
            INSERT OR IGNORE INTO companies (id, name, address, notes, archived, created_at, updated_at)
              SELECT id, company_name, address, notes, archived, created_at, updated_at
              FROM contacts WHERE company_name IS NOT NULL AND TRIM(company_name) <> '';

            CREATE TABLE contacts_rebuilt (
              id TEXT PRIMARY KEY,
              company_id TEXT NOT NULL,
              contact_name TEXT,
              phone TEXT,
              email TEXT,
              archived INTEGER DEFAULT 0,
              created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
              updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
              FOREIGN KEY (company_id) REFERENCES companies(id)
            );

            INSERT INTO contacts_rebuilt (id, company_id, contact_name, phone, email, archived, created_at, updated_at)
              SELECT c.id, c.id, c.contact_name, c.phone, c.email, c.archived, c.created_at, c.updated_at
              FROM contacts c WHERE EXISTS (SELECT 1 FROM companies co WHERE co.id = c.id);

            DROP TABLE contacts;
            ALTER TABLE contacts_rebuilt RENAME TO contacts;

            UPDATE jobcards SET company_id = contact_id
              WHERE company_id IS NULL AND contact_id IS NOT NULL;
          `);
        })();
        logger.info('Migration: Split customers into companies and their contact people');
      } finally {
        db.pragma('foreign_keys = ON');
      }
    }
  } catch (err) {
    // Unlike the other conversions, carrying on after this one fails is not an
    // option: the queries built moments later read columns this creates, so the
    // app would die on a confusing SQL error instead of the real reason.
    logger.error({ err }, 'Migration: Failed to split customers into companies and people');
    throw new Error(`Could not upgrade the customer records: ${err.message}`);
  }
}

/**
 * The same split, applied to the records inside a backup file rather than to the
 * live database. A backup taken before the change carries the old one-row-per-
 * customer shape; without this, restoring it would either be refused outright or
 * load contact rows with no company to belong to.
 *
 * Mutates and returns the parsed backup object. A backup already in the new shape
 * (it has a companies list) is handed straight back.
 */
function splitCustomersInBackup(data) {
  if (!data || Array.isArray(data.companies)) return data;
  if (!Array.isArray(data.contacts)) return data;

  const companies = [];
  const people = [];
  for (const row of data.contacts) {
    const name = (row.company_name || '').trim();
    if (!name) continue;
    // The company keeps the old row's id, exactly as the live conversion does, so
    // the company folders in the same backup still match by their code.
    companies.push({
      id: row.id,
      name,
      address: row.address ?? null,
      notes: row.notes ?? null,
      archived: row.archived ?? 0,
      created_at: row.created_at ?? null,
      updated_at: row.updated_at ?? null
    });
    people.push({
      id: row.id,
      company_id: row.id,
      contact_name: row.contact_name ?? null,
      phone: row.phone ?? null,
      email: row.email ?? null,
      archived: row.archived ?? 0,
      created_at: row.created_at ?? null,
      updated_at: row.updated_at ?? null
    });
  }

  data.companies = companies;
  data.contacts = people;
  if (Array.isArray(data.jobcards)) {
    for (const job of data.jobcards) {
      if (!job.company_id) job.company_id = job.contact_id || null;
    }
  }
  return data;
}

module.exports = { splitCustomersIntoCompanies, splitCustomersInBackup };
