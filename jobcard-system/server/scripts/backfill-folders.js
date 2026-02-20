#!/usr/bin/env node
/**
 * Backfill script: Creates company and job card folders for all existing data.
 *
 * Usage (from jobcard-system/):
 *   node server/scripts/backfill-folders.js
 *
 * Prerequisites:
 *   - job_folders_base must be configured in Settings before running
 *   - The configured base folder must exist on disk
 */

const path = require('path');

// Set up module resolution relative to server/src
const serverSrc = path.join(__dirname, '..', 'src');
process.chdir(path.join(__dirname, '..', '..'));

const { db } = require(path.join(serverSrc, 'db', 'connection'));
const { getSettings } = require(path.join(serverSrc, 'db', 'helpers'));
const { sanitizeFolderName, createCompanyFolder, createJobCardFolders } = require(path.join(serverSrc, 'utils', 'folderCreation'));

const settings = getSettings();
const basePath = settings.job_folders_base;

if (!basePath || !basePath.trim()) {
  console.error('Error: job_folders_base is not configured in Settings.');
  console.error('Please set the Job Folders base path in the Settings page first.');
  process.exit(1);
}

console.log(`Base path: ${basePath}`);
console.log('');

// Step 1: Create company folders for all contacts
const contacts = db.prepare('SELECT id, contact_name, company_name FROM contacts').all();
let companyCount = 0;
const companyNames = new Set();

for (const contact of contacts) {
  if (contact.company_name) {
    const sanitized = sanitizeFolderName(contact.company_name);
    if (sanitized && !companyNames.has(sanitized)) {
      companyNames.add(sanitized);
      createCompanyFolder(contact.company_name);
      companyCount++;
    }
  }
}

console.log(`Created ${companyCount} company folders from ${contacts.length} contacts.`);

// Step 2: Create job card folders
// Use LEFT JOIN to get company name from linked contact if not overridden on the job card
const jobcards = db.prepare(`
  SELECT j.job_number, j.company_name, c.company_name as linked_company_name
  FROM jobcards j
  LEFT JOIN contacts c ON j.contact_id = c.id
`).all();

let jobCount = 0;
let skipped = 0;

for (const jc of jobcards) {
  const companyName = jc.company_name || jc.linked_company_name;
  if (companyName && jc.job_number) {
    createJobCardFolders(companyName, jc.job_number);
    jobCount++;
  } else {
    skipped++;
  }
}

console.log(`Created folders for ${jobCount} job cards (${skipped} skipped — no company name).`);
console.log('');
console.log('Done.');
