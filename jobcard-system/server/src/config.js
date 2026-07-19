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

// HTTPS is production-only: the packaged desktop app sets NODE_ENV=production.
// Dev (npm start / Vite) stays plain HTTP and is left untouched.
const secure = process.env.NODE_ENV === 'production';

module.exports = {
  // Server settings
  port: process.env.PORT || 3000,
  host: process.env.HOST || '0.0.0.0', // Listen on all interfaces for LAN access

  // HTTPS (production only)
  secure,
  httpsPort: process.env.HTTPS_PORT || 443,
  // Plain-HTTP listeners that serve the public "set up this computer" pages and
  // 301 everything else to https://<host>/… (so old plain links keep working)
  redirectPorts: [80, 3000],
  // Friendly local-network name the server announces itself under (Bonjour/mDNS),
  // so other computers can reach it as https://<name> without any router setup.
  // Must end in .local for local-name announcing to work.
  mdnsName: process.env.MDNS_NAME || 'jobcards.local',

  // Where the local CA + leaf certificate live (same dir as config.json)
  dataDir: DATA_DIR,
  certPaths: {
    caCert: path.join(DATA_DIR, 'ca.crt'),
    caKey: path.join(DATA_DIR, 'ca.key'),
    serverCert: path.join(DATA_DIR, 'server.crt'),
    serverKey: path.join(DATA_DIR, 'server.key')
  },

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
