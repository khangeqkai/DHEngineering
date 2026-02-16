const API_URL = 'http://localhost:3000/api';

class ApiService {
  constructor() {
    this.token = null;
  }

  setToken(token) {
    this.token = token;
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

  // Jobcard endpoints
  getJobcards(filters = {}) {
    const params = new URLSearchParams();
    if (filters.status) params.append('status', filters.status);
    if (filters.archived) params.append('archived', 'true');
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
      method: 'PUT',
      body: JSON.stringify({ status })
    });
  }

  archiveJobcard(id, invoicedDate) {
    return this.request(`/jobcards/${id}/archive`, {
      method: 'POST',
      body: JSON.stringify({ invoiced_date: invoicedDate })
    });
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
      method: 'PUT',
      body: JSON.stringify(formData)
    });
  }

  deleteQAForm(jobcardId, formId) {
    return this.request(`/jobcards/${jobcardId}/qa-forms/${formId}`, {
      method: 'DELETE'
    });
  }

  // Contact endpoints (phone contacts style)
  getContacts(includeInactive = false) {
    return this.request(`/contacts${includeInactive ? '?includeInactive=true' : ''}`);
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

  deactivateContact(id) {
    return this.request(`/contacts/${id}/deactivate`, {
      method: 'POST'
    });
  }

  activateContact(id) {
    return this.request(`/contacts/${id}/activate`, {
      method: 'POST'
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
}

export const api = new ApiService();
