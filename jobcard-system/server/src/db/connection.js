const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'jobcard.db');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize database
const db = new Database(DB_PATH);

// Enable foreign keys
db.pragma('foreign_keys = ON');

module.exports = { db, DATA_DIR, DB_PATH };
