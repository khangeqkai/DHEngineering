const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { authenticate, requireAdmin } = require('../middleware/auth');
const db = require('../db/database');

// All settings routes require authentication
router.use(authenticate);

// Get settings (admin only)
router.get('/', requireAdmin, (req, res) => {
  try {
    const settings = db.getSettings();
    res.json(settings);
  } catch (err) {
    console.error('Error getting settings:', err);
    res.status(500).json({ error: 'Failed to get settings' });
  }
});

// Update settings (admin only)
router.put('/', requireAdmin, (req, res) => {
  try {
    const { scanner_folder } = req.body;

    // Validate scanner folder if provided
    if (scanner_folder && scanner_folder.trim()) {
      // Check if the folder exists
      if (!fs.existsSync(scanner_folder)) {
        return res.status(400).json({ error: 'Scanner folder does not exist' });
      }

      // Check if it's a directory
      const stats = fs.statSync(scanner_folder);
      if (!stats.isDirectory()) {
        return res.status(400).json({ error: 'Path is not a directory' });
      }
    }

    db.updateSettings({ scanner_folder: scanner_folder || '' });
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating settings:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// Get scanner files (mounted at /api/scanner/files)
router.get('/files', authenticate, (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const settings = db.getSettings();

    if (!settings.scanner_folder) {
      return res.json({ files: [], message: 'Scanner folder not configured' });
    }

    if (!fs.existsSync(settings.scanner_folder)) {
      return res.json({ files: [], message: 'Scanner folder does not exist' });
    }

    // Get files from the scanner folder
    const files = fs.readdirSync(settings.scanner_folder)
      .map(filename => {
        const filePath = path.join(settings.scanner_folder, filename);
        try {
          const stats = fs.statSync(filePath);
          if (!stats.isFile()) return null;

          // Filter for common image/document types
          const ext = path.extname(filename).toLowerCase();
          const validExtensions = ['.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp', '.gif'];
          if (!validExtensions.includes(ext)) return null;

          return {
            name: filename,
            path: filePath,
            size: stats.size,
            modified: stats.mtime
          };
        } catch (err) {
          return null;
        }
      })
      .filter(f => f !== null)
      .sort((a, b) => new Date(b.modified) - new Date(a.modified)) // Most recent first
      .slice(0, limit);

    res.json({ files, folder: settings.scanner_folder });
  } catch (err) {
    console.error('Error getting scanner files:', err);
    res.status(500).json({ error: 'Failed to get scanner files' });
  }
});

module.exports = router;
