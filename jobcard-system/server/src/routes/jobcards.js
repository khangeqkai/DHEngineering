const express = require('express');
const { v4: uuidv4 } = require('uuid');

const { authenticate } = require('../middleware/auth');
const { jobcardQueries, historyQueries, recordHistory } = require('../db/database');

const router = express.Router();

// Helper to format jobcard response
function formatJobcard(row) {
  return {
    _id: row.id,
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    customer: {
      name: row.customer_name,
      phone: row.customer_phone,
      email: row.customer_email
    },
    notes: row.notes,
    photos: row.photos ? JSON.parse(row.photos) : [],
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// Get all job cards
router.get('/', authenticate, (req, res) => {
  try {
    const { status, createdBy } = req.query;

    let jobcards;
    if (status) {
      jobcards = jobcardQueries.getByStatus.all(status);
    } else if (createdBy) {
      jobcards = jobcardQueries.getByCreator.all(createdBy);
    } else {
      jobcards = jobcardQueries.getAll.all();
    }

    res.json(jobcards.map(formatJobcard));
  } catch (err) {
    console.error('Get jobcards error:', err);
    res.status(500).json({ error: 'Failed to get job cards' });
  }
});

// Get single job card
router.get('/:id', authenticate, (req, res) => {
  try {
    const jobcard = jobcardQueries.getById.get(req.params.id);
    if (!jobcard) {
      return res.status(404).json({ error: 'Job card not found' });
    }
    res.json(formatJobcard(jobcard));
  } catch (err) {
    console.error('Get jobcard error:', err);
    res.status(500).json({ error: 'Failed to get job card' });
  }
});

// Get job card history
router.get('/:id/history', authenticate, (req, res) => {
  try {
    const history = historyQueries.getByEntity.all('jobcard', req.params.id);

    res.json(history.map(h => ({
      id: h.id,
      action: h.action,
      userId: h.user_id,
      userName: h.user_name,
      changes: h.changes ? JSON.parse(h.changes) : null,
      snapshot: h.snapshot ? JSON.parse(h.snapshot) : null,
      createdAt: h.created_at
    })));
  } catch (err) {
    console.error('Get jobcard history error:', err);
    res.status(500).json({ error: 'Failed to get job card history' });
  }
});

// Create job card
router.post('/', authenticate, (req, res) => {
  try {
    const { title, description, status, customer, notes, photos } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const id = req.body._id || `jobcard:${Date.now()}:${uuidv4().slice(0, 8)}`;

    jobcardQueries.create.run(
      id,
      title,
      description || null,
      status || 'pending',
      customer?.name || null,
      customer?.phone || null,
      customer?.email || null,
      notes || null,
      photos ? JSON.stringify(photos) : null,
      req.user.userId,
      req.user.userId
    );

    const jobcard = jobcardQueries.getById.get(id);

    // Record creation in history
    recordHistory('jobcard', id, 'create', req.user.userId, req.user.name, null, formatJobcard(jobcard));

    res.status(201).json(formatJobcard(jobcard));
  } catch (err) {
    console.error('Create jobcard error:', err);
    res.status(500).json({ error: 'Failed to create job card' });
  }
});

// Sync endpoint - create (from offline client)
router.post('/create', authenticate, (req, res) => {
  try {
    const data = req.body;
    const id = data._id || `jobcard:${Date.now()}:${uuidv4().slice(0, 8)}`;

    // Check if already exists
    const existing = jobcardQueries.getById.get(id);
    if (existing) {
      return res.json(formatJobcard(existing));
    }

    jobcardQueries.create.run(
      id,
      data.title,
      data.description || null,
      data.status || 'pending',
      data.customer?.name || null,
      data.customer?.phone || null,
      data.customer?.email || null,
      data.notes || null,
      data.photos ? JSON.stringify(data.photos) : null,
      req.user.userId,
      req.user.userId
    );

    const jobcard = jobcardQueries.getById.get(id);
    recordHistory('jobcard', id, 'create', req.user.userId, req.user.name, null, formatJobcard(jobcard));

    res.status(201).json(formatJobcard(jobcard));
  } catch (err) {
    console.error('Sync create error:', err);
    res.status(500).json({ error: 'Failed to sync create' });
  }
});

// Sync endpoint - update (from offline client)
router.post('/update', authenticate, (req, res) => {
  try {
    const data = req.body;
    const existing = jobcardQueries.getById.get(data._id);

    if (!existing) {
      // Create if doesn't exist
      jobcardQueries.create.run(
        data._id,
        data.title,
        data.description || null,
        data.status || 'pending',
        data.customer?.name || null,
        data.customer?.phone || null,
        data.customer?.email || null,
        data.notes || null,
        data.photos ? JSON.stringify(data.photos) : null,
        req.user.userId,
        req.user.userId
      );
      recordHistory('jobcard', data._id, 'create', req.user.userId, req.user.name, null, data);
    } else {
      // Track changes
      const changes = {};
      if (data.title !== existing.title) changes.title = { from: existing.title, to: data.title };
      if (data.status !== existing.status) changes.status = { from: existing.status, to: data.status };
      if (data.description !== existing.description) changes.description = { from: existing.description, to: data.description };

      jobcardQueries.update.run(
        data.title,
        data.description || null,
        data.status || 'pending',
        data.customer?.name || null,
        data.customer?.phone || null,
        data.customer?.email || null,
        data.notes || null,
        data.photos ? JSON.stringify(data.photos) : null,
        req.user.userId,
        data._id
      );

      if (Object.keys(changes).length > 0) {
        recordHistory('jobcard', data._id, 'update', req.user.userId, req.user.name, changes, null);
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Sync update error:', err);
    res.status(500).json({ error: 'Failed to sync update' });
  }
});

// Sync endpoint - delete (from offline client)
router.post('/delete', authenticate, (req, res) => {
  try {
    const { _id } = req.body;

    const existing = jobcardQueries.getById.get(_id);
    if (existing) {
      recordHistory('jobcard', _id, 'delete', req.user.userId, req.user.name, null, formatJobcard(existing));
      jobcardQueries.delete.run(_id);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Sync delete error:', err);
    res.status(500).json({ error: 'Failed to sync delete' });
  }
});

// Update job card
router.put('/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, status, customer, notes, photos } = req.body;

    const existing = jobcardQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Job card not found' });
    }

    // Track all changes
    const changes = {};
    if (title && title !== existing.title) {
      changes.title = { from: existing.title, to: title };
    }
    if (description !== undefined && description !== existing.description) {
      changes.description = { from: existing.description, to: description };
    }
    if (status && status !== existing.status) {
      changes.status = { from: existing.status, to: status };
    }
    if (customer?.name !== undefined && customer.name !== existing.customer_name) {
      changes.customer_name = { from: existing.customer_name, to: customer.name };
    }
    if (customer?.phone !== undefined && customer.phone !== existing.customer_phone) {
      changes.customer_phone = { from: existing.customer_phone, to: customer.phone };
    }
    if (customer?.email !== undefined && customer.email !== existing.customer_email) {
      changes.customer_email = { from: existing.customer_email, to: customer.email };
    }
    if (notes !== undefined && notes !== existing.notes) {
      changes.notes = { from: existing.notes, to: notes };
    }

    jobcardQueries.update.run(
      title || existing.title,
      description !== undefined ? description : existing.description,
      status || existing.status,
      customer?.name !== undefined ? customer.name : existing.customer_name,
      customer?.phone !== undefined ? customer.phone : existing.customer_phone,
      customer?.email !== undefined ? customer.email : existing.customer_email,
      notes !== undefined ? notes : existing.notes,
      photos ? JSON.stringify(photos) : existing.photos,
      req.user.userId,
      id
    );

    // Record changes in history
    if (Object.keys(changes).length > 0) {
      recordHistory('jobcard', id, 'update', req.user.userId, req.user.name, changes, null);
    }

    const updated = jobcardQueries.getById.get(id);
    res.json(formatJobcard(updated));
  } catch (err) {
    console.error('Update jobcard error:', err);
    res.status(500).json({ error: 'Failed to update job card' });
  }
});

// Delete job card
router.delete('/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params;

    const existing = jobcardQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Job card not found' });
    }

    // Record deletion with snapshot
    recordHistory('jobcard', id, 'delete', req.user.userId, req.user.name, null, formatJobcard(existing));

    jobcardQueries.delete.run(id);

    res.json({ success: true });
  } catch (err) {
    console.error('Delete jobcard error:', err);
    res.status(500).json({ error: 'Failed to delete job card' });
  }
});

module.exports = router;
