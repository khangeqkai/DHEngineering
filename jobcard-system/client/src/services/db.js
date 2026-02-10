import Dexie from 'dexie';

const REMOTE_API_URL = 'http://localhost:3000';

class DatabaseService {
  constructor() {
    // Initialize Dexie database
    this.db = new Dexie('JobCardSystem');
    this.db.version(1).stores({
      jobcards: '_id, type, status, createdAt, updatedAt, *customer.name',
      syncQueue: '++id, docId, action, timestamp'
    });

    // Sync state
    this.syncStatus = 'offline';
    this._listeners = [];
    this.syncInterval = null;
  }

  // Start syncing with the server
  startSync() {
    // Initial sync
    this.syncWithServer();

    // Periodic sync every 10 seconds
    this.syncInterval = setInterval(() => {
      this.syncWithServer();
    }, 10000);

    return () => this.stopSync();
  }

  stopSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  async syncWithServer() {
    try {
      this.syncStatus = 'syncing';
      this.notifyListeners('status', this.syncStatus);

      const token = localStorage.getItem('token');
      if (!token) {
        this.syncStatus = 'offline';
        this.notifyListeners('status', this.syncStatus);
        return;
      }

      // Push local changes to server
      await this.pushChanges(token);

      // Pull changes from server
      await this.pullChanges(token);

      this.syncStatus = 'online';
      this.notifyListeners('status', this.syncStatus);
      this.notifyListeners('change', { direction: 'sync' });
    } catch (err) {
      console.error('Sync error:', err);
      this.syncStatus = 'offline';
      this.notifyListeners('status', this.syncStatus);
    }
  }

  async pushChanges(token) {
    const queue = await this.db.syncQueue.toArray();

    for (const item of queue) {
      try {
        const response = await fetch(`${REMOTE_API_URL}/api/jobcards/${item.action}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(item.data)
        });

        if (response.ok) {
          await this.db.syncQueue.delete(item.id);
        }
      } catch (err) {
        console.error('Push failed for item:', item, err);
      }
    }
  }

  async pullChanges(token) {
    try {
      const response = await fetch(`${REMOTE_API_URL}/api/jobcards`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const serverCards = await response.json();

        // Merge with local data (server wins for conflicts)
        for (const card of serverCards) {
          const local = await this.db.jobcards.get(card._id);
          if (!local || new Date(card.updatedAt) > new Date(local.updatedAt)) {
            await this.db.jobcards.put(card);
          }
        }
      }
    } catch (err) {
      // Server might not have the endpoint yet, ignore
      console.debug('Pull changes not available:', err.message);
    }
  }

  // Subscribe to sync events
  onSyncEvent(callback) {
    this._listeners.push(callback);
    return () => {
      this._listeners = this._listeners.filter(cb => cb !== callback);
    };
  }

  notifyListeners(type, data) {
    this._listeners.forEach(cb => cb(type, data));
  }

  getSyncStatus() {
    return this.syncStatus;
  }

  // Job Card CRUD operations
  async createJobCard(jobCard) {
    const doc = {
      _id: `jobcard:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`,
      type: 'jobcard',
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...jobCard
    };

    await this.db.jobcards.add(doc);

    // Queue for sync
    await this.db.syncQueue.add({
      docId: doc._id,
      action: 'create',
      data: doc,
      timestamp: Date.now()
    });

    this.notifyListeners('change', { type: 'create', doc });
    return doc;
  }

  async getJobCard(id) {
    return this.db.jobcards.get(id);
  }

  async updateJobCard(jobCard) {
    const existing = await this.db.jobcards.get(jobCard._id);
    if (!existing) {
      throw new Error('Job card not found');
    }

    const updated = {
      ...existing,
      ...jobCard,
      updatedAt: new Date().toISOString()
    };

    await this.db.jobcards.put(updated);

    // Queue for sync
    await this.db.syncQueue.add({
      docId: updated._id,
      action: 'update',
      data: updated,
      timestamp: Date.now()
    });

    this.notifyListeners('change', { type: 'update', doc: updated });
    return updated;
  }

  async deleteJobCard(id) {
    await this.db.jobcards.delete(id);

    // Queue for sync
    await this.db.syncQueue.add({
      docId: id,
      action: 'delete',
      data: { _id: id },
      timestamp: Date.now()
    });

    this.notifyListeners('change', { type: 'delete', id });
  }

  async getAllJobCards() {
    const cards = await this.db.jobcards.toArray();
    return cards.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async getJobCardsByStatus(status) {
    return this.db.jobcards.where('status').equals(status).toArray();
  }

  async searchJobCards(query) {
    const allCards = await this.getAllJobCards();
    const lowerQuery = query.toLowerCase();
    return allCards.filter(card =>
      card.title?.toLowerCase().includes(lowerQuery) ||
      card.customer?.name?.toLowerCase().includes(lowerQuery) ||
      card.description?.toLowerCase().includes(lowerQuery)
    );
  }

  // Conflict resolution (simplified - server wins)
  async getConflicts() {
    // With Dexie + REST sync, we use "last write wins" strategy
    // No explicit conflicts to resolve
    return [];
  }
}

export const db = new DatabaseService();
