// Database Service - Minimal version
// This file is kept for backward compatibility but is no longer used.
// The application now uses direct API calls via api.js

import Dexie from 'dexie';

class DatabaseService {
  constructor() {
    // Minimal Dexie instance (kept for potential future use)
    this.db = new Dexie('JobCardSystem');

    this.db.version(1).stores({
      // Empty stores - data is now managed by server
    });
  }

  // Legacy methods - no-op stubs for backward compatibility
  startSync() {
    console.warn('db.startSync() is deprecated. App now uses direct API calls.');
    return () => {};
  }

  stopSync() {
    // No-op
  }

  getSyncStatus() {
    return 'online';
  }
}

export const db = new DatabaseService();
