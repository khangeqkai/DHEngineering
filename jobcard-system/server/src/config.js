const path = require('path');

module.exports = {
  // Server settings
  port: process.env.PORT || 3000,
  host: process.env.HOST || '0.0.0.0', // Listen on all interfaces for LAN access

  // JWT settings
  jwt: {
    secret: process.env.JWT_SECRET || 'jobcard-dev-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  },

  // Database settings
  db: {
    path: path.join(__dirname, '..', '..', 'data', 'db')
  },

  // Hardware settings
  hardware: {
    // Default printer (can be overridden per-machine)
    defaultPrinter: process.env.DEFAULT_PRINTER || null,

    // Scanner settings
    scanner: {
      resolution: 300,
      format: 'jpeg'
    },

    // Camera settings
    camera: {
      width: 1280,
      height: 720
    }
  }
};
