const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

const config = require('./src/config');
const { ensureCertificates } = require('./src/utils/certs');
const { startMdnsResponder } = require('./src/utils/mdnsResponder');
const { hostWithoutPort } = require('./src/utils/netHost');
const setupTrustRoutes = require('./src/routes/setup-trust');
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
const companiesRoutes = require('./src/routes/companies');
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

// Public, secretless one-time "set up this computer" flow for other PCs.
// Mounted before the login-guarded routers so a browser that does not yet
// trust this computer can reach it. Read-only; serves only the public trust
// file, never a private key.
app.use(setupTrustRoutes);

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
app.use('/api/companies', companiesRoutes);
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

// A tiny plain-HTTP app used by the port 80 / 3000 listeners. It serves ONLY
// the public, secretless "set up this computer" paths (so a browser that does
// not yet trust this computer can load them without a warning — that warning is
// what the flow removes) and 301-redirects everything else to the HTTPS
// address, so old http://…:80 / http://…:3000 app links keep working.
const httpBootstrapApp = express();
httpBootstrapApp.use(setupTrustRoutes);
httpBootstrapApp.use((req, res) => {
  const location = `https://${hostWithoutPort(req.headers.host)}${req.url}`;
  res.writeHead(301, { Location: location });
  res.end();
});

function startRedirectListener(portNum) {
  const redirectServer = http.createServer(httpBootstrapApp);
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
        // The certificate also vouches for the friendly name (jobcards.local).
        const { key, cert } = ensureCertificates(config.dataDir, { extraDns: [config.mdnsName] });
        server = https.createServer({ key, cert }, app);
        server.listen(config.httpsPort, config.host, () => {
          logger.info({
            host: config.host,
            port: config.httpsPort,
            url: `https://${config.host}:${config.httpsPort}`
          }, 'Job Card Server started (secure)');
          resolve();
        });
        // Plain-HTTP listeners: serve the public trust-setup pages and 301 old
        // http://…:80 / http://…:3000 app links to HTTPS.
        for (const p of config.redirectPorts) startRedirectListener(p);
        // Announce the app on the local network by name (best-effort, non-fatal),
        // so other computers can use https://jobcards.local with no router setup.
        startMdnsResponder(config.mdnsName);
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
