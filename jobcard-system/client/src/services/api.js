const API_URL = '/api';

class ApiService {
  constructor() {
    this.token = null;
    this.onSessionInvalidated = null;
  }

  setToken(token) {
    this.token = token;
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

      // Handle session replaced by another login
      if (response.status === 401 && errorData.code === 'SESSION_REPLACED') {
        if (this.onSessionInvalidated) {
          const handler = this.onSessionInvalidated;
          this.onSessionInvalidated = null;
          handler();
        }
        throw new Error('SESSION_REPLACED');
      }

      const details = errorData.details?.join('. ') || '';
      const message = details || errorData.error || 'Request failed';
      throw new Error(message);
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
  _del(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }

  // Auth endpoints
  login(username, password) {
    return this._post('/auth/login', { username, password });
  }

  getMe() {
    return this.request('/auth/me');
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
  deleteUser(id) { return this._del(`/auth/users/${id}`); }

  changePassword(currentPassword, newPassword) {
    return this._put('/auth/change-password', { currentPassword, newPassword });
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
  updateJobcardStatus(id, status) { return this._patch(`/jobcards/${id}/status`, { status }); }
  archiveJobcard(id, invoicedDate) { return this._post(`/jobcards/${id}/archive`, { invoicedDate }); }
  unarchiveJobcard(id) { return this._post(`/jobcards/${id}/unarchive`); }
  deleteJobcard(id) { return this._del(`/jobcards/${id}`); }

  getOverdueJobcards() {
    return this.request('/jobcards/overdue');
  }

  getArchivedJobcards() {
    return this.request('/jobcards/archived');
  }

  // Job Assignees
  addAssignee(jobcardId, userId) { return this._post(`/jobcards/${jobcardId}/assignees`, { userId }); }
  removeAssignee(jobcardId, userId) { return this._del(`/jobcards/${jobcardId}/assignees/${userId}`); }

  // Subcontracts
  getSubcontracts(jobcardId) { return this.request(`/jobcards/${jobcardId}/subcontracts`); }
  addSubcontract(jobcardId, data) { return this._post(`/jobcards/${jobcardId}/subcontracts`, data); }
  updateSubcontract(jobcardId, id, data) { return this._put(`/jobcards/${jobcardId}/subcontracts/${id}`, data); }
  deleteSubcontract(jobcardId, id) { return this._del(`/jobcards/${jobcardId}/subcontracts/${id}`); }

  // Time Entries
  getTimeEntries(jobcardId) { return this.request(`/jobcards/${jobcardId}/time-entries`); }
  addTimeEntry(jobcardId, data) { return this._post(`/jobcards/${jobcardId}/time-entries`, data); }
  updateTimeEntry(jobcardId, entryId, data) { return this._put(`/jobcards/${jobcardId}/time-entries/${entryId}`, data); }
  deleteTimeEntry(jobcardId, entryId) { return this._del(`/jobcards/${jobcardId}/time-entries/${entryId}`); }

  // Timer endpoints
  getActiveTimer() { return this.request('/jobcards/active-timer'); }
  startTimer(jobcardId) { return this._post(`/jobcards/${jobcardId}/time-entries/start`); }
  stopTimer(jobcardId, entryId) { return this._post(`/jobcards/${jobcardId}/time-entries/${entryId}/stop`); }
  toggleSpecialLabour(jobcardId, entryId) { return this._patch(`/jobcards/${jobcardId}/time-entries/${entryId}/toggle-special`); }

  // Job Notes
  getJobNotes(jobcardId) { return this.request(`/jobcards/${jobcardId}/notes`); }
  addJobNote(jobcardId, text) { return this._post(`/jobcards/${jobcardId}/notes`, { text }); }
  deleteJobNote(jobcardId, noteId) { return this._del(`/jobcards/${jobcardId}/notes/${noteId}`); }

  // Costing (admin only)
  getCosting(jobcardId) { return this.request(`/jobcards/${jobcardId}/costing`); }
  updateCosting(jobcardId, data) { return this._put(`/jobcards/${jobcardId}/costing`, data); }

  // Documents
  getDocuments(jobcardId) { return this.request(`/jobcards/${jobcardId}/documents`); }
  uploadDocument(jobcardId, data) { return this._post(`/jobcards/${jobcardId}/documents`, data); }
  getDocument(jobcardId, documentId) { return this.request(`/jobcards/${jobcardId}/documents/${documentId}`); }
  deleteDocument(jobcardId, documentId) { return this._del(`/jobcards/${jobcardId}/documents/${documentId}`); }

  // QA Forms
  getQAForms(jobcardId) { return this.request(`/jobcards/${jobcardId}/qa-forms`); }
  addQAForm(jobcardId, data) { return this._post(`/jobcards/${jobcardId}/qa-forms`, data); }
  updateQAForm(jobcardId, formId, data) { return this._patch(`/jobcards/${jobcardId}/qa-forms/${formId}`, data); }
  deleteQAForm(jobcardId, formId) { return this._del(`/jobcards/${jobcardId}/qa-forms/${formId}`); }

  // Job files (from job folder on disk)
  getJobFiles(jobcardId) {
    return this.request(`/jobcards/${jobcardId}/job-files`);
  }

  getJobFileData(jobcardId, filename) {
    return this.request(`/jobcards/${jobcardId}/job-files/${encodeURIComponent(filename)}`);
  }

  // QA Form files (from job folder on disk)
  getQaFormFiles(jobcardId) {
    return this.request(`/jobcards/${jobcardId}/qa-form-files`);
  }

  getQaFormFileData(jobcardId, filename) {
    return this.request(`/jobcards/${jobcardId}/qa-form-files/${encodeURIComponent(filename)}`);
  }

  // Scanner file → folder
  scannerToJobFiles(jobcardId, filePath) { return this._post(`/jobcards/${jobcardId}/job-files/from-scanner`, { filePath }); }
  scannerToQaFormFiles(jobcardId, filePath) { return this._post(`/jobcards/${jobcardId}/qa-form-files/from-scanner`, { filePath }); }
  scannerToCustomerPropertyFiles(jobcardId, filePath) { return this._post(`/jobcards/${jobcardId}/customer-property-files/from-scanner`, { filePath }); }

  // Upload base64 → folder
  uploadToJobFiles(jobcardId, filename, fileData) { return this._post(`/jobcards/${jobcardId}/job-files/upload`, { filename, fileData }); }
  uploadToQaFormFiles(jobcardId, filename, fileData) { return this._post(`/jobcards/${jobcardId}/qa-form-files/upload`, { filename, fileData }); }
  uploadToCustomerPropertyFiles(jobcardId, filename, fileData) { return this._post(`/jobcards/${jobcardId}/customer-property-files/upload`, { filename, fileData }); }

  // Customer Property files (from job folder on disk)
  getCustomerPropertyFiles(jobcardId) { return this.request(`/jobcards/${jobcardId}/customer-property-files`); }
  getCustomerPropertyFileData(jobcardId, filename) {
    return this.request(`/jobcards/${jobcardId}/customer-property-files/${encodeURIComponent(filename)}`);
  }

  // Contact endpoints (phone contacts style)
  getContacts() { return this.request('/contacts'); }
  searchContacts(query) { return this.request(`/contacts/search?q=${encodeURIComponent(query)}`); }
  getContact(id) { return this.request(`/contacts/${id}`); }
  createContact(data) { return this._post('/contacts', data); }
  updateContact(id, data) { return this._put(`/contacts/${id}`, data); }
  deleteContact(id) { return this._del(`/contacts/${id}`); }

  // Supplier endpoints
  getSuppliers() { return this.request('/suppliers'); }
  getSupplier(id) { return this.request(`/suppliers/${id}`); }
  createSupplier(data) { return this._post('/suppliers', data); }
  updateSupplier(id, data) { return this._put(`/suppliers/${id}`, data); }
  deleteSupplier(id) { return this._del(`/suppliers/${id}`); }

  // Tag endpoints
  getTags(category) {
    const query = category ? `?category=${encodeURIComponent(category)}` : '';
    return this.request(`/tags${query}`);
  }
  getTagCategories() { return this.request('/tags/categories'); }
  createTag(data) { return this._post('/tags', data); }
  updateTag(id, data) { return this._put(`/tags/${id}`, data); }
  deleteTag(id) { return this._del(`/tags/${id}`); }

  // Activity history (admin only)
  getActivityHistory(limit = 50) { return this.request(`/history?limit=${limit}`); }
  getUserActivity(userId, limit = 50) { return this.request(`/history/user/${userId}?limit=${limit}`); }
  getEntityHistory(entityType, page = 1) { return this.request(`/history/entity/${entityType}?page=${page}`); }

  // Machines
  getMachines() { return this.request('/machines'); }
  createMachine(data) { return this._post('/machines', data); }
  updateMachine(id, data) { return this._put(`/machines/${id}`, data); }
  deleteMachine(id) { return this._del(`/machines/${id}`); }

  // Hardware endpoints
  getPrinters() { return this.request('/hardware/printers'); }
  getScanners() { return this.request('/hardware/scanners'); }
  getHardwareStatus() { return this.request('/hardware/status'); }

  // Settings (admin only)
  getSettings() { return this.request('/settings'); }
  updateSettings(data) { return this._put('/settings', data); }
  getInactivityTimeout() { return this.request('/settings/inactivity-timeout'); }
  getScannerFiles(limit = 10) { return this.request(`/settings/files?limit=${limit}`); }
  exportBackup(outputPath) { return this._post('/settings/export-backup', { outputPath }); }
  importBackup(inputPath) { return this._post('/settings/import-backup', { inputPath }); }

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
