/**
 * Generates a believable activity-history trail for the seeded data.
 *
 * The main seed script writes records straight into storage (bypassing the normal
 * create flow that calls recordHistory), so without this the activity log, the
 * entity history pages, and the activity/time search scopes would all be empty.
 *
 * Rows are inserted with an EXPLICIT created_at (the shared recordHistory helper
 * always stamps the current time and so cannot backdate). The `changes` column uses
 * the audit-trail { field: { from, to } } shape that the activity log and search
 * UI expect. Every entry is written in the exact shape the live route writes today
 * (same keys, same snapshot fields), because the job History wording
 * (client/src/utils/historySentences.js) reads those keys and turns anything it does
 * not know into a stray "Field: value" line. Keep each block below in step with its
 * live writer, named in the comment above it.
 *
 * Status is only ever set by hand, so every move is its own update row, written the
 * way people really make them: the first worker moves the job to In Progress just
 * before their first run, the worker who finishes the last run moves it to Done (when
 * the job is at or past Done), and the office makes every move after that (an admin
 * update row, with the filing-away keys on Paid – Archived).
 *
 * This is a deliberate, bounded reconstruction, not a perfect audit: one create per
 * entity, the status moves per job, plus note and timer rows.
 */

const jobStatuses = require('../src/shared/jobStatuses.json');

// Statuses a job can be born at and keep with no work logged. Every other job is
// born at OPEN (the app's default); the moves below take it from there.
const BORN_AS = new Set(['TO_QUOTE', 'QUOTE_SENT', 'OPEN', 'HOLD_PO']);

// A job at or past Done had its work finished by the shop.
const AT_OR_PAST_DONE = new Set(jobStatuses.settledStatuses);

function seedHistory({ db, adminId, adminName, users, companies, contacts, suppliers, machines, jobs, setupAt }) {
  // The live writers' own text helpers, so a seeded part reads exactly like a real one.
  // Required here (not at the top) because they open the database the seed has set up.
  const { partSummary, itemPartSnapshot, describePart } = require('../src/routes/jobcard-audit-text');
  const { displayName } = require('../src/shared/names');
  const { runContext } = require('../src/utils/timeEntryHelpers');

  const jobRow = db.prepare('SELECT priority, quality_level FROM jobcards WHERE id = ?');
  const itemRows = db.prepare('SELECT * FROM job_items WHERE jobcard_id = ? ORDER BY item_number');
  const assigneeRows = db.prepare(`
    SELECT u.name, u.username FROM job_assignees ja JOIN users u ON ja.user_id = u.id
    WHERE ja.jobcard_id = ? ORDER BY ja.assigned_at ASC, ja.rowid ASC
  `);
  const finishedRuns = db.prepare(`
    SELECT te.id, te.start_time, te.end_time, te.user_id, u.name, u.username,
           ji.description AS part_description, ji.qty AS part_qty
    FROM time_entries te
    JOIN users u ON te.user_id = u.id
    LEFT JOIN job_items ji ON te.item_id = ji.id
    WHERE te.jobcard_id = ? AND te.end_time IS NOT NULL
    ORDER BY te.end_time
  `);
  let rowCount = 0;
  const insert = db.prepare(`
    INSERT INTO history (entity_type, entity_id, action, user_id, user_name, changes, snapshot, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const add = (entityType, entityId, action, userId, userName, changes, at, snapshot = null) => {
    insert.run(entityType, entityId, action, userId, userName, JSON.stringify(changes), JSON.stringify(snapshot), at);
    rowCount++;
  };

  const run = db.transaction(() => {
    // ── Entity setup (admin builds the master data) ──
    for (const u of users) {
      // Live writer: POST /auth/users (auth.js).
      add('user', u.id, 'create', adminId, adminName, {
        username: { from: null, to: u.username },
        role: { from: null, to: u.role || 'user' },
        name: { from: null, to: u.name },
        ...(u.email ? { email: { from: null, to: u.email } } : {})
      }, setupAt);
    }
    for (const co of companies) {
      add('company', co.id, 'create', adminId, adminName, { name: { from: null, to: co.name } }, setupAt);
    }
    for (const c of contacts) {
      add('contact', c.id, 'create', adminId, adminName, {
        contactName: { from: null, to: c.contactName },
        companyName: { from: null, to: c.companyName }
      }, setupAt);
    }
    for (const sup of suppliers) {
      add('supplier', sup.id, 'create', adminId, adminName, { name: { from: null, to: sup.name } }, setupAt);
    }
    for (const m of machines) {
      add('machine', m.id, 'create', adminId, adminName, { machineNumber: { from: null, to: m.number } }, setupAt, null);
    }

    // ── Per job: create, optional status transition, notes, timer stops ──
    for (const job of jobs) {
      // Live writer: POST /jobcards (jobcard-mutations.js). A job is born at its first
      // status; the transition row below moves it to the one it holds now.
      const row = jobRow.get(job.id);
      const runs = finishedRuns.all(job.id);
      // The app can never move a job backward, so a job still at a born-as status cannot
      // have finished runs (they would move it to In Progress, then a manual entry back).
      // The seed's data never does this; fail loudly if a change to it ever does.
      if (BORN_AS.has(job.status) && runs.length) {
        throw new Error(`Seed trail impossible: job ${job.jobNumber} is ${job.status} but has finished runs`);
      }
      const bornAt = BORN_AS.has(job.status) && !runs.length ? job.status : 'OPEN';
      const parts = itemRows.all(job.id);
      const createChanges = {
        jobNumber: { from: null, to: job.jobNumber },
        status: { from: null, to: bornAt },
        priority: { from: null, to: row.priority || 'NONE' },
        qualityLevel: { from: null, to: row.quality_level || null }
      };
      const createParts = {};
      parts.forEach((i, idx) => {
        const name = describePart(i.description, String(i.item_number || idx + 1));
        const base = `part ${name} added`;
        const key = base in createChanges ? `part ${idx + 1} ${name} added` : base;
        const part = itemPartSnapshot(i.qty, i.description, i.job_type, i.material, i.treatments, i.drawings_type, i.customer_property);
        createChanges[key] = { from: null, to: partSummary(part) };
        createParts[key] = part;
      });
      const assigned = assigneeRows.all(job.id).map(displayName);
      if (assigned.length) createChanges.assignees = { from: 'none', to: assigned.join(', ') };
      add('jobcard', job.id, 'create', adminId, adminName, createChanges, job.createdAt,
        Object.keys(createParts).length ? { parts: createParts } : null);

      // Live writer for every move below: PATCH /jobcards/:id/status (jobcards.js), with
      // what rides along from applyStatusMove (jobcard-helpers.js).
      let current = bornAt;
      const shift = (iso, ms) => new Date(new Date(iso).getTime() + ms).toISOString();
      if (runs.length) {
        const first = runs[0];
        add('jobcard', job.id, 'update', first.user_id, displayName(first),
          { status: { from: current, to: 'IN_PROGRESS' } }, shift(first.start_time, -1000));
        current = 'IN_PROGRESS';
        if (AT_OR_PAST_DONE.has(job.status)) {
          const last = runs[runs.length - 1];
          add('jobcard', job.id, 'update', last.user_id, displayName(last),
            { status: { from: current, to: 'DONE' } }, shift(last.end_time, 1000));
          current = 'DONE';
        }
      }

      // The office's move to where the job sits now: an admin update row after the last
      // activity (or at the invoice time).
      if (current !== job.status) {
        const stamps = [
          ...job.notes.map(n => n.at),
          ...job.timers.map(t => t.at),
        ].filter(Boolean).sort();
        const lastActivity = stamps[stamps.length - 1] || job.createdAt;
        const wanted = job.invoicedDate || lastActivity;
        const at = new Date(Math.max(new Date(wanted).getTime(), new Date(lastActivity).getTime() + 1000)).toISOString();
        const changes = { status: { from: current, to: job.status } };
        if (job.invoicedDate) changes.invoicedDate = { from: null, to: job.invoicedDate };
        if (job.status === jobStatuses.closedStatus) changes.archived = { from: false, to: true };
        add('jobcard', job.id, 'update', adminId, adminName, changes, at);
      }

      for (const n of job.notes) {
        const changes = { note: { from: null, to: n.text } };
        if (n.mentioned?.length) changes.mentioned = { from: null, to: n.mentioned.join(', ') };
        // Live writer: POST .../notes (jobcard-notes.js).
        add('jobcard', job.id, 'add_note', n.workerId, n.workerName, changes, n.at);
      }

      // Live writer: POST .../time-entries/:entryId/stop (jobcard-time-entries.js). The
      // finish is in the changes; the start, the worker and the part in the snapshot.
      for (const r of runs) {
        const worker = displayName(r);
        const partKnown = r.part_description === null && r.part_qty === null ? null : { description: r.part_description, qty: r.part_qty };
        add('jobcard', job.id, 'stop_timer', r.user_id, worker, {
          endTime: { from: null, to: r.end_time }
        }, r.end_time, {
          timeEntryId: r.id,
          startTime: r.start_time,
          ...runContext({ user_id: r.user_id, user_name: worker }, partKnown)
        });
      }
    }
  });

  run();

  // Total rows added, for the seed summary.
  return rowCount;
}

module.exports = { seedHistory };
