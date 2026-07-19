const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

const config = require('./src/config');
const { ensureCertificates } = require('./src/utils/certs');
const logger = require('./src/utils/logger');
const { requestLogger } = require('./src/utils/logger');
const authRoutes = require('./src/routes/auth');
const hardwareRoutes = require('./src/routes/hardware');
const jobcardsRoutes = require('./src/routes/jobcards');
const jobcardTimeEntriesRoutes = require('./src/routes/jobcard-time-entries');
const jobcardCostingRoutes = require('./src/routes/jobcard-costing');
const jobcardFilesRoutes = require('./src/routes/jobcard-files');
const jobcardNotesRoutes = require('./src/routes/jobcard-notes');
const historyRoutes = require('./src/routes/history');
const contactsRoutes = require('./src/routes/contacts');
const suppliersRoutes = require('./src/routes/suppliers');
const tagsRoutes = require('./src/routes/tags');
const machinesRoutes = require('./src/routes/machines');
const settingsRoutes = require('./src/routes/settings');
const qaLevelsRoutes = require('./src/routes/qa-levels');
const searchRoutes = require('./src/routes/search');
const { initializeDatabase } = require('./src/db/init');
const { maintenanceGuard } = require('./src/middleware/maintenance');
const { verifyPdfEngine, getPdfEngineStatus } = require('./src/utils/pdfEngine');

const app = express();

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '50mb' })); // Large limit for photos
app.use(requestLogger); // Request logging

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: require('./package.json').version,
    pdfEngine: getPdfEngineStatus()
  });
});

// Turn away mutating requests from other clients while a restore is in progress
app.use(maintenanceGuard);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/hardware', hardwareRoutes);
// Mount sub-routes before main jobcards route for proper matching
app.use('/api/jobcards', jobcardTimeEntriesRoutes);
app.use('/api/jobcards', jobcardCostingRoutes);
app.use('/api/jobcards', jobcardFilesRoutes);
app.use('/api/jobcards', jobcardNotesRoutes);
app.use('/api/jobcards', jobcardsRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/suppliers', suppliersRoutes);
app.use('/api/tags', tagsRoutes);
app.use('/api/machines', machinesRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/qa-levels', qaLevelsRoutes);
app.use('/api/search', searchRoutes);

// Serve React client in production (LAN browser access)
const clientBuildPath = process.env.CLIENT_BUILD_PATH || path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));
  app.use((req, res) => {
    if (req.path === '/api' || req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error({ err, url: req.url, method: req.method }, 'Server error');
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Strip any :port from a Host header, preserving bracketed IPv6 literals, so an
// old plain link like http://192.168.1.5:3000/foo forwards to https://192.168.1.5/foo
// (HTTPS on the default 443 needs no port in the address).
function hostWithoutPort(hostHeader) {
  const host = hostHeader || 'localhost';
  if (host.startsWith('[')) {
    // IPv6 literal: [::1] or [::1]:3000 — keep through the closing bracket
    return host.slice(0, host.indexOf(']') + 1) || host;
  }
  return host.split(':')[0];
}

// A tiny HTTP app that answers every request with a 301 to the HTTPS address.
// These listeners carry no application data — they exist only so old
// http://…:80 / http://…:3000 links keep working after the switch to HTTPS.
function startRedirectListener(portNum) {
  const redirectServer = http.createServer((req, res) => {
    const location = `https://${hostWithoutPort(req.headers.host)}${req.url}`;
    res.writeHead(301, { Location: location });
    res.end();
  });
  redirectServer.on('error', (err) => {
    // A blocked redirect port (e.g. 80 held by IIS) must not take the app down —
    // the secure address still works; only the auto-forward from that one port is lost.
    logger.warn(
      { err, port: portNum },
      `Could not start the plain-web auto-forwarder on port ${portNum} ` +
      `(likely another program is using it). The secure web address still works; ` +
      `only old links using that port won't auto-forward. Free the port to restore it.`
    );
  });
  redirectServer.listen(portNum, config.host);
}

// Initialize and start server
async function start() {
  try {
    // Initialize the database with default data
    await initializeDatabase();

    // Start the server and wait for it to be ready
    await new Promise((resolve, reject) => {
      let server;
      if (config.secure) {
        // Production: serve HTTPS on 443 using our locally-minted certificate.
        const { key, cert } = ensureCertificates(config.dataDir);
        server = https.createServer({ key, cert }, app);
        server.listen(config.httpsPort, config.host, () => {
          logger.info({
            host: config.host,
            port: config.httpsPort,
            url: `https://${config.host}:${config.httpsPort}`
          }, 'Job Card Server started (secure)');
          resolve();
        });
        // Old plain-HTTP links keep working: 301 them to HTTPS.
        for (const p of config.redirectPorts) startRedirectListener(p);
      } else {
        // Dev: plain HTTP, unchanged.
        server = app.listen(config.port, config.host, () => {
          logger.info({
            host: config.host,
            port: config.port,
            url: `http://${config.host}:${config.port}`
          }, 'Job Card Server started');
          resolve();
        });
      }
      // A failure of the primary (HTTPS in prod, HTTP in dev) listener stays fatal.
      server.on('error', reject);
    });

    // Confirm the PDF-rendering browser is usable, after the server is listening so
    // this never delays or blocks startup. Fire-and-forget: a missing browser logs a
    // loud, fixable message and flips /health to "unavailable" but never stops the
    // server (printing still degrades gracefully).
    verifyPdfEngine().catch(() => {});
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    throw err;
  }
}

// When required by Electron, export the promise so it can handle errors.
// When run standalone, catch and exit on failure.
const startPromise = start();
if (!process.env.ELECTRON_MODE) {
  startPromise.catch(() => process.exit(1));
}
module.exports = startPromise;
