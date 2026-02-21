const API_URL = 'http://localhost:3000/api';

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

  // Auth endpoints
  login(username, password) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
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

  createUser(userData) {
    return this.request('/auth/users', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
  }

  updateUser(id, userData) {
    return this.request(`/auth/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(userData)
    });
  }

  deactivateUser(id) {
    return this.request(`/auth/users/${id}/deactivate`, {
      method: 'POST'
    });
  }

  activateUser(id) {
    return this.request(`/auth/users/${id}/activate`, {
      method: 'POST'
    });
  }

  deleteUser(id) {
    return this.request(`/auth/users/${id}`, {
      method: 'DELETE'
    });
  }

  changePassword(currentPassword, newPassword) {
    return this.request('/auth/change-password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword })
    });
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

  createJobcard(jobcardData) {
    return this.request('/jobcards', {
      method: 'POST',
      body: JSON.stringify(jobcardData)
    });
  }

  updateJobcard(id, jobcardData) {
    return this.request(`/jobcards/${id}`, {
      method: 'PUT',
      body: JSON.stringify(jobcardData)
    });
  }

  updateJobcardStatus(id, status) {
    return this.request(`/jobcards/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
  }

  archiveJobcard(id, invoicedDate) {
    return this.request(`/jobcards/${id}/archive`, {
      method: 'POST',
      body: JSON.stringify({ invoicedDate })
    });
  }

  unarchiveJobcard(id) {
    return this.request(`/jobcards/${id}/unarchive`, { method: 'POST' });
  }

  deleteJobcard(id) {
    return this.request(`/jobcards/${id}`, {
      method: 'DELETE'
    });
  }

  getOverdueJobcards() {
    return this.request('/jobcards/overdue');
  }

  getArchivedJobcards() {
    return this.request('/jobcards/archived');
  }

  // Job Items
  addJobItem(jobcardId, itemData) {
    return this.request(`/jobcards/${jobcardId}/items`, {
      method: 'POST',
      body: JSON.stringify(itemData)
    });
  }

  updateJobItem(jobcardId, itemId, itemData) {
    return this.request(`/jobcards/${jobcardId}/items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify(itemData)
    });
  }

  deleteJobItem(jobcardId, itemId) {
    return this.request(`/jobcards/${jobcardId}/items/${itemId}`, {
      method: 'DELETE'
    });
  }

  // Job Assignees
  addAssignee(jobcardId, userId) {
    return this.request(`/jobcards/${jobcardId}/assignees`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId })
    });
  }

  removeAssignee(jobcardId, userId) {
    return this.request(`/jobcards/${jobcardId}/assignees/${userId}`, {
      method: 'DELETE'
    });
  }

  // Subcontracts
  getSubcontracts(jobcardId) {
    return this.request(`/jobcards/${jobcardId}/subcontracts`);
  }

  addSubcontract(jobcardId, subcontractData) {
    return this.request(`/jobcards/${jobcardId}/subcontracts`, {
      method: 'POST',
      body: JSON.stringify(subcontractData)
    });
  }

  updateSubcontract(jobcardId, subcontractId, subcontractData) {
    return this.request(`/jobcards/${jobcardId}/subcontracts/${subcontractId}`, {
      method: 'PUT',
      body: JSON.stringify(subcontractData)
    });
  }

  deleteSubcontract(jobcardId, subcontractId) {
    return this.request(`/jobcards/${jobcardId}/subcontracts/${subcontractId}`, {
      method: 'DELETE'
    });
  }

  // Time Entries
  getTimeEntries(jobcardId) {
    return this.request(`/jobcards/${jobcardId}/time-entries`);
  }

  addTimeEntry(jobcardId, entryData) {
    return this.request(`/jobcards/${jobcardId}/time-entries`, {
      method: 'POST',
      body: JSON.stringify(entryData)
    });
  }

  updateTimeEntry(jobcardId, entryId, entryData) {
    return this.request(`/jobcards/${jobcardId}/time-entries/${entryId}`, {
      method: 'PUT',
      body: JSON.stringify(entryData)
    });
  }

  deleteTimeEntry(jobcardId, entryId) {
    return this.request(`/jobcards/${jobcardId}/time-entries/${entryId}`, {
      method: 'DELETE'
    });
  }

  // Timer endpoints
  getActiveTimer() {
    return this.request('/jobcards/active-timer');
  }

  startTimer(jobcardId) {
    return this.request(`/jobcards/${jobcardId}/time-entries/start`, {
      method: 'POST'
    });
  }

  stopTimer(jobcardId, entryId) {
    return this.request(`/jobcards/${jobcardId}/time-entries/${entryId}/stop`, {
      method: 'POST'
    });
  }

  // Job Notes
  getJobNotes(jobcardId) {
    return this.request(`/jobcards/${jobcardId}/notes`);
  }

  addJobNote(jobcardId, text) {
    return this.request(`/jobcards/${jobcardId}/notes`, {
      method: 'POST',
      body: JSON.stringify({ text })
    });
  }

  deleteJobNote(jobcardId, noteId) {
    return this.request(`/jobcards/${jobcardId}/notes/${noteId}`, {
      method: 'DELETE'
    });
  }

  // Costing (admin only)
  getCosting(jobcardId) {
    return this.request(`/jobcards/${jobcardId}/costing`);
  }

  updateCosting(jobcardId, costingData) {
    return this.request(`/jobcards/${jobcardId}/costing`, {
      method: 'PUT',
      body: JSON.stringify(costingData)
    });
  }

  // Documents
  getDocuments(jobcardId) {
    return this.request(`/jobcards/${jobcardId}/documents`);
  }

  uploadDocument(jobcardId, documentData) {
    return this.request(`/jobcards/${jobcardId}/documents`, {
      method: 'POST',
      body: JSON.stringify(documentData)
    });
  }

  getDocument(jobcardId, documentId) {
    return this.request(`/jobcards/${jobcardId}/documents/${documentId}`);
  }

  deleteDocument(jobcardId, documentId) {
    return this.request(`/jobcards/${jobcardId}/documents/${documentId}`, {
      method: 'DELETE'
    });
  }

  // QA Forms
  getQAForms(jobcardId) {
    return this.request(`/jobcards/${jobcardId}/qa-forms`);
  }

  addQAForm(jobcardId, formData) {
    return this.request(`/jobcards/${jobcardId}/qa-forms`, {
      method: 'POST',
      body: JSON.stringify(formData)
    });
  }

  updateQAForm(jobcardId, formId, formData) {
    return this.request(`/jobcards/${jobcardId}/qa-forms/${formId}`, {
      method: 'PATCH',
      body: JSON.stringify(formData)
    });
  }

  deleteQAForm(jobcardId, formId) {
    return this.request(`/jobcards/${jobcardId}/qa-forms/${formId}`, {
      method: 'DELETE'
    });
  }

  // Drawings files (from job folder on disk)
  getDrawingsFiles(jobcardId) {
    return this.request(`/jobcards/${jobcardId}/drawings-files`);
  }

  getDrawingsFileData(jobcardId, filename) {
    return this.request(`/jobcards/${jobcardId}/drawings-files/${encodeURIComponent(filename)}`);
  }

  // QA Documents files (from job folder on disk)
  getQaDocumentFiles(jobcardId) {
    return this.request(`/jobcards/${jobcardId}/qa-documents-files`);
  }

  getQaDocumentFileData(jobcardId, filename) {
    return this.request(`/jobcards/${jobcardId}/qa-documents-files/${encodeURIComponent(filename)}`);
  }

  // Attach scanner file as document
  attachScannerFile(jobcardId, filePath) {
    return this.request(`/jobcards/${jobcardId}/documents/from-scanner`, {
      method: 'POST',
      body: JSON.stringify({ filePath })
    });
  }

  // Contact endpoints (phone contacts style)
  getContacts() {
    return this.request('/contacts');
  }

  searchContacts(query) {
    return this.request(`/contacts/search?q=${encodeURIComponent(query)}`);
  }

  getContact(id) {
    return this.request(`/contacts/${id}`);
  }

  createContact(contactData) {
    return this.request('/contacts', {
      method: 'POST',
      body: JSON.stringify(contactData)
    });
  }

  updateContact(id, contactData) {
    return this.request(`/contacts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(contactData)
    });
  }

  deleteContact(id) {
    return this.request(`/contacts/${id}`, {
      method: 'DELETE'
    });
  }

  // Supplier endpoints
  getSuppliers() {
    return this.request('/suppliers');
  }

  getSupplier(id) {
    return this.request(`/suppliers/${id}`);
  }

  createSupplier(supplierData) {
    return this.request('/suppliers', {
      method: 'POST',
      body: JSON.stringify(supplierData)
    });
  }

  updateSupplier(id, supplierData) {
    return this.request(`/suppliers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(supplierData)
    });
  }

  deleteSupplier(id) {
    return this.request(`/suppliers/${id}`, {
      method: 'DELETE'
    });
  }

  // Service tag endpoints
  getServiceTags() {
    return this.request('/service-tags');
  }

  createServiceTag(name) {
    return this.request('/service-tags', {
      method: 'POST',
      body: JSON.stringify({ name })
    });
  }

  deleteServiceTag(id) {
    return this.request(`/service-tags/${id}`, {
      method: 'DELETE'
    });
  }

  // Activity history (admin only)
  getActivityHistory(limit = 50) {
    return this.request(`/history?limit=${limit}`);
  }

  getUserActivity(userId, limit = 50) {
    return this.request(`/history/user/${userId}?limit=${limit}`);
  }

  getEntityHistory(entityType, page = 1) {
    return this.request(`/history/entity/${entityType}?page=${page}`);
  }

  // Machines
  getMachines() {
    return this.request('/machines');
  }

  createMachine(machineData) {
    return this.request('/machines', {
      method: 'POST',
      body: JSON.stringify(machineData)
    });
  }

  updateMachine(id, machineData) {
    return this.request(`/machines/${id}`, {
      method: 'PUT',
      body: JSON.stringify(machineData)
    });
  }

  deleteMachine(id) {
    return this.request(`/machines/${id}`, {
      method: 'DELETE'
    });
  }

  // Hardware endpoints
  getPrinters() {
    return this.request('/hardware/printers');
  }

  getScanners() {
    return this.request('/hardware/scanners');
  }

  getHardwareStatus() {
    return this.request('/hardware/status');
  }

  // Settings (admin only)
  getSettings() {
    return this.request('/settings');
  }

  updateSettings(settingsData) {
    return this.request('/settings', {
      method: 'PUT',
      body: JSON.stringify(settingsData)
    });
  }

  // Get inactivity timeout (all authenticated users)
  getInactivityTimeout() {
    return this.request('/settings/inactivity-timeout');
  }

  // Scanner files (part of settings)
  getScannerFiles(limit = 10) {
    return this.request(`/settings/files?limit=${limit}`);
  }

  // QA Levels
  getQaLevels() {
    return this.request('/qa-levels');
  }

  getQaLevel(id) {
    return this.request(`/qa-levels/${id}`);
  }

  createQaLevel(data) {
    return this.request('/qa-levels', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  updateQaLevel(id, data) {
    return this.request(`/qa-levels/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  deleteQaLevel(id) {
    return this.request(`/qa-levels/${id}`, {
      method: 'DELETE'
    });
  }

  uploadQaTemplate(levelId, data) {
    return this.request(`/qa-levels/${levelId}/templates`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  }

  deleteQaTemplate(levelId, templateId) {
    return this.request(`/qa-levels/${levelId}/templates/${templateId}`, {
      method: 'DELETE'
    });
  }
}

export const api = new ApiService();
