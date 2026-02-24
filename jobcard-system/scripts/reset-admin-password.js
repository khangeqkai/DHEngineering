#!/usr/bin/env node

/**
 * Admin Password Reset Script
 *
 * Resets an admin user's password directly via the SQLite database.
 * Only usable by someone with physical access to the server machine.
 *
 * Usage: npm run reset-password (from jobcard-system/)
 */

const path = require('path');
const fs = require('fs');
const readline = require('readline');

const DB_PATH = path.join(__dirname, '..', 'data', 'jobcard.db');

if (!fs.existsSync(DB_PATH)) {
  console.error(`\nError: Database not found at ${DB_PATH}`);
  console.error('Make sure you run this from the jobcard-system/ directory and the server has been started at least once.\n');
  process.exit(1);
}

const Database = require(path.join(__dirname, '..', 'server', 'node_modules', 'better-sqlite3'));
const bcrypt = require(path.join(__dirname, '..', 'server', 'node_modules', 'bcryptjs'));

let db;
try {
  db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');
} catch (err) {
  console.error(`\nError: Could not open database: ${err.message}\n`);
  process.exit(1);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

function cleanup(code = 0) {
  rl.close();
  db.close();
  process.exit(code);
}

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function askHidden(question) {
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }
    stdin.resume();

    let input = '';
    const onData = (ch) => {
      const c = ch.toString('utf8');
      if (c === '\n' || c === '\r' || c === '\u0004') {
        stdin.removeListener('data', onData);
        if (stdin.isTTY) {
          stdin.setRawMode(wasRaw);
        }
        process.stdout.write('\n');
        resolve(input);
      } else if (c === '\u0003') {
        // Ctrl+C
        stdin.removeListener('data', onData);
        if (stdin.isTTY) {
          stdin.setRawMode(wasRaw);
        }
        process.stdout.write('\n');
        cleanup(0);
      } else if (c === '\u007f' || c === '\b') {
        // Backspace
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else {
        input += c;
        process.stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}

function validatePassword(password) {
  if (password.length < 8) {
    return 'Password must be at least 8 characters';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number';
  }
  return null;
}

async function main() {
  console.log('\n=== DH Engineering — Admin Password Reset ===\n');

  // List admin users
  const admins = db.prepare("SELECT id, username, name FROM users WHERE role = 'admin'").all();

  if (admins.length === 0) {
    console.error('No admin users found in the database.');
    cleanup(1);
  }

  console.log('Admin users:');
  admins.forEach((admin, i) => {
    const display = admin.name ? ` (${admin.name})` : '';
    console.log(`  ${i + 1}. ${admin.username}${display}`);
  });
  console.log('');

  // Pick admin
  let selected;
  if (admins.length === 1) {
    selected = admins[0];
    console.log(`Only one admin found: ${selected.username}\n`);
  } else {
    const choice = await ask(`Select admin (1-${admins.length}): `);
    const index = parseInt(choice, 10) - 1;
    if (isNaN(index) || index < 0 || index >= admins.length) {
      console.error('Invalid selection.');
      cleanup(1);
    }
    selected = admins[index];
    console.log('');
  }

  // Get new password
  const password = await askHidden('New password: ');
  const error = validatePassword(password);
  if (error) {
    console.error(`\n${error}`);
    cleanup(1);
  }

  const confirm = await askHidden('Confirm password: ');
  if (password !== confirm) {
    console.error('\nPasswords do not match.');
    cleanup(1);
  }

  // Hash and update
  const hashedPassword = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashedPassword, selected.id);

  // Record in history table
  db.prepare(`
    INSERT INTO history (entity_type, entity_id, action, user_id, user_name, changes, snapshot, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    'user',
    selected.id,
    'password_reset',
    null,
    'system-cli',
    JSON.stringify({ password: { from: '(hashed)', to: '(hashed)' } }),
    null
  );

  console.log(`\nPassword reset successfully for "${selected.username}".`);
  console.log('The user can now log in with the new password.\n');

  cleanup(0);
}

main().catch((err) => {
  console.error('Error:', err.message);
  cleanup(1);
});
