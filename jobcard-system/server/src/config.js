const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Resolve data directory (Electron sets DATA_DIR, otherwise fallback)
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

function getOrCreateJwtSecret() {
  // Env var always wins (for advanced users)
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }

  // Try to read persisted secret
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      if (config.jwtSecret) {
        return config.jwtSecret;
      }
    }
  } catch {
    // Corrupted file — regenerate
  }

  // Generate and persist a new secret
  const secret = crypto.randomBytes(32).toString('hex');
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ jwtSecret: secret }, null, 2), 'utf-8');
  } catch {
    // If we can't persist, use the generated secret for this session
  }

  return secret;
}

module.exports = {
  // Server settings
  port: process.env.PORT || 3000,
  host: process.env.HOST || '0.0.0.0', // Listen on all interfaces for LAN access

  // JWT settings
  jwt: {
    secret: getOrCreateJwtSecret(),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  },

  // Hardware settings
  hardware: {
    // Default printer (can be overridden per-machine)
    defaultPrinter: process.env.DEFAULT_PRINTER || null,

    // Camera settings
    camera: {
      width: 1280,
      height: 720
    }
  }
};
