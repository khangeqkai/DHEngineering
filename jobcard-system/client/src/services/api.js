const API_URL = '/api';

class ApiService {
  constructor() {
    this.token = null;
    this.onSessionInvalidated = null;
    // Guards against firing the forced sign-out handler multiple times for the
    // burst of 401s that arrives at once. Re-armed on each fresh login.
    this.sessionInvalidated = false;
  }

  setToken(token) {
    this.token = token;
    // A real token means a fresh login — re-arm the forced sign-out handler so
    // it works again on this workstation, not just the first time.
    if (token) {
      this.sessionInvalidated = false;
    }
  }

  setOnSessionInvalidated(callback) {
    this.onSessionInvalidated = callback;
  }

  async request(endpoint, options = {}) {
    const url = `${API_URL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Request failed' }));

      // Handle a forced sign-out from the server: session replaced by a newer
      // login, or the account was turned off / its PIN reset.
      if (response.status === 401 &&
          (errorData.code === 'SESSION_REPLACED' || errorData.code === 'ACCOUNT_DEACTIVATED')) {
        if (this.onSessionInvalidated && !this.sessionInvalidated) {
          this.sessionInvalidated = true;
          this.onSessionInvalidated(errorData.code);
        }
        throw new Error(errorData.code);
      }

      const details = errorData.details?.join('. ') || '';
      const message = details || errorData.error || 'Request failed';
      // Carry the status and parsed body on the error so callers can react to
      // specific cases (e.g. a 409 close-out warning that includes the gaps).
      const error = new Error(message);
      error.status = response.status;
      error.data = errorData;
      throw error;
    }

    return response.json();
  }

  _post(endpoint, data) {
    const opts = { method: 'POST' };
    if (data !== undefined) opts.body = JSON.stringify(data);
    return this.request(endpoint, opts);
  }
  _put(endpoint, data) {
    return this.request(endpoint, { method: 'PUT', body: JSON.stringify(data) });
  }
  _patch(endpoint, data) {
    return this.request(endpoint, { method: 'PATCH', body: JSON.stringify(data) });
  }
  _del(endpoint, data) {
    const opts = { method: 'DELETE' };
    if (data !== undefined) opts.body = JSON.stringify(data);
    return this.request(endpoint, opts);
  }

  // Auth endpoints
  login(username, password) {
    return this._post('/auth/login', { username, password });
  }

  getMe() {
    return this.request('/auth/me');
  }

  updatePreferences(preferences) {
    return this._put('/auth/me/preferences', preferences);
  }

  // User management
  getUsers(includeInactive = false) {
    return this.request(`/auth/users${includeInactive ? '?includeInactive=true' : ''}`);
  }

  // Active employees list (available to all authenticated users)
  getEmployees() {
    return this.request('/auth/employees');
  }

  getUser(id) {
    return this.request(`/auth/users/${id}`);
  }

  createUser(userData) { return this._post('/auth/users', userData); }
  updateUser(id, userData) { return this._put(`/auth/users/${id}`, userData); }
  deactivateUser(id) { return this._post(`/auth/users/${id}/deactivate`); }
  activateUser(id) { return this._post(`/auth/users/${id}/activate`); }

  async changePassword(currentPassword, newPassword) {
    const result = await this._put('/auth/change-password', { currentPassword, newPassword });
    // The server rotates the session on a PIN change; swap in the fresh token so
    // changing your own PIN doesn't sign you out.
    if (result && result.token) {
      this.setToken(result.token);
    }
    return result;
  }

  // Jobcard endpoints
  getJobcards(filters = {}) {
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.archived) params.append('archived', 'true');
    if (filters.assigneeId) params.append('assigneeId', filters.assigneeId);
    const query = params.toString();
    return this.request(`/jobcards${query ? `?${query}` : ''}`);
  }

  getJobcard(id) {
    return this.request(`/jobcards/${id}`);
  }

  getJobcardHistory(id) {
    return this.request(`/jobcards/${id}/history`);
  }

  createJobcard(jobcardData) { return this._post('/jobcards', jobcardData); }
  updateJobcard(id, jobcardData) { return this._put(`/jobcards/${id}`, jobcardData); }
  updateJobcardStatus(id, status, confirmMissingAttachments = false) {
    const body = { status };
    if (confirmMissingAttachments) body.confirmMissingAttachments = true;
    return this._patch(`/jobcards/${id}/status`, body);
  }
  // Active jobs that declared a drawing / customer property / quality forms but
  // have no matching file attached — used to flag rows in the job list.
  getAttachmentWarnings(ids) { return this._post('/jobcards/attachment-warnings', { ids: ids || [] }); }
  unarchiveJobcard(id) { return this._post(`/jobcards/${id}/unarchive`); }
  deleteJobcard(id, confirmDelete = false) {
    return this._del(`/jobcards/${id}`, confirmDelete ? { confirmDelete: true } : undefined);
  }

  getOverdueJobcards() {
    return this.request('/jobcards/overdue');
  }

  // Job Assignees
  addAssignee(jobcardId, userId) { return this._post(`/jobcards/${jobcardId}/assignees`, { userId }); }
  removeAssignee(jobcardId, userId) { return this._del(`/jobcards/${jobcardId}/assignees/${userId}`); }
  selfAssign(jobcardId) { return this._post(`/jobcards/${jobcardId}/assignees/self`); }
  selfUnassign(jobcardId) { return this._del(`/jobcards/${jobcardId}/assignees/self`); }

  // Time Entries
  getTimeEntries(jobcardId) { return this.request(`/jobcards/${jobcardId}/time-entries`); }
  addTimeEntry(jobcardId, data) { return this._post(`/jobcards/${jobcardId}/time-entries`, data); }
  updateTimeEntry(jobcardId, entryId, data) { return this._put(`/jobcards/${jobcardId}/time-entries/${entryId}`, data); }
  deleteTimeEntry(jobcardId, entryId) { return this._del(`/jobcards/${jobcardId}/time-entries/${entryId}`); }

  // Timer endpoints
  getActiveTimer() { return this.request('/jobcards/active-timer'); }
  startTimer(jobcardId, itemNumber, workerId) {
    const body = { itemNumber };
    if (workerId) body.workerId = workerId;
    return this._post(`/jobcards/${jobcardId}/time-entries/start`, body);
  }
  stopTimer(jobcardId, entryId) { return this._post(`/jobcards/${jobcardId}/time-entries/${entryId}/stop`); }

  // Job Notes
  getJobNotes(jobcardId) { return this.request(`/jobcards/${jobcardId}/notes`); }
  addJobNote(jobcardId, text) { return this._post(`/jobcards/${jobcardId}/notes`, { text }); }
  deleteJobNote(jobcardId, noteId) { return this._del(`/jobcards/${jobcardId}/notes/${noteId}`); }

  // Costing (admin only)
  getCosting(jobcardId) { return this.request(`/jobcards/${jobcardId}/costing`); }
  updateCosting(jobcardId, data) { return this._put(`/jobcards/${jobcardId}/costing`, data); }

  // Job card files (disk-first; one folder per category per job).
  // category: 'job-files' | 'qa-form-files' | 'customer-property-files'
  listJobcardFiles(jobcardId, category) {
    return this.request(`/jobcards/${jobcardId}/files/${category}`);
  }
  getJobcardFile(jobcardId, category, filename) {
    return this.request(`/jobcards/${jobcardId}/files/${category}/${encodeURIComponent(filename)}`);
  }
  uploadToJobcardFiles(jobcardId, category, filename, fileData, itemId) {
    const body = { filename, fileData };
    if (itemId != null) body.itemId = itemId;
    return this._post(`/jobcards/${jobcardId}/files/${category}/upload`, body);
  }

  // Contact endpoints (phone contacts style)
  getContacts(includeArchived = false) { return this.request(`/contacts${includeArchived ? '?includeArchived=true' : ''}`); }
  searchContacts(query) { return this.request(`/contacts/search?q=${encodeURIComponent(query)}`); }
  getContact(id) { return this.request(`/contacts/${id}`); }
  createContact(data) { return this._post('/contacts', data); }
  updateContact(id, data) { return this._put(`/contacts/${id}`, data); }
  archiveContact(id) { return this._post(`/contacts/${id}/archive`); }
  unarchiveContact(id) { return this._post(`/contacts/${id}/unarchive`); }

  // Supplier endpoints
  getSuppliers(includeInactive = false) { return this.request(`/suppliers${includeInactive ? '?includeInactive=true' : ''}`); }
  getSupplier(id) { return this.request(`/suppliers/${id}`); }
  createSupplier(data) { return this._post('/suppliers', data); }
  updateSupplier(id, data) { return this._put(`/suppliers/${id}`, data); }
  deactivateSupplier(id) { return this._post(`/suppliers/${id}/deactivate`); }
  activateSupplier(id) { return this._post(`/suppliers/${id}/activate`); }

  // Tag endpoints
  getTags(category, includeArchived = false) {
    const params = [];
    if (category) params.push(`category=${encodeURIComponent(category)}`);
    if (includeArchived) params.push('includeArchived=true');
    const query = params.length ? `?${params.join('&')}` : '';
    return this.request(`/tags${query}`);
  }
  getTagCategories() { return this.request('/tags/categories'); }
  createTag(data) { return this._post('/tags', data); }
  updateTag(id, data) { return this._put(`/tags/${id}`, data); }
  archiveTag(id) { return this._del(`/tags/${id}`); }
  activateTag(id) { return this._post(`/tags/${id}/activate`); }

  // Activity history (management only)
  getActivityHistory(limit = 50) { return this.request(`/history?limit=${limit}`); }
  getUserActivity(userId, limit = 50) { return this.request(`/history/user/${userId}?limit=${limit}`); }
  getEntityHistory(entityType, page = 1) { return this.request(`/history/entity/${entityType}?page=${page}`); }

  // Machines
  getMachines(includeInactive = false) { return this.request(`/machines${includeInactive ? '?includeInactive=true' : ''}`); }
  createMachine(data) { return this._post('/machines', data); }
  updateMachine(id, data) { return this._put(`/machines/${id}`, data); }
  archiveMachine(id) { return this._del(`/machines/${id}`); }
  activateMachine(id) { return this._post(`/machines/${id}/activate`); }

  // Hardware endpoints
  getPrinters() { return this.request('/hardware/printers'); }
  getHardwareStatus() { return this.request('/hardware/status'); }

  // Settings (management only; backup export/import stays admin-only)
  getSettings() { return this.request('/settings'); }
  updateSettings(data) { return this._put('/settings', data); }
  getInactivityTimeout() { return this.request('/settings/inactivity-timeout'); }
  exportBackup(outputPath) { return this._post('/settings/export-backup', { outputPath }); }
  importBackup(inputPath) { return this._post('/settings/import-backup', { inputPath }); }

  // Generate a job's printed job card as HTML, on demand (any authenticated user)
  printJobCard(jobcardId) { return this._post(`/jobcards/${jobcardId}/print`, {}); }

  // Weld the chosen job documents into one combined PDF. The file bytes stay on
  // the server (only the {category, filename} list travels up); the server renders
  // the job card itself when includeJobCard is set. Returns { pdf: base64, skipped }.
  buildPacket(jobcardId, { items, includeJobCard }) {
    return this._post(`/jobcards/${jobcardId}/packet`, { items, includeJobCard: includeJobCard !== false });
  }

  // Search
  search(params) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') query.set(k, String(v));
    });
    return this.request(`/search?${query.toString()}`);
  }

  // QA Levels
  getQaLevels() { return this.request('/qa-levels'); }
  getQaLevel(id) { return this.request(`/qa-levels/${id}`); }
  createQaLevel(data) { return this._post('/qa-levels', data); }
  updateQaLevel(id, data) { return this._put(`/qa-levels/${id}`, data); }
  deleteQaLevel(id) { return this._del(`/qa-levels/${id}`); }
  uploadQaTemplate(levelId, data) { return this._post(`/qa-levels/${levelId}/templates`, data); }
  deleteQaTemplate(levelId, templateId) { return this._del(`/qa-levels/${levelId}/templates/${templateId}`); }
}

export const api = new ApiService();

// Decode base64 (e.g. a combined-packet PDF from the server) back to bytes.
export function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
