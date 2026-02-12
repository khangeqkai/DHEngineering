const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const config = require('./src/config');
const authRoutes = require('./src/routes/auth');
const hardwareRoutes = require('./src/routes/hardware');
const jobcardsRoutes = require('./src/routes/jobcards');
const jobcardTimeEntriesRoutes = require('./src/routes/jobcard-time-entries');
const jobcardSubcontractsRoutes = require('./src/routes/jobcard-subcontracts');
const jobcardCostingRoutes = require('./src/routes/jobcard-costing');
const jobcardDocumentsRoutes = require('./src/routes/jobcard-documents');
const jobcardQaFormsRoutes = require('./src/routes/jobcard-qa-forms');
const historyRoutes = require('./src/routes/history');
const customersRoutes = require('./src/routes/customers');
const suppliersRoutes = require('./src/routes/suppliers');
const machinesRoutes = require('./src/routes/machines');
const settingsRoutes = require('./src/routes/settings');
const { initializeDatabase, seedMockData } = require('./src/db/init');

const app = express();

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '50mb' })); // Large limit for photos

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
app.use('/api/jobcards', jobcardDocumentsRoutes);
app.use('/api/jobcards', jobcardQaFormsRoutes);
app.use('/api/jobcards', jobcardsRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/suppliers', suppliersRoutes);
app.use('/api/machines', machinesRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/scanner', settingsRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
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
      console.log('');
      console.log('========================================');
      console.log('  Job Card Server Started');
      console.log('========================================');
      console.log(`  API Server:  http://${config.host}:${config.port}`);
      console.log('========================================');
      console.log('');
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
