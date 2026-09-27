#!/usr/bin/env node

/**
 * Admin PIN Reset Script
 *
 * Sets a new 4-digit PIN for an active admin directly in the SQLite database
 * and ends that admin's current sign-in (same as the in-app PIN reset).
 * Only usable by someone with physical access to the server machine.
 *
 * Usage: npm run reset-password (from jobcard-system/)
 *
 * Finds the database the same way the app does: DATA_DIR if set, otherwise the
 * installed desktop app's data folder (Electron's userData/data, named after
 * the build's productName) and the run-from-source folder (jobcard-system/data).
 * If more than one exists, it asks which to change.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const readline = require('readline');

// Must match "productName" in client/package.json — Electron names the per-user
// app-data folder after it, and the packaged app keeps its data in <that>/data.
const PRODUCT_NAME = 'DH Engineering Job Cards';

function installedDataDir() {
  const home = os.homedir();
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), PRODUCT_NAME, 'data');
  }
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', PRODUCT_NAME, 'data');
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), PRODUCT_NAME, 'data');
}

function candidateDatabases() {
  if (process.env.DATA_DIR) {
    return [path.join(process.env.DATA_DIR, 'jobcard.db')];
  }
  return [installedDataDir(), path.join(__dirname, '..', 'data')]
    .map((dir) => path.join(dir, 'jobcard.db'))
    .filter((file) => fs.existsSync(file));
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

let db = null;

function cleanup(code = 0) {
  rl.close();
  if (db) db.close();
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
  if (!/^\d{4}$/.test(password)) {
    return 'PIN must be exactly 4 digits';
  }
  return null;
}

async function pickDatabase() {
  const found = candidateDatabases();
  if (process.env.DATA_DIR && !fs.existsSync(found[0])) {
    console.error(`Error: Database not found at ${found[0]} (from DATA_DIR).`);
    cleanup(1);
  }
  if (found.length === 0) {
    console.error('Error: No database found. Looked in:');
    console.error(`  ${path.join(installedDataDir(), 'jobcard.db')}`);
    console.error(`  ${path.join(__dirname, '..', 'data', 'jobcard.db')}`);
    console.error('Start the app at least once, or set DATA_DIR to the folder holding jobcard.db.\n');
    cleanup(1);
  }
  if (found.length === 1) return found[0];

  console.log('More than one database found:');
  found.forEach((file, i) => {
    const modified = fs.statSync(file).mtime.toLocaleString();
    console.log(`  ${i + 1}. ${file}  (last changed ${modified})`);
  });
  const choice = await ask(`Which one does the app use? (1-${found.length}): `);
  const index = parseInt(choice, 10) - 1;
  if (isNaN(index) || index < 0 || index >= found.length) {
    console.error('Invalid selection.');
    cleanup(1);
  }
  return found[index];
}

async function main() {
  console.log('\n=== DH Engineering — Admin PIN Reset ===\n');
  console.log('Close the Job Cards app (and stop the server) before continuing.\n');

  const dbPath = await pickDatabase();
  console.log(`\nDatabase: ${dbPath}\n`);

  const Database = require(path.join(__dirname, '..', 'server', 'node_modules', 'better-sqlite3'));
  try {
    db = new Database(dbPath, { fileMustExist: true });
    db.pragma('foreign_keys = ON');
  } catch (err) {
    console.error(`Error: Could not open database: ${err.message}\n`);
    cleanup(1);
  }

  // Only active admins can sign in — an archived one would be refused however
  // the PIN is set, so it isn't offered.
  const admins = db.prepare("SELECT id, username, name FROM users WHERE role = 'admin' AND active = 1").all();

  if (admins.length === 0) {
    console.error('No active admin users found in this database.');
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
  const password = await askHidden('New 4-digit PIN: ');
  const error = validatePassword(password);
  if (error) {
    console.error(`\n${error}`);
    cleanup(1);
  }

  const confirm = await askHidden('Confirm PIN: ');
  if (password !== confirm) {
    console.error('\nPINs do not match.');
    cleanup(1);
  }

  // Hash and update
  // Clearing session_token ends any sign-in made with the old PIN, exactly as
  // the in-app PIN reset does (the next request gets SESSION_ENDED).
  const bcrypt = require(path.join(__dirname, '..', 'server', 'node_modules', 'bcryptjs'));
  const hashedPassword = bcrypt.hashSync(password, 10);
  db.prepare(
    "UPDATE users SET password = ?, session_token = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?"
  ).run(hashedPassword, selected.id);

  // Record in history table
  db.prepare(`
    INSERT INTO history (entity_type, entity_id, action, user_id, user_name, changes, snapshot, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  `).run(
    'user',
    selected.id,
    'password_reset',
    null,
    'system-cli',
    JSON.stringify({ password: { from: '(hashed)', to: '(hashed)' } }),
    null
  );

  console.log(`\nPIN reset for "${selected.username}" in ${dbPath}.`);
  console.log('Any sign-in using the old PIN has been ended. They can now sign in with the new PIN.\n');

  cleanup(0);
}

main().catch((err) => {
  console.error('Error:', err.message);
  cleanup(1);
});
