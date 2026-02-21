const express = require('express');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const logger = require('../utils/logger');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { requiredString, handleValidationErrors } = require('../middleware/validation');
const { sanitizeFolderName, isWithinBase } = require('../utils/folderCreation');
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
    isActive: row.is_active === 1,
    requireScannedForms: row.require_scanned_forms === 1,
    folderPath: row.folder_path || null,
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
      // Non-admin: active levels only, no templates
      const levels = qaLevelQueries.getActive.all();
      res.json(levels.map(level => ({
        id: level.id,
        name: level.name,
        isActive: true,
        requireScannedForms: level.require_scanned_forms === 1
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
      const { name, requireScannedForms } = req.body;
      const nameLower = name.trim().toLowerCase();

      // Check for duplicate name
      const existing = qaLevelQueries.getByNameLower.get(nameLower);
      if (existing) {
        return res.status(400).json({ error: 'A QA level with this name already exists' });
      }

      const id = `qa-level:${Date.now()}:${uuidv4().slice(0, 8)}`;
      const sanitizedName = sanitizeFolderName(name.trim());

      // Create folder on disk
      let folderPath = null;
      const basePath = getQaLevelsBasePath();
      if (basePath && sanitizedName) {
        folderPath = path.join(basePath, sanitizedName);
        if (isWithinBase(basePath, folderPath)) {
          try {
            fs.mkdirSync(folderPath, { recursive: true });
            logger.info({ folderPath }, 'Created QA level folder');
          } catch (err) {
            logger.error({ err, folderPath }, 'Failed to create QA level folder');
            folderPath = null;
          }
        } else {
          folderPath = null;
        }
      }

      qaLevelQueries.create.run(
        id, name.trim(), nameLower, folderPath,
        1, requireScannedForms ? 1 : 0
      );

      recordHistory('qa_level', id, 'create', req.user.userId, req.user.name, {
        name: { from: null, to: name.trim() },
        requireScannedForms: { from: null, to: requireScannedForms ? true : false }
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
      const { name, isActive, requireScannedForms } = req.body;

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

      const changes = {};
      if (name.trim() !== existing.name) {
        changes.name = { from: existing.name, to: name.trim() };
      }
      if ((isActive !== undefined) && ((isActive ? 1 : 0) !== existing.is_active)) {
        changes.isActive = { from: existing.is_active === 1, to: isActive };
      }
      if ((requireScannedForms !== undefined) && ((requireScannedForms ? 1 : 0) !== existing.require_scanned_forms)) {
        changes.requireScannedForms = { from: existing.require_scanned_forms === 1, to: requireScannedForms };
      }

      qaLevelQueries.update.run(
        name.trim(),
        nameLower,
        isActive !== undefined ? (isActive ? 1 : 0) : existing.is_active,
        requireScannedForms !== undefined ? (requireScannedForms ? 1 : 0) : existing.require_scanned_forms,
        id
      );

      if (Object.keys(changes).length > 0) {
        recordHistory('qa_level', id, 'update', req.user.userId, req.user.name, changes);
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

    // Delete level folder from disk (with path validation)
    const basePath = getQaLevelsBasePath();
    if (basePath && existing.folder_path && isWithinBase(basePath, existing.folder_path)) {
      try {
        if (fs.existsSync(existing.folder_path)) {
          fs.rmSync(existing.folder_path, { recursive: true, force: true });
          logger.info({ folderPath: existing.folder_path }, 'Deleted QA level folder');
        }
      } catch (err) {
        logger.error({ err }, 'Failed to delete QA level folder');
      }
    }

    qaLevelQueries.delete.run(id);

    recordHistory('qa_level', id, 'delete', req.user.userId, req.user.name, {
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

    const templateId = `qa-template:${Date.now()}:${uuidv4().slice(0, 8)}`;
    const sanitizedFileName = sanitizeFolderName(path.parse(fileName).name) + path.extname(fileName);
    const finalDisplayName = displayName || sanitizedFileName;

    // Save file to disk if folder is configured
    const basePath = getQaLevelsBasePath();
    if (basePath) {
      const sanitizedLevelName = sanitizeFolderName(level.name);
      const levelFolder = path.join(basePath, sanitizedLevelName);

      if (isWithinBase(basePath, levelFolder)) {
        try {
          fs.mkdirSync(levelFolder, { recursive: true });
          const filePath = path.join(levelFolder, sanitizedFileName);
          if (isWithinBase(levelFolder, filePath)) {
            const buffer = Buffer.from(fileData, 'base64');
            fs.writeFileSync(filePath, buffer);
            logger.info({ filePath }, 'Saved QA template file');
          }
        } catch (err) {
          logger.error({ err }, 'Failed to save QA template file');
        }
      }
    }

    qaLevelTemplateQueries.create.run(templateId, id, sanitizedFileName, finalDisplayName);

    recordHistory('qa_level', id, 'add_template', req.user.userId, req.user.name, {
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

    // Delete file from disk
    const basePath = getQaLevelsBasePath();
    if (basePath && level) {
      const sanitizedLevelName = sanitizeFolderName(level.name);
      const filePath = path.join(basePath, sanitizedLevelName, template.file_name);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          logger.info({ filePath }, 'Deleted QA template file');
        }
      } catch (err) {
        logger.error({ err }, 'Failed to delete QA template file');
      }
    }

    qaLevelTemplateQueries.delete.run(tid);

    recordHistory('qa_level', id, 'remove_template', req.user.userId, req.user.name, {
      template: { from: template.display_name, to: null }
    });

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Delete QA template error');
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

module.exports = router;
