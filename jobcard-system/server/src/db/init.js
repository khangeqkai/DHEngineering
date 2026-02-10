const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { db, userQueries, recordHistory } = require('./database');

async function initializeDatabase() {
  console.log('Initializing database...');

  // Check if admin user exists
  const adminUser = userQueries.getByUsername.get('admin');

  if (!adminUser) {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const adminId = `user:${uuidv4()}`;

    userQueries.create.run(
      adminId,
      'admin',
      hashedPassword,
      'admin',
      'Administrator',
      null
    );

    recordHistory('user', adminId, 'create', null, 'system', null, {
      username: 'admin',
      role: 'admin',
      name: 'Administrator'
    });

    console.log('  Created default admin user (username: admin, password: admin123)');
  } else {
    console.log('  Admin user already exists');
  }

  // Initialize default settings
  const settingsStmt = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  settingsStmt.run('company_name', 'My Company');
  settingsStmt.run('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone);

  console.log('Database initialization complete');
}

module.exports = { initializeDatabase };
