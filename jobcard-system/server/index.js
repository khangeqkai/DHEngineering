const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const config = require('./src/config');
const logger = require('./src/utils/logger');
const { requestLogger } = require('./src/utils/logger');
const authRoutes = require('./src/routes/auth');
const hardwareRoutes = require('./src/routes/hardware');
const jobcardsRoutes = require('./src/routes/jobcards');
const jobcardTimeEntriesRoutes = require('./src/routes/jobcard-time-entries');
const jobcardSubcontractsRoutes = require('./src/routes/jobcard-subcontracts');
const jobcardCostingRoutes = require('./src/routes/jobcard-costing');
const jobcardDocumentsRoutes = require('./src/routes/jobcard-documents');
const jobcardFilesRoutes = require('./src/routes/jobcard-files');
const jobcardQaFormsRoutes = require('./src/routes/jobcard-qa-forms');
const jobcardNotesRoutes = require('./src/routes/jobcard-notes');
const historyRoutes = require('./src/routes/history');
const contactsRoutes = require('./src/routes/contacts');
const suppliersRoutes = require('./src/routes/suppliers');
const serviceTagsRoutes = require('./src/routes/service-tags');
const machinesRoutes = require('./src/routes/machines');
const settingsRoutes = require('./src/routes/settings');
const qaLevelsRoutes = require('./src/routes/qa-levels');
const { initializeDatabase, seedMockData } = require('./src/db/init');

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
    version: require('./package.json').version
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/hardware', hardwareRoutes);
// Mount sub-routes before main jobcards route for proper matching
app.use('/api/jobcards', jobcardTimeEntriesRoutes);
app.use('/api/jobcards', jobcardSubcontractsRoutes);
app.use('/api/jobcards', jobcardCostingRoutes);
app.use('/api/jobcards', jobcardFilesRoutes);
app.use('/api/jobcards', jobcardDocumentsRoutes);
app.use('/api/jobcards', jobcardQaFormsRoutes);
app.use('/api/jobcards', jobcardNotesRoutes);
app.use('/api/jobcards', jobcardsRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/suppliers', suppliersRoutes);
app.use('/api/service-tags', serviceTagsRoutes);
app.use('/api/machines', machinesRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/qa-levels', qaLevelsRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error({ err, url: req.url, method: req.method }, 'Server error');
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Initialize and start server
async function start() {
  try {
    // Initialize the database with default data
    await initializeDatabase();

    // Seed mock data for testing (only runs if no data exists)
    await seedMockData();

    // Start the server
    app.listen(config.port, config.host, () => {
      logger.info({
        host: config.host,
        port: config.port,
        url: `http://${config.host}:${config.port}`
      }, 'Job Card Server started');
    });
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }
}

start();
