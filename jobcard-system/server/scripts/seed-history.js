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
 * UI expect — see formatChanges in client/src/components/ActivityLog.jsx.
 *
 * This is a deliberate, bounded reconstruction, not a perfect audit: one create per
 * entity, one status transition per job, plus note and timer rows.
 */

// The status a job most plausibly moved from to reach its current status. QUOTE and
// OPEN are starting points, so they get only a create row (no transition).
const PREVIOUS_STATUS = {
  AWAITING_MATERIAL: 'OPEN',
  IN_PROGRESS: 'OPEN',
  DONE: 'IN_PROGRESS',
  INVOICED: 'DONE',
};

function seedHistory({ db, adminId, adminName, users, companies, contacts, suppliers, machines, qaLevels, jobs, setupAt }) {
  const insert = db.prepare(`
    INSERT INTO history (entity_type, entity_id, action, user_id, user_name, changes, snapshot, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const add = (entityType, entityId, action, userId, userName, changes, at) => {
    insert.run(entityType, entityId, action, userId, userName, JSON.stringify(changes), JSON.stringify(null), at);
  };

  const run = db.transaction(() => {
    // ── Entity setup (admin builds the master data) ──
    for (const u of users) {
      add('user', u.id, 'create', adminId, adminName, { name: { from: null, to: u.name } }, setupAt);
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
      add('machine', m.id, 'create', adminId, adminName, { machine_number: { from: null, to: m.number } }, setupAt);
    }
    for (const q of qaLevels) {
      add('qa_level', q.id, 'create', adminId, adminName, { name: { from: null, to: q.name } }, setupAt);
    }

    // ── Per job: create, optional status transition, notes, timer stops ──
    for (const job of jobs) {
      add('jobcard', job.id, 'create', adminId, adminName, {
        job_number: { from: null, to: job.jobNumber },
        status: { from: null, to: job.status },
        description: { from: null, to: job.description },
      }, job.createdAt);

      const prev = PREVIOUS_STATUS[job.status];
      if (prev) {
        // Place the transition at the job's latest real activity (or invoice time).
        const stamps = [
          ...job.notes.map(n => n.at),
          ...job.timers.map(t => t.at),
        ].filter(Boolean).sort();
        const transitionAt = job.invoicedDate || stamps[stamps.length - 1] || job.createdAt;
        const changes = { status: { from: prev, to: job.status } };
        if (job.status === 'INVOICED') changes.archived = { from: 0, to: 1 };
        add('jobcard', job.id, 'update', adminId, adminName, changes, transitionAt);
      }

      for (const n of job.notes) {
        add('jobcard', job.id, 'add_note', n.workerId, n.workerName, { note: { from: null, to: n.text } }, n.at);
      }

      for (const t of job.timers) {
        add('jobcard', job.id, 'stop_timer', t.workerId, t.workerName, { work: { from: null, to: t.desc } }, t.at);
      }
    }
  });

  run();

  // Total rows added, for the seed summary.
  return users.length + companies.length + contacts.length + suppliers.length + machines.length + qaLevels.length
    + jobs.reduce((sum, j) => sum + 1 + (PREVIOUS_STATUS[j.status] ? 1 : 0) + j.notes.length + j.timers.length, 0);
}

module.exports = { seedHistory };
