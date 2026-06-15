const express = require('express');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const logger = require('../utils/logger');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { requiredString, handleValidationErrors } = require('../middleware/validation');
const {
  sanitizeFolderName,
  isWithinBase,
  findQaLevelFolder,
  ensureQaLevelFolder,
  renameQaLevelFolder
} = require('../utils/folderCreation');
const { decodeBase64Strict, assertMatchesExtension } = require('../utils/fileValidation');
const {
  qaLevelQueries,
  qaLevelTemplateQueries,
  recordHistory,
  getSettings
} = require('../db/database');

const router = express.Router();

function getQaLevelsBasePath() {
  const settings = getSettings();
  const base = settings.job_folders_base;
  if (!base || !base.trim()) return null;
  return path.join(base.trim(), 'QA Levels');
}

function formatLevel(row) {
  return {
    id: row.id,
    name: row.name,
    requiresReturnedForm: row.requires_returned_form === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function formatTemplate(row) {
  return {
    id: row.id,
    qaLevelId: row.qa_level_id,
    fileName: row.file_name,
    displayName: row.display_name,
    uploadedAt: row.uploaded_at
  };
}

// GET /api/qa-levels - List all levels
router.get('/', authenticate, (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';

    if (isAdmin) {
      const levels = qaLevelQueries.getAll.all();
      const result = levels.map(level => {
        const templates = qaLevelTemplateQueries.getByLevel.all(level.id);
        return {
          ...formatLevel(level),
          templates: templates.map(formatTemplate),
          templateCount: templates.length
        };
      });
      res.json(result);
    } else {
      // Non-admin: all levels, no templates
      const levels = qaLevelQueries.getAll.all();
      res.json(levels.map(level => ({
        id: level.id,
        name: level.name
      })));
    }
  } catch (err) {
    logger.error({ err }, 'Get QA levels error');
    res.status(500).json({ error: 'Failed to get QA levels' });
  }
});

// GET /api/qa-levels/:id - Get level with templates (admin only)
router.get('/:id', authenticate, requireAdmin, (req, res) => {
  try {
    const level = qaLevelQueries.getById.get(req.params.id);
    if (!level) {
      return res.status(404).json({ error: 'QA level not found' });
    }

    const templates = qaLevelTemplateQueries.getByLevel.all(level.id);
    res.json({
      ...formatLevel(level),
      templates: templates.map(formatTemplate)
    });
  } catch (err) {
    logger.error({ err }, 'Get QA level error');
    res.status(500).json({ error: 'Failed to get QA level' });
  }
});

// POST /api/qa-levels - Create level (admin only)
router.post('/',
  authenticate,
  requireAdmin,
  requiredString('name', 'Name'),
  handleValidationErrors,
  (req, res) => {
    try {
      const { name } = req.body;
      const nameLower = name.trim().toLowerCase();
      const requiresReturnedForm = req.body.requiresReturnedForm ? 1 : 0;

      // Check for duplicate name
      const existing = qaLevelQueries.getByNameLower.get(nameLower);
      if (existing) {
        return res.status(400).json({ error: 'A QA level with this name already exists' });
      }

      const id = `qa-level:${uuidv4()}`;

      // Create the level's folder on disk with its permanent-id code in the name.
      // Fire-and-forget: a storage error is logged and never blocks creation.
      const basePath = getQaLevelsBasePath();
      if (basePath) ensureQaLevelFolder(basePath, id, name.trim());

      qaLevelQueries.create.run(id, name.trim(), nameLower, requiresReturnedForm);

      recordHistory('qa_level', id, 'create', req.user.userId, req.user.name || req.user.username, {
        name: { from: null, to: name.trim() },
        requiresReturnedForm: { from: null, to: requiresReturnedForm ? 'Yes' : 'No' }
      });

      const created = qaLevelQueries.getById.get(id);
      res.status(201).json({
        ...formatLevel(created),
        templates: [],
        templateCount: 0
      });
    } catch (err) {
      logger.error({ err }, 'Create QA level error');
      res.status(500).json({ error: 'Failed to create QA level' });
    }
  }
);

// PUT /api/qa-levels/:id - Update level (admin only)
router.put('/:id',
  authenticate,
  requireAdmin,
  requiredString('name', 'Name'),
  handleValidationErrors,
  (req, res) => {
    try {
      const { id } = req.params;
      const { name } = req.body;

      const existing = qaLevelQueries.getById.get(id);
      if (!existing) {
        return res.status(404).json({ error: 'QA level not found' });
      }

      const nameLower = name.trim().toLowerCase();

      // Check for duplicate name (different record)
      const duplicate = qaLevelQueries.getByNameLower.get(nameLower);
      if (duplicate && duplicate.id !== id) {
        return res.status(400).json({ error: 'A QA level with this name already exists' });
      }

      // Keep the existing setting when the field is omitted, so a name-only edit
      // doesn't silently turn the "needs form back" switch off.
      const requiresReturnedForm = req.body.requiresReturnedForm === undefined
        ? existing.requires_returned_form
        : (req.body.requiresReturnedForm ? 1 : 0);

      // Can't require a form back when the level has no template to print — there'd
      // be nothing to return. Block only the act of turning it ON; a name-only edit
      // (or any edit) on a level that's already on is left alone.
      if (requiresReturnedForm === 1 && existing.requires_returned_form !== 1) {
        const templateCount = qaLevelTemplateQueries.getByLevel.all(id).length;
        if (templateCount === 0) {
          return res.status(400).json({ error: 'Upload a form template to this level before requiring its return.' });
        }
      }

      const changes = {};
      if (name.trim() !== existing.name) {
        changes.name = { from: existing.name, to: name.trim() };
      }
      if (requiresReturnedForm !== existing.requires_returned_form) {
        changes.requiresReturnedForm = {
          from: existing.requires_returned_form ? 'Yes' : 'No',
          to: requiresReturnedForm ? 'Yes' : 'No'
        };
      }

      qaLevelQueries.update.run(
        name.trim(),
        nameLower,
        requiresReturnedForm,
        id
      );

      // Best-effort cosmetic rename so the folder name tracks the level name.
      // Lookups go by the code in the folder name, so a failed/skipped rename
      // never strands templates — the folder is still found by its id.
      if (changes.name) {
        const basePath = getQaLevelsBasePath();
        if (basePath) renameQaLevelFolder(basePath, id, name.trim());
      }

      if (Object.keys(changes).length > 0) {
        recordHistory('qa_level', id, 'update', req.user.userId, req.user.name || req.user.username, changes);
      }

      const updated = qaLevelQueries.getById.get(id);
      const templates = qaLevelTemplateQueries.getByLevel.all(id);
      res.json({
        ...formatLevel(updated),
        templates: templates.map(formatTemplate),
        templateCount: templates.length
      });
    } catch (err) {
      logger.error({ err }, 'Update QA level error');
      res.status(500).json({ error: 'Failed to update QA level' });
    }
  }
);

// DELETE /api/qa-levels/:id - Delete level (admin only, blocked if used)
router.delete('/:id', authenticate, requireAdmin, (req, res) => {
  try {
    const { id } = req.params;

    const existing = qaLevelQueries.getById.get(id);
    if (!existing) {
      return res.status(404).json({ error: 'QA level not found' });
    }

    // Check if any jobs use this level
    const usage = qaLevelQueries.countJobsByLevel.get(id);
    if (usage.count > 0) {
      return res.status(400).json({
        error: `Cannot delete: ${usage.count} job card(s) use this QA level`
      });
    }

    // Delete level folder from disk, located by the code in its name (not the name).
    const basePath = getQaLevelsBasePath();
    const levelFolder = basePath ? findQaLevelFolder(basePath, id) : null;
    if (levelFolder && isWithinBase(basePath, levelFolder)) {
      try {
        fs.rmSync(levelFolder, { recursive: true, force: true });
        logger.info({ folderPath: levelFolder }, 'Deleted QA level folder');
      } catch (err) {
        logger.error({ err }, 'Failed to delete QA level folder');
      }
    }

    qaLevelQueries.delete.run(id);

    recordHistory('qa_level', id, 'delete', req.user.userId, req.user.name || req.user.username, {
      name: { from: existing.name, to: null }
    });

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Delete QA level error');
    res.status(500).json({ error: 'Failed to delete QA level' });
  }
});

// POST /api/qa-levels/:id/templates - Upload template PDF (admin only)
router.post('/:id/templates', authenticate, requireAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { fileName, displayName, fileData } = req.body;

    if (!fileName || !fileData) {
      return res.status(400).json({ error: 'fileName and fileData (base64) are required' });
    }

    const level = qaLevelQueries.getById.get(id);
    if (!level) {
      return res.status(404).json({ error: 'QA level not found' });
    }

    const templateId = `qa-template:${uuidv4()}`;
    const sanitizedFileName = sanitizeFolderName(path.parse(fileName).name) + path.extname(fileName);
    const finalDisplayName = displayName || sanitizedFileName;

    // Reject a corrupt/cut-off upload before creating any record. Templates are PDFs.
    let buffer;
    try {
      buffer = decodeBase64Strict(fileData);
      assertMatchesExtension(buffer, sanitizedFileName);
    } catch (decodeErr) {
      return res.status(400).json({ error: decodeErr.message });
    }

    // Save file to disk if folder is configured. The folder is located (or
    // created) by the code in its name, so it works regardless of the level name.
    const basePath = getQaLevelsBasePath();
    if (basePath) {
      const levelFolder = ensureQaLevelFolder(basePath, level.id, level.name);
      if (levelFolder) {
        try {
          const filePath = path.join(levelFolder, sanitizedFileName);
          if (isWithinBase(levelFolder, filePath)) {
            fs.writeFileSync(filePath, buffer);
            logger.info({ filePath }, 'Saved QA template file');
          }
        } catch (err) {
          logger.error({ err }, 'Failed to save QA template file');
        }
      }
    }

    qaLevelTemplateQueries.create.run(templateId, id, sanitizedFileName, finalDisplayName);

    recordHistory('qa_level', id, 'add_template', req.user.userId, req.user.name || req.user.username, {
      template: { from: null, to: finalDisplayName }
    });

    const template = qaLevelTemplateQueries.getById.get(templateId);
    res.status(201).json(formatTemplate(template));
  } catch (err) {
    logger.error({ err }, 'Upload QA template error');
    res.status(500).json({ error: 'Failed to upload template' });
  }
});

// GET /api/qa-levels/:id/templates - List templates (admin only)
router.get('/:id/templates', authenticate, requireAdmin, (req, res) => {
  try {
    const level = qaLevelQueries.getById.get(req.params.id);
    if (!level) {
      return res.status(404).json({ error: 'QA level not found' });
    }

    const templates = qaLevelTemplateQueries.getByLevel.all(req.params.id);
    res.json(templates.map(formatTemplate));
  } catch (err) {
    logger.error({ err }, 'Get QA templates error');
    res.status(500).json({ error: 'Failed to get templates' });
  }
});

// DELETE /api/qa-levels/:id/templates/:tid - Delete template (admin only)
router.delete('/:id/templates/:tid', authenticate, requireAdmin, (req, res) => {
  try {
    const { id, tid } = req.params;

    const template = qaLevelTemplateQueries.getById.get(tid);
    if (!template || template.qa_level_id !== id) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const level = qaLevelQueries.getById.get(id);

    // Delete file from disk, locating the level folder by the code in its name.
    const basePath = getQaLevelsBasePath();
    const levelFolder = basePath && level ? findQaLevelFolder(basePath, level.id) : null;
    if (levelFolder) {
      const filePath = path.join(levelFolder, template.file_name);
      try {
        if (isWithinBase(levelFolder, filePath) && fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          logger.info({ filePath }, 'Deleted QA template file');
        }
      } catch (err) {
        logger.error({ err }, 'Failed to delete QA template file');
      }
    }

    qaLevelTemplateQueries.delete.run(tid);

    recordHistory('qa_level', id, 'remove_template', req.user.userId, req.user.name || req.user.username, {
      template: { from: template.display_name, to: null }
    });

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Delete QA template error');
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

module.exports = router;
